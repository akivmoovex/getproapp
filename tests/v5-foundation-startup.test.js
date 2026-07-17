"use strict";

/**
 * V5 foundation startup mode: Express boots against platform DB without public.tenants / session.
 */

const { describe, it, before, after, beforeEach, afterEach } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const request = require("supertest");

const {
  resetFoundationDatabase,
  createFoundationPool,
} = require("./helpers/foundationDb");
const { migrate } = require("../db/scripts/lib/migrator");
const {
  isV5FoundationMode,
  V5_FOUNDATION_DEPLOYMENT_CODE,
  SKIPPED_LEGACY_MODULES,
} = require("../src/platform/config/v5FoundationMode");
const {
  createV5FoundationApp,
  UNAVAILABLE_STATUS,
} = require("../src/platform/http/v5FoundationServer");

const ROOT = path.resolve(__dirname, "..");

describe("v5 foundation mode detection", () => {
  const keys = ["PLATFORM_DEPLOYMENT_CODE", "DEPLOYMENT_ENV"];
  const saved = {};

  beforeEach(() => {
    for (const k of keys) saved[k] = process.env[k];
  });

  afterEach(() => {
    for (const k of keys) {
      if (saved[k] === undefined) delete process.env[k];
      else process.env[k] = saved[k];
    }
  });

  it("requires blessboard-org-v5 and DEPLOYMENT_ENV=testing", () => {
    assert.equal(isV5FoundationMode({}), false);
    assert.equal(
      isV5FoundationMode({
        PLATFORM_DEPLOYMENT_CODE: V5_FOUNDATION_DEPLOYMENT_CODE,
        DEPLOYMENT_ENV: "production",
      }),
      false
    );
    assert.equal(
      isV5FoundationMode({
        PLATFORM_DEPLOYMENT_CODE: "blessboard-com-v4",
        DEPLOYMENT_ENV: "testing",
      }),
      false
    );
    assert.equal(
      isV5FoundationMode({
        PLATFORM_DEPLOYMENT_CODE: V5_FOUNDATION_DEPLOYMENT_CODE,
        DEPLOYMENT_ENV: "testing",
      }),
      true
    );
  });

  it("documents skipped legacy modules", () => {
    assert.ok(SKIPPED_LEGACY_MODULES.length >= 5);
    assert.ok(SKIPPED_LEGACY_MODULES.some((m) => /public\.tenants/i.test(m)));
    assert.ok(SKIPPED_LEGACY_MODULES.some((m) => /session/i.test(m)));
    assert.ok(SKIPPED_LEGACY_MODULES.some((m) => /ensure\*Schema/i.test(m)));
  });
});

describe("v5 foundation HTTP (ephemeral platform DB)", () => {
  let databaseUrl;
  let pool;
  let skipSuite = false;
  let skipReason = "";
  let app;

  before(async () => {
    try {
      databaseUrl = await resetFoundationDatabase();
      pool = createFoundationPool(databaseUrl);
      await migrate({ connectionString: databaseUrl });
      app = createV5FoundationApp({
        getPool: () => pool,
        enableDiagnosticHostContext: false,
      });
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

  async function assertNoPublicLegacyTables() {
    const r = await pool.query(
      `SELECT table_name
         FROM information_schema.tables
        WHERE table_schema = 'public'
          AND table_name = ANY($1::text[])
        ORDER BY table_name`,
      [["tenants", "session"]]
    );
    assert.deepEqual(r.rows, []);
  }

  it("starts against foundation DB with no public.tenants or public.session", async () => {
    requireDb();
    await assertNoPublicLegacyTables();
    const health = await request(app).get("/healthz");
    assert.equal(health.status, 200);
    assert.equal(health.body.ok, true);
    assert.equal(health.body.mode, "v5-foundation");
    await assertNoPublicLegacyTables();
  });

  it("apex homepage returns controlled 200", async () => {
    requireDb();
    const res = await request(app).get("/").set("Host", "blessboard.org");
    assert.equal(res.status, 200);
    assert.match(res.text, /BlessBoard/);
    assert.match(res.text, /foundation mode/i);
    await assertNoPublicLegacyTables();
  });

  it("missing public.session does not crash request path", async () => {
    requireDb();
    const res = await request(app).get("/healthz");
    assert.equal(res.status, 200);
    const sess = await pool.query(
      `SELECT 1 FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name = 'session'`
    );
    assert.equal(sess.rows.length, 0);
  });

  it("missing public.tenants does not crash request path", async () => {
    requireDb();
    const res = await request(app).get("/");
    assert.equal(res.status, 200);
    const tenants = await pool.query(
      `SELECT 1 FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name = 'tenants'`
    );
    assert.equal(tenants.rows.length, 0);
  });

  it("legacy tenant and portal routes return controlled unavailable", async () => {
    requireDb();
    const paths = [
      "/login",
      "/admin",
      "/admin/login",
      "/member",
      "/branch-admin",
      "/hq-admin",
      "/getpro-admin",
      "/client",
      "/company",
      "/provider",
      "/zm/anything",
      "/church/foo",
      "/api/debug/host",
    ];
    for (const p of paths) {
      const res = await request(app).get(p).set("Accept", "text/plain");
      assert.equal(res.status, UNAVAILABLE_STATUS, `expected 503 for ${p}`);
      assert.match(res.text, /foundation mode/i);
    }
  });

  it("does not create public legacy tables after traffic", async () => {
    requireDb();
    await request(app).get("/");
    await request(app).get("/login");
    await request(app).get("/admin");
    await assertNoPublicLegacyTables();
  });
});

describe("v5 foundation vs V4 wiring (source)", () => {
  it("server.js branches to V5 foundation or server.legacy", () => {
    const dispatcher = fs.readFileSync(path.join(ROOT, "server.js"), "utf8");
    assert.match(dispatcher, /isV5FoundationMode/);
    assert.match(dispatcher, /v5FoundationServer/);
    assert.match(dispatcher, /server\.legacy/);
    assert.equal(dispatcher.includes("ensureChurchSchema"), false);
    assert.equal(dispatcher.includes("createTableIfMissing"), false);
  });

  it("V4 legacy path still has ensureChurchSchema, session store, and tenant attach", () => {
    const legacy = fs.readFileSync(path.join(ROOT, "server.legacy.js"), "utf8");
    assert.match(legacy, /ensureChurchSchema/);
    assert.match(legacy, /createTableIfMissing:\s*true/);
    assert.match(legacy, /createAttachTenantByHost/);
    assert.match(legacy, /bootstrapAfterListen/);
    assert.match(legacy, /seedBuiltinUsers/);
  });

  it("V5 foundation server does not register session or ensure*Schema", () => {
    const src = fs.readFileSync(
      path.join(ROOT, "src/platform/http/v5FoundationServer.js"),
      "utf8"
    );
    assert.equal(src.includes("connect-pg-simple"), false);
    assert.equal(src.includes("ensureChurchSchema"), false);
    assert.equal(src.includes("createAttachTenantByHost"), false);
    assert.equal(src.includes("createTableIfMissing"), false);
  });
});
