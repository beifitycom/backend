import webpush from 'web-push';
import 'dotenv/config';
import logger from '../utils/logger.js';

const configureWebpush = () => {
  try {
    webpush.setVapidDetails(
      'mailto:eddymuchiri123@gmail.com',
      process.env.VAPID_PUBLIC_KEY,
      process.env.VAPID_PRIVATE_KEY
    );
    logger.info('Webpush configured ');
  } catch (error) {
    logger.error('Webpush configuration error:', error);
  }};

export default configureWebpush;