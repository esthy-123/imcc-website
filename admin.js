const path = require('path');
const fs = require('fs');
const express = require('express');
const { get, all, run, UPLOADS_DIR } = require('../config/database');
const { requireChefAuth } = require('../middleware/auth');
const { uploadImage, uploadMedia, isVideoMimeType } = require('../middleware/upload');

const router = express.Router();
router.use(requireChefAuth);

function inferMediaTypeFromUrl(url) {
  return /\.(mp4|webm|mov|m4v|ogv|ogg)(\?.*)?$/i.test(String(url || '')) ? 'video' : 'image';
}

function removeUploadedFile(fileUrl) {
  if (!fileUrl || typeof fileUrl !== 'string' || !fileUrl.startsWith('/uploads/')) return;
  const filename = path.basename(fileUrl);
  const fullPath = path.join(UPLOADS_DIR, filename);
  if (fs.existsSync(fullPath)) {
    fs.unlink(fullPath, () => {});
  }
}

function cleanupRequestFile(req) {
  if (req && req.file && req.file.filename) {
    removeUploadedFile(`/uploads/${req.file.filename}`);
  }
}

function parsePositiveId(rawId) {
  const id = Number.parseInt(rawId, 10);
  return Number.isInteger(id) && id > 0 ? id : null;
}

function toTrimmedString(val, fallback = '') {
  if (val === undefined || val === null) return fallback;
  return String(val).trim();
}

function sanitizeHttpUrl(rawUrl) {
  const trimmed = toTrimmedString(rawUrl);
  if (!trimmed) return '';
  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol === 'http:' || parsed.protocol === 'https:') {
      return parsed.href;
    }
  } catch {
    return null;
  }
  return null;
}

/* ==================== COMPANY PROFILE ==================== */

router.get('/profile', async (req, res, next) => {
  try {
    const profile = await get('SELECT * FROM company_profile WHERE id = 1');
    res.json(profile);
  } catch (err) {
    next(err);
  }
});

router.put('/profile', async (req, res, next) => {
  try {
    const body = req.body || {};
    const name = toTrimmedString(body.name);
    const phone = toTrimmedString(body.phone);
    const whatsappDigits = toTrimmedString(body.whatsapp).replace(/[^\d]/g, '');

    if (!name || !phone || !whatsappDigits) {
      return res.status(400).json({ error: 'Company name, phone number, and WhatsApp number are required.' });
    }

    const socialFields = [
      ['Instagram URL', body.instagram_url],
      ['Facebook URL', body.facebook_url],
      ['LinkedIn URL', body.linkedin_url],
      ['TikTok URL', body.tiktok_url]
    ];

    const sanitizedSocials = [];
    for (const [label, value] of socialFields) {
      const cleaned = sanitizeHttpUrl(value);
      if (cleaned === null) {
        return res.status(400).json({ error: `${label} must start with http:// or https://.` });
      }
      sanitizedSocials.push(cleaned);
    }

    await run(
      `UPDATE company_profile SET
        name = ?, tagline = ?, about = ?, vision = ?, mission = ?, values_text = ?,
        reg_no = ?, tpin = ?, phone = ?, whatsapp = ?, whatsapp_message = ?,
        email = ?, secondary_email = ?, address = ?,
        instagram_url = ?, facebook_url = ?, linkedin_url = ?, tiktok_url = ?,
        updated_at = CURRENT_TIMESTAMP
       WHERE id = 1`,
      [
        name,
        toTrimmedString(body.tagline),
        toTrimmedString(body.about),
        toTrimmedString(body.vision),
        toTrimmedString(body.mission),
        toTrimmedString(body.values_text),
        toTrimmedString(body.reg_no),
        toTrimmedString(body.tpin),
        phone,
        whatsappDigits,
        toTrimmedString(body.whatsapp_message, 'Hello IMCC, I would like to get in touch.'),
        toTrimmedString(body.email),
        toTrimmedString(body.secondary_email),
        toTrimmedString(body.address, 'Ndola, Zambia'),
        sanitizedSocials[0],
        sanitizedSocials[1],
        sanitizedSocials[2],
        sanitizedSocials[3]
      ]
    );

    const updated = await get('SELECT * FROM company_profile WHERE id = 1');
    res.json({ message: 'Company profile updated.', profile: updated });
  } catch (err) {
    next(err);
  }
});

