import mongoose from 'mongoose';
import sanitizeHtml from 'sanitize-html';
import { listingModel } from '../models/Listing.js';
import { userModel } from '../models/User.js';
import { notificationModel } from '../models/Notifications.js';
import logger from '../utils/logger.js';
import { sendEmail } from '../utils/sendEmail.js';
import { ReportModel } from '../models/Report.js';
import { orderModel } from '../models/Order.js';
import { sendNotification } from './notificationController.js';

// Load environment variables
const FRONTEND_URL = process.env.FRONTEND_URL || 'https://www.beifity.com';

// Email Template for User Report Confirmation
const generateReportConfirmationEmail = (userName, reportId, reportType, reason, details, itemName) => {
  const sanitizedUserName = sanitizeHtml(userName || 'User');
  const sanitizedReason = sanitizeHtml(reason);
  const sanitizedDetails = sanitizeHtml(details || '');
  const sanitizedItemName = itemName ? sanitizeHtml(itemName) : null;

  return `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Report Confirmation</title>
    </head>
    <body style="margin: 0; padding: 0; background-color: #f8fafc; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; display: flex; justify-content: center; align-items: center; min-height: 100vh;">
      <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="padding: 20px;">
        <tr>
          <td align="center">
            <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="max-width: 600px; margin: 20px; background-color: #ffffff; padding: 40px; border-radius: 12px; box-shadow: 0 4px 20px rgba(0, 0, 0, 0.1); text-align: center;">
              <tr>
                <td>
                  <img src="${FRONTEND_URL}/assets/logo-without-Dr_6ibJh.png" alt="BeiFity.Com Logo" style="width: auto; height: 70px; margin-bottom: 30px; display: block; margin-left: auto; margin-right: auto;">
                </td>
              </tr>
              <tr>
                <td>
                  <h2 style="font-size: 20px; font-weight: 700; color: #1e40af; margin-bottom: 20px;">Thank You, ${sanitizedUserName}!</h2>
                </td>
              </tr>
              <tr>
                <td>
                  <p style="font-size: 15px; font-weight: 600; color: #1e293b; text-transform: capitalize; margin-bottom: 25px;">Your ${sanitizeHtml(reportType)}${sanitizedItemName ? ' Item' : ''} Report Has Been Submitted</p>
                </td>
              </tr>
              <tr>
                <td>
                  <p style="font-size: 13px; color: #475569; line-height: 1.6; margin-bottom: 30px;">
                    Hi ${sanitizedUserName}, thank you for helping keep <span style="color: #1e40af; font-weight: 600;">BeiF<span style="color: #fbbf24;">ity.Com</span></span> safe. We’ve received your ${sanitizeHtml(reportType)}${sanitizedItemName ? ` item (${sanitizedItemName})` : ''} report (ID: ${sanitizeHtml(reportId)}) and our team is reviewing it.
                  </p>
                </td>
              </tr>
              <tr>
                <td>
                  <div style="background-color: #f0f4f8; padding: 20px; border-radius: 8px; text-align: left; margin-bottom: 30px;">
                    <p style="font-size: 14px; color: #1e40af; font-weight: 600; margin: 0 0 10px;">Report Details</p>
                    <p style="font-size: 13px; color: #475569; margin: 0 0 8px;"><strong>Type:</strong> ${sanitizeHtml(reportType)}</p>
                    ${sanitizedItemName ? `<p style="font-size: 13px; color: #475569; margin: 0 0 8px;"><strong>Item:</strong> ${sanitizedItemName}</p>` : ''}
                    <p style="font-size: 13px; color: #475569; margin: 0 0 8px;"><strong>Reason:</strong> ${sanitizedReason}</p>
                    <p style="font-size: 13px; color: #475569; margin: 0;"><strong>Details:</strong> ${sanitizedDetails || 'None provided'}</p>
                  </div>
                </td>
              </tr>
              <tr>
                <td>
                  <a href="${FRONTEND_URL}/dashboard" style="display: inline-block; background-color: #1e40af; color: #ffffff; font-size: 14px; font-weight: 600; padding: 12px 25px; text-decoration: none; border-radius: 6px; margin-bottom: 30px;">View Dashboard</a>
                </td>
              </tr>
              <tr>
                <td>
                  <p style="font-size: 13px; color: #64748b; line-height: 1.6; margin-bottom: 20px;">
                    <strong>Next Steps:</strong> We’ll investigate and may contact you for more information. You can check the status of your report in your dashboard.
                  </p>
                  <p style="font-size: 13px; color: #64748b; line-height: 1.6; margin-bottom: 20px;">
                    <strong>Need Help?</strong> Contact our support team via the dashboard.
                  </p>
                </td>
              </tr>
              <tr>
                <td style="margin-top: 30px;">
                  <p style="font-size: 14px; color: #64748b; margin: 0;">Together, we make BeiFity better!</p>
                  <span style="color: #1e40af; font-weight: 600; font-size: 14px; font-weight: 700;">BeiF<span style="color: #fbbf24;">ity.Com</span></span>
                </td>
              </tr>
            </table>
          </td>
        </tr>
      </table>
    </body>
    </html>
  `;
};

