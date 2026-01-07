import mongoose from 'mongoose';

const ResetTokenSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  code: {
    type: String,
    required: true,
  },
  expiresAt: {
    type: Date,
    required: true,
    index: { expires: '10m' }, // Automatically delete after 10 minutes
  },
});

export const resetTokenModel = mongoose.model('ResetToken', ResetTokenSchema);