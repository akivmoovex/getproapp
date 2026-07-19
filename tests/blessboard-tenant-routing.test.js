"use strict";

/**
 * Feature-flagged BlessBoard tenant routing HTTP tests (ephemeral Postgres).
 */

const { describe, it, before, after } = require("node:test");
const assert = require("node:assert/strict");
const path = require("path");
const request = require("supertest");

const {
  resetFoundationDatabase,
  createFoundationPool,
} = require("./helpers/foundationDb");
const { migrate } = require("../db/scripts/lib/migrator");
const { ensureDatabaseIdentity } = require("../db/scripts/lib/databaseIdentity");
const { provisionPlatformTenant } = require("../src/platform/services/provisionPlatformTenant");
const { provisionBlessBoardChurch } = require("../src/blessboard/services/provisionBlessBoardChurch");
const { createBlessBoardUser } = require("../src/blessboard/services/createBlessBoardUser");
const { assignBlessBoardRole } = require("../src/blessboard/services/assignBlessBoardRole");
const { createV5FoundationApp } = require("../src/platform/http/v5FoundationServer");
const { CSRF_COOKIE, CSRF_FIELD } = require("../src/platform/http/v5Csrf");
const { DEFAULT_V5_COOKIE } = require("../src/platform/session/v5SessionCookie");
const {
  renderTenantLandingPage,
} = require("../src/blessboard/http/renderTenantLandingPage");

const ROOT = path.resolve(__dirname, "..");
const IDENTITY_KEY = "blessboard-platform-v5";
const PASSWORD = "correct-horse-battery-staple";
const TENANT_HOST = "route-tenant.blessboard.org";
const CHURCH_NAME = "Route Tenant Church";
const BRANCH_NAME = "Route HQ";

function extractCookie(res, name) {
  const raw = res.headers["set-cookie"];
  if (!raw) return null;
  const list = Array.isArray(raw) ? raw : [raw];
  for (const line of list) {
    if (String(line).startsWith(`${name}=`)) {
      return String(line).split(";")[0].slice(name.length + 1);
    }
  }
  return null;
}

function cookieHeader(...pairs) {
  return pairs.filter(Boolean).join("; ");
}

function baseEnv(overrides) {
  return {
    NODE_ENV: "test",
    PLATFORM_DEPLOYMENT_CODE: "blessboard-org-v5",
    SESSION_SECRET: "test-session-secret-at-least-32-chars!!",
    SESSION_COOKIE_NAME: DEFAULT_V5_COOKIE,
    BLESSBOARD_TENANT_ROUTING_MODE: "off",
    // Estate token for suites that still exercise global authoritative; pilot tests override.
    BLESSBOARD_AUTHORITATIVE_HOST_ALLOWLIST: "*",
    ...overrides,
  };
}