// Email Template for Admin New Report Alert
const generateAdminReportAlertEmail = (reportId, userName, reportType, reason, details, reportedEntityId, itemName, itemId) => {
  const sanitizedReason = sanitizeHtml(reason);
  const sanitizedDetails = sanitizeHtml(details || '');
  const sanitizedUserName = sanitizeHtml(userName || 'Anonymous');
  const sanitizedReportType = sanitizeHtml(reportType);
  const sanitizedItemName = itemName ? sanitizeHtml(itemName) : null;
  const sanitizedItemId = itemId ? sanitizeHtml(itemId) : null;

  return `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>New Report Alert</title>
    </head>
    <body style="margin: 0; padding: 0; background-color: #f8fafc; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; display: flex; justify-content: center; align-items: center; min-height: 100vh;">
      <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="padding: 20px;">
        <tr>
          <td align="center">
            <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="max-width: 600px; margin: 20px; background-color: #ffffff; padding: 40px; border-radius: 12px; box-shadow: 0 4px 20px rgba(0, 0, 0, 0.1); text-align: center;">
              <tr>
                <td>
                  <img src="${FRONTEND_URL}/assets/logo-without-Dr_6ibJh.png" alt="BeiFity.Com Logo" style="width: auto; height: 70px; margin-bottom: 30px; display: block; margin-left: auto; margin-right: auto;">
                </td>
              </tr>
              <tr>
                <td>
                  <h2 style="font-size: 20px; font-weight: 700; color: #1e40af; margin-bottom: 20px;">New ${sanitizedReportType}${sanitizedItemName ? ' Item' : ''} Report Submitted</h2>
                </td>
              </tr>
              <tr>
                <td>
                  <p style="font-size: 15px; font-weight: 600; color: #1e293b; margin-bottom: 25px;">Action Required: Review Report ID ${sanitizeHtml(reportId)}</p>
                </td>
              </tr>
              <tr>
                <td>
                  <p style="font-size: 13px; color: #475569; line-height: 1.6; margin-bottom: 30px;">
                    A new ${sanitizedReportType}${sanitizedItemName ? ` item (${sanitizedItemName})` : ''} report has been submitted on <span style="color: #1e40af; font-weight: 600;">BeiF<span style="color: #fbbf24;">ity.Com</span></span>. Please review the details below and take appropriate action.
                  </p>
                </td>
              </tr>
              <tr>
                <td>
                  <div style="background-color: #f0f4f8; padding: 20px; border-radius: 8px; text-align: left; margin-bottom: 30px;">
                    <p style="font-size: 14px; color: #1e40af; font-weight: 600; margin: 0 0 10px;">Report Details</p>
                    <p style="font-size: 13px; color: #475569; margin: 0 0 8px;"><strong>Reported By:</strong> ${sanitizedUserName}</p>
                    <p style="font-size: 13px; color: #475569; margin: 0 0 8px;"><strong>Type:</strong> ${sanitizedReportType}</p>
                    ${sanitizedItemName ? `<p style="font-size: 13px; color: #475569; margin: 0 0 8px;"><strong>Item:</strong> ${sanitizedItemName}</p>` : ''}
                    ${sanitizedItemId ? `<p style="font-size: 13px; color: #475569; margin: 0 0 8px;"><strong>Item ID:</strong> ${sanitizedItemId}</p>` : ''}
                    <p style="font-size: 13px; color: #475569; margin: 0 0 8px;"><strong>Reason:</strong> ${sanitizedReason}</p>
                    <p style="font-size: 13px; color: #475569; margin: 0 0 8px;"><strong>Details:</strong> ${sanitizedDetails || 'None provided'}</p>
                    <p style="font-size: 13px; color: #475569; margin: 0;"><strong>Reported Entity ID:</strong> ${sanitizeHtml(reportedEntityId)}</p>
                  </div>
                </td>
              </tr>
              <tr>
                <td>
                  <a href="${FRONTEND_URL}/admin/reports/${sanitizeHtml(reportId)}" style="display: inline-block; background-color: #1e40af; color: #ffffff; font-size: 14px; font-weight: 600; padding: 12px 25px; text-decoration: none; border-radius: 6px; margin-bottom: 30px;">Review Report</a>
                </td>
              </tr>
              <tr>
                <td>
                  <p style="font-size: 13px; color: #64748b; line-height: 1.6; margin-bottom: 20px;">
                    <strong>Next Steps:</strong> Log in to the admin dashboard to review the report and update its status or escalate as needed.
                  </p>
                </td>
              </tr>
              <tr>
                <td style="margin-top: 30px;">
                  <p style="font-size: 14px; color: #64748b; margin: 0;">Keeping BeiFity safe!</p>
                  <span style="color: #1e40af; font-weight: 600; font-size: 14px; font-weight: 700;">BeiF<span style="color: #fbbf24;">ity.Com</span></span>
                </td>
              </tr>
            </table>
          </td>
        </tr>
      </table>
    </body>
    </html>
  `;
};
/**
 * Create a Report
 * @route POST /api/reports
 * @desc Submit a new report for a user, order, or listing, with optional item-specific reporting for orders
 * @access Private (requires JWT token, optional for anonymous)
 */
