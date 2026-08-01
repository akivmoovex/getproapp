"use strict";

/**
 * Focused BlessBoard custom-domain routing + transfer HTTP tests (ephemeral Postgres).
 * Does not change env vars or DNS outside the in-process test app.
 */

const { describe, it, before, after } = require("node:test");
const assert = require("node:assert/strict");
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
  safeTenantNextPath,
  getApexOrigin,
} = require("../src/blessboard/http/tenantLoginHelpers");

const IDENTITY_KEY = "blessboard-platform-v5";
const PASSWORD = "correct-horse-battery-staple";
const FALLBACK_HOST = "cd-fallback.blessboard.org";
const CUSTOM_HOST = "church.custom-domain.test";
const ALIAS_HOST = "www.church.custom-domain.test";
const UNKNOWN_CUSTOM = "unknown.custom-domain.test";
const CHURCH_NAME = "Custom Domain Church";
const BRANCH_NAME = "Custom Domain HQ";

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

function extractLocationQuery(location, key) {
  const url = new URL(String(location || ""), "https://example.invalid");
  return url.searchParams.get(key);
}

function baseEnv(overrides) {
  return {
    NODE_ENV: "test",
    PLATFORM_DEPLOYMENT_CODE: "blessboard-org-staging",
    SESSION_SECRET: "test-session-secret-at-least-32-chars!!",
    SESSION_COOKIE_NAME: DEFAULT_V5_COOKIE,
    BLESSBOARD_TENANT_ROUTING_MODE: "authoritative",
    BLESSBOARD_APEX_ORIGIN: "https://blessboard.org",
    PUBLIC_SCHEME: "https",
    BLESSBOARD_AUTHORITATIVE_HOST_ALLOWLIST: "*",
    ...overrides,
  };
}