router.post('/profile/media', uploadImage.single('image'), async (req, res, next) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No image file received.' });
    }
    const target = req.body.target === 'hero' ? 'hero_image_url' : 'logo_url';
    const current = await get('SELECT logo_url, hero_image_url FROM company_profile WHERE id = 1');
    const newUrl = `/uploads/${req.file.filename}`;

    await run(
      `UPDATE company_profile SET ${target} = ?, updated_at = CURRENT_TIMESTAMP WHERE id = 1`,
      [newUrl]
    );

    if (current && current[target]) {
      removeUploadedFile(current[target]);
    }

    const updated = await get('SELECT * FROM company_profile WHERE id = 1');
    res.json({ message: 'Image updated successfully.', profile: updated });
  } catch (err) {
    cleanupRequestFile(req);
    next(err);
  }
});

/* ==================== PUBLICATIONS / POSTS ==================== */

router.get('/posts', async (req, res, next) => {
  try {
    const posts = await all('SELECT * FROM posts ORDER BY created_at DESC, id DESC');
    res.json(posts);
  } catch (err) {
    next(err);
  }
});

router.post('/posts', uploadMedia, async (req, res, next) => {
  try {
    const body = req.body || {};
    const title = toTrimmedString(body.title);
    const content = toTrimmedString(body.content);
    if (!title || !content) {
      cleanupRequestFile(req);
      return res.status(400).json({ error: 'Title and content are required.' });
    }

    const imageUrl = req.file ? `/uploads/${req.file.filename}` : '';
    const mediaType = req.file && isVideoMimeType(req.file.mimetype) ? 'video' : 'image';
    const published = body.is_published === '0' || body.is_published === false ? 0 : 1;

    const result = await run(
      `INSERT INTO posts (title, category, summary, content, image_url, media_type, is_published)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        title,
        toTrimmedString(body.category, 'IMANI Mining'),
        toTrimmedString(body.summary),
        content,
        imageUrl,
        mediaType,
        published
      ]
    );

    const post = await get('SELECT * FROM posts WHERE id = ?', [result.id]);
    res.status(201).json({ message: 'Publication created.', post });
  } catch (err) {
    cleanupRequestFile(req);
    next(err);
  }
});

router.put('/posts/:id', uploadMedia, async (req, res, next) => {
  try {
    const id = parsePositiveId(req.params.id);
    if (!id) {
      cleanupRequestFile(req);
      return res.status(400).json({ error: 'Invalid publication ID.' });
    }

    const existing = await get('SELECT * FROM posts WHERE id = ?', [id]);
    if (!existing) {
      cleanupRequestFile(req);
      return res.status(404).json({ error: 'Publication not found.' });
    }

    const body = req.body || {};
    let imageUrl = existing.image_url;
    let mediaType = existing.media_type || inferMediaTypeFromUrl(existing.image_url);
    let oldImageToDelete = '';

    if (req.file) {
      oldImageToDelete = existing.image_url;
      imageUrl = `/uploads/${req.file.filename}`;
      mediaType = isVideoMimeType(req.file.mimetype) ? 'video' : 'image';
    } else if (body.remove_image === '1' || body.remove_image === true) {
      oldImageToDelete = existing.image_url;
      imageUrl = '';
      mediaType = 'image';
    }

    const published =
      body.is_published !== undefined
        ? body.is_published === '0' || body.is_published === false
          ? 0
          : 1
        : existing.is_published;

    await run(
      `UPDATE posts SET
        title = ?, category = ?, summary = ?, content = ?,
        image_url = ?, media_type = ?, is_published = ?, updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [
        toTrimmedString(body.title, existing.title) || existing.title,
        toTrimmedString(body.category, existing.category) || existing.category,
        body.summary !== undefined ? toTrimmedString(body.summary) : existing.summary,
        toTrimmedString(body.content, existing.content) || existing.content,
        imageUrl,
        mediaType,
        published,
        id
      ]
    );

    if (oldImageToDelete) removeUploadedFile(oldImageToDelete);

    const updated = await get('SELECT * FROM posts WHERE id = ?', [id]);
    res.json({ message: 'Publication updated.', post: updated });
  } catch (err) {
    cleanupRequestFile(req);
    next(err);
  }
});

