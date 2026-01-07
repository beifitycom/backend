import mongoose from 'mongoose';
import { calculateServiceFee } from '../utils/helper.js';

const TransactionSchema = new mongoose.Schema(
  {
    // In Transaction.js
    orderId: {
      type: String,  // Changed to match Order.orderId
      required: true,
      index: true,
    },
    swiftReference: {
      type: String,
      required: true,
      unique: true,
    },
    totalAmount: {
      type: Number,
      required: true,
      min: 0.01,
    },
    deliveryFee: {
      type: Number,
      required: true,
      min: 0,
      default: 0,
    },
    swiftServiceFee: {
      type: Number,
      min: 0,
    },
    netReceived: {
      type: Number,
      min: 0,
    },
    items: [
      {
        itemId: { type: mongoose.Schema.Types.ObjectId, required: true },
        sellerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
        itemAmount: { type: Number, required: true, min: 0.01 },
        sellerShare: { type: Number, required: true, min: 0 },
        platformCommission: { type: Number, required: true, min: 0 },
        transferFee: { type: Number, default: 0 },
        netCommission: { type: Number, required: true, min: 0 },
        owedAmount: { type: Number, required: true, min: 0 },
        payoutStatus: { 
          type: String, 
          enum: ['manual_pending', 'pending', 'transferred', 'failed'], 
          default: 'manual_pending' 
        },
        swiftPayoutReference: { type: String, default: null },
        deliveryConfirmed: { type: Boolean, default: false },
        refundStatus: { type: String, enum: ['none', 'pending', 'returned', 'completed'], default: 'none' },
        refundedAmount: { type: Number, default: 0, min: 0 },
        returnStatus: { type: String, enum: ['none', 'pending', 'confirmed', 'rejected'], default: 'none' },
        cancelled: { type: Boolean, default: false },  // ADDED: To match code assumptions
      },
    ],
    status: {
      type: String,
      enum: ['pending', 'swift_initiated', 'completed', 'failed', 'reversed'],
      default: 'pending',
    },
    isReversed: {
      type: Boolean,
      default: false,
    },
    paymentMethod: { type: String, default: 'M-Pesa' },
    paidAt: { type: Date },
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

TransactionSchema.pre('save', function (next) {
  const commissionRate = parseFloat(process.env.COMMISSION_RATE || '0'); // 0 for no commissions now

  // Use tiered flat fee instead of percentage
  try {
    this.swiftServiceFee = calculateServiceFee(this.totalAmount);
  } catch (error) {
    return next(new Error(`Invalid totalAmount for service fee: ${error.message}`));
  }

  // FIXED: Calculate based on itemsTotal (exclude delivery for commission/net)
  const itemsTotal = this.items.reduce((sum, item) => {
    return item.cancelled ? sum : sum + (item.itemAmount || 0);  // FIXED: Use itemAmount, not price/quantity
  }, 0);

  const platformCommission_total = itemsTotal * commissionRate;
  const netForSellers = Math.max(itemsTotal - this.swiftServiceFee - platformCommission_total, 0);  // FIXED: Commission only on items; swift prorated via net

  this.items.forEach((item) => {
    if (item.cancelled) {
      item.itemAmount = 0;
      item.sellerShare = 0;
      item.platformCommission = 0;
      item.transferFee = 0;
      item.netCommission = 0;
      item.owedAmount = 0;
      item.payoutStatus = 'manual_pending';
      item.deliveryConfirmed = false;
      item.refundStatus = 'none';
      item.refundedAmount = 0;
      item.returnStatus = 'none';
      return;
    }

    // FIXED: Do NOT override itemAmount (already set correctly)
    // FIXED: Prorate platform commission on itemsTotal
    item.platformCommission = itemsTotal > 0 ? ((item.itemAmount || 0) / itemsTotal) * platformCommission_total : 0;
    item.sellerShare = itemsTotal > 0 ? ((item.itemAmount || 0) / itemsTotal) * netForSellers : 0;
    // No transfer fees—always 0
    item.transferFee = 0;
    // netCommission: platform share per item (or 0 if not used)
    item.netCommission = item.platformCommission;
    item.owedAmount = item.sellerShare; // Full share, no deduction
    item.payoutStatus = 'manual_pending';
    item.deliveryConfirmed = false;
    if (!item.refundStatus) item.refundStatus = 'none';
    if (!item.refundedAmount) item.refundedAmount = 0;
    if (!item.returnStatus) item.returnStatus = 'none';
  });

  this.netReceived = netForSellers; // For auditing (net to split among sellers)
  this.updatedAt = Date.now();
  next();
});

TransactionSchema.index({ orderId: 1 });
TransactionSchema.index({ 'items.sellerId': 1 });
TransactionSchema.index({ 'items.payoutStatus': 1 });
TransactionSchema.index({ 'items.deliveryConfirmed': 1 });
TransactionSchema.index({ 'items.refundStatus': 1 });
TransactionSchema.index({ 'items.returnStatus': 1 });
TransactionSchema.index({ 'items.owedAmount': 1 });
TransactionSchema.index({ swiftReference: 1 });

export const TransactionModel = mongoose.model('Transaction', TransactionSchema);