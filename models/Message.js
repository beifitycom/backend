import mongoose from 'mongoose';

const messageSchema = new mongoose.Schema({
  conversationId: { type: mongoose.Schema.Types.ObjectId, ref: 'Conversation', required: true },
  sender: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  receiver: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  content: { type: String, default: '' },
  type: { type: String, enum: ['text', 'image'], default: 'text' },
  attachment: {
    url: { type: String, default: null },
    public_id: { type: String, default: null },
  },
  isRead: { type: Boolean, default: false },
  timestamp: { type: Date, default: Date.now },
});

const conversationSchema = new mongoose.Schema({
  participants: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true }],
  messages: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Message' }],
  unreadCount: { type: Map, of: Number, default: () => new Map() },
  lastMessageTimestamp: { type: Date, default: Date.now },
  lastMessageSender: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  lastMessage : { type: String, required: true }, // Stores the last message content
  productId: { type: String, default: null }, // Links to listingModel.productInfo.productId
});

export const Message = mongoose.model('Message', messageSchema);
export const Conversation = mongoose.model('Conversation', conversationSchema);