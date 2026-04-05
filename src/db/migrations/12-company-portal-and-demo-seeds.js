"use strict";
module.exports = function run(db) {/** Company portal: personnel logins + explicit intake project → company assignments (no heuristic matching). */
try {
  if (!db.prepare("SELECT 1 FROM _getpro_migrations WHERE id = ?").get("company_portal_v1")) {
    db.exec(`
      CREATE TABLE IF NOT EXISTS company_personnel_users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        tenant_id INTEGER NOT NULL REFERENCES tenants(id),
        company_id INTEGER NOT NULL REFERENCES companies(id),
        full_name TEXT NOT NULL DEFAULT '',
        phone_normalized TEXT NOT NULL DEFAULT '',
        password_hash TEXT NOT NULL DEFAULT '',
        is_active INTEGER NOT NULL DEFAULT 1,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
      CREATE UNIQUE INDEX IF NOT EXISTS idx_company_personnel_tenant_phone
        ON company_personnel_users(tenant_id, phone_normalized);
      CREATE INDEX IF NOT EXISTS idx_company_personnel_company
        ON company_personnel_users(tenant_id, company_id);

      CREATE TABLE IF NOT EXISTS intake_project_assignments (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        tenant_id INTEGER NOT NULL REFERENCES tenants(id),
        project_id INTEGER NOT NULL REFERENCES intake_client_projects(id) ON DELETE CASCADE,
        company_id INTEGER NOT NULL REFERENCES companies(id),
        assigned_by_admin_user_id INTEGER REFERENCES admin_users(id),
        status TEXT NOT NULL DEFAULT 'pending',
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now')),
        UNIQUE(tenant_id, project_id, company_id)
      );
      CREATE INDEX IF NOT EXISTS idx_intake_assign_company_status
        ON intake_project_assignments(tenant_id, company_id, status);
      CREATE INDEX IF NOT EXISTS idx_intake_assign_project
        ON intake_project_assignments(tenant_id, project_id);
    `);
    db.prepare("INSERT INTO _getpro_migrations (id) VALUES (?)").run("company_portal_v1");
    // eslint-disable-next-line no-console
    console.log("[getpro] Migration: company_portal_v1 (personnel users, project assignments).");
  }
} catch (e) {
  // eslint-disable-next-line no-console
  console.error("[getpro] company_portal_v1 migration:", e.message);
}

/**
 * Assignment workflow fields + username login + partial unique phone.
 * demo_client seed: see company_portal_v3_demo_portal_polish (deterministic company + env gate).
 */
try {
  if (!db.prepare("SELECT 1 FROM _getpro_migrations WHERE id = ?").get("company_portal_v2")) {
    const bcrypt = require("bcryptjs");
    const cpuCols = db.prepare("PRAGMA table_info(company_personnel_users)").all();
    const cpuNames = new Set(cpuCols.map((c) => c.name));
    if (!cpuNames.has("username")) {
      db.exec("ALTER TABLE company_personnel_users ADD COLUMN username TEXT NOT NULL DEFAULT ''");
    }
    const asgCols = db.prepare("PRAGMA table_info(intake_project_assignments)").all();
    const asgNames = new Set(asgCols.map((c) => c.name));
    if (!asgNames.has("responded_at")) {
      db.exec("ALTER TABLE intake_project_assignments ADD COLUMN responded_at TEXT");
    }
    if (!asgNames.has("response_note")) {
      db.exec("ALTER TABLE intake_project_assignments ADD COLUMN response_note TEXT NOT NULL DEFAULT ''");
    }
    if (!asgNames.has("updated_by_company_user_id")) {
      db.exec(
        "ALTER TABLE intake_project_assignments ADD COLUMN updated_by_company_user_id INTEGER REFERENCES company_personnel_users(id)"
      );
    }
    db.exec("DROP INDEX IF EXISTS idx_company_personnel_tenant_phone");
    db.exec(
      `CREATE UNIQUE INDEX IF NOT EXISTS idx_company_personnel_tenant_phone_nonempty
       ON company_personnel_users(tenant_id, phone_normalized) WHERE length(trim(phone_normalized)) > 0`
    );
    db.exec(
      `CREATE UNIQUE INDEX IF NOT EXISTS idx_company_personnel_tenant_username_nonempty
       ON company_personnel_users(tenant_id, username) WHERE length(trim(username)) > 0`
    );

    db.prepare("INSERT INTO _getpro_migrations (id) VALUES (?)").run("company_portal_v2");
    // eslint-disable-next-line no-console
    console.log("[getpro] Migration: company_portal_v2 (assignment workflow, username login).");
  }
} catch (e) {
  // eslint-disable-next-line no-console
  console.error("[getpro] company_portal_v2 migration:", e.message);
}

/**
 * Demo portal login `demo_client` / weak password: deterministic company + production gate + repair.
 * - Company: subdomain `demo-lusaka-spark` on the `demo` tenant (same row as demo_seed_sample_companies_v1).
 * - Seed only when NODE_ENV !== 'production' OR GETPRO_SEED_DEMO_PORTAL_LOGIN=1.
 * - Re-links existing demo_client to that company if the row exists but company_id mismatches.
 * - Full INTERNAL demo portal credential inventory: see comment block on migration company_portal_v4_demo_test_electricals.
 */
try {
  if (!db.prepare("SELECT 1 FROM _getpro_migrations WHERE id = ?").get("company_portal_v3_demo_portal_polish")) {
    const bcrypt = require("bcryptjs");
    const DEMO_PORTAL_SUBDOMAIN = "demo-lusaka-spark";
    const allowWeakDemoPortalLogin =
      process.env.NODE_ENV !== "production" || String(process.env.GETPRO_SEED_DEMO_PORTAL_LOGIN || "").trim() === "1";

    const demoTenant = db.prepare("SELECT id FROM tenants WHERE lower(trim(slug)) = 'demo'").get();
    if (demoTenant && demoTenant.id) {
      const sparkCo = db
        .prepare(
          `SELECT id FROM companies WHERE tenant_id = ? AND lower(trim(subdomain)) = ? LIMIT 1`
        )
        .get(demoTenant.id, DEMO_PORTAL_SUBDOMAIN);

      const demoUser = db
        .prepare(
          `SELECT id, company_id FROM company_personnel_users
           WHERE tenant_id = ? AND lower(trim(username)) = 'demo_client' AND length(trim(username)) > 0
           LIMIT 1`
        )
        .get(demoTenant.id);

      if (demoUser && sparkCo && Number(demoUser.company_id) !== Number(sparkCo.id)) {
        db.prepare(
          `UPDATE company_personnel_users SET company_id = ?, updated_at = datetime('now')
           WHERE id = ? AND tenant_id = ?`
        ).run(sparkCo.id, demoUser.id, demoTenant.id);
        // eslint-disable-next-line no-console
        console.log(
          "[getpro] Re-linked demo_client to company @" +
            DEMO_PORTAL_SUBDOMAIN +
            " (id " +
            sparkCo.id +
            ") on demo tenant."
        );
      }

      const stillMissing = !db
        .prepare(
          `SELECT 1 FROM company_personnel_users
           WHERE tenant_id = ? AND lower(trim(username)) = 'demo_client' AND length(trim(username)) > 0
           LIMIT 1`
        )
        .get(demoTenant.id);

      if (stillMissing) {
        if (!sparkCo) {
          // eslint-disable-next-line no-console
          console.warn(
            "[getpro] Skipped demo_client seed: no company with subdomain '" +
              DEMO_PORTAL_SUBDOMAIN +
              "' in demo tenant (demo sample companies migration may not have run)."
          );
        } else if (!allowWeakDemoPortalLogin) {
          // eslint-disable-next-line no-console
          console.warn(
            "[getpro] Skipped demo_client seed: production without GETPRO_SEED_DEMO_PORTAL_LOGIN=1 (weak demo password)."
          );
        } else {
          const hash = bcrypt.hashSync("1234", 11);
          try {
            db.prepare(
              `INSERT INTO company_personnel_users (
                tenant_id, company_id, full_name, username, phone_normalized, password_hash, is_active, updated_at
              ) VALUES (?, ?, ?, ?, '', ?, 1, datetime('now'))`
            ).run(demoTenant.id, sparkCo.id, "Demo company portal", "demo_client", hash);
            // eslint-disable-next-line no-console
            console.log(
              "[getpro] Seeded demo company personnel: username demo_client → company @" +
                DEMO_PORTAL_SUBDOMAIN +
                " (tenant demo). Non-production or GETPRO_SEED_DEMO_PORTAL_LOGIN=1."
            );
          } catch (insErr) {
            if (String(insErr.message || "").includes("UNIQUE")) {
              // eslint-disable-next-line no-console
              console.warn("[getpro] demo_client seed skipped: username already present (race or duplicate).");
            } else {
              throw insErr;
            }
          }
        }
      }
    }

    db.prepare("INSERT INTO _getpro_migrations (id) VALUES (?)").run("company_portal_v3_demo_portal_polish");
    // eslint-disable-next-line no-console
    console.log("[getpro] Migration: company_portal_v3_demo_portal_polish (demo portal login safety).");
  }
} catch (e) {
  // eslint-disable-next-line no-console
  console.error("[getpro] company_portal_v3_demo_portal_polish migration:", e.message);
}

/**
 * Demo tenant: TestElectricals company + optional weak portal user `test` / 1234 (same env gate as demo_client).
 *
 * INTERNAL — demo portal seeds (never show passwords in UI):
 * - demo_client → company @demo-lusaka-spark (migration company_portal_v3). Purpose: smoke-test portal on sample listing.
 * - username test / TestElectricals → company @testelectricals (this migration). Purpose: explicit TestElectricals QA user.
 * Weak passwords are bcrypt-hashed; inserts use GETPRO_SEED_DEMO_PORTAL_LOGIN or non-production (see .env.example).
 *
 * - Company row TestElectricals: intentionally NOT gated by NODE_ENV (directory fixture only; no credentials in companies table).
 * - Personnel rows: gated like v3.
 * - Login: company portal accepts username or phone (existing auth); NRZ is stored on personnel only (informational).
 *
 * All demo portal seed logic stays in src/db/migrations; do not duplicate elsewhere.
 */
try {
  if (!db.prepare("SELECT 1 FROM _getpro_migrations WHERE id = ?").get("company_portal_v4_demo_test_electricals")) {
    const bcrypt = require("bcryptjs");
    const clientIntake = require("../../intake/clientProjectIntake");

    const cpuColsV4 = db.prepare("PRAGMA table_info(company_personnel_users)").all();
    if (!cpuColsV4.some((c) => c.name === "nrz_number")) {
      db.exec("ALTER TABLE company_personnel_users ADD COLUMN nrz_number TEXT NOT NULL DEFAULT ''");
    }

    const DEMO_TEST_SUB = "testelectricals";
    const allowWeakDemoPortalLogin =
      process.env.NODE_ENV !== "production" || String(process.env.GETPRO_SEED_DEMO_PORTAL_LOGIN || "").trim() === "1";

    const demoTenant = db.prepare("SELECT id FROM tenants WHERE lower(trim(slug)) = 'demo'").get();
    if (demoTenant && demoTenant.id) {
      const tid = demoTenant.id;

      const subRow = db.prepare("SELECT id, tenant_id FROM companies WHERE lower(trim(subdomain)) = ? LIMIT 1").get(
        DEMO_TEST_SUB
      );
      if (subRow && Number(subRow.tenant_id) !== Number(tid)) {
        // eslint-disable-next-line no-console
        console.warn(
          "[getpro] Skipped TestElectricals seed: subdomain '" + DEMO_TEST_SUB + "' already exists on another tenant."
        );
      } else if (!subRow) {
        // eslint-disable-next-line no-console
        console.log(
          "[getpro] Demo tenant: inserting TestElectricals (@testelectricals) — directory listing only; weak portal user seed is gated separately (GETPRO_SEED_DEMO_PORTAL_LOGIN / NODE_ENV)."
        );
        const elCat = db.prepare("SELECT id FROM categories WHERE tenant_id = ? AND slug = 'electricians'").get(tid);
        const insCo = db.prepare(`
          INSERT INTO companies
            (subdomain, name, category_id, headline, about, services, phone, email, location, featured_cta_label, featured_cta_phone, tenant_id, updated_at)
          VALUES
            (?, ?, ?, ?, ?, ?, ?, ?, ?, 'Call us', ?, ?, datetime('now'))
        `);
        insCo.run(
          DEMO_TEST_SUB,
          "TestElectricals",
          elCat ? elCat.id : null,
          "Demo electrical contractor (TestElectricals)",
          "Default demo tenant listing for company portal testing.",
          "Installations\nRepairs",
          "+260211000199",
          "info@getproapp.org",
          "Lusaka, Zambia",
          "+260211000199",
          tid
        );
        // eslint-disable-next-line no-console
        console.log("[getpro] Seeded demo company TestElectricals (@" + DEMO_TEST_SUB + ", tenant_id=" + tid + ").");
      }

      const testCo = db
        .prepare(`SELECT id FROM companies WHERE tenant_id = ? AND lower(trim(subdomain)) = ? LIMIT 1`)
        .get(tid, DEMO_TEST_SUB);

      if (testCo && testCo.id && allowWeakDemoPortalLogin) {
        const nrzStored = clientIntake.normalizeNrz("5678");
        const byUser = db
          .prepare(
            `SELECT id, company_id FROM company_personnel_users
             WHERE tenant_id = ? AND lower(trim(username)) = 'test' AND length(trim(username)) > 0
             LIMIT 1`
          )
          .get(tid);

        if (byUser) {
          if (Number(byUser.company_id) !== Number(testCo.id)) {
            // eslint-disable-next-line no-console
            console.warn(
              "[getpro] Skipped demo portal user 'test': username already used on demo tenant for a different company."
            );
          }
        } else {
          const phoneConflict = db
            .prepare(
              `SELECT id FROM company_personnel_users
               WHERE tenant_id = ? AND phone_normalized = ? AND length(trim(phone_normalized)) > 0
               LIMIT 1`
            )
            .get(tid, "1234");
          if (phoneConflict) {
            // eslint-disable-next-line no-console
            console.warn("[getpro] Skipped demo portal user 'test': phone 1234 already registered on demo tenant.");
          } else {
            const hash = bcrypt.hashSync("1234", 11);
            try {
              db.prepare(
                `INSERT INTO company_personnel_users (
                  tenant_id, company_id, full_name, username, phone_normalized, nrz_number, password_hash, is_active, updated_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, 1, datetime('now'))`
              ).run(tid, testCo.id, "TestElectricals portal", "test", "1234", nrzStored, hash);
              // eslint-disable-next-line no-console
              console.log(
                "[getpro] Seeded demo portal user: username test (or login Test), phone 1234, NRZ " +
                  nrzStored +
                  " → TestElectricals. Gated: non-production or GETPRO_SEED_DEMO_PORTAL_LOGIN=1."
              );
            } catch (insErr) {
              if (String(insErr.message || "").includes("UNIQUE")) {
                // eslint-disable-next-line no-console
                console.warn("[getpro] Demo portal user 'test' seed skipped: uniqueness conflict.");
              } else {
                throw insErr;
              }
            }
          }
        }
      }
    }

    db.prepare("INSERT INTO _getpro_migrations (id) VALUES (?)").run("company_portal_v4_demo_test_electricals");
    // eslint-disable-next-line no-console
    console.log("[getpro] Migration: company_portal_v4_demo_test_electricals (TestElectricals + optional test user).");
  }
} catch (e) {
  // eslint-disable-next-line no-console
  console.error("[getpro] company_portal_v4_demo_test_electricals migration:", e.message);
}
};
