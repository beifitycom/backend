import session from 'express-session';
import MongoStore from 'connect-mongo';
import env from './env.js';

const sessionConfig = {
  secret: env.SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  store: MongoStore.create({
    mongoUrl: env.MONGO_DB_URL,
    collectionName: 'sessions',
    ttl: 14 * 24 * 60 * 60, // 14 days in seconds
    autoRemove: 'native',
    connectTimeoutMS: 10000,
  }),
  cookie: {
    secure: env.NODE_ENV === 'production',
    maxAge: 14 * 24 * 60 * 60 * 1000, // 14 days in milliseconds
    httpOnly: true,
    sameSite: 'lax',
  },
};

export default sessionConfig;