import jwt from 'jsonwebtoken';
import { userModel } from '../models/User.js';
import { listingModel } from '../models/Listing.js'; // Assuming Listing model exists
import bcrypt from 'bcryptjs';
import logger from '../utils/logger.js';
import env from '../config/env.js';
import { Conversation, Message } from '../models/Message.js';
import { notificationModel } from '../models/Notifications.js';
import { ReportModel } from '../models/Report.js';
import { orderModel } from '../models/Order.js';
import { TransactionModel } from '../models/Transaction.js';
import mongoose from 'mongoose';
import { sendNotification } from './notificationController.js';

/**
 * Update Profile Views
 * @route POST /api/profile/:sellerId/views
 * @desc Record a view for a user’s profile and increment view count
 * @access Public
 */
export const updateProfileViews = async (req, res) => {
  try {
    const { sellerId } = req.params;
    const { viewerId } = req.body;

    if (!sellerId || !viewerId) {
      logger.warn('Profile views update failed: Missing sellerId or viewerId', { sellerId, viewerId });
      return res.status(400).json({ success: false, message: 'Missing sellerId or viewerId' });
    }

    const user = await userModel.findById(sellerId);
    if (!user) {
      logger.warn(`Profile views update failed: User ${sellerId} not found`);
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    if (user.analytics.profileViews.uniqueViewers.includes(viewerId)) {
      logger.debug(`Profile view already recorded for viewer ${viewerId} on user ${sellerId}`);
      return res.status(200).json({ success: true, message: 'View already recorded for this user' });
    }

    await userModel.findByIdAndUpdate(
      sellerId,
      {
        $push: {
          'analytics.profileViews.uniqueViewers': viewerId,
          'analytics.profileViews.history': { viewerId, date: new Date() },
        },
        $inc: { 'analytics.profileViews.total': 1 },
      },
      { new: true, runValidators: true }
    );

    logger.info(`Profile view recorded for user ${sellerId} by viewer ${viewerId}`);
    return res.status(200).json({ success: true, message: 'Profile view recorded successfully' });
  } catch (error) {
    logger.error(`Error updating profile views: ${error.message}`, { stack: error.stack, sellerId });
    return res.status(500).json({ success: false, message: 'Failed to update profile views' });
  }
};

/**
 * Get User Profile (Public)
 * @route GET /api/profile/:userId
 * @desc Fetch a user’s public profile by ID
 * @access Public
 */
export const getUserProfile = async (req, res) => {
  try {
    const { userId } = req.params;

    const user = await userModel.findById(userId).select('-personalInfo.password -personalInfo.mobileDetails -personalInfo.bankDetails' );
    if (!user) {
      logger.warn(`User profile fetch failed: User ${userId} not found`);
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    logger.info(`User profile fetched for user ${userId}`);
    return res.status(200).json({ success: true, data: user });
  } catch (error) {
    logger.error(`Error fetching user profile: ${error.message}`, { stack: error.stack });
    return res.status(500).json({ success: false, message: 'Failed to fetch user profile' });
  }
};

/**
 * Get Authenticated User Profile
 * @route GET /api/profile/profile
 * @desc Fetch the authenticated user’s full profile
 * @access Private (requires token)
 */
export const getAuthenticatedProfile = async (req, res) => {
  try {
    if (!req.user) {
      logger.warn('Authenticated profile fetch failed: No user data in request');
      return res.status(401).json({ success: false, message: 'Please log in to access your profile' });
    }

    const user = await userModel.findById(req.user._id).select('-personalInfo.password');
    if (!user) {
      logger.warn(`Authenticated profile fetch failed: User ${req.user._id} not found`);
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    logger.info(`Authenticated profile fetched for user ${req.user._id}`);
    return res.status(200).json({
      success: true,
      data: {
        personalInfo: user.personalInfo,
        analytics: user.analytics,
        rating: user.rating,
        stats: user.stats,
        isFeatured: user.isFeatured,
        badges: user.badges,
        preferences: user.preferences,
        referralCode: user.referralCode,
        wishlist: user.wishlist,
        listings: user.listings,
        orders: user.orders,
      },
    });
  } catch (error) {
    logger.error(`Error fetching authenticated profile: ${error.message}`, { stack: error.stack,});
    return res.status(500).json({ success: false, message: 'Failed to fetch authenticated profile' });
  }
};
/**
 * Update User Profile
 * @route PUT /api/profile/profile
 * @desc Update the authenticated user’s profile
 * @access Private (requires token)
 * @body {personalInfo: {fullname, username, profilePicture, phone, location: {country, county, constituency, fullAddress, coordinates: {type, coordinates}}, bio, socialLinks: {facebook, twitter, instagram, website}}, preferences}
 */
export const updateUserProfile = async (req, res) => {
  try {
    if (!req.user) {
      logger.warn('Profile update failed: No user data in request');
      return res.status(401).json({ success: false, message: 'Please log in to update your profile' });
    }

    const user = await userModel.findById(req.user._id);
    if (!user) {
      logger.warn(`Profile update failed: User ${req.user._id} not found`);
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    const { personalInfo, oldPassword, newPassword, preferences } = req.body;

    // Prevent email and password changes
    if (oldPassword || newPassword) {
      logger.warn(`Profile update failed: Password change attempted for user ${req.user._id}`);
      return res.status(400).json({ success: false, message: 'Password changes are not allowed in this endpoint' });
    }
    if (personalInfo && personalInfo.email) {
      logger.warn(`Profile update failed: Email change attempted for user ${req.user._id}`);
      return res.status(400).json({ success: false, message: 'Email changes are not allowed' });
    }

    logger.debug(`Profile update data for user ${req.user._id}: ${JSON.stringify(req.body)}`);

    // Update personalInfo fields
    if (personalInfo) {
      // Simple string fields with trim
      if (personalInfo.fullname !== undefined) {
        user.personalInfo.fullname = personalInfo.fullname.trim();
      }
      if (personalInfo.username !== undefined) {
        user.personalInfo.username = personalInfo.username.trim();
      }
      if (personalInfo.profilePicture !== undefined) {
        user.personalInfo.profilePicture = personalInfo.profilePicture;
      }
      if (personalInfo.phone !== undefined) {
        user.personalInfo.phone = personalInfo.phone.trim();
      }
      if (personalInfo.bio !== undefined) {
        user.personalInfo.bio = personalInfo.bio.trim();
      }

      // Merge location object (LocationSchema)
      if (personalInfo.location) {
        console.log(personalInfo.location);
        user.personalInfo.location = {
          ...user.personalInfo.location,
          ...personalInfo.location,
          // coordinates: personalInfo.location.coordinates || user.personalInfo.location.coordinates,
        };
        // Ensure coordinates structure if provided
        if (personalInfo.location.coordinates && !personalInfo.location.coordinates.type) {
          user.personalInfo.location.coordinates = {
            type: 'Point',
            coordinates: personalInfo.location.coordinates.coordinates || [36.8219, -1.2921],
          };
        }
      }

      // Merge socialLinks object
      if (personalInfo.socialLinks) {
        user.personalInfo.socialLinks = {
          ...user.personalInfo.socialLinks,
          ...personalInfo.socialLinks,
        };
        // Trim social link strings
        Object.keys(user.personalInfo.socialLinks).forEach(key => {
          if (typeof user.personalInfo.socialLinks[key] === 'string') {
            user.personalInfo.socialLinks[key] = user.personalInfo.socialLinks[key].trim();
          }
        });
      }
    }

    // Update preferences
    if (preferences) {
      user.preferences = {
        ...user.preferences,
        ...preferences,
      };
    }

    // Update lastActive
    user.analytics.lastActive = new Date();

    const updatedUser = await user.save();

    logger.info(`Profile updated for user ${req.user._id}`);
    return res.status(200).json({
      success: true,
      message: 'Profile updated successfully',
      data: {
        fullname: updatedUser.personalInfo.fullname,
        username: updatedUser.personalInfo.username,
        email: updatedUser.personalInfo.email,
        profilePicture: updatedUser.personalInfo.profilePicture,
        phone: updatedUser.personalInfo.phone,
        location: updatedUser.personalInfo.location,
        bio: updatedUser.personalInfo.bio,
        socialLinks: updatedUser.personalInfo.socialLinks,
        preferences: updatedUser.preferences,
      },
    });
  } catch (error) {
    console.log(error);
    logger.error(`Error updating user profile: ${error.message}`, { stack: error.stack });
    return res.status(500).json({ success: false, message: 'Failed to update user profile' });
  }
};
/**
 * Get Seller Profile
 * @route GET /api/profile/seller/:sellerId
 * @desc Fetch a seller’s public profile by ID
 * @access Public
 */
export const getSeller = async (req, res) => {
  try {
    const { sellerId } = req.params;
    const seller = await userModel.findById(sellerId).select('-personalInfo.password');
    if (!seller) {
      logger.warn(`Seller profile fetch failed: Seller ${sellerId} not found`);
      return res.status(404).json({ success: false, message: 'Seller not found' });
    }

    logger.info(`Seller profile fetched for seller ${sellerId}`);
    return res.status(200).json({
      success: true,
      data: {
        personalInfo: {
          fullname: seller.personalInfo.fullname,
          username: seller.personalInfo.username,
          profilePicture: seller.personalInfo.profilePicture,
          phone: seller.personalInfo.phone,
          bio: seller.personalInfo.bio,
          location: seller.personalInfo.location,
          verified: seller.personalInfo.verified,
          socialLinks: seller.personalInfo.socialLinks,
        },
        reviews: seller.reviews,
        rating: seller.rating,
        stats: seller.stats,
        badges: seller.badges,
        listings: seller.listings,
        isFeatured: seller.isFeatured,
        createdAt: seller.createdAt,
      },
    });
  } catch (error) {    
    logger.error(`Error fetching seller profile: ${error.message}`, { stack: error.stack });
    return res.status(500).json({ success: false, message: 'Failed to fetch seller profile' });
  }
};

/**
 * Get All Users
 * @route GET /api/profile
 * @desc Fetch a list of all users (public data only)
 * @access Public
 */
export const getUsers = async (req, res) => {
  try {
    const users = await userModel.find().select('-personalInfo.password -wishlist -stats -personalInfo.email -personalInfo.bankDetails -personalInfo.mobileMoneyDetails  -orders -analytics -financials');
    const requiredUsers = users.filter(user => user.personalInfo.verified );
    const data = requiredUsers.map((user) => ({
      userId: user._id,
      fullname: user.personalInfo.fullname,
      username: user.personalInfo.username,
      phone: user.personalInfo.phone,
      profilePicture: user.personalInfo.profilePicture,
      rating: user.rating,
      isFeatured: user.isFeatured,
    }));

    logger.info(`Fetched ${requiredUsers.length} users`);
    return res.status(200).json({ success: true, data });
  } catch (error) {
    logger.error(`Error fetching users: ${error.message}`, { stack: error.stack });
    return res.status(500).json({ success: false, message: 'Failed to fetch users' });
  }
};
export const fixLocationOfAseller = async (req, res) => {
  try {
    const userId = req.user._id;
    const { ids, county, constituency } = req.body;

    // Validate input
    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      logger.warn(`Invalid ids provided: ${JSON.stringify(ids)}`);
      return res.status(400).json({ success: false, message: 'Invalid or empty array of IDs provided' });
    }

    if (!county || !constituency) {
      logger.warn(`Missing county or constituency in request body`);
      return res.status(400).json({ success: false, message: 'County and constituency are required' });
    }

    // Check if user is admin
    const admin = await userModel.findById(userId).select('personalInfo.isAdmin');
    if (!admin || !admin.personalInfo.isAdmin) {
      logger.warn(`Unauthorized access attempt by user ${userId}`);
      return res.status(401).json({ success: false, message: 'Unauthorized: Admin access required' });
    }

    // Convert string IDs to ObjectIds if necessary
    const objectIds = ids.map(id => {
      if (typeof id === 'string') {
        return new mongoose.Types.ObjectId(id);
      }
      return id; // Assume already ObjectId
    });

    // Use updateMany for efficiency (updates all matching documents atomically)
    const updateResult = await userModel.updateMany(
      { _id: { $in: objectIds } },
      {
        $set: {
          'personalInfo.location.county': county.trim(),
          'personalInfo.location.constituency': constituency.trim()
        }
      }
    );

    logger.info(`Updated locations for ${updateResult.modifiedCount} users: ${objectIds.join(', ')}`);

    return res.json({
      success: true,
      message: `Successfully updated locations for ${updateResult.modifiedCount} users`,
      updatedCount: updateResult.modifiedCount
    });
  } catch (error) {
    logger.error(`Error fixing sellers locations: ${error.message}`, { stack: error.stack });
    return res.status(500).json({ success: false, message: 'Failed to update sellers locations' });
  }
};
/**
 * Get Specific Users by IDs
 * @route POST /api/profile/specific
 * @desc Fetch specific users by their IDs (e.g., for reviews)
 * @access Public
 * @body {reviewIds}
 */
export const getSpecificPeople = async (req, res) => {
  try {
    const { reviewIds } = req.body;

    if (!reviewIds || !Array.isArray(reviewIds) || reviewIds.length === 0) {
      logger.warn('Specific users fetch failed: Invalid or empty reviewIds', { reviewIds });
      return res.status(400).json({ success: false, message: 'No valid IDs provided' });
    }

    const users = await userModel.find({ _id: { $in: reviewIds } }).select('-personalInfo.password');
    if (!users.length) {
      logger.warn(`Specific users fetch failed: No users found for IDs ${reviewIds.join(', ')}`);
      return res.status(404).json({ success: false, message: 'No users found with the provided IDs' });
    }

    const data = users.map((user) => ({
      userId: user._id,
      fullname: user.personalInfo.fullname,
      username: user.personalInfo.username,
      profilePicture: user.personalInfo.profilePicture,
    }));

    logger.info(`Fetched ${users.length} specific users`);
    return res.status(200).json({ success: true, data });
  } catch (error) {
    logger.error(`Error fetching specific users: ${error.message}`, { stack: error.stack });
    return res.status(500).json({ success: false, message: 'Failed to fetch specific users' });
  }
};

/**
 * Add to Wishlist
 * @route POST /api/profile/wishlist/:listingId
 * @desc Add a listing to the authenticated user’s wishlist
 * @access Private (requires token)
 * @param {string} listingId - Listing ID to add
 */
export const addToWishlist = async (req, res) => {
  try {
    if (!req.user) {
      logger.warn('Add to wishlist failed: No user data in request');
      return res.status(401).json({ success: false, message: 'Please log in to add to wishlist' });
    }

    const { listingId } = req.params;

    const user = await userModel.findById(req.user._id);
    if (!user) {
      logger.warn(`Add to wishlist failed: User ${req.user._id} not found`);
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    const listing = await listingModel.findById(listingId);
    if (!listing) {
      logger.warn(`Add to wishlist failed: Listing ${listingId} not found for user ${req.user._id}`);
      return res.status(404).json({ success: false, message: 'Listing not found' });
    }

    
    if (user.wishlist.includes(listingId)) {
      logger.debug(`Wishlist addition skipped: Listing ${listingId} already in wishlist for user ${req.user._id}`);
      return res.status(200).json({ success: true, message: 'Listing already in wishlist' });
    }

    await userModel.findByIdAndUpdate(
      req.user._id,
      { $push: { wishlist: listingId } },
      { new: true }
    );

    logger.info(`Listing ${listingId} added to wishlist for user ${req.user._id}`);
    return res.status(200).json({ success: true, message: 'Added to wishlist successfully' });
  } catch (error) {
    logger.error(`Error adding to wishlist: ${error.message}`, { stack: error.stack, listingId });
    return res.status(500).json({ success: false, message: 'Failed to add to wishlist' });
  }
};

/**
 * Remove from Wishlist
 * @route DELETE /api/profile/wishlist/:listingId
 * @desc Remove a listing from the authenticated user’s wishlist
 * @access Private (requires token)
 * @param {string} listingId - Listing ID to remove
 */
export const removeFromWishlist = async (req, res) => {
  try {
    if (!req.user) {
      logger.warn('Remove from wishlist failed: No user data in request');
      return res.status(401).json({ success: false, message: 'Please log in to remove from wishlist' });
    }

    const { listingId } = req.params;

    const user = await userModel.findById(req.user._id);
    if (!user) {
      logger.warn(`Remove from wishlist failed: User ${req.user._id} not found`);
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    if (!user.wishlist.includes(listingId)) {
      logger.warn(`Remove from wishlist failed: Listing ${listingId} not in wishlist for user ${req.user._id}`);
      return res.status(400).json({ success: false, message: 'Listing not in wishlist' });
    }

    await userModel.findByIdAndUpdate(
      req.user._id,
      { $pull: { wishlist: listingId } },
      { new: true }
    );

    logger.info(`Listing ${listingId} removed from wishlist for user ${req.user._id}`);
    return res.status(200).json({ success: true, message: 'Removed from wishlist successfully' });
  } catch (error) {
    logger.error(`Error removing from wishlist: ${error.message}`, { stack: error.stack });
    return res.status(500).json({ success: false, message: 'Failed to remove from wishlist' });
  }
};

/**
 * Get Referral Link
 * @route GET /api/profile/referral
 * @desc Get the authenticated user’s referral link
 * @access Private (requires token)
 */
export const getReferralLink = async (req, res) => {
  try {
    if (!req.user) {
      logger.warn('Referral link fetch failed: No user data in request');
      return res.status(401).json({ success: false, message: 'Please log in to get referral link' });
    }

    const user = await userModel.findById(req.user._id);
    if (!user) {
      logger.warn(`Referral link fetch failed: User ${req.user._id} not found`);
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    const referralLink = `${env.FRONTEND_URL}/sign-up?ref=${user.referralCode}`;
    logger.info(`Referral link generated for user ${req.user._id}`);
    return res.status(200).json({
      success: true,
      referralLink,
      referralCode: user.referralCode,
      message: 'Referral link generated successfully',
    });
  } catch (error) {
    logger.error(`Error fetching referral link: ${error.message}`, { stack: error.stack,});
    return res.status(500).json({ success: false, message: 'Failed to fetch referral link' });
  }
};

/**
 * Add Seller Review
 * @route POST /api/profile/:sellerId/reviews
 * @desc Add a review for a seller
 * @access Private (requires token)
 */
export const addSellerReview = async (req, res) => {
  try {
    if (!req.user) {
      logger.warn('Seller review addition failed: No user data in request');
      return res.status(401).json({ success: false, message: 'Please log in to add a review' });
    }

    const { sellerId } = req.params;
    const { rating, comment, userId } = req.body;

    if (!sellerId) {
      logger.warn('Seller review addition failed: Seller ID missing');
      return res.status(400).json({ success: false, message: 'Seller ID is required' });
    }

    if (userId !== req.user._id.toString()) {
      logger.warn(`Seller review addition failed: User ${req.user._id} attempted to review as ${userId}`);
      return res.status(403).json({ success: false, message: 'Unauthorized: Cannot review as another user' });
    }

    if (!rating || !comment) {
      logger.warn('Seller review addition failed: Rating or comment missing', { sellerId, userId });
      return res.status(400).json({ success: false, message: 'Rating and comment are required' });
    }

    if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
      logger.warn(`Seller review addition failed: Invalid rating ${rating} for seller ${sellerId}`);
      return res.status(400).json({ success: false, message: 'Rating must be an integer between 1 and 5' });
    }

    const user = await userModel.findById(sellerId);
    if (!user) {
      logger.warn(`Seller review addition failed: Seller ${sellerId} not found`);
      return res.status(404).json({ success: false, message: 'Seller not found' });
    }

    // Check if user has already reviewed this seller
    if (user.reviews.some((review) => review.reviewer.toString() === userId)) {
      logger.warn(`Seller review addition failed: User ${userId} already reviewed seller ${sellerId}`);
      return res.status(400).json({ success: false, message: 'You have already reviewed this seller' });
    }

    const review = {
      reviewer: userId,
      comment: comment.trim(),
      rating,
      createdAt: new Date(),
    };

    const updatedUser = await userModel.findOneAndUpdate(
      { _id: sellerId },
      { $push: { reviews: review } },
      { new: true, runValidators: true }
    );

    const totalRatings = updatedUser.reviews.reduce((sum, rev) => sum + rev.rating, 0);
    const averageRating = totalRatings / updatedUser.reviews.length;

    await userModel.findOneAndUpdate(
      { _id: sellerId },
      { 'rating.average': averageRating.toFixed(1), 'rating.reviewCount': updatedUser.reviews.length },
      { new: true }
    );

    // Send notification to seller about new review
    try {
      await sendNotification(
        sellerId,
        'review',
        `${req.user.personalInfo.fullname} left you a ${rating}-star review: "${comment.trim()}"`,
        req.user._id.toString()
      );
    } catch (notificationError) {
      logger.warn(`Failed to send review notification to seller ${sellerId}: ${notificationError.message}`);
    }

    logger.info(`Review added for seller ${sellerId} by user ${userId}`);
    return res.status(200).json({
      success: true,
      message: 'Seller review added successfully',
    });
  } catch (error) {
    logger.error(`Error adding seller review: ${error.message}`, { stack: error.stack, sellerId, userId });
    return res.status(500).json({ success: false, message: 'Failed to add seller review' });
  }
};

export const removeSellerReview = async (req, res) => {
  try {
    if (!req.user) {
      logger.warn('Seller review removal failed: No user data in request');
      return res.status(401).json({ success: false, message: 'Please log in to remove a review' });
    }

    const { sellerId, reviewId } = req.params;
    const { userId } = req.body;

    if (!sellerId || !reviewId) {
      logger.warn('Seller review removal failed: Missing sellerId or reviewId', { sellerId, reviewId });
      return res.status(400).json({ success: false, message: 'sellerId and reviewId are required' });
    }

    if (userId !== req.user._id.toString()) {
      console.log(req.user._id.toString(), userId)
      logger.warn(`Seller review removal failed: User ${req.user._id} attempted to remove review as ${userId}`);
      return res.status(403).json({ success: false, message: 'Unauthorized: Cannot remove review as another user' });
    }

    const user = await userModel.findById(sellerId);
    if (!user) {
      logger.warn(`Seller review removal failed: Seller ${sellerId} not found`);
      return res.status(404).json({ success: false, message: 'Seller not found' });
    }

    const reviewIndex = user.reviews.findIndex((review) => review._id.toString() === reviewId && review.reviewer.toString() === userId);
    if (reviewIndex === -1) {
      logger.warn(`Seller review removal failed: Review ${reviewId} not found for seller ${sellerId}`);
      return res.status(404).json({ success: false, message: 'Review not found' });
    }

    const removedReview = user.reviews[reviewIndex];

    user.reviews.splice(reviewIndex, 1);

    const totalRatings = user.reviews.reduce((sum, rev) => sum + rev.rating, 0);
    const averageRating = user.reviews.length > 0 ? (totalRatings / user.reviews.length).toFixed(1) : 0;

    await userModel.findByIdAndUpdate(
      sellerId,
      { reviews: user.reviews, 'rating.average': averageRating, 'rating.reviewCount': user.reviews.length },
      { new: true }
    );

    logger.info(`Review ${reviewId} removed for seller ${sellerId} by user ${userId}`);
    return res.status(200).json({
      success: true,
      message: 'Seller review removed successfully',
    });
  } catch (error) {
    logger.error(`Error removing seller review: ${error.message}`, { stack: error.stack, sellerId, reviewId, userId });
    return res.status(500).json({ success: false, message: 'Failed to remove seller review' });
  }
}

export const getOnlySellers = async (req, res) =>{
  try{
     const users = await userModel.find().select('-personalInfo.password -stats -orders -wishlist -financial -lastseen -preferences -analytics.profileViews').lean();
     if(!users){
      return res.status(500).json({ success : false, message :"There is no user"})
     }
     const sellers = users.filter(user => user.listings.length > 0)

     logger.info(`Fetched ${sellers.length} sellers`)

     return res.status(200).json({
      success: true,
      message: "Successfully fetched sellers",
      sellers
     })


  } catch (error){
    console.log(error)
    logger.error('Error in fetching the sellers for the sitemap')
    return res.status(500).json({ success: false, message : 'failed to fetch sellers'})
  }
}

export const deleteAccount = async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    if (!req.user) {
      await session.abortTransaction();
      session.endSession();
      logger.warn('Account deletion failed: No user data in request');
      return res.status(401).json({ success: false, message: 'Please log in to delete your account' });
    }

    const userId = req.user._id;

    const user = await userModel.findById(userId).session(session);
    if (!user) {
      await session.abortTransaction();
      session.endSession();
      logger.warn(`Account deletion failed: User ${userId} not found`);
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    // Prevent deletion if there are active listings or pending orders (as buyer or seller)
    const activeListings = await listingModel.countDocuments({ 'seller.sellerId': userId, isActive: true }).session(session);
    if (activeListings > 0) {
      await session.abortTransaction();
      session.endSession();
      return res.status(403).json({ success: false, message: 'Cannot delete account with active listings' });
    }

    const pendingBuyerOrders = await orderModel.countDocuments({ customerId: userId, status: { $nin: ['delivered', 'cancelled'] } }).session(session);
    if (pendingBuyerOrders > 0) {
      await session.abortTransaction();
      session.endSession();
      return res.status(403).json({ success: false, message: 'Cannot delete account with pending orders as buyer' });
    }

    const pendingSellerItems = await orderModel.countDocuments({
      'items.sellerId': userId,
      'items.status': { $nin: ['delivered', 'cancelled'] }
    }).session(session);
    if (pendingSellerItems > 0) {
      await session.abortTransaction();
      session.endSession();
      return res.status(403).json({ success: false, message: 'Cannot delete account with pending orders as seller' });
    }

    // Delete user's listings (even inactive ones for cleanup)
    await listingModel.deleteMany({ 'seller.sellerId': userId }).session(session);

    // Remove user's reviews from all listings and update ratings
    await listingModel.updateMany(
      { 'reviews.user': userId },
      { $pull: { reviews: { user: userId } } },
      { session }
    );

    // Handle conversations: remove user from participants, delete their messages, and clean up empty conversations
    await Conversation.updateMany(
      { participants: userId },
      { $pull: { participants: userId } },
      { session }
    );
    await Message.deleteMany({ sender: userId }).session(session);
    await Conversation.deleteMany({ participants: { $size: 0 } }).session(session);

    // Delete notifications to/from the user
    await notificationModel.deleteMany({ $or: [{ userId: userId }, { sender: userId }] }).session(session);

    // Delete reports submitted by the user or against the user (for user-type reports)
    await ReportModel.deleteMany({ reporterId: userId }).session(session);
    await ReportModel.deleteMany({ reportType: 'user', reportedEntityId: userId }).session(session);

    // Anonymize orders where user is customer (set customerId to null)
    await orderModel.updateMany({ customerId: userId }, { customerId: null }, { session });

    // Anonymize order items where user is seller (set sellerId to null)
    await orderModel.updateMany(
      {},
      { $set: { 'items.$[item].sellerId': null } },
      { arrayFilters: [{ 'item.sellerId': userId }], session }
    );

    // Anonymize transaction items where user is seller (set sellerId to null)
    await TransactionModel.updateMany(
      {},
      { $set: { 'items.$[item].sellerId': null } },
      { arrayFilters: [{ 'item.sellerId': userId }], session }
    );

    // Finally, delete the user
    await userModel.findByIdAndDelete(userId).session(session);

    await session.commitTransaction();
    session.endSession();

    logger.info(`Account deleted for user ${userId}`);
    return res.status(200).json({ success: true, message: 'Account deleted successfully' });
  } catch (error) {
    console.log(error);
    await session.abortTransaction();
    session.endSession();
    logger.error(`Error deleting account: ${error.message}`, { stack: error.stack,});
    return res.status(500).json({ success: false, message: 'Failed to delete account' });
  }
};