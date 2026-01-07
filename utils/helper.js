import jwt from 'jsonwebtoken'
import { OAuth2Client } from 'google-auth-library';
import env from '../config/env.js';
import logger from '../utils/logger.js';
// Generate JWT token
export const generateToken = (id) => {
  const token = jwt.sign(
    {
      _id: id, // Match the payload structure expected by authUser
    },
    env.SECRET_KEY, // Use the same secret key as authUser
  );
  return token;
};

// Fetch Google user data
export const getUserData = async (access_token) => {
  try {
    const response = await fetch(`https://www.googleapis.com/oauth2/v3/userinfo?access_token=${access_token}`);
    if (!response.ok) {
      throw new Error(`Google API error: ${response.statusText}`);
    }
    const data = await response.json();
    logger.debug('Fetched Google user data', { email: data.email });
    return data;
  } catch (error) {
    logger.error(`Error fetching Google user data: ${error.message}`, { stack: error.stack });
    throw error;
  }
};

// Generate random 6-digit number array
export const generateRandomNumbers = () => {
  const numbers = [];
  for (let i = 0; i < 6; i++) {
    numbers.push(Math.floor(Math.random() * 9) + 1); // Generates a number between 1 and 9
  }
  return numbers;
};


export function createSlug(text) {
  return text
    .toLowerCase() // Convert to lowercase
    .replace(/[^a-z0-9\s-]/g, '') // Remove special characters (e.g., colons)
    .replace(/\s+/g, '-') // Replace spaces with hyphens
    .replace(/-+/g, '-'); // Replace multiple hyphens with a single hyphen
}



// Service fee structure data
const serviceFees = [
  { id: 1, amount_from: 1.00, amount_to: 49.00, fee_amount: 0.00, is_active: 1, created_at: "2025-07-25 11:19:47", updated_at: "2025-07-25 11:19:47" },
  { id: 2, amount_from: 50.00, amount_to: 499.00, fee_amount: 3.00, is_active: 1, created_at: "2025-07-25 11:19:47", updated_at: "2025-07-25 18:50:10" },
  { id: 3, amount_from: 500.00, amount_to: 999.00, fee_amount: 5.00, is_active: 1, created_at: "2025-07-25 11:19:47", updated_at: "2025-07-25 18:50:15" },
  { id: 4, amount_from: 1000.00, amount_to: 1499.00, fee_amount: 7.00, is_active: 1, created_at: "2025-07-25 11:19:47", updated_at: "2025-07-25 18:50:24" },
  { id: 5, amount_from: 1500.00, amount_to: 2499.00, fee_amount: 10.00, is_active: 1, created_at: "2025-07-25 11:19:47", updated_at: "2025-07-25 18:50:34" },
  { id: 6, amount_from: 2500.00, amount_to: 3499.00, fee_amount: 12.00, is_active: 1, created_at: "2025-07-25 11:19:47", updated_at: "2025-07-25 18:50:40" },
  { id: 7, amount_from: 3500.00, amount_to: 4999.00, fee_amount: 15.00, is_active: 1, created_at: "2025-07-25 11:19:47", updated_at: "2025-07-25 18:50:47" },
  { id: 8, amount_from: 5000.00, amount_to: 7499.00, fee_amount: 20.00, is_active: 1, created_at: "2025-07-25 11:19:47", updated_at: "2025-07-25 18:50:54" },
  { id: 9, amount_from: 7500.00, amount_to: 9999.00, fee_amount: 22.00, is_active: 1, created_at: "2025-07-25 11:19:47", updated_at: "2025-07-25 18:50:59" },
  { id: 10, amount_from: 10000.00, amount_to: 14999.00, fee_amount: 25.00, is_active: 1, created_at: "2025-07-25 11:19:47", updated_at: "2025-07-25 18:51:05" },
  { id: 11, amount_from: 15000.00, amount_to: 19999.00, fee_amount: 30.00, is_active: 1, created_at: "2025-07-25 11:19:47", updated_at: "2025-07-25 18:51:21" },
  { id: 12, amount_from: 20000.00, amount_to: 34999.00, fee_amount: 40.00, is_active: 1, created_at: "2025-07-25 11:19:47", updated_at: "2025-07-25 18:51:15" },
  { id: 13, amount_from: 35000.00, amount_to: 49999.00, fee_amount: 50.00, is_active: 1, created_at: "2025-07-25 11:19:47", updated_at: "2025-07-25 18:51:30" },
  { id: 14, amount_from: 50000.00, amount_to: 149999.00, fee_amount: 70.00, is_active: 1, created_at: "2025-07-25 11:19:47", updated_at: "2025-07-25 18:51:41" },
  { id: 15, amount_from: 150000.00, amount_to: 249999.00, fee_amount: 80.00, is_active: 1, created_at: "2025-07-25 11:19:47", updated_at: "2025-07-25 18:51:46" },
  { id: 16, amount_from: 250000.00, amount_to: 349999.00, fee_amount: 90.00, is_active: 1, created_at: "2025-07-25 11:19:47", updated_at: "2025-07-25 18:51:52" },
  { id: 17, amount_from: 350000.00, amount_to: 549999.00, fee_amount: 100.00, is_active: 1, created_at: "2025-07-25 11:19:47", updated_at: "2025-07-25 18:51:57" },
  { id: 18, amount_from: 550000.00, amount_to: 749999.00, fee_amount: 150.00, is_active: 1, created_at: "2025-07-25 11:19:47", updated_at: "2025-07-25 18:52:07" },
  { id: 19, amount_from: 750000.00, amount_to: 999999.00, fee_amount: 200.00, is_active: 1, created_at: "2025-07-25 11:19:47", updated_at: "2025-07-25 18:52:12" }
];

/**
 * Calculates the service fee for a given transaction amount in KES.
 * @param {number} amount - The transaction amount (must be a positive number).
 * @returns {Object} An object containing the fee amount and a formatted string representation.
 * @throws {Error} If the amount is invalid (not a positive number).
 */
export function calculateServiceFee(amount) {
  if (typeof amount !== 'number' || amount <= 0) {
    throw new Error('Please enter a valid positive amount');
  }

  let fee = 0;
  for (let feeStructure of serviceFees) {
    if (feeStructure.is_active && amount >= feeStructure.amount_from && amount <= feeStructure.amount_to) {
      fee = feeStructure.fee_amount;
      break;
    }
  }

  const formattedFee = fee === 0 ? 'FREE' : `KES ${fee.toFixed(2)}`;
  return fee
}
