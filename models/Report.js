import mongoose from 'mongoose';
import { orderModel } from './Order.js';

const reportSchema = new mongoose.Schema({
  reporterId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: false,
    index: true,
  },
  reportType: {
    type: String,
    required: true,
    enum: ['user', 'order', 'listing'],
  },
  reportedEntityId: {
    type: mongoose.Schema.Types.Mixed,
    required: true,
    validate: {
      validator: function (value) {
        if (this.reportType === 'user' || this.reportType === 'order') {
          return mongoose.Types.ObjectId.isValid(value);
        }
        if (this.reportType === 'listing') {
          return typeof value === 'string' && value.length > 0;
        }
        return false;
      },
      message: 'Invalid reportedEntityId for the specified reportType',
    },
    index: true,
  },
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: function () {
      return this.reportType === 'user';
    },
    validate: {
      validator: function (value) {
        return this.reportType !== 'user' || value.equals(this.reportedEntityId);
      },
      message: 'userId must match reportedEntityId for user reports',
    },
  },
  orderId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Order',
    required: function () {
      return this.reportType === 'order';
    },
    validate: {
      validator: function (value) {
        return this.reportType !== 'order' || value.equals(this.reportedEntityId);
      },
      message: 'orderId must match reportedEntityId for order reports',
    },
  },
  // New field for item-specific reporting
  itemId: {
    type: String,
    required: function () {
      return this.reportType === 'order' && this.itemId != null; // Optional but validated if provided
    },
    validate: {
      validator: async function (value) {
        if (this.reportType !== 'order' || !value) return true; // Skip if not order or itemId not provided
        console.log("this", this)
        const order = await orderModel.findOne({orderId: this.orderId});
        return order && order.items.some(item => item.productId === value);
      },
      message: 'Invalid itemId: Item not found in the specified order',
    },
  },
  productId: {
    type: String,
    required: function () {
      return this.reportType === 'listing';
    },
    validate: {
      validator: function (value) {
        return this.reportType !== 'listing' || value === this.reportedEntityId;
      },
      message: 'productId must match reportedEntityId for listing reports',
    },
  },
  reason: {
    type: String,
    required: true,
    enum: [
      'Fraudulent Activity',
      'Non-Delivery',
      'Fake or Counterfeit Product',
      'Inappropriate Behavior',
      'Damaged Item',
      'Wrong Item',
      'Misleading Listing',
      'Suspected Stolen Goods',
      'Other',
    ],
  },
  details: {
    type: String,
    required: false,
    trim: true,
    maxlength: 1000,
  },
  status: {
    type: String,
    enum: ['Pending', 'Under Review', 'Resolved', 'Dismissed'],
    default: 'Pending',
  },
  createdAt: {
    type: Date,
    default: Date.now,
    required: true,
  },
  updatedAt: {
    type: Date,
    default: Date.now,
    required: true,
  },
  adminNotes: {
    type: String,
    required: false,
    trim: true,
    maxlength: 1000,
  },
  escalated: {
    type: Boolean,
    default: false,
  },
});

reportSchema.pre('save', function (next) {
  this.updatedAt = Date.now();
  next();
});

reportSchema.index({ reporterId: 1, status: 1 });
reportSchema.index({ reportType: 1, reportedEntityId: 1 });
reportSchema.index({ createdAt: -1 });
reportSchema.index({ status: 1, escalated: 1 });
reportSchema.index({ orderId: 1, itemId: 1 }); // New index for item-specific reports

export const ReportModel = mongoose.model('Report', reportSchema);