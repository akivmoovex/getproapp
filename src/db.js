const path = require("path");
const Database = require("better-sqlite3");
const fs = require("fs");

const sqlitePath = process.env.SQLITE_PATH
  ? path.isAbsolute(process.env.SQLITE_PATH)
    ? process.env.SQLITE_PATH
    : path.join(__dirname, "..", process.env.SQLITE_PATH)
  : path.join(__dirname, "..", "data", "getpro.sqlite");

// better-sqlite3 fails if the parent directory doesn't exist.
fs.mkdirSync(path.dirname(sqlitePath), { recursive: true });

const db = new Database(sqlitePath);

db.pragma("journal_mode = WAL");

db.exec(`
  CREATE TABLE IF NOT EXISTS admin_users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS categories (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    slug TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    sort INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS companies (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    subdomain TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    category_id INTEGER,
    headline TEXT NOT NULL DEFAULT '',
    about TEXT NOT NULL DEFAULT '',
    services TEXT NOT NULL DEFAULT '',
    phone TEXT NOT NULL DEFAULT '',
    email TEXT NOT NULL DEFAULT '',
    location TEXT NOT NULL DEFAULT '',
    featured_cta_label TEXT NOT NULL DEFAULT 'Call us',
    featured_cta_phone TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY(category_id) REFERENCES categories(id)
  );

  CREATE TABLE IF NOT EXISTS leads (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    company_id INTEGER NOT NULL,
    name TEXT NOT NULL DEFAULT '',
    phone TEXT NOT NULL DEFAULT '',
    email TEXT NOT NULL DEFAULT '',
    message TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL DEFAULT 'new',
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY(company_id) REFERENCES companies(id)
  );

  CREATE INDEX IF NOT EXISTS idx_companies_category_id ON companies(category_id);
  CREATE INDEX IF NOT EXISTS idx_leads_company_id ON leads(company_id);

  CREATE TABLE IF NOT EXISTS professional_signups (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    profession TEXT NOT NULL DEFAULT '',
    city TEXT NOT NULL DEFAULT '',
    name TEXT NOT NULL DEFAULT '',
    phone TEXT NOT NULL DEFAULT '',
    vat_or_pacra TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS callback_interests (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    phone TEXT NOT NULL DEFAULT '',
    name TEXT NOT NULL DEFAULT '',
    context TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
`);

try {
  const cols = db.prepare("PRAGMA table_info(callback_interests)").all();
  if (!cols.some((c) => c.name === "name")) {
    db.exec("ALTER TABLE callback_interests ADD COLUMN name TEXT NOT NULL DEFAULT ''");
  }
} catch (_) {
  /* ignore */
}

function run(query, params = []) {
  return db.prepare(query).run(params);
}

function getOne(query, params = []) {
  return db.prepare(query).get(params);
}

function getAll(query, params = []) {
  return db.prepare(query).all(params);
}

module.exports = {
  db,
  run,
  getOne,
  getAll,
};

