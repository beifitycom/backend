import mongoose from 'mongoose';

const EmailLogSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  emailType: {
    type: String,
    enum: ['marketing', 'order', 'status', 'cancellation', 'refund', 'payout', 'reversal'],
    required: true,
  },
  sentAt: {
    type: Date,
    default: Date.now,
  },
  productIds: [
    {
      type: String, // Store productId from listingModel.productInfo.productId
    },
  ],
});

EmailLogSchema.index({ userId: 1, sentAt: -1 });

export const emailLogModel = mongoose.model('EmailLog', EmailLogSchema);