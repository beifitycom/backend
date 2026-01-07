import mongoose from 'mongoose';
import dotenv from 'dotenv';
import env from './env.js';
import logger from '../utils/logger.js';
import { userModel } from '../models/User.js';

dotenv.config(); // Load environment variables

export const connectDB = async () => {
  try {
    const mongoURI = env.MONGO_DB_URL;

    if (!mongoURI) {
      throw new Error("❌ MONGO_DB_URL is not defined. Check your .env file or environment variables.");
    }

    await mongoose.connect(mongoURI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
      serverSelectionTimeoutMS: 5000,
      autoIndex: true,
    });

    // Clean up negative amounts in payoutHistory using $map to transform the array
    const result = await userModel.updateMany(
      { 'financials.payoutHistory.amount': { $lt: 0 } }, // Match documents with negatives
      [
        {
          $set: {
            financials: {
              $mergeObjects: [
                '$financials',
                {
                  payoutHistory: {
                    $map: {
                      input: '$financials.payoutHistory',
                      as: 'payout',
                      in: {
                        $mergeObjects: [
                          '$$payout',
                          {
                            amount: { $max: ['$$payout.amount', 0] }
                          }
                        ]
                      }
                    }
                  }
                }
              ]
            }
          }
        }
      ]
    );

    console.log(`Updated ${result.modifiedCount} documents with negative payout amounts set to 0.`);

    logger.info("✅ MongoDB connected successfully");
  } catch (error) {
    logger.error("❌ MongoDB connection error:", error.message);
    console.error("❌ MongoDB connection error:", error);

    if (error.message.includes("Could not connect to any servers")) {
      logger.error("🔴 Possible Fix: Ensure your IP is whitelisted in MongoDB Atlas.");
    } else if (error.message.includes("authentication failed")) {
      logger.error("🔴 Possible Fix: Check your MongoDB username/password in .env.");
    }

    process.exit(1);
  }
};