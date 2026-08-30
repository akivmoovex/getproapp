"use strict";

/**
 * Automatic Foundation registration (default on; emergency env disable).
 * Public plan foundation → DB plan free via provisionRegisteredBlessBoardChurch.
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
const { assertChurchReadySuccessRedirect } = require("./helpers/blessboardRegistrationSuccess");
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
  deriveOrganizationKeyFromChurchName,
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

function allocatedKey(body) {
  const derived = deriveOrganizationKeyFromChurchName(body && body.church_name);
  return derived.ok ? derived.value : String((body && body.organization_key) || "");
}

describe("automatic Foundation registration", () => {
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
        PLATFORM_DEPLOYMENT_CODE: "blessboard-org-staging",
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
    const phoneTail = String(1000000 + (Date.now() % 1000000) + Math.floor(Math.random() * 900)).slice(-7);
    return {
      church_name: `Instant Free Church ${key}`,
      country: "Kenya",
      city: "Nairobi",
      contact_name: "Instant Admin",
      role_in_church: "Administrator",
      phone: `+2547${phoneTail}`,
      email: `${key}@example.org`,
      selected_plan: "foundation",
      organization_key: key,
      password: PASSWORD,
      password_confirm: PASSWORD,
      branch_name: "Central Branch",
      consent_contact: "on",
      ...overrides,
    };
  }

  it("defaults to automatic Foundation provisioning when env is unset", () => {
    assert.equal(isInstantFreeProvisioningEnabled({}), true);
    assert.equal(parseInstantFreeProvisioningEnabled({}).reason, "default_enabled");
    assert.equal(isInstantFreeProvisioningEnabled({ [ENV_KEY]: "0" }), false);
    assert.equal(isInstantFreeProvisioningEnabled({ [ENV_KEY]: "false" }), false);
    assert.equal(isInstantFreeProvisioningEnabled({ [ENV_KEY]: "1" }), true);
    assert.equal(isInstantFreeProvisioningEnabled({ [ENV_KEY]: "true" }), true);
    assert.equal(isInstantFreeProvisioningEnabled({ [ENV_KEY]: "maybe" }), false);
    assert.equal(
      isInstantFreeProvisioningEnabled({ [ENV_KEY]: "1", BLESSBOARD_INSTANT_FREE: "0" }),
      true
    );
    assert.equal(mapPublicPlanToOrchestratorPlanKey("free"), "free");
    assert.equal(mapPublicPlanToOrchestratorPlanKey("foundation"), "free");
    assert.equal(mapPublicPlanToOrchestratorPlanKey("growth"), "growth");
    assert.equal(mapPublicPlanToOrchestratorPlanKey("network"), null);
    assert.equal(normalizeSelectedPlan("basic"), "foundation");
  });

  it("explicit false disables automatic provisioning and uses enquiry behavior", async () => {
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
    assert.equal(apps.rows[0].application_status, "review_required");
    assert.equal(apps.rows[0].provisioning_status, "not_started");
    assert.equal(apps.rows[0].status, "pending");
  });

  it("unset env GET shows Foundation password/org fields (default on)", async () => {
    requireDb();
    const app = makeApp({}); // no INSTANT_FREE env → default enabled
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

  it("explicit true still shows instant Foundation fields", async () => {
    requireDb();
    const app = makeApp({ [ENV_KEY]: "1" });
    const { res } = await getRegisterPage(app);
    assert.match(res.text, /data-bb-register-mode="instant-free"/);
    assert.match(res.text, /name="password"/);
    assert.match(res.text, /name="organization_key"/);
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

  it("Foundation provisions automatically with unset env: org, church, HQ branch name, free sub, roles, onboarding, /hq", async () => {
    requireDb();
    const app = makeApp({}); // default enabled — no env var
    const { csrf, cookie } = await getRegisterPage(app);
    const body = freeBody({ branch_name: "  Central   Branch  " });

    const res = await request(app)
      .post("/register-church")
      .set("Host", "blessboard.org")
      .set("Cookie", `${CSRF_COOKIE}=${cookie}`)
      .type("form")
      .send({ ...body, [CSRF_FIELD]: csrf });

    assert.equal(res.status, 303);
    assertChurchReadySuccessRedirect(res.headers.location);
    const sid = extractCookie(res, DEFAULT_V5_COOKIE);
    assert.ok(sid, "session cookie set");

    const apps = await pool.query(
      `SELECT id, application_status, provisioning_status, status, organization_id, branch_name
         FROM blessboard.platform_church_registration_applications
        WHERE lower(contact_email) = lower($1)`,
      [body.email]
    );
    assert.equal(apps.rows.length, 1);
    assert.equal(apps.rows[0].application_status, "active");
    assert.equal(apps.rows[0].provisioning_status, "provisioned");
    assert.equal(apps.rows[0].status, "closed");
    assert.ok(apps.rows[0].organization_id);

    const orgKey = allocatedKey(body);
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
           WHERE c.church_key = $1 AND pp.status = 'published') AS published,
         (SELECT COUNT(*)::int FROM blessboard.public_pages pp
            JOIN blessboard.churches c ON c.id = pp.church_id
           WHERE c.church_key = $1 AND pp.status = 'draft') AS drafts`,
      [orgKey]
    );
    assert.equal(counts.rows[0].orgs, 1);
    assert.equal(counts.rows[0].churches, 1);
    assert.equal(counts.rows[0].branches, 1);
    assert.equal(counts.rows[0].domains, 0);
    assert.equal(counts.rows[0].subs, 1);
    assert.equal(counts.rows[0].onboarding, 1);
    // Foundation registration seeds eight default public pages as drafts.
    assert.equal(counts.rows[0].published, 0);
    assert.equal(counts.rows[0].drafts, 8);

    const branch = await pool.query(
      `SELECT b.branch_key, b.display_name, b.display_name_normalized, b.branch_type, b.is_primary
         FROM blessboard.branches b
         JOIN blessboard.churches c ON c.id = b.church_id
        WHERE c.church_key = $1`,
      [orgKey]
    );
    assert.equal(branch.rowCount, 1);
    assert.equal(branch.rows[0].branch_key, "hq");
    assert.equal(branch.rows[0].branch_type, "hq");
    assert.equal(branch.rows[0].is_primary, true);
    assert.equal(branch.rows[0].display_name, "Central Branch");
    assert.equal(branch.rows[0].display_name_normalized, "central branch");

    const sub = await pool.query(
      `SELECT os.status, os.starts_at, os.ends_at, p.plan_key
         FROM platform.organization_subscriptions os
         JOIN platform.organizations o ON o.id = os.organization_id
         JOIN platform.plans p ON p.id = os.plan_id
        WHERE o.organization_key = $1`,
      [orgKey]
    );
    assert.equal(sub.rowCount, 1);
    assert.equal(sub.rows[0].plan_key, "free");
    assert.equal(sub.rows[0].status, "active");
    assert.equal(sub.rows[0].ends_at, null);
    assert.notEqual(sub.rows[0].status, "trialing");

    const roles = await pool.query(
      `SELECT ur.role_key
         FROM blessboard.user_roles ur
         JOIN blessboard.users u ON u.id = ur.user_id
         JOIN platform.organizations o ON o.id = ur.organization_id
        WHERE o.organization_key = $1
          AND lower(u.email_normalized) = lower($2)
          AND ur.status = 'active'
        ORDER BY ur.role_key`,
      [orgKey, body.email]
    );
    assert.ok(roles.rowCount >= 1);
    const roleKeys = roles.rows.map((r) => r.role_key);
    assert.ok(roleKeys.includes("church_hq_admin"));

    const sessions = await pool.query(
      `SELECT COUNT(*)::int AS n FROM platform.deployment_sessions
        WHERE deployment_code = 'blessboard-org-staging' AND revoked_at IS NULL`
    );
    assert.ok(sessions.rows[0].n >= 1);

    const account = await request(app)
      .get("/account")
      .set("Host", "blessboard.org")
      .set("Cookie", `${DEFAULT_V5_COOKIE}=${sid}`);
    assert.equal(account.status, 200);
  });

  it("explicit true still provisions Foundation", async () => {
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
    assertChurchReadySuccessRedirect(res.headers.location);
    const orgs = await pool.query(
      `SELECT COUNT(*)::int AS n FROM platform.organizations WHERE organization_key = $1`,
      [allocatedKey(body)]
    );
    assert.equal(orgs.rows[0].n, 1);
  });

  it("Growth plan provisions when automatic registration is enabled (Prompt 08)", async () => {
    requireDb();
    const app = makeApp({});
    const { csrf, cookie } = await getRegisterPage(app, "/register-church?plan=growth");
    const body = freeBody({
      selected_plan: "growth",
      email: `${uniq("growth")}@example.org`,
      church_name: `Growth Auto ${uniq("g")}`,
      organization_key: uniq("gauto"),
    });

    const res = await request(app)
      .post("/register-church")
      .set("Host", "blessboard.org")
      .set("Cookie", `${CSRF_COOKIE}=${cookie}`)
      .type("form")
      .send({ ...body, [CSRF_FIELD]: csrf });
    assert.equal(res.status, 303);
    assertChurchReadySuccessRedirect(res.headers.location);
    const orgs = await pool.query(
      `SELECT COUNT(*)::int AS n FROM platform.organizations WHERE organization_key = $1`,
      [allocatedKey(body)]
    );
    assert.equal(orgs.rows[0].n, 1);
    const sub = await pool.query(
      `SELECT os.status, p.plan_key
         FROM platform.organization_subscriptions os
         JOIN platform.organizations o ON o.id = os.organization_id
         JOIN platform.plans p ON p.id = os.plan_id
        WHERE o.organization_key = $1`,
      [allocatedKey(body)]
    );
    assert.equal(sub.rows[0].plan_key, "growth");
    assert.equal(sub.rows[0].status, "trialing");
  });

  it("Network plan does not provision when automatic Foundation/Growth is enabled", async () => {
    requireDb();
    const app = makeApp({});
    const { csrf, cookie } = await getRegisterPage(app, "/register-church?plan=network");
    const body = freeBody({
      selected_plan: "network",
      email: `${uniq("network")}@example.org`,
      church_name: `Network Enquiry ${uniq("n")}`,
    });
    delete body.organization_key;
    delete body.password;
    delete body.password_confirm;

    const churchesBefore = (await pool.query(`SELECT COUNT(*)::int AS n FROM blessboard.churches`))
      .rows[0].n;
    const orgsBefore = (await pool.query(`SELECT COUNT(*)::int AS n FROM platform.organizations`))
      .rows[0].n;
    const res = await request(app)
      .post("/register-church")
      .set("Host", "blessboard.org")
      .set("Cookie", `${CSRF_COOKIE}=${cookie}`)
      .type("form")
      .send({ ...body, [CSRF_FIELD]: csrf });
    assert.equal(res.status, 303);
    assert.equal(res.headers.location, "/register-church?submitted=1&plan=network");
    assert.equal(
      (await pool.query(`SELECT COUNT(*)::int AS n FROM blessboard.churches`)).rows[0].n,
      churchesBefore
    );
    assert.equal(
      (await pool.query(`SELECT COUNT(*)::int AS n FROM platform.organizations`)).rows[0].n,
      orgsBefore
    );
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

  it("reserved church-name slug is escaped to a usable church URL without failing", async () => {
    requireDb();
    const app = makeApp({ [ENV_KEY]: "1" });
    const { csrf, cookie } = await getRegisterPage(app);
    const body = freeBody({
      church_name: "Admin",
      organization_key: "forged-admin-key",
      email: `${uniq("rsv")}@example.org`,
    });
    const res = await request(app)
      .post("/register-church")
      .set("Host", "blessboard.org")
      .set("Cookie", `${CSRF_COOKIE}=${cookie}`)
      .type("form")
      .send({ ...body, [CSRF_FIELD]: csrf });
    assert.equal(res.status, 303);
    assertChurchReadySuccessRedirect(res.headers.location);
    const orgs = await pool.query(
      `SELECT organization_key FROM platform.organizations WHERE organization_key = $1`,
      ["admin-church"]
    );
    assert.equal(orgs.rows.length, 1);
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

  it("slug collision allocates a numeric suffix instead of asking the user for a key", async () => {
    requireDb();
    const app = makeApp({ [ENV_KEY]: "1" });
    const churchName = `Grace Community ${uniq("gc")}`;
    const base = allocatedKey({ church_name: churchName });
    await pool.query(
      `INSERT INTO platform.organizations (organization_key, display_name, status, data_environment)
       VALUES ($1, 'Taken slug holder', 'active', 'testing')`,
      [base]
    );
    const body = freeBody({
      church_name: churchName,
      organization_key: "forged-collision-key",
      email: `${uniq("s2")}@example.org`,
    });
    const page = await getRegisterPage(app);
    const res = await request(app)
      .post("/register-church")
      .set("Host", "blessboard.org")
      .set("Cookie", `${CSRF_COOKIE}=${page.cookie}`)
      .type("form")
      .send({ ...body, [CSRF_FIELD]: page.csrf });
    assert.equal(res.status, 303);
    assertChurchReadySuccessRedirect(res.headers.location);
    const keys = await pool.query(
      `SELECT organization_key FROM platform.organizations
        WHERE organization_key = $1 OR organization_key = $2
        ORDER BY organization_key`,
      [base, `${base}-2`]
    );
    assert.equal(keys.rows.length, 2);
    assert.ok(keys.rows.some((r) => r.organization_key === base));
    assert.ok(keys.rows.some((r) => r.organization_key === `${base}-2`));
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
      [allocatedKey(body)]
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
    assertChurchReadySuccessRedirect(res2.headers.location);

    const orgs = await pool.query(
      `SELECT COUNT(*)::int AS n FROM platform.organizations WHERE organization_key = $1`,
      [allocatedKey(body)]
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
    assertChurchReadySuccessRedirect(res.headers.location);
    assert.ok(!extractCookie(res, DEFAULT_V5_COOKIE));

    const orgs = await pool.query(
      `SELECT COUNT(*)::int AS n FROM platform.organizations WHERE organization_key = $1`,
      [allocatedKey(body)]
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
    assert.equal(loginPost.headers.location, "/hq");
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
    assert.equal(row.application_status, "active");
    assert.equal(row.provisioning_status, "provisioned");
    assert.equal(row.status, "closed");
  });

  it("orchestrator remains the only provisioning path (module export smoke)", () => {
    assert.equal(typeof provisionRegisteredBlessBoardChurch, "function");
  });

  it("provisioning failure rolls back tenant records without partial org", async () => {
    requireDb();
    const app = makeApp(
      {},
      {
        provisionFn: async () => ({
          ok: false,
          status: "provisioning_failed",
          message: "injected_provision_failure",
          alreadyProvisioned: false,
          records: null,
        }),
      }
    );
    const body = freeBody();
    const page = await getRegisterPage(app);
    const orgsBefore = (await pool.query(`SELECT COUNT(*)::int AS n FROM platform.organizations`))
      .rows[0].n;
    const churchesBefore = (await pool.query(`SELECT COUNT(*)::int AS n FROM blessboard.churches`))
      .rows[0].n;
    const res = await request(app)
      .post("/register-church")
      .set("Host", "blessboard.org")
      .set("Cookie", `${CSRF_COOKIE}=${page.cookie}`)
      .type("form")
      .send({ ...body, [CSRF_FIELD]: page.csrf });
    assert.equal(res.status, 503);
    assert.match(res.text, /could not finish creating|try again/i);
    assert.doesNotMatch(res.text, /injected_provision|DATABASE_URL|postgresql:\/\//i);
    assert.doesNotMatch(res.text, /value="TestPassword/);
    assert.equal(
      (await pool.query(`SELECT COUNT(*)::int AS n FROM platform.organizations`)).rows[0].n,
      orgsBefore
    );
    assert.equal(
      (await pool.query(`SELECT COUNT(*)::int AS n FROM blessboard.churches`)).rows[0].n,
      churchesBefore
    );
    assert.equal(
      (
        await pool.query(
          `SELECT COUNT(*)::int AS n FROM platform.organizations WHERE organization_key = $1`,
          [allocatedKey(body)]
        )
      ).rows[0].n,
      0
    );
  });

  it("admin registration-applications, organizations, and subscriptions can retrieve the Foundation result", async () => {
    requireDb();
    const { createBlessBoardUser } = require("../src/blessboard/services/createBlessBoardUser");
    const { assignBlessBoardRole } = require("../src/blessboard/services/assignBlessBoardRole");
    const { createV5Session } = require("../src/platform/session/createV5Session");

    const regApp = makeApp({});
    const body = freeBody();
    const page = await getRegisterPage(regApp);
    const res = await request(regApp)
      .post("/register-church")
      .set("Host", "blessboard.org")
      .set("Cookie", `${CSRF_COOKIE}=${page.cookie}`)
      .type("form")
      .send({ ...body, [CSRF_FIELD]: page.csrf });
    assert.equal(res.status, 303);

    const orgRow = (
      await pool.query(
        `SELECT id FROM platform.organizations WHERE organization_key = $1`,
        [allocatedKey(body)]
      )
    ).rows[0];
    assert.ok(orgRow);

    const paEmail = `${uniq("pa")}@example.org`;
    const paUser = await createBlessBoardUser(pool, {
      email: paEmail,
      displayName: "Auto Foundation PA",
      password: PASSWORD,
    });
    assert.equal(paUser.ok, true, paUser.message);
    const role = await assignBlessBoardRole(pool, {
      email: paEmail,
      organizationKey: allocatedKey(body),
      roleKey: "platform_admin",
    });
    assert.equal(role.ok, true, role.message);

    const session = await createV5Session(pool, {
      userId: paUser.user.id,
      deploymentCode: "blessboard-org-staging",
      organizationId: orgRow.id,
      churchId: null,
      branchId: null,
    });
    assert.equal(session.ok, true, session.message || session.code);
    const adminApp = makeApp({ [ENV_KEY]: "0" });
    const cookie = `${DEFAULT_V5_COOKIE}=${session.rawToken}`;
    const escapedChurch = body.church_name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

    const appsList = await request(adminApp)
      .get("/admin/registration-applications")
      .set("Host", "blessboard.org")
      .set("Cookie", cookie);
    assert.equal(appsList.status, 200);
    assert.match(appsList.text, new RegExp(escapedChurch));

    const orgsList = await request(adminApp)
      .get("/admin/organizations")
      .set("Host", "blessboard.org")
      .set("Cookie", cookie);
    assert.equal(orgsList.status, 200);
    assert.match(orgsList.text, new RegExp(allocatedKey(body)));

    const subsList = await request(adminApp)
      .get("/admin/subscriptions")
      .set("Host", "blessboard.org")
      .set("Cookie", cookie);
    assert.equal(subsList.status, 200);
    assert.match(subsList.text, /free|Foundation/i);
    assert.match(subsList.text, new RegExp(allocatedKey(body)));
  });
});