router.patch('/posts/:id/toggle', async (req, res, next) => {
  try {
    const id = parsePositiveId(req.params.id);
    if (!id) return res.status(400).json({ error: 'Invalid publication ID.' });

    const existing = await get('SELECT * FROM posts WHERE id = ?', [id]);
    if (!existing) {
      return res.status(404).json({ error: 'Publication not found.' });
    }
    const nextState = existing.is_published ? 0 : 1;
    await run(
      'UPDATE posts SET is_published = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
      [nextState, id]
    );
    const updated = await get('SELECT * FROM posts WHERE id = ?', [id]);
    res.json({
      message: nextState ? 'Publication is now live.' : 'Publication unpublished.',
      post: updated
    });
  } catch (err) {
    next(err);
  }
});

router.delete('/posts/:id', async (req, res, next) => {
  try {
    const id = parsePositiveId(req.params.id);
    if (!id) return res.status(400).json({ error: 'Invalid publication ID.' });

    const existing = await get('SELECT * FROM posts WHERE id = ?', [id]);
    if (!existing) {
      return res.status(404).json({ error: 'Publication not found.' });
    }
    await run('DELETE FROM posts WHERE id = ?', [id]);
    removeUploadedFile(existing.image_url);
    res.json({ message: 'Publication deleted permanently.' });
  } catch (err) {
    next(err);
  }
});

/* ==================== GALLERY / SITE IMAGES ==================== */

router.get('/gallery', async (req, res, next) => {
  try {
    const items = await all('SELECT * FROM gallery_images ORDER BY display_order ASC, created_at DESC');
    res.json(items);
  } catch (err) {
    next(err);
  }
});

router.post('/gallery', uploadMedia, async (req, res, next) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'Please select a photo or video file.' });
    }
    const body = req.body || {};
    const imageUrl = `/uploads/${req.file.filename}`;
    const mediaType = isVideoMimeType(req.file.mimetype) ? 'video' : 'image';

    const result = await run(
      `INSERT INTO gallery_images (title, category, caption, image_url, media_type)
       VALUES (?, ?, ?, ?, ?)`,
      [
        toTrimmedString(body.title, 'IMCC Project') || 'IMCC Project',
        toTrimmedString(body.category, 'IMANI Mining') || 'IMANI Mining',
        toTrimmedString(body.caption),
        imageUrl,
        mediaType
      ]
    );

    const item = await get('SELECT * FROM gallery_images WHERE id = ?', [result.id]);
    res.status(201).json({
      message: mediaType === 'video' ? 'Video added to gallery.' : 'Image added to gallery.',
      item
    });
  } catch (err) {
    cleanupRequestFile(req);
    next(err);
  }
});

router.put('/gallery/:id', uploadMedia, async (req, res, next) => {
  try {
    const id = parsePositiveId(req.params.id);
    if (!id) {
      cleanupRequestFile(req);
      return res.status(400).json({ error: 'Invalid media ID.' });
    }

    const existing = await get('SELECT * FROM gallery_images WHERE id = ?', [id]);
    if (!existing) {
      cleanupRequestFile(req);
      return res.status(404).json({ error: 'Media item not found.' });
    }

    let imageUrl = existing.image_url;
    let mediaType = existing.media_type || inferMediaTypeFromUrl(existing.image_url);
    let oldImageToDelete = '';
    if (req.file) {
      oldImageToDelete = existing.image_url;
      imageUrl = `/uploads/${req.file.filename}`;
      mediaType = isVideoMimeType(req.file.mimetype) ? 'video' : 'image';
    }

    const body = req.body || {};
    await run(
      'UPDATE gallery_images SET title = ?, category = ?, caption = ?, image_url = ?, media_type = ? WHERE id = ?',
      [
        toTrimmedString(body.title, existing.title) || existing.title,
        toTrimmedString(body.category, existing.category) || existing.category,
        body.caption !== undefined ? toTrimmedString(body.caption) : existing.caption,
        imageUrl,
        mediaType,
        id
      ]
    );

    if (oldImageToDelete) removeUploadedFile(oldImageToDelete);

    const updated = await get('SELECT * FROM gallery_images WHERE id = ?', [id]);
    res.json({
      message: mediaType === 'video' ? 'Video updated.' : 'Image updated.',
      item: updated
    });
  } catch (err) {
    cleanupRequestFile(req);
    next(err);
  }
});

