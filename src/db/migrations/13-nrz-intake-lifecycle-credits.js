"use strict";
module.exports = function run(db) {/**
 * company_personnel_users.nrz_number: optional reference data (same validation as intake NRZ in admin).
 * Enforce at most one non-empty NRZ per tenant when values match after trim+uppercase (SQLite stores normalized form from admin/seed).
 * If legacy duplicates exist, skip index and log once — operators should resolve manually.
 */
try {
  if (!db.prepare("SELECT 1 FROM _getpro_migrations WHERE id = ?").get("company_portal_v5_nrz_unique")) {
    const dup = db
      .prepare(
        `
        SELECT tenant_id, upper(trim(nrz_number)) AS n
        FROM company_personnel_users
        WHERE length(trim(nrz_number)) > 0
        GROUP BY tenant_id, upper(trim(nrz_number))
        HAVING COUNT(*) > 1
        LIMIT 1
        `
      )
      .get();
    if (dup) {
      // eslint-disable-next-line no-console
      console.warn(
        "[getpro] Skipped unique index on company_personnel_users.nrz_number: duplicate NRZ values exist for a tenant; resolve duplicates then re-run migration manually if needed."
      );
    } else {
      db.exec(
        `CREATE UNIQUE INDEX IF NOT EXISTS idx_company_personnel_tenant_nrz_nonempty
         ON company_personnel_users(tenant_id, nrz_number) WHERE length(trim(nrz_number)) > 0`
      );
    }
    db.prepare("INSERT INTO _getpro_migrations (id) VALUES (?)").run("company_portal_v5_nrz_unique");
    // eslint-disable-next-line no-console
    console.log("[getpro] Migration: company_portal_v5_nrz_unique (optional NRZ uniqueness per tenant).");
  }
} catch (e) {
  // eslint-disable-next-line no-console
  console.error("[getpro] company_portal_v5_nrz_unique migration:", e.message);
}

/**
 * Intake project lifecycle (draft → published) + category on project + SLA / allocation config tables (Stage 1).
 * Legacy status new/submitted → published so existing assignments stay visible to company portal.
 */
try {
  if (!db.prepare("SELECT 1 FROM _getpro_migrations WHERE id = ?").get("intake_project_lifecycle_v1")) {
    const ipc = db.prepare("PRAGMA table_info(intake_client_projects)").all();
    const ipcNames = new Set(ipc.map((c) => c.name));
    if (!ipcNames.has("intake_category_id")) {
      db.exec(`ALTER TABLE intake_client_projects ADD COLUMN intake_category_id INTEGER REFERENCES categories(id)`);
    }

    db.exec(`
      CREATE TABLE IF NOT EXISTS intake_category_lead_settings (
        tenant_id INTEGER NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        category_id INTEGER NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
        response_window_hours INTEGER NOT NULL DEFAULT 72,
        updated_at TEXT NOT NULL DEFAULT (datetime('now')),
        PRIMARY KEY (tenant_id, category_id)
      );
      CREATE TABLE IF NOT EXISTS intake_allocation_settings (
        tenant_id INTEGER NOT NULL PRIMARY KEY REFERENCES tenants(id) ON DELETE CASCADE,
        established_min_rating REAL NOT NULL DEFAULT 4.0,
        established_min_review_count INTEGER NOT NULL DEFAULT 5,
        provisional_min_rating REAL NOT NULL DEFAULT 3.5,
        provisional_max_review_count INTEGER NOT NULL DEFAULT 4,
        initial_allocation_count INTEGER NOT NULL DEFAULT 3,
        target_positive_responses INTEGER NOT NULL DEFAULT 2,
        require_category_for_publish INTEGER NOT NULL DEFAULT 1,
        require_budget_for_publish INTEGER NOT NULL DEFAULT 1,
        require_min_images_for_publish INTEGER NOT NULL DEFAULT 1,
        min_images_for_publish INTEGER NOT NULL DEFAULT 1,
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
    `);

    db.exec(`INSERT OR IGNORE INTO intake_allocation_settings (tenant_id) SELECT id FROM tenants`);

    db.prepare(
      `UPDATE intake_client_projects SET status = 'published' WHERE lower(trim(status)) IN ('new', 'submitted')`
    ).run();

    db.prepare("INSERT INTO _getpro_migrations (id) VALUES (?)").run("intake_project_lifecycle_v1");
    // eslint-disable-next-line no-console
    console.log("[getpro] Migration: intake_project_lifecycle_v1 (lifecycle, category_id, SLA + allocation config).");
  }
} catch (e) {
  // eslint-disable-next-line no-console
  console.error("[getpro] intake_project_lifecycle_v1 migration:", e.message);
}

/** Stage 2: explicit assignment deadlines, auto-allocation waves, configurable tier thresholds alignment. */
try {
  if (!db.prepare("SELECT 1 FROM _getpro_migrations WHERE id = ?").get("intake_provider_allocation_v2")) {
    const ipcCols = db.prepare("PRAGMA table_info(intake_client_projects)").all();
    const ipcNames = new Set(ipcCols.map((c) => c.name));
    if (!ipcNames.has("intake_allocation_wave_deadline_at")) {
      db.exec(`ALTER TABLE intake_client_projects ADD COLUMN intake_allocation_wave_deadline_at TEXT`);
    }
    if (!ipcNames.has("intake_allocation_wave_number")) {
      db.exec(`ALTER TABLE intake_client_projects ADD COLUMN intake_allocation_wave_number INTEGER NOT NULL DEFAULT 0`);
    }
    if (!ipcNames.has("intake_auto_allocation_seeded")) {
      db.exec(`ALTER TABLE intake_client_projects ADD COLUMN intake_auto_allocation_seeded INTEGER NOT NULL DEFAULT 0`);
    }
    if (!ipcNames.has("intake_auto_allocation_paused")) {
      db.exec(`ALTER TABLE intake_client_projects ADD COLUMN intake_auto_allocation_paused INTEGER NOT NULL DEFAULT 0`);
    }

    const asgCols = db.prepare("PRAGMA table_info(intake_project_assignments)").all();
    const asgNames = new Set(asgCols.map((c) => c.name));
    if (!asgNames.has("response_deadline_at")) {
      db.exec(`ALTER TABLE intake_project_assignments ADD COLUMN response_deadline_at TEXT`);
    }
    if (!asgNames.has("allocation_source")) {
      db.exec(
        `ALTER TABLE intake_project_assignments ADD COLUMN allocation_source TEXT NOT NULL DEFAULT 'manual'`
      );
    }
    if (!asgNames.has("allocation_wave")) {
      db.exec(`ALTER TABLE intake_project_assignments ADD COLUMN allocation_wave INTEGER NOT NULL DEFAULT 0`);
    }

    db.prepare(
      `UPDATE intake_allocation_settings SET established_min_rating = 3.0 WHERE ABS(established_min_rating - 4.0) < 0.01`
    ).run();
    db.prepare(
      `UPDATE intake_allocation_settings SET provisional_min_rating = 2.0 WHERE ABS(provisional_min_rating - 3.5) < 0.01`
    ).run();

    db.prepare(
      `UPDATE intake_client_projects SET intake_auto_allocation_seeded = 1 WHERE lower(trim(status)) = 'published'`
    ).run();

    db.prepare("INSERT INTO _getpro_migrations (id) VALUES (?)").run("intake_provider_allocation_v2");
    // eslint-disable-next-line no-console
    console.log("[getpro] Migration: intake_provider_allocation_v2 (assignment SLA columns, auto-allocation state).");
  }
} catch (e) {
  // eslint-disable-next-line no-console
  console.error("[getpro] intake_provider_allocation_v2 migration:", e.message);
}

/** Provider portal: lead credit balance (ZMW tenants: block acceptance below threshold). */
try {
  if (!db.prepare("SELECT 1 FROM _getpro_migrations WHERE id = ?").get("company_portal_lead_credits_v1")) {
    const coCols = db.prepare("PRAGMA table_info(companies)").all();
    const coNames = new Set(coCols.map((c) => c.name));
    if (!coNames.has("portal_lead_credits_balance")) {
      db.exec(`ALTER TABLE companies ADD COLUMN portal_lead_credits_balance REAL NOT NULL DEFAULT 0`);
    }
    db.prepare("INSERT INTO _getpro_migrations (id) VALUES (?)").run("company_portal_lead_credits_v1");
    // eslint-disable-next-line no-console
    console.log("[getpro] Migration: company_portal_lead_credits_v1 (portal_lead_credits_balance on companies).");
  }
} catch (e) {
  // eslint-disable-next-line no-console
  console.error("[getpro] company_portal_lead_credits_v1 migration:", e.message);
}

/** Provider portal credits: one account per company + append-only payment ledger (auditable). */
try {
  if (!db.prepare("SELECT 1 FROM _getpro_migrations WHERE id = ?").get("company_portal_credit_ledger_v1")) {
    db.exec(`
      CREATE TABLE IF NOT EXISTS company_portal_credit_accounts (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        tenant_id INTEGER NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        UNIQUE(tenant_id, company_id)
      );
      CREATE INDEX IF NOT EXISTS idx_cp_credit_accounts_tenant ON company_portal_credit_accounts(tenant_id);

      CREATE TABLE IF NOT EXISTS company_portal_credit_ledger_entries (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        tenant_id INTEGER NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
        credit_account_id INTEGER NOT NULL REFERENCES company_portal_credit_accounts(id) ON DELETE CASCADE,
        amount_zmw REAL NOT NULL,
        payment_method TEXT NOT NULL,
        transaction_reference TEXT NOT NULL,
        payment_date TEXT NOT NULL,
        approver_name TEXT NOT NULL,
        recorded_by_admin_user_id INTEGER REFERENCES admin_users(id),
        notes TEXT NOT NULL DEFAULT '',
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        CHECK (amount_zmw > 0)
      );
      CREATE INDEX IF NOT EXISTS idx_cp_credit_ledger_tenant_co ON company_portal_credit_ledger_entries(tenant_id, company_id);
      CREATE INDEX IF NOT EXISTS idx_cp_credit_ledger_account ON company_portal_credit_ledger_entries(credit_account_id);
    `);
    db.prepare("INSERT INTO _getpro_migrations (id) VALUES (?)").run("company_portal_credit_ledger_v1");
    // eslint-disable-next-line no-console
    console.log("[getpro] Migration: company_portal_credit_ledger_v1 (credit accounts + payment ledger).");
  }
} catch (e) {
  // eslint-disable-next-line no-console
  console.error("[getpro] company_portal_credit_ledger_v1 migration:", e.message);
}
};
