// restoreAllListings.js
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { listingModel } from '../models/Listing.js';
import { userModel } from '../models/User.js';
import { emailLogModel } from '../models/EmailLog.js';
import { sendListingNotification } from '../controllers/listingController.js';
import logger from '../utils/logger.js';

dotenv.config();

export const restoreAllListings = async() => {
  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    // Find all listings with isActive: false
    const listingsToRestore = await listingModel.find({ isActive: false }).session(session);

    if (listingsToRestore.length === 0) {
      logger.info('No expired listings found to restore');
      await session.commitTransaction();
      return;
    }

    // Restore listings and update seller stats
    for (const listing of listingsToRestore) {
      listing.isActive = true;
      listing.expiresAt = new Date(Date.now() + 60 * 24 * 60 * 60 * 1000); // Set to 30 days from now
      await listing.save({ session });

      await userModel.findByIdAndUpdate(
        listing.seller.sellerId,
        { $inc: { 'stats.activeListingsCount': 1 } },
        { session }
      );

      // Send notification to seller
      await sendListingNotification(
        listing.seller.sellerId.toString(),
        'listing_restored',
        `Your listing "${listing.productInfo.name}" has been restored and is now active again.`,
        listing.productInfo.productId,
        null,
        session
      );

      logger.info(`Restored listing ${listing.productInfo.productId} for seller ${listing.seller.sellerId}`);
    }

    await session.commitTransaction();
    logger.info(`Restored ${listingsToRestore.length} listings`);
  } catch (error) {
    await session.abortTransaction();
    logger.error(`Error restoring listings: ${error.message}`, { stack: error.stack });
  } finally {
    session.endSession();
  }
}

