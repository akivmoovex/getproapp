"use strict";

/**
 * BB-MT-001 — public apex church-registration journey on BlessBoard.org.
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
const { createV5FoundationApp } = require("../src/platform/http/v5FoundationServer");
const { CSRF_FIELD, CSRF_COOKIE } = require("../src/platform/http/v5Csrf");
const { DEFAULT_V5_COOKIE } = require("../src/platform/session/v5SessionCookie");
const {
  normalizeSelectedPlan,
} = require("../src/blessboard/services/platformChurchRegistrationValidation");
const repo = require("../src/blessboard/repositories/platformChurchRegistrationRepository");

const ROOT = path.resolve(__dirname, "..");
const IDENTITY_KEY = "blessboard-platform-v5";

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

const validBody = {
  church_name: "MANUAL TEST DEMO CHURCH",
  country: "Zambia",
  city: "Lusaka",
  contact_name: "MANUAL TEST USER",
  role_in_church: "Pastor",
  phone: "+260971234567",
  email: "manual-test-demo@example.org",
  branch_count: "2",
  selected_plan: "growth",
  message: "Focused automated registration journey test.",
  consent_contact: "on",
};

describe("blessboard public church registration (BB-MT-001)", () => {
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
        PLATFORM_DEPLOYMENT_CODE: "blessboard-org-v5",
        SESSION_SECRET: "test-session-secret-at-least-32-chars!!",
        SESSION_COOKIE_NAME: DEFAULT_V5_COOKIE,
      },
      getPool: () => pool,
    });
  }

  async function getRegistrationPage(app, pathName = "/register-church") {
    const res = await request(app).get(pathName).set("Host", "blessboard.org");
    assert.equal(res.status, 200);
    const csrf = extractCsrfToken(res.text);
    const cookie = extractCookie(res, CSRF_COOKIE);
    assert.ok(csrf, "csrf token present");
    assert.ok(cookie, "csrf cookie present");
    return { res, csrf, cookie };
  }

  it("ships registration template and migration", () => {
    assert.equal(
      fs.existsSync(path.join(ROOT, "views/blessboard/v5/apex/register-church.ejs")),
      true
    );
    assert.equal(
      fs.existsSync(
        path.join(
          ROOT,
          "db/migrations/blessboard/026_create_platform_church_registration_applications.sql"
        )
      ),
      true
    );
  });

  it("normalizes allowlisted plans and rejects unknown plan codes safely", () => {
    assert.equal(normalizeSelectedPlan("growth"), "growth");
    assert.equal(normalizeSelectedPlan("FOUNDATION"), "foundation");
    assert.equal(normalizeSelectedPlan("enterprise"), null);
    assert.equal(normalizeSelectedPlan(""), null);
  });

  it("GET /register-church returns 200 for logged-out visitors and does not mutate DB", async () => {
    requireDb();
    const app = makeApp();
    const before = await repo.countPending(pool);
    const { res } = await getRegistrationPage(app);
    assert.match(res.text, /data-bb-register-mode="application"/);
    assert.match(res.text, /method="post"/i);
    assert.match(res.text, /name="church_name"/);
    assert.match(res.text, /bb-apex-register-form/);
    assert.match(res.text, /bb-apex-register__aside/);
    assert.doesNotMatch(res.text, /href="\/login\?[^"]*register|Redirecting to login/i);
    const after = await repo.countPending(pool);
    assert.equal(after, before);
  });

  it("homepage and pricing CTAs target the canonical registration route", async () => {
    requireDb();
    const app = makeApp();
    const home = await request(app).get("/").set("Host", "blessboard.org");
    assert.equal(home.status, 200);
    assert.match(home.text, /href="\/register-church"/);

    const pricing = await request(app).get("/pricing").set("Host", "blessboard.org");
    assert.equal(pricing.status, 200);
    assert.match(pricing.text, /Register Your Church/);
    assert.match(pricing.text, /href="\/register-church\?plan=foundation"/);
    assert.match(pricing.text, /href="\/register-church\?plan=growth"/);
    assert.match(pricing.text, /href="\/register-church\?plan=network"/);
  });

  it("selected plan query is carried safely; invalid plan falls back", async () => {
    requireDb();
    const app = makeApp();
    const ok = await request(app).get("/register-church?plan=network").set("Host", "blessboard.org");
    assert.equal(ok.status, 200);
    assert.match(ok.text, /<option value="network"[^>]*selected/);

    const bad = await request(app).get("/register-church?plan=enterprise").set("Host", "blessboard.org");
    assert.equal(bad.status, 200);
    assert.doesNotMatch(bad.text, /<option value="enterprise"/);
    assert.match(bad.text, /<option value=""[^>]*selected/);
  });

  it("POST without CSRF is rejected", async () => {
    requireDb();
    const app = makeApp();
    const res = await request(app)
      .post("/register-church")
      .set("Host", "blessboard.org")
      .type("form")
      .send(validBody);
    assert.equal(res.status, 403);
    assert.match(res.text, /CSRF/i);
    const pending = await repo.listApplications(pool, {
      status: "pending",
      limit: 50,
    });
    assert.equal(
      pending.filter((row) => row.contact_email === validBody.email).length,
      0
    );
  });

  it("missing required fields are rejected", async () => {
    requireDb();
    const app = makeApp();
    const { csrf, cookie } = await getRegistrationPage(app);
    const res = await request(app)
      .post("/register-church")
      .set("Host", "blessboard.org")
      .set("Cookie", `${CSRF_COOKIE}=${cookie}`)
      .type("form")
      .send({ [CSRF_FIELD]: csrf, consent_contact: "on" });
    assert.equal(res.status, 400);
    assert.match(res.text, /church name/i);
  });

  it("invalid plan values in the body are rejected", async () => {
    requireDb();
    const app = makeApp();
    const { csrf, cookie } = await getRegistrationPage(app);
    const res = await request(app)
      .post("/register-church")
      .set("Host", "blessboard.org")
      .set("Cookie", `${CSRF_COOKIE}=${cookie}`)
      .type("form")
      .send({ ...validBody, email: "plan-reject@example.org", selected_plan: "enterprise", [CSRF_FIELD]: csrf });
    assert.equal(res.status, 400);
    assert.match(res.text, /valid plan/i);
  });

  it("valid submission creates exactly one pending application and no organization", async () => {
    requireDb();
    const app = makeApp();
    const orgBefore = await repo.countOrganizationsCreatedSince(pool, new Date(0));
    const { csrf, cookie } = await getRegistrationPage(app);
    const email = `valid-submit-${Date.now()}@example.org`;
    const res = await request(app)
      .post("/register-church")
      .set("Host", "blessboard.org")
      .set("Cookie", `${CSRF_COOKIE}=${cookie}`)
      .type("form")
      .send({ ...validBody, email, [CSRF_FIELD]: csrf });
    assert.equal(res.status, 303);
    assert.equal(res.headers.location, "/register-church?submitted=1");

    const rows = await repo.listApplications(pool, { status: "pending", limit: 50 });
    const mine = rows.filter((row) => row.contact_email === email);
    assert.equal(mine.length, 1);
    assert.equal(mine[0].status, "pending");
    assert.equal(mine[0].church_name, validBody.church_name);
    assert.equal(mine[0].selected_plan, "growth");

    const orgAfter = await repo.countOrganizationsCreatedSince(pool, new Date(0));
    assert.equal(orgAfter, orgBefore);

    const success = await request(app)
      .get("/register-church?submitted=1")
      .set("Host", "blessboard.org");
    assert.equal(success.status, 200);
    assert.match(success.text, /pending review/i);
    assert.match(success.text, /data-bb-register-success="1"/);
    assert.doesNotMatch(success.text, /password|SESSION_SECRET|stack trace|sql/i);
    assert.doesNotMatch(success.text, /activated immediately|church is now live/i);
  });

  it("double submission does not create accidental duplicates", async () => {
    requireDb();
    const app = makeApp();
    const email = `dup-submit-${Date.now()}@example.org`;
    const firstPage = await getRegistrationPage(app);
    const first = await request(app)
      .post("/register-church")
      .set("Host", "blessboard.org")
      .set("Cookie", `${CSRF_COOKIE}=${firstPage.cookie}`)
      .type("form")
      .send({ ...validBody, email, [CSRF_FIELD]: firstPage.csrf });
    assert.equal(first.status, 303);

    const secondPage = await getRegistrationPage(app);
    const second = await request(app)
      .post("/register-church")
      .set("Host", "blessboard.org")
      .set("Cookie", `${CSRF_COOKIE}=${secondPage.cookie}`)
      .type("form")
      .send({ ...validBody, email, [CSRF_FIELD]: secondPage.csrf });
    assert.equal(second.status, 303);

    const rows = await repo.listApplications(pool, { status: "pending", limit: 50 });
    assert.equal(rows.filter((row) => row.contact_email === email).length, 1);
  });

  it("registration route is apex-only and not treated as a tenant slug", async () => {
    requireDb();
    const app = makeApp();
    const other = await request(app).get("/register-church").set("Host", "other.example");
    assert.equal(other.status, 404);

    const refresh = await request(app).get("/register-church").set("Host", "blessboard.org");
    assert.equal(refresh.status, 200);
    assert.match(refresh.text, /Register Your Church/);
  });
});
