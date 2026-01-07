import bcrypt from 'bcryptjs';
import { userModel } from '../models/User.js';
import { generateRandomNumbers, generateToken } from '../utils/helper.js';
import { tokenModel } from '../models/Token.js';
import { resetTokenModel } from '../models/ResetToken.js';
import crypto from 'crypto';
import { sendEmail } from '../utils/sendEmail.js';
import { OAuth2Client } from 'google-auth-library';
import jwt from 'jsonwebtoken';
import logger from '../utils/logger.js';
import env from '../config/env.js';
import mongoose from 'mongoose';
import { sendNotification } from './notificationController.js';

const googleClient = new OAuth2Client(env.CLIENT_ID);

/**
 * Common email template function
 * @param {string} title - Email subject
 * @param {string} greeting - Greeting message
 * @param {string} message - Main message content
 * @param {string} buttonText - Button text (optional)
 * @param {string} buttonUrl - Button URL (optional)
 * @returns {string} HTML email template
 */
const createEmailTemplate = (title, greeting, message, buttonText = '', buttonUrl = '') => `
  <!DOCTYPE html>
  <html lang="en">
  <head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${title}</title>
  </head>
  <body style="margin: 0; padding: 0; background-color: #f8fafc; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; display: flex; justify-content: center; align-items: center; min-height: 100vh;">
    <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="padding: 20px;">
      <tr>
        <td align="center">
          <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="max-width: 600px; margin: 20px; background-color: #ffffff; padding: 40px; border-radius: 12px; box-shadow: 0 4px 20px rgba(0, 0, 0, 0.1); text-align: left;">
            <!-- Logo -->
            <tr>
              <td align="center">
                <img src="https://bei-fity-com.vercel.app/assets/logo-without-Dr_6ibJh.png" alt="BeiFity.Com Logo" style="width: auto; height: 70px; margin-bottom: 30px; display: block; margin-left: auto; margin-right: auto;">
              </td>
            </tr>
            <!-- Heading -->
            <tr>
              <td align="center">
                <h2 style="font-size: 20px; font-weight: 700; color: #1e40af; margin-bottom: 20px;">${title}</h2>
              </td>
            </tr>
            <!-- Greeting -->
            <tr>
              <td>
                <p style="font-size: 15px; font-weight: 600; color: #1e293b; margin-bottom: 25px;">${greeting}</p>
              </td>
            </tr>
            <!-- Message -->
            <tr>
              <td>
                <p style="font-size: 13px; color: #475569; line-height: 1.6; margin-bottom: 30px; text-align: left;">${message}</p>
              </td>
            </tr>
            ${buttonText && buttonUrl ? `
            <!-- Button -->
            <tr>
              <td align="center">
                <a href="${buttonUrl}" style="display: inline-block; padding: 15px 20px; background-color: #1e40af; color: #ffffff; text-decoration: none; font-size: 16px; font-weight: 700; border-radius: 8px; margin-bottom: 30px; transition: background-color 0.3s; background: linear-gradient(90deg, #1e40af, #3b82f6);">${buttonText}</a>
              </td>
            </tr>` : ''}
            <!-- Note -->
            <tr>
              <td>
                <p style="font-size: 13px; color: #64748b; margin-top: 20px; text-align: left;">If you didn’t sign up for BeiFity.Com, please ignore this email or contact our support team.</p>
              </td>
            </tr>
            <!-- Footer -->
            <tr>
              <td align="center" style="margin-top: 30px;">
                <p style="font-size: 14px; color: #64748b; margin: 0;">Best regards,</p>
                <p style="font-weight: 700; color: #fbbf24; font-size: 16px; margin-top: 10px;">Bei<span style="color: #1e40af;">Fity.Com</span></p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
  </html>
`;
/**
 * Signup
 * @route POST /api/auth/signup
 * @desc Register a new user
 * @access Public
 * @body {fullname, email, password, phone, referralCode, username}
 */
