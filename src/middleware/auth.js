const jwt = require('jsonwebtoken');
const db = require('../utils/db');
const logger = require('../utils/logger');

const JWT_SECRET = process.env.JWT_SECRET || 'xeno-super-secret-key-12345';

/**
 * Require authentication middleware.
 * Returns 401 if token is missing or invalid.
 */
function requireAuth(req, res, next) {
  const token = req.cookies?.token;

  if (!token) {
    return res.status(401).json({ error: 'Authentication required. Please log in.' });
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    const user = db.findUserByEmail(decoded.email);
    if (!user) {
      return res.status(401).json({ error: 'User session invalid. Please log in again.' });
    }

    req.user = {
      id: user.id,
      name: user.name,
      email: user.email,
    };
    next();
  } catch (err) {
    logger.warn(`JWT verification failed: ${err.message}`);
    return res.status(401).json({ error: 'Session expired or invalid. Please log in again.' });
  }
}

/**
 * Optional authentication middleware.
 * Attaches req.user if token is present and valid, but does not block if missing or invalid.
 */
function optionalAuth(req, res, next) {
  const token = req.cookies?.token;

  if (!token) {
    return next();
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    const user = db.findUserByEmail(decoded.email);
    if (user) {
      req.user = {
        id: user.id,
        name: user.name,
        email: user.email,
      };
    }
  } catch (err) {
    // Fail silently for optional auth
    logger.debug(`Optional JWT verification failed: ${err.message}`);
  }
  next();
}

module.exports = {
  requireAuth,
  optionalAuth,
  JWT_SECRET,
};
