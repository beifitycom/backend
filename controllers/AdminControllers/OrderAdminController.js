import mongoose from "mongoose";
import { orderModel } from "../../models/Order.js";
import { TransactionModel } from "../../models/Transaction.js";
import { userModel } from "../../models/User.js";
import logger from "../../utils/logger.js";
import { initiatePayout, initiateRefund } from "../swiftController.js";
import sanitizeHtml from 'sanitize-html';
import { sendNotification } from "../notificationController.js";


const SESSION_TIMEOUT = 30000; // 30 seconds timeout for Mongoose sessions

// Utility for admin authentication
const requireAdmin = async (req, res, next) => {
  if (!req.user) {
    logger.warn("Admin access failed: No user data in request", { ip: req.ip });
    return res.status(401).json({ success: false, message: "Authentication required" });
  }
  const id = req.user._id.toString();
  const admin = await userModel.findById(id);
  if (!admin || !admin.personalInfo.isAdmin) {
    logger.warn(`Unauthorized admin access: user ${id}`, { ip: req.ip });
    return res.status(403).json({ success: false, message: "Unauthorized: Admin access required" });
  }
  next();
};

// Utility for retries
const withRetry = async (fn, maxRetries = 3, operationName = "operation") => {
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
      await new Promise((resolve) => setTimeout(resolve, 1000 * attempt));
      attempt++;
    }
  }
};

/**
 * @route GET /api/admin/orders
 * @desc Get all orders with pagination, filters (status, date range, seller/buyer search)
 * @access Private (Admin)
 */
export const getAllOrders = async (req, res) => {
  await requireAdmin(req, res, async () => {
    try {
      const {
        page = 1,
        limit = 20,
        status,
        startDate,
        endDate,
        sellerId,
        buyerId,
        orderId,
      } = req.query;
      const skip = (parseInt(page) - 1) * parseInt(limit);

      const filter = {};
      if (status) filter.status = status;
      if (orderId) filter.orderId = { $regex: orderId, $options: "i" };
      if (sellerId) filter["items.sellerId"] = mongoose.Types.ObjectId(sellerId);
      if (buyerId) filter.customerId = mongoose.Types.ObjectId(buyerId);
      if (startDate || endDate) {
        filter.createdAt = {};
        if (startDate) filter.createdAt.$gte = new Date(startDate);
        if (endDate) filter.createdAt.$lte = new Date(endDate);
      }

      const orders = await orderModel
        .find(filter)
        .populate("customerId", "personalInfo.fullname personalInfo.email personalInfo.phone")
        .populate("items.sellerId", "personalInfo.fullname personalInfo.email personalInfo.phone")
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(parseInt(limit))
        .lean();

      const total = await orderModel.countDocuments(filter);

      // Enhance with transaction and cancellation info
      const enhancedOrders = await Promise.all(
        orders.map(async (order) => {
          const transaction = await TransactionModel.findOne({ orderId: order.orderId });
          const isFullyCancelled = order.items.every((item) => item.cancelled);
          const numCancelledItems = order.items.filter((item) => item.cancelled).length;
          return {
            ...order,
            transactionStatus: transaction?.status || "none",
            isFullyCancelled,
            numCancelledItems,
            totalItems: order.items.length,
            totalRefunded: order.items.reduce((sum, item) => sum + (item.refundedAmount || 0), 0),
          };
        })
      );

      logger.info(`Admin fetched ${enhancedOrders.length} orders`, { page, limit, total, filters: req.query });
      res.status(200).json({
        success: true,
        message: "Orders fetched successfully",
        data: enhancedOrders,
        pagination: { page: parseInt(page), limit: parseInt(limit), total, pages: Math.ceil(total / limit) },
      });
    } catch (error) {
      logger.error("Error fetching all orders: " + error.message, { stack: error.stack });
      res.status(500).json({ success: false, message: "Server error fetching orders" });
    }
  });
};

/**
 * @route GET /api/admin/orders/:id
 * @desc Get detailed single order by orderId
 * @access Private (Admin)
 */