export const signup = async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const { fullname, email, password, phone, referralCode, username } = req.body;

    // Validate required fields
    if (!fullname || !email || !password || !phone || !username) {
      logger.warn('Signup failed: Missing required fields', { body: req.body });
      return res.status(400).json({ success: false, message: 'Please provide fullname, email, password, phone, and username' });
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      logger.warn('Signup failed: Invalid email format', { email });
      return res.status(400).json({ success: false, message: 'Please provide a valid email address' });
    }

    // Validate phone format
    const phoneRegex = /^\+?[0-9]{7,15}$/;
    if (!phoneRegex.test(phone)) {
      logger.warn('Signup failed: Invalid phone format', { phone });
      return res.status(400).json({ success: false, message: 'Please provide a valid phone number (7-15 digits)' });
    }

    // Check for existing user
    const existingUser = await userModel.findOne({ 'personalInfo.email': email }).session(session);
    if (existingUser) {
      logger.warn(`Signup failed: Email ${email} already in use`);
      return res.status(400).json({ success: false, message: 'This email is already registered. Please use a different email or log in.' });
    }

    // Check for existing username
    const existingUsername = await userModel.findOne({ 'personalInfo.username': username }).session(session);
    if (existingUsername) {
      logger.warn(`Signup failed: Username ${username} already in use`);
      return res.status(400).json({ success: false, message: 'This username is already taken. Please choose a different username.' });
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Create new user
    const newUser = new userModel({
      personalInfo: {
        fullname,
        email,
        password: hashedPassword,
        phone,
        username,
        verified: false,
      },
    });

    // Handle referral if provided
    if (referralCode) {
      const referrer = await userModel.findOne({ referralCode }).session(session);
      if (referrer) {
        newUser.referredBy = referrer._id;
        await userModel.updateOne(
          { _id: referrer._id },
          { $push: { badges: 'Referrer' }, $inc: { 'analytics.numberOfReferrals': 1 } },
          { session }
        );
        logger.info(`Referral applied: User ${newUser._id} referred by ${referrer._id}`);
      } else {
        logger.warn(`Invalid referral code: ${referralCode}`);
      }
    }

    // Save user
    await newUser.save({ session });
    logger.info(`User created: ${newUser._id}`);

    // Create verification token
    const verifyToken = new tokenModel({
      userId: newUser._id,
      token: crypto.randomBytes(32).toString('hex'),
    });
    await verifyToken.save({ session });
    logger.debug(`Verification token created for user: ${newUser._id}`);

    // Send verification email to user
    const verificationUrl = `${env.FRONTEND_URL}/users/verify/${newUser._id}/${verifyToken.token}`;
    const userEmailSent = await sendEmail(
      newUser.personalInfo.email,
      'Verify Your Email At BeiFity.Com',
      createEmailTemplate(
        'Verify Your Email Address',
        `Hello ${newUser.personalInfo.fullname},`,
        `Thank you for joining <span style="color: #1e40af; font-weight: 600;">BeiF<span style="color: #fbbf24;">ity.Com</span></span>! Please verify your email by clicking below:`,
        'Verify Email',
        verificationUrl
      )
    );

    if (!userEmailSent) {
      throw new Error('Failed to send verification email');
    }

    // Notify admin of new user signup
    const admin = await userModel.findOne({ 'personalInfo.isAdmin': true }).session(session);
    if (admin) {
      const adminNotification = await sendNotification(
        admin._id.toString(),
        'report',
        `New User Signup Details:\nFull Name: ${newUser.personalInfo.fullname}\nEmail: ${newUser.personalInfo.email}\nUsername: ${newUser.personalInfo.username}\nPhone: ${newUser.personalInfo.phone}\nReferral Code: ${referralCode || 'None'}`,
        newUser._id.toString(),
        session
      );
      if (adminNotification) {
        logger.info(`Admin notified of new user signup: ${newUser._id}`);
      } else {
        logger.warn(`Failed to notify admin of new user: ${newUser._id}`);
      }
    } else {
      logger.warn('No admin found for notification');
    }

    await session.commitTransaction();
    return res.status(201).json({
      success: true,
      message: 'Account created successfully. Please check your email to verify your account.',
    });
  } catch (error) {
    await session.abortTransaction();
    logger.error(`Signup error: ${error.message}`, { stack: error.stack });
    return res.status(500).json({ success: false, message: 'An error occurred during signup. Please try again later.' });
  } finally {
    session.endSession();
  }
};

