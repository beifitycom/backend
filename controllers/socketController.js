import { Conversation, Message } from '../models/Message.js';
import { userModel } from '../models/User.js';
import { sendNotification } from './notificationController.js';
import logger from '../utils/logger.js';
import mongoose from 'mongoose';
import sanitizeHtml from 'sanitize-html';

// Map to track online users (userId -> socket.id)
const users = new Map();

export const getOnlineUsers = () => Array.from(users.keys());

export const setupSocketHandlers = (io, socket) => {
  logger.info(`User connected: ${socket.id}`);

  socket.on('addUser', (userId) => {
    if (!userId) {
      logger.error(`Invalid userId received: ${userId}`);
      socket.emit('error', { message: 'Invalid userId' });
      return;
    }
    const userIdStr = userId.toString();
    users.set(userIdStr, socket.id);
    logger.info(`User ${userIdStr} mapped to socket ${socket.id}`);
    const onlineUsers = Array.from(users.keys());
    io.emit('onlineUsers', onlineUsers);
    logger.info(`Online users updated: ${onlineUsers.join(', ')}`);
  });

  socket.on('sendMessage', async (data) => {
    const { sender, receiver, content, type = 'text', conversationId } = data;

    // Validate input data
    if (!sender || !receiver || !content) {
      logger.error(`Invalid message data: ${JSON.stringify(data)}`);
      socket.emit('error', { message: 'Invalid message data' });
      return;
    }

    const senderStr = sender.toString();
    const receiverStr = receiver.toString();
    const sanitizedContent = sanitizeHtml(content);

    const session = await mongoose.startSession();
    session.startTransaction();

    try {
      // Validate sender
      const senderUser = await userModel.findById(senderStr).session(session);
      if (!senderUser) {
        logger.error(`Sender not found: ${senderStr}`);
        socket.emit('error', { message: 'Sender not found' });
        await session.abortTransaction();
        return;
      }

      // Find or create conversation
      let conversation = conversationId
        ? await Conversation.findById(conversationId).session(session)
        : await Conversation.findOne({
            participants: { $all: [senderStr, receiverStr] },
          }).session(session);

      if (!conversation) {
        conversation = new Conversation({
          participants: [senderStr, receiverStr],
          messages: [],
          unreadCount: new Map([[senderStr, 0], [receiverStr, 0]]),
          lastMessageTimestamp: new Date(),
        });
      }

      // Create and save new message
      const message = new Message({
        sender: senderStr,
        receiver: receiverStr,
        content: sanitizedContent,
        type,
        conversationId: conversation._id,
        timestamp: new Date(),
        isRead: false,
      });
      await message.save({ session });

      // Update conversation
      conversation.messages.push(message._id);

      // Set last message details
      let lastMessageText = sanitizedContent;
      if (type === 'image') lastMessageText = 'Sent an image';
      if (type === 'link') lastMessageText = `Shared a link: ${sanitizedContent.substring(0, 30)}${sanitizedContent.length > 30 ? '...' : ''}`;
      if (type === 'text') lastMessageText = sanitizedContent;

      // Ensure unreadCount is a Map
      if (!(conversation.unreadCount instanceof Map)) {
        conversation.unreadCount = new Map(Object.entries(conversation.unreadCount || {}));
      }

      // Increment unread count for receiver
      const currentUnread = conversation.unreadCount.get(receiverStr) || 0;
      conversation.unreadCount.set(receiverStr, currentUnread + 1);
      conversation.unreadCount.set(senderStr, conversation.unreadCount.get(senderStr) || 0);

      conversation.lastMessage = lastMessageText;
      conversation.lastMessageTimestamp = new Date();
      conversation.lastMessageSender = senderStr;

      await conversation.save({ session });

      // Populate conversation for detailed emission
      await conversation.populate([
        { path: 'participants', select: 'personalInfo.fullname personalInfo.profilePicture' },
        { path: 'lastMessageSender', select: 'personalInfo.fullname personalInfo.profilePicture' },
      ]);

      // Prepare message data for emission
      const senderDetails = conversation.participants.find((p) => p._id.toString() === senderStr);
      const receiverDetails = conversation.participants.find((p) => p._id.toString() === receiverStr);

      const messageData = {
        _id: message._id.toString(),
        sender: {
          _id: senderStr,
          fullname: sanitizeHtml(senderDetails?.personalInfo.fullname || 'Unknown'),
          profilePicture: senderDetails?.personalInfo.profilePicture || null,
        },
        receiver: {
          _id: receiverStr,
          fullname: sanitizeHtml(receiverDetails?.personalInfo.fullname || 'Unknown'),
          profilePicture: receiverDetails?.personalInfo.profilePicture || null,
        },
        content: sanitizedContent,
        type,
        timestamp: message.timestamp,
        isRead: message.isRead,
        conversationId: conversation._id.toString(),
      };

      // Prepare updated conversation data
      const updatedConversation = {
        _id: conversation._id.toString(),
        participants: conversation.participants.map((p) => ({
          _id: p._id.toString(),
          fullname: sanitizeHtml(p.personalInfo?.fullname || 'Unknown'),
          profilePicture: p.personalInfo?.profilePicture || null,
          isOnline: users.has(p._id.toString()),
        })),
        messages: conversation.messages.map((msg) => msg.toString()),
        lastMessage: lastMessageText,
        lastMessageTimestamp: conversation.lastMessageTimestamp,
        lastMessageSender: conversation.lastMessageSender
          ? {
              _id: conversation.lastMessageSender._id.toString(),
              fullname: sanitizeHtml(conversation.lastMessageSender.personalInfo?.fullname || 'Unknown'),
              profilePicture: conversation.lastMessageSender.personalInfo?.profilePicture || null,
            }
          : null,
        unreadCount: Object.fromEntries(conversation.unreadCount),
        productId: conversation.productId || null,
      };

      // Emit to receiver
      const receiverSocket = users.get(receiverStr);
      if (receiverSocket) {
        io.to(receiverSocket).emit('receiveMessage', messageData);
        io.to(receiverSocket).emit('conversationUpdate', updatedConversation);
        io.to(receiverSocket).emit('newMessageNotification', {
          conversationId: conversation._id.toString(),
          sender: sanitizeHtml(senderDetails?.personalInfo.fullname || 'Unknown'),
          senderId: senderStr,
          content: lastMessageText,
          timestamp: message.timestamp,
          link: `/chat/${senderStr}`,
        });
        logger.info(
          `Emitted receiveMessage, conversationUpdate, and newMessageNotification to receiver ${receiverStr} at socket ${receiverSocket}`
        );
      }

      // Emit to sender
      const senderSocket = users.get(senderStr);
      if (senderSocket) {
        io.to(senderSocket).emit('messageSent', {
          _id: message._id.toString(),
          conversationId: conversation._id.toString(),
          timestamp: message.timestamp,
        });
        io.to(senderSocket).emit('conversationUpdate', updatedConversation);
        logger.info(`Emitted messageSent and conversationUpdate to sender ${senderStr} at socket ${senderSocket}`);
      }

      // Create notification with web push
      try {
        const notificationContent = `New message from ${sanitizeHtml(senderUser.personalInfo?.fullname || 'Unknown')}: ${lastMessageText}`;
        const notification = await sendNotification(
          receiverStr,
          'message',
          notificationContent,
          senderStr,
          session
        );
        logger.info(`Notification created for message to receiver ${receiverStr}`, { conversationId: conversation._id, messageId: message._id, notificationId: notification._id });
        if (receiverSocket) {
          io.to(receiverSocket).emit('newNotification', notification);
          logger.info(`Emitted newNotification to receiver ${receiverStr} at socket ${receiverSocket}`, { notificationId: notification._id });
        }
      } catch (error) {
        logger.error(`Error creating message notification: ${error.message}`, { stack: error.stack, sender: senderStr, receiver: receiverStr });
        socket.emit('error', { message: 'Failed to create message notification' });
      }

      await session.commitTransaction();
      logger.info(`Message saved and conversation updated: ${conversation._id}`, { messageId: message._id });
    } catch (error) {
      await session.abortTransaction();
      logger.error(`Error sending message: ${error.message}`, { stack: error.stack, data });
      socket.emit('error', { message: error.message });
    } finally {
      session.endSession();
    }
  });

  socket.on('userTyping', ({ sender, receiver, conversationId }) => {
    const receiverSocket = users.get(receiver);
    if (receiverSocket) {
      io.to(receiverSocket).emit('userTyping', { sender, conversationId, timestamp: new Date() });
      logger.debug(`${sender} is typing in conversation ${conversationId}`);
    }
  });

  socket.on('userStoppedTyping', ({ sender, receiver, conversationId }) => {
    const receiverSocket = users.get(receiver.toString());
    if (receiverSocket) {
      io.to(receiverSocket).emit('userStoppedTyping', { sender, conversationId, timestamp: new Date() });
      logger.debug(`Emitted userStoppedTyping to ${receiver}`);
    }
  });

  socket.on('markMessagesRead', async ({ conversationId, userId }) => {
    const maxRetries = 3;
    let attempt = 0;

    while (attempt < maxRetries) {
      const session = await mongoose.startSession();
      session.startTransaction();
      try {
        // Validate inputs
        if (!mongoose.Types.ObjectId.isValid(conversationId) || !mongoose.Types.ObjectId.isValid(userId)) {
          logger.error(`Invalid conversationId ${conversationId} or userId ${userId}`);
          socket.emit('error', { message: 'Invalid conversationId or userId' });
          await session.abortTransaction();
          return;
        }

        // Find conversation
        const conversation = await Conversation.findById(conversationId).session(session);
        if (!conversation) {
          logger.error(`Conversation not found for ID: ${conversationId}`);
          socket.emit('error', { message: 'Conversation not found' });
          await session.abortTransaction();
          return;
        }

        // Find unread messages for the user
        const unreadMessages = await Message.find({
          conversationId,
          receiver: userId,
          isRead: false,
        }).session(session);

        if (unreadMessages.length === 0) {
          logger.info(`No unread messages to mark as read for user ${userId} in conversation ${conversationId}`);
          await session.commitTransaction();
          return;
        }

        const messageIds = unreadMessages.map((msg) => msg._id);

        // Update messages to mark as read
        await Message.updateMany(
          { _id: { $in: messageIds } },
          { $set: { isRead: true } },
          { session }
        );

        // Reset unread count for the user
        conversation.unreadCount.set(userId, 0);
        await conversation.save({ session });

        // Populate conversation for updated data
        const populatedConversation = await Conversation.findById(conversationId)
          .populate('participants', 'personalInfo.fullname personalInfo.profilePicture')
          .populate('lastMessageSender', 'personalInfo.fullname personalInfo.profilePicture')
          .lean()
          .session(session);

        // Prepare updated conversation data
        const updatedConversation = {
          _id: conversation._id.toString(),
          participants: populatedConversation.participants.map((p) => ({
            _id: p._id.toString(),
            fullname: sanitizeHtml(p.personalInfo.fullname),
            profilePicture: p.personalInfo.profilePicture,
            isOnline: users.has(p._id.toString()),
          })),
          messages: conversation.messages.map((msg) => msg.toString()),
          lastMessage: populatedConversation.lastMessage,
          lastMessageTimestamp: populatedConversation.lastMessageTimestamp,
          lastMessageSender: populatedConversation.lastMessageSender
            ? {
                _id: populatedConversation.lastMessageSender._id.toString(),
                fullname: sanitizeHtml(populatedConversation.lastMessageSender.personalInfo.fullname),
                profilePicture: populatedConversation.lastMessageSender.personalInfo.profilePicture,
              }
            : null,
          unreadCount: Object.fromEntries(conversation.unreadCount),
        };

        // Emit to all participants
        const participantSockets = populatedConversation.participants
          .map((user) => users.get(user._id.toString()))
          .filter((socketId) => socketId);

        if (participantSockets.length > 0) {
          io.to(participantSockets).emit('messagesRead', {
            conversationId: conversationId.toString(),
            messageIds: messageIds.map((id) => id.toString()),
            userId,
            timestamp: new Date(),
          });
          io.to(participantSockets).emit('conversationUpdate', updatedConversation);
          logger.info(`Emitted messagesRead and conversationUpdate to sockets ${participantSockets.join(', ')}`);
        }

        await session.commitTransaction();
        logger.info(`Marked ${messageIds.length} messages as read for user ${userId} in conversation ${conversationId}`);
        return; // Success, exit the retry loop
      } catch (error) {
        await session.abortTransaction();
        if (error.errorLabels && error.errorLabels.includes('TransientTransactionError') && attempt < maxRetries - 1) {
          attempt++;
          logger.warn(`Retrying markMessagesRead (attempt ${attempt + 1}) due to TransientTransactionError: ${error.message}`);
          continue; // Retry the transaction
        }
        logger.error(`Error marking messages read: ${error.message}`, { stack: error.stack });
        socket.emit('error', { message: error.message });
        return;
      } finally {
        session.endSession();
      }
    }

    logger.error(`Failed to mark messages read after ${maxRetries} attempts for user ${userId} in conversation ${conversationId}`);
    socket.emit('error', { message: 'Failed to mark messages read after multiple attempts' });
  });

  socket.on('disconnect', () => {
    let disconnectedUser = null;
    users.forEach((socketId, userId) => {
      if (socketId === socket.id) {
        disconnectedUser = userId;
        users.delete(userId);
      }
    });
    if (disconnectedUser) {
      const onlineUsers = Array.from(users.keys());
      io.emit('onlineUsers', onlineUsers);
      logger.info(`User ${disconnectedUser} disconnected, socket: ${socket.id}`);
      logger.info(`Online users updated: ${onlineUsers.join(', ')}`);
    }
  });
};