export const getOrderById = async (req, res) => {
  await requireAdmin(req, res, async () => {
    try {
      const { id } = req.params; // orderId string
      const order = await orderModel
        .findOne({ orderId: id })
        .populate("customerId", "personalInfo.fullname personalInfo.email personalInfo.phone")
        .populate("items.sellerId", "personalInfo.fullname personalInfo.email personalInfo.phone")
        .lean();

      if (!order) {
        return res.status(404).json({ success: false, message: "Order not found" });
      }

      const transaction = await TransactionModel.findOne({ orderId: id });
      const isFullyCancelled = order.items.every((item) => item.cancelled);
      const enhancedOrder = {
        ...order,
        transaction: transaction,
        isFullyCancelled,
        numCancelledItems: order.items.filter((item) => item.cancelled).length,
        totalRefunded: order.items.reduce((sum, item) => sum + (item.refundedAmount || 0), 0),
      };

      logger.info(`Admin fetched order details: ${id}`);
      res.status(200).json({ success: true, message: "Order details fetched", data: enhancedOrder });
    } catch (error) {
      logger.error("Error fetching order by ID: " + error.message, { stack: error.stack, orderId: req.params.id });
      res.status(500).json({ success: false, message: "Server error fetching order" });
    }
  });
};

/**
 * @route GET /api/admin/orders/cancelled
 * @desc Get all cancelled orders (full or partial), sorted earliest to oldest
 * @access Private (Admin)
 */
export const getCancelledOrders = async (req, res) => {
  await requireAdmin(req, res, async () => {
    try {
      const { page = 1, limit = 20 } = req.query;
      const skip = (parseInt(page) - 1) * parseInt(limit);

      const orders = await orderModel
        .find({
          $or: [{ status: "cancelled" }, { "items.cancelled": true }],
        })
        .populate("customerId", "personalInfo.fullname personalInfo.email personalInfo.phone")
        .populate("items.sellerId", "personalInfo.fullname personalInfo.email personalInfo.phone")
        .sort({ createdAt: -1 }) // Earliest to oldest
        .skip(skip)
        .limit(parseInt(limit))
        .lean();

      const total = await orderModel.countDocuments({
        $or: [{ status: "cancelled" }, { "items.cancelled": true }],
      });

      const processedOrders = orders.map((order) => ({
        ...order,
        isFullyCancelled: order.items.every((item) => item.cancelled),
        numCancelledItems: order.items.filter((item) => item.cancelled).length,
        totalItems: order.items.length,
        totalRefunded: order.items.reduce((sum, item) => sum + (item.refundedAmount || 0), 0),
      }));

      logger.info(`Admin fetched ${processedOrders.length} cancelled orders`, { page, limit, total });
      res.status(200).json({
        success: true,
        message: "Cancelled orders fetched successfully",
        data: processedOrders,
        pagination: { page: parseInt(page), limit: parseInt(limit), total, pages: Math.ceil(total / limit) },
      });
    } catch (error) {
      logger.error("Error fetching cancelled orders: " + error.message, { stack: error.stack });
      res.status(500).json({ success: false, message: "Server error fetching cancelled orders" });
    }
  });
};

/**
 * @route GET /api/admin/orders/analytics
 * @desc Get order analytics (totals, averages, trends, revenue)
 * @access Private (Admin)
 * @query params: startDate, endDate, status (optional filters)
 */