/**
 * Email Verification
 * @route GET /api/auth/verify/:id/:token
 * @desc Verify user’s email
 * @access Public
 * @param {string} id - User ID
 * @param {string} token - Verification token
 */
export const verification = async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const { id, token } = req.params;

    // Validate user
    const user = await userModel.findById(id).session(session);
    if (!user) {
      logger.warn(`Verification failed: User ${id} not found`);
      return res.status(400).json({ success: false, message: 'Invalid verification link. User not found.' });
    }

    // Check if already verified
    if (user.personalInfo.verified) {
      logger.info(`Verification skipped: User ${id} already verified`);
      await session.commitTransaction();
      return res.status(200).json({ success: true, message: 'Email already verified. You can log in.' });
    }

    // Validate token
    const verifiedToken = await tokenModel.findOne({ userId: id, token: token }).session(session);
    console.log(`Verification token: ${verifiedToken}`);
    if (!verifiedToken) {
      logger.warn(`Verification failed: Invalid or expired token for user ${id}`);
      return res.status(400).json({ success: false, message: 'Invalid or expired verification link. Please request a new one.' });
    }

    // Update user verification status
    await userModel.updateOne(
      { _id: id },
      { 'personalInfo.verified': true },
      { session }
    );

    // Delete used token
    await tokenModel.deleteOne({ _id: verifiedToken._id }, { session });
    logger.info(`Email verified for user: ${id}`);

    // Notify admin of email verification
    const admin = await userModel.findOne({ 'personalInfo.isAdmin': true }).session(session);
    if (admin) {
      const adminNotification = await sendNotification(
        admin._id.toString(),
        'report',
        `User Email Verified Details:\nFull Name: ${user.personalInfo.fullname}\nEmail: ${user.personalInfo.email}\nUsername: ${user.personalInfo.username}\nPhone: ${user.personalInfo.phone}`,
        user._id.toString(),
        session
      );
      if (adminNotification) {
        logger.info(`Admin notified of email verification: ${user._id}`);
      } else {
        logger.warn(`Failed to notify admin of email verification: ${user._id}`);
      }
    } else {
      logger.warn('No admin found for notification');
    }

    // Send product upload prompt email to user
    const productUploadEmailSent = await sendEmail(
      user.personalInfo.email,
      'Start Selling on BeiFity.Com',
      createEmailTemplate(
        'Get Started with Your First Listing',
        `Hello ${user.personalInfo.fullname},`,
        `Congratulations on verifying your email with <span style="color: #1e40af; font-weight: 600;">BeiF<span style="color: #fbbf24;">ity.Com</span></span>! You're now ready to start selling. List your first product today and reach thousands of buyers!`,
        'Create Your First Listing',
        `${env.FRONTEND_URL}/upload-product`
      )
    );

    if (!productUploadEmailSent) {
      logger.warn(`Failed to send product upload prompt email to user: ${user._id}`);
    } else {
      logger.info(`Product upload prompt email sent to user: ${user._id}`);
    }

    // Generate JWT for user
    const userToken = generateToken(user._id);
    await session.commitTransaction();

    return res.status(200).json({
      success: true,
      token: userToken,
      userId: user._id,
      message: 'Email verified successfully. You can now log in and start selling!',
    });
  } catch (error) {
    await session.abortTransaction();
    logger.error(`Verification error: ${error.message}`, { stack: error.stack });
    return res.status(500).json({ success: false, message: 'An error occurred during email verification. Please try again later.' });
  } finally {
    session.endSession();
  }
};

/**
 * Login
 * @route POST /api/auth/login
 * @desc Authenticate a user
 * @access Public
 * @body {email, password}
 */
