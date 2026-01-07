import { userModel } from '../models/User.js';
import { orderModel } from '../models/Order.js';
import { listingModel } from '../models/Listing.js';
import { TransactionModel } from '../models/Transaction.js';
import mongoose from 'mongoose';
import sanitizeHtml from 'sanitize-html';
import validator from 'validator';
import logger from '../utils/logger.js';
import { sendEmail } from '../utils/sendEmail.js';
import { sendNotification } from './notificationController.js';
import { initializePayment, initiatePayout, initiateRefund } from './swiftController.js';
import {
  generateOrderEmailAdmin,
  generateOrderEmailBuyer,
  generateOrderEmailSeller,
  generateOrderStatusEmail,
  generateOrderCancellationEmail,
  generateOrderStatusEmailAdmin,
  generateOrderCancellationEmailAdmin,
} from '../utils/Templates.js';

const FRONTEND_URL = process.env.FRONTEND_URL || 'https://www.beifity.com';
const commissionRate = parseFloat(process.env.COMMISSION_RATE || '0'); // 5% platform commission
const SESSION_TIMEOUT = 30000; // 30 seconds timeout for Mongoose sessions

// Utility function for retries
const withRetry = async (fn, maxRetries = 3, operationName = 'operation') => {
  let attempt = 1;
  while (attempt <= maxRetries) {
    try {
      const result = await fn();
      logger.debug(`${operationName} succeeded on attempt ${attempt}`);
      return result;
    } catch (error) {
      logger.warn(`${operationName} failed on attempt ${attempt}: ${error.message}`, { stack: error.stack });
      if (attempt === maxRetries) {
        logger.error(`${operationName} failed after ${maxRetries} attempts`, { error: error.message });
        throw error;
      }
      await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
      attempt++;
    }
  }
};
/**
 * Place Order
 * @route POST /api/orders/place-order
 * @desc Create a new order and initiate payment
 * @access Private (requires JWT token)
 */