export const getOrderAnalytics = async (req, res) => {
  await requireAdmin(req, res, async () => {
    try {
      const { startDate, endDate, status } = req.query;
      const match = {};
      if (status) match.status = status;
      if (startDate || endDate) {
        match.createdAt = {};
        if (startDate) match.createdAt.$gte = new Date(startDate);
        if (endDate) match.createdAt.$lte = new Date(endDate);
      }

      // Basic counts
      const totalOrders = await orderModel.countDocuments(match);
      const totalRevenue = await orderModel.aggregate([
        { $match: match },
        { $group: { _id: null, total: { $sum: "$totalAmount" } } },
      ]);
      const avgOrderValue = totalOrders > 0 ? totalRevenue[0]?.total / totalOrders : 0;

      // Status breakdown
      const statusBreakdown = await orderModel.aggregate([
        { $match: match },
        { $group: { _id: "$status", count: { $sum: 1 } } },
        { $sort: { count: -1 } },
      ]);

      // Completed orders revenue
      const completedRevenue = await orderModel.aggregate([
        { $match: { ...match, status: "delivered" } },
        { $group: { _id: null, total: { $sum: "$totalAmount" } } },
      ]);

      // Cancellation rate
      const cancelledOrders = await orderModel.countDocuments({ ...match, status: "cancelled" });
      const cancellationRate = totalOrders > 0 ? (cancelledOrders / totalOrders) * 100 : 0;

      // Monthly trends (last 12 months)
      const monthlyTrends = await orderModel.aggregate([
        { $match: match },
        {
          $group: {
            _id: {
              year: { $year: "$createdAt" },
              month: { $month: "$createdAt" },
            },
            count: { $sum: 1 },
            revenue: { $sum: "$totalAmount" },
          },
        },
        { $sort: { "_id.year": 1, "_id.month": 1 } },
        { $limit: 12 },
      ]);

      // Top sellers by order count
      const topSellers = await orderModel.aggregate([
        { $match: match },
        { $unwind: "$items" },
        { $group: { _id: "$items.sellerId", orderCount: { $sum: 1 } } },
        {
          $lookup: {
            from: "users",
            localField: "_id",
            foreignField: "_id",
            as: "seller",
            pipeline: [{ $project: { "personalInfo.fullname": 1 } }],
          },
        },
        { $addFields: { seller: { $arrayElemAt: ["$seller", 0] } } },
        { $sort: { orderCount: -1 } },
        { $limit: 10 },
      ]);

      // Platform commission from transactions
      const totalCommission = await TransactionModel.aggregate([
        {
          $group: {
            _id: null,
            totalCommission: { $sum: "$items.platformCommission" },
          },
        },
      ]);

      logger.info("Admin fetched order analytics", { filters: req.query });
      res.status(200).json({
        success: true,
        message: "Order analytics fetched successfully",
        data: {
          totalOrders,
          totalRevenue: totalRevenue[0]?.total || 0,
          avgOrderValue: Math.round(avgOrderValue * 100) / 100,
          statusBreakdown,
          completedRevenue: completedRevenue[0]?.total || 0,
          cancellationRate: Math.round(cancellationRate * 100) / 100,
          monthlyTrends,
          topSellers,
          totalCommission: totalCommission[0]?.totalCommission || 0,
        },
      });
    } catch (error) {
      logger.error("Error fetching order analytics: " + error.message, { stack: error.stack });
      res.status(500).json({ success: false, message: "Server error fetching analytics" });
    }
  });
};

/**
 * @route POST /api/admin/orders/manual-refund
 * @desc Manually initiate refund for an order item (admin override)
 * @access Private (Admin)
 * @body: { orderId, itemId }
 */
export const adminManualRefund = async (req, res) => {
  await requireAdmin(req, res, async () => {
    const session = await mongoose.startSession({ defaultTransactionOptions: { timeout: SESSION_TIMEOUT } });
    let transactionCommitted = false;
    session.startTransaction();
    try {
      const { orderId, itemId } = req.body;
      if (!orderId || !itemId) {
        return res.status(400).json({ success: false, message: "orderId and itemId required" });
      }

      const refundResult = await withRetry(
        () => initiateRefund(orderId, itemId, session),
        3,
        `Admin manual refund for order ${orderId} item ${itemId}`
      );

      if (refundResult.error) {
        throw new Error(refundResult.message);
      }

      await session.commitTransaction();
      transactionCommitted = true;
      logger.info(`Admin initiated manual refund for order ${orderId} item ${itemId}`);
      res.status(200).json({ success: true, message: refundResult.message });
    } catch (error) {
      if (!transactionCommitted) {
        await session.abortTransaction();
      }
      logger.error(`Admin manual refund error: ${error.message}`, { stack: error.stack, orderId: req.body.orderId, itemId: req.body.itemId });
      res.status(500).json({ success: false, message: `Server error: ${error.message}` });
    } finally {
      session.endSession();
    }
  });
};

