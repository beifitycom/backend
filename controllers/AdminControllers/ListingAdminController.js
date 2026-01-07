import { listingModel } from "../../models/Listing.js";
import { userModel } from "../../models/User.js";
import { orderModel } from "../../models/Order.js";
import { TransactionModel } from "../../models/Transaction.js";
import logger from "../../utils/logger.js";
import { GoogleGenerativeAI, HarmCategory, HarmBlockThreshold } from '@google/generative-ai';
import env from "../../config/env.js";

export const toggleListingOffer = async (req, res) => {
  try {
    const { listingId } = req.params;
    const listing = await listingModel.findById(listingId);
    if (!listing) {
        logger.warn(`Listing not found for toggling offer: ${listingId}`);
        return res.status(404).json({ message: 'Listing not found' });
    }
    listing.productInfo.onOffer = !listing.productInfo.onOffer;
    await listing.save();
    res.status(200).json({ message: `Listing offer status toggled to ${listing.productInfo.onOffer}` });
  } catch (error) {
    logger.error('Error toggling listing offer status:', error);
    res.status(500).json({ message: 'Internal server error' });
  }     
};

export const bulkToggleListingOffer = async (req, res) => {
  try {
    const adminId = req.user._id;

    const adminUser = await userModel.findById(adminId);
    if (!adminUser || !adminUser.personalInfo.isAdmin) {
        logger.warn(`Unauthorized bulk toggle offer attempt by user: ${adminId}`);
        return res.status(403).json({ success: false, message: 'Access denied. Admins only.' });
    }
    const { listingIds } = req.body; // Expecting an array of listing IDs
    if (!Array.isArray(listingIds) || listingIds.length === 0) {
        logger.warn(`Invalid listing IDs provided for bulk toggle offer by admin: ${adminId}`);
        return res.status(400).json({success: false, message: 'Invalid listing IDs' });
    }
    const result = await listingModel.updateMany(
      { "productInfo.productId": { $in: listingIds } },
      [{ $set: { "productInfo.onOffer": { $not: "$productInfo.onOffer" } } }]
    );
    logger.info(`Admin ${adminId} bulk toggled offer status for ${result.modifiedCount} listings`);
    res.status(200).json({ success: true, message: `Toggled offer status for ${result.modifiedCount} listings` });
  } catch (error) {
    logger.error('Error bulk toggling listing offer status:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