export const placeOrder = async (req, res) => {
  const session = await mongoose.startSession({ defaultTransactionOptions: { timeout: SESSION_TIMEOUT } });
  let transactionCommitted = false;
  session.startTransaction();
  try {
    if (!req.user) {
      logger.warn('Place order failed: No user data in request', { ip: req.ip });
      return res.status(401).json({ success: false, message: 'Authentication required' });
    }

    const { customerId, totalAmount, items, deliveryAddress, deliveryFee, paymentPhone } = req.body;
    const requesterId = req.user._id.toString();

    if (requesterId !== customerId) {
      logger.warn(`Place order failed: User ${requesterId} attempted to order as ${customerId}`, { ip: req.ip });
      return res.status(403).json({ success: false, message: 'Unauthorized to place order for this customer' });
    }

    const requiredFields = ['customerId', 'totalAmount', 'items', 'deliveryAddress', 'deliveryFee'];
    for (const field of requiredFields) {
      if (!req.body[field] && req.body[field] !== 0) {
        logger.warn(`Place order failed: Missing required field ${field}`, { userId: requesterId, ip: req.ip });
        return res.status(400).json({ success: false, message: `Missing required field: ${field}` });
      }
    }

    if (!Array.isArray(items) || items.length === 0) {
      logger.warn('Place order failed: Empty items array', { userId: requesterId, ip: req.ip });
      return res.status(400).json({ success: false, message: 'Your cart is empty. Please add items to place an order' });
    }

    if (typeof deliveryFee !== 'number' || deliveryFee < 0) {
      logger.warn(`Place order failed: Invalid deliveryFee ${deliveryFee}`, { userId: requesterId, ip: req.ip });
      return res.status(400).json({ success: false, message: 'Delivery fee must be a non-negative number' });
    }

    const itemRequiredFields = ['sellerId', 'quantity', 'name', 'productId', 'color', 'price'];
    for (const item of items) {
      for (const field of itemRequiredFields) {
        if (!item[field]) {
          logger.warn(`Place order failed: Missing item field ${field}`, { userId: requesterId, productId: item.productId, ip: req.ip });
          return res.status(400).json({ success: false, message: `Missing required item field: ${field}` });
        }
      }
      if (typeof item.quantity !== 'number' || item.quantity < 1) {
        logger.warn(`Place order failed: Invalid quantity ${item.quantity}`, { userId: requesterId, productId: item.productId, ip: req.ip });
        return res.status(400).json({ success: false, message: 'Quantity must be a positive number' });
      }
      if (typeof item.price !== 'number' || item.price <= 0) {
        logger.warn(`Place order failed: Invalid price ${item.price}`, { userId: requesterId, productId: item.productId, ip: req.ip });
        return res.status(400).json({ success: false, message: 'Price must be a positive number' });
      }
    }

    const deliveryRequiredFields = ['county', 'constituency', 'nearestTown', 'phone'];
    for (const field of deliveryRequiredFields) {
      if (!deliveryAddress[field]) {
        logger.warn(`Place order failed: Missing delivery address field ${field}`, { userId: requesterId, ip: req.ip });
        return res.status(400).json({ success: false, message: `Missing required delivery address field: ${field}` });
      }
    }
    if (!/^\+?254[0-9]{9}$/.test(deliveryAddress.phone) && !/^\+?254[0-9]{9}$/.test(paymentPhone)) {
      logger.warn('Place order failed: Invalid phone', { userId: requesterId, ip: req.ip });
      return res.status(400).json({ success: false, message: 'Valid Kenyan phone number required in delivery address or payment number' });
    }

    const calculatedTotal = items.reduce((sum, item) => sum + item.price * item.quantity, 0) + deliveryFee;
    if (Math.abs(totalAmount - calculatedTotal) > 0.01) {
      logger.warn(`Place order failed: Total amount mismatch. Expected ${calculatedTotal}, got ${totalAmount}`, { userId: requesterId, ip: req.ip });
      return res.status(400).json({ success: false, message: 'Total amount does not match item prices plus delivery fee' });
    }

    if (!mongoose.Types.ObjectId.isValid(customerId)) {
      logger.warn(`Place order failed: Invalid customerId ${customerId}`, { userId: requesterId, ip: req.ip });
      return res.status(400).json({ success: false, message: 'Invalid customerId' });
    }

    const user = await userModel.findById(customerId).session(session);
    if (!user) {
      logger.warn(`Place order failed: Customer ${customerId} not found`, { userId: requesterId, ip: req.ip });
      return res.status(404).json({ success: false, message: 'Customer not found' });
    }
    if (!user.personalInfo.email || !validator.isEmail(user.personalInfo.email)) {
      logger.warn('Place order failed: Invalid or missing user email', { userId: requesterId, ip: req.ip });
      return res.status(400).json({ success: false, message: 'Valid user email required for payment' });
    }

    // Validate listings and sellers (but defer inventory updates)
    const listings = new Map();
    for (const item of items) {
      if (!mongoose.Types.ObjectId.isValid(item.sellerId)) {
        logger.warn(`Place order failed: Invalid sellerId ${item.sellerId}`, { userId: requesterId, productId: item.productId, ip: req.ip });
        return res.status(400).json({ success: false, message: `Invalid sellerId: ${item.sellerId}` });
      }
      const seller = await userModel.findById(item.sellerId).session(session);
      if (!seller) {
        logger.warn(`Place order failed: Seller ${item.sellerId} not found`, { userId: requesterId, productId: item.productId, ip: req.ip });
        return res.status(404).json({ success: false, message: `Seller ${item.sellerId} not found` });
      }

      const listing = await listingModel.findOne({
        'productInfo.productId': item.productId,
        verified: 'Verified',
        isSold: false,
        inventory: { $gte: item.quantity },
      }).session(session);

      if (!listing) {
        logger.warn(`Place order failed: Listing ${item.productId} not found, not verified, sold, or insufficient inventory`, { userId: requesterId, ip: req.ip });
        return res.status(400).json({ success: false, message: `Listing not available for productId: ${item.productId}` });
      }

      listings.set(item.productId, listing);
    }

    // Generate orderId as string
    const orderIdStr = new mongoose.Types.ObjectId().toString();

    const orderData = {
      orderId: orderIdStr,
      customerId: customerId,
      totalAmount,
      deliveryFee,
      status: 'pending',
      items: items.map(item => ({
        sellerId: new mongoose.Types.ObjectId(item.sellerId),
        quantity: item.quantity,
        name: sanitizeHtml(item.name),
        productId: sanitizeHtml(item.productId),
        color: sanitizeHtml(item.color),
        price: item.price,
        size: item.size ? sanitizeHtml(item.size) : undefined,
        status: 'pending',
        cancelled: false,
      })),
      deliveryAddress: {
        country: sanitizeHtml(deliveryAddress.country || 'Kenya'),
        county: sanitizeHtml(deliveryAddress.county),
        constituency: sanitizeHtml(deliveryAddress.constituency),
        nearestTown: sanitizeHtml(deliveryAddress.nearestTown),
        specificLocation: sanitizeHtml(deliveryAddress.specificLocation || ''),
        phone: sanitizeHtml(deliveryAddress.phone),
      },
    };

    const newOrder = new orderModel(orderData);
    const savedOrder = await newOrder.save({ session });
    logger.debug(`Saved order`, { orderId: savedOrder.orderId });

    // Initialize payment (uses savedOrder._id)
    const paymentResult = await withRetry(() => initializePayment(savedOrder._id, session, user.personalInfo.email, deliveryFee, paymentPhone), 3, `Initialize payment for order ${orderIdStr}`);
    if (paymentResult.error) {
      logger.warn(`Place order failed: Payment initialization failed - ${paymentResult.message}`, { userId: requesterId, orderId: savedOrder.orderId });
      throw new Error(paymentResult.message);
    }

    // Now update listings inventory (after payment init success)
    for (const [productId, listing] of listings) {
      const item = items.find(i => i.productId === productId);
      const updatedListing = await listingModel.findOneAndUpdate(
        { 'productInfo.productId': productId, verified: 'Verified', isSold: false, inventory: { $gte: item.quantity } },
        {
          $inc: { inventory: -item.quantity, 'analytics.ordersNumber': 1 },
          $set: { isSold: listing.inventory - item.quantity <= 0 },
        },
        { session, new: true }
      );

      if (!updatedListing) {
        logger.warn(`Place order failed: Failed to update listing ${productId}`, { userId: requesterId, ip: req.ip });
        throw new Error(`Failed to update listing for productId: ${productId}`);
      }
    }

    // Update user orders and stats
    await userModel.updateOne(
      { _id: user._id },
      { $push: { orders: savedOrder._id }, $inc: { 'stats.pendingOrdersCount': 1, 'analytics.orderCount': 1 } },
      { session }
    );

    for (const item of items) {
      await userModel.updateOne(
        { _id: item.sellerId },
        { $inc: { 'stats.pendingOrdersCount': 1 } },
        { session }
      );
    }

    await session.commitTransaction();
    transactionCommitted = true;
    logger.info(`Transaction committed for order ${savedOrder.orderId}`, { userId: requesterId });

    // Send lightweight initiation notification to buyer only (full confirm on webhook)
    const initNotificationContent = `Your order (ID: ${savedOrder.orderId}) has been placed. Check your phone for M-Pesa payment prompt. Reply "CANCEL" to abort before paying.`;
    try {
      await sendNotification(customerId, 'order', initNotificationContent, customerId);
      logger.info(`Order initiation notification created for buyer ${customerId}`, { orderId: savedOrder.orderId });
    } catch (notificationError) {
      logger.warn(`Failed to create buyer initiation notification: ${notificationError.message}`, { orderId: savedOrder.orderId });
    }

    // No full emails or seller notifications here—defer to webhook for deduplication

    // Prepare poll URL for frontend
    const apiBaseUrl = process.env.API_BASE_URL || req.protocol + '://' + req.get('host');
    const pollUrl = `${apiBaseUrl}/api/payments/verify/${paymentResult.reference}`;

    logger.info(`Order placed successfully: ${savedOrder.orderId} by user ${requesterId}`);
    res.status(201).json({
      success: true,
      message: 'Order placed successfully. Check your phone for M-Pesa payment prompt.',
      data: { 
        order: savedOrder, 
        authorization_url: null, 
        reference: paymentResult.reference,
        pollUrl: pollUrl,
        nextAction: 'poll_payment'  // For frontend handling
      },
    });
  } catch (error) {
    if (!transactionCommitted) {
      await session.abortTransaction();
      logger.info(`Transaction aborted for order attempt`, { userId: req.user?._id });
    }
    logger.error(`Error placing order: ${error.message}`, { stack: error.stack, userId: req.user?._id });
    res.status(500).json({ success: false, message: `Server error: ${error.message}` });
  } finally {
    session.endSession();
  }
};

