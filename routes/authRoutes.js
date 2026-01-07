import express from 'express';
import {
  signup,
  verification,
  login,
  logout,
  loginWithGoogle,
  logoutWithGoogle,
  getEmailReset,
  codeVerification,
  passwordChange,
  googleAuth,
  googleCallback,
  getGoogleUser,
  sendVerificationReminders,
  sendVerificationReminderToOne,
  getUnverified,
  resendVerification,
} from '../controllers/authController.js';
import passport from 'passport';
import { authUser } from '../middlewares/authMiddleware.js';
import env from '../config/env.js';

const authRouter = express.Router();

// Public Routes
authRouter.post('/signup', signup);
authRouter.get('/verify/:id/:token', verification);
authRouter.post('/login', login);
authRouter.post('/resend-verification', resendVerification);
authRouter.post('/reset', getEmailReset);
authRouter.post('/reset/verify', codeVerification);
authRouter.post('/reset/change', passwordChange);
authRouter.post('/verification', authUser, sendVerificationReminders);
authRouter.post('/verify-one', authUser, sendVerificationReminderToOne)
authRouter.get('/unverified', authUser, getUnverified);

// Private Routes (require authentication)
authRouter.post('/logout', authUser, logout);
authRouter.post('/google/logout', authUser, logoutWithGoogle);
authRouter.get('/google/user', authUser, getGoogleUser);

// Google OAuth Routes
authRouter.get('/google', googleAuth, passport.authenticate('google', { scope: ['profile', 'email'] }));

authRouter.get(
  '/google/callback',
  passport.authenticate('google', { session: false, failureRedirect: `${env.FRONTEND_URL}/login` }),
  googleCallback
);

export default authRouter;