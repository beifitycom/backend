import 'dotenv/config';

const corsOptions = {
  origin:  '*',
  methods: ['GET', 'POST', 'OPTIONS', 'PATCH', 'DELETE', 'PUT'],
  credentials: true,
  allowedHeaders: ['Content-Type', 'Authorization', 'token'],
};

export default corsOptions;