export const retryOrderPayment = async (req, res) => {
  const session = await mongoose.startSession({ defaultTransactionOptions: { timeout: SESSION_TIMEOUT } });
  let transactionCommitted = false;
  session.startTransaction();
  try { 
    if (!req.user) {
      logger.warn('Retry order payment failed: No user data in request', { ip: req.ip }); 
      return res.status(401).json({ success: false, message: 'Authentication required' });
    }
    const { orderId } = req.params;
    const { phone } = req.body;
    const requesterId = req.user._id.toString();
    if (!orderId) {
      logger.warn('Retry order payment failed: Missing orderId', { userId: requesterId, ip: req.ip });
      return res.status(400).json({ success: false, message: 'Missing orderId parameter' });
    }
    const order = await orderModel.findOne({ orderId }).session(session);
    console.log("order status:",order.status)
    if (!order) {
      logger.warn(`Retry order payment failed: Order ${orderId} not found`, { userId: requesterId, ip: req.ip });
      return res.status(404).json({ success: false, message: 'Order not found' });
    }   
    if (order.customerId.toString() !== requesterId) {
      logger.warn(`Retry order payment failed: User ${requesterId} attempted to access order ${orderId} owned by ${order.customerId}`, { ip: req.ip });
      return res.status(403).json({ success: false, message: 'Unauthorized to access this order' });
    }
    const transaction = await TransactionModel.findOne({ orderId: orderId}).session(session);
    console.log(transaction)
    console.log("Transactions status:",transaction.status)
    if (order.status !== 'pending') {
      logger.warn(`Retry order payment failed: Order ${orderId} is not pending`, { userId: requesterId, ip: req.ip });
      return res.status(400).json({ success: false, message: 'Only pending orders can retry payment' });
    }
    if (order.status === 'paid' || transaction.status === 'completed') {
      logger.warn(`Retry order payment failed: Order ${orderId} is already paid`, { userId: requesterId, ip: req.ip });
      return res.status(400).json({ success: false, message: 'Order is already paid' });
    }
    if (!phone || !/^\+?254[0-9]{9}$/.test(phone)) {
      logger.warn('Retry order payment failed: Invalid phone', { userId: requesterId, ip: req.ip });
      return res.status(400).json({ success: false, message: 'Valid Kenyan phone number required' });
    }
    const user = await userModel.findById(requesterId).session(session);
    if (!user) {
      logger.warn(`Retry order payment failed: User ${requesterId} not found`, { ip: req.ip });
      return res.status(404).json({ success: false, message: 'User not found' });
    }
    if (!user.personalInfo.email || !validator.isEmail(user.personalInfo.email)) {
      logger.warn('Retry order payment failed: Invalid or missing user email', { userId: requesterId, ip: req.ip });
      return res.status(400).json({ success: false, message: 'Valid user email required for payment' });
    }




    const paymentResult = await withRetry(() => initializePayment(order._id, session, user.personalInfo.email, order.deliveryFee, phone), 3, `Initialize payment for order ${order.orderId}`);
    if (paymentResult.error) {
      logger.warn(`Retry order payment failed: Payment initialization failed - ${paymentResult.message}`, { userId: requesterId, orderId: order.orderId });
      throw new Error(paymentResult.message);
    }
    await session.commitTransaction();
    transactionCommitted = true;
    logger.info(`Transaction committed for payment retry of order ${order.orderId}`, { userId: requesterId });
    res.status(200).json({
      success: true,
      message: 'Payment initialization successful. Check your phone for M-Pesa payment prompt.',
      data: { authorization_url: null, reference: paymentResult.reference },
    });
  } catch (error) {
    console.log(error)
    if (!transactionCommitted) {
      await session.abortTransaction();
      logger.info(`Transaction aborted for payment retry attempt`, { userId: req.user?._id });
    }
    logger.error(`Error retrying order payment: ${error.message}`, { stack: error.stack, userId: req.user?._id });
    res.status(500).json({ success: false, message: `Server error: ${error.message}` });
  } finally {
    session.endSession();
  }
}
/**
 * Update Order Status
 * @route PATCH /api/orders/update-status
 * @desc Update the status of an order item (processing, shipped, out_for_delivery, or delivered)
 * @access Private (requires JWT token)
 */
