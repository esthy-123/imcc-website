const Database = require('better-sqlite3');
const db = new Database('data/imcc.db');

// Update company_profile with English values
const updateProfile = db.prepare(`
  UPDATE company_profile SET
    name = ?,
    tagline = ?,
    about = ?,
    vision = ?,
    mission = ?,
    values_text = ?
  WHERE id = 1
`);

updateProfile.run(
  'IMANI Mining & Construction Company Ltd (IMCC)',
  'A trusted force in Africa’s industrial transformation – Mining, Construction & Agriculture',
  'Headquartered in Ndola, Zambia, IMANI Mining & Construction Company Ltd (IMCC) delivers integrated solutions across Mining, Construction, and Agriculture.',
  'To be a regional leader in mining, construction, and agriculture.',
  'To deliver world‑class, efficient, and sustainable solutions with a focus on quality, affordability, and innovation.',
  'Professionalism, integrity, creativity, and excellence — delivering on time and exceeding expectations.'
);

console.log('Company profile translated to English');

db.close();
