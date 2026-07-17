"use strict";

/**
 * Empty-database tests for the BlessBoard clean foundation.
 * Uses a local ephemeral PostgreSQL database only (never hosted Supabase).
 */

const { describe, it, before, after } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

const {
  resetFoundationDatabase,
  createFoundationPool,
} = require("./helpers/foundationDb");
const { migrate, status, MIGRATIONS_ROOT, SEEDS_ROOT, sha256Hex } = require("../db/scripts/lib/migrator");

const ROOT = path.resolve(__dirname, "..");

const EXPECTED_PLATFORM_TABLES = [
  "database_identity",
  "deployments",
  "domains",
  "organization_products",
  "organizations",
  "products",
  "schema_migrations",
];

function runCli(scriptRel, args, envExtra) {
  const result = spawnSync(process.execPath, [path.join(ROOT, scriptRel), ...args], {
    env: { ...process.env, ...envExtra },
    encoding: "utf8",
  });
  return result;
}

describe("db foundation (empty PostgreSQL)", () => {
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

  it("clean migration applies schemas, ledger, identity, deployments, tenant catalogue", async () => {
    requireDb();
    const summary = await migrate({ connectionString: databaseUrl });
    assert.ok(summary.applied.length > 0, "expected migrations to apply");
    assert.equal(summary.skipped.length, 0);

    const schemas = await pool.query(
      `SELECT schema_name
         FROM information_schema.schemata
        WHERE schema_name = ANY($1::text[])
        ORDER BY schema_name`,
      [["blessboard", "getpro", "ngo", "platform"]]
    );
    assert.deepEqual(
      schemas.rows.map((r) => r.schema_name),
      ["blessboard", "getpro", "ngo", "platform"]
    );

    const tables = await pool.query(
      `SELECT table_name
         FROM information_schema.tables
        WHERE table_schema = 'platform'
        ORDER BY table_name`
    );
    assert.deepEqual(
      tables.rows.map((r) => r.table_name),
      EXPECTED_PLATFORM_TABLES
    );
  });

  it("migration rerun is idempotent", async () => {
    requireDb();
    const first = await migrate({ connectionString: databaseUrl });
    const second = await migrate({ connectionString: databaseUrl });
    assert.equal(second.applied.length, 0);
    assert.equal(second.seedsApplied.length, 0);
    assert.ok(second.skipped.length + second.seedsSkipped.length > 0);
    assert.ok(first.applied.length + first.skipped.length > 0);
  });

  it("product seeds exist exactly once after repeated migrations", async () => {
    requireDb();
    await migrate({ connectionString: databaseUrl });
    await migrate({ connectionString: databaseUrl });
    const r = await pool.query(
      `SELECT product_key, display_name, status
         FROM platform.products
        ORDER BY product_key`
    );
    assert.equal(r.rowCount, 3);
    assert.deepEqual(
      r.rows.map((row) => [row.product_key, row.display_name, row.status]),
      [
        ["blessboard", "BlessBoard", "active"],
        ["getpro", "GetPro", "active"],
        ["ngo", "NGO", "active"],
      ]
    );
    const orgCount = await pool.query(`SELECT COUNT(*)::int AS n FROM platform.organizations`);
    assert.equal(orgCount.rows[0].n, 0, "must not seed organizations/tenants");
  });

  it("migration records exist with module/version/checksum", async () => {
    requireDb();
    const r = await pool.query(
      `SELECT module, version, filename, checksum, execution_ms
         FROM platform.schema_migrations
        ORDER BY module, version`
    );
    assert.ok(r.rowCount >= 11, `expected migration+seed rows, got ${r.rowCount}`);
    for (const row of r.rows) {
      assert.ok(row.module);
      assert.ok(row.version);
      assert.ok(row.filename);
      assert.match(row.checksum, /^[a-f0-9]{64}$/);
      assert.ok(row.execution_ms >= 0);
    }
    const modules = new Set(r.rows.map((row) => row.module));
    for (const m of ["platform", "blessboard", "getpro", "ngo", "seeds"]) {
      assert.ok(modules.has(m), `missing module ${m}`);
    }
  });

  it("checksum drift rejection fails migrate", async () => {
    requireDb();
    await pool.query(
      `UPDATE platform.schema_migrations
          SET checksum = $1
        WHERE module = 'platform' AND version = '004'`,
      ["0".repeat(64)]
    );

    await assert.rejects(
      () => migrate({ connectionString: databaseUrl }),
      /Checksum drift rejected/
    );

    const sql = fs.readFileSync(
      path.join(MIGRATIONS_ROOT, "platform", "004_deployments.sql"),
      "utf8"
    );
    await pool.query(
      `UPDATE platform.schema_migrations
          SET checksum = $1
        WHERE module = 'platform' AND version = '004'`,
      [sha256Hex(sql)]
    );
  });

  it("identity singleton: explicit init, no silent init, second row rejected", async () => {
    requireDb();
    const before = await pool.query(`SELECT COUNT(*)::int AS n FROM platform.database_identity`);
    assert.equal(before.rows[0].n, 0, "migrate must not create identity rows");

    const refused = runCli("db/scripts/identity-init.js", ["--env", "testing"], {
      DATABASE_URL: databaseUrl,
    });
    assert.notEqual(refused.status, 0);
    assert.match(refused.stderr, /--confirm/);

    const ok = runCli(
      "db/scripts/identity-init.js",
      ["--env", "testing", "--confirm"],
      { DATABASE_URL: databaseUrl }
    );
    assert.equal(ok.status, 0, ok.stderr || ok.stdout);
    const payload = JSON.parse(ok.stdout);
    assert.equal(payload.environment_code, "testing");
    assert.ok(payload.database_instance_id);

    const check = runCli("db/scripts/identity-check.js", [], { DATABASE_URL: databaseUrl });
    assert.equal(check.status, 0, check.stderr || check.stdout);
    const checkPayload = JSON.parse(check.stdout);
    assert.equal(checkPayload.result, "present");

    await assert.rejects(
      () =>
        pool.query(
          `INSERT INTO platform.database_identity
             (id, database_instance_id, environment_code, database_name, host_fingerprint)
           VALUES (2, gen_random_uuid(), 'production', 'other', 'xx***')`
        ),
      /database_identity_singleton|check constraint|duplicate key/i
    );

    const overwrite = runCli(
      "db/scripts/identity-init.js",
      ["--env", "production", "--confirm"],
      { DATABASE_URL: databaseUrl }
    );
    assert.notEqual(overwrite.status, 0);
    assert.match(overwrite.stderr, /already exists/);
  });

  it("deployment seed rows: V4/V5 coexistence and job flags", async () => {
    requireDb();
    const r = await pool.query(
      `SELECT deployment_code, application_code, release_version, canonical_domain,
              environment_code, status, jobs_enabled, database_access_mode, session_cookie_name
         FROM platform.deployments
        ORDER BY deployment_code`
    );
    assert.equal(r.rowCount, 2);

    const v4 = r.rows.find((row) => row.deployment_code === "blessboard-com-v4");
    const v5 = r.rows.find((row) => row.deployment_code === "blessboard-org-v5");
    assert.ok(v4);
    assert.ok(v5);

    assert.equal(v4.application_code, "blessboard");
    assert.equal(v4.release_version, "v4");
    assert.equal(v4.canonical_domain, "blessboard.com");
    assert.equal(v4.environment_code, "production");
    assert.equal(v4.status, "active");
    assert.equal(v4.jobs_enabled, true);
    assert.equal(v4.database_access_mode, "read_write");
    assert.equal(v4.session_cookie_name, "blessboard_com_sid");

    assert.equal(v5.application_code, "blessboard");
    assert.equal(v5.release_version, "v5");
    assert.equal(v5.canonical_domain, "blessboard.org");
    assert.equal(v5.environment_code, "testing");
    assert.equal(v5.status, "active");
    assert.equal(v5.jobs_enabled, false);
    assert.equal(v5.database_access_mode, "read_write");
    assert.equal(v5.session_cookie_name, "blessboard_org_sid");
  });

  it("unique canonical domains and session cookie names", async () => {
    requireDb();
    await assert.rejects(
      () =>
        pool.query(
          `INSERT INTO platform.deployments
             (deployment_code, application_code, release_version, canonical_domain,
              environment_code, status, jobs_enabled, database_access_mode, session_cookie_name)
           VALUES ('dup-domain', 'blessboard', 'v9', 'blessboard.com',
                   'testing', 'active', false, 'read_write', 'other_cookie')`
        ),
      /unique|duplicate/i
    );
    await assert.rejects(
      () =>
        pool.query(
          `INSERT INTO platform.deployments
             (deployment_code, application_code, release_version, canonical_domain,
              environment_code, status, jobs_enabled, database_access_mode, session_cookie_name)
           VALUES ('dup-cookie', 'blessboard', 'v9', 'example.test',
                   'testing', 'active', false, 'read_write', 'blessboard_com_sid')`
        ),
      /unique|duplicate/i
    );
  });

  it("product keys and organization keys are unique", async () => {
    requireDb();
    await assert.rejects(
      () =>
        pool.query(
          `INSERT INTO platform.products (product_key, display_name, status)
           VALUES ('blessboard', 'Dup', 'active')`
        ),
      /unique|duplicate/i
    );

    await pool.query(
      `INSERT INTO platform.organizations
         (organization_key, display_name, status, data_environment)
       VALUES ('acme-church', 'Acme', 'active', 'testing')`
    );
    await assert.rejects(
      () =>
        pool.query(
          `INSERT INTO platform.organizations
             (organization_key, display_name, status, data_environment)
           VALUES ('acme-church', 'Acme 2', 'active', 'testing')`
        ),
      /unique|duplicate/i
    );
  });

  it("organization/product pairs and product_tenant_key uniqueness", async () => {
    requireDb();
    const org = await pool.query(
      `INSERT INTO platform.organizations
         (organization_key, display_name, status, data_environment)
       VALUES ('tenant-alpha', 'Tenant Alpha', 'active', 'testing')
       RETURNING id`
    );
    const orgId = org.rows[0].id;
    const products = await pool.query(
      `SELECT id, product_key FROM platform.products WHERE product_key IN ('blessboard', 'getpro')
       ORDER BY product_key`
    );
    const blessboardId = products.rows.find((r) => r.product_key === "blessboard").id;
    const getproId = products.rows.find((r) => r.product_key === "getpro").id;

    await pool.query(
      `INSERT INTO platform.organization_products
         (organization_id, product_id, status, product_tenant_key, activated_at)
       VALUES ($1, $2, 'active', 'shared-tenant-key', now())`,
      [orgId, blessboardId]
    );

    await assert.rejects(
      () =>
        pool.query(
          `INSERT INTO platform.organization_products
             (organization_id, product_id, status, product_tenant_key)
           VALUES ($1, $2, 'active', 'other-key')`,
          [orgId, blessboardId]
        ),
      /unique|duplicate/i
    );

    await assert.rejects(
      () =>
        pool.query(
          `INSERT INTO platform.organization_products
             (organization_id, product_id, status, product_tenant_key)
           VALUES ($1, $2, 'active', 'shared-tenant-key')`,
          [orgId, blessboardId]
        ),
      /unique|duplicate/i
    );

    // Same product_tenant_key may repeat across different products.
    const org2 = await pool.query(
      `INSERT INTO platform.organizations
         (organization_key, display_name, status, data_environment)
       VALUES ('tenant-beta', 'Tenant Beta', 'active', 'testing')
       RETURNING id`
    );
    await pool.query(
      `INSERT INTO platform.organization_products
         (organization_id, product_id, status, product_tenant_key, activated_at)
       VALUES ($1, $2, 'active', 'shared-tenant-key', now())`,
      [org2.rows[0].id, getproId]
    );

    const cross = await pool.query(
      `SELECT COUNT(*)::int AS n
         FROM platform.organization_products
        WHERE product_tenant_key = 'shared-tenant-key'`
    );
    assert.equal(cross.rows[0].n, 2);
  });

  it("domains normalize trailing dots/case and reject protocol/path/port/whitespace", async () => {
    requireDb();
    const product = await pool.query(
      `SELECT id FROM platform.products WHERE product_key = 'blessboard'`
    );
    const productId = product.rows[0].id;

    const inserted = await pool.query(
      `INSERT INTO platform.domains
         (product_id, hostname, domain_type, status, is_primary, deployment_id)
       VALUES ($1, 'Example.Church.', 'canonical', 'active', true, 'blessboard-com-v4')
       RETURNING hostname`,
      [productId]
    );
    assert.equal(inserted.rows[0].hostname, "example.church");

    await assert.rejects(
      () =>
        pool.query(
          `INSERT INTO platform.domains
             (product_id, hostname, domain_type, status)
           VALUES ($1, 'Example.Church', 'alias', 'active')`,
          [productId]
        ),
      /unique|duplicate/i
    );

    for (const bad of [
      "https://evil.example",
      "evil.example/path",
      "evil.example:443",
      "evil example.com",
      "  spaced.example  ",
    ]) {
      await assert.rejects(
        () =>
          pool.query(
            `INSERT INTO platform.domains
               (product_id, hostname, domain_type, status)
             VALUES ($1, $2, 'custom', 'active')`,
            [productId, bad]
          ),
        /hostname|check|protocol|path|port|whitespace|violates/i,
        `expected rejection for ${bad}`
      );
    }
  });

  it("foreign keys reject invalid references", async () => {
    requireDb();
    const fakeOrg = "00000000-0000-4000-8000-000000000001";
    const fakeProduct = "00000000-0000-4000-8000-000000000002";

    await assert.rejects(
      () =>
        pool.query(
          `INSERT INTO platform.organization_products
             (organization_id, product_id, status, product_tenant_key)
           VALUES ($1, (SELECT id FROM platform.products WHERE product_key = 'ngo'), 'active', 'x')`,
          [fakeOrg]
        ),
      /foreign key|violates/i
    );

    await assert.rejects(
      () =>
        pool.query(
          `INSERT INTO platform.organization_products
             (organization_id, product_id, status, product_tenant_key)
           VALUES (
             (SELECT id FROM platform.organizations WHERE organization_key = 'tenant-alpha'),
             $1, 'active', 'y')`,
          [fakeProduct]
        ),
      /foreign key|violates/i
    );

    await assert.rejects(
      () =>
        pool.query(
          `INSERT INTO platform.domains
             (product_id, organization_id, hostname, domain_type, status)
           VALUES (
             (SELECT id FROM platform.products WHERE product_key = 'blessboard'),
             $1, 'fk-reject.example', 'custom', 'active')`,
          [fakeOrg]
        ),
      /foreign key|violates/i
    );

    await assert.rejects(
      () =>
        pool.query(
          `INSERT INTO platform.domains
             (product_id, deployment_id, hostname, domain_type, status)
           VALUES (
             (SELECT id FROM platform.products WHERE product_key = 'blessboard'),
             'missing-deployment', 'fk-deploy.example', 'apex', 'active')`
        ),
      /foreign key|violates/i
    );
  });

  it("public schema has no new application tables", async () => {
    requireDb();
    const r = await pool.query(
      `SELECT table_schema, table_name
         FROM information_schema.tables
        WHERE table_schema = 'public'
          AND table_type = 'BASE TABLE'
        ORDER BY table_name`
    );
    assert.equal(
      r.rowCount,
      0,
      `public must have no application tables after foundation migrate; found: ${r.rows
        .map((x) => x.table_name)
        .join(", ")}`
    );
  });

  it("no branches table and product schemas remain empty", async () => {
    requireDb();
    const branches = await pool.query(
      `SELECT 1
         FROM information_schema.tables
        WHERE table_schema = 'platform' AND table_name = 'branches'`
    );
    assert.equal(branches.rowCount, 0);

    for (const schema of ["blessboard", "getpro", "ngo"]) {
      const tables = await pool.query(
        `SELECT table_name
           FROM information_schema.tables
          WHERE table_schema = $1 AND table_type = 'BASE TABLE'`,
        [schema]
      );
      assert.equal(tables.rowCount, 0, `${schema} must have no product tables`);
    }
  });

  it("Supabase-managed schemas are not created or modified", async () => {
    requireDb();
    const managed = ["auth", "storage", "realtime", "extensions"];
    const present = await pool.query(
      `SELECT schema_name
         FROM information_schema.schemata
        WHERE schema_name = ANY($1::text[])`,
      [managed]
    );
    assert.equal(
      present.rowCount,
      0,
      `foundation migrate must not create Supabase schemas; found: ${present.rows
        .map((r) => r.schema_name)
        .join(", ")}`
    );

    const sqlFiles = [];
    for (const mod of ["platform", "blessboard", "getpro", "ngo"]) {
      const dir = path.join(MIGRATIONS_ROOT, mod);
      for (const f of fs.readdirSync(dir)) {
        if (f.endsWith(".sql")) sqlFiles.push(path.join(dir, f));
      }
    }
    for (const f of fs.readdirSync(SEEDS_ROOT)) {
      if (f.endsWith(".sql")) sqlFiles.push(path.join(SEEDS_ROOT, f));
    }
    for (const file of sqlFiles) {
      const text = fs.readFileSync(file, "utf8");
      for (const schema of managed) {
        assert.doesNotMatch(
          text,
          new RegExp(`\\b(CREATE|ALTER|DROP|GRANT|REVOKE)\\b[\\s\\S]{0,40}\\b${schema}\\b`, "i"),
          `${path.basename(file)} must not modify ${schema}`
        );
      }
    }
  });

  it("db:status reports applied rows and DATABASE_URL-only policy", async () => {
    requireDb();
    const report = await status({ connectionString: databaseUrl });
    assert.equal(report.pending, 0);
    assert.equal(report.drift, 0);
    assert.ok(report.applied >= 11);

    const noUrl = runCli("db/scripts/migrate.js", [], {
      DATABASE_URL: "",
      GETPRO_DATABASE_URL: databaseUrl,
    });
    assert.notEqual(noUrl.status, 0);
    assert.match(noUrl.stderr, /DATABASE_URL is required|does not fall back/i);
  });
});
