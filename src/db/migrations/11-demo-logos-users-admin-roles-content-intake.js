"use strict";
module.exports = function run(db) {/** One-time: demo tenant sample companies get distinct placeholder logos (hero + carousel). */
try {
  const TID = require("../../tenants/tenantIds");
  if (!db.prepare("SELECT 1 FROM _getpro_migrations WHERE id = ?").get("demo_company_logos_v1")) {
    const demoTenantId = TID.TENANT_DEMO;
    const logos = [
      {
        sub: "demo-lusaka-spark",
        url: "https://ui-avatars.com/api/?name=Spark&size=120&background=2563eb&color=fff&bold=true",
      },
      {
        sub: "demo-lusaka-voltpro",
        url: "https://ui-avatars.com/api/?name=VoltPro&size=120&background=dc2626&color=fff&bold=true",
      },
      {
        sub: "demo-lusaka-flow",
        url: "https://ui-avatars.com/api/?name=Flow&size=120&background=059669&color=fff&bold=true",
      },
      {
        sub: "demo-kitwe-wire",
        url: "https://ui-avatars.com/api/?name=Copper&size=120&background=ca8a04&color=fff&bold=true",
      },
    ];
    const upd = db.prepare("UPDATE companies SET logo_url = ? WHERE tenant_id = ? AND subdomain = ?");
    for (const row of logos) {
      upd.run(row.url, demoTenantId, row.sub);
    }
    db.prepare("INSERT INTO _getpro_migrations (id) VALUES (?)").run("demo_company_logos_v1");
  }
} catch (e) {
  // eslint-disable-next-line no-console
  console.error("[getpro] demo company logos migration:", e.message);
}

/** One-time: demo tenant admin users + sample CRM tasks (demo region only). */
try {
  const bcrypt = require("bcryptjs");
  const { ROLES } = require("../../auth/roles");
  const TID = require("../../tenants/tenantIds");
  if (!db.prepare("SELECT 1 FROM _getpro_migrations WHERE id = ?").get("demo_tenant_users_and_tasks_v1")) {
    const demoTid = TID.TENANT_DEMO;
    const hash = (p) => bcrypt.hashSync(p, 10);
    const insUser = db.prepare(
      "INSERT INTO admin_users (username, password_hash, role, tenant_id, enabled) VALUES (?, ?, ?, ?, 1)"
    );
    const seedUsers = [
      { username: "demo_manager", role: ROLES.TENANT_MANAGER },
      { username: "demo_editor", role: ROLES.TENANT_EDITOR },
      { username: "demo_agent", role: ROLES.TENANT_AGENT },
    ];
    for (const su of seedUsers) {
      const u = su.username.toLowerCase();
      if (!db.prepare("SELECT id FROM admin_users WHERE username = ?").get(u)) {
        insUser.run(u, hash("demo1234"), su.role, demoTid);
      }
    }

    const demoUserRow = db.prepare("SELECT id FROM admin_users WHERE tenant_id = ? ORDER BY id ASC LIMIT 1").get(demoTid);
    const uid = demoUserRow ? Number(demoUserRow.id) : null;
    const taskCount = db.prepare("SELECT COUNT(*) AS c FROM crm_tasks WHERE tenant_id = ?").get(demoTid).c;
    if (uid && Number(taskCount) === 0) {
      const insTask = db.prepare(
        "INSERT INTO crm_tasks (tenant_id, title, description, status, owner_id, created_by_id, attachment_url) VALUES (?, ?, ?, ?, ?, ?, ?)"
      );
      insTask.run(
        demoTid,
        "Follow up with sample lead",
        "Demo task: call back from a directory inquiry.",
        "new",
        null,
        uid,
        ""
      );
      insTask.run(
        demoTid,
        "Onboard new company listing",
        "Review profile text and photos for a demo tenant listing.",
        "in_progress",
        uid,
        uid,
        ""
      );
      insTask.run(
        demoTid,
        "Quarterly directory review",
        "Spot-check professions and city filters for consistency.",
        "completed",
        uid,
        uid,
        ""
      );
    }
    db.prepare("INSERT INTO _getpro_migrations (id) VALUES (?)").run("demo_tenant_users_and_tasks_v1");
    // eslint-disable-next-line no-console
    console.log("[getpro] Migration: demo tenant seed users + CRM tasks (if empty).");
  }
} catch (e) {
  // eslint-disable-next-line no-console
  console.error("[getpro] demo tenant users/tasks migration:", e.message);
}

/** Multi-tenant admin: one username, many regions via admin_user_tenant_roles (idempotent). */
try {
  const { ROLES } = require("../../auth/roles");
  if (!db.prepare("SELECT 1 FROM _getpro_migrations WHERE id = ?").get("admin_user_tenant_roles_v1")) {
    db.exec(`
      CREATE TABLE IF NOT EXISTS admin_user_tenant_roles (
        admin_user_id INTEGER NOT NULL REFERENCES admin_users(id) ON DELETE CASCADE,
        tenant_id INTEGER NOT NULL REFERENCES tenants(id),
        role TEXT NOT NULL,
        PRIMARY KEY (admin_user_id, tenant_id)
      );
      CREATE INDEX IF NOT EXISTS idx_admin_user_tenant_roles_user ON admin_user_tenant_roles(admin_user_id);
      CREATE INDEX IF NOT EXISTS idx_admin_user_tenant_roles_tenant ON admin_user_tenant_roles(tenant_id);
    `);
    const adCols = db.prepare("PRAGMA table_info(admin_users)").all();
    if (!adCols.some((c) => c.name === "display_name")) {
      db.exec("ALTER TABLE admin_users ADD COLUMN display_name TEXT NOT NULL DEFAULT ''");
    }
    const backfill = db.prepare(`
      INSERT OR IGNORE INTO admin_user_tenant_roles (admin_user_id, tenant_id, role)
      SELECT id, tenant_id, role FROM admin_users
      WHERE tenant_id IS NOT NULL AND COALESCE(role, '') != ?
    `);
    backfill.run(ROLES.SUPER_ADMIN);
    db.prepare("INSERT INTO _getpro_migrations (id) VALUES (?)").run("admin_user_tenant_roles_v1");
    // eslint-disable-next-line no-console
    console.log("[getpro] Migration: admin_user_tenant_roles + admin_users.display_name (backfilled).");
  }
} catch (e) {
  // eslint-disable-next-line no-console
  console.error("[getpro] admin_user_tenant_roles migration:", e.message);
}

try {
  const mig = db.prepare("SELECT 1 FROM _getpro_migrations WHERE id = ?").get("content_pages_v1");
  if (!mig) {
    db.exec(`
      CREATE TABLE IF NOT EXISTS content_pages (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        tenant_id INTEGER NOT NULL REFERENCES tenants(id),
        kind TEXT NOT NULL CHECK(kind IN ('article','guide','faq')),
        slug TEXT NOT NULL,
        title TEXT NOT NULL,
        excerpt TEXT NOT NULL DEFAULT '',
        body TEXT NOT NULL DEFAULT '',
        hero_image_url TEXT NOT NULL DEFAULT '',
        hero_image_alt TEXT NOT NULL DEFAULT '',
        seo_title TEXT NOT NULL DEFAULT '',
        seo_description TEXT NOT NULL DEFAULT '',
        published INTEGER NOT NULL DEFAULT 0,
        sort_order INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now')),
        UNIQUE(tenant_id, kind, slug)
      );
      CREATE INDEX IF NOT EXISTS idx_content_pages_tenant_kind ON content_pages(tenant_id, kind);
      CREATE INDEX IF NOT EXISTS idx_content_pages_published ON content_pages(tenant_id, published);
    `);
    db.prepare("INSERT INTO _getpro_migrations (id) VALUES (?)").run("content_pages_v1");
    // eslint-disable-next-line no-console
    console.log("[getpro] Migration: content_pages (editorial / SEO).");
  }
} catch (e) {
  // eslint-disable-next-line no-console
  console.error("[getpro] content_pages migration:", e.message);
}

/**
 * Admin “New Project” intake: tenant-scoped clients, projects, images, OTP rows.
 *
 * Internal PKs: INTEGER AUTOINCREMENT on intake_clients.id, intake_client_projects.id.
 * Public codes: client_code / project_code — UNIQUE(tenant_id, code); PREFIX-000001 from tenants.intake_code_prefix (if set) else slug-derived + intake_code_sequences.
 */
try {
  if (!db.prepare("SELECT 1 FROM _getpro_migrations WHERE id = ?").get("client_project_intake_v1")) {
    db.exec(`
      CREATE TABLE IF NOT EXISTS intake_code_sequences (
        tenant_id INTEGER NOT NULL REFERENCES tenants(id),
        scope TEXT NOT NULL CHECK(scope IN ('client','project')),
        next_seq INTEGER NOT NULL DEFAULT 1,
        PRIMARY KEY (tenant_id, scope)
      );

      CREATE TABLE IF NOT EXISTS intake_clients (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        tenant_id INTEGER NOT NULL REFERENCES tenants(id),
        client_code TEXT NOT NULL,
        external_client_reference TEXT NOT NULL DEFAULT '',
        full_name TEXT NOT NULL DEFAULT '',
        phone TEXT NOT NULL DEFAULT '',
        phone_normalized TEXT NOT NULL DEFAULT '',
        whatsapp_phone TEXT NOT NULL DEFAULT '',
        nrz_number TEXT NOT NULL DEFAULT '',
        nrz_normalized TEXT NOT NULL DEFAULT '',
        address_street TEXT NOT NULL DEFAULT '',
        address_house_number TEXT NOT NULL DEFAULT '',
        address_apartment_number TEXT NOT NULL DEFAULT '',
        phone_verified_at TEXT,
        updated_by_admin_user_id INTEGER REFERENCES admin_users(id),
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now')),
        UNIQUE(tenant_id, client_code)
      );
      CREATE UNIQUE INDEX IF NOT EXISTS idx_intake_clients_tenant_phone
        ON intake_clients(tenant_id, phone_normalized) WHERE length(trim(phone_normalized)) > 0;
      CREATE UNIQUE INDEX IF NOT EXISTS idx_intake_clients_tenant_nrz
        ON intake_clients(tenant_id, nrz_normalized) WHERE length(trim(nrz_normalized)) > 0;
      CREATE UNIQUE INDEX IF NOT EXISTS idx_intake_clients_tenant_extref
        ON intake_clients(tenant_id, external_client_reference) WHERE length(trim(external_client_reference)) > 0;

      CREATE TABLE IF NOT EXISTS intake_client_projects (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        tenant_id INTEGER NOT NULL REFERENCES tenants(id),
        client_id INTEGER NOT NULL REFERENCES intake_clients(id) ON DELETE CASCADE,
        project_code TEXT NOT NULL,
        client_full_name_snapshot TEXT NOT NULL DEFAULT '',
        client_phone_snapshot TEXT NOT NULL DEFAULT '',
        city TEXT NOT NULL DEFAULT '',
        neighborhood TEXT NOT NULL DEFAULT '',
        street_name TEXT NOT NULL DEFAULT '',
        house_number TEXT NOT NULL DEFAULT '',
        apartment_number TEXT NOT NULL DEFAULT '',
        client_address_street TEXT NOT NULL DEFAULT '',
        client_address_house_number TEXT NOT NULL DEFAULT '',
        client_address_apartment_number TEXT NOT NULL DEFAULT '',
        estimated_budget_value REAL,
        estimated_budget_currency TEXT NOT NULL DEFAULT '',
        status TEXT NOT NULL DEFAULT 'new',
        created_by_admin_user_id INTEGER REFERENCES admin_users(id),
        updated_by_admin_user_id INTEGER REFERENCES admin_users(id),
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now')),
        UNIQUE(tenant_id, project_code)
      );
      CREATE INDEX IF NOT EXISTS idx_intake_projects_tenant_client ON intake_client_projects(tenant_id, client_id);

      CREATE TABLE IF NOT EXISTS intake_project_images (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        tenant_id INTEGER NOT NULL REFERENCES tenants(id),
        project_id INTEGER NOT NULL REFERENCES intake_client_projects(id) ON DELETE CASCADE,
        image_path TEXT NOT NULL,
        sort_order INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
      CREATE INDEX IF NOT EXISTS idx_intake_project_images_lookup ON intake_project_images(tenant_id, project_id, sort_order);

      CREATE TABLE IF NOT EXISTS intake_phone_otp (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        tenant_id INTEGER NOT NULL REFERENCES tenants(id),
        client_id INTEGER REFERENCES intake_clients(id) ON DELETE SET NULL,
        phone_normalized TEXT NOT NULL,
        code_hash TEXT NOT NULL,
        purpose TEXT NOT NULL DEFAULT 'phone_verify',
        expires_at TEXT NOT NULL,
        attempts INTEGER NOT NULL DEFAULT 0,
        max_attempts INTEGER NOT NULL DEFAULT 5,
        verified_at TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
      CREATE INDEX IF NOT EXISTS idx_intake_otp_lookup ON intake_phone_otp(tenant_id, phone_normalized, expires_at);
    `);
    db.prepare("INSERT INTO _getpro_migrations (id) VALUES (?)").run("client_project_intake_v1");
    // eslint-disable-next-line no-console
    console.log("[getpro] Migration: client_project_intake_v1 (intake_clients, projects, images, OTP).");
  }
} catch (e) {
  // eslint-disable-next-line no-console
  console.error("[getpro] client_project_intake migration:", e.message);
}

/** Intake cleanup: rename external ref column, tenant prefix, snapshots, status default, updated_by. */
try {
  if (!db.prepare("SELECT 1 FROM _getpro_migrations WHERE id = ?").get("client_project_intake_v2")) {
    const tcols = db.prepare("PRAGMA table_info(tenants)").all();
    const tNames = new Set(tcols.map((c) => c.name));
    if (!tNames.has("intake_code_prefix")) {
      db.exec("ALTER TABLE tenants ADD COLUMN intake_code_prefix TEXT NOT NULL DEFAULT ''");
    }
    const slugPrefixes = [
      ["global", "GLOBAL"],
      ["demo", "DEMO"],
      ["il", "IL"],
      ["zm", "ZM"],
      ["zw", "ZW"],
      ["bw", "BW"],
      ["za", "ZA"],
      ["na", "NA"],
    ];
    const updPref = db.prepare("UPDATE tenants SET intake_code_prefix = ? WHERE slug = ? AND (intake_code_prefix IS NULL OR trim(intake_code_prefix) = '')");
    for (const [slug, pref] of slugPrefixes) {
      updPref.run(pref, slug);
    }

    const hasIntakeClients = db
      .prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='intake_clients'")
      .get();
    if (hasIntakeClients) {
      const icols = db.prepare("PRAGMA table_info(intake_clients)").all();
      const iNames = new Set(icols.map((c) => c.name));
      if (iNames.has("external_user_id") && !iNames.has("external_client_reference")) {
        db.exec("DROP INDEX IF EXISTS idx_intake_clients_tenant_extuser");
        db.exec("ALTER TABLE intake_clients RENAME COLUMN external_user_id TO external_client_reference");
      }
      db.exec(
        `CREATE UNIQUE INDEX IF NOT EXISTS idx_intake_clients_tenant_extref
         ON intake_clients(tenant_id, external_client_reference) WHERE length(trim(external_client_reference)) > 0`
      );
      const ic2 = db.prepare("PRAGMA table_info(intake_clients)").all();
      const in2 = new Set(ic2.map((c) => c.name));
      if (!in2.has("updated_by_admin_user_id")) {
        db.exec("ALTER TABLE intake_clients ADD COLUMN updated_by_admin_user_id INTEGER REFERENCES admin_users(id)");
      }
    }

    const pcols = db.prepare("PRAGMA table_info(intake_client_projects)").all();
    if (pcols.length > 0) {
      const pNames = new Set(pcols.map((c) => c.name));
      if (!pNames.has("client_full_name_snapshot")) {
        db.exec("ALTER TABLE intake_client_projects ADD COLUMN client_full_name_snapshot TEXT NOT NULL DEFAULT ''");
      }
      if (!pNames.has("client_phone_snapshot")) {
        db.exec("ALTER TABLE intake_client_projects ADD COLUMN client_phone_snapshot TEXT NOT NULL DEFAULT ''");
      }
      if (!pNames.has("updated_by_admin_user_id")) {
        db.exec("ALTER TABLE intake_client_projects ADD COLUMN updated_by_admin_user_id INTEGER REFERENCES admin_users(id)");
      }
      db.exec("UPDATE intake_client_projects SET status = 'new' WHERE status = 'submitted'");
      const snapRows = db
        .prepare(
          `SELECT p.id AS pid, p.tenant_id AS tid, c.full_name AS fn, c.phone AS ph
           FROM intake_client_projects p
           JOIN intake_clients c ON c.id = p.client_id AND c.tenant_id = p.tenant_id
           WHERE trim(COALESCE(p.client_full_name_snapshot, '')) = ''
              OR trim(COALESCE(p.client_phone_snapshot, '')) = ''`
        )
        .all();
      const upSnap = db.prepare(
        `UPDATE intake_client_projects SET client_full_name_snapshot = ?, client_phone_snapshot = ? WHERE id = ? AND tenant_id = ?`
      );
      for (const r of snapRows) {
        upSnap.run(r.fn || "", r.ph || "", r.pid, r.tid);
      }
    }

    db.prepare("INSERT INTO _getpro_migrations (id) VALUES (?)").run("client_project_intake_v2");
    // eslint-disable-next-line no-console
    console.log("[getpro] Migration: client_project_intake_v2 (intake ref rename, tenant prefix, snapshots, status).");
  }
} catch (e) {
  // eslint-disable-next-line no-console
  console.error("[getpro] client_project_intake_v2 migration:", e.message);
}
};