export const login = async (req, res) => {
  try {
    const { email, password } = req.body;

    // Validate inputs
    if (!email || !password) {
      logger.warn('Login failed: Email or password missing', { body: req.body });
      return res.status(400).json({ success: false, message: 'Please provide both email and password' });
    }

    // Find user
    const user = await userModel.findOne({ 'personalInfo.email': email }).select('+personalInfo.password');
    if (!user) {
      logger.warn(`Login failed: User not found for email ${email}`);
      return res.status(404).json({ success: false, message: 'No account found with this email. Please sign up.' });
    }

    // Validate password
    const isValidPassword = await bcrypt.compare(password, user.personalInfo.password);
    if (!isValidPassword) {
      logger.warn(`Login failed: Invalid password for email ${email}`);
      return res.status(400).json({ success: false, message: 'Incorrect password. Please try again.' });
    }

    // Check verification status
    if (!user.personalInfo.verified) {
      let verificationToken = await tokenModel.findOne({ userId: user._id });
      if (!verificationToken) {
        verificationToken = new tokenModel({
          userId: user._id,
          token: crypto.randomBytes(32).toString('hex'),
        });
        await verificationToken.save();
        logger.debug(`Verification token created for unverified user: ${user._id}`);
      }

      const url = `${env.FRONTEND_URL}/users/verify/${user._id}/${verificationToken.token}`;
      const emailSent = await sendEmail(
        user.personalInfo.email,
        'Verify Your Email At BeiFity.Com',
        createEmailTemplate(
          'Verify Your Email Address',
          `Hello ${user.personalInfo.fullname},`,
          `Thank you for joining <span style="color: #1e40af; font-weight: 600;">BeiF<span style="color: #fbbf24;">ity.Com</span></span>! Please verify your email by clicking below:`,
          'Verify Email',
          url
        )
      );

      if (!emailSent) {
        logger.warn(`Failed to send verification email to: ${email}`);
        return res.status(500).json({ success: false, message: 'Failed to send verification email. Please try again later.' });
      }

      logger.warn(`Login failed: Email not verified for user ${user._id}`);
      return res.status(400).json({
        success: false,
        message: 'Your email is not verified. A new verification link has been sent to your email.',
      });
    }

    // Update last active and generate token
    await userModel.updateOne({ _id: user._id }, { 'analytics.lastActive': new Date() });
    const token = generateToken(user._id);
    logger.info(`User logged in: ${user._id}`);

    return res.status(200).json({
      success: true,
      message: 'Login successful',
      token,
      userId: user._id,
      isAdmin: user.personalInfo.isAdmin,
    });
  } catch (error) {
    logger.error(`Login error: ${error.message}`, { stack: error.stack });
    return res.status(500).json({ success: false, message: 'An error occurred during login. Please try again later.' });
  }
};

/**
 * Logout
 * @route POST /api/auth/logout
 * @desc Log out a user (client-side token invalidation)
 * @access Private (requires token)
 */
export const logout = async (req, res) => {
  try {
    const { token } = req.headers;
    if (!token) {
      logger.warn('Logout failed: No token provided');
      return res.status(401).json({ success: false, message: 'Authentication token is required' });
    }

    logger.info(`User logged out: ${req.user?._id || 'unknown'}`);
    return res.status(200).json({ success: true, message: 'Logged out successfully' });
  } catch (error) {
    logger.error(`Logout error: ${error.message}`, { stack: error.stack });
    return res.status(500).json({ success: false, message: 'An error occurred during logout. Please try again later.' });
  }
};

/**
 * Login with Google
 * @route POST /api/auth/google
 * @desc Authenticate with Google OAuth
 * @access Public
 * @body {token} - Google ID token
 */
export const loginWithGoogle = async (req, res) => {
  try {
    const { token } = req.body;
    if (!token) {
      logger.warn('Google login failed: No token provided');
      return res.status(400).json({ success: false, message: 'Google authentication token is required' });
    }

    const ticket = await googleClient.verifyIdToken({
      idToken: token,
      audience: env.CLIENT_ID,
    });
    const { sub: googleId, email, name, picture } = ticket.getPayload();

    let user = await userModel.findOne({ 'personalInfo.email': email });
    if (!user) {
      user = new userModel({
        personalInfo: {
          fullname: name,
          email,
          profilePicture: picture,
          phone: '', // Prompt user to add phone later
          verified: true, // Google-verified email
        },
        analytics: { lastActive: new Date() },
      });
      await user.save();
      logger.info(`New user created via Google login: ${user._id}`);
    } else {
      await userModel.updateOne(
        { _id: user._id },
        { 'analytics.lastActive': new Date() }
      );
      logger.info(`Existing user logged in via Google: ${user._id}`);
    }

    const userToken = generateToken(user._id);
    return res.status(200).json({
      success: true,
      message: 'Google login successful',
      token: userToken,
      userId: user._id,
    });
  } catch (error) {
    logger.error(`Google login error: ${error.message}`, { stack: error.stack });
    return res.status(500).json({ success: false, message: 'An error occurred during Google login. Please try again later.' });
  }
};

