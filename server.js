require('dotenv').config();
const path = require('path');
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const multer = require('multer');
const { db, initDatabase, UPLOADS_DIR } = require('./config/database');

const publicRoutes = require('./routes/public');
const authRoutes = require('./routes/auth');
const adminRoutes = require('./routes/admin');

const app = express();
const PORT = Number(process.env.PORT) || 3000;
const HOST = process.env.HOST || '0.0.0.0';

app.set('trust proxy', 1);

// HTTP security headers (allow embedded Google Maps iframe & inline fonts)
app.use(
  helmet({
    contentSecurityPolicy: false,
    crossOriginEmbedderPolicy: false
  })
);
app.use(cors());
app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true }));

// Static assets with platform-friendly caching
app.use(
  '/assets',
  express.static(path.join(__dirname, 'public', 'assets'), {
    maxAge: '7d',
    etag: true
  })
);
app.use(
  '/uploads',
  express.static(UPLOADS_DIR, {
    maxAge: '7d',
    etag: true
  })
);
app.use(
  express.static(path.join(__dirname, 'public'), {
    etag: true,
    setHeaders: (res, filePath) => {
      if (filePath.endsWith('.html')) {
        res.setHeader('Cache-Control', 'no-cache');
      }
    }
  })
);

// API routes
app.use('/api/public', publicRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/admin', adminRoutes);

// Health check endpoint for cloud hosting (Render / Railway / Fly.io / Docker)
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    service: 'imcc-website',
    timestamp: new Date().toISOString()
  });
});

// JSON 404 for unknown API routes
app.use('/api', (req, res) => {
  res.status(404).json({ error: 'API endpoint not found.' });
});

// Centralized error handler
app.use((err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({
        error: 'File is too large. Maximum size is 5 MB for logos/services and 100 MB for gallery or publication photos and videos.'
      });
    }
    return res.status(400).json({ error: err.message || 'File upload error.' });
  }

  if (err && err.type === 'entity.parse.failed') {
    return res.status(400).json({ error: 'Invalid JSON request body.' });
  }

  if (err && err.statusCode && err.statusCode >= 400 && err.statusCode < 500) {
    return res.status(err.statusCode).json({ error: err.message });
  }

  console.error('[Server Error]', err);
  res.status(500).json({ error: 'Internal server error.' });
});

let server;

initDatabase()
  .then(() => {
    server = app.listen(PORT, HOST, () => {
      console.log(`IMCC server running on http://localhost:${PORT} (bound to ${HOST})`);
      console.log(`Executive Portal available at http://localhost:${PORT}/admin.html`);
    });
  })
  .catch((err) => {
    console.error('Failed to initialize SQLite database:', err);
    process.exit(1);
  });

function gracefulShutdown(signal) {
  console.log(`Received ${signal}. Shutting down IMCC server...`);
  if (server) {
    server.close(() => {
      try {
        db.close();
      } catch {
        // ignore if already closed
      }
      process.exit(0);
    });
  } else {
    process.exit(0);
  }
}

process.on('SIGINT', () => gracefulShutdown('SIGINT'));
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
