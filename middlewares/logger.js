import logger from '../utils/logger.js';

const httpLogger = (req, res, next) => {
  const start = Date.now();

  res.on('finish', () => {
    const duration = Date.now() - start;
    const { method, originalUrl } = req;
    const { statusCode } = res;
    const ip = req.ip || req.connection.remoteAddress;
    const userId = req.user?._id || 'anonymous';

    logger.http(`${method} ${originalUrl} ${statusCode} ${duration}ms | User: ${userId} | IP: ${ip}`);
  });

  next();
};

export default httpLogger;