export const updateOrderStatus = async (req, res) => {
  const session = await mongoose.startSession({ defaultTransactionOptions: { timeout: SESSION_TIMEOUT } });
  let transactionCommitted = false;
  session.startTransaction();
  try {
    if (!req.user) {
      logger.warn('Update order status failed: No user data in request', { ip: req.ip });
      return res.status(401).json({ success: false, message: 'Authentication required' });
    }

    const { orderId , itemIndex, status, sellerId, userId, productId } = req.body;
    const requesterId = req.user._id.toString();

    console.log('Update request body:', req.body); // Log orderId, userId, etc.

    if (!orderId || itemIndex === undefined || !status || !sellerId || !userId || !productId) {
      logger.warn('Update order status failed: Missing required fields', { userId: requesterId, ip: req.ip });
      return res.status(400).json({ success: false, message: 'Missing required fields: orderId, itemIndex, status, sellerId, userId, productId' });
    }

    if (requesterId !== userId) {
      logger.warn(`Update order status failed: User ${requesterId} attempted to update as ${userId}`, { ip: req.ip });
      return res.status(403).json({ success: false, message: 'Unauthorized to update this order' });
    }

    if (!mongoose.Types.ObjectId.isValid(userId) || !mongoose.Types.ObjectId.isValid(sellerId)) {
      logger.warn(`Update order status failed: Invalid userId ${userId} or sellerId ${sellerId}`, { userId: requesterId, ip: req.ip });
      return res.status(400).json({ success: false, message: 'Invalid userId or sellerId' });
    }

    const order = await orderModel.findOne({ orderId }).session(session).populate('items.sellerId customerId');
    if (!order) {
      logger.warn(`Update order status failed: Order ${orderId} not found`, { userId, ip: req.ip });
      return res.status(404).json({ success: false, message: 'Order not found' });
    }
   console.log("Found the order",order.items[0].sellerId)

    const item = order.items[itemIndex];
    if (!item) {
      logger.warn(`Update order status failed: Item at index ${itemIndex} not found in order ${orderId}`, { userId, ip: req.ip });
      return res.status(404).json({ success: false, message: 'Item not found in order' });
    }
    if (item.cancelled) {
      logger.warn(`Update order status failed: Item ${itemIndex} is cancelled`, { userId, orderId, ip: req.ip });
      return res.status(400).json({ success: false, message: 'Cannot update status of a cancelled item' });
    }
    console.log(item.sellerId._id.toString() === sellerId)
    if (item.sellerId._id.toString() !== sellerId) {
      logger.warn(`Update order status failed: Seller ${sellerId} does not match item seller`, { userId, orderId, itemIndex, ip: req.ip });
      return res.status(403).json({ success: false, message: 'Seller does not match item seller' });
    }

    if (item.productId !== productId) {
      logger.warn(`Update order status failed: ProductId ${productId} does not match item productId`, { userId, orderId, itemIndex, ip: req.ip });
      return res.status(400).json({ success: false, message: 'ProductId does not match item productId' });
    }

    const validStatuses = ['processing', 'shipped', 'out_for_delivery', 'delivered'];
    if (!validStatuses.includes(status)) {
      logger.warn(`Update order status failed: Invalid status ${status}`, { userId, orderId, itemIndex, ip: req.ip });
      return res.status(400).json({ success: false, message: `Invalid status. Use one of ${validStatuses.join(', ')}` });
    }

    const statusFlow = {
      pending: ['processing', 'shipped'],
      processing: ['shipped', 'out_for_delivery'],
      shipped: ['out_for_delivery', 'delivered'],
      out_for_delivery: ['delivered'],
      delivered: [],
    };
    if (!statusFlow[item.status]?.includes(status)) {
      logger.warn(`Update order status failed: Cannot transition from ${item.status} to ${status}`, { userId, orderId, itemIndex, ip: req.ip });
      return res.status(400).json({ success: false, message: `Cannot transition from ${item.status} to ${status}` });
    }

    if (['processing', 'shipped', 'out_for_delivery'].includes(status) && item.sellerId._id.toString() !== userId) {
      logger.warn(`Update order status failed: User ${userId} not authorized to set ${status} for item ${itemIndex}`, { orderId, ip: req.ip });
      return res.status(403).json({ success: false, message: `Only the seller can mark an item as ${status}` });
    }
    if (status === 'delivered' && order.customerId._id.toString() !== userId) {
      logger.warn(`Update order status failed: User ${userId} not authorized to mark item ${itemIndex} as delivered`, { orderId, ip: req.ip });
      return res.status(403).json({ success: false, message: 'Only the buyer can mark an item as delivered' });
    }

    const oldStatus = item.status;
    item.status = status;

    const itemStatuses = order.items.map(i => i.status);
    if (itemStatuses.every(s => s === 'delivered' || s === 'cancelled')) {
      order.status = 'delivered';
    } else if (itemStatuses.every(s => ['shipped', 'out_for_delivery', 'delivered'].includes(s) || s === 'cancelled')) {
      order.status = 'shipped';
    } else {
      order.status = 'paid';
    }

    await order.save({ session });

    const listing = await listingModel.findOne({ 'productInfo.productId': item.productId }).session(session);
    const sellerUpdate = {};
    const buyerUpdate = {};

    if (status === 'delivered' && oldStatus !== 'delivered') {
      const transaction = await TransactionModel.findOne({ orderId: order.orderId }).session(session);
      if (!transaction) {
        logger.warn(`Update order status failed: Transaction not found for order ${orderId}`, { userId, ip: req.ip });
        throw new Error('Transaction not found for order');
      }
      const transactionItem = transaction.items.find(tItem => tItem.itemId.toString() === item._id.toString());
      if (!transactionItem) {
        logger.warn(`Update order status failed: Transaction item not found for item ${itemIndex}`, { userId, orderId, ip: req.ip });
        throw new Error('Transaction item not found');
      }
      sellerUpdate['stats.completedOrdersCount'] = 1;
      sellerUpdate['analytics.salesCount'] = 1;
      sellerUpdate['analytics.totalSales.amount'] = transactionItem.sellerShare;
      sellerUpdate['stats.pendingOrdersCount'] = -1;
      buyerUpdate['stats.completedOrdersCount'] = 1;
      buyerUpdate['stats.pendingOrdersCount'] = -1;
      if (listing) {
        listing.isSold = listing.inventory <= item.quantity;
        await listing.save({ session });
      }

      if (transactionItem.payoutStatus !== 'manual_pending') {
        logger.warn(`Payout already processed for item ${itemIndex}`, { userId, orderId, ip: req.ip });
      } else {
        await withRetry(() => initiatePayout(transaction._id, transactionItem.itemId, session), 3, `Initiate payout for item ${itemIndex} in order ${orderId}`);
      }
    } else if (['processing', 'shipped', 'out_for_delivery'].includes(status) && oldStatus === 'pending') {
      sellerUpdate['stats.pendingOrdersCount'] = -1;
      buyerUpdate['stats.pendingOrdersCount'] = -1;
    }

    if (Object.keys(sellerUpdate).length) {
      await userModel.updateOne({ _id: item.sellerId._id }, { $inc: sellerUpdate }, { session });
    }
    if (Object.keys(buyerUpdate).length) {
      await userModel.updateOne({ _id: order.customerId._id }, { $inc: buyerUpdate }, { session });
    }

    const recipient = ['processing', 'shipped', 'out_for_delivery'].includes(status) ? order.customerId : item.sellerId;
    if (recipient && recipient.personalInfo?.email && recipient.preferences?.emailNotifications) {
      await withRetry(async () => {
        const emailContent = generateOrderStatusEmail(
          recipient.personalInfo.fullname || (['processing', 'shipped', 'out_for_delivery'].includes(status) ? 'Buyer' : 'Seller'),
          item.name,
          orderId,
          status,
          ['processing', 'shipped', 'out_for_delivery'].includes(status) ? item.sellerId._id : order.customerId._id
        );
        const emailSent = await sendEmail(
          recipient.personalInfo.email,
          `Order Status Update - BeiFity.Com`,
          emailContent
        );
        if (!emailSent) throw new Error(`Failed to send status update email to ${['processing', 'shipped', 'out_for_delivery'].includes(status) ? 'buyer' : 'seller'} ${recipient._id}`);
        logger.info(`Status update email sent to ${['processing', 'shipped', 'out_for_delivery'].includes(status) ? 'buyer' : 'seller'} ${recipient._id}`, { orderId, itemIndex });
      }, 3, `Send status update email for item ${itemIndex} in order ${orderId}`);
    } else {
      logger.info(`Recipient ${recipient._id} has email notifications disabled or no email`, { orderId, itemIndex });
    }

    const notificationRecipientId = ['processing', 'shipped', 'out_for_delivery'].includes(status) ? order.customerId._id : item.sellerId._id;
    const notificationRecipient = ['processing', 'shipped', 'out_for_delivery'].includes(status) ? order.customerId : item.sellerId;
    const notificationContent = `Your order item "${sanitizeHtml(item.name)}" (Order ID: ${sanitizeHtml(orderId)}) is now ${status}.`;
    try {
      await sendNotification(notificationRecipientId.toString(), 'order_status', notificationContent, userId, session);
      logger.info(`Status notification created for ${['processing', 'shipped', 'out_for_delivery'].includes(status) ? 'buyer' : 'seller'} ${notificationRecipientId}`, { orderId, itemIndex });
    } catch (notificationError) {
      logger.warn(`Failed to create status notification: ${notificationError.message}`, { orderId, itemIndex });
    }

    // Notify admins when status is 'delivered'
    if (status === 'delivered') {
      const admins = await userModel.find({ 'personalInfo.isAdmin': true }).select('_id personalInfo.email personalInfo.fullname preferences').session(session);
      for (const admin of admins) {
        const adminNotificationContent = `Order item "${sanitizeHtml(item.name)}" (Order ID: ${sanitizeHtml(orderId)}) has been marked as delivered by the buyer (ID: ${order.customerId._id}).`;
        try {
          await sendNotification(admin._id.toString(), 'order_status', adminNotificationContent, userId, session);
          logger.info(`Status notification created for admin ${admin._id}`, { orderId, itemIndex });
        } catch (notificationError) {
          logger.warn(`Failed to create admin status notification: ${notificationError.message}`, { orderId, itemIndex, adminId: admin._id });
        }

        if (admin.personalInfo?.email && admin.preferences?.emailNotifications) {
          await withRetry(async () => {
            const adminEmailContent = generateOrderStatusEmailAdmin(
              admin.personalInfo.fullname || 'Admin',
              item.name,
              orderId,
              status,
              order.customerId._id.toString(),
              item.sellerId._id.toString()
            );
            const adminEmailSent = await sendEmail(
              admin.personalInfo.email,
              'Order Status Update - BeiFity.Com Admin Notification',
              adminEmailContent
            );
            if (!adminEmailSent) throw new Error('Failed to send admin status email');
            logger.info(`Status email sent to admin ${admin._id}`, { orderId, itemIndex });
          }, 3, `Send admin status email for item ${itemIndex} in order ${orderId}`);
        } else {
          logger.info(`Admin ${admin._id} has email notifications disabled or no email`, { orderId, itemIndex });
        }
      }
    }

    await session.commitTransaction();
    transactionCommitted = true;
    logger.info(`Order status updated: ${orderId}, item ${itemIndex} to ${status} by user ${userId}`);
    return res.status(200).json({
      success: true,
      message: 'Item status updated successfully',
      data: { orderId: order.orderId, items: order.items },
    });
  } catch (error) {
    console.log(error)
    if (!transactionCommitted) {
      await session.abortTransaction();
      logger.info(`Transaction aborted for order status update`, { userId: req.user?._id, orderId: req.body.orderId, itemIndex: req.body.itemIndex });
    }
    logger.error(`Error updating order status: ${error.message}`, { stack: error.stack, userId: req.user?._id, orderId: req.body.orderId, itemIndex: req.body.itemIndex });
    return res.status(500).json({ success: false, message: `Server error: ${error.message}` });
  } finally {
    session.endSession();
  }
};

