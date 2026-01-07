import jwt from 'jsonwebtoken';
import env from '../config/env.js';
import logger from '../utils/logger.js';
import { OAuth2Client } from 'google-auth-library';

// Authentication middleware
export const authUser = (req, res, next) => {
  const { token } = req.headers;

  if (!token) {
    logger.warn('Authentication failed: No token provided', { url: req.originalUrl });
    return res.status(401).json({ success: false, message: 'Please log in to proceed' });
  }

  try {
    const decoded = jwt.verify(token, env.SECRET_KEY);
    req.user = decoded; // Attach decoded user data (e.g., _id) to req.user
    logger.debug(`Token verified for user ${decoded._id}`, { userId: decoded._id, url: req.originalUrl });
    next();
  } catch (error) {
    let message = 'Unauthorized: Invalid token';
    if (error.name === 'TokenExpiredError') {
      message = 'Unauthorized: Token has expired';
    } else if (error.name === 'JsonWebTokenError') {
      message = 'Unauthorized: Malformed token';
    }

    logger.error(`Authentication error: ${error.message}`, {
      stack: error.stack,
      url: req.originalUrl,
      token: token.substring(0, 20) + '...', // Log partial token for debugging
    });
    return res.status(401).json({ success: false, message });
  }
};

