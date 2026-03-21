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
db.pragma("foreign_keys = ON");

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
    tenant_id INTEGER NOT NULL DEFAULT 1,
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
    (1, 'zm', 'Zambia'),
    (2, 'il', 'Israel'),
    (3, 'bw', 'Botswana'),
    (4, 'zw', 'Zimbabwe'),
    (5, 'za', 'South Africa'),
    (6, 'na', 'Namibia');
`);

try {
  const newIds = [3, 4, 5, 6];
  const src = 1;
  for (const tid of newIds) {
    const n = db.prepare("SELECT COUNT(*) AS c FROM categories WHERE tenant_id = ?").get(tid).c;
    if (n > 0) continue;
    const rows = db.prepare("SELECT slug, name, sort FROM categories WHERE tenant_id = ? ORDER BY sort ASC").all(src);
    const ins = db.prepare(
      "INSERT INTO categories (tenant_id, slug, name, sort, created_at) VALUES (?, ?, ?, ?, datetime('now'))"
    );
    for (const r of rows) {
      ins.run(tid, r.slug, r.name, r.sort);
    }
  }
} catch (e) {
  // eslint-disable-next-line no-console
  console.error("[getpro] regional tenant category seed:", e.message);
}

try {
  const catCols = db.prepare("PRAGMA table_info(categories)").all();
  if (!catCols.some((c) => c.name === "tenant_id")) {
    db.exec(`
      CREATE TABLE categories_new (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        tenant_id INTEGER NOT NULL REFERENCES tenants(id),
        slug TEXT NOT NULL,
        name TEXT NOT NULL,
        sort INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        UNIQUE(tenant_id, slug)
      );
      INSERT INTO categories_new (id, tenant_id, slug, name, sort, created_at)
        SELECT id, 1, slug, name, sort, created_at FROM categories;
      DROP TABLE categories;
      ALTER TABLE categories_new RENAME TO categories;
      CREATE INDEX IF NOT EXISTS idx_categories_tenant_id ON categories(tenant_id);
    `);
  }
} catch (e) {
  // eslint-disable-next-line no-console
  console.error("[getpro] categories tenant migration:", e.message);
}

try {
  const colsAd = db.prepare("PRAGMA table_info(admin_users)").all();
  if (!colsAd.some((c) => c.name === "tenant_id")) {
    db.exec("ALTER TABLE admin_users ADD COLUMN tenant_id INTEGER NOT NULL DEFAULT 1");
  }
} catch (e) {
  // eslint-disable-next-line no-console
  console.error("[getpro] admin_users tenant_id migration:", e.message);
}

try {
  const colsLd = db.prepare("PRAGMA table_info(leads)").all();
  if (!colsLd.some((c) => c.name === "tenant_id")) {
    db.exec("ALTER TABLE leads ADD COLUMN tenant_id INTEGER NOT NULL DEFAULT 1");
    db.exec(`
      UPDATE leads SET tenant_id = (
        SELECT c.tenant_id FROM companies c WHERE c.id = leads.company_id
      )
    `);
    db.exec("CREATE INDEX IF NOT EXISTS idx_leads_tenant_id ON leads(tenant_id)");
  }
} catch (e) {
  // eslint-disable-next-line no-console
  console.error("[getpro] leads tenant_id migration:", e.message);
}

try {
  const colsCb = db.prepare("PRAGMA table_info(callback_interests)").all();
  if (!colsCb.some((c) => c.name === "name")) {
    db.exec("ALTER TABLE callback_interests ADD COLUMN name TEXT NOT NULL DEFAULT ''");
  }
  if (!colsCb.some((c) => c.name === "tenant_id")) {
    db.exec("ALTER TABLE callback_interests ADD COLUMN tenant_id INTEGER NOT NULL DEFAULT 1");
  }
} catch (_) {
  /* ignore */
}

try {
  const colsCo = db.prepare("PRAGMA table_info(companies)").all();
  if (!colsCo.some((c) => c.name === "tenant_id")) {
    db.exec("ALTER TABLE companies ADD COLUMN tenant_id INTEGER NOT NULL DEFAULT 1");
  }
} catch (_) {
  /* ignore */
}

try {
  const colsPs = db.prepare("PRAGMA table_info(professional_signups)").all();
  if (!colsPs.some((c) => c.name === "tenant_id")) {
    db.exec("ALTER TABLE professional_signups ADD COLUMN tenant_id INTEGER NOT NULL DEFAULT 1");
  }
} catch (_) {
  /* ignore */
}

try {
  const tcols = db.prepare("PRAGMA table_info(tenants)").all();
  if (!tcols.some((c) => c.name === "stage")) {
    db.exec("ALTER TABLE tenants ADD COLUMN stage TEXT NOT NULL DEFAULT 'Enabled'");
    db.exec("UPDATE tenants SET stage = 'Enabled' WHERE stage IS NULL OR stage = ''");
  }
} catch (e) {
  // eslint-disable-next-line no-console
  console.error("[getpro] tenants.stage migration:", e.message);
}

try {
  const acols = db.prepare("PRAGMA table_info(admin_users)").all();
  if (!acols.some((c) => c.name === "role")) {
    db.exec(`
      CREATE TABLE admin_users_new (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT NOT NULL UNIQUE,
        password_hash TEXT NOT NULL,
        role TEXT NOT NULL DEFAULT 'tenant_editor',
        tenant_id INTEGER REFERENCES tenants(id),
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
    `);
    const rows = db.prepare("SELECT * FROM admin_users").all();
    const ins = db.prepare(
      "INSERT INTO admin_users_new (id, username, password_hash, role, tenant_id, created_at) VALUES (?, ?, ?, ?, ?, ?)"
    );
    for (const r of rows) {
      ins.run(
        r.id,
        r.username,
        r.password_hash,
        "tenant_editor",
        r.tenant_id,
        r.created_at
      );
    }
    db.exec("DROP TABLE admin_users");
    db.exec("ALTER TABLE admin_users_new RENAME TO admin_users");
  }
} catch (e) {
  // eslint-disable-next-line no-console
  console.error("[getpro] admin_users role migration:", e.message);
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