/**
 * Cancel Order Item
 * @route PATCH /api/orders/cancel-item
 * @desc Cancel an order item and process refund if applicable
 * @access Private (requires JWT token)
 */
export const cancelOrderItem = async (req, res) => {
  const session = await mongoose.startSession({ defaultTransactionOptions: { timeout: SESSION_TIMEOUT } });
  let transactionCommitted = false;
  session.startTransaction();
  try {
    if (!req.user) {
      logger.warn('Cancel order item failed: No user data in request', { ip: req.ip });
      return res.status(401).json({ success: false, message: 'Authentication required' });
    }

    const { orderId, itemId, userId , reason , details} = req.body;
    const requesterId = req.user._id.toString();

    if (!orderId || !itemId || !userId) {
      logger.warn('Cancel order item failed: Missing required fields', { userId: requesterId, ip: req.ip });
      return res.status(400).json({ success: false, message: 'orderId, itemId, and userId are required' });
    }

    if (requesterId !== userId) {
      logger.warn(`Cancel order item failed: User ${requesterId} attempted to cancel as ${userId}`, { ip: req.ip });
      return res.status(403).json({ success: false, message: 'Unauthorized to cancel this order' });
    }

    if (!mongoose.Types.ObjectId.isValid(userId)) {
      logger.warn(`Cancel order item failed: Invalid userId ${userId}`, { userId: requesterId, ip: req.ip });
      return res.status(400).json({ success: false, message: 'Invalid userId' });
    }

    let order = await orderModel.findOne({ orderId }).session(session).populate('items.sellerId customerId');
    if (!order) {
      logger.warn(`Cancel order item failed: Order ${orderId} not found`, { userId, ip: req.ip });
      return res.status(404).json({ success: false, message: 'Order not found' });
    }

    const item = order.items.find(i => i.productId === itemId);
    if (!item) {
      logger.warn(`Cancel order item failed: Item ${itemId} not found in order ${orderId}`, { userId, ip: req.ip });
      return res.status(404).json({ success: false, message: 'Item not found in this order' });
    }
    if (item.status !== 'pending') {
      logger.warn(`Cancel order item failed: Item ${itemId} is not pending`, { userId, orderId, ip: req.ip });
      return res.status(400).json({ success: false, message: 'Only pending items can be cancelled' });
    }
    if (item.cancelled) {
      logger.warn(`Cancel order item failed: Item ${itemId} is already cancelled`, { userId, orderId, ip: req.ip });
      return res.status(400).json({ success: false, message: 'Item is already cancelled' });
    }

    if (item.sellerId._id.toString() !== userId && order.customerId._id.toString() !== userId) {
      logger.warn(`Cancel order item failed: User ${userId} not authorized to cancel item ${itemId}`, { orderId, ip: req.ip });
      return res.status(403).json({ success: false, message: 'Only the buyer or seller can cancel this item' });
    }
    if(!reason) {
      logger.warn("Not sent the reason for cancellation and it should be there")
      return res.status(403).json({success: false, message : "A reason required for cancellation" })
    }

    item.cancelled = true;
    item.cancellationReason = reason;
    item.cancellationDetails= details;
    item.status = 'cancelled';
    item.refundedAmount = item.price * item.quantity;

    let refundMessage = '';
    let refundStatus = 'none';
    let refundedAmount = 0;

    if (order.transactionId) {
      const transaction = await TransactionModel.findOne({ _id: order.transactionId }).session(session);
      if (!transaction) {
        logger.warn(`Cancel order item failed: Transaction not found for order ${orderId}`, { userId, ip: req.ip });
        throw new Error('Transaction not found for order');
      }

      const transactionItem = transaction.items.find(tItem => tItem.itemId.toString() === item._id.toString());
      if (!transactionItem) {
        logger.warn(`Cancel order item failed: Transaction item not found for item ${itemId}`, { userId, orderId, ip: req.ip });
        throw new Error('Transaction item not found');
      }

      if (transactionItem.refundStatus !== 'none') {
        logger.warn(`Cancel order item failed: Refund already ${transactionItem.refundStatus} for item ${itemId}`, { userId, orderId, ip: req.ip });
        return res.status(400).json({ success: false, message: `Refund already ${transactionItem.refundStatus} for this item` });
      }

      if (transaction.status === 'completed' && order.status !== 'paid') {
        logger.info(`Syncing order ${orderId} status to paid due to completed transaction`, { userId, ip: req.ip });
        order.status = 'paid';
        await order.save({ session });
      }

      if (transaction.isReversed) {
        logger.warn(`Order ${orderId} has reversed transaction, cannot cancel item ${itemId}`, { userId, ip: req.ip });
        return res.status(400).json({ success: false, message: 'Order cannot be cancelled as the transaction has been reversed. Full refund already processed.' });
      }

      if (transaction.status === 'completed') {
        logger.debug(`Initiating manual refund for item ${itemId} in order ${orderId}, transaction status: ${transaction.status}`, { userId, ip: req.ip });
        const refundResult = await withRetry(() => initiateRefund(order._id, item.productId, session), 3, `Initiate refund for item ${itemId} in order ${orderId}`);
        if (refundResult.error) {
          logger.warn(`Failed to initiate refund for item ${itemId} in order ${orderId}: ${refundResult.message}`, { userId, ip: req.ip, refundError: refundResult });
          refundMessage = ` (refund failed: ${refundResult.message})`;
          throw new Error(refundResult.message);
        } else {
          refundMessage = ` (refund will be processed as soon as possible)`;
          refundStatus = 'pending';
          refundedAmount = transactionItem.itemAmount;
          item.refundStatus = 'pending';
          transactionItem.refundStatus = 'pending';
          transactionItem.refundedAmount = refundedAmount;
          await transaction.save({ session });
        }
      } else {
        refundMessage = ` (no refund needed as transaction status is ${transaction.status})`;
        logger.info(`No refund initiated for item ${itemId} in order ${orderId}: transaction status is ${transaction.status}`, { userId, ip: req.ip });
      }
    } else {
      refundMessage = ' (no refund needed as no transaction exists)';
      logger.info(`No refund initiated for item ${itemId} in order ${orderId}: no transaction found`, { userId, ip: req.ip });
    }

    const savedOrder = await order.save({ session });
    logger.debug(`Order updated after cancellation`, {
      orderId,
      itemId,
      totalAmount: savedOrder.totalAmount,
      status: savedOrder.status,
      items: savedOrder.items.map(i => ({
        productId: i.productId,
        status: i.status,
        cancelled: i.cancelled,
        refundStatus: i.refundStatus,
        refundedAmount: i.refundedAmount
      })),
    });

    // Restore inventory for the cancelled item
    await listingModel.updateOne(
      { 'productInfo.productId': item.productId },
      { $inc: { 'analytics.ordersNumber': -1, 'inventory': item.quantity }, $set: { isSold: false } },
      { session }
    );

    // Update stats for the seller of this item (per item)
    await userModel.updateOne(
      { _id: item.sellerId._id },
      { $inc: { 'stats.failedOrdersCount': 1, 'stats.pendingOrdersCount': -1 } },
      { session }
    );

    const allCancelled = savedOrder.items.every(i => i.cancelled);

    let isFullCancellation = false;
    if (allCancelled) {
      savedOrder.status = 'cancelled';
      await savedOrder.save({ session });

      // Update buyer stats (per order)
      await userModel.updateOne(
        { _id: savedOrder.customerId._id },
        { $inc: { 'stats.failedOrdersCount': 1, 'stats.pendingOrdersCount': -1 } },
        { session }
      );

      // Adjust seller stats for all their items in this order (in case of multiple items per seller)
      const sellerItemCounts = savedOrder.items.reduce((acc, i) => {
        const sid = i.sellerId._id.toString();
        acc[sid] = (acc[sid] || 0) + 1;
        return acc;
      }, {});
      for (const [sid, count] of Object.entries(sellerItemCounts)) {
        if (sid !== item.sellerId._id.toString()) {  // Skip current seller as already updated
          await userModel.updateOne(
            { _id: sid },
            { $inc: { 'stats.failedOrdersCount': count, 'stats.pendingOrdersCount': -count } },
            { session }
          );
        }
      }

      isFullCancellation = true;

      // Full order refund logic
      if (order.transactionId) {
        const transaction = await TransactionModel.findById(order.transactionId).session(session);
        if (transaction && transaction.status === 'completed' && !transaction.isReversed) {
          transaction.isReversed = true;
          await transaction.save({ session });

          // Mark all transaction items as refunded
          for (const txItem of transaction.items) {
            txItem.refundStatus = 'pending';
            txItem.refundedAmount = txItem.itemAmount;
          }
          await transaction.save({ session });

          // Mark all order items as refunded
          for (const it of savedOrder.items) {
            it.refundStatus = 'pending';
            it.refundedAmount = it.price * it.quantity;
          }
          await savedOrder.save({ session });

          // Calculate full refund amount (total - service fee)
          const fullRefundAmount = transaction.totalAmount - transaction.swiftServiceFee;

          // Deduct from sellers' balances and add to history
          const sellerDeductions = {};
          for (const txItem of transaction.items) {
            const share = txItem.sellerShare;
            const sid = txItem.sellerId.toString();
            sellerDeductions[sid] = (sellerDeductions[sid] || 0) + share;

            await userModel.updateOne(
              { _id: txItem.sellerId },
              { $inc: { 'financials.balance': -share } },
              { session }
            );

            await userModel.updateOne(
              { _id: txItem.sellerId },
              {
                $push: {
                  'financials.payoutHistory': {
                    amount: -share,
                    method: 'M-Pesa',
                    status: 'manual_refund_pending',
                  },
                },
              },
              { session }
            );
          }

          // Calculate and deduct platform share (delivery + commissions)
          const itemsTotal = transaction.items.reduce((sum, i) => sum + i.itemAmount, 0);
          const totalCommission = itemsTotal * commissionRate;
          const platformDeduct = transaction.deliveryFee + totalCommission;
          await userModel.updateOne(
            { 'personalInfo.isAdmin': true },
            { $inc: { 'financials.balance': -platformDeduct } },
            { session }
          );

          // Full refund notifications and emails
          const buyer = savedOrder.customerId;
          const fullRefundMessage = `Full order cancelled. A full refund of KES ${fullRefundAmount.toFixed(2)} (excluding KES ${transaction.swiftServiceFee.toFixed(2)} service fee) will be processed as soon as possible.`;
          if (buyer && buyer.personalInfo?.email && buyer.preferences?.emailNotifications) {
            const emailContent = generateOrderCancellationEmail(
              buyer.personalInfo.fullname || 'Buyer',
              'Full Order',
              orderId,
              'buyer',
              fullRefundMessage,
              null
            );
            await sendEmail(
              buyer.personalInfo.email,
              'Full Order Cancellation - BeiFity.Com',
              emailContent
            );
            logger.info(`Full cancellation email sent to buyer ${buyer._id}`, { orderId, itemId });
          }
          await sendNotification(
            buyer._id.toString(),
            'order_cancellation',
            fullRefundMessage,
            null,
            session
          );

          // Sellers
          for (const [sid, deduct] of Object.entries(sellerDeductions)) {
            const seller = await userModel.findById(sid).session(session);
            const sellerMsg = `Full order ${orderId} cancelled. KES ${deduct.toFixed(2)} has been deducted from your balance as part of the full refund (service fee retained by platform).`;
            if (seller && seller.personalInfo?.email && seller.preferences?.emailNotifications) {
              const emailContent = generateOrderCancellationEmail(
                seller.personalInfo.fullname || 'Seller',
                'Full Order',
                orderId,
                'seller',
                sellerMsg,
                null
              );
              await sendEmail(
                seller.personalInfo.email,
                'Full Order Cancellation - BeiFity.Com',
                emailContent
              );
              logger.info(`Full cancellation email sent to seller ${sid}`, { orderId, itemId });
            }
            await sendNotification(
              sid,
              'order_cancellation',
              sellerMsg,
              savedOrder.customerId._id.toString(),
              session
            );
          }

          // Admins
          const admins = await userModel.find({ 'personalInfo.isAdmin': true }).select('_id personalInfo.email personalInfo.fullname preferences').session(session);
          for (const admin of admins) {
            const adminMsg = `Full order ${orderId} (initiated by ${userId === savedOrder.customerId._id.toString() ? 'buyer' : 'seller'}) has been cancelled. Full refund KES ${fullRefundAmount.toFixed(2)} initiated (service fee KES ${transaction.swiftServiceFee.toFixed(2)} retained).`;
            await sendNotification(
              admin._id.toString(),
              'order_cancellation',
              adminMsg,
              userId,
              session
            );
            if (admin.personalInfo?.email && admin.preferences?.emailNotifications) {
              const emailContent = generateOrderCancellationEmailAdmin(
                admin.personalInfo.fullname || 'Admin',
                'Full Order',
                orderId,
                userId === savedOrder.customerId._id.toString() ? 'buyer' : 'seller',
                adminMsg,
                userId
              );
              await sendEmail(
                admin.personalInfo.email,
                'Full Order Cancellation - BeiFity.Com Admin Notification',
                emailContent
              );
              logger.info(`Full cancellation admin email sent to ${admin._id}`, { orderId, itemId });
            }
          }

          refundMessage = ` (full order cancelled, refund of KES ${fullRefundAmount.toFixed(2)} initiated excluding service fee)`;
          refundedAmount = fullRefundAmount;
          refundStatus = 'pending';
        }
      }
    }

    // Partial notifications (skip if full)
    if (!isFullCancellation) {
      const recipient = item.sellerId._id.toString() === userId ? order.customerId : item.sellerId;
      if (recipient && recipient.personalInfo?.email && recipient.preferences?.emailNotifications) {
        await withRetry(async () => {
          const emailContent = generateOrderCancellationEmail(
            recipient.personalInfo.fullname || (item.sellerId._id.toString() === userId ? 'Buyer' : 'Seller'),
            item.name,
            orderId,
            item.sellerId._id.toString() === userId ? 'seller' : 'buyer',
            refundMessage.includes('refund') ? `A refund of KES ${refundedAmount} will be processed as soon as possible.` : refundMessage,
            userId
          );
          const emailSent = await sendEmail(
            recipient.personalInfo.email,
            'Order Item Cancellation - BeiFity.Com',
            emailContent
          );
          if (!emailSent) throw new Error(`Failed to send cancellation email to ${item.sellerId._id.toString() === userId ? 'buyer' : 'seller'} ${recipient._id}`);
          logger.info(`Cancellation email sent to ${item.sellerId._id.toString() === userId ? 'buyer' : 'seller'} ${recipient._id}`, { orderId, itemId });
        }, 3, `Send cancellation email for item ${itemId} in order ${orderId}`);
      } else {
        logger.info(`Recipient ${recipient?._id} has email notifications disabled or no email`, { orderId, itemId });
      }

      const notificationRecipientId = item.sellerId._id.toString() === userId ? order.customerId._id : item.sellerId._id;
      const notificationRecipient = item.sellerId._id.toString() === userId ? order.customerId : item.sellerId;
      const notificationContent = `The ${item.sellerId._id.toString() === userId ? 'seller' : 'buyer'} cancelled the order item "${sanitizeHtml(item.name)}" (Order ID: ${sanitizeHtml(orderId)}). ${refundMessage}`;
      try {
        await sendNotification(notificationRecipientId.toString(), 'order_cancellation', notificationContent, userId, session);
        logger.info(`Cancellation notification created for ${item.sellerId._id.toString() === userId ? 'buyer' : 'seller'} ${notificationRecipientId}`, { orderId, itemId });
      } catch (notificationError) {
        logger.warn(`Failed to create cancellation notification: ${notificationError.message}`, { orderId, itemId });
      }

      // Notify admins of partial cancellation
      const admins = await userModel.find({ 'personalInfo.isAdmin': true }).select('_id personalInfo.email personalInfo.fullname preferences').session(session);
      for (const admin of admins) {
        const adminNotificationContent = `The ${item.sellerId._id.toString() === userId ? 'seller' : 'buyer'} (ID: ${userId}) cancelled the order item "${sanitizeHtml(item.name)}" (Order ID: ${sanitizeHtml(orderId)}). ${refundMessage}`;
        try {
          await sendNotification(admin._id.toString(), 'order_cancellation', adminNotificationContent, userId, session);
          logger.info(`Cancellation notification created for admin ${admin._id}`, { orderId, itemId });
        } catch (notificationError) {
          logger.warn(`Failed to create admin cancellation notification: ${notificationError.message}`, { orderId, itemId, adminId: admin._id });
        }

        if (admin.personalInfo?.email && admin.preferences?.emailNotifications) {
          await withRetry(async () => {
            const adminEmailContent = generateOrderCancellationEmailAdmin(
              admin.personalInfo.fullname || 'Admin',
              item.name,
              orderId,
              item.sellerId._id.toString() === userId ? 'seller' : 'buyer',
              refundMessage.includes('refund') ? `A refund of KES ${refundedAmount} will be processed as soon as possible.` : refundMessage,
              userId
            );
            const adminEmailSent = await sendEmail(
              admin.personalInfo.email,
              'Order Item Cancellation - BeiFity.Com Admin Notification',
              adminEmailContent
            );
            if (!adminEmailSent) throw new Error('Failed to send admin cancellation email');
            logger.info(`Cancellation email sent to admin ${admin._id}`, { orderId, itemId });
          }, 3, `Send admin cancellation email for item ${itemId} in order ${orderId}`);
        } else {
          logger.info(`Admin ${admin._id} has email notifications disabled or no email`, { orderId, itemId });
        }
      }
    }

    await session.commitTransaction();
    transactionCommitted = true;
    logger.info(`Item ${itemId} cancelled in order ${orderId} by user ${userId}${refundMessage}`);
    res.status(200).json({
      success: true,
      message: `Item cancelled successfully ${refundMessage}`,
      data: {
        orderId: order.orderId,
        items: order.items,
        totalAmount: order.totalAmount,
        status: order.status,
        refundStatus: item.refundStatus,
        refundedAmount: item.refundedAmount,
      },
    });
  } catch (error) {
    if (!transactionCommitted) {
      await session.abortTransaction();
      logger.info(`Transaction aborted for order item cancellation`, { userId: req.user?._id, orderId, itemId });
    }
    logger.error(`Error cancelling item: ${error.message}`, { stack: error.stack, userId: req.user?._id, orderId, itemId });
    res.status(500).json({ success: false, message: `Server error: ${error.message}` });
  } finally {
    session.endSession();
  }
};