/**
 * Google OAuth Callback
 * @route GET /api/auth/google/callback
 * @desc Handle Google OAuth callback
 * @access Public
 */
export const googleCallback = async (req, res) => {
  try {
    const { userId, token } = req.user; // Set by Passport strategy
    logger.info(`Google callback processed for user: ${userId}`);
    res.redirect(`${env.FRONTEND_URL}/google-auth/${userId}/verify/${token}`);
  } catch (error) {
    logger.error(`Google callback error: ${error.message}`, { stack: error.stack });
    res.status(500).json({ success: false, message: 'Google authentication failed. Please try again.' });
  }
};

/**
 * Google Auth Initialization
 * @route GET /api/auth/google
 * @desc Initialize Google OAuth login
 * @access Public
 */
export const googleAuth = (req, res, next) => {
  logger.info('Initializing Google OAuth login');
  next();
};

/**
 * Get Google User
 * @route GET /api/auth/google/user
 * @desc Get authenticated Google user data
 * @access Private (requires token)
 */
export const getGoogleUser = (req, res) => {
  if (req.user) {
    logger.info(`Google user data retrieved for user: ${req.user._id}`);
    res.status(200).json({ success: true, data: req.user });
  } else {
    logger.warn('Google user data request failed: Not authenticated');
    res.status(401).json({ success: false, message: 'You are not authenticated' });
  }
};

/**
 * Logout with Google
 * @route POST /api/auth/google/logout
 * @desc Log out from Google session (client-side token handling)
 * @access Private (requires token)
 */
export const logoutWithGoogle = async (req, res) => {
  try {
    const { token } = req.headers;
    if (!token) {
      logger.warn('Google logout failed: No token provided');
      return res.status(401).json({ success: false, message: 'Authentication token is required' });
    }

    logger.info(`User logged out from Google: ${req.user?._id || 'unknown'}`);
    return res.status(200).json({ success: true, message: 'Logged out from Google successfully' });
  } catch (error) {
    logger.error(`Google logout error: ${error.message}`, { stack: error.stack });
    return res.status(500).json({ success: false, message: 'An error occurred during logout. Please try again later.' });
  }
};

/**
 * Get Email Reset Code
 * @route POST /api/auth/reset
 * @desc Send a password reset code to user’s email
 * @access Public
 * @body {email}
 */
export const getEmailReset = async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      logger.warn('Password reset failed: Email missing');
      return res.status(400).json({ success: false, message: 'Please provide an email address' });
    }

    const user = await userModel.findOne({ 'personalInfo.email': email });
    if (!user) {
      logger.warn(`Password reset failed: Email ${email} not found`);
      return res.status(404).json({ success: false, message: 'No account found with this email' });
    }

    await resetTokenModel.deleteMany({ userId: user._id });
    const code = generateRandomNumbers().join('');
    const resetToken = new resetTokenModel({
      userId: user._id,
      code,
      expiresAt: new Date(Date.now() + 10 * 60 * 1000),
    });
    await resetToken.save();
    logger.debug(`Password reset token created for user: ${user._id}`);

    const sent = await sendEmail(
      user.personalInfo.email,
      'Code Verification At BeiFity.Com',
      createEmailTemplate(
        'Password Reset Code',
        `Hello ${user.personalInfo.fullname || 'User'},`,
        `Use this code to reset your <span style="color: #1e40af; font-weight: 600;">BeiF<span style="color: #fbbf24;">ity.Com</span></span> password:<br><br>
        <div style="font-size: 25px; font-weight: 700; color: #1e40af; background-color: #f0f4f8; padding: 15px 20px; border-radius: 8px; display: inline-block; letter-spacing: 5px;">${code}</div>`,
        '',
        ''
      )
    );

    if (sent) {
      logger.info(`Password reset code sent to email: ${email}`);
      return res.status(200).json({ success: true, message: 'A verification code has been sent to your email' });
    }
    logger.warn(`Failed to send password reset email to: ${email}`);
    return res.status(500).json({ success: false, message: 'Failed to send verification code. Please try again.' });
  } catch (error) {
    logger.error(`Password reset error: ${error.message}`, { stack: error.stack });
    return res.status(500).json({ success: false, message: 'An error occurred during password reset. Please try again later.' });
  }
};