export const createReport = async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    const { reportType, reportedEntityId, itemId, reason, details } = req.body;
    const reporterId = req.user?._id?.toString();
    console.log('Create report request:', { reportType, reportedEntityId, itemId, reason, details, reporterId });

    // Validate required fields
    if (!reportType || !['user', 'order', 'listing'].includes(reportType)) {
      logger.warn(`Create report failed: Invalid or missing reportType ${reportType}`, { reporterId });
      return res.status(400).json({ success: false, message: 'Valid reportType (user, order, listing) is required' });
    }
    if (!reportedEntityId) {
      logger.warn('Create report failed: reportedEntityId required', { reporterId });
      return res.status(400).json({ success: false, message: 'reportedEntityId is required' });
    }
    if (!reason) {
      logger.warn('Create report failed: Reason required', { reporterId });
      return res.status(400).json({ success: false, message: 'Reason is required' });
    }
    const validReasons = [
      'Fraudulent Activity',
      'Non-Delivery',
      'Fake or Counterfeit Product',
      'Inappropriate Behavior',
      'Damaged Item',
      'Wrong Item',
      'Misleading Listing',
      'Suspected Stolen Goods',
      'Other',
    ];
    if (!validReasons.includes(reason)) {
      logger.warn(`Create report failed: Invalid reason ${reason}`, { reporterId });
      return res.status(400).json({ success: false, message: 'Invalid reason' });
    }

    // Validate reportedEntityId and itemId format
    if (reportType === 'user' || reportType === 'order') {
      if (!mongoose.Types.ObjectId.isValid(reportedEntityId)) {
        logger.warn(`Create report failed: Invalid reportedEntityId ${reportedEntityId} for ${reportType}`, { reporterId });
        return res.status(400).json({ success: false, message: `Invalid ${reportType} ID` });
      }
      if (reportType === 'order' && typeof itemId !== 'string') {
        logger.warn(`Create report failed: Invalid itemId ${itemId} for order`, { reporterId });
        return res.status(400).json({ success: false, message: 'Invalid itemId' });
      }
    } else if (reportType === 'listing' && typeof reportedEntityId !== 'string') {
      logger.warn(`Create report failed: Invalid reportedEntityId ${reportedEntityId} for listing`, { reporterId });
      return res.status(400).json({ success: false, message: 'Invalid listing ID' });
    }

    // Validate existence of reported entity
    let reportedUser = null;
    let reportedOrder = null;
    let reportedListing = null;
    let reportedItem = null;
    if (reportType === 'user') {
      reportedUser = await userModel.findById(reportedEntityId).session(session);
      if (!reportedUser) {
        logger.warn(`Create report failed: User ${reportedEntityId} not found`, { reporterId });
        return res.status(404).json({ success: false, message: 'Reported user not found' });
      }
    } else if (reportType === 'order') {
      reportedOrder = await orderModel.findOne({orderId: reportedEntityId}).session(session);
      console.log('Reported Order:', reportedOrder);
      if (!reportedOrder) {
        logger.warn(`Create report failed: Order ${reportedEntityId} not found`, { reporterId });
        return res.status(404).json({ success: false, message: 'Reported order not found' });
      }
      // Ensure reporter is the customer who placed the order (if not anonymous)
      if (reporterId && reportedOrder.customerId.toString() !== reporterId) {
        logger.warn(`Create report failed: Order ${reportedEntityId} not associated with reporter ${reporterId}`);
        return res.status(403).json({ success: false, message: 'Order not associated with this user' });
      }
      // Validate itemId if provided
      if (itemId) {
        reportedItem = reportedOrder.items.find(item => item.productId === itemId);
        if (!reportedItem) {
          logger.warn(`Create report failed: Item ${itemId} not found in order ${reportedEntityId}`, { reporterId });
          return res.status(404).json({ success: false, message: 'Reported item not found in order' });
        }
      }
    } else if (reportType === 'listing') {
      reportedListing = await listingModel.findOne({ 'productInfo.productId': reportedEntityId }).session(session);
      if (!reportedListing) {
        logger.warn(`Create report failed: Listing ${reportedEntityId} not found`, { reporterId });
        return res.status(404).json({ success: false, message: 'Reported listing not found' });
      }
    }

    // Validate reporter (if not anonymous)
    let reporter = null;
    if (reporterId) {
      reporter = await userModel.findById(reporterId).session(session);
      if (!reporter) {
        logger.warn(`Create report failed: Reporter ${reporterId} not found`);
        return res.status(404).json({ success: false, message: 'Reporting user not found' });
      }
      // Prevent self-reporting for user reports
      if (reportType === 'user' && reportedEntityId === reporterId) {
        logger.warn(`Create report failed: User ${reporterId} attempted to report themselves`);
        return res.status(400).json({ success: false, message: 'Cannot report yourself' });
      }
    }

    // Check for recent reports to prevent abuse (if not anonymous)
    if (reporterId) {
      const recentReports = await ReportModel.countDocuments({
        reporterId,
        createdAt: { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) }, // Last 24 hours
      }).session(session);
      if (recentReports >= 5) {
        logger.warn(`Create report failed: User ${reporterId} exceeded report limit`);
        return res.status(429).json({ success: false, message: 'Too many reports submitted recently. Please try again later.' });
      }
    }
    
    // Create report
    const reportData = {
      reporterId: reporterId || null,
      reportType,
      reportedEntityId,
      reason: sanitizeHtml(reason),
      details: sanitizeHtml(details || ''),
    };
    if (reportType === 'user') reportData.userId = reportedEntityId;
    if (reportType === 'order') {
      reportData.orderId = reportedEntityId;
      if (itemId) reportData.itemId = itemId;
    }
    if (reportType === 'listing') reportData.productId = reportedEntityId;

    console.log("What is being ",reportData)
    const report = new ReportModel(reportData);
    const savedReport = await report.save({ session });
    // Update analytics counters
    if (reporterId) {
      await userModel.updateOne(
        { _id: reporterId },
        { $inc: { 'analytics.reportsSubmitted': 1 } },
        { session }
      );
    }
    if (reportType === 'user') {
      await userModel.updateOne(
        { _id: reportedEntityId },
        { $inc: { 'analytics.reportsReceived': 1 } },
        { session }
      );
    } else if (reportType === 'order') {
      // Increment order-level reportCount
      await orderModel.updateOne(
        { _id: reportedEntityId },
        { $inc: { reportCount: 1 } },
        { session }
      );
      // Increment item-level reportCount and seller's reportsReceived if itemId is provided
      if (reportedItem) {
        await orderModel.updateOne(
          { _id: reportedEntityId, 'items.productId': itemId },
          { $inc: { 'items.$.reportCount': 1 } },
          { session }
        );
        await userModel.updateOne(
          { _id: reportedItem.sellerId },
          { $inc: { 'analytics.reportsReceived': 1 } },
          { session }
        );
      }
    } else if (reportType === 'listing') {
      await listingModel.updateOne(
        { 'productInfo.productId': reportedEntityId },
        { $inc: { 'analytics.reportsReceived': 1 } },
        { session }
      );
    }

    // Commit transaction
    await session.commitTransaction();

    // Send confirmation email to reporter (if not anonymous)
    if (reporter && reporter.personalInfo.email) {
      const emailContent = generateReportConfirmationEmail(
        reporter.personalInfo.fullname,
        savedReport._id,
        reportType,
        reason,
        details,
        reportedItem ? reportedItem.name : null // Include item name if applicable
      );
      const emailSent = await sendEmail(
        reporter.personalInfo.email,
        `Your ${reportType}${reportedItem ? ' Item' : ''} Report Confirmation - BeiFity.Com`,
        emailContent
      );
      if (!emailSent) {
        logger.warn(`Failed to send report confirmation email to user ${reporterId}`, { reportId: savedReport._id });
      } else {
        logger.info(`Report confirmation email sent to user ${reporterId}`, { reportId: savedReport._id });
      }
    }

    // Create user notification (if not anonymous)
    if (reporterId) {
      const notificationContent = `Your ${reportType}${reportedItem ? ` item (${reportedItem.name})` : ''} report (ID: ${savedReport._id}) has been submitted and is under review.`;
      try {
        await sendNotification(reporterId, 'report', notificationContent, reporterId);
        logger.info(`Notification created for user ${reporterId}`, { reportId: savedReport._id });
      } catch (notificationError) {
        logger.warn(`Failed to create notification for user ${reporterId}: ${notificationError.message}`, { reportId: savedReport._id });
      }
    }

    // Send admin alert email
    const admins = await userModel.find({ 'personalInfo.isAdmin': true }).select('personalInfo.email personalInfo.fullname').session(null);
    for (const admin of admins) {
      if (admin.personalInfo.email) {
        const adminEmailContent = generateAdminReportAlertEmail(
          savedReport._id,
          reporter ? reporter.personalInfo.fullname : null,
          reportType,
          reason,
          details,
          reportedEntityId,
          reportedItem ? reportedItem.name : null,
          itemId
        );
        const emailSent = await sendEmail(
          admin.personalInfo.email,
          `New ${reportType}${reportedItem ? ' Item' : ''} Report Alert - BeiFity.Com`,
          adminEmailContent
        );
        if (!emailSent) {
          logger.warn(`Failed to send report alert email to admin ${admin._id}`, { reportId: savedReport._id });
        } else {
          logger.info(`Report alert email sent to admin ${admin._id}`, { reportId: savedReport._id });
        }
      }
    }

    logger.info(`Report created successfully: ${savedReport._id} by ${reporterId || 'anonymous'}`);
    res.status(201).json({
      success: true,
      message: 'Report submitted successfully',
      data: savedReport,
    });
  } catch (error) {
    console.log(error)
    await session.abortTransaction();
    if (error instanceof mongoose.Error.ValidationError) {
      logger.warn(`Create report failed: Validation error`, { error: error.errors });
      return res.status(400).json({ success: false, message: 'Validation error', error: error.errors });
    }
    logger.error(`Error creating report: ${error.message}`, { stack: error.stack});
    res.status(500).json({ success: false, message: 'Server error while submitting report' });
  } finally {
    session.endSession();
  }
};

