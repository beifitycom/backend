import { cleanEnv, str, url, email, num, bool } from 'envalid';
import 'dotenv/config';

const env = cleanEnv(process.env, {
  MONGO_DB_URL: str({ desc: 'MongoDB connection URL' }),
  SECRET_KEY: str({ desc: 'JWT secret key' }),
  CLIENT_ID: str({ desc: 'Google OAuth client ID' }),
  CLIENT_SECRET: str({ desc: 'Google OAuth client secret' }),
  FRONTEND_URL: url({ desc: 'Frontend URL', example: 'http://localhost:5173' }),
  BACKEND_URL: url({ desc: 'Backend URL', example: 'https://beifity-backend.up.railway.app' }),
  SESSION_SECRET: str({ desc: 'Session secret for express-session' }),
  HOST: str({ desc: 'SMTP host', default: 'smtp.zoho.com' }),
  EMAIL_SERVICE: str({ desc: 'Email service provider', default: 'gmail' }),
  EMAIL_PORT: num({ desc: 'SMTP port', default: 465 }),
  SECURE: bool({ desc: 'SMTP secure connection', default: true }),
  USER: email({ desc: 'SMTP email address' }),
  PASS: str({ desc: 'SMTP email password or app password' }),
  RECOVERY: str({ desc: 'Recovery key (unused)', default: '' }),
  RESEND_API_KEY: str({ desc: 'Resend API key (unused)', default: '' }),
  CLOUDINARY_CLOUD_NAME: str({ desc: 'Cloudinary cloud name' }),
  CLOUDINARY_API_KEY: str({ desc: 'Cloudinary API key' }),
  CLOUDINARY_API_SECRET: str({ desc: 'Cloudinary API secret' }),
  VAPID_PUBLIC_KEY: str({ desc: 'Webpush VAPID public key' }),
  VAPID_PRIVATE_KEY: str({ desc: 'Webpush VAPID private key' }),
  NODE_ENV: str({ desc: 'Node environment', choices: ['development', 'production'], default: 'development' }),
});

export default env;