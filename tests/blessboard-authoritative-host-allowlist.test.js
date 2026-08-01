"use strict";

/**
 * Authoritative pilot host allow-list unit + HTTP tests.
 */

const { describe, it, before, after, beforeEach } = require("node:test");
const assert = require("node:assert/strict");
const request = require("supertest");

const {
  parseAuthoritativeHostAllowlist,
  decideAuthoritativeHostAllowlist,
  resetAuthoritativeAllowlistWarningsForTests,
  ALLOWLIST_MODE,
  ALLOWLIST_DECISION,
  ENV_KEY,
} = require("../src/blessboard/config/authoritativeHostAllowlist");
const { evaluateTenantRoute, OUTCOME } = require("../src/blessboard/http/evaluateTenantRoute");
const {
  resetFoundationDatabase,
  createFoundationPool,
} = require("./helpers/foundationDb");
const { migrate } = require("../db/scripts/lib/migrator");
const { ensureDatabaseIdentity } = require("../db/scripts/lib/databaseIdentity");
const { provisionPlatformTenant } = require("../src/platform/services/provisionPlatformTenant");
const { provisionBlessBoardChurch } = require("../src/blessboard/services/provisionBlessBoardChurch");
const { createV5FoundationApp } = require("../src/platform/http/v5FoundationServer");
const { DEFAULT_V5_COOKIE } = require("../src/platform/session/v5SessionCookie");

const IDENTITY_KEY = "blessboard-platform-v5";
const PILOT_HOST = "pilot-demo.blessboard.org";
const OTHER_HOST = "other-tenant.blessboard.org";
const CUSTOM_HOST = "pilot.custom-domain.test";
const CHURCH_NAME = "Pilot Allowlist Church";

describe("authoritative host allow-list parser", () => {
  beforeEach(() => {
    resetAuthoritativeAllowlistWarningsForTests();
  });

  it("empty / unset is fail-closed empty mode", () => {
    assert.equal(parseAuthoritativeHostAllowlist({}).mode, ALLOWLIST_MODE.EMPTY);
    assert.equal(
      parseAuthoritativeHostAllowlist({ [ENV_KEY]: "  " }).mode,
      ALLOWLIST_MODE.EMPTY
    );
  });

  it("parses exact hosts with uppercase and trailing-dot normalization", () => {
    const parsed = parseAuthoritativeHostAllowlist({
      [ENV_KEY]: "Pilot-Demo.BlessBoard.ORG., other-tenant.blessboard.org",
    });
    assert.equal(parsed.mode, ALLOWLIST_MODE.HOSTS);
    assert.deepEqual(parsed.hosts.sort(), [OTHER_HOST, PILOT_HOST].sort());
    assert.equal(decideAuthoritativeHostAllowlist(parsed, "PILOT-DEMO.BLESSBOARD.ORG"), ALLOWLIST_DECISION.ALLOW);
    assert.equal(decideAuthoritativeHostAllowlist(parsed, `${PILOT_HOST}.`), ALLOWLIST_DECISION.ALLOW);
    assert.equal(decideAuthoritativeHostAllowlist(parsed, OTHER_HOST), ALLOWLIST_DECISION.ALLOW);
    assert.equal(decideAuthoritativeHostAllowlist(parsed, "missing.blessboard.org"), ALLOWLIST_DECISION.DENY);
  });

  it("malformed entries are dropped safely (no wildcard suffixes)", () => {
    const parsed = parseAuthoritativeHostAllowlist({
      [ENV_KEY]: "ok.blessboard.org, http://evil.example, *.blessboard.org, not a host, :bad",
    });
    assert.equal(parsed.mode, ALLOWLIST_MODE.HOSTS);
    assert.deepEqual(parsed.hosts, ["ok.blessboard.org"]);
    assert.ok(parsed.invalidEntryCount >= 3);
    assert.equal(decideAuthoritativeHostAllowlist(parsed, "evil.example"), ALLOWLIST_DECISION.DENY);
  });

  it("all-malformed config becomes empty fail-closed", () => {
    const parsed = parseAuthoritativeHostAllowlist({
      [ENV_KEY]: "http://x, *.y.com, :port",
    });
    assert.equal(parsed.mode, ALLOWLIST_MODE.EMPTY);
    assert.equal(decideAuthoritativeHostAllowlist(parsed, PILOT_HOST), ALLOWLIST_DECISION.DENY_EMPTY);
  });

  it("explicit * is estate allow-all (design-approved token only)", () => {
    const parsed = parseAuthoritativeHostAllowlist({ [ENV_KEY]: "*" });
    assert.equal(parsed.mode, ALLOWLIST_MODE.ALL);
    assert.equal(decideAuthoritativeHostAllowlist(parsed, "anything.blessboard.org"), ALLOWLIST_DECISION.ALLOW);
  });
});

