"use strict";

/**
 * Phase 1 Foundation schema/status migration tests (local ephemeral PostgreSQL).
 */

const { describe, it, before, after } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");

const {
  resetFoundationDatabase,
  createFoundationPool,
} = require("./helpers/foundationDb");
const {
  migrate,
  discoverMigrations,
  discoverSeeds,
  ensureMigrationLedger,
  sha256Hex,
} = require("../db/scripts/lib/migrator");

const ROOT = path.resolve(__dirname, "..");
const MIGRATION_REL =
  "db/migrations/blessboard/027_foundation_schema_and_status.sql";
const MIGRATION_ABS = path.join(ROOT, MIGRATION_REL);

describe("blessboard foundation schema status (027)", () => {
  let databaseUrl;
  let pool;
  let skipSuite = false;
  let skipReason = "";

  before(async () => {
    try {
      databaseUrl = await resetFoundationDatabase();
      pool = createFoundationPool(databaseUrl);
      await pool.query("SELECT 1");
    } catch (err) {
      skipSuite = true;
      skipReason = err && err.message ? err.message : String(err);
    }
  });

  after(async () => {
    if (pool) await pool.end();
  });

  function requireDb() {
    if (skipSuite) {
      assert.fail(`Local PostgreSQL unavailable for foundation tests: ${skipReason}`);
    }
  }

  it("migration 027 is registered in the ordered blessboard catalogue", () => {
    assert.equal(fs.existsSync(MIGRATION_ABS), true);
    const discovered = discoverMigrations().filter((f) => f.module === "blessboard");
    const versions = discovered.map((f) => f.version);
    assert.ok(versions.includes("027"), "027 must be discoverable");
    const idx026 = discovered.findIndex((f) => f.version === "026");
    const idx027 = discovered.findIndex((f) => f.version === "027");
    assert.ok(idx026 >= 0 && idx027 === idx026 + 1, "027 must follow 026");
    assert.equal(
      discovered[idx027].filename,
      "027_foundation_schema_and_status.sql"
    );
    const sql = fs.readFileSync(MIGRATION_ABS, "utf8");
    assert.match(sql, /organization_onboarding/);
    assert.match(sql, /organization_support_contacts/);
    assert.doesNotMatch(sql, /public\.church_|CREATE TABLE IF NOT EXISTS public\./i);
    assert.doesNotMatch(sql, /GETPRO_DATABASE_URL|runtime.?ddl/i);
  });

  it("clean migrate creates extended applications + onboarding + support tables", async () => {
    requireDb();
    const summary = await migrate({ connectionString: databaseUrl });
    assert.ok(
      summary.applied.some((x) => x.includes("027_foundation_schema_and_status.sql")),
      "027 should apply on empty DB"
    );

    const ledger = await pool.query(
      `SELECT module, version, filename, checksum
         FROM platform.schema_migrations
        WHERE module = 'blessboard' AND version = '027'`
    );
    assert.equal(ledger.rowCount, 1);
    assert.equal(ledger.rows[0].filename, "027_foundation_schema_and_status.sql");
    assert.equal(ledger.rows[0].checksum, sha256Hex(fs.readFileSync(MIGRATION_ABS, "utf8")));

    const cols = await pool.query(
      `SELECT column_name
         FROM information_schema.columns
        WHERE table_schema = 'blessboard'
          AND table_name = 'platform_church_registration_applications'
          AND column_name = ANY($1::text[])
        ORDER BY column_name`,
      [
        [
          "organization_id",
          "application_status",
          "provisioning_status",
          "provisioning_started_at",
          "provisioned_at",
          "provisioning_failed_at",
          "provisioning_error_code",
          "provisioning_error_detail",
          "status",
          "updated_at",
        ],
      ]
    );
    assert.deepEqual(
      cols.rows.map((r) => r.column_name),
      [
        "application_status",
        "organization_id",
        "provisioned_at",
        "provisioning_error_code",
        "provisioning_error_detail",
        "provisioning_failed_at",
        "provisioning_started_at",
        "provisioning_status",
        "status",
        "updated_at",
      ]
    );

    const fk = await pool.query(
      `SELECT c.confrelid::regclass::text AS refs
         FROM pg_constraint c
        WHERE c.conname = 'platform_church_reg_apps_organization_id_fkey'`
    );
    assert.equal(fk.rows[0].refs, "platform.organizations");

    const tables = await pool.query(
      `SELECT to_regclass('blessboard.organization_onboarding') AS onboarding,
              to_regclass('blessboard.organization_support_contacts') AS contacts`
    );
    assert.ok(tables.rows[0].onboarding);
    assert.ok(tables.rows[0].contacts);
  });

  it("legacy pending insert remains valid; new status defaults apply", async () => {
    requireDb();
    const inserted = await pool.query(
      `INSERT INTO blessboard.platform_church_registration_applications (
         status, church_name, country, city, contact_name, contact_email, contact_phone,
         consent_terms, selected_plan
       ) VALUES (
         'pending', 'Schema Test Church', 'Kenya', 'Nairobi', 'Ada Admin',
         'schema-test-' || gen_random_uuid()::text || '@example.org', '+254700000001',
         true, 'foundation'
       )
       RETURNING id, status, application_status, provisioning_status, organization_id`
    );
    const row = inserted.rows[0];
    assert.equal(row.status, "pending");
    assert.equal(row.application_status, "submitted");
    assert.equal(row.provisioning_status, "not_started");
    assert.equal(row.organization_id, null);
  });

  it("backfills existing pending rows safely on upgrade path", async () => {
    requireDb();
    // Simulate pre-027 row shape by inserting with defaults (already migrated DB).
    // Upgrade-path coverage: count + status mapping invariants for pending→submitted.
    const before = await pool.query(
      `SELECT COUNT(*)::int AS n
         FROM blessboard.platform_church_registration_applications
        WHERE status = 'pending'`
    );
    assert.ok(before.rows[0].n >= 1);
    const mapped = await pool.query(
      `SELECT COUNT(*)::int AS n
         FROM blessboard.platform_church_registration_applications
        WHERE status = 'pending'
          AND application_status = 'submitted'
          AND provisioning_status = 'not_started'
          AND organization_id IS NULL`
    );
    assert.equal(mapped.rows[0].n, before.rows[0].n);
  });

  it("rejects invalid application and provisioning statuses", async () => {
    requireDb();
    await assert.rejects(
      () =>
        pool.query(
          `UPDATE blessboard.platform_church_registration_applications
              SET application_status = 'pending'
            WHERE id = (
              SELECT id FROM blessboard.platform_church_registration_applications LIMIT 1
            )`
        ),
      /application_status|check/i
    );
    await assert.rejects(
      () =>
        pool.query(
          `UPDATE blessboard.platform_church_registration_applications
              SET provisioning_status = 'done'
            WHERE id = (
              SELECT id FROM blessboard.platform_church_registration_applications LIMIT 1
            )`
        ),
      /provisioning_status|check/i
    );
  });

  it("provisioned status requires organization_id and provisioned_at", async () => {
    requireDb();
    await assert.rejects(
      () =>
        pool.query(
          `UPDATE blessboard.platform_church_registration_applications
              SET provisioning_status = 'provisioned',
                  provisioned_at = now()
            WHERE id = (
              SELECT id FROM blessboard.platform_church_registration_applications
               WHERE organization_id IS NULL LIMIT 1
            )`
        ),
      /provisioned_consistency|check/i
    );
  });

  it("onboarding is one row per organization; invalid follow-up rejected", async () => {
    requireDb();
    const org = await pool.query(
      `INSERT INTO platform.organizations (
         organization_key, display_name, status, data_environment
       ) VALUES (
         'ft-onb-' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 12),
         'Onboarding Org', 'active', 'testing'
       )
       RETURNING id`
    );
    const organizationId = org.rows[0].id;

    await pool.query(
      `INSERT INTO blessboard.organization_onboarding (organization_id, follow_up_status)
       VALUES ($1, 'new')`,
      [organizationId]
    );

    await assert.rejects(
      () =>
        pool.query(
          `INSERT INTO blessboard.organization_onboarding (organization_id)
           VALUES ($1)`,
          [organizationId]
        ),
      /duplicate key|unique|organization_onboarding/i
    );

    await assert.rejects(
      () =>
        pool.query(
          `UPDATE blessboard.organization_onboarding
              SET follow_up_status = 'waiting'
            WHERE organization_id = $1`,
          [organizationId]
        ),
      /follow_up_status|check/i
    );
  });

  it("support contacts enforce org FK, method/outcome allowlists, and note length", async () => {
    requireDb();
    const org = await pool.query(
      `INSERT INTO platform.organizations (
         organization_key, display_name, status, data_environment
       ) VALUES (
         'ft-sup-' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 12),
         'Support Org', 'active', 'testing'
       )
       RETURNING id`
    );
    const organizationId = org.rows[0].id;
    const hash = "$2b$10$" + "a".repeat(53);
    const user = await pool.query(
      `INSERT INTO blessboard.users (
         email_normalized, email_display, password_hash, display_name, status
       ) VALUES (
         'support-' || replace(gen_random_uuid()::text, '-', '') || '@example.org',
         'support@example.org',
         $1,
         'Support Agent',
         'active'
       )
       RETURNING id`,
      [hash]
    );
    const createdBy = user.rows[0].id;

    const ok = await pool.query(
      `INSERT INTO blessboard.organization_support_contacts (
         organization_id, created_by_user_id, contact_method, outcome, note
       ) VALUES ($1, $2, 'phone', 'reached', 'Intro call completed.')
       RETURNING id, organization_id`,
      [organizationId, createdBy]
    );
    assert.equal(ok.rows[0].organization_id, organizationId);

    await assert.rejects(
      () =>
        pool.query(
          `INSERT INTO blessboard.organization_support_contacts (
             organization_id, created_by_user_id, contact_method, outcome, note
           ) VALUES ($1, $2, 'carrier_pigeon', 'reached', 'nope')`,
          [organizationId, createdBy]
        ),
      /contact_method|check/i
    );

    await assert.rejects(
      () =>
        pool.query(
          `INSERT INTO blessboard.organization_support_contacts (
             organization_id, created_by_user_id, contact_method, outcome, note
           ) VALUES ($1, $2, 'email', 'reached', $3)`,
          [organizationId, createdBy, "x".repeat(2001)]
        ),
      /note_len|check/i
    );
  });

  it("Free max_branches is 1; paid plans and custom_domain unchanged", async () => {
    requireDb();
    const free = await pool.query(
      `SELECT pf.limit_value
         FROM platform.plans p
         JOIN platform.plan_features pf ON pf.plan_id = p.id
        WHERE p.product_key = 'blessboard'
          AND p.plan_key = 'free'
          AND pf.feature_key = 'max_branches'`
    );
    assert.equal(free.rows[0].limit_value, 1);

    const customDomain = await pool.query(
      `SELECT pf.boolean_value
         FROM platform.plans p
         JOIN platform.plan_features pf ON pf.plan_id = p.id
        WHERE p.product_key = 'blessboard'
          AND p.plan_key = 'free'
          AND pf.feature_key = 'custom_domain'`
    );
    assert.equal(customDomain.rows[0].boolean_value, false);

    const growth = await pool.query(
      `SELECT pf.limit_value
         FROM platform.plans p
         JOIN platform.plan_features pf ON pf.plan_id = p.id
        WHERE p.product_key = 'blessboard'
          AND p.plan_key = 'growth'
          AND pf.feature_key = 'max_branches'`
    );
    assert.equal(growth.rows[0].limit_value, null);

    const professional = await pool.query(
      `SELECT pf.limit_value
         FROM platform.plans p
         JOIN platform.plan_features pf ON pf.plan_id = p.id
        WHERE p.product_key = 'blessboard'
          AND p.plan_key = 'professional'
          AND pf.feature_key = 'max_branches'`
    );
    assert.equal(professional.rows[0].limit_value, null);
  });

  it("re-running migrate skips 027 safely (no checksum drift)", async () => {
    requireDb();
    const again = await migrate({ connectionString: databaseUrl });
    assert.ok(
      again.skipped.some((x) => x.includes("027_foundation_schema_and_status.sql"))
    );
    assert.ok(
      !again.applied.some((x) => x.includes("027_foundation_schema_and_status.sql"))
    );
  });

  it("upgrade from prior schema backfills pending apps and fixes max_branches", async () => {
    requireDb();
    const upgradeUrl = await resetFoundationDatabase();
    const upgradePool = createFoundationPool(upgradeUrl);
    try {
      await ensureMigrationLedger(upgradePool);
      const client = await upgradePool.connect();
      try {
        const prior = discoverMigrations().filter(
          (f) => !(f.module === "blessboard" && f.version === "027")
        );
        for (const file of prior) {
          await client.query("BEGIN");
          await client.query(file.sql);
          await client.query(
            `INSERT INTO platform.schema_migrations
               (module, version, filename, checksum, applied_at, execution_ms)
             VALUES ($1, $2, $3, $4, now(), 0)`,
            [file.module, file.version, file.filename, file.checksum]
          );
          await client.query("COMMIT");
        }
        for (const file of discoverSeeds()) {
          await client.query("BEGIN");
          await client.query(file.sql);
          await client.query(
            `INSERT INTO platform.schema_migrations
               (module, version, filename, checksum, applied_at, execution_ms)
             VALUES ($1, $2, $3, $4, now(), 0)`,
            [file.module, file.version, file.filename, file.checksum]
          );
          await client.query("COMMIT");
        }
      } finally {
        client.release();
      }

      await upgradePool.query(
        `UPDATE platform.plan_features pf
            SET limit_value = 2
           FROM platform.plans p
          WHERE pf.plan_id = p.id
            AND p.plan_key = 'free'
            AND pf.feature_key = 'max_branches'`
      );

      const inserted = await upgradePool.query(
        `INSERT INTO blessboard.platform_church_registration_applications (
           status, church_name, country, city, contact_name, contact_email, contact_phone,
           consent_terms, selected_plan
         ) VALUES (
           'pending', 'Upgrade Church', 'Kenya', 'Nairobi', 'Up Admin',
           'upgrade-' || gen_random_uuid()::text || '@example.org', '+254700000099',
           true, 'foundation'
         )
         RETURNING id`
      );
      const closed = await upgradePool.query(
        `INSERT INTO blessboard.platform_church_registration_applications (
           status, church_name, country, city, contact_name, contact_email, contact_phone,
           consent_terms, selected_plan
         ) VALUES (
           'closed', 'Closed Church', 'Kenya', 'Mombasa', 'Cl Admin',
           'closed-' || gen_random_uuid()::text || '@example.org', '+254700000098',
           true, 'foundation'
         )
         RETURNING id`
      );

      const summary = await migrate({ connectionString: upgradeUrl });
      assert.ok(
        summary.applied.some((x) => x.includes("027_foundation_schema_and_status.sql"))
      );

      const pendingRow = await upgradePool.query(
        `SELECT status, application_status, provisioning_status, organization_id
           FROM blessboard.platform_church_registration_applications
          WHERE id = $1`,
        [inserted.rows[0].id]
      );
      assert.equal(pendingRow.rows[0].status, "pending");
      assert.equal(pendingRow.rows[0].application_status, "submitted");
      assert.equal(pendingRow.rows[0].provisioning_status, "not_started");
      assert.equal(pendingRow.rows[0].organization_id, null);

      const closedRow = await upgradePool.query(
        `SELECT status, application_status, provisioning_status, organization_id
           FROM blessboard.platform_church_registration_applications
          WHERE id = $1`,
        [closed.rows[0].id]
      );
      assert.equal(closedRow.rows[0].status, "closed");
      assert.equal(closedRow.rows[0].application_status, "closed");
      assert.equal(closedRow.rows[0].provisioning_status, "not_started");
      assert.equal(closedRow.rows[0].organization_id, null);

      const free = await upgradePool.query(
        `SELECT pf.limit_value
           FROM platform.plans p
           JOIN platform.plan_features pf ON pf.plan_id = p.id
          WHERE p.plan_key = 'free' AND pf.feature_key = 'max_branches'`
      );
      assert.equal(free.rows[0].limit_value, 1);

      const count = await upgradePool.query(
        `SELECT COUNT(*)::int AS n FROM blessboard.platform_church_registration_applications`
      );
      assert.equal(count.rows[0].n, 2);
    } finally {
      await upgradePool.end();
    }
  });
});