/**
 * Get All Reports
 * @route GET /api/reports
 * @desc Retrieve all reports (admin only)
 * @access Private (requires JWT token and admin role)
 */
export const getAllReports = async (req, res) => {
  try {
    if (!req.user) {
      logger.warn('Get all reports failed: No user data in request');
      return res.status(401).json({ success: false, message: 'Authentication required' });
    }
    if (!req.user.personalInfo.isAdmin) {
      logger.warn(`Get all reports failed: User ${req.user._id} is not an admin`);
      return res.status(403).json({ success: false, message: 'Admin access required' });
    }

    const reports = await ReportModel.find({})
      .populate('reporterId', 'personalInfo.fullname personalInfo.email')
      .populate('userId', 'personalInfo.fullname personalInfo.email')
      .populate({
        path: 'orderId',
        select: 'orderId totalAmount status',
      })
      .populate({
        path: 'productId',
        select: 'productInfo.name productInfo.price',
        model: 'Listing',
        match: { 'productInfo.productId': { $exists: true } },
      })
      .lean();

    logger.info(`Retrieved ${reports.length} reports by admin ${req.user._id}`);
    res.status(200).json({
      success: true,
      message: 'Reports retrieved successfully',
      data: reports,
    });
  } catch (error) {
    logger.error(`Error fetching reports: ${error.message}`, { stack: error.stack, userId: req.user?._id });
    res.status(500).json({ success: false, message: 'Server error while fetching reports' });
  }
};

