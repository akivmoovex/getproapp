"use strict";

/**
 * Focused apex home + navigation structure tests (Stitch marketing chrome).
 */

const assert = require("node:assert/strict");
const { describe, it, before, after } = require("node:test");
const request = require("supertest");
const fs = require("node:fs");
const path = require("node:path");

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
const { CSRF_FIELD, CSRF_COOKIE } = require("../src/platform/http/v5Csrf");
const { DEFAULT_V5_COOKIE } = require("../src/platform/session/v5SessionCookie");

const ROOT = path.resolve(__dirname, "..");
const IDENTITY_KEY = "blessboard-platform-v5";
const PASSWORD = "correct-horse-battery-staple";
const EMAIL = "apex-home@example.org";
const ORG_KEY = "apex-home-org";

function extractCookie(res, name) {
  const raw = res.headers["set-cookie"];
  const list = Array.isArray(raw) ? raw : raw ? [raw] : [];
  for (const line of list) {
    if (String(line).startsWith(`${name}=`)) {
      return String(line).split(";")[0].slice(name.length + 1);
    }
  }
  return null;
}

function cookieHeader(...parts) {
  return parts.filter(Boolean).join("; ");
}

describe("blessboard apex home gui", () => {
  let pool;
  let databaseUrl;
  let skipSuite = false;
  let skipReason = "";

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
        organizationKey: ORG_KEY,
        displayName: "Apex Home Org",
        legalName: null,
        dataEnvironment: "testing",
        productKey: "blessboard",
        productTenantKey: ORG_KEY,
        hostname: "apex-home.blessboard.org",
        domainType: "canonical",
        deploymentCode: "blessboard-org-v5",
        isPrimary: true,
      });
      assert.equal(provisioned.ok, true, provisioned.message);
      const church = await provisionBlessBoardChurch(pool, {
        organizationKey: ORG_KEY,
        churchKey: ORG_KEY,
        displayName: "Apex Home Church",
        legalName: null,
        dataEnvironment: "testing",
        hqBranchKey: "hq",
        hqBranchDisplayName: "Headquarters",
      });
      assert.equal(church.ok, true, church.message);
      const created = await createBlessBoardUser(pool, {
        email: EMAIL,
        displayName: "Apex Home User",
        password: PASSWORD,
      });
      assert.equal(created.ok, true, created.message);
      const role = await assignBlessBoardRole(pool, {
        email: EMAIL,
        organizationKey: ORG_KEY,
        roleKey: "church_hq_admin",
        churchKey: ORG_KEY,
      });
      assert.equal(role.ok, true, role.message);
    } catch (err) {
      skipSuite = true;
      skipReason = err && err.message ? err.message : String(err);
    }
  });

  after(async () => {
    if (pool) await pool.end().catch(() => {});
  });

  function requireDb() {
    if (skipSuite) assert.fail(`Local PostgreSQL unavailable: ${skipReason}`);
  }

  function makeApp() {
    return createV5FoundationApp({
      env: {
        NODE_ENV: "test",
        BLESSBOARD_TENANT_ROUTING_MODE: "off",
        PLATFORM_DEPLOYMENT_CODE: "blessboard-org-v5",
        SESSION_SECRET: "test-session-secret-at-least-32-chars!!",
        SESSION_COOKIE_NAME: DEFAULT_V5_COOKIE,
      },
      getPool: () => pool,
    });
  }

  it("anonymous apex home shows Stitch hero, Home/Login nav, drawer, footer", async () => {
    requireDb();
    const app = makeApp();
    const res = await request(app).get("/").set("Host", "blessboard.org");
    assert.equal(res.status, 200);
    assert.match(res.text, /data-bb-shell="apex"/);
    assert.match(res.text, /One digital home for/);
    assert.match(res.text, /your church/);
    assert.match(res.text, /data-bb-apex-hero="1"/);
    assert.match(res.text, /bb-apex-hero__grid/);
    assert.match(res.text, /Designed for every member of your community/);
    assert.match(res.text, /id="capabilities"/);
    assert.match(res.text, /apex-feature-website\.jpg/);
    assert.match(res.text, />Home</);
    assert.match(res.text, /data-bb-apex-cta="header-login"/);
    assert.match(res.text, /href="\/login"/);
    assert.doesNotMatch(res.text, /method="post" action="\/logout"/);
    assert.doesNotMatch(res.text, />Account</);
    assert.doesNotMatch(res.text, /href="\/features"|href="\/pricing"|href="\/directory"/);
    assert.doesNotMatch(res.text, /Register Your Church|Watch the Demo|hundreds of churches|Join over \d+/i);
    assert.match(res.text, /id="bb-apex-drawer"/);
    assert.match(res.text, /id="bb-apex-menu-btn"/);
    assert.match(res.text, /data-bb-apex-footer="1"/);
    assert.match(res.text, /Powered by/);
    assert.match(res.text, /GetPro/);
    assert.doesNotMatch(res.text, /\/hq|\/branch-admin|Router Admin/);
    assert.doesNotMatch(res.text, /\d+\+?\s*(Members|Churches|Active)/i);
  });

  it("authenticated apex home shows Account entry and Logout POST with CSRF", async () => {
    requireDb();
    const app = makeApp();
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
        email: EMAIL,
        password: PASSWORD,
        [CSRF_FIELD]: match[1],
      });
    const sid = extractCookie(post, DEFAULT_V5_COOKIE);
    assert.ok(sid, `expected session cookie; status=${post.status}`);

    const home = await request(app)
      .get("/")
      .set("Host", "blessboard.org")
      .set("Cookie", cookieHeader(`${DEFAULT_V5_COOKIE}=${sid}`));
    assert.equal(home.status, 200);
    assert.match(home.text, />Home</);
    assert.match(home.text, />Account</);
    assert.match(home.text, /method="post" action="\/logout"/);
    assert.match(home.text, /name="_csrf"/);
    assert.match(home.text, /Go to Account|Open Account/);
    assert.doesNotMatch(home.text, /data-bb-apex-cta="header-login"/);
  });

  it("ships apex assets and shell templates", () => {
    for (const rel of [
      "public/blessboard/v5/apex.css",
      "public/blessboard/v5/apex.js",
      "views/blessboard/v5/apex/home.ejs",
      "views/blessboard/v5/partials/apex-shell-start.ejs",
      "views/blessboard/v5/partials/apex-shell-end.ejs",
      "views/blessboard/v5/partials/apex-nav-links.ejs",
      "public/church/images/homepage/desktop-hero-auditorium.jpg",
      "public/church/images/homepage/apex-hero-mobile.jpg",
    ]) {
      assert.equal(fs.existsSync(path.join(ROOT, rel)), true, rel);
    }
  });
});