/**
 * Verify Reset Code
 * @route POST /api/auth/reset/verify
 * @desc Verify the password reset code
 * @access Public
 * @body {email, code}
 */
export const codeVerification = async (req, res) => {
  try {
    const { email, code } = req.body;

    if (!email || !code) {
      logger.warn('Code verification failed: Email or code missing', { body: req.body });
      return res.status(400).json({ success: false, message: 'Please provide both email and verification code' });
    }

    const user = await userModel.findOne({ 'personalInfo.email': email });
    if (!user) {
      logger.warn(`Code verification failed: Email ${email} not found`);
      return res.status(404).json({ success: false, message: 'No account found with this email' });
    }

    const resetToken = await resetTokenModel.findOne({
      userId: user._id,
      code,
      expiresAt: { $gt: new Date() },
    });

    if (!resetToken) {
      logger.warn(`Code verification failed: Invalid or expired code for email ${email}`);
      return res.status(401).json({ success: false, message: 'Invalid or expired verification code. Please request a new one.' });
    }

    await resetToken.deleteOne();
    logger.info(`Reset code verified for user: ${user._id}`);
    return res.status(200).json({ success: true, message: 'Verification code validated successfully' });
  } catch (error) {
    logger.error(`Code verification error: ${error.message}`, { stack: error.stack });
    return res.status(500).json({ success: false, message: 'An error occurred during code verification. Please try again later.' });
  }
};

/**
 * Change Password
 * @route POST /api/auth/reset/change
 * @desc Update user’s password after verification
 * @access Public
 * @body {email, password}
 */