/**
 * Get Orders
 * @route POST /api/orders/get-orders
 * @desc Retrieve orders for a seller
 * @access Private (requires JWT token)
 */
export const getOrders = async (req, res) => {
  try {
    if (!req.user) {
      logger.warn('Get orders failed: No user data in request', { ip: req.ip });
      return res.status(401).json({ success: false, message: 'Authentication required' });
    }

    const requesterId = req.user._id.toString();

    if (!mongoose.Types.ObjectId.isValid(requesterId)) {
      logger.warn(`Get orders failed: Invalid requesterId ${requesterId}`, { requesterId: requesterId, ip: req.ip });
      return res.status(400).json({ success: false, message: 'Invalid requesterId' });
    }

    const ObjectId = mongoose.Types.ObjectId;
    const sellerObjectId = new ObjectId(requesterId);

    const orders = await orderModel
      .find({ 'items.sellerId': sellerObjectId })
      .populate('customerId', 'personalInfo.fullname personalInfo.profilePicture') // Optional: Populate customer for easier frontend use
      .sort({ createdAt: -1})
      .lean();

    if (!orders || orders.length === 0) {
      logger.info(`No orders found for seller ${requesterId}`);
      return res.status(200).json({ success: true, data: [], message: 'No orders found' });
    }

    const filteredOrders = orders.map(order => ({
      orderId: order.orderId,
      customerId: order.customerId?._id || order.customerId, // Handle populated or raw
      customerName: order.customerId?.personalInfo?.fullname || 'Unknown', // If populated
      totalAmount: order.totalAmount,
      deliveryFee: order.deliveryFee,
      status: order.status,
      items: order.items
        .filter(item => item.sellerId._id?.toString() === requesterId || item.sellerId === requesterId)
        .map(item => ({
          ...item,
          _id: item._id?.toString() || null, // Handle lean() ObjectId
          name: sanitizeHtml(item.name || ''),
          productId: sanitizeHtml(item.productId || ''),
          color: sanitizeHtml(item.color || ''),
          size: item.size ? sanitizeHtml(item.size) : undefined,
          status: item.status,
        })),
      deliveryAddress: {
        country: sanitizeHtml(order.deliveryAddress?.country || 'Kenya'),
        county: sanitizeHtml(order.deliveryAddress?.county || ''),
        constituency: sanitizeHtml(order.deliveryAddress?.constituency || ''),
        nearestTown: sanitizeHtml(order.deliveryAddress?.nearestTown || ''),
        phone: sanitizeHtml(order.deliveryAddress?.phone || ''),
      },
      createdAt: order.createdAt,
      updatedAt: order.updatedAt,
    })); // Only return orders with seller's items

    if (filteredOrders.length > 0) {
      console.log('Sample item:', filteredOrders[0].items[0]);
    }

    logger.info(`Retrieved ${filteredOrders.length} orders for seller ${requesterId}`);
    return res.status(200).json({
      success: true,
      message: 'Orders retrieved successfully',
      data: filteredOrders,
    });
  } catch (error) {
    console.error('Error in getOrders:', error);
    logger.error(`Error fetching orders: ${error.message}`, { stack: error.stack, ip: req.ip });
    return res.status(500).json({ success: false, message: `Server error: ${error.message}` });
  }
};
/**
 * Get Buyer Orders
 * @route POST /api/orders/get-buyer-orders
 * @desc Retrieve orders for a buyer
 * @access Private (requires JWT token)
 */
