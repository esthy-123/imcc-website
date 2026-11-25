const path = require('path');
const fs = require('fs');
const { DatabaseSync } = require('node:sqlite');
const bcrypt = require('bcryptjs');

const DATA_DIR = path.resolve(process.env.DATA_DIR || path.join(__dirname, '..', 'data'));
const UPLOADS_DIR = path.join(DATA_DIR, 'uploads');
const DB_PATH = path.join(DATA_DIR, 'imcc.db');

fs.mkdirSync(UPLOADS_DIR, { recursive: true });

const db = new DatabaseSync(DB_PATH);
console.log(`SQLite database connected: ${DB_PATH}`);

// Async/await helpers built on Node.js native node:sqlite (Node 22.5+ / 24)
function run(sql, params = []) {
  try {
    const stmt = db.prepare(sql);
    const info = params && params.length > 0 ? stmt.run(...params) : stmt.run();
    return Promise.resolve({ id: Number(info.lastInsertRowid || 0), changes: info.changes || 0 });
  } catch (err) {
    return Promise.reject(err);
  }
}

function get(sql, params = []) {
  try {
    const stmt = db.prepare(sql);
    const row = params && params.length > 0 ? stmt.get(...params) : stmt.get();
    return Promise.resolve(row);
  } catch (err) {
    return Promise.reject(err);
  }
}

function all(sql, params = []) {
  try {
    const stmt = db.prepare(sql);
    const rows = params && params.length > 0 ? stmt.all(...params) : stmt.all();
    return Promise.resolve(rows);
  } catch (err) {
    return Promise.reject(err);
  }
}

async function initDatabase() {
  db.exec('PRAGMA journal_mode = WAL;');
  db.exec('PRAGMA foreign_keys = ON;');

  db.exec(`
    CREATE TABLE IF NOT EXISTS admins (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS company_profile (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      name TEXT NOT NULL,
      tagline TEXT NOT NULL,
      about TEXT NOT NULL,
      vision TEXT DEFAULT '',
      mission TEXT DEFAULT '',
      values_text TEXT DEFAULT '',
      reg_no TEXT DEFAULT '',
      tpin TEXT DEFAULT '',
      logo_url TEXT NOT NULL,
      hero_image_url TEXT DEFAULT '',
      phone TEXT NOT NULL,
      whatsapp TEXT NOT NULL,
      whatsapp_message TEXT NOT NULL,
      email TEXT DEFAULT '',
      secondary_email TEXT DEFAULT '',
      address TEXT DEFAULT '',
      instagram_url TEXT DEFAULT '',
      facebook_url TEXT DEFAULT '',
      linkedin_url TEXT DEFAULT '',
      tiktok_url TEXT DEFAULT '',
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS services (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      category TEXT NOT NULL,
      title TEXT NOT NULL,
      description TEXT DEFAULT '',
      image_url TEXT DEFAULT '',
      display_order INTEGER DEFAULT 0,
      is_active INTEGER DEFAULT 1
    )
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS posts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      category TEXT NOT NULL DEFAULT 'IMANI Mining',
      summary TEXT DEFAULT '',
      content TEXT NOT NULL,
      image_url TEXT DEFAULT '',
      media_type TEXT NOT NULL DEFAULT 'image',
      is_published INTEGER DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS gallery_images (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      category TEXT NOT NULL DEFAULT 'IMANI Mining',
      caption TEXT DEFAULT '',
      image_url TEXT NOT NULL,
      media_type TEXT NOT NULL DEFAULT 'image',
      display_order INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  ensureColumn('posts', 'media_type', "TEXT NOT NULL DEFAULT 'image'");
  ensureColumn('gallery_images', 'media_type', "TEXT NOT NULL DEFAULT 'image'");

  await seedInitialData();
}

function ensureColumn(table, column, definition) {
  const columns = db.prepare(`PRAGMA table_info(${table})`).all();
  if (!columns.some((col) => col.name === column)) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition};`);
  }
}

