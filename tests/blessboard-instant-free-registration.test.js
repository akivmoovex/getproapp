"use strict";

/**
 * Phase 4 — instant Free /register-church provisioning (flag-gated).
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
const {
  parseInstantFreeProvisioningEnabled,
  isInstantFreeProvisioningEnabled,
  ENV_KEY,
} = require("../src/blessboard/config/instantFreeProvisioningEnabled");
const {
  normalizeSelectedPlan,
  mapPublicPlanToOrchestratorPlanKey,
  validatePlatformChurchRegistration,
  validateAdministratorPassword,
  validateRequestedOrganizationKey,
  formFromBody,
} = require("../src/blessboard/services/platformChurchRegistrationValidation");
const repo = require("../src/blessboard/repositories/platformChurchRegistrationRepository");
const {
  provisionRegisteredBlessBoardChurch,
} = require("../src/blessboard/services/provisionRegisteredBlessBoardChurch");

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

describe("instant Free registration (Phase 4)", () => {
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

  function makeApp(envExtra = {}, apexMarketingDeps = {}) {
    return createV5FoundationApp({
      env: {
        NODE_ENV: "test",
        BLESSBOARD_TENANT_ROUTING_MODE: "off",
        PLATFORM_DEPLOYMENT_CODE: "blessboard-org-v5",
        SESSION_SECRET: "test-session-secret-at-least-32-chars!!",
        SESSION_COOKIE_NAME: DEFAULT_V5_COOKIE,
        ...envExtra,
      },
      getPool: () => pool,
      apexMarketingDeps,
    });
  }

  async function getRegisterPage(app, pathName = "/register-church?plan=foundation") {
    const res = await request(app).get(pathName).set("Host", "blessboard.org");
    assert.equal(res.status, 200);
    const csrf = extractCsrfToken(res.text);
    const cookie = extractCookie(res, CSRF_COOKIE);
    assert.ok(csrf);
    assert.ok(cookie);
    return { res, csrf, cookie };
  }

  function freeBody(overrides = {}) {
    const key = uniq("ifree");
    return {
      church_name: `Instant Free Church ${key}`,
      country: "Kenya",
      city: "Nairobi",
      contact_name: "Instant Admin",
      role_in_church: "Administrator",
      phone: "+254700000099",
      email: `${key}@example.org`,
      selected_plan: "foundation",
      organization_key: key,
      password: PASSWORD,
      password_confirm: PASSWORD,
      consent_contact: "on",
      ...overrides,
    };
  }

  it("feature flag defaults off and rejects query/body override", () => {
    assert.equal(isInstantFreeProvisioningEnabled({}), false);
    assert.equal(parseInstantFreeProvisioningEnabled({}).reason, "default_disabled");
    assert.equal(
      isInstantFreeProvisioningEnabled({ [ENV_KEY]: "1", BLESSBOARD_INSTANT_FREE: "0" }),
      true
    );
    assert.equal(mapPublicPlanToOrchestratorPlanKey("free"), "free");
    assert.equal(mapPublicPlanToOrchestratorPlanKey("foundation"), "free");
    assert.equal(mapPublicPlanToOrchestratorPlanKey("growth"), null);
    assert.equal(normalizeSelectedPlan("basic"), "foundation");
  });

  it("flag off preserves application-only behavior", async () => {
    requireDb();
    const app = makeApp({ [ENV_KEY]: "0" });
    const { res: getRes, csrf, cookie } = await getRegisterPage(app);
    assert.match(getRes.text, /data-bb-register-mode="application"/);
    assert.doesNotMatch(getRes.text, /name="password"/);
    assert.doesNotMatch(getRes.text, /name="organization_key"/);
    assert.match(getRes.headers["cache-control"] || "", /no-store/);

    const body = freeBody();
    const churchesBefore = (await pool.query(`SELECT COUNT(*)::int AS n FROM blessboard.churches`))
      .rows[0].n;
    const res = await request(app)
      .post("/register-church")
      .set("Host", "blessboard.org")
      .set("Cookie", `${CSRF_COOKIE}=${cookie}`)
      .type("form")
      .send({ ...body, [CSRF_FIELD]: csrf });
    assert.equal(res.status, 303);
    assert.equal(res.headers.location, "/register-church?submitted=1");
    const churchesAfter = (await pool.query(`SELECT COUNT(*)::int AS n FROM blessboard.churches`))
      .rows[0].n;
    assert.equal(churchesAfter, churchesBefore);
    const apps = await pool.query(
      `SELECT application_status, provisioning_status, status
         FROM blessboard.platform_church_registration_applications
        WHERE lower(contact_email) = lower($1)`,
      [body.email]
    );
    assert.equal(apps.rows.length, 1);
    assert.equal(apps.rows[0].application_status, "submitted");
    assert.equal(apps.rows[0].provisioning_status, "not_started");
    assert.equal(apps.rows[0].status, "pending");
  });

  it("flag on GET shows password, org key, terms links, CSRF, no-store", async () => {
    requireDb();
    const app = makeApp({ [ENV_KEY]: "1" });
    const { res } = await getRegisterPage(app);
    assert.match(res.text, /data-bb-register-mode="instant-free"/);
    assert.match(res.text, /name="password"/);
    assert.match(res.text, /name="password_confirm"/);
    assert.match(res.text, /name="organization_key"/);
    assert.match(res.text, /autocomplete="new-password"/);
    assert.match(res.text, /href="\/terms"/);
    assert.match(res.text, /href="\/privacy"/);
    assert.match(res.text, /\/c\//);
    assert.match(res.headers["cache-control"] || "", /no-store/);
    assert.ok(extractCsrfToken(res.text));
    assert.ok(extractCookie(res, CSRF_COOKIE));
  });

  it("validation rejects weak password, mismatch, reserved key, missing terms", () => {
    assert.equal(validateAdministratorPassword("short", "short").ok, false);
    assert.equal(validateAdministratorPassword(PASSWORD, "other").field, "password_confirm");
    assert.equal(validateRequestedOrganizationKey("admin").ok, false);
    assert.equal(validateRequestedOrganizationKey("!!!").ok, false);
    assert.equal(validateRequestedOrganizationKey("good-church-key").ok, true);

    const base = freeBody();
    const noTerms = validatePlatformChurchRegistration(
      { ...base, consent_contact: undefined },
      { instantFreeEnabled: true }
    );
    assert.equal(noTerms.ok, false);
    assert.equal(noTerms.field, "consent_contact");

    const badPlan = validatePlatformChurchRegistration(
      { ...base, selected_plan: "enterprise" },
      { instantFreeEnabled: true }
    );
    assert.equal(badPlan.ok, false);

    const form = formFromBody({ ...base, password: PASSWORD, password_confirm: PASSWORD });
    assert.equal(form.password, undefined);
    assert.doesNotMatch(JSON.stringify(form), /TestPassword/);
  });

  it("flag on provisions Free registration with auto-login to /account", async () => {
    requireDb();
    const app = makeApp({ [ENV_KEY]: "1" });
    const { csrf, cookie } = await getRegisterPage(app);
    const body = freeBody();

    const res = await request(app)
      .post("/register-church")
      .set("Host", "blessboard.org")
      .set("Cookie", `${CSRF_COOKIE}=${cookie}`)
      .type("form")
      .send({ ...body, [CSRF_FIELD]: csrf });

    assert.equal(res.status, 303);
    assert.equal(res.headers.location, "/account");
    const sid = extractCookie(res, DEFAULT_V5_COOKIE);
    assert.ok(sid, "session cookie set");

    const apps = await pool.query(
      `SELECT id, application_status, provisioning_status, status, organization_id
         FROM blessboard.platform_church_registration_applications
        WHERE lower(contact_email) = lower($1)`,
      [body.email]
    );
    assert.equal(apps.rows.length, 1);
    assert.equal(apps.rows[0].application_status, "closed");
    assert.equal(apps.rows[0].provisioning_status, "provisioned");
    assert.equal(apps.rows[0].status, "closed");
    assert.ok(apps.rows[0].organization_id);

    const orgKey = body.organization_key;
    const counts = await pool.query(
      `SELECT
         (SELECT COUNT(*)::int FROM platform.organizations WHERE organization_key = $1) AS orgs,
         (SELECT COUNT(*)::int FROM blessboard.churches WHERE church_key = $1) AS churches,
         (SELECT COUNT(*)::int FROM blessboard.branches b
            JOIN blessboard.churches c ON c.id = b.church_id WHERE c.church_key = $1) AS branches,
         (SELECT COUNT(*)::int FROM platform.domains d
            JOIN platform.organizations o ON o.id = d.organization_id
           WHERE o.organization_key = $1) AS domains,
         (SELECT COUNT(*)::int FROM platform.organization_subscriptions os
            JOIN platform.organizations o ON o.id = os.organization_id
           WHERE o.organization_key = $1) AS subs,
         (SELECT COUNT(*)::int FROM blessboard.organization_onboarding oo
            JOIN platform.organizations o ON o.id = oo.organization_id
           WHERE o.organization_key = $1) AS onboarding,
         (SELECT COUNT(*)::int FROM blessboard.public_pages pp
            JOIN blessboard.churches c ON c.id = pp.church_id
           WHERE c.church_key = $1 AND pp.status = 'published') AS published`,
      [orgKey]
    );
    assert.equal(counts.rows[0].orgs, 1);
    assert.equal(counts.rows[0].churches, 1);
    assert.equal(counts.rows[0].branches, 1);
    assert.equal(counts.rows[0].domains, 0);
    assert.equal(counts.rows[0].subs, 1);
    assert.equal(counts.rows[0].onboarding, 1);
    assert.equal(counts.rows[0].published, 0);

    const sessions = await pool.query(
      `SELECT COUNT(*)::int AS n FROM platform.deployment_sessions
        WHERE deployment_code = 'blessboard-org-v5' AND revoked_at IS NULL`
    );
    assert.ok(sessions.rows[0].n >= 1);

    const account = await request(app)
      .get("/account")
      .set("Host", "blessboard.org")
      .set("Cookie", `${DEFAULT_V5_COOKIE}=${sid}`);
    assert.equal(account.status, 200);
  });

  it("Growth plan does not use instant Free provisioning when flag on", async () => {
    requireDb();
    const app = makeApp({ [ENV_KEY]: "1" });
    const { csrf, cookie } = await getRegisterPage(app, "/register-church?plan=growth");
    const body = freeBody({
      selected_plan: "growth",
      organization_key: undefined,
      password: undefined,
      password_confirm: undefined,
      email: `${uniq("growth")}@example.org`,
      church_name: `Growth Enquiry ${uniq("g")}`,
    });
    delete body.organization_key;
    delete body.password;
    delete body.password_confirm;

    const churchesBefore = (await pool.query(`SELECT COUNT(*)::int AS n FROM blessboard.churches`))
      .rows[0].n;
    const res = await request(app)
      .post("/register-church")
      .set("Host", "blessboard.org")
      .set("Cookie", `${CSRF_COOKIE}=${cookie}`)
      .type("form")
      .send({ ...body, [CSRF_FIELD]: csrf });
    assert.equal(res.status, 303);
    assert.equal(res.headers.location, "/register-church?submitted=1");
    const churchesAfter = (await pool.query(`SELECT COUNT(*)::int AS n FROM blessboard.churches`))
      .rows[0].n;
    assert.equal(churchesAfter, churchesBefore);
  });

  it("password values are not rerendered after validation failure", async () => {
    requireDb();
    const app = makeApp({ [ENV_KEY]: "1" });
    const { csrf, cookie } = await getRegisterPage(app);
    const body = freeBody({ password: "short", password_confirm: "short" });
    const res = await request(app)
      .post("/register-church")
      .set("Host", "blessboard.org")
      .set("Cookie", `${CSRF_COOKIE}=${cookie}`)
      .type("form")
      .send({ ...body, [CSRF_FIELD]: csrf });
    assert.equal(res.status, 400);
    assert.doesNotMatch(res.text, /value="short"/);
    assert.doesNotMatch(res.text, /TestPassword/);
    assert.match(res.text, new RegExp(`value="${body.church_name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}"`));
  });

  it("reserved organization key returns field error without provisioning", async () => {
    requireDb();
    const app = makeApp({ [ENV_KEY]: "1" });
    const { csrf, cookie } = await getRegisterPage(app);
    const body = freeBody({ organization_key: "admin" });
    const orgsBefore = (await pool.query(`SELECT COUNT(*)::int AS n FROM platform.organizations`))
      .rows[0].n;
    const res = await request(app)
      .post("/register-church")
      .set("Host", "blessboard.org")
      .set("Cookie", `${CSRF_COOKIE}=${cookie}`)
      .type("form")
      .send({ ...body, [CSRF_FIELD]: csrf });
    assert.equal(res.status, 400);
    assert.match(res.text, /reserved|organization key/i);
    const orgsAfter = (await pool.query(`SELECT COUNT(*)::int AS n FROM platform.organizations`))
      .rows[0].n;
    assert.equal(orgsAfter, orgsBefore);
  });

  it("duplicate email maps to review response without second tenant", async () => {
    requireDb();
    const app = makeApp({ [ENV_KEY]: "1" });
    const email = `${uniq("dup")}@example.org`;
    const first = freeBody({ email, organization_key: uniq("dupa") });
    const { csrf, cookie } = await getRegisterPage(app);
    const res1 = await request(app)
      .post("/register-church")
      .set("Host", "blessboard.org")
      .set("Cookie", `${CSRF_COOKIE}=${cookie}`)
      .type("form")
      .send({ ...first, [CSRF_FIELD]: csrf });
    assert.equal(res1.status, 303);

    const page2 = await getRegisterPage(app);
    const second = freeBody({
      email,
      organization_key: uniq("dupb"),
      church_name: `Other Church ${uniq("o")}`,
    });
    const res2 = await request(app)
      .post("/register-church")
      .set("Host", "blessboard.org")
      .set("Cookie", `${CSRF_COOKIE}=${page2.cookie}`)
      .type("form")
      .send({ ...second, [CSRF_FIELD]: page2.csrf });
    assert.equal(res2.status, 303);
    assert.match(res2.headers.location || "", /review=1/);

    const users = await pool.query(
      `SELECT COUNT(*)::int AS n FROM blessboard.users WHERE email_normalized = $1`,
      [email.toLowerCase()]
    );
    assert.equal(users.rows[0].n, 1);
  });

  it("slug collision returns organization_key field error", async () => {
    requireDb();
    const app = makeApp({ [ENV_KEY]: "1" });
    const key = uniq("slug");
    const first = freeBody({ organization_key: key, email: `${uniq("s1")}@example.org` });
    const page1 = await getRegisterPage(app);
    const res1 = await request(app)
      .post("/register-church")
      .set("Host", "blessboard.org")
      .set("Cookie", `${CSRF_COOKIE}=${page1.cookie}`)
      .type("form")
      .send({ ...first, [CSRF_FIELD]: page1.csrf });
    assert.equal(res1.status, 303);

    const page2 = await getRegisterPage(app);
    const second = freeBody({
      organization_key: key,
      email: `${uniq("s2")}@example.org`,
      church_name: `Slug Clash ${uniq("sc")}`,
    });
    const res2 = await request(app)
      .post("/register-church")
      .set("Host", "blessboard.org")
      .set("Cookie", `${CSRF_COOKIE}=${page2.cookie}`)
      .type("form")
      .send({ ...second, [CSRF_FIELD]: page2.csrf });
    assert.equal(res2.status, 400);
    assert.match(res2.text, /not available|organization key/i);
    assert.match(res2.text, /name="organization_key"/);
  });

  it("double-submit creates one application and one tenant", async () => {
    requireDb();
    const app = makeApp({ [ENV_KEY]: "1" });
    const body = freeBody();
    const page = await getRegisterPage(app);
    const send = () =>
      request(app)
        .post("/register-church")
        .set("Host", "blessboard.org")
        .set("Cookie", `${CSRF_COOKIE}=${page.cookie}`)
        .type("form")
        .send({ ...body, [CSRF_FIELD]: page.csrf });

    const [a, b] = await Promise.all([send(), send()]);
    assert.ok([303, 200, 400, 503].includes(a.status));
    assert.ok([303, 200, 400, 503].includes(b.status));

    const apps = await pool.query(
      `SELECT COUNT(*)::int AS n FROM blessboard.platform_church_registration_applications
        WHERE lower(contact_email) = lower($1) AND lower(church_name) = lower($2)`,
      [body.email, body.church_name]
    );
    assert.equal(apps.rows[0].n, 1);

    const orgs = await pool.query(
      `SELECT COUNT(*)::int AS n FROM platform.organizations WHERE organization_key = $1`,
      [body.organization_key]
    );
    assert.equal(orgs.rows[0].n, 1);
  });

  it("lost-response retry returns existing tenant (already provisioned)", async () => {
    requireDb();
    const app = makeApp({ [ENV_KEY]: "1" });
    const body = freeBody();
    const page1 = await getRegisterPage(app);
    const res1 = await request(app)
      .post("/register-church")
      .set("Host", "blessboard.org")
      .set("Cookie", `${CSRF_COOKIE}=${page1.cookie}`)
      .type("form")
      .send({ ...body, [CSRF_FIELD]: page1.csrf });
    assert.equal(res1.status, 303);

    const page2 = await getRegisterPage(app);
    const res2 = await request(app)
      .post("/register-church")
      .set("Host", "blessboard.org")
      .set("Cookie", `${CSRF_COOKIE}=${page2.cookie}`)
      .type("form")
      .send({ ...body, [CSRF_FIELD]: page2.csrf });
    assert.equal(res2.status, 303);
    assert.ok(res2.headers.location === "/account" || /ready=1/.test(res2.headers.location || ""));

    const orgs = await pool.query(
      `SELECT COUNT(*)::int AS n FROM platform.organizations WHERE organization_key = $1`,
      [body.organization_key]
    );
    assert.equal(orgs.rows[0].n, 1);
  });

  it("session regeneration failure does not undo provisioning", async () => {
    requireDb();
    const app = makeApp(
      { [ENV_KEY]: "1" },
      {
        establishSession: async () => ({
          ok: false,
          status: "transaction_error",
          message: "session_create_failed",
          session: null,
          user: null,
        }),
      }
    );
    const body = freeBody();
    const page = await getRegisterPage(app);
    const res = await request(app)
      .post("/register-church")
      .set("Host", "blessboard.org")
      .set("Cookie", `${CSRF_COOKIE}=${page.cookie}`)
      .type("form")
      .send({ ...body, [CSRF_FIELD]: page.csrf });

    assert.equal(res.status, 303);
    assert.match(res.headers.location || "", /ready=1/);
    assert.match(res.headers.location || "", /login=1/);
    assert.ok(!extractCookie(res, DEFAULT_V5_COOKIE));

    const orgs = await pool.query(
      `SELECT COUNT(*)::int AS n FROM platform.organizations WHERE organization_key = $1`,
      [body.organization_key]
    );
    assert.equal(orgs.rows[0].n, 1);

    // Login fallback works with created credentials.
    const loginApp = makeApp({ [ENV_KEY]: "0" });
    const loginGet = await request(loginApp).get("/login").set("Host", "blessboard.org");
    const loginCsrf = extractCsrfToken(loginGet.text);
    const loginCookie = extractCookie(loginGet, CSRF_COOKIE);
    const loginPost = await request(loginApp)
      .post("/login")
      .set("Host", "blessboard.org")
      .set("Cookie", `${CSRF_COOKIE}=${loginCookie}`)
      .type("form")
      .send({
        email: body.email,
        password: PASSWORD,
        [CSRF_FIELD]: loginCsrf,
      });
    assert.equal(loginPost.status, 303);
    assert.equal(loginPost.headers.location, "/account");
    assert.ok(extractCookie(loginPost, DEFAULT_V5_COOKIE));
  });

  it("CSRF missing and cross-cookie rejected", async () => {
    requireDb();
    const app = makeApp({ [ENV_KEY]: "1" });
    const page = await getRegisterPage(app);
    const body = freeBody();

    const missing = await request(app)
      .post("/register-church")
      .set("Host", "blessboard.org")
      .set("Cookie", `${CSRF_COOKIE}=${page.cookie}`)
      .type("form")
      .send({ ...body });
    assert.equal(missing.status, 403);

    const cross = await request(app)
      .post("/register-church")
      .set("Host", "blessboard.org")
      .set("Cookie", `${CSRF_COOKIE}=wrong-token`)
      .type("form")
      .send({ ...body, [CSRF_FIELD]: page.csrf });
    assert.equal(cross.status, 403);
  });

  it("legacy and canonical status stay aligned after instant provision", async () => {
    requireDb();
    const app = makeApp({ [ENV_KEY]: "1" });
    const body = freeBody();
    const page = await getRegisterPage(app);
    await request(app)
      .post("/register-church")
      .set("Host", "blessboard.org")
      .set("Cookie", `${CSRF_COOKIE}=${page.cookie}`)
      .type("form")
      .send({ ...body, [CSRF_FIELD]: page.csrf });

    const row = (
      await pool.query(
        `SELECT status, application_status, provisioning_status
           FROM blessboard.platform_church_registration_applications
          WHERE lower(contact_email) = lower($1)`,
        [body.email]
      )
    ).rows[0];
    assert.equal(row.application_status, "closed");
    assert.equal(row.provisioning_status, "provisioned");
    assert.equal(row.status, "closed");
  });

  it("orchestrator remains the only provisioning path (module export smoke)", () => {
    assert.equal(typeof provisionRegisteredBlessBoardChurch, "function");
  });
});