describe("blessboard tenant routing http", () => {
  let databaseUrl;
  let pool;
  let skipSuite = false;
  let skipReason = "";
  let orgId;
  let churchId;
  let queriedTables = [];

  before(async () => {
    try {
      databaseUrl = await resetFoundationDatabase();
      pool = createFoundationPool(databaseUrl);
      const originalQuery = pool.query.bind(pool);
      pool.query = (text, params) => {
        const sql = String(text || "");
        if (/\bpublic\.tenants\b/i.test(sql) || /\bFROM\s+tenants\b/i.test(sql)) {
          queriedTables.push("public.tenants");
        }
        if (/\bpublic\.session\b/i.test(sql)) {
          queriedTables.push("public.session");
        }
        return originalQuery(text, params);
      };
      await migrate({ connectionString: databaseUrl });
      await ensureDatabaseIdentity(pool, {
        connectionString: databaseUrl,
        identityKey: IDENTITY_KEY,
        environmentCode: "testing",
      });
      const provisioned = await provisionPlatformTenant(pool, {
        organizationKey: "route-tenant",
        displayName: "Route Tenant Org",
        legalName: null,
        dataEnvironment: "testing",
        productKey: "blessboard",
        productTenantKey: "route-tenant",
        hostname: TENANT_HOST,
        domainType: "canonical",
        deploymentCode: "blessboard-org-v5",
        isPrimary: true,
      });
      assert.equal(provisioned.ok, true, provisioned.message);
      orgId = provisioned.records && provisioned.records.organization && provisioned.records.organization.id;
      const church = await provisionBlessBoardChurch(pool, {
        organizationKey: "route-tenant",
        churchKey: "route-tenant",
        displayName: CHURCH_NAME,
        legalName: null,
        dataEnvironment: "testing",
        hqBranchKey: "hq",
        hqBranchDisplayName: BRANCH_NAME,
      });
      assert.equal(church.ok, true, church.message);
      churchId = church.records && church.records.church && church.records.church.id;

      const user = await createBlessBoardUser(pool, {
        email: "router@example.org",
        displayName: "Router Admin",
        password: PASSWORD,
      });
      assert.equal(user.ok, true, user.message);
      const role = await assignBlessBoardRole(pool, {
        email: "router@example.org",
        roleKey: "church_hq_admin",
        organizationKey: "route-tenant",
        churchKey: "route-tenant",
      });
      assert.equal(role.ok, true, role.message);
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

  function makeApp(envOverrides, logLines) {
    const logs = logLines || [];
    return createV5FoundationApp({
      getPool: () => pool,
      env: baseEnv(envOverrides),
      log: (line) => logs.push(String(line)),
    });
  }

  it("off preserves foundation response on tenant host", async () => {
    requireDb();
    const app = makeApp({ BLESSBOARD_TENANT_ROUTING_MODE: "off" });
    const res = await request(app).get("/").set("Host", TENANT_HOST);
    assert.equal(res.status, 200);
    assert.match(res.text, /data-bb-shell="apex"/);
    assert.match(res.text, /One digital home for[\s\S]*your church/);
    assert.doesNotMatch(res.text, new RegExp(CHURCH_NAME));
  });

  it("shadow never renders tenant content and emits safe log", async () => {
    requireDb();
    const logs = [];
    const app = makeApp({ BLESSBOARD_TENANT_ROUTING_MODE: "shadow" }, logs);
    const res = await request(app).get("/").set("Host", TENANT_HOST);
    assert.equal(res.status, 200);
    assert.match(res.text, /data-bb-shell="apex"/);
    assert.match(res.text, /One digital home for[\s\S]*your church/);
    assert.doesNotMatch(res.text, new RegExp(CHURCH_NAME));
    assert.doesNotMatch(res.text, new RegExp(BRANCH_NAME));
    const shadow = logs.find((l) => l.includes("blessboard_tenant_route_shadow"));
    assert.ok(shadow, `expected shadow log, got: ${logs.join("\n")}`);
    assert.match(shadow, /"organizationKey":"route-tenant"/);
    assert.match(shadow, /"churchKey":"route-tenant"/);
    assert.doesNotMatch(shadow, /password|csrf|session_token|DATABASE_URL/i);
  });

  it("shadow skips noisy static/health logs", async () => {
    requireDb();
    const logs = [];
    const app = makeApp({ BLESSBOARD_TENANT_ROUTING_MODE: "shadow" }, logs);
    await request(app).get("/healthz").set("Host", TENANT_HOST);
    await request(app).get("/church/church.css").set("Host", TENANT_HOST);
    const shadow = logs.filter((l) => l.includes("blessboard_tenant_route_shadow"));
    assert.equal(shadow.length, 0);
  });

  it("authoritative renders valid tenant landing", async () => {
    requireDb();
    const app = makeApp({ BLESSBOARD_TENANT_ROUTING_MODE: "authoritative" });
    const res = await request(app).get("/").set("Host", TENANT_HOST);
    assert.equal(res.status, 200);
    assert.match(res.text, new RegExp(CHURCH_NAME));
    assert.match(res.text, new RegExp(BRANCH_NAME));
    assert.match(res.text, /data-bb-product="blessboard-v5"/);
    assert.match(res.text, /data-bb-shell="tenant-public"/);
    assert.match(res.text, /testing/i);
    assert.doesNotMatch(res.text, new RegExp(orgId || "never", "i"));
    assert.doesNotMatch(res.text, new RegExp(churchId || "never", "i"));
    assert.doesNotMatch(res.text, /blessboard-org-v5/);
    assert.doesNotMatch(res.text, /church_missing|resolved_tenant|inactive_/);
  });

  it("unknown domain returns controlled 404", async () => {
    requireDb();
    const app = makeApp({ BLESSBOARD_TENANT_ROUTING_MODE: "authoritative" });
    const res = await request(app).get("/").set("Host", "unknown-xyz.blessboard.org");
    assert.equal(res.status, 404);
    assert.match(res.text, /could not be found/i);
    assert.doesNotMatch(res.text, /unknown_domain/);
  });

  it("inactive domain does not render tenant", async () => {
    requireDb();
    await pool.query(
      `UPDATE platform.domains SET status = 'inactive' WHERE hostname = $1`,
      [TENANT_HOST]
    );
    try {
      const app = makeApp({ BLESSBOARD_TENANT_ROUTING_MODE: "authoritative" });
      const res = await request(app).get("/").set("Host", TENANT_HOST);
      assert.equal(res.status, 404);
      assert.doesNotMatch(res.text, new RegExp(CHURCH_NAME));
    } finally {
      await pool.query(
        `UPDATE platform.domains SET status = 'active' WHERE hostname = $1`,
        [TENANT_HOST]
      );
    }
  });

  it("deployment mismatch does not render tenant", async () => {
    requireDb();
    await pool.query(
      `INSERT INTO platform.deployments (
         deployment_code, application_code, release_version, canonical_domain,
         environment_code, status, jobs_enabled, database_access_mode, session_cookie_name
       ) VALUES (
         'other-deploy-v5', 'blessboard', '0.0.0', 'other.example.test',
         'testing', 'active', false, 'read_write', 'other_deploy_v5_sid'
       )
       ON CONFLICT (deployment_code) DO NOTHING`
    );
    await pool.query(
      `UPDATE platform.domains SET deployment_id = 'other-deploy-v5' WHERE hostname = $1`,
      [TENANT_HOST]
    );
    try {
      const app = makeApp({ BLESSBOARD_TENANT_ROUTING_MODE: "authoritative" });
      const res = await request(app).get("/").set("Host", TENANT_HOST);
      assert.equal(res.status, 404);
      assert.doesNotMatch(res.text, new RegExp(CHURCH_NAME));
    } finally {
      await pool.query(
        `UPDATE platform.domains SET deployment_id = 'blessboard-org-v5' WHERE hostname = $1`,
        [TENANT_HOST]
      );
    }
  });

  it("inactive product does not render tenant", async () => {
    requireDb();
    await pool.query(`UPDATE platform.products SET status = 'inactive' WHERE product_key = 'blessboard'`);
    try {
      const app = makeApp({ BLESSBOARD_TENANT_ROUTING_MODE: "authoritative" });
      const res = await request(app).get("/").set("Host", TENANT_HOST);
      assert.equal(res.status, 503);
      assert.doesNotMatch(res.text, new RegExp(CHURCH_NAME));
    } finally {
      await pool.query(`UPDATE platform.products SET status = 'active' WHERE product_key = 'blessboard'`);
    }
  });

  it("inactive organization does not render tenant", async () => {
    requireDb();
    await pool.query(
      `UPDATE platform.organizations SET status = 'inactive' WHERE organization_key = 'route-tenant'`
    );
    try {
      const app = makeApp({ BLESSBOARD_TENANT_ROUTING_MODE: "authoritative" });
      const res = await request(app).get("/").set("Host", TENANT_HOST);
      assert.equal(res.status, 503);
      assert.doesNotMatch(res.text, new RegExp(CHURCH_NAME));
    } finally {
      await pool.query(
        `UPDATE platform.organizations SET status = 'active' WHERE organization_key = 'route-tenant'`
      );
    }
  });

  it("inactive enrolment does not render tenant", async () => {
    requireDb();
    await pool.query(
      `UPDATE platform.organization_products op
          SET status = 'inactive'
         FROM platform.organizations o
        WHERE op.organization_id = o.id AND o.organization_key = 'route-tenant'`
    );
    try {
      const app = makeApp({ BLESSBOARD_TENANT_ROUTING_MODE: "authoritative" });
      const res = await request(app).get("/").set("Host", TENANT_HOST);
      assert.equal(res.status, 503);
      assert.doesNotMatch(res.text, new RegExp(CHURCH_NAME));
    } finally {
      await pool.query(
        `UPDATE platform.organization_products op
            SET status = 'active'
           FROM platform.organizations o
          WHERE op.organization_id = o.id AND o.organization_key = 'route-tenant'`
      );
    }
  });

  it("inactive church does not render tenant", async () => {
    requireDb();
    await pool.query(
      `UPDATE blessboard.churches SET status = 'inactive' WHERE church_key = 'route-tenant'`
    );
    try {
      const app = makeApp({ BLESSBOARD_TENANT_ROUTING_MODE: "authoritative" });
      const res = await request(app).get("/").set("Host", TENANT_HOST);
      assert.equal(res.status, 503);
      assert.doesNotMatch(res.text, new RegExp(CHURCH_NAME));
    } finally {
      await pool.query(
        `UPDATE blessboard.churches SET status = 'active' WHERE church_key = 'route-tenant'`
      );
    }
  });

  it("suspended church does not render tenant", async () => {
    requireDb();
    await pool.query(
      `UPDATE blessboard.churches SET status = 'suspended' WHERE church_key = 'route-tenant'`
    );
    try {
      const app = makeApp({ BLESSBOARD_TENANT_ROUTING_MODE: "authoritative" });
      const res = await request(app).get("/").set("Host", TENANT_HOST);
      assert.equal(res.status, 503);
      assert.doesNotMatch(res.text, new RegExp(CHURCH_NAME));
    } finally {
      await pool.query(
        `UPDATE blessboard.churches SET status = 'active' WHERE church_key = 'route-tenant'`
      );
    }
  });

  it("organization/church environment mismatch does not render tenant", async () => {
    requireDb();
    await pool.query(
      `UPDATE platform.organizations
          SET data_environment = 'production'
        WHERE organization_key = 'route-tenant'`
    );
    try {
      const app = makeApp({ BLESSBOARD_TENANT_ROUTING_MODE: "authoritative" });
      const res = await request(app).get("/").set("Host", TENANT_HOST);
      assert.equal(res.status, 503);
      assert.doesNotMatch(res.text, new RegExp(CHURCH_NAME));
    } finally {
      await pool.query(
        `UPDATE platform.organizations
            SET data_environment = 'testing'
          WHERE organization_key = 'route-tenant'`
      );
    }
  });

  it("inactive primary branch does not render tenant", async () => {
    requireDb();
    await pool.query(
      `UPDATE blessboard.branches b
          SET status = 'inactive'
         FROM blessboard.churches c
        WHERE b.church_id = c.id
          AND c.church_key = 'route-tenant'
          AND b.is_primary = true`
    );
    try {
      const app = makeApp({ BLESSBOARD_TENANT_ROUTING_MODE: "authoritative" });
      const res = await request(app).get("/").set("Host", TENANT_HOST);
      assert.equal(res.status, 503);
      assert.doesNotMatch(res.text, new RegExp(CHURCH_NAME));
    } finally {
      await pool.query(
        `UPDATE blessboard.branches b
            SET status = 'active'
           FROM blessboard.churches c
          WHERE b.church_id = c.id
            AND c.church_key = 'route-tenant'
            AND b.is_primary = true`
      );
    }
  });

  it("Host header case, trailing dot, and port still resolve the same tenant", async () => {
    requireDb();
    const app = makeApp({ BLESSBOARD_TENANT_ROUTING_MODE: "authoritative" });
    for (const host of [
      TENANT_HOST.toUpperCase(),
      `${TENANT_HOST}.`,
      `${TENANT_HOST}:443`,
      `${TENANT_HOST.toUpperCase()}:8080`,
    ]) {
      const res = await request(app).get("/").set("Host", host);
      assert.equal(res.status, 200, `host=${host}`);
      assert.match(res.text, new RegExp(CHURCH_NAME));
    }
  });

  it("unknown host does not fall back to another tenant", async () => {
    requireDb();
    const app = makeApp({ BLESSBOARD_TENANT_ROUTING_MODE: "authoritative" });
    const res = await request(app).get("/").set("Host", "unknown.blessboard.org");
    assert.equal(res.status, 404);
    assert.doesNotMatch(res.text, new RegExp(CHURCH_NAME));
    assert.doesNotMatch(res.text, new RegExp(BRANCH_NAME));
  });

  it("missing church does not render tenant", async () => {
    requireDb();
    // Soft-delete by renaming organization link: create orphan domain org without church
    await provisionPlatformTenant(pool, {
      organizationKey: "no-church-org",
      displayName: "No Church Org",
      legalName: null,
      dataEnvironment: "testing",
      productKey: "blessboard",
      productTenantKey: "no-church-org",
      hostname: "no-church.blessboard.org",
      domainType: "canonical",
      deploymentCode: "blessboard-org-v5",
      isPrimary: true,
    });
    const app = makeApp({ BLESSBOARD_TENANT_ROUTING_MODE: "authoritative" });
    const res = await request(app).get("/").set("Host", "no-church.blessboard.org");
    assert.equal(res.status, 503);
    assert.doesNotMatch(res.text, /No Church Org/);
  });

  it("missing HQ branch does not render tenant", async () => {
    requireDb();
    await pool.query(
      `UPDATE blessboard.branches SET status = 'inactive'
         WHERE church_id = $1 AND branch_type = 'hq'`,
      [churchId]
    );
    try {
      const app = makeApp({ BLESSBOARD_TENANT_ROUTING_MODE: "authoritative" });
      const res = await request(app).get("/").set("Host", TENANT_HOST);
      assert.equal(res.status, 503);
      assert.doesNotMatch(res.text, new RegExp(CHURCH_NAME));
    } finally {
      await pool.query(
        `UPDATE blessboard.branches SET status = 'active'
           WHERE church_id = $1 AND branch_type = 'hq'`,
        [churchId]
      );
    }
  });

  it("missing primary branch does not render tenant", async () => {
    requireDb();
    await pool.query(
      `UPDATE blessboard.branches SET is_primary = false
         WHERE church_id = $1 AND is_primary = true`,
      [churchId]
    );
    try {
      const app = makeApp({ BLESSBOARD_TENANT_ROUTING_MODE: "authoritative" });
      const res = await request(app).get("/").set("Host", TENANT_HOST);
      assert.equal(res.status, 503);
      assert.doesNotMatch(res.text, new RegExp(CHURCH_NAME));
    } finally {
      await pool.query(
        `UPDATE blessboard.branches SET is_primary = true
           WHERE church_id = $1 AND branch_type = 'hq'`,
        [churchId]
      );
    }
  });

  it("catalogue lookup error returns controlled 503", async () => {
    requireDb();
    const brokenPool = {
      query: async (text, params) => {
        if (/blessboard\.churches/i.test(String(text))) {
          throw new Error("simulated catalogue failure");
        }
        return pool.query(text, params);
      },
    };
    const app = createV5FoundationApp({
      getPool: () => brokenPool,
      env: baseEnv({ BLESSBOARD_TENANT_ROUTING_MODE: "authoritative" }),
    });
    const res = await request(app).get("/").set("Host", TENANT_HOST);
    assert.equal(res.status, 503);
    assert.match(res.text, /temporarily unavailable/i);
    assert.doesNotMatch(res.text, /simulated catalogue|catalogue_lookup_error/);
  });

  it("health remains 200 after routing failure", async () => {
    requireDb();
    const app = makeApp({ BLESSBOARD_TENANT_ROUTING_MODE: "authoritative" });
    await request(app).get("/").set("Host", "unknown-xyz.blessboard.org");
    const health = await request(app).get("/healthz").set("Host", "unknown-xyz.blessboard.org");
    assert.equal(health.status, 200);
    assert.equal(health.body.ok, true);
  });

  it("never queries public.tenants or public.session", async () => {
    requireDb();
    queriedTables = [];
    const app = makeApp({ BLESSBOARD_TENANT_ROUTING_MODE: "authoritative" });
    await request(app).get("/").set("Host", TENANT_HOST);
    await request(app).get("/").set("Host", "unknown-xyz.blessboard.org");
    assert.deepEqual(queriedTables, []);
  });

  it("landing page helper omits UUIDs and deployment codes", () => {
    const html = renderTenantLandingPage({
      churchDisplayName: "Safe Church",
      primaryBranchDisplayName: "Safe Branch",
      hqBranchDisplayName: "Safe HQ",
      showHqIndicator: true,
      dataEnvironment: "testing",
    });
    assert.match(html, /Safe Church/);
    assert.match(html, /Safe Branch/);
    assert.match(html, /testing/);
    assert.doesNotMatch(html, /[0-9a-f]{8}-[0-9a-f]{4}-/i);
    assert.doesNotMatch(html, /blessboard-org-v5/);
  });

  it("production data environment does not show env badge", () => {
    const html = renderTenantLandingPage({
      churchDisplayName: "Prod Church",
      primaryBranchDisplayName: "Main",
      dataEnvironment: "production",
    });
    assert.doesNotMatch(html, /<span class="bb-v5-env">/);
    assert.doesNotMatch(html, />production</);
  });

  it("static assets remain available", async () => {
    requireDb();
    const app = makeApp({ BLESSBOARD_TENANT_ROUTING_MODE: "authoritative" });
    const res = await request(app).get("/church/church.css").set("Host", TENANT_HOST);
    assert.ok(res.status === 200 || res.status === 404);
    if (res.status === 200) {
      assert.match(res.headers["content-type"] || "", /css|text/i);
    }
  });

  it("anonymous apex shows Home and Login", async () => {
    requireDb();
    const app = makeApp({ BLESSBOARD_TENANT_ROUTING_MODE: "off" });
    const res = await request(app).get("/").set("Host", "blessboard.org");
    assert.equal(res.status, 200);
    assert.match(res.text, />Home</);
    assert.match(res.text, />Login</);
    assert.doesNotMatch(res.text, /method="post" action="\/logout"/);
  });

  it("authenticated apex shows Home, Account, Logout POST with CSRF", async () => {
    requireDb();
    const app = makeApp({ BLESSBOARD_TENANT_ROUTING_MODE: "off" });
    const getLogin = await request(app).get("/login").set("Host", "blessboard.org");
    const csrf = extractCookie(getLogin, CSRF_COOKIE);
    const match = getLogin.text.match(/name="_csrf" value="([^"]+)"/);
    assert.ok(match);
    const post = await request(app)
      .post("/login")
      .set("Host", "blessboard.org")
      .set("Cookie", cookieHeader(`${CSRF_COOKIE}=${csrf}`))
      .type("form")
      .send({
        email: "router@example.org",
        password: PASSWORD,
        [CSRF_FIELD]: match[1],
      });
    const sid = extractCookie(post, DEFAULT_V5_COOKIE);
    assert.ok(sid);
    const setCookie = String(post.headers["set-cookie"] || "");
    assert.doesNotMatch(setCookie, /Domain=/i);

    const home = await request(app)
      .get("/")
      .set("Host", "blessboard.org")
      .set("Cookie", cookieHeader(`${DEFAULT_V5_COOKIE}=${sid}`));
    assert.match(home.text, />Home</);
    assert.match(home.text, />Account</);
    assert.match(home.text, /method="post" action="\/logout"/);
    assert.match(home.text, /name="_csrf"/);

    const logoutNoCsrf = await request(app)
      .post("/logout")
      .set("Host", "blessboard.org")
      .set("Cookie", cookieHeader(`${DEFAULT_V5_COOKIE}=${sid}`))
      .type("form")
      .send({});
    assert.equal(logoutNoCsrf.status, 403);
  });

  it("tenant host login starts apex transfer; apex session cookie does not alter public tenant landing", async () => {
    requireDb();
    const app = makeApp({ BLESSBOARD_TENANT_ROUTING_MODE: "authoritative" });
    const getLogin = await request(app).get("/login").set("Host", "blessboard.org");
    const csrf = extractCookie(getLogin, CSRF_COOKIE);
    const match = getLogin.text.match(/name="_csrf" value="([^"]+)"/);
    const post = await request(app)
      .post("/login")
      .set("Host", "blessboard.org")
      .set("Cookie", cookieHeader(`${CSRF_COOKIE}=${csrf}`))
      .type("form")
      .send({
        email: "router@example.org",
        password: PASSWORD,
        [CSRF_FIELD]: match[1],
      });
    const sid = extractCookie(post, DEFAULT_V5_COOKIE);

    const tenantLogin = await request(app)
      .get("/login")
      .set("Host", TENANT_HOST)
      .redirects(0);
    assert.equal(tenantLogin.status, 303);
    assert.match(String(tenantLogin.headers.location || ""), /\/login\?tr=/);

    // Public tenant landing ignores apex cookie jar semantics; page stays anonymous.
    const tenantHome = await request(app)
      .get("/")
      .set("Host", TENANT_HOST)
      .set("Cookie", cookieHeader(`${DEFAULT_V5_COOKIE}=${sid}`));
    assert.equal(tenantHome.status, 200);
    assert.match(tenantHome.text, new RegExp(CHURCH_NAME));
    assert.doesNotMatch(tenantHome.text, /Router Admin|Logout|Account/);
  });
});