describe("blessboard custom-domain routing http", () => {
  let databaseUrl;
  let pool;
  let skipSuite = false;
  let skipReason = "";
  let orgId;
  let churchId;
  let productBlessboardId;
  let productGetproId;
  let app;

  before(async () => {
    try {
      databaseUrl = await resetFoundationDatabase();
      pool = createFoundationPool(databaseUrl);
      await migrate({ connectionString: databaseUrl });
      await ensureDatabaseIdentity(pool, {
        connectionString: databaseUrl,
        identityKey: IDENTITY_KEY,
        environmentCode: "testing",
      });

      const provisioned = await provisionPlatformTenant(pool, {
        organizationKey: "cd-org",
        displayName: "Custom Domain Org",
        legalName: null,
        dataEnvironment: "testing",
        productKey: "blessboard",
        productTenantKey: "cd-org",
        hostname: FALLBACK_HOST,
        domainType: "canonical",
        deploymentCode: "blessboard-org-staging",
        isPrimary: true,
      });
      assert.equal(provisioned.ok, true, provisioned.message);
      orgId = provisioned.records.organization.id;

      const church = await provisionBlessBoardChurch(pool, {
        organizationKey: "cd-org",
        churchKey: "cd-org",
        displayName: CHURCH_NAME,
        legalName: null,
        dataEnvironment: "testing",
        hqBranchKey: "hq",
        hqBranchDisplayName: BRANCH_NAME,
      });
      assert.equal(church.ok, true, church.message);
      churchId = church.records.church.id;

      const products = await pool.query(
        `SELECT product_key, id FROM platform.products WHERE product_key IN ('blessboard', 'getpro')`
      );
      for (const row of products.rows) {
        if (row.product_key === "blessboard") productBlessboardId = row.id;
        if (row.product_key === "getpro") productGetproId = row.id;
      }
      assert.ok(productBlessboardId);
      assert.ok(productGetproId);

      // Model A: keep BlessBoard subdomain AND add custom + alias (routing treats both as tenant).
      await insertDomain({
        hostname: CUSTOM_HOST,
        domainType: "custom",
        status: "active",
        isPrimary: false,
      });
      await insertDomain({
        hostname: ALIAS_HOST,
        domainType: "alias",
        status: "active",
        isPrimary: false,
      });

      const user = await createBlessBoardUser(pool, {
        email: "cd-hq@example.org",
        displayName: "CD HQ",
        password: PASSWORD,
      });
      assert.equal(user.ok, true, user.message);
      const role = await assignBlessBoardRole(pool, {
        email: "cd-hq@example.org",
        roleKey: "church_hq_admin",
        organizationKey: "cd-org",
        churchKey: "cd-org",
      });
      assert.equal(role.ok, true, role.message);

      app = createV5FoundationApp({
        getPool: () => pool,
        env: baseEnv(),
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

  async function insertDomain(opts) {
    await pool.query(
      `INSERT INTO platform.domains
         (organization_id, product_id, deployment_id, hostname, domain_type, status, is_primary)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        opts.organizationId || orgId,
        opts.productId || productBlessboardId,
        opts.deploymentId || "blessboard-org-staging",
        opts.hostname,
        opts.domainType || "custom",
        opts.status || "active",
        opts.isPrimary === true,
      ]
    );
  }

  async function completeTenantLogin(host, email, password) {
    const start = await request(app).get("/login").set("Host", host).redirects(0);
    assert.equal(start.status, 303);
    const loc = start.headers.location;
    assert.match(loc, /^https:\/\/blessboard\.org\/login\?tr=/);
    assert.equal(getApexOrigin({ BLESSBOARD_APEX_ORIGIN: "https://blessboard.org" }), "https://blessboard.org");
    const tr = extractLocationQuery(loc, "tr");
    assert.ok(tr);

    const apexGet = await request(app)
      .get(`/login?tr=${encodeURIComponent(tr)}`)
      .set("Host", "blessboard.org");
    assert.equal(apexGet.status, 200);
    assert.match(apexGet.text, new RegExp(host.replace(/\./g, "\\.")));
    const csrf = extractCookie(apexGet, CSRF_COOKIE);
    const match = apexGet.text.match(/name="_csrf" value="([^"]+)"/);
    assert.ok(csrf && match);

    const post = await request(app)
      .post("/login")
      .set("Host", "blessboard.org")
      .set("Cookie", cookieHeader(`${CSRF_COOKIE}=${csrf}`))
      .redirects(0)
      .type("form")
      .send({
        email,
        password,
        tr,
        [CSRF_FIELD]: match[1],
      });
    assert.equal(post.status, 303);
    assert.match(String(post.headers.location || ""), new RegExp(`https://${host.replace(/\./g, "\\.")}/auth/callback\\?code=`));
    assert.doesNotMatch(String(post.headers["set-cookie"] || ""), /Domain=/i);
    const code = extractLocationQuery(post.headers.location, "code");
    assert.ok(code);

    const callback = await request(app)
      .get(`/auth/callback?code=${encodeURIComponent(code)}`)
      .set("Host", host)
      .redirects(0);
    assert.equal(callback.status, 303);
    const sid = extractCookie(callback, DEFAULT_V5_COOKIE);
    assert.ok(sid);
    assert.doesNotMatch(String(callback.headers["set-cookie"] || ""), /Domain=/i);
    return { sid, code, tr, callback, post };
  }

  it("BlessBoard fallback subdomain renders tenant under authoritative", async () => {
    requireDb();
    const res = await request(app).get("/").set("Host", FALLBACK_HOST);
    assert.equal(res.status, 200);
    assert.match(res.text, new RegExp(CHURCH_NAME));
    assert.match(res.text, /data-bb-shell="tenant-public"/);
  });

  it("custom canonical-style custom domain renders same tenant", async () => {
    requireDb();
    const res = await request(app).get("/").set("Host", CUSTOM_HOST);
    assert.equal(res.status, 200);
    assert.match(res.text, new RegExp(CHURCH_NAME));
    assert.match(res.text, new RegExp(BRANCH_NAME));
    assert.doesNotMatch(res.text, new RegExp(orgId || "never", "i"));
    assert.doesNotMatch(res.text, /blessboard-org-staging/);
  });

  it("custom alias domain renders same tenant without inventing redirect", async () => {
    requireDb();
    const res = await request(app).get("/").set("Host", ALIAS_HOST).redirects(0);
    assert.equal(res.status, 200);
    assert.match(res.text, new RegExp(CHURCH_NAME));
    assert.equal(res.headers.location, undefined);
  });

  it("inactive custom domain does not render tenant", async () => {
    requireDb();
    await pool.query(`UPDATE platform.domains SET status = 'inactive' WHERE hostname = $1`, [CUSTOM_HOST]);
    try {
      const res = await request(app).get("/").set("Host", CUSTOM_HOST);
      assert.equal(res.status, 404);
      assert.doesNotMatch(res.text, new RegExp(CHURCH_NAME));
      // Fallback subdomain remains available
      const fallback = await request(app).get("/").set("Host", FALLBACK_HOST);
      assert.equal(fallback.status, 200);
      assert.match(fallback.text, new RegExp(CHURCH_NAME));
    } finally {
      await pool.query(`UPDATE platform.domains SET status = 'active' WHERE hostname = $1`, [CUSTOM_HOST]);
    }
  });

  it("unknown custom domain returns controlled 404", async () => {
    requireDb();
    const res = await request(app).get("/").set("Host", UNKNOWN_CUSTOM);
    assert.equal(res.status, 404);
    assert.match(res.text, /could not be found/i);
    assert.doesNotMatch(res.text, /unknown_domain/);
    assert.doesNotMatch(res.text, new RegExp(CHURCH_NAME));
  });

  it("same hostname cannot be assigned twice (unique constraint)", async () => {
    requireDb();
    let rejected = false;
    try {
      await insertDomain({
        hostname: CUSTOM_HOST,
        domainType: "custom",
        status: "active",
        isPrimary: false,
      });
    } catch (err) {
      rejected = true;
      assert.match(String(err && err.code), /23505/);
    }
    assert.equal(rejected, true);
  });

  it("wrong deployment on custom domain does not render tenant", async () => {
    requireDb();
    await pool.query(
      `INSERT INTO platform.deployments (
         deployment_code, application_code, release_version, canonical_domain,
         environment_code, status, jobs_enabled, database_access_mode, session_cookie_name
       ) VALUES (
         'cd-other-deploy', 'blessboard', '0.0.0', 'other.example.test',
         'testing', 'active', false, 'read_write', 'cd_other_sid'
       )
       ON CONFLICT (deployment_code) DO NOTHING`
    );
    await pool.query(
      `UPDATE platform.domains SET deployment_id = 'cd-other-deploy' WHERE hostname = $1`,
      [CUSTOM_HOST]
    );
    try {
      const res = await request(app).get("/").set("Host", CUSTOM_HOST);
      assert.equal(res.status, 404);
      assert.doesNotMatch(res.text, new RegExp(CHURCH_NAME));
    } finally {
      await pool.query(
        `UPDATE platform.domains SET deployment_id = 'blessboard-org-staging' WHERE hostname = $1`,
        [CUSTOM_HOST]
      );
    }
  });

  it("wrong environment on custom domain does not render tenant", async () => {
    requireDb();
    // Mismatch org vs church without violating church insert trigger (update org only).
    await pool.query(
      `UPDATE platform.organizations SET data_environment = 'production' WHERE id = $1`,
      [orgId]
    );
    try {
      const res = await request(app).get("/").set("Host", CUSTOM_HOST);
      assert.equal(res.status, 503);
      assert.doesNotMatch(res.text, new RegExp(CHURCH_NAME));
    } finally {
      await pool.query(
        `UPDATE platform.organizations SET data_environment = 'testing' WHERE id = $1`,
        [orgId]
      );
    }
  });

  it("wrong product on custom domain does not render BlessBoard tenant", async () => {
    requireDb();
    const wrongHost = "getpro-product.custom-domain.test";
    await insertDomain({
      hostname: wrongHost,
      domainType: "custom",
      productId: productGetproId,
      status: "active",
      isPrimary: false,
    });
    const res = await request(app).get("/").set("Host", wrongHost);
    // Fail-closed: missing getpro enrolment or not_blessboard — never tenant CMS.
    assert.ok([404, 503].includes(res.status));
    assert.doesNotMatch(res.text, new RegExp(CHURCH_NAME));
    assert.doesNotMatch(res.text, /data-bb-shell="tenant-public"/);
  });

  it("login from custom domain starts apex transfer bound to that hostname", async () => {
    requireDb();
    const start = await request(app).get("/login").set("Host", CUSTOM_HOST).redirects(0);
    assert.equal(start.status, 303);
    assert.match(start.headers.location, /^https:\/\/blessboard\.org\/login\?tr=/);
    const tr = extractLocationQuery(start.headers.location, "tr");
    const apexGet = await request(app)
      .get(`/login?tr=${encodeURIComponent(tr)}`)
      .set("Host", "blessboard.org");
    assert.equal(apexGet.status, 200);
    assert.match(apexGet.text, new RegExp(CUSTOM_HOST.replace(/\./g, "\\.")));
  });

  it("return from apex authentication sets host-only cookie on custom domain", async () => {
    requireDb();
    const { sid, post, callback } = await completeTenantLogin(
      CUSTOM_HOST,
      "cd-hq@example.org",
      PASSWORD
    );
    assert.ok(sid);
    assert.doesNotMatch(String(post.headers["set-cookie"] || ""), /Domain=/i);
    assert.doesNotMatch(String(callback.headers["set-cookie"] || ""), /Domain=/i);
    assert.doesNotMatch(String(callback.headers["set-cookie"] || ""), /Domain=\.blessboard\.org/i);

    const hq = await request(app)
      .get("/hq")
      .set("Host", CUSTOM_HOST)
      .set("Cookie", cookieHeader(`${DEFAULT_V5_COOKIE}=${sid}`));
    assert.equal(hq.status, 200);
  });

  it("hostname-bound transfer rejects redeem on fallback when issued for custom", async () => {
    requireDb();
    const start = await request(app).get("/login").set("Host", CUSTOM_HOST).redirects(0);
    const tr = extractLocationQuery(start.headers.location, "tr");
    const apexGet = await request(app)
      .get(`/login?tr=${encodeURIComponent(tr)}`)
      .set("Host", "blessboard.org");
    const csrf = extractCookie(apexGet, CSRF_COOKIE);
    const match = apexGet.text.match(/name="_csrf" value="([^"]+)"/);
    const post = await request(app)
      .post("/login")
      .set("Host", "blessboard.org")
      .set("Cookie", cookieHeader(`${CSRF_COOKIE}=${csrf}`))
      .redirects(0)
      .type("form")
      .send({
        email: "cd-hq@example.org",
        password: PASSWORD,
        tr,
        [CSRF_FIELD]: match[1],
      });
    const code = extractLocationQuery(post.headers.location, "code");
    assert.ok(code);

    const wrongHost = await request(app)
      .get(`/auth/callback?code=${encodeURIComponent(code)}`)
      .set("Host", FALLBACK_HOST)
      .set("Accept", "text/html");
    assert.equal(wrongHost.status, 400);

    // Mismatch must not consume: redeem on the bound custom host still succeeds.
    const rightHost = await request(app)
      .get(`/auth/callback?code=${encodeURIComponent(code)}`)
      .set("Host", CUSTOM_HOST)
      .redirects(0);
    assert.equal(rightHost.status, 303);
    const sid = extractCookie(rightHost, DEFAULT_V5_COOKIE);
    assert.ok(sid);
  });

  it("cookie remains host-only (no Domain attribute); apex does not receive tenant cookie scope", async () => {
    requireDb();
    const { sid, callback } = await completeTenantLogin(CUSTOM_HOST, "cd-hq@example.org", PASSWORD);
    const setCookie = String(callback.headers["set-cookie"] || "");
    assert.doesNotMatch(setCookie, /Domain=/i);
    assert.doesNotMatch(setCookie, /Domain=\.blessboard\.org/i);

    const onCustom = await request(app)
      .get("/hq")
      .set("Host", CUSTOM_HOST)
      .set("Cookie", cookieHeader(`${DEFAULT_V5_COOKIE}=${sid}`));
    assert.equal(onCustom.status, 200);

    // Apex is a different host; browser host-only cookies would not be sent. Even if
    // manually forwarded, apex must not render tenant HQ shell for this transfer path.
    const onApex = await request(app)
      .get("/hq")
      .set("Host", "blessboard.org")
      .set("Cookie", cookieHeader(`${DEFAULT_V5_COOKIE}=${sid}`))
      .set("Accept", "text/html");
    assert.notEqual(onApex.status, 200);
    assert.doesNotMatch(onApex.text || "", /data-bb-shell="tenant-public"/);

    // Same-org fallback Host: session tokens are deployment-scoped (not hostname-scoped).
    // Real browsers still will not send the custom-host cookie to the fallback Host.
    // We assert Set-Cookie host-only above rather than inventing hostname binding here.
  });

  it("logout on custom domain revokes session", async () => {
    requireDb();
    const { sid } = await completeTenantLogin(CUSTOM_HOST, "cd-hq@example.org", PASSWORD);
    const account = await request(app)
      .get("/account")
      .set("Host", CUSTOM_HOST)
      .set("Cookie", cookieHeader(`${DEFAULT_V5_COOKIE}=${sid}`));
    assert.equal(account.status, 200);
    const tenantCsrf = extractCookie(account, CSRF_COOKIE);
    const csrfMatch = account.text.match(/name="_csrf" value="([^"]+)"/);
    assert.ok(tenantCsrf && csrfMatch);

    const logout = await request(app)
      .post("/logout")
      .set("Host", CUSTOM_HOST)
      .set("Cookie", cookieHeader(`${DEFAULT_V5_COOKIE}=${sid}`, `${CSRF_COOKIE}=${tenantCsrf}`))
      .type("form")
      .send({ [CSRF_FIELD]: csrfMatch[1] })
      .redirects(0);
    assert.equal(logout.status, 303);
    assert.doesNotMatch(String(logout.headers["set-cookie"] || ""), /Domain=/i);

    const after = await request(app)
      .get("/hq")
      .set("Host", CUSTOM_HOST)
      .set("Cookie", cookieHeader(`${DEFAULT_V5_COOKIE}=${sid}`))
      .set("Accept", "text/html");
    assert.equal(after.status, 303);
  });

  it("switching between fallback and custom hosts requires separate host-bound login", async () => {
    requireDb();
    const customLanding = await request(app).get("/").set("Host", CUSTOM_HOST);
    const fallbackLanding = await request(app).get("/").set("Host", FALLBACK_HOST);
    assert.equal(customLanding.status, 200);
    assert.equal(fallbackLanding.status, 200);
    assert.match(customLanding.text, new RegExp(CHURCH_NAME));
    assert.match(fallbackLanding.text, new RegExp(CHURCH_NAME));

    const { sid: customSid } = await completeTenantLogin(CUSTOM_HOST, "cd-hq@example.org", PASSWORD);
    const { sid: fallbackSid } = await completeTenantLogin(FALLBACK_HOST, "cd-hq@example.org", PASSWORD);
    assert.notEqual(customSid, fallbackSid);

    assert.equal(
      (
        await request(app)
          .get("/hq")
          .set("Host", CUSTOM_HOST)
          .set("Cookie", cookieHeader(`${DEFAULT_V5_COOKIE}=${customSid}`))
      ).status,
      200
    );
    assert.equal(
      (
        await request(app)
          .get("/hq")
          .set("Host", FALLBACK_HOST)
          .set("Cookie", cookieHeader(`${DEFAULT_V5_COOKIE}=${fallbackSid}`))
      ).status,
      200
    );
  });

  it("no open redirect via next on custom-domain login initiation", async () => {
    requireDb();
    assert.equal(safeTenantNextPath("https://evil.example/phish"), null);
    assert.equal(safeTenantNextPath("//evil.example"), null);
    assert.equal(safeTenantNextPath("/hq"), "/hq");

    const start = await request(app)
      .get("/login?next=https://evil.example/phish")
      .set("Host", CUSTOM_HOST)
      .redirects(0);
    assert.equal(start.status, 303);
    const loc = String(start.headers.location || "");
    assert.match(loc, /^https:\/\/blessboard\.org\/login\?tr=/);
    assert.doesNotMatch(loc, /evil\.example/);

    const { sid, post } = await completeTenantLogin(CUSTOM_HOST, "cd-hq@example.org", PASSWORD);
    assert.ok(sid);
    assert.match(String(post.headers.location || ""), new RegExp(`^https://${CUSTOM_HOST.replace(/\./g, "\\.")}/auth/callback`));
    assert.doesNotMatch(String(post.headers.location || ""), /evil\.example/);
  });

  it("suspended church does not render on custom domain", async () => {
    requireDb();
    await pool.query(`UPDATE blessboard.churches SET status = 'suspended' WHERE id = $1`, [churchId]);
    try {
      const res = await request(app).get("/").set("Host", CUSTOM_HOST);
      assert.equal(res.status, 503);
      assert.doesNotMatch(res.text, new RegExp(CHURCH_NAME));
    } finally {
      await pool.query(`UPDATE blessboard.churches SET status = 'active' WHERE id = $1`, [churchId]);
    }
  });

  it("inactive primary branch does not render on custom domain", async () => {
    requireDb();
    await pool.query(
      `UPDATE blessboard.branches SET status = 'inactive'
         WHERE church_id = $1 AND is_primary = true`,
      [churchId]
    );
    try {
      const res = await request(app).get("/").set("Host", CUSTOM_HOST);
      assert.equal(res.status, 503);
      assert.doesNotMatch(res.text, new RegExp(CHURCH_NAME));
    } finally {
      await pool.query(
        `UPDATE blessboard.branches SET status = 'active'
           WHERE church_id = $1 AND is_primary = true`,
        [churchId]
      );
    }
  });

  it("shadow still serves foundation HTML on custom domain", async () => {
    requireDb();
    const shadowApp = createV5FoundationApp({
      getPool: () => pool,
      env: baseEnv({ BLESSBOARD_TENANT_ROUTING_MODE: "shadow" }),
    });
    const res = await request(shadowApp).get("/").set("Host", CUSTOM_HOST);
    assert.equal(res.status, 200);
    assert.match(res.text, /data-bb-shell="apex"/);
    assert.doesNotMatch(res.text, new RegExp(CHURCH_NAME));
  });
});