async function seedInitialData() {
  const existingAdmin = await get('SELECT id FROM admins LIMIT 1');
  if (!existingAdmin) {
    const email = (process.env.ADMIN_EMAIL || 'admin@imanimining.com').trim().toLowerCase();
    const password = process.env.ADMIN_PASSWORD || 'ChangeThisPassword2026!';
    const name = process.env.ADMIN_NAME || 'IMCC Management';
    const hash = await bcrypt.hash(password, 10);
    await run(
      'INSERT INTO admins (name, email, password_hash) VALUES (?, ?, ?)',
      [name, email, hash]
    );
    console.log(`Executive admin account initialized (${email}). Please update the password in production.`);
  }

  const existingProfile = await get('SELECT id FROM company_profile WHERE id = 1');
  if (!existingProfile) {
    await run(
      `INSERT INTO company_profile (
        id, name, tagline, about, vision, mission, values_text, reg_no, tpin,
        logo_url, hero_image_url, phone, whatsapp, whatsapp_message,
        email, secondary_email, address,
        instagram_url, facebook_url, linkedin_url, tiktok_url
      ) VALUES (1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        'IMANI MINING & CONSTRUCTION COMPANY LTD',
        'A Trusted Force in Africa’s Industrial Transformation — Mining, Construction & Agriculture',
        'At IMANI Mining & Construction Company Ltd (IMCC), we are driven by a vision to become a trusted force in Africa’s industrial transformation through innovation, integrity, and excellence. Headquartered in Ndola, Zambia, we deliver world-class, integrated services across our three core sectors: Mining, Construction, and Agriculture. Beyond infrastructure and operations, we support sustainable growth, resilient economies, and empowered communities across Zambia and globally.',
        'To be a regional leader in mining, construction, and agriculture.',
        'To deliver world-class, efficient, and sustainable solutions in mining, construction, and agriculture, with a focus on quality, affordability, and innovation.',
        'We uphold professionalism, integrity, creativity, and excellence — delivering on time, exceeding expectations, and providing lasting, impactful solutions.',
        '120241016245',
        '2003503355',
        '/assets/images/logo-imcc.jpg',
        '/assets/pdf/hero-mining.jpg',
        '+260962806591',
        '260962806591',
        'Hello IMANI Mining & Construction Company Ltd (IMCC), I would like to inquire about your Mining, Construction, or Agriculture services.',
        'imaniminingcomltd@gmail.com',
        'tonykanyanga95@gmail.com',
        'Ndola, Zambia',
        'https://instagram.com/',
        'https://facebook.com/',
        'https://linkedin.com/',
        'https://tiktok.com/'
      ]
    );
  }

  await run(
    `UPDATE company_profile
     SET address = 'Ndola, Zambia'
     WHERE id = 1
       AND address = 'Plot No. 12398, Misundu, Kalomo Road, Ndola, Zambia'`
  );

  const serviceCount = await get('SELECT COUNT(*) AS count FROM services');
  if (!serviceCount || serviceCount.count === 0) {
    const defaultServices = [
      [
        'IMANI Mining',
        'Mining Operations & Mineral Extraction',
        'Mining drilling • Mining equipment • Mine discovery • Mining outfits • Mineral extraction, processing, and trading (copper ore, cathodes & Zambian emeralds).',
        '/assets/images/minerals-emerald-crystal.jpg',
        1
      ],
      [
        'IMANI Construction',
        'General & Civil Construction',
        'Residential properties • Commercial properties • Industrial properties • Special purpose structures • Homes • Roads • Bridges.',
        '/assets/images/construction-rebar.jpg',
        2
      ],
      [
        'IMANI Agriculture',
        'Agro-Pastoral & Agrifood Exploitation',
        'Agro-pastoral exploitation (livestock farming) • Agrifood and forestry exploitation (crop farming, maize, grains, sorting & packaging).',
        '/assets/images/agriculture-agrifood.jpg',
        3
      ]
    ];

    for (const [category, title, description, imageUrl, order] of defaultServices) {
      await run(
        'INSERT INTO services (category, title, description, image_url, display_order) VALUES (?, ?, ?, ?, ?)',
        [category, title, description, imageUrl, order]
      );
    }
  }

  const galleryCount = await get('SELECT COUNT(*) AS count FROM gallery_images');
  if (!galleryCount || galleryCount.count === 0) {
    const defaultGallery = [
      ['IMANI Mining — Drilling & Open-Pit Operations', 'IMANI Mining', 'Mining drilling rigs, excavators, and haulage operations.', '/assets/pdf/work-mining.jpg', 1],
      ['High-Grade Copper & Malachite Ore', 'IMANI Mining', 'Sampling and extraction of copper-rich mineral deposits.', '/assets/images/minerals-copper-ore.jpg', 2],
      ['Gem-Quality Emerald Crystals', 'IMANI Mining', 'Extraction, sorting, and trading of precious Zambian minerals.', '/assets/images/minerals-emerald-crystal.jpg', 3],
      ['Emerald Vein in Host Rock', 'IMANI Mining', 'Mine discovery and geological exploration.', '/assets/images/minerals-emerald-matrix.jpg', 4],
      ['Rough Mineral Inspection & Sorting', 'IMANI Mining', 'On-site mineral quality control and grading.', '/assets/images/minerals-emerald-extraction.jpg', 5],
      ['Reinforced Concrete & Steel Rebar Works', 'IMANI Construction', 'Heavy-duty structural foundation and steel reinforcement engineering.', '/assets/images/construction-rebar.jpg', 6],
      ['Residential, Commercial & Civil Projects', 'IMANI Construction', 'Buildings, residential developments, roads, and civil infrastructure.', '/assets/pdf/work-construction.jpg', 7],
      ['Agrifood Sorting & Packaging Facility', 'IMANI Agriculture', 'Modern agricultural sorting, grading, and packaging operations.', '/assets/images/agriculture-agrifood.jpg', 8],
      ['Maize Harvest Production', 'IMANI Agriculture', 'Large-scale crop farming and seasonal harvests.', '/assets/images/agriculture-maize.jpg', 9],
      ['Bulk Maize Grain Supply', 'IMANI Agriculture', 'Reliable bulk agrifood supply and storage.', '/assets/images/agriculture-corn-bulk.jpg', 10],
      ['Selected Cereal & Grain Crops', 'IMANI Agriculture', 'Quality grain production and agro-pastoral operations.', '/assets/images/agriculture-grain.jpg', 11]
    ];
    for (const [title, category, caption, imageUrl, order] of defaultGallery) {
      await run(
        'INSERT INTO gallery_images (title, category, caption, image_url, display_order) VALUES (?, ?, ?, ?, ?)',
        [title, category, caption, imageUrl, order]
      );
    }
  }

  const postCount = await get('SELECT COUNT(*) AS count FROM posts');
  if (!postCount || postCount.count === 0) {
    const defaultPosts = [
      [
        'IMANI Mining: Drilling, Copper & Emerald Operations in Zambia',
        'IMANI Mining',
        'Mining drilling, heavy equipment, mineral extraction, processing, and trading.',
        'Headquartered in Ndola, Zambia, IMANI Mining & Construction Company Ltd (IMCC) delivers integrated mining drilling, equipment supply, mineral extraction, and trading across copper ore, copper cathodes, and emeralds. Contact our team directly by phone or WhatsApp to discuss partnerships.',
        '/assets/images/minerals-emerald-crystal.jpg'
      ],
      [
        'IMANI Construction: High-Precision Civil & Structural Engineering',
        'IMANI Construction',
        'Residential, commercial, and industrial properties, roads, and bridges built to last.',
        'Our Construction division executes reinforced concrete foundations, residential and commercial buildings, industrial facilities, roads, and bridges with strict adherence to safety, quality, and on-time delivery.',
        '/assets/images/construction-rebar.jpg'
      ],
      [
        'IMANI Agriculture: Sustainable Agrifood & Grain Production',
        'IMANI Agriculture',
        'Agro-pastoral operations, maize and grain farming, and modern agrifood packaging.',
        'IMCC drives sustainable regional agriculture through livestock farming, large-scale maize and grain cultivation, and modern sorting and packaging facilities.',
        '/assets/images/agriculture-agrifood.jpg'
      ]
    ];
    for (const [title, category, summary, content, imageUrl] of defaultPosts) {
      await run(
        `INSERT INTO posts (title, category, summary, content, image_url, is_published)
         VALUES (?, ?, ?, ?, ?, 1)`,
        [title, category, summary, content, imageUrl]
      );
    }
  }
}

module.exports = {
  db,
  run,
  get,
  all,
  initDatabase,
  DATA_DIR,
  UPLOADS_DIR,
  DB_PATH
};
