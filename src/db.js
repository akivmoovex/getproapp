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

function seedCategoriesForTenant(db, destTenantId, srcTenantId) {
  const n = db.prepare("SELECT COUNT(*) AS c FROM categories WHERE tenant_id = ?").get(destTenantId).c;
  if (n > 0) return;
  const rows = db.prepare("SELECT slug, name, sort FROM categories WHERE tenant_id = ? ORDER BY sort ASC").all(srcTenantId);
  const ins = db.prepare(
    "INSERT INTO categories (tenant_id, slug, name, sort, created_at) VALUES (?, ?, ?, ?, datetime('now'))"
  );
  for (const r of rows) {
    ins.run(destTenantId, r.slug, r.name, r.sort);
  }
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
  db.prepare("UPDATE tenants SET stage = ? WHERE slug = 'demo'").run("Disabled");
} catch (_) {
  /* ignore */
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

/** One-time: remap legacy tenant ids to global=1, demo=2, il=3, zm=4, zw=5, bw=6, za=7, na=8. */
try {
  const TID = require("./tenantIds");
  db.exec(`
    CREATE TABLE IF NOT EXISTS _getpro_migrations (id TEXT PRIMARY KEY NOT NULL);
  `);
  if (!db.prepare("SELECT 1 FROM _getpro_migrations WHERE id = ?").get("tenant_id_layout_v1")) {
    const gm = db.prepare("SELECT id FROM tenants WHERE slug = 'global'").get();
    const zm = db.prepare("SELECT id FROM tenants WHERE slug = 'zm'").get();
    const dm = db.prepare("SELECT id FROM tenants WHERE slug = 'demo'").get();
    const layoutOk =
      gm && gm.id === TID.TENANT_GLOBAL &&
      zm && zm.id === TID.TENANT_ZM &&
      dm && dm.id === TID.TENANT_DEMO;

    if (layoutOk) {
      db.prepare("INSERT INTO _getpro_migrations (id) VALUES (?)").run("tenant_id_layout_v1");
    } else {
      const SLUG_TO_ID = {
        global: TID.TENANT_GLOBAL,
        demo: TID.TENANT_DEMO,
        il: TID.TENANT_IL,
        zm: TID.TENANT_ZM,
        zw: TID.TENANT_ZW,
        bw: TID.TENANT_BW,
        za: TID.TENANT_ZA,
        na: TID.TENANT_NA,
      };
      const SLUG_ORDER = ["global", "demo", "il", "zm", "zw", "bw", "za", "na"];
      const OFFSET = 1000000;
      const fkTables = [
        ["companies", "tenant_id"],
        ["categories", "tenant_id"],
        ["leads", "tenant_id"],
        ["callback_interests", "tenant_id"],
        ["professional_signups", "tenant_id"],
      ];

      const tx = db.transaction(() => {
        if (!db.prepare("SELECT id FROM tenants WHERE slug = 'demo'").get()) {
          const maxRow = db.prepare("SELECT MAX(id) AS m FROM tenants").get();
          const nextId = (maxRow && maxRow.m ? Number(maxRow.m) : 0) + 1;
          db.prepare("INSERT INTO tenants (id, slug, name, stage) VALUES (?, 'demo', 'Demo', ?)").run(
            nextId,
            "Disabled"
          );
        }

        for (const [table, col] of fkTables) {
          const cols = db.prepare(`PRAGMA table_info(${table})`).all();
          if (!cols.some((c) => c.name === col)) continue;
          db.prepare(`UPDATE ${table} SET ${col} = ${col} + ? WHERE ${col} IS NOT NULL`).run(OFFSET);
        }
        const acols = db.prepare("PRAGMA table_info(admin_users)").all();
        const adminHasTid = acols.some((c) => c.name === "tenant_id");
        if (adminHasTid) {
          db.prepare("UPDATE admin_users SET tenant_id = tenant_id + ? WHERE tenant_id IS NOT NULL").run(OFFSET);
        }

        db.prepare("UPDATE tenants SET id = id + ?").run(OFFSET);

        const rows = db.prepare("SELECT id, slug FROM tenants").all();
        const bySlug = Object.fromEntries(rows.map((r) => [r.slug, r.id]));

        function rewriteFk(oldId, newId) {
          for (const [table, col] of fkTables) {
            const cols = db.prepare(`PRAGMA table_info(${table})`).all();
            if (!cols.some((c) => c.name === col)) continue;
            db.prepare(`UPDATE ${table} SET ${col} = ? WHERE ${col} = ?`).run(newId, oldId);
          }
          if (adminHasTid) {
            db.prepare("UPDATE admin_users SET tenant_id = ? WHERE tenant_id = ?").run(newId, oldId);
          }
        }

        for (const slug of SLUG_ORDER) {
          const wanted = SLUG_TO_ID[slug];
          if (wanted === undefined) continue;
          const oldShifted = bySlug[slug];
          if (oldShifted == null || oldShifted === wanted) continue;
          rewriteFk(oldShifted, wanted);
          db.prepare("UPDATE tenants SET id = ? WHERE id = ?").run(wanted, oldShifted);
          bySlug[slug] = wanted;
        }
      });

      db.exec("PRAGMA foreign_keys = OFF");
      tx();
      db.exec("PRAGMA foreign_keys = ON");

      db.prepare("INSERT INTO _getpro_migrations (id) VALUES (?)").run("tenant_id_layout_v1");
      // eslint-disable-next-line no-console
      console.log("[getpro] Migration: tenant ids remapped to canonical layout (global=1 … zm=4 …).");
    }
  }
} catch (e) {
  // eslint-disable-next-line no-console
  console.error("[getpro] tenant_id_layout migration:", e.message);
}

try {
  const newIds = [3, 5, 6, 7, 8];
  const src = 4;
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
  seedCategoriesForTenant(db, 1, 4);
  seedCategoriesForTenant(db, 2, 4);
} catch (e) {
  // eslint-disable-next-line no-console
  console.error("[getpro] global/demo category seed:", e.message);
}

/** One-time: only Global + Zambia stay enabled; other regions disabled (re-enable via admin + optional env). */
try {
  db.exec(`
    CREATE TABLE IF NOT EXISTS _getpro_migrations (id TEXT PRIMARY KEY NOT NULL);
  `);
  const ran = db.prepare("SELECT 1 FROM _getpro_migrations WHERE id = ?").get("disable_tenants_except_global_zm_v1");
  if (!ran && process.env.GETPRO_SKIP_TENANT_REGION_LOCK !== "1") {
    db.prepare("UPDATE tenants SET stage = ? WHERE slug NOT IN ('global', 'zm')").run("Disabled");
    db.prepare("INSERT INTO _getpro_migrations (id) VALUES (?)").run("disable_tenants_except_global_zm_v1");
    // eslint-disable-next-line no-console
    console.log("[getpro] Migration: disabled all tenants except global and zm (set GETPRO_SKIP_TENANT_REGION_LOCK=1 before first boot to skip).");
  }
} catch (e) {
  // eslint-disable-next-line no-console
  console.error("[getpro] tenant region lock migration:", e.message);
}

/** One-time: delete super-admin–created tenants not in the canonical slug list (and their scoped data). */
try {
  const { CANONICAL_TENANT_SLUGS_LIST } = require("./tenantIds");
  db.exec(`
    CREATE TABLE IF NOT EXISTS _getpro_migrations (id TEXT PRIMARY KEY NOT NULL);
  `);
  if (!db.prepare("SELECT 1 FROM _getpro_migrations WHERE id = ?").get("delete_non_canonical_tenants_v1")) {
    const ph = CANONICAL_TENANT_SLUGS_LIST.map(() => "?").join(",");
    const orphans = db
      .prepare(`SELECT id FROM tenants WHERE slug NOT IN (${ph})`)
      .all(...CANONICAL_TENANT_SLUGS_LIST);
    if (orphans.length) {
      db.exec("PRAGMA foreign_keys = OFF");
      const tx = db.transaction(() => {
        for (const { id: tid } of orphans) {
          db.prepare("DELETE FROM leads WHERE tenant_id = ?").run(tid);
          db.prepare("DELETE FROM companies WHERE tenant_id = ?").run(tid);
          db.prepare("DELETE FROM categories WHERE tenant_id = ?").run(tid);
          db.prepare("DELETE FROM callback_interests WHERE tenant_id = ?").run(tid);
          db.prepare("DELETE FROM professional_signups WHERE tenant_id = ?").run(tid);
          db.prepare("DELETE FROM admin_users WHERE tenant_id = ?").run(tid);
          db.prepare("DELETE FROM tenants WHERE id = ?").run(tid);
        }
      });
      tx();
      db.exec("PRAGMA foreign_keys = ON");
      // eslint-disable-next-line no-console
      console.log(`[getpro] Migration: removed ${orphans.length} non-canonical tenant(s).`);
    }
    db.prepare("INSERT INTO _getpro_migrations (id) VALUES (?)").run("delete_non_canonical_tenants_v1");
  }
} catch (e) {
  // eslint-disable-next-line no-console
  console.error("[getpro] delete non-canonical tenants migration:", e.message);
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

