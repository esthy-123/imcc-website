const jwt = require('jsonwebtoken');

const DEFAULT_DEV_SECRET = 'imcc_dev_secret_change_in_production';
const JWT_SECRET = process.env.JWT_SECRET || DEFAULT_DEV_SECRET;

if (process.env.NODE_ENV === 'production' && (!process.env.JWT_SECRET || JWT_SECRET === DEFAULT_DEV_SECRET || JWT_SECRET.length < 24)) {
  console.warn('[SECURITY WARNING] JWT_SECRET is missing or weak in production. Set a strong random JWT_SECRET environment variable.');
}

function requireChefAuth(req, res, next) {
  const authHeader = req.headers.authorization || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';

  if (!token) {
    return res.status(401).json({ error: 'Executive access only. Please sign in.' });
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.chef = decoded;
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Session expired or invalid. Please sign in again.' });
  }
}

module.exports = { requireChefAuth, JWT_SECRET };
