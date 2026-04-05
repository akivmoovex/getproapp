"use strict";
module.exports = function run(db) {try {
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
        SELECT id, COALESCE((SELECT id FROM tenants WHERE slug = 'zm' LIMIT 1), 1), slug, name, sort, created_at FROM categories;
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
    /* idx_leads_tenant_id removed: superseded by idx_leads_tenant_created_at (migration 15). */
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

try {
  const acols2 = db.prepare("PRAGMA table_info(admin_users)").all();
  if (!acols2.some((c) => c.name === "enabled")) {
    db.exec("ALTER TABLE admin_users ADD COLUMN enabled INTEGER NOT NULL DEFAULT 1");
    db.exec("UPDATE admin_users SET enabled = 1 WHERE enabled IS NULL");
  }
} catch (e) {
  // eslint-disable-next-line no-console
  console.error("[getpro] admin_users.enabled migration:", e.message);
}

try {
  const cbCols = db.prepare("PRAGMA table_info(callback_interests)").all();
  if (!cbCols.some((c) => c.name === "interest_label")) {
    db.exec(
      "ALTER TABLE callback_interests ADD COLUMN interest_label TEXT NOT NULL DEFAULT 'Potential Partner'"
    );
    db.exec("UPDATE callback_interests SET interest_label = 'Potential Partner' WHERE interest_label IS NULL OR interest_label = ''");
  }
} catch (e) {
  // eslint-disable-next-line no-console
  console.error("[getpro] callback_interests.interest_label migration:", e.message);
}
};
