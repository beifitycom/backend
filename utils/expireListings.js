import cron from 'node-cron';
import { listingModel } from '../models/Listing';

// Example function to expire listings
async function expireListings() {
    // Logic to find and expire listings
    console.log('Expiring listings...');
    // e.g., update database records, notify users, etc.
    // const listings = await listingModel.updateMany(
    //     { status: 'active', expiryDate: { $lt: new Date() } },
    //     { $set: { status: 'expired' } }
    // );
    console.log(`Expired ${listings.nModified} listings.`);
}

// Schedule the function to run every day at midnight
cron.schedule('0 0 * * *', () => {
    expireListings();
});

module.exports = expireListings;