/**
 * Get a Single Report by ID
 * @route GET /api/reports/:id
 * @desc Retrieve a report by its ID (admin only)
 * @access Private (requires JWT token and admin role)
 */
export const getReportById = async (req, res) => {
  const { id } = req.params;

  try {
    if (!req.user) {
      logger.warn('Get report by ID failed: No user data in request');
      return res.status(401).json({ success: false, message: 'Authentication required' });
    }
    if (!req.user.personalInfo.isAdmin) {
      logger.warn(`Get report by ID failed: User ${req.user._id} is not an admin`);
      return res.status(403).json({ success: false, message: 'Admin access required' });
    }

    if (!mongoose.Types.ObjectId.isValid(id)) {
      logger.warn(`Get report by ID failed: Invalid report ID ${id}`, { userId: req.user._id });
      return res.status(400).json({ success: false, message: 'Invalid report ID' });
    }

    const report = await ReportModel.findById(id)
      .populate('reporterId', 'personalInfo.fullname personalInfo.email')
      .populate('userId', 'personalInfo.fullname personalInfo.email')
      .populate({
        path: 'orderId',
        select: 'orderId totalAmount status',
      })
      .populate({
        path: 'productId',
        select: 'productInfo.name productInfo.price',
        model: 'Listing',
        match: { 'productInfo.productId': { $exists: true } },
      })
      .lean();

    if (!report) {
      logger.warn(`Get report by ID failed: Report ${id} not found`, { userId: req.user._id });
      return res.status(404).json({ success: false, message: 'Report not found' });
    }

    logger.info(`Report ${id} retrieved by admin ${req.user._id}`);
    res.status(200).json({
      success: true,
      message: 'Report retrieved successfully',
      data: report,
    });
  } catch (error) {
    logger.error(`Error fetching report: ${error.message}`, { stack: error.stack, userId: req.user?._id, reportId: id });
    res.status(500).json({ success: false, message: 'Server error while fetching report' });
  }
};