export const passwordChange = async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      logger.warn('Password change failed: Email or password missing', { body: req.body });
      return res.status(400).json({ success: false, message: 'Please provide both email and new password' });
    }

    // Validate password strength
    if (password.length < 8) {
      logger.warn('Password change failed: Password too short', { email });
      return res.status(400).json({ success: false, message: 'Password must be at least 8 characters long' });
    }

    const user = await userModel.findOne({ 'personalInfo.email': email });
    if (!user) {
      logger.warn(`Password change failed: Email ${email} not found`);
      return res.status(404).json({ success: false, message: 'No account found with this email' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    await userModel.updateOne(
      { _id: user._id },
      { 'personalInfo.password': hashedPassword }
    );

    await resetTokenModel.deleteMany({ userId: user._id });
    logger.info(`Password updated for user: ${user._id}`);
    return res.status(200).json({ success: true, message: 'Password updated successfully. You can now log in with your new password.' });
  } catch (error) {
    logger.error(`Password change error: ${error.message}`, { stack: error.stack });
    return res.status(500).json({ success: false, message: 'An error occurred during password update. Please try again later.' });
  }
};
/**
 * Send Verification Reminder Emails
 * @route POST /api/auth/remind-unverified
 * @desc Send reminder emails to all unverified users
 * @access Private (Admin only)
 */
export const sendVerificationReminders = async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    // Verify admin privileges
    const admin = await userModel.findById(req.user?._id).session(session);
    if (!admin || !admin.personalInfo.isAdmin) {
      logger.warn(`Unauthorized attempt to send verification reminders by user: ${req.user?._id || 'unknown'}`);
      return res.status(403).json({ success: false, message: 'Only admins can perform this action' });
    }

    // Find all unverified users
    const unverifiedUsers = await userModel.find({ 'personalInfo.verified': false }).session(session);
    if (unverifiedUsers.length === 0) {
      logger.info('No unverified users found for reminder emails');
      return res.status(200).json({ success: true, message: 'No unverified users found' });
    }

    let emailsSent = 0;
    const failedEmails = [];

    // Iterate through unverified users
    for (const user of unverifiedUsers) {
      try {
        // Check for existing verification token or create a new one
        let verificationToken = await tokenModel.findOne({ userId: user._id }).session(session);
        if (!verificationToken) {
          verificationToken = new tokenModel({
            userId: user._id,
            token: crypto.randomBytes(32).toString('hex'),
          });
          await verificationToken.save({ session });
          logger.debug(`Verification token created for user: ${user._id}`);
        }

        // Send reminder email
        const verificationUrl = `${env.FRONTEND_URL}/users/verify/${user._id}/${verificationToken.token}`;
        console.log(verificationUrl)
        const emailSent = await sendEmail(
          user.personalInfo.email,
          'Don’t Miss Out: Verify Your BeiFity.Com Account Now!',
          createEmailTemplate(
            'Complete Your Email Verification',
            `Hello ${user.personalInfo.fullname || 'User'},`,
            `Your journey with <span style="color: #1e40af; font-weight: 600;">BeiF<span style="color: #fbbf24;">ity.Com</span></span> is almost ready to begin! Verifying your email unlocks the full potential of your account, letting you:<br><br>
            - List and sell your products to thousands of buyers<br>
            - Connect with a vibrant community of sellers<br>
            - Access exclusive features and updates<br><br>
            It only takes a moment to verify your email, and you’ll be ready to start selling in no time. Don’t wait—click below to complete your verification now!`,
            'Verify My Email Now',
            verificationUrl
          )
        );

        if (emailSent) {
          emailsSent++;
          logger.info(`Verification reminder sent to user: ${user._id} (${user.personalInfo.email})`);
        } else {
          failedEmails.push(user.personalInfo.email);
          logger.warn(`Failed to send verification reminder to user: ${user._id} (${user.personalInfo.email})`);
        }
      } catch (emailError) {
        failedEmails.push(user.personalInfo.email);
        logger.error(`Error sending verification reminder to ${user.personalInfo.email}: ${emailError.message}`, { stack: emailError.stack });
      }
    }

    await session.commitTransaction();

    // Prepare response
    const responseMessage =
      emailsSent === unverifiedUsers.length
        ? `Successfully sent verification reminders to ${emailsSent} user(s)`
        : `Sent verification reminders to ${emailsSent} user(s). Failed to send to ${failedEmails.length} user(s): ${failedEmails.join(', ')}`;

    return res.status(200).json({
      success: true,
      message: responseMessage,
      emailsSent,
      failedEmails,
    });
  } catch (error) {
    await session.abortTransaction();
    logger.error(`Verification reminder error: ${error.message}`, { stack: error.stack });
    return res.status(500).json({ success: false, message: 'An error occurred while sending verification reminders. Please try again later.' });
  } finally {
    session.endSession();
  }
};

export const sendVerificationReminderToOne = async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    // Verify admin privileges
    const admin = await userModel.findById(req.user?._id).session(session);
    if (!admin || !admin.personalInfo.isAdmin) {
      logger.warn(`Unauthorized attempt to send verification reminder by user: ${req.user?._id || 'unknown'}`);
      return res.status(403).json({ success: false, message: 'Only admins can perform this action' });
    }

    // Get user ID from request parameters
    const userEmail = req.body.userEmail
    if (!userEmail) {
      logger.warn('Verification reminder failed: User email missing');
      return res.status(400).json({ success: false, message: 'Please provide a user email' });
    }
    // Find the specific unverified user
    const user = await userModel.findOne({ 
      "personalInfo.email": userEmail,
      'personalInfo.verified': false 
    }).session(session);

    if (!user) {
      logger.info(`User ${userEmail} not found or already verified`);
      return res.status(404).json({ 
        success: false, 
        message: 'User not found or already verified' 
      });
    }

    // Check for existing verification token or create a new one
    let verificationToken = await tokenModel.findOne({ userId: user._id }).session(session);
    if (!verificationToken) {
      verificationToken = new tokenModel({
        userId: user._id,
        token: crypto.randomBytes(32).toString('hex'),
      });
      await verificationToken.save({ session });
      logger.debug(`Verification token created for user: ${user._id}`);
    }

    // Send reminder email
    const verificationUrl = `${env.FRONTEND_URL}/users/verify/${user._id}/${verificationToken.token}`;
    console.log(verificationUrl);
    
    const emailSent = await sendEmail(
      user.personalInfo.email,
      'Don\'t Miss Out: Verify Your BeiFity.Com Account Now!',
      createEmailTemplate(
        'Complete Your Email Verification',
        `Hello ${user.personalInfo.fullname || 'User'},`,
        `Your journey with <span style="color: #1e40af; font-weight: 600;">BeiF<span style="color: #fbbf24;">ity.Com</span></span> is almost ready to begin! Verifying your email unlocks the full potential of your account, letting you:<br><br>
        - List and sell your products to thousands of buyers<br>
        - Connect with a vibrant community of sellers<br>
        - Access exclusive features and updates<br><br>
        It only takes a moment to verify your email, and you'll be ready to start selling in no time. Don't wait—click below to complete your verification now!`,
        'Verify My Email Now',
        verificationUrl
      )
    );

    await session.commitTransaction();

    if (emailSent) {
      logger.info(`Verification reminder sent to user: ${user._id} (${user.personalInfo.email})`);
      return res.status(200).json({ 
        success: true, 
        message: `Verification reminder sent successfully to ${user.personalInfo.email}` 
      });
    } else {
      logger.warn(`Failed to send verification reminder to user: ${user._id} (${user.personalInfo.email})`);
      return res.status(500).json({ 
        success: false, 
        message: `Failed to send verification reminder to ${user.personalInfo.email}` 
      });
    }
  } catch (error) {
    await session.abortTransaction();
    logger.error(`Verification reminder error: ${error.message}`, { stack: error.stack });
    return res.status(500).json({ 
      success: false, 
      message: 'An error occurred while sending verification reminder. Please try again later.' 
    });
  } finally {
    session.endSession();
  }
};


