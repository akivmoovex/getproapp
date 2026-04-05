"use strict";
module.exports = function run(db) {/** Lead workflow: status values + threaded admin comments. */
try {
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

/** CRM task comments (detail page). */
try {
  if (!db.prepare("SELECT 1 FROM _getpro_migrations WHERE id = ?").get("crm_task_comments_v1")) {
    db.exec(`
      CREATE TABLE IF NOT EXISTS crm_task_comments (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        tenant_id INTEGER NOT NULL REFERENCES tenants(id),
        task_id INTEGER NOT NULL REFERENCES crm_tasks(id) ON DELETE CASCADE,
        user_id INTEGER NOT NULL REFERENCES admin_users(id),
        body TEXT NOT NULL DEFAULT '',
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
      CREATE INDEX IF NOT EXISTS idx_crm_comments_task ON crm_task_comments(task_id);
      CREATE INDEX IF NOT EXISTS idx_crm_comments_tenant ON crm_task_comments(tenant_id);
    `);
    db.prepare("INSERT INTO _getpro_migrations (id) VALUES (?)").run("crm_task_comments_v1");
  }
} catch (e) {
  // eslint-disable-next-line no-console
  console.error("[getpro] crm_task_comments migration:", e.message);
}

/** CRM: replace pending/waiting with blocked; optional attachment URL. */
try {
  if (!db.prepare("SELECT 1 FROM _getpro_migrations WHERE id = ?").get("crm_tasks_blocked_attachment_v1")) {
    db.prepare("UPDATE crm_tasks SET status = 'blocked' WHERE status IN ('pending', 'waiting')").run();
    const crmCols = new Set(db.prepare("PRAGMA table_info(crm_tasks)").all().map((c) => c.name));
    if (!crmCols.has("attachment_url")) {
      db.exec("ALTER TABLE crm_tasks ADD COLUMN attachment_url TEXT NOT NULL DEFAULT ''");
    }
    db.prepare("INSERT INTO _getpro_migrations (id) VALUES (?)").run("crm_tasks_blocked_attachment_v1");
  }
} catch (e) {
  // eslint-disable-next-line no-console
  console.error("[getpro] crm_tasks blocked/attachment migration:", e.message);
}

/** CRM: optional source linkage for auto-created tasks. */
try {
  if (!db.prepare("SELECT 1 FROM _getpro_migrations WHERE id = ?").get("crm_tasks_source_v1")) {
    const crmCols = new Set(db.prepare("PRAGMA table_info(crm_tasks)").all().map((c) => c.name));
    if (!crmCols.has("source_type")) {
      db.exec("ALTER TABLE crm_tasks ADD COLUMN source_type TEXT NOT NULL DEFAULT 'manual'");
    }
    if (!crmCols.has("source_ref_id")) {
      db.exec("ALTER TABLE crm_tasks ADD COLUMN source_ref_id INTEGER");
    }
    db.prepare("INSERT INTO _getpro_migrations (id) VALUES (?)").run("crm_tasks_source_v1");
  }
} catch (e) {
  // eslint-disable-next-line no-console
  console.error("[getpro] crm_tasks source migration:", e.message);
}

/** Join signups: track converted listing. */
try {
  if (!db.prepare("SELECT 1 FROM _getpro_migrations WHERE id = ?").get("professional_signups_converted_v1")) {
    const psCols = new Set(db.prepare("PRAGMA table_info(professional_signups)").all().map((c) => c.name));
    if (!psCols.has("converted_company_id")) {
      db.exec("ALTER TABLE professional_signups ADD COLUMN converted_company_id INTEGER REFERENCES companies(id)");
    }
    db.prepare("INSERT INTO _getpro_migrations (id) VALUES (?)").run("professional_signups_converted_v1");
  }
} catch (e) {
  // eslint-disable-next-line no-console
  console.error("[getpro] professional_signups converted migration:", e.message);
}
};
