import { userModel } from '../models/User.js';
import { orderModel } from '../models/Order.js';
import { TransactionModel } from '../models/Transaction.js';
import { ReportModel } from '../models/Report.js';
import { listingModel } from '../models/Listing.js';
import logger from "../utils/logger.js";
import { GoogleGenerativeAI, HarmCategory, HarmBlockThreshold } from '@google/generative-ai';
import env from "../config/env.js";

export const getSellerOverview = async (req, res) => {
  try {
    const sellerId = req.user._id; // Assuming authenticated seller ID from middleware

    // Fetch user data for base stats
    const user = await userModel.findById(sellerId).select('analytics stats financials rating personalInfo listings orders referralCode createdAt').lean();

    if (!user) {
      return res.status(404).json({ success: false, message: 'Seller not found' });
    }

    // Aggregate active listings count (from listings array, but verify active)
    const activeListingsCount = await listingModel.countDocuments({ 
      _id: { $in: user.listings || [] }, 
      isActive: true 
    });

    // Pending orders count for seller
    const pendingOrdersCount = await orderModel.countDocuments({
      items: { $elemMatch: { sellerId: sellerId, status: 'pending', cancelled: false } }
    });

    // Total inquiries and negotiation attempts (sum from listings analytics)
    const listingsAgg = await listingModel.aggregate([
      { $match: { _id: { $in: user.listings || [] } } },
      {
        $group: {
          _id: null,
          totalInquiries: { $sum: '$analytics.inquiries' },
          totalNegotiationAttempts: { $sum: '$analytics.negotiationAttempts' },
          totalViews: { $sum: { $size: '$analytics.views.uniqueViewers' } },
          totalOrdersNumber: { $sum: '$analytics.ordersNumber' },
          totalSoldListings: { $sum: { $cond: [{ $eq: ['$isSold', true] }, 1, 0] } }
        }
      }
    ]);
    const aggData = listingsAgg[0] || { totalInquiries: 0, totalNegotiationAttempts: 0, totalViews: 0, totalOrdersNumber: 0, totalSoldListings: 0 };

    // Successful sales revenue (from user analytics or aggregate transactions)
    const successfulTransactionsAgg = await TransactionModel.aggregate([
      { $match: { 'items.sellerId': sellerId, status: 'completed', 'items.payoutStatus': { $in: ['transferred', 'completed'] } } },
      { $unwind: '$items' },
      { $match: { 'items.sellerId': sellerId } },
      {
        $group: {
          _id: null,
          totalRevenue: { $sum: '$items.owedAmount' },
          salesCount: { $sum: 1 }
        }
      }
    ]);
    const transData = successfulTransactionsAgg[0] || { totalRevenue: user.analytics.totalSales.amount, salesCount: user.analytics.salesCount };

    // Recent inquiries (using reports on seller's listings as proxy for inquiries)
    // FIXED: First get seller's productIds to match reportedEntityId (assuming it's productId string)
    const sellerProductIds = await listingModel.distinct('productInfo.productId', { seller: { sellerId: sellerId } });
    const recentInquiries = await ReportModel.find({
      reportType: 'listing',
      reportedEntityId: { $in: sellerProductIds },
      status: { $in: ['Pending', 'Under Review'] }, // Standardized to active statuses
      createdAt: { $gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) } // Last 30 days
    }).populate('reporterId', 'personalInfo.fullname personalInfo.profilePicture').sort({ createdAt: -1 }).limit(5).lean();

    const overview = {
      stats: {
        profileViews: user.analytics.profileViews.total,
        totalListings: user.listings?.length || 0,
        activeListings: activeListingsCount,
        soldItems: aggData.totalSoldListings || user.stats.soldListingsCount,
        pendingOrders: pendingOrdersCount || user.stats.pendingOrdersCount,
        totalRevenue: transData.totalRevenue,
        totalInquiries: aggData.totalInquiries,
        totalNegotiationAttempts: aggData.totalNegotiationAttempts,
        listingViews: aggData.totalViews,
        averageRating: user.rating.average,
        balance: user.financials.balance || 0,
        joinedDate: user.createdAt
      },
      recentInquiries,
      referralCode: user.referralCode
    };

    res.status(200).json({ success: true, data: overview });
  } catch (error) {
    console.error('Error fetching seller overview:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

export const getSellerListings = async (req, res) => {
  try {
    const sellerId = req.user._id;
    const { page = 1, limit = 10, status = 'all' } = req.query; // Optional filters

    const matchObj = { seller: { sellerId: sellerId } };
    if (status !== 'all') {
      matchObj.isActive = status === 'active';
      matchObj.isSold = status === 'sold' ? true : { $ne: true };
    }

    const listings = await listingModel.find(matchObj)
      .select('productInfo.analytics reviews negotiable isSold rating featured inventory expiresAt isActive aiFindings')
      .populate('seller.sellerId', 'personalInfo.fullname personalInfo.profilePicture')
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(parseInt(limit))
      .lean();

    const total = await listingModel.countDocuments(matchObj);

    res.status(200).json({ 
      success: true, 
      data: { listings, pagination: { page: parseInt(page), limit: parseInt(limit), total, pages: Math.ceil(total / limit) } } 
    });
  } catch (error) {
    console.error('Error fetching seller listings:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

export const getSellerTransactions = async (req, res) => {
  try {
    const sellerId = req.user._id;
    const { page = 1, limit = 10, status = 'completed' } = req.query;

    const matchStatus = status === 'all' ? { $in: ['pending', 'swift_initiated', 'completed', 'failed', 'reversed'] } : status;

    const transactions = await TransactionModel.find({ 
      status: matchStatus, 
      items: { $elemMatch: { sellerId: sellerId, payoutStatus: { $ne: 'failed' } } } 
    })
      .select('orderId swiftReference totalAmount status items.owedAmount items.payoutStatus items.refundStatus createdAt')
      .populate('items.sellerId', 'personalInfo.fullname')
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(parseInt(limit))
      .lean();

    // Filter and project items for seller only
    const sellerTransactions = transactions.map(trans => ({
      ...trans,
      items: trans.items.filter(item => item.sellerId._id && item.sellerId._id.toString() === sellerId.toString())
    })).filter(trans => trans.items.length > 0);

    const total = await TransactionModel.countDocuments({ 
      status: matchStatus, 
      items: { $elemMatch: { sellerId: sellerId, payoutStatus: { $ne: 'failed' } } } 
    });

    res.status(200).json({ 
      success: true, 
      data: { transactions: sellerTransactions, pagination: { page: parseInt(page), limit: parseInt(limit), total, pages: Math.ceil(total / limit) } } 
    });
  } catch (error) {
    console.error('Error fetching seller transactions:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
};
export const getSellerAnalytics = async (req, res) => {
  try {
    const sellerId = req.user._id;
    const { period = '30days' } = req.query; // e.g., '7days', '30days', 'all'

    let dateFilter;
    const now = new Date();
    switch (period) {
      case '7days': dateFilter = { $gte: new Date(now - 7 * 24 * 60 * 60 * 1000) }; break;
      case '30days': dateFilter = { $gte: new Date(now - 30 * 24 * 60 * 60 * 1000) }; break;
      default: dateFilter = {}; // all time
    }

    // Profile views history (from user.analytics.profileViews.history, filtered)
    // FIXED: Expanded select to include salesCount
    const user = await userModel.findById(sellerId).select('analytics.profileViews.history analytics.totalSales.history analytics.salesCount analytics.profileViews.total').lean();
    console.log("user found: ", user)
    const profileViewsHistory = (user?.analytics?.profileViews?.history || [])
      .filter(h => !dateFilter.$gte || h.date >= dateFilter.$gte)
      .reduce((acc, h) => {
        const date = new Date(h.date).toLocaleDateString();
        acc[date] = (acc[date] || 0) + 1;
        return acc;
      }, {});

      console.log('Profile Views History: ', profileViewsHistory)
    // Listing views and sales trends (aggregate from listings and transactions)
    // FIXED: Remove dateFilter from match to include all historical data for trend; group by createdAt for historical grouping
    const listingsViewsAgg = await listingModel.aggregate([
      { $match: { seller: { sellerId: sellerId } } }, // Removed dateFilter to bring all data
      {
        $group: {
          _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
          views: { $sum: { $size: '$analytics.views.uniqueViewers' } },
          inquiries: { $sum: '$analytics.inquiries' },
          negotiations: { $sum: '$analytics.negotiationAttempts' }
        }
      },
      { $sort: { _id: 1 } }
    ])
    console.log('Listing Views Agrregate: ', listingsViewsAgg)

    const salesTrendAgg = await TransactionModel.aggregate([
      { $match: { status: 'completed', 'items.sellerId': sellerId } }, // Removed dateFilter to bring all historical sales
      { $unwind: '$items' },
      { $match: { 'items.sellerId': sellerId } },
      {
        $group: {
          _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
          revenue: { $sum: '$items.owedAmount' },
          orders: { $sum: 1 }
        }
      },
      { $sort: { _id: 1 } }
    ]);
    console.log('Sales Trend Agg:', salesTrendAgg)

    // FIXED: totalListingViews aggregate without date filter for overall
    const totalListingViewsAgg = await listingModel.aggregate([
      { $match: { seller: { sellerId: sellerId } } },
      { $group: { _id: null, total: { $sum: { $size: '$analytics.views.uniqueViewers' } } } }
    ]);
    const totalListingViews = totalListingViewsAgg[0]?.total || 0;

    // FIXED: Aggregate for totalInquiries (to match aggData from overview)
    const listingsAggOverall = await listingModel.aggregate([
      { $match: { seller: { sellerId: sellerId } } },
      {
        $group: {
          _id: null,
          totalInquiries: { $sum: '$analytics.inquiries' },
        }
      }
    ]);
    const aggDataOverall = listingsAggOverall[0] || { totalInquiries: 0 };

    const analytics = {
      profileViews: Object.entries(profileViewsHistory).map(([date, count]) => ({ date, count })),
      listingViewsTrend: listingsViewsAgg.map(d => ({ date: d._id, views: d.views, inquiries: d.inquiries, negotiations: d.negotiations })),
      salesTrend: salesTrendAgg.map(d => ({ date: d._id, revenue: d.revenue, orders: d.orders })),
      overall: {
        totalProfileViews: user?.analytics?.profileViews?.total || 0,
        totalListingViews,
        // FIXED: For seller, use salesCount / total inquiries as conversion (assuming inquiries proxy for leads)
        conversionRate: aggDataOverall.totalInquiries ? (user?.analytics?.salesCount / aggDataOverall.totalInquiries) * 100 : 0
      }
    };
    
    console.log(analytics)
    res.status(200).json({ success: true, data: analytics });
  } catch (error) {
    console.error('Error fetching seller analytics:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

export const getSellerInquiries = async (req, res) => {
  try {
    const sellerId = req.user._id;
    const { page = 1, limit = 10 } = req.query;

    // Fetch recent reports on seller's listings as inquiries
    const sellerListings = await listingModel.distinct('productInfo.productId', { seller: { sellerId: sellerId } });

    const inquiries = await ReportModel.find({
      reportType: 'listing',
      reportedEntityId: { $in: sellerListings },
      status: { $in: ['Pending', 'Under Review'] },
      createdAt: { $gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) } // FIXED: Consistent 30-day filter
    })
      .populate('reporterId', 'personalInfo.fullname personalInfo.email personalInfo.profilePicture')
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(parseInt(limit))
      .lean();

    // FIXED: Total with date filter for consistency
    const total = await ReportModel.countDocuments({
      reportType: 'listing',
      reportedEntityId: { $in: sellerListings },
      status: { $in: ['Pending', 'Under Review'] },
      createdAt: { $gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) }
    });

    // Augment with listing details
    const enrichedInquiries = await Promise.all(inquiries.map(async (inquiry) => {
      const listing = await listingModel.findOne({ 'productInfo.productId': inquiry.reportedEntityId }).select('productInfo.name images').lean();
      return { ...inquiry, listing: listing?.productInfo };
    }));

    res.status(200).json({ 
      success: true, 
      data: { inquiries: enrichedInquiries, pagination: { page: parseInt(page), limit: parseInt(limit), total, pages: Math.ceil(total / limit) } } 
    });
  } catch (error) {
    console.error('Error fetching seller inquiries:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
};


// Comprehensive Product Analytics with AI Insights (Admin Only)
export const getComprehensiveProductAnalytics = async (req, res) => {
  try {
    const adminId = req.user._id;

    // Verify admin access
    const adminUser = await userModel.findById(adminId);
    if (!adminUser || !adminUser.personalInfo.isAdmin) {
      logger.warn(`Unauthorized comprehensive analytics access attempt by user: ${adminId}`);
      return res.status(403).json({ success: false, message: 'Access denied. Admins only.' });
    }

    // Fetch all listings with comprehensive data
    const listings = await listingModel
      .find({})
      .populate('seller.sellerId', 'personalInfo.fullname personalInfo.email personalInfo.phone personalInfo.location analytics stats rating badges')
      .populate('reviews.user', 'personalInfo.fullname personalInfo.profilePicture')
      .lean();

    // Get all orders and transactions for detailed analysis
    const orders = await orderModel.find({}).populate('customerId', 'personalInfo.fullname personalInfo.email').lean();
    const transactions = await TransactionModel.find({}).populate('items.sellerId', 'personalInfo.fullname').lean();

    // Process comprehensive analytics for each listing
    const comprehensiveAnalytics = await Promise.all(listings.map(async (listing) => {
      const listingId = listing._id;
      const productId = listing.productInfo.productId;

      // Get orders for this listing
      const listingOrders = orders.filter(order =>
        order.items.some(item => item.productId === productId)
      );

      // Get transactions for this listing
      const listingTransactions = transactions.filter(transaction =>
        transaction.items.some(item => item.productId === productId)
      );

      // Calculate detailed metrics
      const totalRevenue = listingOrders.reduce((sum, order) => {
        const item = order.items.find(item => item.productId === productId);
        return sum + (item ? item.price * item.quantity : 0);
      }, 0);

      const totalOrders = listingOrders.length;
      const completedOrders = listingOrders.filter(order => order.status === 'delivered').length;
      const pendingOrders = listingOrders.filter(order => ['pending', 'paid', 'processing'].includes(order.status)).length;
      const cancelledOrders = listingOrders.filter(order => order.status === 'cancelled').length;

      const totalUnitsSold = listingOrders.reduce((sum, order) => {
        const item = order.items.find(item => item.productId === productId);
        return sum + (item ? item.quantity : 0);
      }, 0);

      const averageOrderValue = totalOrders > 0 ? totalRevenue / totalOrders : 0;

      // Transaction analytics
      const totalTransactionFees = listingTransactions.reduce((sum, transaction) =>
        sum + (transaction.swiftServiceFee || 0), 0
      );

      const totalPlatformCommission = listingTransactions.reduce((sum, transaction) =>
        sum + transaction.items.reduce((itemSum, item) =>
          item.productId === productId ? itemSum + (item.platformCommission || 0) : itemSum, 0
        ), 0
      );

      const totalSellerPayout = listingTransactions.reduce((sum, transaction) =>
        sum + transaction.items.reduce((itemSum, item) =>
          item.productId === productId ? itemSum + (item.owedAmount || 0) : itemSum, 0
        ), 0
      );

      // Customer analytics
      const uniqueCustomers = new Set(listingOrders.map(order => order.customerId._id.toString())).size;
      const repeatCustomers = listingOrders.reduce((acc, order) => {
        const customerId = order.customerId._id.toString();
        acc[customerId] = (acc[customerId] || 0) + 1;
        return acc;
      }, {});

      const repeatCustomerCount = Object.values(repeatCustomers).filter(count => count > 1).length;

      // Time-based analytics
      const now = new Date();
      const last30Days = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      const last7Days = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

      const ordersLast30Days = listingOrders.filter(order => new Date(order.createdAt) >= last30Days).length;
      const ordersLast7Days = listingOrders.filter(order => new Date(order.createdAt) >= last7Days).length;

      const revenueLast30Days = listingOrders
        .filter(order => new Date(order.createdAt) >= last30Days)
        .reduce((sum, order) => {
          const item = order.items.find(item => item.productId === productId);
          return sum + (item ? item.price * item.quantity : 0);
        }, 0);

      const revenueLast7Days = listingOrders
        .filter(order => new Date(order.createdAt) >= last7Days)
        .reduce((sum, order) => {
          const item = order.items.find(item => item.productId === productId);
          return sum + (item ? item.price * item.quantity : 0);
        }, 0);

      // Geographic analytics
      const customerLocations = listingOrders.reduce((acc, order) => {
        if (order.deliveryAddress && order.deliveryAddress.county) {
          acc[order.deliveryAddress.county] = (acc[order.deliveryAddress.county] || 0) + 1;
        }
        return acc;
      }, {});

      // Performance metrics
      const conversionRate = listing.analytics.views.total > 0 ?
        ((totalOrders / listing.analytics.views.total) * 100).toFixed(2) : 0;

      const cartConversionRate = listing.analytics.cartAdditions.total > 0 ?
        ((totalOrders / listing.analytics.cartAdditions.total) * 100).toFixed(2) : 0;

      const wishlistConversionRate = listing.analytics.wishlist.total > 0 ?
        ((totalOrders / listing.analytics.wishlist.total) * 100).toFixed(2) : 0;

      // Return period analysis
      const returnedOrders = listingOrders.filter(order =>
        order.items.some(item => item.productId === productId && item.returnStatus === 'returned')
      ).length;

      const returnRate = totalOrders > 0 ? ((returnedOrders / totalOrders) * 100).toFixed(2) : 0;

      // Compile comprehensive data
      const analyticsData = {
        productId,
        productName: listing.productInfo.name,
        productCategory: listing.productInfo.category,
        productSubCategory: listing.productInfo.subCategory,
        price: listing.productInfo.price,
        condition: listing.productInfo.condition,
        brand: listing.productInfo.brand,
        model: listing.productInfo.model,
        inventory: listing.inventory,
        isActive: listing.isActive,
        isSold: listing.isSold,
        verified: listing.verified,
        negotiable: listing.negotiable,
        onOffer: listing.productInfo.onOffer,
        featured: listing.featured,

        // Seller Information
        seller: {
          id: listing.seller.sellerId._id,
          name: listing.seller.sellerId.personalInfo.fullname,
          email: listing.seller.sellerId.personalInfo.email,
          phone: listing.seller.sellerId.personalInfo.phone,
          location: listing.seller.sellerId.personalInfo.location,
          rating: listing.seller.sellerId.rating.average,
          badges: listing.seller.sellerId.badges,
          responseTime: listing.seller.responseTime,
          acceptanceRate: listing.seller.acceptanceRate,
          totalSales: listing.seller.sellerId.analytics.totalSales.amount,
          totalListings: listing.seller.sellerId.stats.activeListingsCount + listing.seller.sellerId.stats.soldListingsCount,
        },

        // Location Data
        productLocation: listing.location,

        // Basic Analytics
        views: listing.analytics.views,
        cartAdditions: listing.analytics.cartAdditions,
        wishlist: listing.analytics.wishlist,
        shared: listing.analytics.shared,
        inquiries: listing.analytics.inquiries,
        negotiations: listing.analytics.negotiationAttempts,
        reports: listing.analytics.reportsReceived,

        // Order Analytics
        totalOrders,
        completedOrders,
        pendingOrders,
        cancelledOrders,
        totalUnitsSold,
        totalRevenue,
        averageOrderValue,

        // Time-based Analytics
        ordersLast30Days,
        ordersLast7Days,
        revenueLast30Days,
        revenueLast7Days,

        // Customer Analytics
        uniqueCustomers,
        repeatCustomers: repeatCustomerCount,
        customerLocations,

        // Financial Analytics
        totalTransactionFees,
        totalPlatformCommission,
        totalSellerPayout,
        netProfit: totalRevenue - totalTransactionFees - totalPlatformCommission,

        // Performance Metrics
        conversionRate: parseFloat(conversionRate),
        cartConversionRate: parseFloat(cartConversionRate),
        wishlistConversionRate: parseFloat(wishlistConversionRate),
        returnRate: parseFloat(returnRate),

        // Review Analytics
        totalReviews: listing.reviews.length,
        averageRating: listing.rating,
        reviewBreakdown: {
          5: listing.reviews.filter(r => r.rating === 5).length,
          4: listing.reviews.filter(r => r.rating === 4).length,
          3: listing.reviews.filter(r => r.rating === 3).length,
          2: listing.reviews.filter(r => r.rating === 2).length,
          1: listing.reviews.filter(r => r.rating === 1).length,
        },

        // Dates
        createdAt: listing.createdAt,
        updatedAt: listing.updatedAt,
        expiresAt: listing.expiresAt,
        promotedUntil: listing.promotedUntil,

        // Recent Activity (last 10 orders)
        recentOrders: listingOrders
          .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
          .slice(0, 10)
          .map(order => ({
            orderId: order.orderId,
            customerName: order.customerId.personalInfo.fullname,
            customerEmail: order.customerId.personalInfo.email,
            quantity: order.items.find(item => item.productId === productId)?.quantity || 0,
            price: order.items.find(item => item.productId === productId)?.price || 0,
            total: (order.items.find(item => item.productId === productId)?.price || 0) *
                   (order.items.find(item => item.productId === productId)?.quantity || 0),
            status: order.status,
            date: order.createdAt,
            deliveryAddress: order.deliveryAddress,
          })),
      };

      return analyticsData;
    }));

    // Generate AI Business Insights
    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
    const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' });

    // Prepare data summary for AI analysis
    const platformSummary = {
      totalListings: comprehensiveAnalytics.length,
      activeListings: comprehensiveAnalytics.filter(l => l.isActive).length,
      totalRevenue: comprehensiveAnalytics.reduce((sum, l) => sum + l.totalRevenue, 0),
      totalOrders: comprehensiveAnalytics.reduce((sum, l) => sum + l.totalOrders, 0),
      totalViews: comprehensiveAnalytics.reduce((sum, l) => sum + l.views.total, 0),
      averageConversionRate: comprehensiveAnalytics.length > 0 ?
        comprehensiveAnalytics.reduce((sum, l) => sum + l.conversionRate, 0) / comprehensiveAnalytics.length : 0,
      topCategories: comprehensiveAnalytics.reduce((acc, l) => {
        acc[l.productCategory] = (acc[l.productCategory] || 0) + l.totalOrders;
        return acc;
      }, {}),
      topLocations: comprehensiveAnalytics.reduce((acc, l) => {
        if (l.productLocation && l.productLocation.county) {
          acc[l.productLocation.county] = (acc[l.productLocation.county] || 0) + l.totalOrders;
        }
        return acc;
      }, {}),
    };

    const aiPrompt = `
You are a senior e-commerce business analyst and marketing strategist for BeiFity.Com, a Kenyan marketplace. Analyze the following comprehensive platform data and provide detailed business insights and actionable recommendations to increase sales and orders.

**Platform Overview:**
- Total Listings: ${platformSummary.totalListings}
- Active Listings: ${platformSummary.activeListings}
- Total Revenue: KES ${platformSummary.totalRevenue.toLocaleString()}
- Total Orders: ${platformSummary.totalOrders}
- Total Views: ${platformSummary.totalViews}
- Average Conversion Rate: ${platformSummary.averageConversionRate.toFixed(2)}%

**Top Categories by Orders:**
${Object.entries(platformSummary.topCategories)
  .sort(([,a], [,b]) => b - a)
  .slice(0, 10)
  .map(([category, orders]) => `- ${category}: ${orders} orders`)
  .join('\n')}

**Top Locations by Orders:**
${Object.entries(platformSummary.topLocations)
  .sort(([,a], [,b]) => b - a)
  .slice(0, 10)
  .map(([location, orders]) => `- ${location}: ${orders} orders`)
  .join('\n')}

**Sample Product Performance Data:**
${comprehensiveAnalytics.slice(0, 20).map(product => `
Product: ${product.productName} (${product.productCategory})
- Price: KES ${product.price}
- Views: ${product.views.total}
- Orders: ${product.totalOrders}
- Revenue: KES ${product.totalRevenue}
- Conversion Rate: ${product.conversionRate}%
- Average Rating: ${product.averageRating}/5
- Inventory: ${product.inventory}
- Location: ${product.productLocation?.county || 'N/A'}
- Seller Rating: ${product.seller.rating}/5
`).join('\n')}

**Analysis Requirements:**
1. **Market Trends & Opportunities**: Identify high-performing categories, emerging trends, and market gaps
2. **Conversion Optimization**: Analyze why some products convert better and provide specific improvement strategies
3. **Pricing Strategy**: Evaluate pricing effectiveness and suggest optimal pricing approaches
4. **Inventory Management**: Provide insights on inventory optimization and stock management
5. **Geographic Expansion**: Identify high-potential locations and regional strategies
6. **Seller Performance**: Analyze seller success factors and improvement recommendations
7. **Customer Behavior**: Understand buying patterns and preferences
8. **Marketing Recommendations**: Suggest targeted marketing campaigns and promotions
9. **Platform Growth**: Provide strategies to increase overall marketplace growth
10. **Risk Mitigation**: Identify potential risks and prevention strategies

**Output Format:**
Provide a comprehensive analysis with:
- Executive Summary
- Key Performance Indicators
- Detailed Insights by Category
- Actionable Recommendations (prioritized by impact and feasibility)
- Implementation Timeline
- Expected ROI for each recommendation
- Success Metrics to track

Be specific, data-driven, and provide step-by-step implementation plans. Focus on actionable insights that can drive immediate results.
`;

    let aiInsights = {};
    try {
      const result = await model.generateContent({
        contents: [{ parts: [{ text: aiPrompt }] }],
        generationConfig: { temperature: 0.3, maxOutputTokens: 4000 },
        safetySettings: [
          { category: HarmCategory.HARM_CATEGORY_HARASSMENT, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
          { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
          { category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
        ],
      });

      const rawResponse = result.response.text().replace(/```json\s*|\s*```/g, '').trim();

      // Try to parse as JSON first, if not, treat as text
      try {
        aiInsights = JSON.parse(rawResponse);
      } catch (parseError) {
        aiInsights = {
          summary: "AI Analysis Generated",
          insights: rawResponse,
          recommendations: "See detailed analysis above"
        };
      }
    } catch (error) {
      logger.error(`AI insights generation error: ${error.message}`);
      aiInsights = {
        error: "AI analysis temporarily unavailable",
        fallback: "Manual analysis required"
      };
    }

    // Return comprehensive response
    res.status(200).json({
      success: true,
      message: 'Comprehensive product analytics retrieved successfully',
      data: {
        platformSummary,
        productAnalytics: comprehensiveAnalytics,
        aiBusinessInsights: aiInsights,
        generatedAt: new Date(),
        totalProducts: comprehensiveAnalytics.length,
        totalRevenue: platformSummary.totalRevenue,
        totalOrders: platformSummary.totalOrders,
        averageConversionRate: platformSummary.averageConversionRate,
      },
    });

  } catch (error) {
    logger.error('Error retrieving comprehensive product analytics:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};