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
const { provisionPlatformTenant } = require("../src/platform/services/provisionPlatformTenant");
const { provisionBlessBoardChurch } = require("../src/blessboard/services/provisionBlessBoardChurch");
const {
  isV5FoundationMode,
  V5_FOUNDATION_DEPLOYMENT_CODE,
  SKIPPED_LEGACY_MODULES,
} = require("../src/platform/config/v5FoundationMode");
const {
  createV5FoundationApp,
  UNAVAILABLE_STATUS,
} = require("../src/platform/http/v5FoundationServer");
const { RESULT_TYPES: PLATFORM_RESULT_TYPES } = require("../src/platform/services/resolveHostname");
const {
  createLoadPlatformHostContext,
} = require("../src/platform/http/loadPlatformHostContext");
const {
  createLoadBlessBoardCatalogueContext,
  RESULT_TYPES: CATALOGUE_RESULT_TYPES,
} = require("../src/blessboard/http/loadBlessBoardCatalogueContext");

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
    assert.match(res.text, /data-bb-shell="apex"/);
    assert.match(res.text, /One digital home for[\s\S]*your church/);
    await assertNoPublicLegacyTables();
  });

  it("GET /login returns 200 on apex", async () => {
    requireDb();
    const loginApp = createV5FoundationApp({
      getPool: () => pool,
      enableDiagnosticHostContext: false,
      env: {
        NODE_ENV: "test",
        PLATFORM_DEPLOYMENT_CODE: "blessboard-org-v5",
        SESSION_SECRET: "test-session-secret-at-least-32-chars!!",
      },
    });
    const res = await request(loginApp).get("/login").set("Host", "blessboard.org");
    assert.equal(res.status, 200);
    assert.match(res.text, /Sign in/i);
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
    // Apex platform-admin requires sign-in (redirect to /login, not foundation 503).
    const adminUnauth = await request(app)
      .get("/admin")
      .set("Host", "blessboard.org")
      .set("Accept", "text/plain")
      .redirects(0);
    assert.equal(adminUnauth.status, 303);
    assert.match(String(adminUnauth.headers.location || ""), /^\/login(\?|$)/);

    // Legacy /admin/login bookmark → V5 apex sign-in.
    const adminLogin = await request(app)
      .get("/admin/login")
      .set("Host", "blessboard.org")
      .set("Accept", "text/plain")
      .redirects(0);
    assert.equal(adminLogin.status, 303);
    assert.equal(adminLogin.headers.location, "/login?next=%2Fadmin");

    // Branch-admin is tenant-only; on apex it remains controlled unavailable.
    const branchOnApex = await request(app)
      .get("/branch-admin")
      .set("Host", "blessboard.org")
      .set("Accept", "text/plain");
    assert.equal(branchOnApex.status, UNAVAILABLE_STATUS);

    const paths = [
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
      assert.match(res.text, /not yet available in BlessBoard V5/i);
    }

    // Member portal is mounted on tenant hosts; on apex it stays controlled unavailable.
    const memberOnApex = await request(app)
      .get("/member")
      .set("Host", "blessboard.org")
      .set("Accept", "text/plain");
    assert.equal(memberOnApex.status, UNAVAILABLE_STATUS);
  });

  it("does not create public legacy tables after traffic", async () => {
    requireDb();
    await request(app).get("/");
    await request(app).get("/admin");
    await assertNoPublicLegacyTables();
  });

  it("tenant hostname diagnostics do not make routing authoritative", async () => {
    requireDb();
    await provisionPlatformTenant(pool, {
      organizationKey: "foundation-tenant",
      displayName: "Foundation Tenant",
      legalName: null,
      dataEnvironment: "testing",
      productKey: "blessboard",
      productTenantKey: "foundation-tenant",
      hostname: "foundation-tenant.blessboard.org",
      domainType: "canonical",
      deploymentCode: "blessboard-org-v5",
      isPrimary: true,
    });
    await provisionBlessBoardChurch(pool, {
      organizationKey: "foundation-tenant",
      churchKey: "foundation-tenant",
      displayName: "Foundation Tenant",
      legalName: null,
      dataEnvironment: "testing",
      hqBranchKey: "hq",
      hqBranchDisplayName: "Headquarters",
    });

    const diagApp = createV5FoundationApp({
      getPool: () => pool,
      enableDiagnosticHostContext: true,
    });

    const health = await request(diagApp).get("/healthz");
    assert.equal(health.status, 200);

    const apex = await request(diagApp).get("/").set("Host", "blessboard.org");
    assert.equal(apex.status, 200);
    assert.match(apex.text, /data-bb-shell="apex"/);
    assert.match(apex.text, /One digital home for[\s\S]*your church/);

    const tenant = await request(diagApp)
      .get("/")
      .set("Host", "foundation-tenant.blessboard.org");
    assert.equal(tenant.status, 200);
    assert.match(tenant.text, /data-bb-shell="apex"/);
    assert.match(tenant.text, /One digital home for[\s\S]*your church/);
    assert.doesNotMatch(tenant.text, /foundation-tenant|Headquarters/i);

    assert.equal(
      (await request(diagApp).get("/login").set("Host", "foundation-tenant.blessboard.org").set("Accept", "text/plain"))
        .status,
      400
    );

    // Member portal is no longer a blanket 503; unauthenticated tenants redirect to login.
    const memberPortal = await request(diagApp)
      .get("/member")
      .set("Host", "foundation-tenant.blessboard.org")
      .set("Accept", "text/html");
    assert.equal(memberPortal.status, 303);
    assert.match(String(memberPortal.headers.location || ""), /\/login/);

    // Catalogue lookup errors must not kill the process or change status.
    const boomApp = createV5FoundationApp({
      getPool: () => pool,
      enableDiagnosticHostContext: true,
    });
    // Exercise middleware chain with a throwing catalogue via direct middleware call.
    const loadPlatform = createLoadPlatformHostContext({
      getPool: () => pool,
      getMode: () => "diagnostic",
      resolveHostname: async () => ({
        type: PLATFORM_RESULT_TYPES.RESOLVED_TENANT,
        hostname: "foundation-tenant.blessboard.org",
        product: { key: "blessboard" },
        organization: {
          id: "11111111-1111-4111-8111-111111111111",
          key: "foundation-tenant",
          dataEnvironment: "testing",
        },
        domain: null,
        deployment: { code: "blessboard-org-v5" },
        organizationProduct: null,
      }),
    });
    const loadCatalogue = createLoadBlessBoardCatalogueContext({
      getPool: () => pool,
      getCatalogueContext: async () => {
        throw new Error("forced catalogue failure");
      },
    });
    const req = {
      path: "/",
      url: "/",
      headers: { host: "foundation-tenant.blessboard.org" },
      get: () => "foundation-tenant.blessboard.org",
    };
    const res = { statusCode: 200 };
    await new Promise((resolve, reject) => {
      loadPlatform(req, res, (err) => (err ? reject(err) : resolve()));
    });
    await new Promise((resolve, reject) => {
      loadCatalogue(req, res, (err) => (err ? reject(err) : resolve()));
    });
    assert.equal(
      req.blessBoardCatalogueContext.resultType,
      CATALOGUE_RESULT_TYPES.CATALOGUE_LOOKUP_ERROR
    );
    assert.equal(res.statusCode, 200);

    await assertNoPublicLegacyTables();
    void boomApp;
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

  it("V5 foundation server does not register connect-pg-simple or ensure*Schema", () => {
    const src = fs.readFileSync(
      path.join(ROOT, "src/platform/http/v5FoundationServer.js"),
      "utf8"
    );
    assert.doesNotMatch(src, /require\(["']connect-pg-simple["']\)/);
    assert.equal(src.includes("ensureChurchSchema"), false);
    assert.equal(src.includes("createAttachTenantByHost"), false);
    assert.equal(src.includes("createTableIfMissing"), false);
    assert.match(src, /deployment_sessions|createV5Session|loadV5Session|authenticateBlessBoardUser/);
  });
});
