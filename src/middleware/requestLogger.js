const logger = require('../utils/logger');

function requestLogger(req, res, next) {
  const start = Date.now();
  const { method, originalUrl, ip } = req;

  res.on('finish', () => {
    const duration = Date.now() - start;
    const { statusCode } = res;
    
    let logLevel = 'info';
    if (statusCode >= 500) {
      logLevel = 'error';
    } else if (statusCode >= 400) {
      logLevel = 'warn';
    }

    logger.log(logLevel, `${method} ${originalUrl} ${statusCode} - ${duration}ms - IP: ${ip}`);
  });

  next();
}

module.exports = requestLogger;
