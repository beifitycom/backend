import { Conversation, Message } from '../models/Message.js';
import mongoose from 'mongoose';
import sanitizeHtml from 'sanitize-html';
import logger from '../utils/logger.js';
import { getOnlineUsers } from './socketController.js';
import { sendNotification } from './notificationController.js';

// Helper function to format participant details
const formatParticipant = (participant, onlineUsers) => ({
  _id: participant._id.toString(),
  fullname: sanitizeHtml(participant.personalInfo?.fullname || 'Unknown'),
  profilePicture: participant.personalInfo?.profilePicture || null,
  isOnline: onlineUsers.includes(participant._id.toString()),
});

// Helper function to format message sender/receiver
const formatMessageUser = (user) => ({
  _id: user._id.toString(),
  fullname: sanitizeHtml(user.personalInfo?.fullname || 'Unknown'),
  profilePicture: user.personalInfo?.profilePicture || null,
});

// Get all conversations for a user
export const getConversations = async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    const { userId } = req.params;

    // Validate userId
    if (!mongoose.Types.ObjectId.isValid(userId)) {
      logger.warn(`Get conversations failed: Invalid userId ${userId}`);
      return res.status(400).json({ success: false, message: 'Invalid userId format' });
    }

    // Fetch conversations
    const conversations = await Conversation.find({ participants: userId })
      .populate('participants', 'personalInfo.fullname personalInfo.profilePicture personalInfo.lastActive')
      .populate('lastMessageSender', 'personalInfo.fullname personalInfo.profilePicture')
      .sort({ lastMessageTimestamp: -1 })
      .lean()
      .session(session);

    // If no conversations exist, return an empty array
    if (!conversations || conversations.length === 0) {
      await session.commitTransaction();
      logger.info(`No conversations found for user ${userId}`);
      return res.status(200).json({ success: true, data: [], message: 'No conversations found' });
    }

    // Get online users
    const onlineUsers = getOnlineUsers ? getOnlineUsers() : [];

    // Format conversations
    const conversationsWithDetails = conversations.map((conv) => {
      const participantsWithDetails = conv.participants.map((participant) =>
        formatParticipant(participant, onlineUsers)
      );

      // Handle unreadCount
      let unreadCount = 0;
      if (conv.unreadCount instanceof Map) {
        unreadCount = conv.unreadCount.get(userId) || 0;
      } else if (conv.unreadCount && typeof conv.unreadCount === 'object') {
        unreadCount = conv.unreadCount[userId] || 0;
      }

      return {
        ...conv,
        participants: participantsWithDetails,
        lastMessage: sanitizeHtml(conv.lastMessage || ''),
        lastMessageSender: conv.lastMessageSender
          ? formatMessageUser(conv.lastMessageSender)
          : null,
        unreadCount,
      };
    });

    await session.commitTransaction();
    logger.info(`Retrieved ${conversations.length} conversations for user ${userId}`);
    res.status(200).json({ success: true, data: conversationsWithDetails });
  } catch (error) {
    await session.abortTransaction();
    logger.error(`Error fetching conversations: ${error.message}`, {
      stack: error.stack,
      userId: req.params.userId,
    });
    res.status(500).json({
      success: false,
      message: 'Error fetching conversations',
      error: { message: error.message },
    });
  } finally {
    session.endSession();
  }
};

