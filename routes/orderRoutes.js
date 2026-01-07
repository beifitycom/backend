import express from 'express';
import { 
  cancelOrderItem, 
  getBuyerOrders, 
  getOrders, 
  placeOrder, 
  retryOrderPayment, 
  updateOrderStatus,
  // Admin controllers

} from '../controllers/orderController.js';
import { authUser } from '../middlewares/authMiddleware.js';
import { connectNgrok } from '../middlewares/ngrok.js';
import { acceptDelivery, adminForcePayout, adminManualRefund, adminUpdateOrderStatus, exportOrders, getAllOrders, getCancelledOrders, getDisputeOrders, getOrderAnalytics, getOrderById, rejectDelivery } from '../controllers/AdminControllers/OrderAdminController.js';

const orderRouter = express.Router();

orderRouter.post('/place-order', connectNgrok, authUser, placeOrder)
orderRouter.post('/get-orders', authUser, getOrders)
orderRouter.patch('/update-status', authUser, updateOrderStatus)
orderRouter.post('/get-your-orders', authUser ,getBuyerOrders)
orderRouter.post('/retry-payment/:orderId', connectNgrok, authUser, retryOrderPayment);
orderRouter.post('/cancel-item', authUser, cancelOrderItem);

// Buyers Routers
orderRouter.patch('/accept-delivery', authUser, acceptDelivery)
orderRouter.patch('/reject-delivery', authUser, rejectDelivery)


// Admin Routes For all the Orders
orderRouter.get('/admin', authUser, getAllOrders);
orderRouter.get('/admin/:id', authUser, getOrderById);
orderRouter.get('/admin/cancel/cancelled', authUser, getCancelledOrders);
orderRouter.get('/admin/analytics', authUser, getOrderAnalytics);
orderRouter.get('/admin/export', authUser, exportOrders);
orderRouter.get('/admin/disputes', authUser, getDisputeOrders);
orderRouter.post('/admin/manual-refund', authUser, adminManualRefund);
orderRouter.post('/admin/force-payout', authUser, adminForcePayout);
orderRouter.post('/admin/update-status', authUser, adminUpdateOrderStatus);

export default orderRouter;