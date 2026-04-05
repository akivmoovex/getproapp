"use strict";

/**
 * Base DDL and canonical tenant rows (CREATE IF NOT EXISTS + INSERT OR IGNORE).
 * Core indexes on `companies` / `leads` are applied in `indexes.js` (`applyBaseIndexes`).
 */
function applyBaseSchema(db) {
  db.exec(`CREATE TABLE IF NOT EXISTS _getpro_migrations (id TEXT PRIMARY KEY NOT NULL);`);

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

  /* Partner join signups (UI: company / join flow). Name kept for migration compatibility — see docs/DB_NAMING.md */
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
    tenant_id INTEGER NOT NULL DEFAULT 4,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS tenants (
    id INTEGER PRIMARY KEY,
    slug TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
`);

  db.exec(`
  INSERT OR IGNORE INTO tenants (id, slug, name) VALUES
    (1, 'global', 'Global'),
    (2, 'demo', 'Demo'),
    (3, 'il', 'Israel'),
    (4, 'zm', 'Zambia'),
    (5, 'zw', 'Zimbabwe'),
    (6, 'bw', 'Botswana'),
    (7, 'za', 'South Africa'),
    (8, 'na', 'Namibia');
`);
}

module.exports = { applyBaseSchema };