/**
 * Update Report Status and Notes
 * @route PATCH /api/reports/:id
 * @desc Update the status or admin notes of a report (admin only)
 * @access Private (requires JWT token and admin role)
 */
export const updateReportStatus = async (req, res) => {
  const { id } = req.params;
  const { status, adminNotes } = req.body;
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    if (!req.user) {
      logger.warn('Update report status failed: No user data in request');
      return res.status(401).json({ success: false, message: 'Authentication required' });
    }
    if (!req.user.personalInfo.isAdmin) {
      logger.warn(`Update report status failed: User ${req.user._id} is not an admin`);
      return res.status(403).json({ success: false, message: 'Admin access required' });
    }

    if (!mongoose.Types.ObjectId.isValid(id)) {
      logger.warn(`Update report status failed: Invalid report ID ${id}`, { userId: req.user._id });
      return res.status(400).json({ success: false, message: 'Invalid report ID' });
    }

    const report = await ReportModel.findById(id).session(session);
    if (!report) {
      logger.warn(`Update report status failed: Report ${id} not found`, { userId: req.user._id });
      return res.status(404).json({ success: false, message: 'Report not found' });
    }

    if (status && !['Pending', 'Under Review', 'Resolved', 'Dismissed'].includes(status)) {
      logger.warn(`Update report status failed: Invalid status ${status}`, { userId: req.user._id, reportId: id });
      return res.status(400).json({ success: false, message: 'Invalid status value' });
    }

    const previousStatus = report.status;
    if (status) report.status = status;
    if (adminNotes) report.adminNotes = sanitizeHtml(adminNotes);

    await report.save({ session });

    // Notify reporter if status changed to Resolved or Dismissed (if not anonymous)
    if (status && status !== previousStatus && ['Resolved', 'Dismissed'].includes(status) && report.reporterId) {
      const reporter = await userModel.findById(report.reporterId).session(session);
      if (reporter && reporter.personalInfo.email) {
        const emailContent = `
          <!DOCTYPE html>
          <html lang="en">
          <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Report Status Update</title>
          </head>
          <body style="margin: 0; padding: 0; background-color: #f8fafc; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; display: flex; justify-content: center; align-items: center; min-height: 100vh;">
            <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="padding: 20px;">
              <tr>
                <td align="center">
                  <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="max-width: 600px; margin: 20px; background-color: #ffffff; padding: 40px; border-radius: 12px; box-shadow: 0 4px 20px rgba(0, 0, 0, 0.1); text-align: center;">
                    <tr>
                      <td>
                        <img src="${FRONTEND_URL}/assets/logo-without-Dr_6ibJh.png" alt="BeiFity.Com Logo" style="width: auto; height: 70px; margin-bottom: 30px; display: block; margin-left: auto; margin-right: auto;">
                      </td>
                    </tr>
                    <tr>
                      <td>
                        <h2 style="font-size: 20px; font-weight: 700; color: #1e40af; margin-bottom: 20px;">Report Update, ${sanitizeHtml(reporter.personalInfo.fullname || 'User')}!</h2>
                      </td>
                    </tr>
                    <tr>
                      <td>
                        <p style="font-size: 15px; font-weight: 600; color: #1e293b; margin-bottom: 25px;">Your ${sanitizeHtml(report.reportType)} Report Status Has Changed</p>
                      </td>
                    </tr>
                    <tr>
                      <td>
                        <p style="font-size: 13px; color: #475569; line-height: 1.6; margin-bottom: 30px;">
                          Hi ${sanitizeHtml(reporter.personalInfo.fullname || 'User')}, the status of your ${sanitizeHtml(report.reportType)} report (ID: ${sanitizeHtml(id)}) has been updated to <strong>${sanitizeHtml(status)}</strong> on <span style="color: #1e40af; font-weight: 600;">BeiF<span style="color: #fbbf24;">ity.Com</span></span>.
                        </p>
                      </td>
                    </tr>
                    <tr>
                      <td>
                        <a href="${FRONTEND_URL}/dashboard" style="display: inline-block; background-color: #1e40af; color: #ffffff; font-size: 14px; font-weight: 600; padding: 12px 25px; text-decoration: none; border-radius: 6px; margin-bottom: 30px;">View Dashboard</a>
                      </td>
                    </tr>
                    <tr>
                      <td>
                        <p style="font-size: 13px; color: #64748b; line-height: 1.6; margin-bottom: 20px;">
                          <strong>Next Steps:</strong> Check your dashboard for details or contact support if you have questions.
                        </p>
                      </td>
                    </tr>
                    <tr>
                      <td style="margin-top: 30px;">
                        <p style="font-size: 14px; color: #64748b; margin: 0;">Together, we make BeiFity better!</p>
                        <span style="color: #1e40af; font-weight: 600; font-size: 14px; font-weight: 700;">BeiF<span style="color: #fbbf24;">ity.Com</span></span>
                      </td>
                    </tr>
                  </table>
                </td>
              </tr>
            </table>
          </body>
          </html>
        `;
        const emailSent = await sendEmail(
          reporter.personalInfo.email,
          `Report Status Update - BeiFity.Com`,
          emailContent
        );
        if (!emailSent) {
          logger.warn(`Failed to send status update email to user ${report.reporterId}`, { reportId: id });
        } else {
          logger.info(`Status update email sent to user ${report.reporterId}`, { reportId: id });
        }

        // Create user notification
        const notificationContent = `Your ${report.reportType} report (ID: ${id}) status has been updated to ${status}.`;
        try {
          await sendNotification(report.reporterId.toString(), 'report_status', notificationContent, req.user._id.toString(), session);
          logger.info(`Notification created for user ${report.reporterId}`, { reportId: id });
        } catch (notificationError) {
          logger.warn(`Failed to create notification for user ${report.reporterId}: ${notificationError.message}`, { reportId: id });
        }
      }
    }

    await session.commitTransaction();
    logger.info(`Report ${id} updated to status ${status || 'unchanged'} by admin ${req.user._id}`);
    res.status(200).json({
      success: true,
      message: 'Report updated successfully',
      data: report,
    });
  } catch (error) {
    await session.abortTransaction();
    logger.error(`Error updating report: ${error.message}`, { stack: error.stack, userId: req.user?._id, reportId: id });
    res.status(500).json({ success: false, message: 'Server error while updating report' });
  } finally {
    session.endSession();
  }
};