/**
 * @route POST /api/admin/orders/force-payout
 * @desc Force payout to seller for delivered item (admin override)
 * @access Private (Admin)
 * @body: { transactionId, itemId }
 */
export const adminForcePayout = async (req, res) => {
  await requireAdmin(req, res, async () => {
    const session = await mongoose.startSession({ defaultTransactionOptions: { timeout: SESSION_TIMEOUT } });
    let transactionCommitted = false;
    session.startTransaction();
    try {
      const { transactionId, itemId } = req.body;
      if (!transactionId || !itemId) {
        return res.status(400).json({ success: false, message: "transactionId and itemId required" });
      }

      const payoutResult = await withRetry(
        () => initiatePayout(transactionId, itemId, session),
        3,
        `Admin force payout for transaction ${transactionId} item ${itemId}`
      );

      if (payoutResult.error) {
        throw new Error(payoutResult.message);
      }

      await session.commitTransaction();
      transactionCommitted = true;
      logger.info(`Admin forced payout for transaction ${transactionId} item ${itemId}`);
      res.status(200).json({ success: true, message: payoutResult.message });
    } catch (error) {
      if (!transactionCommitted) {
        await session.abortTransaction();
      }
      logger.error(`Admin force payout error: ${error.message}`, { stack: error.stack, transactionId: req.body.transactionId, itemId: req.body.itemId });
      res.status(500).json({ success: false, message: `Server error: ${error.message}` });
    } finally {
      session.endSession();
    }
  });
};

/**
 * @route POST /api/admin/orders/update-status
 * @desc Admin override to update order/item status
 * @access Private (Admin)
 * @body: { orderId, itemIndex, status, reason? }
 */
export const adminUpdateOrderStatus = async (req, res) => {
  await requireAdmin(req, res, async () => {
    const session = await mongoose.startSession({ defaultTransactionOptions: { timeout: SESSION_TIMEOUT } });
    let transactionCommitted = false;
    session.startTransaction();
    try {
      const { orderId, itemIndex, status, reason } = req.body;
      if (!orderId || itemIndex === undefined || !status) {
        return res.status(400).json({ success: false, message: "orderId, itemIndex, and status required" });
      }

      const order = await orderModel.findOne({ orderId }).session(session);
      if (!order) {
        return res.status(404).json({ success: false, message: "Order not found" });
      }

      const item = order.items[itemIndex];
      if (!item) {
        return res.status(404).json({ success: false, message: "Item not found" });
      }

      const oldStatus = item.status;
      item.status = status;
      if (reason) {
        item.adminNote = reason; // Add admin note field if schema supports
      }

      // Update order status based on items
      const itemStatuses = order.items.map((i) => i.status);
      if (itemStatuses.every((s) => s === "delivered" || s === "cancelled")) {
        order.status = "delivered";
      } else if (itemStatuses.every((s) => ["shipped", "out_for_delivery", "delivered"].includes(s) || s === "cancelled")) {
        order.status = "shipped";
      } else {
        order.status = "pending";
      }

      await order.save({ session });

      // If to delivered, trigger payout if transaction exists
      if (status === "delivered" && oldStatus !== "delivered") {
        const transaction = await TransactionModel.findOne({ orderId }).session(session);
        if (transaction) {
          const txItem = transaction.items.find((ti) => ti.itemId.toString() === item._id.toString());
          if (txItem && txItem.payoutStatus === "manual_pending") {
            await initiatePayout(transaction._id, item._id, session);
          }
        }
      }

      await session.commitTransaction();
      transactionCommitted = true;
      logger.info(`Admin updated order ${orderId} item ${itemIndex} to ${status}`);
      res.status(200).json({ success: true, message: "Status updated successfully", data: { orderId, itemIndex, status } });
    } catch (error) {
      if (!transactionCommitted) {
        await session.abortTransaction();
      }
      logger.error(`Admin update status error: ${error.message}`, { stack: error.stack });
      res.status(500).json({ success: false, message: `Server error: ${error.message}` });
    } finally {
      session.endSession();
    }
  });
};

