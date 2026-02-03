import crypto from 'crypto';
import logger from '../utils/logger.js';
import { sendEmail } from '../utils/sendEmail.js';
import sanitizeHtml from 'sanitize-html';
import { userModel } from '../models/User.js';
import { orderModel } from '../models/Order.js';
import { TransactionModel } from '../models/Transaction.js';
import mongoose from 'mongoose';
import {
  generateRefundEmail,
  generatePayoutNotificationEmail,
  generateTransactionReversalEmail,
  generateOrderEmailBuyer,
  generateOrderEmailSeller,
  generateOrderEmailAdmin,  // Added missing import
} from '../utils/Templates.js';
import axios from 'axios';
import { platform } from 'os';
import { sendNotification } from './notificationController.js';
import { calculateServiceFee } from '../utils/helper.js';
import { listingModel } from '../models/Listing.js';

// Manual SWIFT API test function (can be called from console)
export const manualSwiftTest = async (reference) => {
  console.log(`\n=== MANUAL SWIFT API TEST for ${reference} ===`);

  try {
    const response = await fetch('https://swiftwallet.co.ke/v3/transactions/', {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${process.env.SWIFT_API_KEY}`,
        'Content-Type': 'application/json'
      }
    });

    const data = await response.json();
    console.log('Raw SWIFT API response:', JSON.stringify(data, null, 2));

    // Look for the specific transaction - SWIFT API structure: { success: true, data: { transactions: [...] } }
    let transactions = [];
    if (data && data.success && data.data && Array.isArray(data.data.transactions)) {
      transactions = data.data.transactions;
    } else if (data && data.success && Array.isArray(data.transactions)) {
      transactions = data.transactions;
    } else if (Array.isArray(data)) {
      transactions = data;
    } else if (data && Array.isArray(data.data)) {
      transactions = data.data;
    }

    console.log(`Found ${transactions.length} transactions in response`);

    const ourTransaction = transactions.find(tx => tx.external_reference === reference);
    if (ourTransaction) {
      console.log('✅ Found our transaction:', JSON.stringify(ourTransaction, null, 2));
      console.log(`Status: ${ourTransaction.status}`);
      console.log(`Amount: ${ourTransaction.amount}`);
      console.log(`Transaction Date: ${ourTransaction.transaction_date}`);
      console.log(`Processed At: ${ourTransaction.processed_at}`);
      console.log(`Is completed: ${ourTransaction.status === 'completed' || ourTransaction.status === 'success'}`);
      console.log(`M-Pesa Receipt: ${ourTransaction.mpesa_receipt_number}`);
    } else {
      console.log(`❌ Transaction with reference ${reference} not found in SWIFT response`);
      console.log('Sample external_references found:', transactions.slice(0, 5).map(tx => tx.external_reference).filter(Boolean));
      console.log('All statuses found:', [...new Set(transactions.map(tx => tx.status))]);
    }

    return { success: true, data, ourTransaction };

  } catch (error) {
    console.error('Manual SWIFT test error:', error);
    return { success: false, error: error.message };
  }
};

const FRONTEND_URL = process.env.FRONTEND_URL || 'https://www.beifity.com';
const commissionRate = parseFloat(process.env.COMMISSION_RATE || '0'); // 5% platform commission

// SWIFT API v3 configuration - Always use v3 endpoint
const SWIFT_BASE_URL = 'https://swiftwallet.co.ke/v3/';
const swift = axios.create({
  baseURL: SWIFT_BASE_URL, // Force v3 API - don't allow env override to old v2
  headers: { 
    'Authorization': `Bearer ${process.env.SWIFT_API_KEY}`,
    'Content-Type': 'application/json',
  },
});

logger.info('SWIFT API configured', { baseURL: SWIFT_BASE_URL, endpoint: '/stk-initiate/' });

// Utility function for retry logic
const withRetry = async (fn, maxRetries, description) => {
  let attempt = 1;
  while (attempt <= maxRetries) {
    try {
      return await fn();
    } catch (error) {
      logger.warn(`${description} attempt ${attempt} failed: ${error.message}`, {
        statusCode: error.response?.status,
        response: error.response?.data,
      });
      if (attempt === maxRetries) throw error;
      attempt++;
      await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
    }
  }
};

// Utility for transaction retries (add this to swiftController.js if not already present)
const withTransactionRetry = async (fn, maxRetries = 5, operationName = 'webhook transaction') => {
  let attempt = 1;
  while (attempt <= maxRetries) {
    const session = await mongoose.startSession({ defaultTransactionOptions: { timeout: 40000 } });
    let transactionCommitted = false;
    session.startTransaction();
    try {
      const result = await fn(session);
      await session.commitTransaction();
      transactionCommitted = true;
      logger.info(`${operationName} succeeded on attempt ${attempt}`);
      session.endSession();
      return result;
    } catch (error) {
      if (!transactionCommitted) {
        await session.abortTransaction();
      }
      session.endSession();

      // Check for retryable WriteConflict or TransientTransactionError
      if (error.name === 'MongoServerError' && 
          (error.code === 112 || error.errorLabels?.includes('TransientTransactionError'))) {
        logger.warn(`${operationName} failed with WriteConflict on attempt ${attempt}: ${error.message}. Retrying...`, { 
          error: error.message, 
          attempt,
          maxRetries 
        });
        if (attempt === maxRetries) {
          logger.error(`${operationName} failed after ${maxRetries} retries`, { error: error.message });
          throw error;
        }
        // Exponential backoff
        await new Promise(resolve => setTimeout(resolve, 100 * Math.pow(2, attempt - 1)));
        attempt++;
      } else {
        // Non-retryable error
        logger.error(`${operationName} failed (non-retryable): ${error.message}`, { stack: error.stack });
        throw error;
      }
    }
  }
};

// Initialize Payment (SWIFT STK Push)
// Initialize Payment (SWIFT STK Push)
export const initializePayment = async (orderIdObj, session, email, deliveryFee, phone) => {
  try {
    const order = await orderModel.findById(orderIdObj).session(session).populate('customerId', 'personalInfo.phone personalInfo.mobileMoneyDetails');
    if (!order) {
      logger.error(`Order not found for payment initialization`, { orderId: orderIdObj });
      throw new Error('Order not found');
    }
    if (!order.items || !Array.isArray(order.items)) {
      logger.error(`Order items missing or invalid`, { orderId: orderIdObj });
      throw new Error('Order items are missing or invalid');
    }

    // Calculate item total excluding cancelled items
    const itemTotal = order.items
      .filter(item => !item.cancelled)
      .reduce((sum, item) => sum + item.price * item.quantity, 0);
    if (Math.abs(order.totalAmount - (itemTotal + deliveryFee)) > 0.01) {
      logger.error(`Total amount mismatch. Expected ${itemTotal + deliveryFee}, got ${order.totalAmount}`, { orderId: orderIdObj });
      throw new Error('Total amount does not match item prices plus delivery fee');
    }

    // Get buyer's phone for STK Push
    let buyerPhone = order.customerId.personalInfo.mobileMoneyDetails?.phoneNumber || order.customerId.personalInfo.phone;
    if (!buyerPhone) {
      logger.error(`Buyer phone not found for payment`, { orderId: orderIdObj, customerId: order.customerId._id });
      throw new Error('Buyer phone number required for M-Pesa payment');
    }

    // Normalize phone number for SWIFT API (accepts: 0798765432 or 254798765432)
    // Frontend sends: +254114672193
    // Convert to string and remove any spaces/dashes
    const rawPhone = (phone || buyerPhone).toString().trim().replace(/[\s-]/g, '');
    let finalPhone = rawPhone;
    
    // Always convert to 0 format for SWIFT API (preferred format)
    // Handle +254 format from frontend (+254114672193 -> 0114672193)
    if (rawPhone.startsWith('+254')) {
      // Remove + and convert to 0 format: +254114672193 -> 0114672193
      finalPhone = '0' + rawPhone.substring(4); // Skip '+254' (4 chars), take rest (9 digits)
    }
    // Handle 254 format (254114672193 -> 0114672193)
    else if (rawPhone.startsWith('254')) {
      // Convert to 0 format: 254114672193 -> 0114672193
      finalPhone = '0' + rawPhone.substring(3); // Skip '254' (3 chars), take rest (9 digits)
    }
    // If phone already starts with 0, validate and use as is (07114672193 or 0114672193)
    else if (rawPhone.startsWith('0') && rawPhone.length === 10) {
      finalPhone = rawPhone;
    }
    // If phone doesn't match expected patterns, try to fix
    else if (rawPhone.length >= 9) {
      // Try to extract the last 9 digits and prepend 0
      const last9Digits = rawPhone.slice(-9);
      finalPhone = '0' + last9Digits;
    }
    
    logger.info('Phone normalization:', { 
      input: phone || buyerPhone, 
      rawPhone, 
      finalPhone,
      length: finalPhone.length 
    });


    // Validate phone format (SWIFT API accepts: 0798765432 or 254798765432)
    // Kenyan mobile numbers: 0 followed by 7 or 1, then 8 digits = 10 digits total
    // Example: 07114672193 (0 + 7 + 114672193) or 0114672193 (0 + 1 + 14672193)
    const phoneRegex = /^0[17]\d{8}$/; // 0 followed by 7 or 1, then exactly 8 digits
    if (!phoneRegex.test(finalPhone)) {
      // If 0 format doesn't work, try 254 format as fallback
      const phoneRegex254 = /^254[17]\d{8}$/;
      if (phoneRegex254.test(rawPhone)) {
        finalPhone = rawPhone; // Use 254 format if valid
        logger.warn(`Using 254 format for phone (0 format validation failed): ${finalPhone}`, { orderId: order.orderId });
      } else {
        throw new Error(`Invalid phone format: ${rawPhone} (normalized: ${finalPhone}). Expected format: +254XXXXXXXXX, 254XXXXXXXXX, or 07XXXXXXXX.`);
      }
    }
    
    logger.info(`Phone number normalized successfully`, { 
      original: phone || buyerPhone, 
      normalized: finalPhone,
      format: finalPhone.startsWith('0') ? '0-format' : '254-format'
    });

    // Create Transaction (pre-save hook will calculate fees/shares)
    const transaction = new TransactionModel({
      orderId: order.orderId,  // Use string orderId
      totalAmount: order.totalAmount,
      swiftServiceFee: calculateServiceFee(order.totalAmount),
      deliveryFee,
      swiftReference: `PENDING-${Date.now()}`,  // Temporary; update after API response
      items: order.items
        .filter(item => !item.cancelled)
        .map(item => ({
          itemId: item._id,  // Reference to order item's _id
          sellerId: item.sellerId,
          itemAmount: item.price * item.quantity,
          cancelled: false,  // ADDED: Explicit for consistency
          // Placeholders; pre-save hook fills platformCommission, sellerShare, etc.
          platformCommission: 0,
          sellerShare: 0,
          transferFee: 0,
          netCommission: 0,
          owedAmount: 0,
          payoutStatus: 'manual_pending',
          deliveryConfirmed: false,
          refundStatus: 'none',
          refundedAmount: 0,
          returnStatus: 'none',
        })),
      status: 'pending',  // Initial status
      paymentMethod: 'M-Pesa',
    });

    // Save transaction temporarily
    await transaction.save({ session });

    // Link transaction to order
    await orderModel.findByIdAndUpdate(orderIdObj, { transactionId: transaction._id }, { session });

    // Prepare SWIFT API payload (v3 STK Push API)
    // Ensure phone is in correct format (prefer 0 format: 07114672193)
    const phoneForAPI = finalPhone.startsWith('0') ? finalPhone : ('0' + finalPhone.substring(3));
    
    logger.info('Preparing SWIFT STK Push payload', {
      orderId: order.orderId,
      amount: Math.round(order.totalAmount),
      phone_number: phoneForAPI,
      endpoint: '/stk-initiate/',
      baseURL: SWIFT_BASE_URL
    });

    console.log('Swift Payload:', swiftPayload);

    const swiftPayload = {
      amount: Math.round(order.totalAmount),  // Integer KES
      phone_number: phoneForAPI,  // Always use 0 format: 07114672193
      external_reference: `ORDER-${order.orderId}`,  // Optional: External reference for tracking
      callback_url: `${process.env.DOMAIN || 'https://beifity-com-backend.onrender.com'}/api/payments/webhook/swift`,
    };

    // Add optional channel_id if available (must be integer)
    if (process.env.SWIFT_CHANNEL_ID) {
      const channelId = parseInt(process.env.SWIFT_CHANNEL_ID);
      if (!isNaN(channelId)) {
        swiftPayload.channel_id = channelId;
      }
    }
    
    // Add optional customer name if available
    if (order.customerId?.personalInfo?.fullname) {
      swiftPayload.customer_name = order.customerId.personalInfo.fullname;
    }

    // Call SWIFT API - Use v3 STK Push endpoint
    const response = await withRetry(
      () => swift.post('/stk-initiate/', swiftPayload),
      3,
      `Initialize SWIFT payment for order ${order.orderId}`
    );

    const swiftData = response.data;
    console.log('SWIFT STK Init Response:', JSON.stringify(swiftData, null, 2));  // Debug log

    if (!swiftData.success) {
      // Rollback on failure
      await transaction.deleteOne({ session });
      await orderModel.findByIdAndUpdate(orderIdObj, { $unset: { transactionId: '' } }, { session });
      logger.error(`SWIFT payment initialization failed: ${swiftData.message}`, { 
        orderId: order.orderId, 
        status: swiftData.status,
        response: swiftData 
      });
      throw new Error(swiftData.message || 'Payment initiation failed');
    }

    // Update transaction with real reference and status
    // API response structure: { success: true, status: "INITIATED", reference, transaction_id, checkout_request_id, merchant_request_id }
    // Use reference (which is the external_reference we sent) or fallback to transaction_id
    transaction.swiftReference = swiftData.reference || swiftData.external_reference || `TX-${swiftData.transaction_id}` || transaction.swiftReference;
    transaction.status = 'swift_initiated';
    
    // Store additional transaction details if available
    if (swiftData.transaction_id) {
      transaction.swiftTransactionId = swiftData.transaction_id.toString();
    }
    if (swiftData.checkout_request_id) {
      transaction.swiftCheckoutRequestId = swiftData.checkout_request_id;
    }
    if (swiftData.merchant_request_id) {
      transaction.swiftMerchantRequestId = swiftData.merchant_request_id;
    }
    await transaction.save({ session });

    logger.info(`SWIFT STK Push initialized for order ${order.orderId}`, { 
      swiftReference: transaction.swiftReference,
      transactionId: swiftData.transaction_id,
      status: swiftData.status,
      message: swiftData.message
    });
    return {
      error: false,
      authorization_url: null,  // STK Push has no URL
      reference: transaction.swiftReference,
    };
  } catch (error) {
    console.log('Payment init error:', error);
    // Provide clearer error message for 404 errors
    if (error.response?.status === 404) {
      const errorMsg = `SWIFT API endpoint not found. Please verify the payment endpoint is correct. Status: ${error.response.status}`;
      logger.error(`Error initializing payment: ${errorMsg}`, { 
        stack: error.stack, 
        orderId: orderIdObj,
        url: error.config?.url,
        baseURL: error.config?.baseURL
      });
      return { error: true, message: errorMsg };
    }
    logger.error(`Error initializing payment: ${error.message}`, { stack: error.stack, orderId: orderIdObj });
    return { error: true, message: error.message };
  }
};
// Helper function to process payment completion (simplified version for verification updates)
const processPaymentCompletion = async (transaction, order, session) => {
  try {
    logger.info(`Processing payment completion for transaction ${transaction.swiftReference}`);

    // Populate order with necessary data
    await order.populate('customerId items.sellerId');

    const itemsTotal = transaction.items.reduce((sum, item) => sum + (item.itemAmount || 0), 0);
    const commissionRate = parseFloat(process.env.COMMISSION_RATE || '0');

    // Recalculate shares and commissions
    for (const transactionItem of transaction.items.filter(item => !(item.cancelled ?? false))) {
      const itemAmount = transactionItem.itemAmount || 0;
      const proratedCommission = itemsTotal > 0 ? (itemAmount / itemsTotal) * (itemsTotal * commissionRate) : 0;
      transactionItem.platformCommission = proratedCommission;
      transactionItem.sellerShare = itemsTotal > 0 ? (itemAmount / itemsTotal) * (itemsTotal - transaction.swiftServiceFee - (itemsTotal * commissionRate)) : 0;
      transactionItem.transferFee = 0;
      transactionItem.netCommission = proratedCommission;
      transactionItem.owedAmount = transactionItem.sellerShare;
    }

    await transaction.save({ session });

    // Update platform balance
    const totalPlatformCommission = transaction.items.reduce((sum, item) => sum + item.platformCommission, 0);
    const platformBalance = transaction.swiftServiceFee + transaction.deliveryFee + totalPlatformCommission;

    const admin = await userModel.findOne({ 'personalInfo.isAdmin': true }).session(session);
    if (admin) {
      await userModel.findByIdAndUpdate(
        admin._id,
        { $inc: { 'financials.balance': platformBalance } },
        { session }
      );
      logger.info(`Platform balance updated: +KES ${platformBalance} for verified transaction ${transaction.swiftReference}`);
    }

    // Group sellers and update their balances
    const sellerGroups = {};
    for (const txItem of transaction.items.filter(item => !item.cancelled)) {
      const sellerIdStr = txItem.sellerId.toString();
      if (!sellerGroups[sellerIdStr]) {
        sellerGroups[sellerIdStr] = { sellerId: txItem.sellerId, totalShare: 0, items: [] };
      }
      sellerGroups[sellerIdStr].totalShare += txItem.sellerShare;
      sellerGroups[sellerIdStr].items.push(txItem);
    }

    for (const [sellerIdStr, group] of Object.entries(sellerGroups)) {
      await userModel.findByIdAndUpdate(
        group.sellerId,
        {
          $inc: {
            'financials.balance': group.totalShare,
            'analytics.salesCount': group.items.length,
            'analytics.totalSales.amount': group.totalShare,
          }
        },
        { session }
      );
      logger.info(`Seller ${sellerIdStr} balance updated: +KES ${group.totalShare} for verified transaction ${transaction.swiftReference}`);
    }

    // Update buyer and seller stats
    await userModel.updateOne(
      { _id: order.customerId._id },
      { $inc: { 'stats.pendingOrdersCount': -1 } },
      { session }
    );

    for (const sellerId of [...new Set(order.items.filter(i => !i.cancelled).map(i => i.sellerId))]) {
      await userModel.updateOne(
        { _id: sellerId },
        { $inc: { 'stats.pendingOrdersCount': -1 } },
        { session }
      );
    }

    logger.info(`Payment completion processing finished for transaction ${transaction.swiftReference}`);
  } catch (error) {
    logger.error(`Error processing payment completion for ${transaction.swiftReference}: ${error.message}`, { stack: error.stack });
    // Don't throw - we want verification to succeed even if some post-processing fails
  }
};

// Verify Transaction (for polling; real confirmation via webhook)
export const verifyTransaction = async (reference) => {
  const session = await mongoose.startSession();
  let committed = false;
  session.startTransaction();
  try {
    if (!reference || typeof reference !== 'string') {
      logger.error(`Invalid transaction reference`, { reference });
      throw new Error('Invalid transaction reference');
    }

    const existingTransaction = await TransactionModel.findOne({ swiftReference: reference }).session(session);
    if (!existingTransaction) {
      logger.warn(`Transaction not found in database`, { reference });
      throw new Error('Transaction not found in database');
    }

    if (existingTransaction.status === 'completed') {
      logger.info(`Transaction ${reference} already verified`, { reference });
      await session.commitTransaction();
      committed = true;
      return {
        error: false,
        data: {
          status: existingTransaction.status,
          amount: existingTransaction.totalAmount,
          paymentMethod: existingTransaction.paymentMethod,
          paidAt: existingTransaction.paidAt,
        },
      };
    }

    // For SWIFT: If not completed locally, check with SWIFT API
    logger.info(`Transaction ${reference} not completed locally, checking with SWIFT API`, { reference, currentStatus: existingTransaction.status });

    // Commit current transaction first since we're done with DB read
    await session.commitTransaction();
    committed = true;
    session.endSession();

    // Check with SWIFT API
    try {
      console.log(`Checking SWIFT API for reference: ${reference}`);

      // SWIFT API - use the exact same call that worked for the user
      const swiftResponse = await withRetry(
        async () => {
          const response = await fetch('https://swiftwallet.co.ke/v3/transactions/', {
            method: 'GET',
            headers: {
              'Authorization': 'Bearer sw_f451ace91b204841269a03acd7df428a635b98fc44d49d54af5aa8b3',
              'Content-Type': 'application/json'
            }
          });

          if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
          }

          return response.json();
        },
        3,
        `Verify transaction status with SWIFT API for ${reference}`
      );

      const swiftData = swiftResponse;
      console.log('SWIFT API verification response:', JSON.stringify(swiftData, null, 2));

      // Check various possible response structures
      let swiftTransaction = null;
      let allTransactions = [];

      // Structure 1: { success: true, data: { transactions: [...] } } - This is the correct one based on your response
      if (swiftData && swiftData.success && swiftData.data && Array.isArray(swiftData.data.transactions)) {
        allTransactions = swiftData.data.transactions;
        swiftTransaction = allTransactions.find(tx => tx.external_reference === reference);
      }
      // Structure 2: { success: true, transactions: [...] }
      else if (swiftData && swiftData.success && Array.isArray(swiftData.transactions)) {
        allTransactions = swiftData.transactions;
        swiftTransaction = allTransactions.find(tx => tx.external_reference === reference);
      }
      // Structure 3: Direct array response
      else if (Array.isArray(swiftData)) {
        allTransactions = swiftData;
        swiftTransaction = allTransactions.find(tx => tx.external_reference === reference);
      }
      // Structure 4: { data: [...] }
      else if (swiftData && Array.isArray(swiftData.data)) {
        allTransactions = swiftData.data;
        swiftTransaction = allTransactions.find(tx => tx.external_reference === reference);
      }

      console.log(`Found ${allTransactions.length} transactions from SWIFT API`);
      console.log(`Transaction ${reference} found:`, !!swiftTransaction);

      console.log('Found SWIFT transaction:', swiftTransaction);

      if (swiftTransaction && (swiftTransaction.status === 'completed' || swiftTransaction.status === 'success')) {
        logger.info(`Transaction ${reference} confirmed as completed by SWIFT API, updating local database`, {
          reference,
          swiftStatus: swiftTransaction.status,
          swiftAmount: swiftTransaction.amount,
          swiftTransaction: JSON.stringify(swiftTransaction, null, 2)
        });

        // Update local database to mark as completed
        const updateSession = await mongoose.startSession();
        updateSession.startTransaction();

        try {
          // Extract completion timestamp - SWIFT API uses processed_at and transaction_date
          let paidAt = new Date();
          if (swiftTransaction.processed_at) {
            paidAt = new Date(swiftTransaction.processed_at);
          } else if (swiftTransaction.transaction_date) {
            paidAt = new Date(swiftTransaction.transaction_date);
          } else if (swiftTransaction.created_at) {
            paidAt = new Date(swiftTransaction.created_at);
          } else if (swiftTransaction.updated_at) {
            paidAt = new Date(swiftTransaction.updated_at);
          }

          // Update transaction status
          const updatedTransaction = await TransactionModel.findOneAndUpdate(
            { swiftReference: reference },
            {
              status: 'completed',
              paidAt: paidAt,
              swiftServiceFee: swiftTransaction.fee || swiftTransaction.service_fee || existingTransaction.swiftServiceFee
            },
            { session: updateSession, new: true }
          );

          if (updatedTransaction) {
            // Update order status
            const orderUpdate = await orderModel.findOneAndUpdate(
              { orderId: updatedTransaction.orderId },
              { status: 'paid' },
              { session: updateSession }
            );

            if (orderUpdate) {
              logger.info(`Successfully updated local database for transaction ${reference} based on SWIFT confirmation`);

              // Process the payment completion logic (similar to webhook but simplified)
              await processPaymentCompletion(updatedTransaction, orderUpdate, updateSession);
            }
          }

          await updateSession.commitTransaction();
          updateSession.endSession();

          return {
            error: false,
            data: {
              status: 'completed',
              amount: existingTransaction.totalAmount,
              paymentMethod: existingTransaction.paymentMethod,
              paidAt: paidAt,
              confirmedBySwift: true
            },
          };
        } catch (updateError) {
          await updateSession.abortTransaction();
          updateSession.endSession();
          logger.error(`Failed to update local database for SWIFT-confirmed transaction ${reference}: ${updateError.message}`);
          throw updateError;
        }
      } else {
        logger.info(`Transaction ${reference} still pending according to SWIFT API`, {
          reference,
          swiftStatus: swiftTransaction?.status || 'not found'
        });
      }
    } catch (swiftError) {
      logger.error(`Error checking transaction status with SWIFT API for ${reference}: ${swiftError.message}`);
      // Continue with local pending status if SWIFT check fails
    }

    // Return pending if SWIFT didn't confirm completion or API failed
    return {
      error: false,
      data: {
        status: 'pending',
        amount: existingTransaction.totalAmount,
        paymentMethod: existingTransaction.paymentMethod,
        paidAt: null,
      },
    };

  } catch (error) {
    if (!committed) {
      await session.abortTransaction();
      logger.info(`Transaction aborted for verification`, { reference });
    }
    logger.error(`Error verifying transaction: ${error.message}`, { stack: error.stack, reference });
    return { error: true, message: error.message };
  } finally {
    if (!committed) {
      session.endSession();
    }
  }
};

// Manual SWIFT API Test Endpoint (for debugging)
export const testSwiftApi = async (req, res) => {
  try {
    const { reference } = req.params;

    if (!reference) {
      return res.status(400).json({ error: true, message: 'Reference is required' });
    }

    console.log(`Testing SWIFT API for reference: ${reference}`);

    // Test the SWIFT API call - use exact same call that worked for user
    const swiftResponse = await withRetry(
      async () => {
        const response = await fetch('https://swiftwallet.co.ke/v3/transactions/', {
          method: 'GET',
          headers: {
            'Authorization': 'Bearer sw_f451ace91b204841269a03acd7df428a635b98fc44d49d54af5aa8b3',
            'Content-Type': 'application/json'
          }
        });

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        return response.json();
      },
      3,
      `Test SWIFT API for ${reference}`
    );

    const swiftData = swiftResponse;
    console.log('SWIFT API raw response:', JSON.stringify(swiftData, null, 2));

    // Try to find the transaction
    let swiftTransaction = null;

    // Check various response structures
    if (swiftData && swiftData.success && swiftData.data && Array.isArray(swiftData.data.transactions)) {
      swiftTransaction = swiftData.data.transactions.find(tx => tx.external_reference === reference);
    } else if (swiftData && swiftData.success && Array.isArray(swiftData.transactions)) {
      swiftTransaction = swiftData.transactions.find(tx => tx.external_reference === reference);
    } else if (Array.isArray(swiftData)) {
      swiftTransaction = swiftData.find(tx => tx.external_reference === reference);
    } else if (swiftData && Array.isArray(swiftData.data)) {
      swiftTransaction = swiftData.data.find(tx => tx.external_reference === reference);
    }

    return res.status(200).json({
      success: true,
      reference,
      swiftResponse: swiftData,
      foundTransaction: swiftTransaction,
      transactionStatus: swiftTransaction?.status,
      isCompleted: swiftTransaction && (swiftTransaction.status === 'completed' || swiftTransaction.status === 'success')
    });

  } catch (error) {
    console.error('SWIFT API test error:', error);
    logger.error(`SWIFT API test error for ${req.params.reference}: ${error.message}`, { stack: error.stack });
    return res.status(500).json({ success: false, message: error.message });
  }
};

// Verify Transactions Endpoint
export const verifyTransactions = async (req, res) => {
  try {
    const { reference } = req.params;
    if (!reference) {
      logger.error(`No reference provided in verify request`, { query: req.query });
      return res.status(400).json({ error: true, message: 'Reference is required' });
    }

    const result = await verifyTransaction(reference);
    if (result.error) {
      return res.status(400).json({ error: true, message: result.message });
    }

    logger.info(`Transaction verified successfully via endpoint`, { reference });
    return res.status(200).json({ success: true, data: result.data });
  } catch (error) {
    console.log('Verify endpoint error:', error);
    logger.error(`Error in verifyTransactions endpoint: ${error.message}`, { stack: error.stack, reference: req.params.reference });
    return res.status(500).json({ success: false, message: 'Server error' });
  }
};

// Initiate Refund (Manual - no API)
export const initiateRefund = async (orderId, itemId, session) => {
  try {
    logger.info("Started the manual refund process", { orderId, itemId });
    const order = await orderModel.findById(orderId).session(session).populate('items.sellerId customerId');
    const transaction = await TransactionModel.findOne({ orderId: order.orderId }).session(session);
    if (!order || !transaction) {
      logger.error(`Order or transaction not found for refund`, { orderId, itemId });
      throw new Error('Order or transaction not found');
    }

    const item = order.items.find(i => i.productId === itemId);
    if (!item) {
      logger.error(`Item not found or not cancelled`, { orderId, itemId });
      throw new Error('Item not found or not cancelled');
    }

    const transactionItem = transaction.items.find(i => i.itemId.toString() === item._id.toString());
    if (!transactionItem) {
      logger.error(`Transaction item not found`, { orderId, itemId });
      throw new Error('Transaction item not found');
    }

    if (transactionItem.refundStatus !== 'none') {
      logger.warn(`Refund already processed or in progress for item`, { orderId, itemId, refundStatus: transactionItem.refundStatus });
      return { error: false, message: `Refund already ${transactionItem.refundStatus}` };
    }

    // Manual: Mark as pending, deduct balances, notify "as soon as possible"
    transactionItem.refundStatus = 'pending';
    transactionItem.refundedAmount = transactionItem.itemAmount;
    item.refundStatus = 'pending';
    item.refundedAmount = transactionItem.itemAmount;
    await transaction.save({ session });
    await order.save({ session });

    const sellerShare = transactionItem.sellerShare;
    await userModel.findByIdAndUpdate(
      transactionItem.sellerId,
      {
        $inc: { 'financials.balance': -sellerShare },
        $push: {
          'financials.payoutHistory': {
            amount: -sellerShare,
            method: 'M-Pesa',
            status: 'manual_refund_pending',
          },
        },
      },
      { session }
    );
    logger.info(`Seller ${transactionItem.sellerId} balance updated: -KES ${sellerShare} (manual refund pending)`, { orderId, itemId });

    const platformShare = (transactionItem.itemAmount / transaction.totalAmount) * (transaction.swiftServiceFee + transaction.deliveryFee + (transactionItem.itemAmount * commissionRate));
    await userModel.findOneAndUpdate(
      { 'personalInfo.isAdmin': true },
      { $inc: { 'financials.balance': -platformShare } },
      { session }
    );
    logger.info(`Admin balance updated: -KES ${platformShare} (manual refund)`, { orderId, itemId });

    const isFullRefund = order.items.every(i => i.refundStatus === 'pending' || i.refundStatus === 'completed');
    const buyer = order.customerId;
    if (buyer && buyer.personalInfo?.email) {
      const emailContent = generateRefundEmail(
        buyer.personalInfo.fullname || 'Customer',
        item.name,
        order.orderId,
        transactionItem.itemAmount,
        isFullRefund,
        'buyer',
        transactionItem.sellerId.toString()
      );
      const emailSent = await sendEmail(
        buyer.personalInfo.email,
        'Refund Initiated - BeiFity.Com',
        emailContent.replace('has been initiated', 'has been initiated manually and will be processed as soon as possible')
      );
      if (!emailSent) {
        logger.warn(`Failed to send refund email to buyer ${buyer._id}`, { orderId, itemId });
      } else {
        logger.info(`Manual refund email sent to buyer ${buyer._id}`, { orderId, itemId });
      }
    }

    const buyerNotificationContent = `A ${isFullRefund ? 'full' : 'partial'} refund of KES ${transactionItem.itemAmount.toFixed(2)} for item "${sanitizeHtml(item.name)}" (Order ID: ${sanitizeHtml(order.orderId)}) has been initiated manually and will be processed as soon as possible.`;
    try {
      await sendNotification(
        buyer._id.toString(),
        'refund',
        buyerNotificationContent,
        transactionItem.sellerId.toString(),
        session
      );
      logger.info(`Manual refund notification created for buyer ${buyer._id}`, { orderId, itemId });
    } catch (notificationError) {
      logger.warn(`Failed to create refund notification for buyer ${buyer._id}: ${notificationError.message}`, { orderId, itemId });
    }

    const seller = item.sellerId;
    if (seller && seller.personalInfo?.email) {
      const sellerEmailContent = generateRefundEmail(
        seller.personalInfo.fullname || 'Seller',
        item.name,
        order.orderId,
        transactionItem.itemAmount,
        isFullRefund,
        'seller',
        buyer._id.toString()
      );
      const sellerEmailSent = await sendEmail(
        seller.personalInfo.email,
        'Order Item Refund Notification - BeiFity.Com',
        sellerEmailContent.replace('has been initiated', 'has been initiated manually and will be processed as soon as possible')
      );
      if (!sellerEmailSent) {
        logger.warn(`Failed to send refund email to seller ${seller._id}`, { orderId, itemId });
      } else {
        logger.info(`Manual refund email sent to seller ${seller._id}`, { orderId, itemId });
      }
    }

    const sellerNotificationContent = `The buyer cancelled item "${sanitizeHtml(item.name)}" (Order ID: ${sanitizeHtml(order.orderId)}). KES ${sellerShare.toFixed(2)} has been deducted from your pending balance as part of the ${isFullRefund ? 'full' : 'partial'} manual refund, which will be processed as soon as possible.`;
    try {
      await sendNotification(
        seller._id.toString(),
        'refund',
        sellerNotificationContent,
        buyer._id.toString(),
        session
      );
      logger.info(`Manual refund notification created for seller ${seller._id}`, { orderId, itemId });
    } catch (notificationError) {
      logger.warn(`Failed to create refund notification for seller ${seller._id}: ${notificationError.message}`, { orderId, itemId });
    }

    return { error: false, message: `Manual refund initiated successfully (${isFullRefund ? 'full' : 'partial'}). Will be processed as soon as possible.` };
  } catch (error) {
    logger.error(`Error initiating manual refund: ${error.message}`, { stack: error.stack, orderId, itemId });
    return { error: true, message: error.message };
  }
};

// Initiate Payout (Manual - no API)
export const initiatePayout = async (transactionId, itemId, session) => {
  try {
    const transaction = await TransactionModel.findById(transactionId).session(session);
    if (!transaction) {
      logger.error(`Transaction not found for payout`, { transactionId, itemId });
      throw new Error('Transaction not found');
    }

    const order = await orderModel.findOne({ orderId: transaction.orderId }).session(session).populate('items.sellerId');
    if (!order) {
      logger.error(`Order not found for payout`, { transactionId, itemId });
      throw new Error('Order not found');
    }

    const transactionItem = transaction.items.find(i => i.itemId.toString() === itemId.toString());
    if (!transactionItem) {
      logger.error(`Transaction item not found for payout`, { transactionId, itemId });
      throw new Error('Transaction item not found');
    }

    if (transactionItem.payoutStatus !== 'manual_pending') {
      logger.warn(`Payout already processed or in progress`, { transactionId, itemId, payoutStatus: transactionItem.payoutStatus });
      return { error: false, message: `Payout already ${transactionItem.payoutStatus}` };
    }

    const sellerId = transactionItem.sellerId.toString();
    const seller = await userModel.findById(sellerId).session(session);
    if (!seller) {
      logger.error(`Seller not found for payout`, { transactionId, itemId, sellerId });
      throw new Error('Seller not found');
    }

    const sellerItems = transaction.items.filter(
      i => i.sellerId.toString() === sellerId && i.payoutStatus === 'manual_pending' && order.items.find(oi => oi._id.toString() === i.itemId.toString()).status === 'delivered'
    );
    const totalPayoutAmount = sellerItems.reduce((sum, item) => sum + item.owedAmount, 0);

    if (totalPayoutAmount <= 0) {
      logger.error(`Invalid total payout amount`, { transactionId, sellerId, totalPayoutAmount });
      throw new Error('Invalid total payout amount');
    }

    // Find admin
    const admin = await userModel.findOne({ 'personalInfo.isAdmin': true }).session(session);
    if (!admin) {
      logger.error(`Admin not found for payout deduction`, { transactionId, itemId });
      throw new Error('Admin not found');
    }

    // Manual: Mark as transferred
    for (const item of sellerItems) {
      item.payoutStatus = 'transferred';
      item.swiftPayoutReference = `MANUAL-${Date.now()}-${sellerId}`; // Track manual
    }
    await transaction.save({ session });

    // Deduct from admin's balance (platform paying out)
    await userModel.findByIdAndUpdate(
      admin._id,
      { $inc: { 'financials.balance': -totalPayoutAmount } },
      { session }
    );
    logger.info(`Admin balance deducted: -KES ${totalPayoutAmount} for manual payout`, { transactionId, itemId });

    // Push to admin's payoutHistory as outgoing (negative amount)
    await userModel.findByIdAndUpdate(
      admin._id,
      {
        $push: {
          'financials.payoutHistory': {
            amount: -totalPayoutAmount,
            date: new Date(),
            method: 'M-Pesa',
            status: 'completed',
          },
        },
      },
      { session }
    );
    logger.info(`Outgoing payout recorded in admin history: -KES ${totalPayoutAmount}`, { transactionId, itemId });

    // Push to seller's payoutHistory ONLY (no $inc balance—already added on payment)
    await userModel.findByIdAndUpdate(
      sellerId,
      {
        $push: {
          'financials.payoutHistory': {
            amount: totalPayoutAmount,
            date: new Date(),
            method: 'M-Pesa',
            status: 'completed',
          },
        },
      },
      { session }
    );

    // Notify and email seller
    if (seller && seller.personalInfo?.email) {
      const emailContent = generatePayoutNotificationEmail(
        seller.personalInfo.fullname || 'Seller',
        transaction.orderId,
        totalPayoutAmount,
        sellerItems.map(i => i.itemId.toString()),
        `MANUAL-${Date.now()}-${sellerId}`
      );
      const emailSent = await sendEmail(
        seller.personalInfo.email,
        'Payout Processed - BeiFity.Com',
        emailContent.replace('Initiated', 'Processed Manually')
      );
      if (!emailSent) {
        logger.warn(`Failed to send payout notification email to seller ${seller._id}`, { transactionId, itemId });
      } else {
        logger.info(`Manual payout email sent to seller ${seller._id}`, { transactionId, itemId });
      }
    }

    const sellerNotificationContent = `A manual payout of KES ${totalPayoutAmount.toFixed(2)} for items in Order ID: ${sanitizeHtml(transaction.orderId)} has been processed to your M-Pesa account.`;
    try {
      await sendNotification(
        seller._id.toString(),
        'payout',
        sellerNotificationContent,
        'system',
        session
      );
      logger.info(`Manual payout notification created for seller ${seller._id}`, { transactionId, itemId });
    } catch (notificationError) {
      logger.warn(`Failed to create payout notification for seller ${seller._id}: ${notificationError.message}`, { transactionId, itemId });
    }

    // Notify and email admin
    if (admin && admin.personalInfo?.email) {
      const adminEmailContent = `Manual payout of KES ${totalPayoutAmount.toFixed(2)} processed to seller "${sanitizeHtml(seller.personalInfo.fullname || 'Seller')}" for Order ID: ${sanitizeHtml(transaction.orderId)}. Balance deducted from platform account.`;
      const adminEmailSent = await sendEmail(
        admin.personalInfo.email,
        'Manual Payout Processed - BeiFity.Com',
        adminEmailContent
      );
      if (!adminEmailSent) {
        logger.warn(`Failed to send payout notification email to admin ${admin._id}`, { transactionId, itemId });
      } else {
        logger.info(`Manual payout email sent to admin ${admin._id}`, { transactionId, itemId });
      }
    }

    const adminNotificationContent = `Manual payout of KES ${totalPayoutAmount.toFixed(2)} processed to seller "${sanitizeHtml(seller.personalInfo.fullname || 'Seller')}" for Order ID: ${sanitizeHtml(transaction.orderId)}. Platform balance updated.`;
    try {
      await sendNotification(
        admin._id.toString(),
        'payout',
        adminNotificationContent,
        'system',
        session
      );
      logger.info(`Manual payout notification created for admin ${admin._id}`, { transactionId, itemId });
    } catch (notificationError) {
      logger.warn(`Failed to create payout notification for admin ${admin._id}: ${notificationError.message}`, { transactionId, itemId });
    }

    logger.info(`Manual payout processed for seller ${transactionItem.sellerId}: KES ${totalPayoutAmount}`, { transactionId, itemId });
    return { error: false, message: 'Manual payout processed successfully' };
  } catch (error) {
    logger.error(`Error initiating manual payout: ${error.message}`, { stack: error.stack, transactionId, itemId });
    return { error: true, message: error.message };
  }
};
/// Modified handleSwiftWebhook function - Optimized for speed
export const handleSwiftWebhook = async (req, res) => {
  console.log('Received SWIFT webhook:', req.body);
  logger.info('SWIFT webhook received', { 
    transaction_id: req.body.transaction_id, 
    external_reference: req.body.external_reference, 
    status: req.body.status 
  });
  try {
    // Wrap ONLY critical DB logic in retryable transaction (minimize scope for speed)
    const txResult = await withTransactionRetry(async (session) => {
      logger.debug('Starting webhook transaction processing', { external_reference: req.body.external_reference });
      const input = req.body;
      const signature = req.headers['x-swiftwallet-signature'];

      // Verify HMAC signature (fast, no DB)
      logger.debug('Verifying webhook signature', { hasSecret: !!process.env.SWIFT_WEBHOOK_SECRET });
      const webhookSecret = process.env.SWIFT_WEBHOOK_SECRET;
      if (webhookSecret) {
        const expectedSignature = crypto
          .createHmac('sha256', webhookSecret)
          .update(JSON.stringify(input))
          .digest('hex');
        if (!crypto.timingSafeEqual(Buffer.from(signature || ''), Buffer.from(expectedSignature))) {
          logger.warn('Invalid webhook signature', { reference: input.transaction_id });
          throw new Error('Unauthorized');  // Non-retryable
        }
        logger.debug('Webhook signature verified successfully');
      }

      const { transaction_id, external_reference, status, service_fee, result } = input;

      logger.debug('Checking webhook validity', { status, resultCode: result?.ResultCode });
      if (!transaction_id || status !== 'completed' || result.ResultCode !== 0) {
        logger.warn(`Webhook invalid: status=${status}, code=${result.ResultCode}`, { transaction_id });
        
        let order = null;  // FIXED: Declare outside with null fallback to avoid ReferenceError
        
        // Handle failure: Rollback order state (only if not already completed) - Keep minimal
        logger.debug('Processing webhook failure - keeping transaction pending');
        const transaction = await TransactionModel.findOne({ swiftReference: external_reference }).session(session);
        if (transaction) {
          if (transaction.status === 'completed') {
            logger.info(`Duplicate failure webhook ignored for already-completed transaction ${external_reference}`);
            return { type: 'duplicate' };  // Skip rollback for completed (idempotency)
          }
          logger.info(`Found transaction for failure handling: ${transaction._id}`);
          order = await orderModel.findOne({ orderId: transaction.orderId }).session(session).populate('items.sellerId customerId');
          if (order) {
            logger.info(`Found order for failure handling: ${order._id}`);
            // Ensure order status is pending for retry
            order.status = 'pending';
            await order.save({ session });
            // Restore inventory for non-cancelled items (batch if possible, but sequential for safety)
            for (const item of order.items.filter(i => !i.cancelled)) {
              await listingModel.updateOne(
                { 'productInfo.productId': item.productId },
                { 
                  $inc: { inventory: item.quantity, 'analytics.ordersNumber': -1 }, 
                  $set: { isSold: false } 
                },
                { session }
              );
              logger.debug(`Restored inventory for item ${item.productId}`);
            }
            // Reset buyer stats
            await userModel.updateOne(
              { _id: order.customerId },
              { 
                $inc: { 'stats.pendingOrdersCount': -1, 'analytics.orderCount': -1 },
                $pull: { orders: order._id }  // Remove from orders array
              },
              { session }
            );
            logger.debug(`Reset buyer stats for ${order.customerId}`);
            // Reset seller pending counts (batch by unique sellers)
            const uniqueSellers = [...new Set(order.items.filter(i => !i.cancelled).map(i => i.sellerId))];
            for (const sellerId of uniqueSellers) {
              await userModel.updateOne(
                { _id: sellerId },
                { $inc: { 'stats.pendingOrdersCount': -1 } },
                { session }
              );
              logger.debug(`Reset seller pending count for ${sellerId}`);
            }
            // REMOVED: Do not delete transaction - keep in pending/failed mode
            transaction.status = 'failed';  // Or 'pending' if you prefer to allow retry without marking as failed
            await transaction.save({ session });
            // Unlink transaction from order to allow retry
            await orderModel.updateOne(
              { _id: order._id },
              { $unset: { transactionId: '' } },
              { session }
            );
            logger.info(`Transaction set to failed and unlinked from order ${order.orderId} for retry`);
          } else {
            logger.warn(`Transaction found but order not found for failure handling`, { orderId: transaction.orderId });
          }
        } else {
          logger.warn(`No transaction found for failure handling`, { external_reference });
        }

        return { type: 'failure', order };  // Now safe: order is always defined (null if missing)
      }

      console.log('Processing SWIFT webhook for transaction:', external_reference);
      logger.info('Processing successful webhook', { external_reference, transaction_id });
     
      const transaction = await TransactionModel.findOne({ swiftReference: external_reference }).session(session);
      if (!transaction) {
        logger.warn(`Webhook: Transaction not found for ${transaction_id}`);
        return { type: 'not_found' };
      }
      
      // FIXED: Idempotency check for success webhooks - prevent re-processing completed transactions
      if (transaction.status === 'completed') {
        logger.info(`Duplicate webhook ignored for already-completed transaction ${external_reference}`);
        return { type: 'duplicate' };
      }
      
      console.log("Transactions: ",transaction)
      logger.debug('Fetched transaction', { 
        id: transaction._id, 
        status: transaction.status, 
        totalAmount: transaction.totalAmount,
        itemsCount: transaction.items.length 
      });

      const order = await orderModel.findOne({ orderId: transaction.orderId }).session(session).populate('customerId items.sellerId');

      if (!order) {
        logger.warn(`Webhook: Order not found for transaction ${external_reference}`);
        return { type: 'order_not_found' };
      }
      console.log('Order :', order)
      logger.debug('Fetched order', { 
        id: order._id, 
        status: order.status, 
        totalAmount: order.totalAmount,
        itemsCount: order.items.length 
      });

      // Parse paidAt correctly (fast)
      let paidAt = new Date();  // Fallback to now
      if (result && result.TransactionDate) {
        const tsStr = result.TransactionDate.toString().padStart(14, '0');  // Ensure 14 chars
        if (tsStr.length === 14 && /^\d{14}$/.test(tsStr)) {
          const year = parseInt(tsStr.slice(0, 4), 10);
          const month = parseInt(tsStr.slice(4, 6), 10) - 1;  // JS months are 0-based
          const day = parseInt(tsStr.slice(6, 8), 10);
          const hour = parseInt(tsStr.slice(8, 10), 10);
          const min = parseInt(tsStr.slice(10, 12), 10);
          const sec = parseInt(tsStr.slice(12, 14), 10);
          // Adjust for timezone if needed (SWIFT likely UTC; add +3h for EAT)
          paidAt = new Date(year, month, day, hour, min, sec);
          if (isNaN(paidAt.getTime())) {
            logger.warn(`Invalid parsed TransactionDate: ${tsStr}, falling back to now`);
            paidAt = new Date();
          }
        } else {
          logger.warn(`Unexpected TransactionDate format: ${result.TransactionDate}`);
        }
      }
      logger.debug('Parsed paidAt', { paidAt: paidAt.toISOString() });

      // Update Transaction with final details (minimal)
      logger.debug('Updating transaction status to completed');
      transaction.status = 'completed';
      transaction.swiftServiceFee = service_fee || transaction.swiftServiceFee;
      // FIXED: Calculate netReceived using itemsTotal (exclude delivery for commission/net)
      const itemsTotal = transaction.items.reduce((sum, item) => sum + (item.itemAmount || 0), 0);
      const commissionRate = parseFloat(process.env.COMMISSION_RATE || '0');
      const platformCommission_total = itemsTotal * commissionRate;
      transaction.netReceived = Math.max(itemsTotal - transaction.swiftServiceFee - platformCommission_total, 0);
      transaction.paidAt = paidAt;
      await transaction.save({ session });
      logger.debug('Transaction saved after status update', { netReceived: transaction.netReceived, swiftServiceFee: transaction.swiftServiceFee });


      // Update Order status to paid (fast)
      if (order.status !== 'paid') {
        logger.debug('Updating order status to paid');
        order.status = 'paid';
        await order.save({ session });
        logger.info(`Order ${order.orderId} status updated to paid via webhook`, { transaction_id });
      } else {
        logger.debug('Order already in paid status, skipping update');
      }

      console.log('Items Total:', itemsTotal); // User's log
      console.log('Net For Sellers', transaction.netReceived); // User's log
      logger.debug('Pre-calculation: itemsTotal', { itemsTotal, commissionRate, platformCommission_total });

      // Batch calculate item shares (no await here, just compute)
      for (const transactionItem of transaction.items.filter(item => !(item.cancelled ?? false))) { // Safe undefined check
        const itemAmount = transactionItem.itemAmount || 0; // Safe
        // FIXED: Prorate commission on itemsTotal only
        const proratedCommission = itemsTotal > 0 ? (itemAmount / itemsTotal) * platformCommission_total : 0;
        transactionItem.platformCommission = proratedCommission;
        transactionItem.sellerShare = itemsTotal > 0 ? (itemAmount / itemsTotal) * transaction.netReceived : 0;
        transactionItem.transferFee = 0;
        transactionItem.netCommission = proratedCommission;
        transactionItem.owedAmount = transactionItem.sellerShare;
        console.log(`Seller ${transactionItem.sellerId} share calculated: KES ${transactionItem.sellerShare} (from total net ${transaction.netReceived}, item ${itemAmount}/${itemsTotal})`); // User's log
        logger.debug('Item share calculated', { 
          itemId: transactionItem.itemId, 
          sellerId: transactionItem.sellerId, 
          itemAmount, 
          sellerShare: transactionItem.sellerShare, 
          platformCommission: transactionItem.platformCommission 
        });
      }

      await transaction.save({ session });  // Save updated items
      logger.debug('Transaction saved after item calculations', { itemsUpdated: true });

      // FIXED: Platform takes commissions (on items) + delivery fee + swift fee
      const totalPlatformCommission = transaction.items.reduce((sum, item) => sum + item.platformCommission, 0);
      console.log("Total platform commission: ", totalPlatformCommission)
      const platformBalance = transaction.swiftServiceFee + transaction.deliveryFee + totalPlatformCommission;
      console.log("Platform Balance:", platformBalance)
      console.log('After save, sellerShare:', transaction.items[0].sellerShare); // User's log - now 5!
      logger.debug('Platform balance calculated', { totalPlatformCommission, platformBalance });

      // Update admin balance (fast)
      const admin = await userModel.findOne({ 'personalInfo.isAdmin': true }).session(session);
      if (admin) {
        await userModel.findByIdAndUpdate(
          admin._id,
          { $inc: { 'financials.balance': platformBalance } },
          { session }
        );
        logger.info(`Platform (admin) balance updated: +KES ${platformBalance} (service ${transaction.swiftServiceFee} + delivery ${transaction.deliveryFee} + comm ${totalPlatformCommission})`, { orderId: order.orderId });
      } else {
        logger.warn('No admin user found for balance update');
      }

      // OPTIMIZED: Group sellers and prepare bulk updates (minimize queries)
      // Group transaction items by seller for efficiency (use ObjectId for keys)
      const sellerGroups = {};
      for (const txItem of transaction.items.filter(item => !item.cancelled)) {
        const sellerIdObj = txItem.sellerId;  // Keep as ObjectId
        const sellerIdStr = sellerIdObj.toString();  // For grouping key
        if (!sellerGroups[sellerIdStr]) {
          sellerGroups[sellerIdStr] = { 
            sellerIdObj: sellerIdObj, 
            items: [], 
            totalShare: 0, 
            numItems: 0 
          };
        }
        sellerGroups[sellerIdStr].items.push(txItem);
        sellerGroups[sellerIdStr].totalShare += txItem.sellerShare;
        sellerGroups[sellerIdStr].numItems += 1;
      }
      logger.debug('Seller groups formed', { groupCount: Object.keys(sellerGroups).length });

      // OPTIMIZED: Prepare history entries in batch (fetch all listings once if needed, but per group for now)
      const historyPromises = Object.entries(sellerGroups).map(async ([sellerIdStr, group]) => {
        logger.debug(`Preparing updates for seller group ${sellerIdStr}`, { totalShare: group.totalShare, numItems: group.numItems });
        // Fetch listings for history (batch per seller - parallel)
        const orderItemsForSeller = order.items.filter(oi => group.items.some(gi => gi.itemId.toString() === oi._id.toString()));
        const productIds = orderItemsForSeller.map(oi => oi.productId);
        const listings = await listingModel.find({ 'productInfo.productId': { $in: productIds } }).session(session); // Batch fetch
        const listingMap = new Map(listings.map(l => [l.productInfo.productId, l._id]));
        
        const historyEntries = group.items.map(txItem => {
          const orderItem = orderItemsForSeller.find(oi => oi._id.toString() === txItem.itemId.toString());
          const listingId = orderItem ? listingMap.get(orderItem.productId) : null;
          return {
            amount: txItem.sellerShare,
            listingId: listingId || null,  // Use listing._id if found
            date: paidAt,
          };
        });

        const sellerIdObj = group.sellerIdObj;  // Use ObjectId for update
        // Update seller: +totalShare to balance, +numItems to salesCount, +totalShare to totalSales.amount, push history
        await userModel.findByIdAndUpdate(
          sellerIdObj,
          {
            $inc: {
              'financials.balance': group.totalShare,
              'analytics.salesCount': group.numItems,
              'analytics.totalSales.amount': group.totalShare,
            },
            $push: {
              'analytics.totalSales.history': { $each: historyEntries },
            },
          },
          { session }
        );

        logger.info(`Seller ${sellerIdStr} updated post-payment: +KES ${group.totalShare} to balance/analytics (${group.numItems} items, pending delivery)`, { orderId: order.orderId });
        return { sellerId: sellerIdStr, success: true };
      });

      // Await all seller updates in parallel
      await Promise.all(historyPromises);

      logger.info(`SWIFT webhook processed successfully`, { transaction_id, orderId: order.orderId, netReceived: transaction.netReceived, platformBalance });
      return { type: 'success', order, transaction, paidAt, sellerGroups };  // Include sellerGroups for notifications
    }, 5, 'SWIFT webhook transaction');

    logger.debug('Webhook transaction completed', { type: txResult?.type });

    // FIXED: Handle duplicate case to prevent re-processing
    if (txResult.type === 'duplicate') {
      logger.info('Duplicate webhook processed (skipped updates)');
      return res.status(200).send('OK');
    }

    // OPTIMIZED: Post-transaction processing (notifications/emails - outside transaction, parallel fire-and-forget)
    // Use Promise.all for parallel execution to speed up response
    const postProcessingPromises = [];

    if (txResult.type === 'failure' && txResult.order) {
      const order = txResult.order;
      const buyer = order.customerId;
      logger.debug('Processing failure notifications', { orderId: order.orderId });
      const buyerNotificationContent = `Your payment for Order ID: ${sanitizeHtml(order.orderId)} (KES ${order.totalAmount}) was not successful. Please try again or contact support if the issue persists.`;
      
      // Parallel: Notification + Email
      postProcessingPromises.push(
        sendNotification( 
          buyer._id.toString(),
          'order',
          buyerNotificationContent, 
          null
        ).then(() => logger.info(`Failed payment notification created for buyer ${buyer._id}`, { orderId: order.orderId }))
          .catch(err => logger.warn(`Failed to create failed payment notification: ${err.message}`, { orderId: order.orderId })),
        
        sendEmail(
          buyer.personalInfo.email,
          'Payment Failed - BeiFity.Com',
          `Dear ${sanitizeHtml(buyer.personalInfo.fullname || 'Customer')},
          
          <br><br>Your payment for Order ID: ${sanitizeHtml(order.orderId)} (KES ${order.totalAmount}) was not successful.
            <a href="${FRONTEND_URL}/your-orders?orderId=${order.orderId}">View Details and Try Repayment</a> 
          .Please try again or contact support if the issue persists.<br><br>Best regards,<br>BeiFity Team`
        ).then(() => logger.info(`Failed payment email sent to buyer ${buyer._id}`, { orderId: order.orderId }))
          .catch(err => logger.warn(`Failed to send failed payment email: ${err.message}`, { orderId: order.orderId }))
      );

      // Notify admin (parallel)
      postProcessingPromises.push(
        (async () => {
          const admin = await userModel.findOne({ 'personalInfo.isAdmin': true });
          if (admin && admin.personalInfo?.email) {
            await sendEmail(
              admin.personalInfo.email,
              'Order Payment Failed - BeiFity.Com',
              `Admin,<br><br>The payment for Order ID: ${sanitizeHtml(order.orderId)} (KES ${order.totalAmount}) has failed. Please review the order and assist the customer if needed.<br><br>Best regards,<br>BeiFity System`
            );
            logger.info(`Failed payment email sent to admin ${admin._id}`);
          }
        })().catch(err => logger.warn(`Failed admin failure email: ${err.message}`, { orderId: order.orderId }))
      );

    } else if (txResult.type === 'success') {
      const { order, transaction, paidAt, sellerGroups } = txResult;
      const buyer = order.customerId;
      const orderTime = order.createdAt.toLocaleString('en-US', { timeZone: 'Africa/Nairobi' });
      const totalOrderPrice = order.totalAmount;
      const buyerName = sanitizeHtml(buyer.personalInfo?.fullname || 'Buyer');
      logger.debug('Processing success notifications', { orderId: order.orderId, buyerId: buyer._id });

      // Buyer: Full confirmation email and notification (parallel, with retry only if needed)
      const buyerNotificationContent = `Your payment for Order ID: ${sanitizeHtml(order.orderId)} (KES ${totalOrderPrice}) has been confirmed. Processing will begin soon.`;
      postProcessingPromises.push(
        sendNotification(
          buyer._id.toString(),
          'order',
          buyerNotificationContent,
          null
        ).then(() => logger.info(`Order confirmation notification created for buyer ${buyer._id}`, { orderId: order.orderId }))
          .catch(err => logger.warn(`Failed to create buyer confirmation notification: ${err.message}`, { orderId: order.orderId })),

        (async () => {
          // Always send payment confirmation email (critical notification)
          if (buyer.personalInfo?.email) {
            logger.debug('Sending buyer payment confirmation email');
            const buyerEmailContent = generateOrderEmailBuyer(
              buyerName,
              order.items.filter(item => !item.cancelled),
              orderTime,
              totalOrderPrice,
              order.deliveryAddress,
              order.orderId,
              [...new Set(order.items.filter(item => !item.cancelled).map(item => item.sellerId.toString()))],
              null  // No URL
            ).replace('has been placed', 'payment has been confirmed and is now processing');
            const emailSent = await sendEmail(buyer.personalInfo.email, 'Payment Confirmed - Order Processing - BeiFity.Com', buyerEmailContent);
            if (emailSent) {
              logger.info(`Payment confirmation email sent to buyer ${buyer._id}`, { orderId: order.orderId });
            } else {
              logger.warn(`Failed to send payment confirmation email to buyer ${buyer._id}`, { orderId: order.orderId });
            }
          } else {
            logger.warn(`Buyer ${buyer._id} has no email address`, { orderId: order.orderId });
          }
        })().catch(err => logger.warn(`Failed buyer email: ${err.message}`, { orderId: order.orderId }))
      );

      // Sellers: Confirmation emails and notifications (grouped, parallel per seller)
      const sellerPromises = Object.entries(sellerGroups || {}).map(([sellerIdStr, group]) => {
        const items = order.items.filter(item => group.items.some(gi => gi.itemId.toString() === item._id.toString()));
        console.log('Notifying seller with ID:', sellerIdStr);
        logger.debug(`Processing notifications for seller ${sellerIdStr}`, { itemCount: items.length });
        return (async () => {
          const seller = await userModel.findById(new mongoose.Types.ObjectId(sellerIdStr));  // Ensure ObjectId
          if (!seller || !seller.personalInfo?.email) {
            logger.warn(`Failed to notify seller ${sellerIdStr}: Seller not found or no email`, { orderId: order.orderId });
            return;
          }

          const sellerName = sanitizeHtml(seller.personalInfo.fullname || 'Seller');
          const totalPrice = items.reduce((sum, item) => sum + item.price * item.quantity, 0);

          // Parallel email + notification for this seller
          await Promise.all([
            (async () => {
              // Always send payment confirmation email to seller (critical notification)
              if (seller.personalInfo?.email) {
                logger.debug(`Sending payment confirmation email to seller ${sellerIdStr}`);
                const sellerEmailContent = generateOrderEmailSeller(
                  sellerName,
                  buyerName,
                  items,
                  orderTime,
                  order.deliveryAddress,
                  totalPrice,
                  buyer._id,
                  order.orderId,
                  null
                ).replace('You have a new order', 'Payment confirmed for your new order');
                const emailSent = await sendEmail(seller.personalInfo.email, 'Payment Confirmed - New Order - BeiFity.Com', sellerEmailContent);
                if (emailSent) {
                  logger.info(`Payment confirmation email sent to seller ${sellerIdStr}`, { orderId: order.orderId });
                } else {
                  logger.warn(`Failed to send payment confirmation email to seller ${sellerIdStr}`, { orderId: order.orderId });
                }
              } else {
                logger.warn(`Seller ${sellerIdStr} has no email address`, { orderId: order.orderId });
              }
            })().catch(err => logger.warn(`Failed seller ${sellerIdStr} email: ${err.message}`, { orderId: order.orderId })),

            (async () => {
              const sellerShare = group.totalShare || transaction.items
                .filter(i => i.sellerId.toString() === sellerIdStr)
                .reduce((sum, i) => sum + i.sellerShare, 0);
              const sellerNotificationContent = `Payment confirmed for Order ID: ${sanitizeHtml(order.orderId)}. Your share (KES ${sellerShare.toFixed(2)}) is pending after delivery for items: ${items.map(i => sanitizeHtml(i.name)).join(', ')}.`;
              await sendNotification(
                sellerIdStr,
                'order',
                sellerNotificationContent,
                buyer._id.toString()
              );
              logger.info(`Order confirmation notification created for seller ${sellerIdStr}`, { orderId: order.orderId });
            })().catch(err => logger.warn(`Failed seller ${sellerIdStr} notification: ${err.message}`, { orderId: order.orderId }))
          ]);
        })();
      });
      postProcessingPromises.push(...sellerPromises);

      // Admins: Confirmation notifications and emails (parallel per admin)
      const adminPromise = (async () => {
        const admins = await userModel.find({ 'personalInfo.isAdmin': true }).select('_id personalInfo.email personalInfo.fullname preferences');
        logger.debug('Fetched admins for notifications', { adminCount: admins.length });
        const adminNotificationContent = `A new order (ID: ${order.orderId}) has been placed and paid by ${buyerName} for a total of KES ${totalOrderPrice}.`;
        
        // Parallel notifications for all admins
        await Promise.all(
          admins.map(async (admin) => {
            await sendNotification(
              admin._id.toString(),
              'order',
              adminNotificationContent,
              buyer._id.toString()
            );
            logger.info(`Order confirmation notification created for admin ${admin._id}`, { orderId: order.orderId });
          }).concat(
            // Parallel emails for all admins (always send payment confirmation emails)
            admins
              .filter(admin => admin.personalInfo?.email)
              .map(async (admin) => {
                logger.debug(`Sending payment confirmation email to admin ${admin._id}`);
                const adminEmailContent = generateOrderEmailAdmin(
                  buyerName,
                  order.items.filter(item => !item.cancelled),
                  orderTime,
                  totalOrderPrice,
                  order.deliveryAddress,
                  order.orderId,
                  buyer._id
                ).replace('has been placed', 'has been paid and confirmed');
                const emailSent = await sendEmail(admin.personalInfo.email, 'Payment Confirmed - New Order - BeiFity.Com Admin Notification', adminEmailContent);
                if (emailSent) {
                  logger.info(`Payment confirmation email sent to admin ${admin._id}`, { orderId: order.orderId });
                } else {
                  logger.warn(`Failed to send payment confirmation email to admin ${admin._id}`, { orderId: order.orderId });
                }
              })
          )
        ).catch(err => logger.warn(`Failed admin processing: ${err.message}`, { orderId: order.orderId }));
      })();
      postProcessingPromises.push(adminPromise);
    }

    // Fire all post-processing in parallel (non-blocking for response)
    Promise.all(postProcessingPromises)
      .then(() => logger.info('All post-processing completed'))
      .catch(err => logger.warn(`Some post-processing failed: ${err.message}`));

    // Early returns for non-processing cases
    if (txResult.type === 'not_found' || txResult.type === 'order_not_found') {
      logger.info('Webhook processed (not found case)', { type: txResult.type });
      return res.status(200).send('OK');
    }

    logger.info('Webhook fully processed successfully (DB committed, notifications queued)');
    return res.status(200).send('OK');  // Respond immediately after DB commit
  } catch (error) {
    console.error('Error processing SWIFT webhook:', error);
    logger.error(`SWIFT webhook error: ${error.message}`, { stack: error.stack });
    return res.status(500).send('Internal Server Error');
  }
};