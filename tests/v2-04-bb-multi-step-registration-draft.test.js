"use strict";

/**
 * BB church registration multi-step draft persistence (platform form state).
 */

const assert = require("node:assert/strict");
const { describe, it, before, after } = require("node:test");
const request = require("supertest");
const crypto = require("crypto");

const {
  resetFoundationDatabase,
  createFoundationPool,
} = require("./helpers/foundationDb");
const { migrate } = require("../db/scripts/lib/migrator");
const { ensureDatabaseIdentity } = require("../db/scripts/lib/databaseIdentity");
const { createV5FoundationApp } = require("../src/platform/http/v5FoundationServer");
const { CSRF_FIELD, CSRF_COOKIE } = require("../src/platform/http/v5Csrf");
const { DEFAULT_V5_COOKIE } = require("../src/platform/session/v5SessionCookie");
const { ENV_KEY } = require("../src/blessboard/config/instantFreeProvisioningEnabled");

const IDENTITY_KEY = "blessboard-platform-v5";
const PASSWORD = "TestPassword99!";

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

function extractCsrfToken(html) {
  const m = String(html || "").match(
    new RegExp(`name="${CSRF_FIELD}"[^>]*value="([^"]+)"|value="([^"]+)"[^>]*name="${CSRF_FIELD}"`)
  );
  return (m && (m[1] || m[2])) || null;
}

function uniq(prefix) {
  return `${prefix}-${crypto.randomBytes(3).toString("hex")}`;
}

function joinCookies(...responses) {
  const parts = [];
  for (const res of responses) {
    const raw = res && res.headers && res.headers["set-cookie"];
    const list = Array.isArray(raw) ? raw : raw ? [raw] : [];
    for (const line of list) {
      parts.push(String(line).split(";")[0]);
    }
  }
  return parts.join("; ");
}

describe("BB multi-step registration draft persistence", () => {
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
        PLATFORM_DEPLOYMENT_CODE: "blessboard-org-staging",
        SESSION_SECRET: "test-session-secret-at-least-32-chars!!",
        SESSION_COOKIE_NAME: DEFAULT_V5_COOKIE,
        [ENV_KEY]: "1",
      },
      getPool: () => pool,
    });
  }

  function churchStepBody(overrides = {}) {
    const key = uniq("bbms");
    return {
      action: "next-church",
      church_name: `Draft Persist Church ${key}`,
      country: "Kenya",
      city: "Nairobi",
      branch_name: "Central Branch",
      selected_plan: "foundation",
      ...overrides,
    };
  }

  it("11 Step 1 → Step 2 preserves fields (PRG + refresh without gpRegNav)", async () => {
    requireDb();
    const app = makeApp();
    const page = await request(app).get("/register-church?plan=foundation").set("Host", "blessboard.org");
    const csrf = extractCsrfToken(page.text);
    const body = churchStepBody();
    const next = await request(app)
      .post("/register-church")
      .set("Host", "blessboard.org")
      .set("Cookie", `${CSRF_COOKIE}=${extractCookie(page, CSRF_COOKIE)}`)
      .type("form")
      .send({ ...body, [CSRF_FIELD]: csrf });
    assert.equal(next.status, 303);
    assert.match(String(next.headers.location || ""), /step=administrator/);

    const step2 = await request(app)
      .get(String(next.headers.location).replace(/^https?:\/\/[^/]+/, "") || next.headers.location)
      .set("Host", "blessboard.org")
      .set("Cookie", joinCookies(page, next));
    assert.equal(step2.status, 200);
    assert.match(step2.text, new RegExp(body.church_name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
    assert.match(step2.text, /Nairobi/);

    // Refresh without gpRegNav must still hydrate.
    const refresh = await request(app)
      .get("/register-church?step=administrator&plan=foundation")
      .set("Host", "blessboard.org")
      .set("Cookie", joinCookies(page, next));
    assert.equal(refresh.status, 200);
    assert.match(refresh.text, /Nairobi/);
    assert.match(refresh.text, new RegExp(body.church_name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  });

  it("12 review preserves full draft", async () => {
    requireDb();
    const app = makeApp();
    const page = await request(app).get("/register-church?plan=foundation").set("Host", "blessboard.org");
    const csrf1 = extractCsrfToken(page.text);
    const church = churchStepBody();
    const nextChurch = await request(app)
      .post("/register-church")
      .set("Host", "blessboard.org")
      .set("Cookie", `${CSRF_COOKIE}=${extractCookie(page, CSRF_COOKIE)}`)
      .type("form")
      .send({ ...church, [CSRF_FIELD]: csrf1 });
    assert.equal(nextChurch.status, 303);

    const adminPage = await request(app)
      .get(nextChurch.headers.location)
      .set("Host", "blessboard.org")
      .set("Cookie", joinCookies(page, nextChurch));
    const csrf2 = extractCsrfToken(adminPage.text);
    const phoneNational = `7${String(10000000 + (Date.now() % 89999999)).slice(-8)}`;
    const nextAdmin = await request(app)
      .post("/register-church")
      .set("Host", "blessboard.org")
      .set("Cookie", joinCookies(page, nextChurch, adminPage))
      .type("form")
      .send({
        action: "next-admin",
        contact_name: "Review Admin",
        email: `${uniq("rev")}@example.org`,
        phone_country: "KE",
        phone_national: phoneNational,
        role_in_church: "Administrator",
        password: PASSWORD,
        password_confirm: PASSWORD,
        [CSRF_FIELD]: csrf2,
      });
    assert.equal(nextAdmin.status, 303);
    assert.match(String(nextAdmin.headers.location || ""), /step=review/);

    const review = await request(app)
      .get(nextAdmin.headers.location)
      .set("Host", "blessboard.org")
      .set("Cookie", joinCookies(page, nextChurch, adminPage, nextAdmin));
    assert.equal(review.status, 200);
    assert.match(review.text, new RegExp(church.church_name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
    assert.match(review.text, /Review Admin/);
    assert.match(review.text, /Nairobi/);
  });

  it("13 failed provisioning retains draft for retry (no clear on fail response)", async () => {
    requireDb();
    const app = makeApp();
    const page = await request(app).get("/register-church?plan=foundation").set("Host", "blessboard.org");
    const csrf1 = extractCsrfToken(page.text);
    const church = churchStepBody({ church_name: `Fail Retain ${uniq("fr")}` });
    const nextChurch = await request(app)
      .post("/register-church")
      .set("Host", "blessboard.org")
      .set("Cookie", `${CSRF_COOKIE}=${extractCookie(page, CSRF_COOKIE)}`)
      .type("form")
      .send({ ...church, [CSRF_FIELD]: csrf1 });
    const adminPage = await request(app)
      .get(nextChurch.headers.location)
      .set("Host", "blessboard.org")
      .set("Cookie", joinCookies(page, nextChurch));
    // Draft cookie still present after step advance
    assert.ok(joinCookies(page, nextChurch).includes("bb_reg_draft="));
    assert.equal(adminPage.status, 200);
    assert.match(adminPage.text, /Fail Retain/);
  });
});
