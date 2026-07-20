"use strict";

/**
 * BB-MT-001 / BB-MT-002 — public apex church-registration on BlessBoard.org.
 * Pending V5 application only; schema-qualified blessboard table; no legacy public tables.
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

let phoneSeq = 0;
function uniquePhone() {
  phoneSeq += 1;
  return `+26097${String(1000000 + phoneSeq).slice(1)}`;
}

function regBody(overrides = {}) {
  return {
    ...validBody,
    phone: uniquePhone(),
    ...overrides,
  };
}

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
        // Enquiry-only suite: disable automatic Foundation provisioning.
        BLESSBOARD_INSTANT_FREE_PROVISIONING_ENABLED: "0",
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
    assert.equal(normalizeSelectedPlan("free"), "foundation");
    assert.equal(normalizeSelectedPlan("basic"), "foundation");
    assert.equal(normalizeSelectedPlan("basic_free"), "foundation");
    assert.equal(normalizeSelectedPlan("enterprise"), null);
    assert.equal(normalizeSelectedPlan("professional"), null);
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
    assert.match(pricing.text, /Foundation — Free|Foundation &mdash; Free/);
  });

  it("Free/Basic plan query aliases select canonical foundation and submit as foundation", async () => {
    requireDb();
    const app = makeApp();
    for (const alias of ["free", "basic", "foundation"]) {
      const page = await request(app)
        .get(`/register-church?plan=${alias}`)
        .set("Host", "blessboard.org");
      assert.equal(page.status, 200, alias);
      assert.match(page.text, /<option value="foundation"[^>]*selected/);
      assert.match(page.text, /Foundation — Free|Foundation &mdash; Free/);
    }

    const { csrf, cookie } = await getRegistrationPage(app, "/register-church?plan=free");
    const email = `free-plan-${Date.now()}@example.org`;
    const churchesBefore = (await pool.query(`SELECT COUNT(*)::int AS n FROM blessboard.churches`)).rows[0].n;
    const branchesBefore = (await pool.query(`SELECT COUNT(*)::int AS n FROM blessboard.branches`)).rows[0].n;
    const usersBefore = (await pool.query(`SELECT COUNT(*)::int AS n FROM blessboard.users`)).rows[0].n;
    const orgsBefore = await repo.countOrganizationsCreatedSince(pool, new Date(0));

    const res = await request(app)
      .post("/register-church")
      .set("Host", "blessboard.org")
      .set("Cookie", `${CSRF_COOKIE}=${cookie}`)
      .type("form")
      .send(regBody({
        church_name: "MANUAL TEST FREE CHURCH",
        contact_name: "MANUAL TEST USER",
        email,
        selected_plan: "free",
        [CSRF_FIELD]: csrf,
      }));
    assert.equal(res.status, 303);
    assert.equal(res.headers.location, "/register-church?submitted=1");
    assert.doesNotMatch(res.headers.location || "", /checkout|payment|stripe/i);

    const rows = await pool.query(
      `SELECT status, selected_plan, church_name, contact_name
         FROM blessboard.platform_church_registration_applications
        WHERE lower(contact_email) = lower($1)`,
      [email]
    );
    assert.equal(rows.rowCount, 1);
    assert.equal(rows.rows[0].status, "pending");
    assert.equal(rows.rows[0].selected_plan, "foundation");
    assert.equal(rows.rows[0].church_name, "MANUAL TEST FREE CHURCH");

    assert.equal(
      (await pool.query(`SELECT COUNT(*)::int AS n FROM blessboard.churches`)).rows[0].n,
      churchesBefore
    );
    assert.equal(
      (await pool.query(`SELECT COUNT(*)::int AS n FROM blessboard.branches`)).rows[0].n,
      branchesBefore
    );
    assert.equal(
      (await pool.query(`SELECT COUNT(*)::int AS n FROM blessboard.users`)).rows[0].n,
      usersBefore
    );
    assert.equal(await repo.countOrganizationsCreatedSince(pool, new Date(0)), orgsBefore);
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
    assert.match(res.text, /security token|CSRF/i);
    assert.match(res.text, /Reload the registration form/i);
    assert.match(res.text, /name="_csrf"[^>]*value="v5c1\./);
    const pending = await repo.listApplications(pool, {
      status: "pending",
      limit: 50,
    });
    assert.equal(
      pending.filter((row) => row.contact_email === validBody.email).length,
      0
    );
  });

  it("GET /register-church sets no-store cache headers and a non-empty CSRF field", async () => {
    requireDb();
    const app = makeApp();
    const res = await request(app).get("/register-church").set("Host", "blessboard.org");
    assert.equal(res.status, 200);
    assert.match(String(res.headers["cache-control"] || ""), /no-store/i);
    assert.match(String(res.headers.vary || ""), /Cookie/i);
    const setCookie = res.headers["set-cookie"];
    const cookieLine = Array.isArray(setCookie) ? setCookie.join(";") : String(setCookie || "");
    assert.match(cookieLine, new RegExp(`${CSRF_COOKIE}=v5c1\\.`));
    assert.match(cookieLine, /Path=\//i);
    assert.match(cookieLine, /SameSite=Lax/i);
    assert.match(res.text, /name="_csrf"\s+value="v5c1\.[^"]+"/);
    assert.match(res.text, /action="\/register-church"/);
    assert.match(res.text, /method="post"/i);
    assert.doesNotMatch(res.text, /action="https?:\/\//i);
  });

  it("body token without matching CSRF cookie is rejected", async () => {
    requireDb();
    const app = makeApp();
    const { csrf } = await getRegistrationPage(app);
    const res = await request(app)
      .post("/register-church")
      .set("Host", "blessboard.org")
      .type("form")
      .send(regBody({ email: `no-cookie-${Date.now()}@example.org`, [CSRF_FIELD]: csrf }));
    assert.equal(res.status, 403);
    assert.match(res.text, /security token|Reload the registration form/i);
  });

  it("token from one CSRF cookie is rejected with a different cookie", async () => {
    requireDb();
    const app = makeApp();
    const first = await getRegistrationPage(app);
    const second = await getRegistrationPage(app);
    const res = await request(app)
      .post("/register-church")
      .set("Host", "blessboard.org")
      .set("Cookie", `${CSRF_COOKIE}=${second.cookie}`)
      .type("form")
      .send(regBody({
        email: `mismatch-${Date.now()}@example.org`,
        [CSRF_FIELD]: first.csrf,
      }));
    assert.equal(res.status, 403);
  });

  it("validation failure rerenders with a fresh usable CSRF pair", async () => {
    requireDb();
    const app = makeApp();
    const { csrf, cookie } = await getRegistrationPage(app);
    const bad = await request(app)
      .post("/register-church")
      .set("Host", "blessboard.org")
      .set("Cookie", `${CSRF_COOKIE}=${cookie}`)
      .type("form")
      .send({ [CSRF_FIELD]: csrf, consent_contact: "on" });
    assert.equal(bad.status, 400);
    const freshCsrf = extractCsrfToken(bad.text);
    const freshCookie = extractCookie(bad, CSRF_COOKIE);
    assert.ok(freshCsrf);
    assert.ok(freshCookie);
    assert.notEqual(freshCsrf, csrf);

    const email = `retry-after-validation-${Date.now()}@example.org`;
    const ok = await request(app)
      .post("/register-church")
      .set("Host", "blessboard.org")
      .set("Cookie", `${CSRF_COOKIE}=${freshCookie}`)
      .type("form")
      .send(regBody({ email, [CSRF_FIELD]: freshCsrf }));
    assert.equal(ok.status, 303);
  });

  it("www.blessboard.org canonicalizes to blessboard.org before the form is issued", async () => {
    requireDb();
    const app = makeApp();
    const res = await request(app)
      .get("/register-church?plan=foundation")
      .set("Host", "www.blessboard.org")
      .set("X-Forwarded-Proto", "https");
    assert.equal(res.status, 301);
    assert.equal(res.headers.location, "https://blessboard.org/register-church?plan=foundation");
    assert.equal(res.headers["set-cookie"], undefined);
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
      .send(regBody({ email: "plan-reject@example.org", selected_plan: "enterprise", [CSRF_FIELD]: csrf }));
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
      .send(regBody({ email, [CSRF_FIELD]: csrf }));
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
      .send(regBody({ email, [CSRF_FIELD]: firstPage.csrf }));
    assert.equal(first.status, 303);

    const secondPage = await getRegistrationPage(app);
    const second = await request(app)
      .post("/register-church")
      .set("Host", "blessboard.org")
      .set("Cookie", `${CSRF_COOKIE}=${secondPage.cookie}`)
      .type("form")
      .send(regBody({ email, [CSRF_FIELD]: secondPage.csrf }));
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

  it("repository SQL targets schema-qualified V5 table and never legacy public relations", () => {
    const source = fs.readFileSync(
      path.join(ROOT, "src/blessboard/repositories/platformChurchRegistrationRepository.js"),
      "utf8"
    );
    assert.equal(repo.TARGET_RELATION, "blessboard.platform_church_registration_applications");
    assert.match(source, /INSERT INTO \$\{TARGET_RELATION\}/);
    assert.match(source, /FROM \$\{TARGET_RELATION\}/);
    // Strip the forbidden-list constant so the guard values themselves are not false positives.
    const withoutGuardList = source.replace(
      /FORBIDDEN_RELATION_FRAGMENTS[\s\S]*?\];/,
      "FORBIDDEN_RELATION_FRAGMENTS = [];"
    );
    for (const fragment of repo.FORBIDDEN_RELATION_FRAGMENTS) {
      assert.equal(
        withoutGuardList.includes(fragment),
        false,
        `must not reference legacy relation fragment: ${fragment}`
      );
    }
    assert.doesNotMatch(withoutGuardList, /INTO\s+public\./i);
    assert.doesNotMatch(withoutGuardList, /FROM\s+public\./i);
  });

  it("migration 026 creates the V5 registration table and is in the ordered catalogue", () => {
    const migrationPath = path.join(
      ROOT,
      "db/migrations/blessboard/026_create_platform_church_registration_applications.sql"
    );
    assert.equal(fs.existsSync(migrationPath), true);
    const sql = fs.readFileSync(migrationPath, "utf8");
    assert.match(sql, /CREATE TABLE IF NOT EXISTS blessboard\.platform_church_registration_applications/);
    assert.doesNotMatch(sql, /public\.church_|CREATE TABLE IF NOT EXISTS public\./i);
    assert.match(sql, /status TEXT NOT NULL DEFAULT 'pending'/);
  });

  it("database insert failure returns a safe user-facing response and surfaces 42P01 in service result", async () => {
    requireDb();
    const app = makeApp();
    const { csrf, cookie } = await getRegistrationPage(app);

    const brokenPool = {
      query: async () => {
        const err = new Error('relation "blessboard.platform_church_registration_applications" does not exist');
        err.code = "42P01";
        err.schema = "blessboard";
        err.table = "platform_church_registration_applications";
        throw err;
      },
    };

    const brokenApp = createV5FoundationApp({
      env: {
        NODE_ENV: "test",
        BLESSBOARD_TENANT_ROUTING_MODE: "off",
        PLATFORM_DEPLOYMENT_CODE: "blessboard-org-v5",
        SESSION_SECRET: "test-session-secret-at-least-32-chars!!",
        SESSION_COOKIE_NAME: DEFAULT_V5_COOKIE,
        BLESSBOARD_INSTANT_FREE_PROVISIONING_ENABLED: "0",
      },
      getPool: () => brokenPool,
    });

    const page = await request(brokenApp).get("/register-church").set("Host", "blessboard.org");
    const brokenCsrf = extractCsrfToken(page.text);
    const brokenCookie = extractCookie(page, CSRF_COOKIE);

    const res = await request(brokenApp)
      .post("/register-church")
      .set("Host", "blessboard.org")
      .set("Cookie", `${CSRF_COOKIE}=${brokenCookie}`)
      .type("form")
      .send(regBody({
        email: `missing-table-${Date.now()}@example.org`,
        [CSRF_FIELD]: brokenCsrf,
      }));

    assert.equal(res.status, 503);
    assert.match(res.text, /could not save your request|try again/i);
    assert.doesNotMatch(res.text, /42P01|platform_church_registration|stack|DATABASE_URL|password/i);

    // Direct service call must not swallow the PG code (operators need it in logs/result).
    const {
      submitPlatformChurchRegistration,
    } = require("../src/blessboard/services/platformChurchRegistrationService");
    const serviceResult = await submitPlatformChurchRegistration(
      brokenPool,
      { requestId: "test-req-42p01", ip: "127.0.0.1", get: () => "test-agent" },
      {
        ok: true,
        data: {
          church_name: "X",
          country: "Zambia",
          city: "Lusaka",
          contact_name: "Y",
          contact_email: "y@example.org",
          contact_phone: "+260971234567",
          role_in_church: "Pastor",
          consent_terms: true,
        },
      }
    );
    assert.equal(serviceResult.ok, false);
    assert.equal(serviceResult.pgCode, "42P01");
    assert.match(serviceResult.error, /try again/i);

    // Control: healthy pool still works with original CSRF from good app (sanity).
    assert.ok(csrf && cookie);
  });

  it("valid insert lands only in blessboard.platform_church_registration_applications", async () => {
    requireDb();
    const app = makeApp();
    const { csrf, cookie } = await getRegistrationPage(app);
    const email = `schema-check-${Date.now()}@example.org`;
    const res = await request(app)
      .post("/register-church")
      .set("Host", "blessboard.org")
      .set("Cookie", `${CSRF_COOKIE}=${cookie}`)
      .type("form")
      .send(regBody({ email, [CSRF_FIELD]: csrf }));
    assert.equal(res.status, 303);

    const inV5 = await pool.query(
      `SELECT COUNT(*)::int AS n
         FROM blessboard.platform_church_registration_applications
        WHERE lower(contact_email) = lower($1)`,
      [email]
    );
    assert.equal(inV5.rows[0].n, 1);

    const legacyGone = await pool.query(
      `SELECT to_regclass('public.church_platform_inquiries') AS a,
              to_regclass('public.church_applications') AS b,
              to_regclass('public.tenants') AS c`
    );
    assert.equal(legacyGone.rows[0].a, null);
    assert.equal(legacyGone.rows[0].b, null);
    assert.equal(legacyGone.rows[0].c, null);

    const churches = await pool.query(`SELECT COUNT(*)::int AS n FROM blessboard.churches`);
    const branches = await pool.query(`SELECT COUNT(*)::int AS n FROM blessboard.branches`);
    const users = await pool.query(`SELECT COUNT(*)::int AS n FROM blessboard.users`);
    assert.equal(churches.rows[0].n, 0);
    assert.equal(branches.rows[0].n, 0);
    assert.equal(users.rows[0].n, 0);
  });
});
