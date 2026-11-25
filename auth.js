const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { get, run } = require('../config/database');
const { requireChefAuth, JWT_SECRET } = require('../middleware/auth');

const router = express.Router();

// Lightweight in-memory rate limiter for login attempts (per IP)
const LOGIN_WINDOW_MS = 15 * 60 * 1000;
const LOGIN_MAX_ATTEMPTS = 15;
const loginAttempts = new Map();

function checkLoginRateLimit(req, res, next) {
  const ip = req.ip || req.socket.remoteAddress || 'unknown';
  const now = Date.now();
  const record = loginAttempts.get(ip);

  if (record && now < record.resetAt) {
    if (record.count >= LOGIN_MAX_ATTEMPTS) {
      const retryMinutes = Math.ceil((record.resetAt - now) / 60000);
      return res.status(429).json({
        error: `Too many failed sign-in attempts. Please try again in ${retryMinutes} minute(s).`
      });
    }
  } else if (record) {
    loginAttempts.delete(ip);
  }
  next();
}

function recordFailedLogin(ip) {
  const now = Date.now();
  const record = loginAttempts.get(ip);
  if (!record || now >= record.resetAt) {
    loginAttempts.set(ip, { count: 1, resetAt: now + LOGIN_WINDOW_MS });
  } else {
    record.count += 1;
  }
}

function clearLoginAttempts(ip) {
  loginAttempts.delete(ip);
}

router.post('/login', checkLoginRateLimit, async (req, res, next) => {
  try {
    const ip = req.ip || req.socket.remoteAddress || 'unknown';
    const { email, password } = req.body || {};
    if (typeof email !== 'string' || typeof password !== 'string' || !email.trim() || !password) {
      return res.status(400).json({ error: 'Email and password are required.' });
    }

    const admin = await get('SELECT * FROM admins WHERE email = ?', [
      email.trim().toLowerCase()
    ]);

    if (!admin) {
      recordFailedLogin(ip);
      return res.status(401).json({ error: 'Invalid credentials.' });
    }

    const valid = await bcrypt.compare(password, admin.password_hash);
    if (!valid) {
      recordFailedLogin(ip);
      return res.status(401).json({ error: 'Invalid credentials.' });
    }

    clearLoginAttempts(ip);

    const token = jwt.sign(
      { id: admin.id, email: admin.email, name: admin.name, role: 'chef' },
      JWT_SECRET,
      { expiresIn: '24h' }
    );

    res.json({
      token,
      chef: { id: admin.id, name: admin.name, email: admin.email }
    });
  } catch (err) {
    next(err);
  }
});

router.get('/me', requireChefAuth, async (req, res, next) => {
  try {
    const admin = await get('SELECT id, name, email FROM admins WHERE id = ?', [req.chef.id]);
    if (!admin) {
      return res.status(404).json({ error: 'Account not found.' });
    }
    res.json({ chef: admin });
  } catch (err) {
    next(err);
  }
});

router.put('/password', requireChefAuth, async (req, res, next) => {
  try {
    const { currentPassword, newPassword } = req.body || {};
    if (
      typeof currentPassword !== 'string' ||
      typeof newPassword !== 'string' ||
      !currentPassword ||
      newPassword.length < 8
    ) {
      return res.status(400).json({
        error: 'New password must be at least 8 characters long.'
      });
    }

    const admin = await get('SELECT * FROM admins WHERE id = ?', [req.chef.id]);
    if (!admin) {
      return res.status(404).json({ error: 'Account not found.' });
    }

    const valid = await bcrypt.compare(currentPassword, admin.password_hash);
    if (!valid) {
      return res.status(401).json({ error: 'Current password is incorrect.' });
    }

    const newHash = await bcrypt.hash(newPassword, 10);
    await run(
      'UPDATE admins SET password_hash = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
      [newHash, req.chef.id]
    );

    res.json({ message: 'Password updated successfully.' });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