/**
 * Delete a Report
 * @route DELETE /api/reports/:id
 * @desc Delete a report by its ID (admin only)
 * @access Private (requires JWT token and admin role)
 */
export const deleteReport = async (req, res) => {
  const { id } = req.params;

  try {
    if (!req.user) {
      logger.warn('Delete report failed: No user data in request');
      return res.status(401).json({ success: false, message: 'Authentication required' });
    }
    if (!req.user.personalInfo.isAdmin) {
      logger.warn(`Delete report failed: User ${req.user._id} is not an admin`);
      return res.status(403).json({ success: false, message: 'Admin access required' });
    }

    if (!mongoose.Types.ObjectId.isValid(id)) {
      logger.warn(`Delete report failed: Invalid report ID ${id}`, { userId: req.user._id });
      return res.status(400).json({ success: false, message: 'Invalid report ID' });
    }

    const report = await ReportModel.findByIdAndDelete(id);
    if (!report) {
      logger.warn(`Delete report failed: Report ${id} not found`, { userId: req.user._id });
      return res.status(404).json({ success: false, message: 'Report not found' });
    }

    logger.info(`Report ${id} deleted by admin ${req.user._id}`);
    res.status(200).json({
      success: true,
      message: 'Report deleted successfully',
    });
  } catch (error) {
    logger.error(`Error deleting report: ${error.message}`, { stack: error.stack, userId: req.user?._id, reportId: id });
    res.status(500).json({ success: false, message: 'Server error while deleting report' });
  }
};

/**
 * Escalate or De-escalate a Report
 * @route PATCH /api/reports/:id/escalate
 * @desc Escalate or de-escalate a report (admin only)
 * @access Private (requires JWT token and admin role)
 */
