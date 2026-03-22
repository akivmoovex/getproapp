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

/**
 * One-time: if Zambia has no professions, seed a canonical list, then copy to every tenant
 * that still has none (fixes empty admin Professions + directory categories on fresh or partial DBs).
 */
try {
  db.exec(`
    CREATE TABLE IF NOT EXISTS _getpro_migrations (id TEXT PRIMARY KEY NOT NULL);
  `);
  if (!db.prepare("SELECT 1 FROM _getpro_migrations WHERE id = ?").get("ensure_canonical_categories_all_tenants_v1")) {
    const zmId = 4;
    const zmCount = db.prepare("SELECT COUNT(*) AS c FROM categories WHERE tenant_id = ?").get(zmId).c;
    if (Number(zmCount) === 0) {
      const rows = [
        ["electricians", "Electricians", 10],
        ["plumbers", "Plumbers", 20],
        ["builders", "Builders", 30],
        ["carpenters", "Carpenters", 40],
        ["painters", "Painters", 50],
        ["hvac", "HVAC", 60],
        ["locksmiths", "Locksmiths", 70],
        ["roofers", "Roofers", 80],
        ["gardeners", "Gardeners", 90],
        ["cleaners", "Cleaners", 100],
        ["handymen", "Handymen", 110],
        ["welders", "Welders", 120],
      ];
      const ins = db.prepare(
        "INSERT INTO categories (tenant_id, slug, name, sort, created_at) VALUES (?, ?, ?, ?, datetime('now'))"
      );
      const tx = db.transaction(() => {
        for (const [slug, name, sort] of rows) {
          ins.run(zmId, slug, name, sort);
        }
      });
      tx();
      // eslint-disable-next-line no-console
      console.log("[getpro] Migration: seeded canonical professions for Zambia (zm).");
    }
    const destIds = [1, 2, 3, 5, 6, 7, 8];
    for (const tid of destIds) {
      seedCategoriesForTenant(db, tid, zmId);
    }
    db.prepare("INSERT INTO _getpro_migrations (id) VALUES (?)").run("ensure_canonical_categories_all_tenants_v1");
    // eslint-disable-next-line no-console
    console.log("[getpro] Migration: ensured categories copied from zm to tenants that had none.");
  }
} catch (e) {
  // eslint-disable-next-line no-console
  console.error("[getpro] ensure canonical categories migration:", e.message);
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

/** One-time: demo enabled for demo.{BASE_DOMAIN} (not listed in region picker); South Africa disabled by default. */
try {
  db.exec(`
    CREATE TABLE IF NOT EXISTS _getpro_migrations (id TEXT PRIMARY KEY NOT NULL);
  `);
  if (!db.prepare("SELECT 1 FROM _getpro_migrations WHERE id = ?").get("tenant_demo_enabled_za_disabled_v1")) {
    db.prepare("UPDATE tenants SET stage = ? WHERE slug = 'demo'").run("Enabled");
    db.prepare("UPDATE tenants SET stage = ? WHERE slug = 'za'").run("Disabled");
    db.prepare("INSERT INTO _getpro_migrations (id) VALUES (?)").run("tenant_demo_enabled_za_disabled_v1");
    // eslint-disable-next-line no-console
    console.log("[getpro] Migration: demo tenant enabled, za disabled (defaults).");
  }
} catch (e) {
  // eslint-disable-next-line no-console
  console.error("[getpro] tenant demo/za defaults migration:", e.message);
}

/** One-time: sample companies for demo tenant (directory search + card UI tests). */
try {
  const TID = require("./tenantIds");
  const demoTenantId = TID.TENANT_DEMO;
  db.exec(`
    CREATE TABLE IF NOT EXISTS _getpro_migrations (id TEXT PRIMARY KEY NOT NULL);
  `);
  if (!db.prepare("SELECT 1 FROM _getpro_migrations WHERE id = ?").get("demo_seed_sample_companies_v1")) {
    const elCat = db
      .prepare("SELECT id FROM categories WHERE tenant_id = ? AND slug = 'electricians'")
      .get(demoTenantId);
    const plCat = db
      .prepare("SELECT id FROM categories WHERE tenant_id = ? AND slug = 'plumbers'")
      .get(demoTenantId);
    const ins = db.prepare(`
      INSERT INTO companies
        (subdomain, name, category_id, headline, about, services, phone, email, location, featured_cta_label, featured_cta_phone, tenant_id, updated_at)
      VALUES
        (?, ?, ?, ?, ?, ?, ?, ?, ?, 'Call us', ?, ?, datetime('now'))
    `);
    const seeds = [
      {
        sub: "demo-lusaka-spark",
        name: "Spark Electric Lusaka",
        cat: elCat,
        headline: "Licensed electricians for homes and businesses",
        about:
          "Full-service electrical installations, repairs, and safety inspections. Electrician services across Lusaka with same-week callouts.",
        services: "Rewiring\nPanel upgrades\nEmergency Electrician callouts",
        phone: "+260211000101",
        email: "spark@demo.getproapp.invalid",
        loc: "Lusaka, Zambia",
        cta: "+260211000101",
      },
      {
        sub: "demo-lusaka-voltpro",
        name: "VoltPro Electrical",
        cat: elCat,
        headline: "Commercial & industrial Electrician work",
        about:
          "Retail fit-outs, warehouses, and backup power. Search Electrician Lusaka — we cover CBD and Woodlands.",
        services: "Three-phase installs\nLighting design\nCompliance certificates",
        phone: "+260211000102",
        email: "voltpro@demo.getproapp.invalid",
        loc: "Lusaka",
        cta: "+260211000102",
      },
      {
        sub: "demo-lusaka-flow",
        name: "FlowRight Plumbing",
        cat: plCat,
        headline: "Emergency plumbers in Lusaka",
        about: "Burst pipes, geysers, and bathroom refits. Fast response in Lusaka and nearby areas.",
        services: "Leak detection\nDrain clearing\nBathroom installs",
        phone: "+260211000103",
        email: "flow@demo.getproapp.invalid",
        loc: "Lusaka, Zambia",
        cta: "+260211000103",
      },
      {
        sub: "demo-kitwe-wire",
        name: "Copperbelt Electric Co",
        cat: elCat,
        headline: "Electrician services in Kitwe",
        about: "Industrial Electrician support — not in Lusaka; used to test city filters.",
        services: "Motor control\nCabling\nMaintenance",
        phone: "+260212000201",
        email: "kitwe@demo.getproapp.invalid",
        loc: "Kitwe, Zambia",
        cta: "+260212000201",
      },
    ];
    let added = 0;
    for (const r of seeds) {
      if (db.prepare("SELECT 1 FROM companies WHERE subdomain = ?").get(r.sub)) continue;
      ins.run(
        r.sub,
        r.name,
        r.cat ? r.cat.id : null,
        r.headline,
        r.about,
        r.services,
        r.phone,
        r.email,
        r.loc,
        r.cta,
        demoTenantId
      );
      added += 1;
    }
    db.prepare("INSERT INTO _getpro_migrations (id) VALUES (?)").run("demo_seed_sample_companies_v1");
    if (added > 0) {
      // eslint-disable-next-line no-console
      console.log(`[getpro] Migration: seeded ${added} demo tenant sample compan(y/ies).`);
    }
  }
} catch (e) {
  // eslint-disable-next-line no-console
  console.error("[getpro] demo sample companies migration:", e.message);
}

/** Customer reviews (directory cards: all-time average + count; best review in last 90 days). */
try {
  db.exec(`
    CREATE TABLE IF NOT EXISTS reviews (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
      rating REAL NOT NULL,
      body TEXT NOT NULL DEFAULT '',
      author_name TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      CHECK (rating >= 1 AND rating <= 5)
    );
    CREATE INDEX IF NOT EXISTS idx_reviews_company_id ON reviews(company_id);
    CREATE INDEX IF NOT EXISTS idx_reviews_created_at ON reviews(created_at);
  `);
} catch (e) {
  // eslint-disable-next-line no-console
  console.error("[getpro] reviews table:", e.message);
}

/** One-time: seed demo reviews (mixed dates so “last 3 months” highlight differs from all-time average). */
try {
  const TID = require("./tenantIds");
  db.exec(`
    CREATE TABLE IF NOT EXISTS _getpro_migrations (id TEXT PRIMARY KEY NOT NULL);
  `);
  if (!db.prepare("SELECT 1 FROM _getpro_migrations WHERE id = ?").get("reviews_seed_demo_v1")) {
    const demoTenantId = TID.TENANT_DEMO;
    const ins = db.prepare(`
      INSERT INTO reviews (company_id, rating, body, author_name, created_at)
      VALUES (?, ?, ?, ?, datetime('now', ?))
    `);
    const companyId = (sub) => {
      const row = db
        .prepare("SELECT id FROM companies WHERE tenant_id = ? AND subdomain = ?")
        .get(demoTenantId, sub);
      return row ? row.id : null;
    };
    const tx = db.transaction(() => {
      const spark = companyId("demo-lusaka-spark");
      if (spark) {
        ins.run(
          spark,
          5,
          "Excellent work on our consumer unit upgrade — clear quote, finished on time.",
          "Mwansa K.",
          "-14 days"
        );
        ins.run(
          spark,
          4.5,
          "Professional and tidy. Would use again for rewiring.",
          "Grace T.",
          "-72 days"
        );
        ins.run(
          spark,
          4,
          "Good service overall; one follow-up visit needed for a minor issue.",
          "Peter N.",
          "-120 days"
        );
      }
      const volt = companyId("demo-lusaka-voltpro");
      if (volt) {
        ins.run(
          volt,
          5,
          "Handled our warehouse lighting and backup — minimal downtime. Top team.",
          "Lubinda R.",
          "-8 days"
        );
        ins.run(
          volt,
          4.8,
          "Commercial install was compliant and well documented.",
          "Anita B.",
          "-55 days"
        );
        ins.run(
          volt,
          4.2,
          "Solid industrial work; scheduling was tight but they delivered.",
          "David C.",
          "-400 days"
        );
      }
      const flow = companyId("demo-lusaka-flow");
      if (flow) {
        ins.run(
          flow,
          5,
          "Emergency leak fixed fast — plumber arrived within the hour.",
          "Chileshe M.",
          "-20 days"
        );
        ins.run(
          flow,
          4.9,
          "Bathroom refit looks great. Fair pricing.",
          "Mutale S.",
          "-60 days"
        );
        ins.run(
          flow,
          3.5,
          "OK service; communication could improve.",
          "Anonymous",
          "-95 days"
        );
      }
      const kitwe = companyId("demo-kitwe-wire");
      if (kitwe) {
        ins.run(
          kitwe,
          4.7,
          "Reliable for motor control and cabling on our line.",
          "Foreman J.",
          "-25 days"
        );
        ins.run(
          kitwe,
          4,
          "Good technical support for industrial maintenance.",
          "Plant Ops",
          "-300 days"
        );
      }
    });
    tx();
    db.prepare("INSERT INTO _getpro_migrations (id) VALUES (?)").run("reviews_seed_demo_v1");
    // eslint-disable-next-line no-console
    console.log("[getpro] Migration: seeded demo tenant reviews.");
  }
} catch (e) {
  // eslint-disable-next-line no-console
  console.error("[getpro] reviews demo seed migration:", e.message);
}

/** One-time: ensure every Enabled tenant has professions copied from Zambia when empty (fixes gaps after manual deletes or failed seeds). */
try {
  db.exec(`
    CREATE TABLE IF NOT EXISTS _getpro_migrations (id TEXT PRIMARY KEY NOT NULL);
  `);
  if (!db.prepare("SELECT 1 FROM _getpro_migrations WHERE id = ?").get("repair_empty_categories_enabled_tenants_v1")) {
    const zmId = 4;
    const enabled = db.prepare("SELECT id FROM tenants WHERE stage = 'Enabled'").all();
    let repaired = 0;
    for (const { id } of enabled) {
      const n = db.prepare("SELECT COUNT(*) AS c FROM categories WHERE tenant_id = ?").get(id).c;
      if (Number(n) > 0) continue;
      seedCategoriesForTenant(db, id, zmId);
      repaired += 1;
    }
    db.prepare("INSERT INTO _getpro_migrations (id) VALUES (?)").run("repair_empty_categories_enabled_tenants_v1");
    if (repaired > 0) {
      // eslint-disable-next-line no-console
      console.log(`[getpro] Migration: copied professions from zm for ${repaired} enabled tenant(s) that had none.`);
    }
  }
} catch (e) {
  // eslint-disable-next-line no-console
  console.error("[getpro] repair empty categories migration:", e.message);
}

/** One-time: directory company detail page fields (gallery JSON, hours, service areas). */
try {
  db.exec(`
    CREATE TABLE IF NOT EXISTS _getpro_migrations (id TEXT PRIMARY KEY NOT NULL);
  `);
  if (!db.prepare("SELECT 1 FROM _getpro_migrations WHERE id = ?").get("companies_profile_columns_v1")) {
    const cols = db.prepare("PRAGMA table_info(companies)").all();
    const names = new Set(cols.map((c) => c.name));
    if (!names.has("years_experience")) db.exec(`ALTER TABLE companies ADD COLUMN years_experience INTEGER`);
    if (!names.has("service_areas"))
      db.exec(`ALTER TABLE companies ADD COLUMN service_areas TEXT NOT NULL DEFAULT ''`);
    if (!names.has("hours_text")) db.exec(`ALTER TABLE companies ADD COLUMN hours_text TEXT NOT NULL DEFAULT ''`);
    if (!names.has("gallery_json")) db.exec(`ALTER TABLE companies ADD COLUMN gallery_json TEXT NOT NULL DEFAULT '[]'`);
    db.prepare("INSERT INTO _getpro_migrations (id) VALUES (?)").run("companies_profile_columns_v1");
  }
} catch (e) {
  // eslint-disable-next-line no-console
  console.error("[getpro] companies profile columns migration:", e.message);
}

/** One-time: company logo URL for directory / mini-site header. */
try {
  db.exec(`
    CREATE TABLE IF NOT EXISTS _getpro_migrations (id TEXT PRIMARY KEY NOT NULL);
  `);
  if (!db.prepare("SELECT 1 FROM _getpro_migrations WHERE id = ?").get("companies_logo_url_v1")) {
    const cols = db.prepare("PRAGMA table_info(companies)").all();
    const names = new Set(cols.map((c) => c.name));
    if (!names.has("logo_url")) db.exec(`ALTER TABLE companies ADD COLUMN logo_url TEXT NOT NULL DEFAULT ''`);
    db.prepare("INSERT INTO _getpro_migrations (id) VALUES (?)").run("companies_logo_url_v1");
  }
} catch (e) {
  // eslint-disable-next-line no-console
  console.error("[getpro] companies logo_url migration:", e.message);
}

/** One-time: rich demo profiles (gallery + hours) for demo tenant companies. */
try {
  const TID = require("./tenantIds");
  db.exec(`
    CREATE TABLE IF NOT EXISTS _getpro_migrations (id TEXT PRIMARY KEY NOT NULL);
  `);
  if (!db.prepare("SELECT 1 FROM _getpro_migrations WHERE id = ?").get("demo_company_profile_rich_v1")) {
    const demoTid = TID.TENANT_DEMO;
    const upd = db.prepare(`
      UPDATE companies SET
        years_experience = ?,
        service_areas = ?,
        hours_text = ?,
        gallery_json = ?,
        updated_at = datetime('now')
      WHERE tenant_id = ? AND subdomain = ?
    `);
    const seeds = [
      {
        sub: "demo-lusaka-spark",
        years: 8,
        areas: "Lusaka (CBD, Woodlands, Kabulonga, Roma)\nNearby: Chongwe (by arrangement)",
        hours: "Mon–Sat 08:00–18:00\nEmergency call-outs: Sun & public holidays (premium rates)",
        gallery: JSON.stringify([
          {
            url: "https://picsum.photos/seed/getpro-spark1/960/640",
            caption: "Distribution board upgrade — Woodlands",
          },
          {
            url: "https://picsum.photos/seed/getpro-spark2/960/640",
            caption: "Retail wiring — Cairo Road",
          },
          {
            url: "https://picsum.photos/seed/getpro-spark3/960/640",
            caption: "Safety inspection documentation",
          },
        ]),
      },
      {
        sub: "demo-lusaka-voltpro",
        years: 12,
        areas: "Lusaka industrial zones\nNdola & Kitwe (scheduled visits)",
        hours: "Mon–Fri 07:30–17:30\nClosed weekends",
        gallery: JSON.stringify([
          {
            url: "https://picsum.photos/seed/getpro-volt1/960/640",
            caption: "Warehouse lighting retrofit",
          },
          {
            url: "https://picsum.photos/seed/getpro-volt2/960/640",
            caption: "Three-phase distribution",
          },
        ]),
      },
      {
        sub: "demo-lusaka-flow",
        years: 6,
        areas: "Greater Lusaka\nKafue Road corridor",
        hours: "24/7 emergency line\nOffice: daily 07:00–20:00",
        gallery: JSON.stringify([
          {
            url: "https://picsum.photos/seed/getpro-flow1/960/640",
            caption: "Bathroom refit — leak-free guarantee",
          },
          {
            url: "https://picsum.photos/seed/getpro-flow2/960/640",
            caption: "Geyser installation",
          },
        ]),
      },
      {
        sub: "demo-kitwe-wire",
        years: 15,
        areas: "Kitwe & Kalulushi\nChingola (commercial projects)",
        hours: "Mon–Sat 08:00–17:00",
        gallery: JSON.stringify([
          {
            url: "https://picsum.photos/seed/getpro-kitwe1/960/640",
            caption: "Motor control cabinet",
          },
        ]),
      },
    ];
    for (const s of seeds) {
      const row = db.prepare("SELECT id FROM companies WHERE tenant_id = ? AND subdomain = ?").get(demoTid, s.sub);
      if (!row) continue;
      upd.run(s.years, s.areas, s.hours, s.gallery, demoTid, s.sub);
    }
    db.prepare("INSERT INTO _getpro_migrations (id) VALUES (?)").run("demo_company_profile_rich_v1");
    // eslint-disable-next-line no-console
    console.log("[getpro] Migration: demo company profile fields (gallery, hours, areas) updated.");
  }
} catch (e) {
  // eslint-disable-next-line no-console
  console.error("[getpro] demo company profile rich migration:", e.message);
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

/** Per-tenant cities: join autocomplete, enabled flag, big-city watermark rotation. */
try {
  db.exec(`
    CREATE TABLE IF NOT EXISTS tenant_cities (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      tenant_id INTEGER NOT NULL REFERENCES tenants(id),
      name TEXT NOT NULL,
      enabled INTEGER NOT NULL DEFAULT 1,
      big_city INTEGER NOT NULL DEFAULT 0,
      UNIQUE(tenant_id, name)
    );
    CREATE INDEX IF NOT EXISTS idx_tenant_cities_tenant_id ON tenant_cities(tenant_id);
  `);
} catch (e) {
  // eslint-disable-next-line no-console
  console.error("[getpro] tenant_cities create:", e.message);
}

try {
  db.exec(`
    CREATE TABLE IF NOT EXISTS _getpro_migrations (id TEXT PRIMARY KEY NOT NULL);
  `);
  if (!db.prepare("SELECT 1 FROM _getpro_migrations WHERE id = ?").get("tenant_cities_seed_zm_v1")) {
    const zmId = 4;
    const n = db.prepare("SELECT COUNT(*) AS c FROM tenant_cities WHERE tenant_id = ?").get(zmId).c;
    if (n === 0) {
      const listPath = path.join(__dirname, "..", "public", "data", "search-lists.json");
      if (fs.existsSync(listPath)) {
        const j = JSON.parse(fs.readFileSync(listPath, "utf8"));
        const cities = Array.isArray(j.cities) ? j.cities : [];
        const big = new Set(["Lusaka", "Kitwe", "Ndola", "Livingstone", "Kabwe"]);
        const ins = db.prepare(
          "INSERT INTO tenant_cities (tenant_id, name, enabled, big_city) VALUES (?, ?, 1, ?)"
        );
        const tx = db.transaction(() => {
          for (const raw of cities) {
            const name = String(raw || "").trim();
            if (!name) continue;
            ins.run(zmId, name, big.has(name) ? 1 : 0);
          }
        });
        tx();
        // eslint-disable-next-line no-console
        console.log(`[getpro] Seeded tenant_cities for Zambia (${cities.length} rows).`);
      }
    }
    db.prepare("INSERT INTO _getpro_migrations (id) VALUES (?)").run("tenant_cities_seed_zm_v1");
  }
} catch (e) {
  // eslint-disable-next-line no-console
  console.error("[getpro] tenant_cities seed:", e.message);
}

/** One-time: copy Zambia city list to demo tenant when demo has no cities (admin Cities tab + join autocomplete). */
try {
  const TID = require("./tenantIds");
  db.exec(`
    CREATE TABLE IF NOT EXISTS _getpro_migrations (id TEXT PRIMARY KEY NOT NULL);
  `);
  if (!db.prepare("SELECT 1 FROM _getpro_migrations WHERE id = ?").get("demo_tenant_cities_copy_from_zm_v1")) {
    const demoId = TID.TENANT_DEMO;
    const zmId = TID.TENANT_ZM;
    const nDemo = db.prepare("SELECT COUNT(*) AS c FROM tenant_cities WHERE tenant_id = ?").get(demoId).c;
    if (Number(nDemo) === 0) {
      const rows = db
        .prepare("SELECT name, enabled, big_city FROM tenant_cities WHERE tenant_id = ? ORDER BY name COLLATE NOCASE ASC")
        .all(zmId);
      if (rows.length) {
        const ins = db.prepare(
          "INSERT INTO tenant_cities (tenant_id, name, enabled, big_city) VALUES (?, ?, ?, ?)"
        );
        const tx = db.transaction(() => {
          for (const r of rows) {
            ins.run(demoId, r.name, r.enabled, r.big_city);
          }
        });
        tx();
        // eslint-disable-next-line no-console
        console.log(`[getpro] Migration: copied ${rows.length} cities to demo tenant for admin/join.`);
      }
    }
    db.prepare("INSERT INTO _getpro_migrations (id) VALUES (?)").run("demo_tenant_cities_copy_from_zm_v1");
  }
} catch (e) {
  // eslint-disable-next-line no-console
  console.error("[getpro] demo tenant_cities copy migration:", e.message);
}

/** Lead workflow: status values + threaded admin comments. */
try {
  db.exec(`
    CREATE TABLE IF NOT EXISTS _getpro_migrations (id TEXT PRIMARY KEY NOT NULL);
  `);
  if (!db.prepare("SELECT 1 FROM _getpro_migrations WHERE id = ?").get("leads_comments_and_status_v1")) {
    db.exec(`
      CREATE TABLE IF NOT EXISTS lead_comments (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        lead_id INTEGER NOT NULL,
        body TEXT NOT NULL DEFAULT '',
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        FOREIGN KEY(lead_id) REFERENCES leads(id) ON DELETE CASCADE
      );
      CREATE INDEX IF NOT EXISTS idx_lead_comments_lead_id ON lead_comments(lead_id);
    `);
    const leadCols = db.prepare("PRAGMA table_info(leads)").all();
    const leadNames = new Set(leadCols.map((c) => c.name));
    if (!leadNames.has("updated_at")) {
      db.exec(`ALTER TABLE leads ADD COLUMN updated_at TEXT NOT NULL DEFAULT (datetime('now'))`);
    }
    db.prepare(
      `UPDATE leads SET status = 'open' WHERE status IS NULL OR TRIM(status) = '' OR LOWER(status) = 'new'`
    ).run();
    db.prepare(
      `UPDATE leads SET status = 'open' WHERE LOWER(status) NOT IN ('open','in_progress','deferred','closed')`
    ).run();
    db.prepare("INSERT INTO _getpro_migrations (id) VALUES (?)").run("leads_comments_and_status_v1");
  }
} catch (e) {
  // eslint-disable-next-line no-console
  console.error("[getpro] leads comments migration:", e.message);
}

/** Multi-tenant CRM tasks + audit trail. */
try {
  db.exec(`
    CREATE TABLE IF NOT EXISTS _getpro_migrations (id TEXT PRIMARY KEY NOT NULL);
  `);
  if (!db.prepare("SELECT 1 FROM _getpro_migrations WHERE id = ?").get("crm_tasks_v1")) {
    db.exec(`
      CREATE TABLE IF NOT EXISTS crm_tasks (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        tenant_id INTEGER NOT NULL REFERENCES tenants(id),
        title TEXT NOT NULL DEFAULT '',
        description TEXT NOT NULL DEFAULT '',
        status TEXT NOT NULL DEFAULT 'new',
        owner_id INTEGER REFERENCES admin_users(id),
        created_by_id INTEGER REFERENCES admin_users(id),
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
      CREATE INDEX IF NOT EXISTS idx_crm_tasks_tenant ON crm_tasks(tenant_id);
      CREATE INDEX IF NOT EXISTS idx_crm_tasks_owner ON crm_tasks(owner_id);
      CREATE INDEX IF NOT EXISTS idx_crm_tasks_status ON crm_tasks(status);

      CREATE TABLE IF NOT EXISTS crm_audit_logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        tenant_id INTEGER NOT NULL REFERENCES tenants(id),
        task_id INTEGER NOT NULL REFERENCES crm_tasks(id) ON DELETE CASCADE,
        user_id INTEGER REFERENCES admin_users(id),
        action_type TEXT NOT NULL,
        details TEXT NOT NULL DEFAULT '',
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
      CREATE INDEX IF NOT EXISTS idx_crm_audit_task ON crm_audit_logs(task_id);
      CREATE INDEX IF NOT EXISTS idx_crm_audit_tenant ON crm_audit_logs(tenant_id);
    `);
    db.prepare("INSERT INTO _getpro_migrations (id) VALUES (?)").run("crm_tasks_v1");
  }
} catch (e) {
  // eslint-disable-next-line no-console
  console.error("[getpro] crm_tasks migration:", e.message);
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