export const getBuyerOrders = async (req, res) => {
  try {
    if (!req.user) {
      logger.warn('Get buyer orders failed: No user data in request', { ip: req.ip });
      return res.status(401).json({ success: false, message: 'Authentication required' });
    }

    const { customerId } = req.body;
    const requesterId = req.user._id.toString();

    if (requesterId !== customerId && !req.user.personalInfo?.isAdmin) {
      logger.warn(`Get buyer orders failed: User ${requesterId} unauthorized to access orders for ${customerId}`, { ip: req.ip });
      return res.status(403).json({ success: false, message: 'Unauthorized to access these orders' });
    }

    if (!mongoose.Types.ObjectId.isValid(customerId)) {
      logger.warn(`Get buyer orders failed: Invalid customerId ${customerId}`, { userId: requesterId, ip: req.ip });
      return res.status(400).json({ success: false, message: 'Invalid customerId' });
    }

    const orders = await orderModel
      .find({ customerId })
      .populate('items.sellerId', 'personalInfo.fullname personalInfo.email personalInfo.phone')
      .lean();
    if (!orders || orders.length === 0) {
      logger.info(`No orders found for buyer ${customerId}`);
      return res.status(200).json({ success: true, data: [], message: 'No orders found for this buyer' });
    }

    const formattedOrders = orders.map(order => ({
      orderId: order.orderId,
      totalAmount: order.totalAmount,
      deliveryFee: order.deliveryFee,
      status: order.status,
      items: order.items.map(item => ({
        ...item,
        _id: item._id.toString(),
        name: sanitizeHtml(item.name),
        productId: sanitizeHtml(item.productId),
        color: sanitizeHtml(item.color),
        size: item.size ? sanitizeHtml(item.size) : undefined,
        status: item.status,
        refundStatus: item.refundStatus || 'none',
        refundedAmount: item.refundedAmount || 0,
        seller: {
          id: item.sellerId,
          fullname: sanitizeHtml(item.sellerId?.personalInfo?.fullname || 'Unknown'),
          email: sanitizeHtml(item.sellerId?.personalInfo?.email || ''),
          phone: sanitizeHtml(item.sellerId?.personalInfo?.phone || ''),
        },
      })),
      deliveryAddress: {
        country: sanitizeHtml(order.deliveryAddress.country),
        county: sanitizeHtml(order.deliveryAddress.county || ''),
        constituency: sanitizeHtml(order.deliveryAddress.constituency || ''),
        nearestTown: sanitizeHtml(order.deliveryAddress.nearestTown || ''),
        phone: sanitizeHtml(order.deliveryAddress.phone),
      },
      createdAt: order.createdAt,
      updatedAt: order.updatedAt,
    }));

    console.log(formattedOrders[0].items);

    logger.info(`Retrieved ${formattedOrders.length} orders for buyer ${customerId}`, { requesterId });
    return res.status(200).json({
      success: true,
      message: 'Orders retrieved successfully',
      data: formattedOrders,
    });
  } catch (error) {
    console.error(error);
    logger.error(`Error fetching buyer orders: ${error.message}`, { stack: error.stack, });
    return res.status(500).json({ success: false, message: `Server error: ${error.message}` });
  }
};