export const getUnverified = async (req, res) => {
  try {
    const unverifiedUsers = await userModel.find({ 'personalInfo.verified': false });
    const users = unverifiedUsers.map(user => ({
      fullname: user.personalInfo.fullname,
      email: user.personalInfo.email,
      phone: user.personalInfo.phone,
    }));
    return res.status(200).json({ success: true, data: users });
  } catch (error) {
    logger.error(`Error fetching unverified users: ${error.message}`, { stack: error.stack });
    return res.status(500).json({ success: false, message: 'An error occurred while fetching unverified users. Please try again later.' });
  }
}

export const resendVerification = async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) {
      logger.warn('Resend verification failed: Email missing');
      return res.status(400).json({ success: false, message: 'Please provide an email address' });
    }
    const user = await userModel.findOne({ 'personalInfo.email': email });
    if (!user) {
      logger.warn(`Resend verification failed: Email ${email} not found`);
      return res.status(404).json({ success: false, message: 'No account found with this email' });
    }

    if (user.personalInfo.verified) {
      logger.info(`Resend verification skipped: User ${user._id} already verified`);
      return res.status(200).json({ success: true, message: 'Email is already verified. You can log in.' });
    }
    let verificationToken = await tokenModel.findOne({ userId: user._id });
    if (!verificationToken) {
      verificationToken = new tokenModel({
        userId: user._id,
        token: crypto.randomBytes(32).toString('hex'),
      });
      await verificationToken.save();
      logger.debug(`Verification token created for user: ${user._id}`);
    }
    const verificationUrl = `${env.FRONTEND_URL}/users/verify/${user._id}/${verificationToken.token}`;
    const emailSent = await sendEmail(
      user.personalInfo.email,
      'Verify Your Email At BeiFity.Com',
      createEmailTemplate(
        'Verify Your Email Address',
        `Hello ${user.personalInfo.fullname},`,
        `Thank you for joining <span style="color: #1e40af; font-weight: 600;">BeiF<span style="color: #fbbf24;">ity.Com</span></span>! Please verify your email by clicking below:`,
        'Verify Email',
        verificationUrl
      )
    );
    if (!emailSent) {
      logger.warn(`Failed to resend verification email to: ${email}`);
      return res.status(500).json({ success: false, message: 'Failed to send verification email. Please try again later.' });
    }
    logger.info(`Verification email resent to user: ${user._id} (${user.personalInfo.email})`);
    return res.status(200).json({
      success: true,
      message: 'A new verification link has been sent to your email. Please check your inbox.',
    });
  }
  catch (error) {
    logger.error(`Resend verification error: ${error.message}`, { stack: error.stack });
    return res.status(500).json({ success: false, message: 'An error occurred while resending verification email. Please try again later.' });
  }
}