/**
 * @route GET /api/admin/orders/export
 * @desc Export orders as CSV (basic implementation; use a lib like json2csv in prod)
 * @access Private (Admin)
 * @query: startDate, endDate, status
 */
export const exportOrders = async (req, res) => {
  await requireAdmin(req, res, async () => {
    try {
      const { startDate, endDate, status } = req.query;
      const match = {};
      if (status) match.status = status;
      if (startDate || endDate) {
        match.createdAt = {};
        if (startDate) match.createdAt.$gte = new Date(startDate);
        if (endDate) match.createdAt.$lte = new Date(endDate);
      }

      const orders = await orderModel
        .find(match)
        .populate("customerId", "personalInfo.fullname personalInfo.email")
        .populate("items.sellerId", "personalInfo.fullname")
        .lean();

      const csvData = orders
        .map((order) => ({
          OrderID: order.orderId,
          Status: order.status,
          TotalAmount: order.totalAmount,
          Buyer: order.customerId?.personalInfo?.fullname || "N/A",
          BuyerEmail: order.customerId?.personalInfo?.email || "N/A",
          CreatedAt: moment(order.createdAt).format("YYYY-MM-DD HH:mm:ss"),
          Items: order.items.map((i) => `${i.name} (${i.quantity}) by ${i.sellerId?.personalInfo?.fullname || "N/A"}`).join("; "),
        }))
        .map((row) => Object.values(row).join(","))
        .join("\n");

      const csvHeader = "OrderID,Status,TotalAmount,Buyer,BuyerEmail,CreatedAt,Items\n";
      const csv = csvHeader + csvData;

      res.setHeader("Content-Type", "text/csv");
      res.setHeader("Content-Disposition", `attachment; filename=orders-${moment().format("YYYY-MM-DD")}.csv`);
      res.status(200).send(csv);

      logger.info(`Admin exported ${orders.length} orders`);
    } catch (error) {
      logger.error("Error exporting orders: " + error.message, { stack: error.stack });
      res.status(500).json({ success: false, message: "Server error exporting orders" });
    }
  });
};

/**
 * @route GET /api/admin/orders/disputes
 * @desc Get orders with disputes (e.g., rejected deliveries or reports > 0)
 * @access Private (Admin)
 * @query: page, limit, type (rejected, reported)
 */
export const getDisputeOrders = async (req, res) => {
  await requireAdmin(req, res, async () => {
    try {
      const { page = 1, limit = 20, type } = req.query;
      const skip = (parseInt(page) - 1) * parseInt(limit);

      let filter = { "items.rejected": true, reportCount: { $gt: 0 } };
      if (type === "rejected") filter = { "items.rejected": true };
      else if (type === "reported") filter = { reportCount: { $gt: 0 } };

      const orders = await orderModel
        .find(filter)
        .populate("customerId", "personalInfo.fullname personalInfo.email")
        .populate("items.sellerId", "personalInfo.fullname personalInfo.email")
        .sort({ updatedAt: -1 })
        .skip(skip)
        .limit(parseInt(limit))
        .lean();

      const total = await orderModel.countDocuments(filter);

      logger.info(`Admin fetched ${orders.length} dispute orders`, { type, page, limit, total });
      res.status(200).json({
        success: true,
        message: "Dispute orders fetched successfully",
        data: orders,
        pagination: { page: parseInt(page), limit: parseInt(limit), total, pages: Math.ceil(total / limit) },
      });
    } catch (error) {
      logger.error("Error fetching dispute orders: " + error.message, { stack: error.stack });
      res.status(500).json({ success: false, message: "Server error fetching disputes" });
    }
  });
};

/**
 * Reject Delivery
 * @route PATCH /api/orders/reject-delivery
 * @desc Allow buyer to reject a delivered item, initiating a dispute/refund process
 * @access Private (requires JWT token)
 */
