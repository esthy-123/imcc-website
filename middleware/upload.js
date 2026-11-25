const crypto = require('crypto');
const multer = require('multer');
const { UPLOADS_DIR } = require('../config/database');

const IMAGE_MIME_TO_EXT = new Map([
  ['image/jpeg', '.jpg'],
  ['image/png', '.png'],
  ['image/webp', '.webp'],
  ['image/gif', '.gif']
]);

const VIDEO_MIME_TO_EXT = new Map([
  ['video/mp4', '.mp4'],
  ['video/webm', '.webm'],
  ['video/quicktime', '.mov'],
  ['video/ogg', '.ogv'],
  ['video/x-m4v', '.m4v']
]);

const MEDIA_MIME_TO_EXT = new Map([...IMAGE_MIME_TO_EXT, ...VIDEO_MIME_TO_EXT]);

const MAX_IMAGE_SIZE = 5 * 1024 * 1024; // 5 MB
const MAX_MEDIA_SIZE = 100 * 1024 * 1024; // 100 MB (supports videos with sound)

function isVideoMimeType(mimeType) {
  return VIDEO_MIME_TO_EXT.has(mimeType);
}

function createStorage(mimeMap) {
  return multer.diskStorage({
    destination: (req, file, cb) => {
      cb(null, UPLOADS_DIR);
    },
    filename: (req, file, cb) => {
      const ext = mimeMap.get(file.mimetype) || '.bin';
      const unique = `${Date.now()}-${crypto.randomBytes(6).toString('hex')}`;
      cb(null, `imcc-${unique}${ext}`);
    }
  });
}

function imageFileFilter(req, file, cb) {
  if (IMAGE_MIME_TO_EXT.has(file.mimetype)) {
    cb(null, true);
  } else {
    const err = new Error('Unsupported image format. Please upload JPG, PNG, WebP, or GIF.');
    err.statusCode = 400;
    cb(err);
  }
}

function mediaFileFilter(req, file, cb) {
  if (MEDIA_MIME_TO_EXT.has(file.mimetype)) {
    cb(null, true);
  } else {
    const err = new Error(
      'Unsupported file format. Please upload an image (JPG, PNG, WebP, GIF) or a video with audio (MP4, WebM, MOV, M4V, OGV).'
    );
    err.statusCode = 400;
    cb(err);
  }
}

const uploadImage = multer({
  storage: createStorage(IMAGE_MIME_TO_EXT),
  fileFilter: imageFileFilter,
  limits: { fileSize: MAX_IMAGE_SIZE }
});

const uploadMediaMulter = multer({
  storage: createStorage(MEDIA_MIME_TO_EXT),
  fileFilter: mediaFileFilter,
  limits: { fileSize: MAX_MEDIA_SIZE }
});

// Accepts either field name "media" or legacy "image" and exposes it on req.file
function uploadMedia(req, res, next) {
  uploadMediaMulter.fields([
    { name: 'media', maxCount: 1 },
    { name: 'image', maxCount: 1 }
  ])(req, res, (err) => {
    if (err) return next(err);
    const mediaFiles = req.files && (req.files.media || req.files.image);
    req.file = Array.isArray(mediaFiles) && mediaFiles.length > 0 ? mediaFiles[0] : undefined;
    next();
  });
}

module.exports = {
  uploadImage,
  uploadMedia,
  isVideoMimeType,
  MAX_IMAGE_SIZE,
  MAX_MEDIA_SIZE
};