export const escalateReport = async (req, res) => {
  const { id } = req.params;
  const { escalate } = req.body;
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    if (!req.user) {
      logger.warn('Escalate report failed: No user data in request');
      return res.status(401).json({ success: false, message: 'Authentication required' });
    }
    if (!req.user.personalInfo.isAdmin) {
      logger.warn(`Escalate report failed: User ${req.user._id} is not an admin`);
      return res.status(403).json({ success: false, message: 'Admin access required' });
    }

    if (!mongoose.Types.ObjectId.isValid(id)) {
      logger.warn(`Escalate report failed: Invalid report ID ${id}`, { userId: req.user._id });
      return res.status(400).json({ success: false, message: 'Invalid report ID' });
    }

    const report = await ReportModel.findById(id).session(session);
    if (!report) {
      logger.warn(`Escalate report failed: Report ${id} not found`, { userId: req.user._id });
      return res.status(404).json({ success: false, message: 'Report not found' });
    }

    const newEscalatedStatus = escalate !== undefined ? escalate : !report.escalated;
    report.escalated = newEscalatedStatus;
    await report.save({ session });

    // Notify other admins if escalated
    if (newEscalatedStatus) {
      const admins = await userModel.find({ 'personalInfo.isAdmin': true, _id: { $ne: req.user._id } }).select('personalInfo.email personalInfo.fullname').session(session);
      for (const admin of admins) {
        if (admin.personalInfo.email) {
          const adminEmailContent = generateAdminReportAlertEmail(
            report._id,
            report.reporterId ? (await userModel.findById(report.reporterId)).personalInfo.fullname : null,
            report.reportType,
            report.reason,
            report.details,
            report.reportedEntityId
          );
          const adminEmailSent = await sendEmail(
            admin.personalInfo.email,
            `Report Escalation Alert - BeiFity.Com`,
            adminEmailContent
          );
          if (!adminEmailSent) {
            logger.warn(`Failed to send escalation alert email to admin ${admin._id}`, { reportId: id });
          } else {
            logger.info(`Escalation alert email sent to admin ${admin._id}`, { reportId: id });
          }
        }
      }
    }

    await session.commitTransaction();
    logger.info(`Report ${id} ${newEscalatedStatus ? 'escalated' : 'de-escalated'} by admin ${req.user._id}`);
    res.status(200).json({
      success: true,
      message: `Report ${newEscalatedStatus ? 'escalated' : 'de-escalated'} successfully`,
      data: report,
    });
  } catch (error) {
    await session.abortTransaction();
    logger.error(`Error escalating report: ${error.message}`, { stack: error.stack, userId: req.user?._id, reportId: id });
    res.status(500).json({ success: false, message: 'Server error while escalating report' });
  } finally {
    session.endSession();
  }
};

/**
 * Get Reports by User
 * @route GET /api/reports/user/:userId
 * @desc Retrieve reports submitted by a specific user
 * @access Private (requires JWT token)
 */
export const getReportsByUser = async (req, res) => {
  const { userId } = req.params;

  try {
    if (!req.user) {
      logger.warn('Get reports by user failed: No user data in request');
      return res.status(401).json({ success: false, message: 'Authentication required' });
    }
    if (req.user._id.toString() !== userId && !req.user.personalInfo.isAdmin) {
      logger.warn(`Get reports by user failed: User ${req.user._id} unauthorized to access reports for ${userId}`);
      return res.status(403).json({ success: false, message: 'Unauthorized to access these reports' });
    }

    if (!mongoose.Types.ObjectId.isValid(userId)) {
      logger.warn(`Get reports by user failed: Invalid userId ${userId}`, { userId: req.user._id });
      return res.status(400).json({ success: false, message: 'Invalid userId' });
    }

    const user = await userModel.findById(userId);
    if (!user) {
      logger.warn(`Get reports by user failed: User ${userId} not found`, { userId: req.user._id });
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    const reports = await ReportModel.find({ reporterId: userId })
      .populate('userId', 'personalInfo.fullname personalInfo.email')
      .populate({
        path: 'orderId',
        select: 'orderId totalAmount status',
      })
      .populate({
        path: 'productId',
        select: 'productInfo.name productInfo.price',
        model: 'Listing',
        match: { 'productInfo.productId': { $exists: true } },
      })
      .lean();

    logger.info(`Retrieved ${reports.length} reports for user ${userId} by ${req.user._id}`);
    res.status(200).json({
      success: true,
      message: 'Reports retrieved successfully',
      data: reports,
    });
  } catch (error) {
    logger.error(`Error fetching user reports: ${error.message}`, { stack: error.stack, userId: req.user?._id, targetUserId: userId });
    res.status(500).json({ success: false, message: 'Server error while fetching user reports' });
  }
};