// Get messages between two users
export const getMessages = async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    const { sender, receiver } = req.params;

    // Validate sender and receiver
    if (!mongoose.Types.ObjectId.isValid(sender) || !mongoose.Types.ObjectId.isValid(receiver)) {
      logger.warn(`Get messages failed: Invalid sender ${sender} or receiver ${receiver}`);
      return res.status(400).json({ success: false, message: 'Invalid sender or receiver ID' });
    }

    // Find conversation
    const conversation = await Conversation.findOne({
      participants: { $all: [sender, receiver] },
    })
      .populate({
        path: 'messages',
        populate: [
          { path: 'sender', select: 'personalInfo.fullname personalInfo.profilePicture' },
          { path: 'receiver', select: 'personalInfo.fullname personalInfo.profilePicture' },
        ],
      })
      .lean()
      .session(session);

    if (!conversation) {
      await session.commitTransaction();
      logger.info(`No conversation found between sender ${sender} and receiver ${receiver}`);
      return res.status(200).json({ success: true, data: [], conversationId: null });
    }

    // Format messages
    const messages = conversation.messages.map((msg) => ({
      ...msg,
      content: sanitizeHtml(msg.content),
      sender: formatMessageUser(msg.sender),
      receiver: formatMessageUser(msg.receiver),
    }));

    await session.commitTransaction();
    logger.info(`Retrieved ${messages.length} messages for conversation ${conversation._id}`);
    res.status(200).json({
      success: true,
      data: messages,
      conversationId: conversation._id.toString(),
    });
  } catch (error) {
    await session.abortTransaction();
    logger.error(`Error fetching messages: ${error.message}`, {
      stack: error.stack,
      sender: req.params.sender,
      receiver: req.params.receiver,
    });
    res.status(500).json({
      success: false,
      message: 'Error fetching messages',
      error: { message: error.message },
    });
  } finally {
    session.endSession();
  }
};

// Send a message (deprecated REST endpoint)
export const sendMessage = async (req, res) => {
  logger.info('Send message endpoint called (deprecated)', {
    userId: req.user?._id,
  });
  res.status(200).json({
    success: true,
    message: 'Please use Socket.IO for real-time message sending. POST data to this endpoint is deprecated.',
    instructions: 'Emit "sendMessage" event with { sender, receiver, content, type, conversationId }',
  });
};

// Mark messages as read
export const markMessagesRead = async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    const { conversationId, userId } = req.body;

    // Validate inputs
    if (!mongoose.Types.ObjectId.isValid(conversationId) || !mongoose.Types.ObjectId.isValid(userId)) {
      logger.warn(`Mark messages read failed: Invalid conversationId ${conversationId} or userId ${userId}`);
      return res.status(400).json({ success: false, message: 'Invalid conversationId or userId' });
    }

    // Authorization check
    if (req.user._id.toString() !== userId && !req.user.personalInfo.isAdmin) {
      logger.warn(`Mark messages read failed: User ${req.user._id} unauthorized for user ${userId}`);
      return res.status(403).json({ success: false, message: 'Unauthorized to mark messages' });
    }

    // Find conversation
    const conversation = await Conversation.findById(conversationId)
      .session(session);

    if (!conversation) {
      logger.warn(`Mark messages read failed: Conversation ${conversationId} not found`);
      return res.status(404).json({ success: false, message: 'Conversation not found' });
    }

    // Find unread messages
    const unreadMessages = await Message.find({
      conversationId,
      receiver: userId,
      isRead: false,
    }).session(session);

    if (unreadMessages.length === 0) {
      await session.commitTransaction();
      logger.info(`No unread messages for user ${userId} in conversation ${conversationId}`);
      return res.status(200).json({ success: true, message: 'No unread messages' });
    }

    // Update messages
    const messageIds = unreadMessages.map((msg) => msg._id);
    await Message.updateMany(
      { _id: { $in: messageIds } },
      { $set: { isRead: true } },
      { session }
    );

    // Reset unread count
    conversation.unreadCount.set(userId, 0);
    await conversation.save({ session });

    await session.commitTransaction();
    logger.info(`Marked ${messageIds.length} messages as read for user ${userId} in conversation ${conversationId}`);
    res.status(200).json({
      success: true,
      data: {
        conversationId,
        messageIds,
        unreadCount: conversation.unreadCount.get(userId) || 0,
      },
    });
  } catch (error) {
    await session.abortTransaction();
    logger.error(`Error marking messages read: ${error.message}`);
    res.status(500).json({
      success: false,
      message: 'Error marking messages read',
      error: { message: error.message },
    });
  } finally {
    session.endSession();
  }
};