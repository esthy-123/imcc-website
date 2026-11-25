const express = require('express');
const { get, all } = require('../config/database');

const router = express.Router();

// Single read-only public endpoint loading all site data for visitors
router.get('/site', async (req, res, next) => {
  try {
    const profile = await get('SELECT * FROM company_profile WHERE id = 1');
    const services = await all(
      `SELECT * FROM services
       WHERE is_active = 1
         AND LOWER(category) NOT LIKE '%transport%'
         AND LOWER(title) NOT LIKE '%transport%'
         AND LOWER(description) NOT LIKE '%transport%'
         AND LOWER(category) NOT LIKE '%security%'
         AND LOWER(title) NOT LIKE '%security%'
         AND LOWER(description) NOT LIKE '%security%'
       ORDER BY display_order ASC, id ASC`
    );
    const posts = await all(
      'SELECT * FROM posts WHERE is_published = 1 ORDER BY created_at DESC, id DESC'
    );
    const gallery = await all(
      'SELECT * FROM gallery_images ORDER BY display_order ASC, created_at DESC'
    );

    res.set('Cache-Control', 'no-cache');
    res.json({ profile, services, posts, gallery });
  } catch (err) {
    next(err);
  }
});

router.get('/posts/:id', async (req, res, next) => {
  try {
    const id = Number.parseInt(req.params.id, 10);
    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({ error: 'Invalid publication ID.' });
    }

    const post = await get(
      'SELECT * FROM posts WHERE id = ? AND is_published = 1',
      [id]
    );
    if (!post) {
      return res.status(404).json({ error: 'Publication not found.' });
    }
    res.set('Cache-Control', 'no-cache');
    res.json(post);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
