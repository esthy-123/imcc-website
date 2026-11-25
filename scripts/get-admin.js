const path = require("path");
const Database = require("better-sqlite3");
const dbPath = path.join(__dirname, "..", "data", "imcc.db");
const db = new Database(dbPath, { readonly: true });
try {
  const row = db.prepare("SELECT email, password_hash FROM admins LIMIT 1").get();
  if (row) {
    console.log(`E‑mail : ${row.email}`);
    console.log(`Hash   : ${row.password_hash}`);
  } else {
    console.log("Aucun compte admin trouvé dans la base.");
  }
} catch (e) {
  console.error("Erreur lors de la lecture de la base :", e.message);
} finally {
  db.close();
}
