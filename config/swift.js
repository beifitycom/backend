import dotenv from 'dotenv';
dotenv.config();

export const config = {
    apiKey: process.env.SWIFT_API_KEY, // Replace with your key
    baseUrl: 'https://swiftwallet.co.ke/v3/', // Production; use sandbox for testing
    channelId: '#000129' // Optional: From dashboard (Paybill/Till/Bank)
};