export const rejectDelivery = async (req, res) => {
  const session = await mongoose.startSession({ defaultTransactionOptions: { timeout: SESSION_TIMEOUT } });
  let transactionCommitted = false;
  session.startTransaction();
  try {
    if (!req.user) {
      logger.warn('Reject delivery failed: No user data in request', { ip: req.ip });
      return res.status(401).json({ success: false, message: 'Authentication required' });
    }

    const { orderId, itemId, userId, reason, details } = req.body;
    const requesterId = req.user._id.toString();

    if (!orderId || !itemId || !userId) {
      logger.warn('Reject delivery failed: Missing required fields', { userId: requesterId, ip: req.ip });
      return res.status(400).json({ success: false, message: 'orderId, itemId, and userId are required' });
    }

    if (requesterId !== userId) {
      logger.warn(`Reject delivery failed: User ${requesterId} attempted to reject as ${userId}`, { ip: req.ip });
      return res.status(403).json({ success: false, message: 'Unauthorized to reject this delivery' });
    }

    if (!mongoose.Types.ObjectId.isValid(userId)) {
      logger.warn(`Reject delivery failed: Invalid userId ${userId}`, { userId: requesterId, ip: req.ip });
      return res.status(400).json({ success: false, message: 'Invalid userId' });
    }

    if (!reason) {
      logger.warn('Reject delivery failed: Reason required');
      return res.status(400).json({ success: false, message: 'A reason for rejection is required' });
    }

    const order = await orderModel.findOne({ orderId }).session(session).populate('items.sellerId customerId');
    if (!order) {
      logger.warn(`Reject delivery failed: Order ${orderId} not found`, { userId, ip: req.ip });
      return res.status(404).json({ success: false, message: 'Order not found' });
    }

    const item = order.items.find(i => i.productId === itemId);
    if (!item) {
      logger.warn(`Reject delivery failed: Item ${itemId} not found in order ${orderId}`, { userId, ip: req.ip });
      return res.status(404).json({ success: false, message: 'Item not found in this order' });
    }

    if (item.status !== 'out_for_delivery' && item.status !== 'delivered') {
      logger.warn(`Reject delivery failed: Item ${itemId} not eligible for rejection`, { userId, orderId, ip: req.ip });
      return res.status(400).json({ success: false, message: 'Item must be out for delivery or delivered to reject' });
    }

    if (item.rejected) {
      logger.warn(`Reject delivery failed: Item ${itemId} already rejected`, { userId, orderId, ip: req.ip });
      return res.status(400).json({ success: false, message: 'Item already rejected' });
    }

    if (order.customerId._id.toString() !== userId) {
      logger.warn(`Reject delivery failed: User ${userId} not authorized to reject item ${itemId}`, { orderId, ip: req.ip });
      return res.status(403).json({ success: false, message: 'Only the buyer can reject delivery' });
    }

    // Mark as rejected and initiate dispute/refund
    item.status = 'rejected';
    item.rejected = true;
    item.rejectionReason = reason;
    item.rejectionDetails = details || '';
    item.refundedAmount = item.price * item.quantity;

    // Update order status if all items rejected
    const itemStatuses = order.items.map(i => i.status);
    if (itemStatuses.every(s => s === 'rejected' || s === 'cancelled')) {
      order.status = 'cancelled';
    } else {
      order.status = 'disputed'; // New status for partial disputes
    }

    let refundMessage = '';
    let refundedAmount = 0;

    // Initiate refund if paid
    if (order.transactionId) {
      const transaction = await TransactionModel.findById(order.transactionId).session(session);
      if (transaction) {
        const transactionItem = transaction.items.find(ti => ti.itemId.toString() === item._id.toString());
        if (transactionItem && transactionItem.refundStatus === 'none') {
          const refundResult = await withRetry(() => initiateRefund(order._id, item.productId, session), 3, `Initiate refund for rejected item ${itemId}`);
          if (!refundResult.error) {
            refundMessage = ` (refund initiated: KES ${transactionItem.itemAmount.toFixed(2)})`;
            refundedAmount = transactionItem.itemAmount;
            item.refundStatus = 'pending';
          } else {
            refundMessage = ` (refund failed: ${refundResult.message})`;
          }
        } else {
          refundMessage = ' (refund already processed)';
        }
      }
    } else {
      refundMessage = ' (no payment to refund)';
    }

    await order.save({ session });

    // Update stats
    await userModel.updateOne(
      { _id: order.customerId._id },
      { $inc: { 'stats.failedOrdersCount': 1 } },
      { session }
    );

    // Notify seller and admin
    const sellerNotificationContent = `The buyer rejected delivery of item "${sanitizeHtml(item.name)}" (Order ID: ${sanitizeHtml(orderId)}). Reason: ${sanitizeHtml(reason)}. ${refundMessage}`;
    await sendNotification(item.sellerId._id.toString(), 'delivery_rejected', sellerNotificationContent, userId, session);

    const adminNotificationContent = `Buyer ${userId} rejected delivery of item "${sanitizeHtml(item.name)}" in order ${sanitizeHtml(orderId)}. Reason: ${sanitizeHtml(reason)}. Dispute initiated.`;
    const admins = await userModel.find({ 'personalInfo.isAdmin': true }).select('_id');
    for (const admin of admins) {
      await sendNotification(admin._id.toString(), 'dispute', adminNotificationContent, userId, session);
    }

    await session.commitTransaction();
    transactionCommitted = true;

    logger.info(`Delivery rejected for item ${itemId} in order ${orderId} by buyer ${userId}`);
    res.status(200).json({
      success: true,
      message: `Delivery rejected successfully. Dispute initiated.${refundMessage}`,
      data: { orderId, itemId, status: 'rejected', refundStatus: item.refundStatus, refundedAmount },
    });
  } catch (error) {
    if (!transactionCommitted) {
      await session.abortTransaction();
    }
    logger.error(`Error rejecting delivery: ${error.message}`, { stack: error.stack, userId: req.user?._id, orderId, itemId });
    res.status(500).json({ success: false, message: `Server error: ${error.message}` });
  } finally {
    session.endSession();
  }
};

