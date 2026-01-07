import express from 'express';
import { 
  getConversations, 
  getMessages, 
  sendMessage, 
  markMessagesRead 
} from '../controllers/messageController.js';

const messageRouter = express.Router();

// Get all conversations for a user
messageRouter.get('/conversations/:userId', getConversations);

// Get messages between two users
messageRouter.get('/messages/:sender/:receiver', getMessages);

// Send a message (now suggests using Socket.IO)
messageRouter.post('/send', sendMessage);

// Mark messages as read (optional REST endpoint)
messageRouter.post('/mark-read', markMessagesRead);

export default messageRouter;