describe("authoritative host allow-list http", () => {
  let pool;
  let skipSuite = false;
  let skipReason = "";
  let churchId;
  let productBlessboardId;

  before(async () => {
    try {
      const databaseUrl = await resetFoundationDatabase();
      pool = createFoundationPool(databaseUrl);
      await migrate({ connectionString: databaseUrl });
      await ensureDatabaseIdentity(pool, {
        connectionString: databaseUrl,
        identityKey: IDENTITY_KEY,
        environmentCode: "testing",
      });

      const pilot = await provisionPlatformTenant(pool, {
        organizationKey: "pilot-org",
        displayName: "Pilot Org",
        legalName: null,
        dataEnvironment: "testing",
        productKey: "blessboard",
        productTenantKey: "pilot-org",
        hostname: PILOT_HOST,
        domainType: "canonical",
        deploymentCode: "blessboard-org-staging",
        isPrimary: true,
      });
      assert.equal(pilot.ok, true, pilot.message);

      const church = await provisionBlessBoardChurch(pool, {
        organizationKey: "pilot-org",
        churchKey: "pilot-org",
        displayName: CHURCH_NAME,
        legalName: null,
        dataEnvironment: "testing",
        hqBranchKey: "hq",
        hqBranchDisplayName: "Pilot HQ",
      });
      assert.equal(church.ok, true, church.message);
      churchId = church.records.church.id;

      const other = await provisionPlatformTenant(pool, {
        organizationKey: "other-org",
        displayName: "Other Org",
        legalName: null,
        dataEnvironment: "testing",
        productKey: "blessboard",
        productTenantKey: "other-org",
        hostname: OTHER_HOST,
        domainType: "canonical",
        deploymentCode: "blessboard-org-staging",
        isPrimary: true,
      });
      assert.equal(other.ok, true, other.message);
      await provisionBlessBoardChurch(pool, {
        organizationKey: "other-org",
        churchKey: "other-org",
        displayName: "Other Church",
        legalName: null,
        dataEnvironment: "testing",
        hqBranchKey: "hq",
        hqBranchDisplayName: "Other HQ",
      });

      const products = await pool.query(
        `SELECT id FROM platform.products WHERE product_key = 'blessboard' LIMIT 1`
      );
      productBlessboardId = products.rows[0].id;
      const org = await pool.query(
        `SELECT id FROM platform.organizations WHERE organization_key = 'pilot-org'`
      );
      await pool.query(
        `INSERT INTO platform.domains
           (organization_id, product_id, deployment_id, hostname, domain_type, status, is_primary)
         VALUES ($1, $2, 'blessboard-org-staging', $3, 'custom', 'active', false)`,
        [org.rows[0].id, productBlessboardId, CUSTOM_HOST]
      );
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

  function makeApp(allowlist, logLines) {
    const logs = logLines || [];
    return createV5FoundationApp({
      getPool: () => pool,
      env: {
        NODE_ENV: "test",
        PLATFORM_DEPLOYMENT_CODE: "blessboard-org-staging",
        SESSION_SECRET: "test-session-secret-at-least-32-chars!!",
        SESSION_COOKIE_NAME: DEFAULT_V5_COOKIE,
        BLESSBOARD_TENANT_ROUTING_MODE: "authoritative",
        BLESSBOARD_AUTHORITATIVE_HOST_ALLOWLIST: allowlist,
      },
      log: (line) => logs.push(String(line)),
    });
  }

  it("approved demo host renders tenant", async () => {
    requireDb();
    const logs = [];
    const app = makeApp(PILOT_HOST, logs);
    const res = await request(app).get("/").set("Host", PILOT_HOST);
    assert.equal(res.status, 200);
    assert.match(res.text, new RegExp(CHURCH_NAME));
    assert.match(res.text, /data-bb-shell="tenant-public"/);
    const authLog = logs.find((l) => l.includes("blessboard_tenant_route") && !l.includes("shadow"));
    assert.ok(authLog);
    assert.match(authLog, /"allowlistDecision":"allow"/);
    assert.match(authLog, new RegExp(PILOT_HOST.replace(/\./g, "\\.")));
  });

  it("unapproved tenant host stays foundation with shadow diagnostics", async () => {
    requireDb();
    const logs = [];
    const app = makeApp(PILOT_HOST, logs);
    const res = await request(app).get("/").set("Host", OTHER_HOST);
    assert.equal(res.status, 200);
    assert.match(res.text, /data-bb-shell="apex"/);
    assert.doesNotMatch(res.text, /Other Church/);
    const shadow = logs.find((l) => l.includes("blessboard_tenant_route_shadow"));
    assert.ok(shadow);
    assert.match(shadow, /authoritative_host_not_allowlisted/);
    assert.match(shadow, /"allowlistDecision":"deny"/);
  });

  it("unknown host retains safe not-found under authoritative", async () => {
    requireDb();
    const app = makeApp(PILOT_HOST);
    const res = await request(app).get("/").set("Host", "unknown-pilot.blessboard.org");
    assert.equal(res.status, 404);
    assert.doesNotMatch(res.text, new RegExp(CHURCH_NAME));
  });

  it("uppercase / trailing-dot Host still matches allow-list", async () => {
    requireDb();
    const app = makeApp(PILOT_HOST);
    for (const host of [PILOT_HOST.toUpperCase(), `${PILOT_HOST}.`, `${PILOT_HOST}:443`]) {
      const res = await request(app).get("/").set("Host", host);
      assert.equal(res.status, 200, `host=${host}`);
      assert.match(res.text, new RegExp(CHURCH_NAME));
    }
  });

  it("wrong deployment does not render even when host is allow-listed", async () => {
    requireDb();
    await pool.query(
      `INSERT INTO platform.deployments (
         deployment_code, application_code, release_version, canonical_domain,
         environment_code, status, jobs_enabled, database_access_mode, session_cookie_name
       ) VALUES (
         'pilot-other-deploy', 'blessboard', '0.0.0', 'other.example.test',
         'testing', 'active', false, 'read_write', 'pilot_other_sid'
       )
       ON CONFLICT (deployment_code) DO NOTHING`
    );
    await pool.query(
      `UPDATE platform.domains SET deployment_id = 'pilot-other-deploy' WHERE hostname = $1`,
      [PILOT_HOST]
    );
    try {
      const app = makeApp(PILOT_HOST);
      const res = await request(app).get("/").set("Host", PILOT_HOST);
      assert.equal(res.status, 404);
      assert.doesNotMatch(res.text, new RegExp(CHURCH_NAME));
    } finally {
      await pool.query(
        `UPDATE platform.domains SET deployment_id = 'blessboard-org-staging' WHERE hostname = $1`,
        [PILOT_HOST]
      );
    }
  });

  it("inactive domain does not render", async () => {
    requireDb();
    await pool.query(`UPDATE platform.domains SET status = 'inactive' WHERE hostname = $1`, [PILOT_HOST]);
    try {
      const app = makeApp(PILOT_HOST);
      const res = await request(app).get("/").set("Host", PILOT_HOST);
      assert.equal(res.status, 404);
    } finally {
      await pool.query(`UPDATE platform.domains SET status = 'active' WHERE hostname = $1`, [PILOT_HOST]);
    }
  });

  it("suspended church does not render", async () => {
    requireDb();
    await pool.query(`UPDATE blessboard.churches SET status = 'suspended' WHERE id = $1`, [churchId]);
    try {
      const app = makeApp(PILOT_HOST);
      const res = await request(app).get("/").set("Host", PILOT_HOST);
      assert.equal(res.status, 503);
      assert.doesNotMatch(res.text, new RegExp(CHURCH_NAME));
    } finally {
      await pool.query(`UPDATE blessboard.churches SET status = 'active' WHERE id = $1`, [churchId]);
    }
  });

  it("empty allow-list fails closed to foundation", async () => {
    requireDb();
    const logs = [];
    const app = makeApp("", logs);
    const res = await request(app).get("/").set("Host", PILOT_HOST);
    assert.equal(res.status, 200);
    assert.match(res.text, /data-bb-shell="apex"/);
    assert.doesNotMatch(res.text, new RegExp(CHURCH_NAME));
    const shadow = logs.find((l) => l.includes("blessboard_tenant_route_shadow"));
    assert.ok(shadow);
    assert.match(shadow, /authoritative_allowlist_empty/);
  });

  it("malformed allow-list alone fails closed", async () => {
    requireDb();
    const app = makeApp("http://bad, *.blessboard.org");
    const res = await request(app).get("/").set("Host", PILOT_HOST);
    assert.equal(res.status, 200);
    assert.match(res.text, /data-bb-shell="apex"/);
  });

  it("custom domain renders only when explicitly allow-listed", async () => {
    requireDb();
    const denied = await request(makeApp(PILOT_HOST)).get("/").set("Host", CUSTOM_HOST);
    assert.equal(denied.status, 200);
    assert.match(denied.text, /data-bb-shell="apex"/);
    assert.doesNotMatch(denied.text, new RegExp(CHURCH_NAME));

    const allowed = await request(makeApp(`${PILOT_HOST},${CUSTOM_HOST}`))
      .get("/")
      .set("Host", CUSTOM_HOST);
    assert.equal(allowed.status, 200);
    assert.match(allowed.text, new RegExp(CHURCH_NAME));
  });

  it("default mode remains non-authoritative without env flip", () => {
    const d = evaluateTenantRoute({
      routingMode: "off",
      isApex: false,
      path: "/",
      platformHostContext: {
        enabled: true,
        hostname: PILOT_HOST,
        resultType: "resolved_tenant",
        resolution: {
          product: { key: "blessboard", status: "active" },
          organization: { id: "1", key: "pilot-org", status: "active" },
          organizationProduct: { status: "active" },
        },
      },
      blessBoardCatalogueContext: {
        enabled: true,
        applicable: true,
        resultType: "resolved",
        church: { id: "c", churchKey: "pilot-org", displayName: CHURCH_NAME },
        hqBranch: { id: "h", branchKey: "hq", displayName: "HQ" },
        primaryBranch: { id: "p", branchKey: "hq", displayName: "HQ" },
      },
      authoritativeHostAllowlist: parseAuthoritativeHostAllowlist({ [ENV_KEY]: PILOT_HOST }),
    });
    assert.equal(d.outcome, OUTCOME.FOUNDATION);
    assert.equal(d.reason, "routing_off");
    assert.equal(d.authoritative, false);
  });
});