/**
 * Accept Delivery
 * @route PATCH /api/orders/accept-delivery
 * @desc Allow buyer to accept a delivered item, marking it as delivered and releasing payment
 * @access Private (requires JWT token)
 */
/**
 * Accept Delivery
 * @route PATCH /api/orders/accept-delivery
 * @desc Allow buyer to accept a delivered item, marking it as delivered and releasing payment
 * @access Private (requires JWT token)
 */
export const acceptDelivery = async (req, res) => {
  const session = await mongoose.startSession({ defaultTransactionOptions: { timeout: SESSION_TIMEOUT } });
  let transactionCommitted = false;
  session.startTransaction();
  try {
    if (!req.user) {
      logger.warn('Accept delivery failed: No user data in request', { ip: req.ip });
      return res.status(401).json({ success: false, message: 'Authentication required' });
    }

    const { orderId, itemId, userId } = req.body;
    const requesterId = req.user._id.toString();

    if (!orderId || !itemId || !userId) {
      logger.warn('Accept delivery failed: Missing required fields', { userId: requesterId, ip: req.ip });
      return res.status(400).json({ success: false, message: 'orderId, itemId, and userId are required' });
    }

    if (requesterId !== userId) {
      logger.warn(`Accept delivery failed: User ${requesterId} attempted to accept as ${userId}`, { ip: req.ip });
      return res.status(403).json({ success: false, message: 'Unauthorized to accept this delivery' });
    }

    if (!mongoose.Types.ObjectId.isValid(userId)) {
      logger.warn(`Accept delivery failed: Invalid userId ${userId}`, { userId: requesterId, ip: req.ip });
      return res.status(400).json({ success: false, message: 'Invalid userId' });
    }

    const order = await orderModel.findOne({ orderId }).session(session).populate('items.sellerId customerId');
    if (!order) {
      logger.warn(`Accept delivery failed: Order ${orderId} not found`, { userId, ip: req.ip });
      return res.status(404).json({ success: false, message: 'Order not found' });
    }

    const item = order.items.find(i => i.productId === itemId);
    if (!item) {
      logger.warn(`Accept delivery failed: Item ${itemId} not found in order ${orderId}`, { userId, ip: req.ip });
      return res.status(404).json({ success: false, message: 'Item not found in this order' });
    }

    if (item.status !== 'out_for_delivery' && item.status !== 'delivered') {
      logger.warn(`Accept delivery failed: Item ${itemId} not eligible for acceptance`, { userId, orderId, ip: req.ip });
      return res.status(400).json({ success: false, message: 'Item must be out for delivery or delivered to accept' });
    }

    if (item.status === 'delivered') {
      logger.warn(`Accept delivery failed: Item ${itemId} already accepted`, { userId, orderId, ip: req.ip });
      return res.status(400).json({ success: false, message: 'Item already accepted as delivered' });
    }

    if (order.customerId._id.toString() !== userId) {
      logger.warn(`Accept delivery failed: User ${userId} not authorized to accept item ${itemId}`, { orderId, ip: req.ip });
      return res.status(403).json({ success: false, message: 'Only the buyer can accept delivery' });
    }

    // Mark as delivered
    item.status = 'delivered';

    // Update order status
    const itemStatuses = order.items.map(i => i.status);
    if (itemStatuses.every(s => s === 'delivered' || s === 'cancelled' || s === 'rejected')) {
      order.status = 'delivered';
    }

    await order.save({ session });

    // Update stats
    await userModel.updateOne(
      { _id: order.customerId._id },
      { $inc: { 'stats.completedOrdersCount': 1, 'stats.pendingOrdersCount': -1 } },
      { session }
    );

    // Notify seller and admin
    const sellerNotificationContent = `The buyer accepted delivery of item "${sanitizeHtml(item.name)}" (Order ID: ${sanitizeHtml(orderId)}). Payment released.`;
    await sendNotification(item.sellerId._id.toString(), 'delivery_accepted', sellerNotificationContent, userId, session);

    const adminNotificationContent = `Buyer ${userId} accepted delivery of item "${sanitizeHtml(item.name)}" in order ${sanitizeHtml(orderId)}.`;
    const admins = await userModel.find({ 'personalInfo.isAdmin': true }).select('_id');
    for (const admin of admins) {
      await sendNotification(admin._id.toString(), 'delivery_accepted', adminNotificationContent, userId, session);
    }

    await session.commitTransaction();
    transactionCommitted = true;

    logger.info(`Delivery accepted for item ${itemId} in order ${orderId} by buyer ${userId}`);

    // NEW: Trigger payout AFTER commit (decoupled; uses its own session internally)
    if (order.transactionId) {
      const transaction = await TransactionModel.findById(order.transactionId); // No session needed here
      if (transaction) {
        const transactionItem = transaction.items.find(ti => ti.itemId.toString() === item._id.toString());
        if (transactionItem && transactionItem.payoutStatus === 'manual_pending') {
          // Pass null session to force initiatePayout to create its own
          const payoutResult = await withRetry(() => initiatePayout(transaction._id, item._id, null), 3, `Initiate payout for accepted item ${itemId}`);
          if (payoutResult.error) {
            // Graceful handling: Log but don't fail the accept
            logger.warn(`Payout initiation failed after accept: ${payoutResult.message}`, { transactionId: transaction._id, itemId });
            // Optionally: Queue for retry or notify admin
          } else {
            logger.info(`Payout initiated successfully after accept`, { transactionId: transaction._id, itemId });
          }
        }
      }
    }

    res.status(200).json({
      success: true,
      message: 'Delivery accepted successfully. Payment released to seller.',
      data: { orderId, itemId, status: 'delivered' },
    });
  } catch (error) {
    console.log(error);
    if (!transactionCommitted) {
      await session.abortTransaction();
    }
    logger.error(`Error accepting delivery: ${error.message}`, { stack: error.stack});
    res.status(500).json({ success: false, message: `Server error: ${error.message}` });
  } finally {
    session.endSession();
  }
};