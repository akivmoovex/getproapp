"use strict";

/**
 * Hosted/local foundation bootstrap + verify tests (ephemeral Postgres only).
 */

const { describe, it, before, after } = require("node:test");
const assert = require("node:assert/strict");
const { spawnSync } = require("child_process");
const path = require("path");

const {
  resetFoundationDatabase,
  createFoundationPool,
} = require("./helpers/foundationDb");
const { bootstrapFoundation, resolveBootstrapInputs } = require("../db/scripts/lib/foundationBootstrap");
const { verifyFoundation } = require("../db/scripts/lib/foundationVerify");
const { sha256Hex, MIGRATIONS_ROOT } = require("../db/scripts/lib/migrator");
const fs = require("fs");

const ROOT = path.resolve(__dirname, "..");
const IDENTITY_KEY = "blessboard-platform-v5";

function runNpmScript(script, envExtra) {
  return spawnSync("npm", ["run", script], {
    cwd: ROOT,
    env: { ...process.env, ...envExtra },
    encoding: "utf8",
  });
}

describe("db bootstrap foundation", () => {
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
    if (skipSuite) assert.fail(`Local PostgreSQL unavailable: ${skipReason}`);
  }

  it("rejects missing DATABASE_URL and DATABASE_IDENTITY_EXPECTED", () => {
    const noUrl = resolveBootstrapInputs({
      DATABASE_IDENTITY_EXPECTED: IDENTITY_KEY,
      FOUNDATION_ALLOW_LOCALHOST: "1",
    });
    assert.equal(noUrl.ok, false);
    assert.ok(noUrl.errors.some((e) => /DATABASE_URL/i.test(e)));

    const noIdentity = resolveBootstrapInputs({
      DATABASE_URL: "postgresql://localhost:5432/blessboard_foundation_test",
      FOUNDATION_ALLOW_LOCALHOST: "1",
    });
    assert.equal(noIdentity.ok, false);
    assert.ok(noIdentity.errors.some((e) => /DATABASE_IDENTITY_EXPECTED/i.test(e)));
  });

  it("rejects placeholder database hostnames", () => {
    for (const host of ["base", "example.com", "www.example.com"]) {
      const r = resolveBootstrapInputs({
        DATABASE_URL: `postgresql://user:pass@${host}:5432/postgres`,
        DATABASE_IDENTITY_EXPECTED: IDENTITY_KEY,
      });
      assert.equal(r.ok, false, host);
      assert.ok(r.errors.some((e) => /Refusing DATABASE_URL host/i.test(e)), host);
    }

    const localhostBlocked = resolveBootstrapInputs({
      DATABASE_URL: "postgresql://localhost:5432/postgres",
      DATABASE_IDENTITY_EXPECTED: IDENTITY_KEY,
      NODE_ENV: "production",
      FOUNDATION_ALLOW_LOCALHOST: "0",
      GETPRO_TEST_DB: "0",
    });
    assert.equal(localhostBlocked.ok, false);
  });

  it("empty database bootstrap succeeds and creates schemas/tables/seeds", async () => {
    requireDb();
    const logs = [];
    const result = await bootstrapFoundation({
      connectionString: databaseUrl,
      identityKey: IDENTITY_KEY,
      environmentCode: "testing",
      env: {
        ...process.env,
        FOUNDATION_ALLOW_LOCALHOST: "1",
        NODE_ENV: "test",
      },
      log: (line) => logs.push(line),
    });
    assert.equal(result.ok, true, JSON.stringify(result.errors || result));
    assert.equal(result.identity_key, IDENTITY_KEY);
    assert.ok(logs.every((l) => !/postgres(ql)?:\/\//i.test(l)));
    assert.ok(logs.every((l) => !/password=/i.test(l)));
    assert.ok(logs.some((l) => /host_fingerprint=/.test(l)));

    const schemas = await pool.query(
      `SELECT schema_name FROM information_schema.schemata
        WHERE schema_name = ANY($1::text[]) ORDER BY schema_name`,
      [["blessboard", "getpro", "ngo", "platform"]]
    );
    assert.deepEqual(
      schemas.rows.map((r) => r.schema_name),
      ["blessboard", "getpro", "ngo", "platform"]
    );

    const tables = await pool.query(
      `SELECT table_name FROM information_schema.tables
        WHERE table_schema = 'platform' AND table_type = 'BASE TABLE'
        ORDER BY table_name`
    );
    for (const name of [
      "database_identity",
      "deployments",
      "domains",
      "organization_products",
      "organizations",
      "products",
      "schema_migrations",
    ]) {
      assert.ok(tables.rows.some((r) => r.table_name === name), name);
    }

    const deployments = await pool.query(
      `SELECT deployment_code FROM platform.deployments ORDER BY deployment_code`
    );
    assert.deepEqual(
      deployments.rows.map((r) => r.deployment_code),
      ["blessboard-com-v4", "blessboard-org-v5"]
    );

    const products = await pool.query(
      `SELECT product_key FROM platform.products ORDER BY product_key`
    );
    assert.deepEqual(
      products.rows.map((r) => r.product_key),
      ["blessboard", "getpro", "ngo"]
    );
  });

  it("identical bootstrap rerun is idempotent", async () => {
    requireDb();
    const second = await bootstrapFoundation({
      connectionString: databaseUrl,
      identityKey: IDENTITY_KEY,
      environmentCode: "testing",
      env: { ...process.env, FOUNDATION_ALLOW_LOCALHOST: "1", NODE_ENV: "test" },
      log: () => {},
    });
    assert.equal(second.ok, true, JSON.stringify(second.errors || second));
    assert.equal(second.identity.result, "already_initialized");
    assert.equal(second.migrate.applied.length, 0);
    assert.equal(second.migrate.seedsApplied.length, 0);

    const deployments = await pool.query(`SELECT COUNT(*)::int AS n FROM platform.deployments`);
    assert.equal(deployments.rows[0].n, 2);
    const products = await pool.query(`SELECT COUNT(*)::int AS n FROM platform.products`);
    assert.equal(products.rows[0].n, 3);
  });

  it("different expected database identity is rejected", async () => {
    requireDb();
    const bad = await bootstrapFoundation({
      connectionString: databaseUrl,
      identityKey: "other-platform-purpose",
      environmentCode: "testing",
      env: { ...process.env, FOUNDATION_ALLOW_LOCALHOST: "1", NODE_ENV: "test" },
      log: () => {},
    });
    assert.equal(bad.ok, false);
    assert.equal(bad.code, "identity_key_mismatch");
  });

  it("verify foundation passes and forbids public tenants/session", async () => {
    requireDb();
    const report = await verifyFoundation(pool, { identityKey: IDENTITY_KEY });
    assert.equal(report.ok, true, JSON.stringify(report.failures));

    const forbidden = await pool.query(
      `SELECT to_regclass('public.tenants') AS tenants, to_regclass('public.session') AS session`
    );
    assert.equal(forbidden.rows[0].tenants, null);
    assert.equal(forbidden.rows[0].session, null);

    for (const schema of ["getpro", "ngo"]) {
      const t = await pool.query(
        `SELECT COUNT(*)::int AS n FROM information_schema.tables
          WHERE table_schema = $1 AND table_type = 'BASE TABLE'`,
        [schema]
      );
      assert.equal(t.rows[0].n, 0, schema);
    }

    const blessboard = await pool.query(
      `SELECT table_name FROM information_schema.tables
        WHERE table_schema = 'blessboard' AND table_type = 'BASE TABLE'
        ORDER BY table_name`
    );
    assert.deepEqual(
      blessboard.rows.map((r) => r.table_name),
      ["announcement_attachments", "announcement_audiences", "announcement_reads", "announcements", "attendance_entries", "attendance_events", "branch_settings", "branches", "church_settings", "churches", "contact_channels", "event_registrations", "events", "form_submissions", "forms", "giving_categories", "giving_entries", "giving_methods", "leaders", "media_assets", "member_branch_memberships", "member_registrations", "member_request_status_history", "member_requests", "members", "ministries", "ministry_memberships", "page_sections", "public_pages", "resources", "sermons", "user_roles", "users"]
    );
  });

  it("checksum drift is detected by verify", async () => {
    requireDb();
    await pool.query(
      `UPDATE platform.schema_migrations
          SET checksum = $1
        WHERE module = 'platform' AND version = '004'`,
      ["0".repeat(64)]
    );
    const report = await verifyFoundation(pool, { identityKey: IDENTITY_KEY });
    assert.equal(report.ok, false);
    assert.ok(report.failures.includes("checksum_drift"));

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

  it("CLI bootstrap and verify scripts succeed on ephemeral DB", async () => {
    requireDb();
    // Reset drift fix already applied; ensure verify CLI works
    const verify = runNpmScript("db:verify:foundation", {
      DATABASE_URL: databaseUrl,
      DATABASE_IDENTITY_EXPECTED: IDENTITY_KEY,
      FOUNDATION_ALLOW_LOCALHOST: "1",
      NODE_ENV: "test",
    });
    assert.equal(verify.status, 0, verify.stderr || verify.stdout);
    assert.ok(!/postgres(ql)?:\/\/[^"'\s]+/i.test(verify.stdout + verify.stderr));

    const bootstrap = runNpmScript("db:bootstrap:foundation", {
      DATABASE_URL: databaseUrl,
      DATABASE_IDENTITY_EXPECTED: IDENTITY_KEY,
      DATABASE_IDENTITY_ENV: "testing",
      FOUNDATION_ALLOW_LOCALHOST: "1",
      NODE_ENV: "test",
    });
    assert.equal(bootstrap.status, 0, bootstrap.stderr || bootstrap.stdout);
    assert.match(bootstrap.stdout, /"ok": true/);
    assert.ok(!/postgres(ql)?:\/\/[^"'\s]+@/i.test(bootstrap.stdout + bootstrap.stderr));
  });

  it("CLI rejects missing required env", () => {
    const missingUrl = runNpmScript("db:bootstrap:foundation", {
      DATABASE_IDENTITY_EXPECTED: IDENTITY_KEY,
      FOUNDATION_ALLOW_LOCALHOST: "1",
      DATABASE_URL: "",
    });
    assert.notEqual(missingUrl.status, 0);

    const missingIdentity = runNpmScript("db:verify:foundation", {
      DATABASE_URL: "postgresql://localhost:5432/postgres",
      FOUNDATION_ALLOW_LOCALHOST: "1",
      DATABASE_IDENTITY_EXPECTED: "",
    });
    assert.notEqual(missingIdentity.status, 0);
  });
});
