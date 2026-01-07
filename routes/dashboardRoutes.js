import express from 'express';
import { getComprehensiveProductAnalytics, getSellerAnalytics, getSellerInquiries, getSellerListings, getSellerOverview, getSellerTransactions } from '../controllers/dashboardController.js';
import { authUser } from '../middlewares/authMiddleware.js';

const dashboardRouter = express.Router();

// Overview: Quick stats and recent inquiries
dashboardRouter.get('/overview', authUser, getSellerOverview);

// Listings: Seller's products with filters
dashboardRouter.get('/listings', authUser,getSellerListings);

// Transactions: Successful sales and payouts
dashboardRouter.get('/transactions',authUser, getSellerTransactions);

// Analytics: Views, trends, etc.
dashboardRouter.get('/analytics',authUser, getSellerAnalytics);

// Inquiries: Recent buyer inquiries/negotiations
dashboardRouter.get('/inquiries',authUser, getSellerInquiries);

// Comprehensive Product Analytics
dashboardRouter.get('/admin/comprehensive-product-analytics', authUser, getComprehensiveProductAnalytics);

export default dashboardRouter;