router.delete('/gallery/:id', async (req, res, next) => {
  try {
    const id = parsePositiveId(req.params.id);
    if (!id) return res.status(400).json({ error: 'Invalid media ID.' });

    const existing = await get('SELECT * FROM gallery_images WHERE id = ?', [id]);
    if (!existing) {
      return res.status(404).json({ error: 'Media item not found.' });
    }
    await run('DELETE FROM gallery_images WHERE id = ?', [id]);
    removeUploadedFile(existing.image_url);
    res.json({ message: 'Media item removed from gallery.' });
  } catch (err) {
    next(err);
  }
});

/* ==================== SERVICES ==================== */

router.get('/services', async (req, res, next) => {
  try {
    const services = await all('SELECT * FROM services ORDER BY display_order ASC, id ASC');
    res.json(services);
  } catch (err) {
    next(err);
  }
});

router.post('/services', uploadImage.single('image'), async (req, res, next) => {
  try {
    const body = req.body || {};
    const category = toTrimmedString(body.category);
    const title = toTrimmedString(body.title);
    if (!category || !title) {
      cleanupRequestFile(req);
      return res.status(400).json({ error: 'Category and title are required.' });
    }
    const imageUrl = req.file ? `/uploads/${req.file.filename}` : '';
    const isActive = body.is_active === '0' || body.is_active === false ? 0 : 1;
    const result = await run(
      'INSERT INTO services (category, title, description, image_url, is_active) VALUES (?, ?, ?, ?, ?)',
      [category, title, toTrimmedString(body.description), imageUrl, isActive]
    );
    const service = await get('SELECT * FROM services WHERE id = ?', [result.id]);
    res.status(201).json({ message: 'Service added.', service });
  } catch (err) {
    cleanupRequestFile(req);
    next(err);
  }
});

router.put('/services/:id', uploadImage.single('image'), async (req, res, next) => {
  try {
    const id = parsePositiveId(req.params.id);
    if (!id) {
      cleanupRequestFile(req);
      return res.status(400).json({ error: 'Invalid service ID.' });
    }

    const existing = await get('SELECT * FROM services WHERE id = ?', [id]);
    if (!existing) {
      cleanupRequestFile(req);
      return res.status(404).json({ error: 'Service not found.' });
    }

    const body = req.body || {};
    let imageUrl = existing.image_url;
    let oldImageToDelete = '';

    if (req.file) {
      oldImageToDelete = existing.image_url;
      imageUrl = `/uploads/${req.file.filename}`;
    } else if (body.remove_image === '1' || body.remove_image === true) {
      oldImageToDelete = existing.image_url;
      imageUrl = '';
    }

    const isActive =
      body.is_active !== undefined
        ? body.is_active === '0' || body.is_active === false
          ? 0
          : 1
        : existing.is_active;

    await run(
      'UPDATE services SET category = ?, title = ?, description = ?, image_url = ?, is_active = ? WHERE id = ?',
      [
        toTrimmedString(body.category, existing.category) || existing.category,
        toTrimmedString(body.title, existing.title) || existing.title,
        body.description !== undefined ? toTrimmedString(body.description) : existing.description,
        imageUrl,
        isActive,
        id
      ]
    );

    if (oldImageToDelete) removeUploadedFile(oldImageToDelete);

    const updated = await get('SELECT * FROM services WHERE id = ?', [id]);
    res.json({ message: 'Service updated.', service: updated });
  } catch (err) {
    cleanupRequestFile(req);
    next(err);
  }
});

router.delete('/services/:id', async (req, res, next) => {
  try {
    const id = parsePositiveId(req.params.id);
    if (!id) return res.status(400).json({ error: 'Invalid service ID.' });

    const existing = await get('SELECT * FROM services WHERE id = ?', [id]);
    if (!existing) {
      return res.status(404).json({ error: 'Service not found.' });
    }
    await run('DELETE FROM services WHERE id = ?', [id]);
    removeUploadedFile(existing.image_url);
    res.json({ message: 'Service deleted.' });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
