"use strict";

/**
 * BlessBoard V1 registration review matrix:
 * Foundation/Growth auto-provision; URL collisions suffix; retries are idempotent;
 * Network and genuine risk/kill-switch holds remain exceptional.
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
  ENV_KEY,
} = require("../src/blessboard/config/instantFreeProvisioningEnabled");
const {
  deriveOrganizationKeyFromChurchName,
} = require("../src/blessboard/services/platformChurchRegistrationValidation");
const {
  decideReview,
  REVIEW_REASON,
} = require("../src/platform/registration");
const {
  evaluateRegistrationRisk,
  RISK_DECISIONS,
  RISK_REASON_CODES,
} = require("../src/blessboard/services/registrationRiskDecision");
const appRepo = require("../src/blessboard/repositories/platformChurchRegistrationRepository");
const { createBlessBoardUser } = require("../src/blessboard/services/createBlessBoardUser");

const IDENTITY_KEY = "blessboard-platform-v5";
const PASSWORD = "TestPassword99!";
const APEX = "blessboard.org";

function uniq(prefix) {
  return `${prefix}-${crypto.randomBytes(3).toString("hex")}`;
}

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

describe("BlessBoard V1 registration review matrix", () => {
  let pool;
  let skipSuite = false;
  let skipReason = "";

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
    } catch (err) {
      skipSuite = true;
      skipReason = err && err.message ? String(err.message) : String(err);
    }
  });

  after(async () => {
    if (pool) await pool.end().catch(() => {});
  });

  function requireDb() {
    if (skipSuite) assert.fail(`Local PostgreSQL unavailable: ${skipReason}`);
  }

  function makeApp(envExtra = {}) {
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
    });
  }

  async function getRegisterPage(app, pathName = "/register-church?plan=foundation") {
    const res = await request(app).get(pathName).set("Host", APEX);
    assert.equal(res.status, 200);
    const csrf = extractCsrfToken(res.text);
    const cookie = extractCookie(res, CSRF_COOKIE);
    assert.ok(csrf && cookie);
    return { res, csrf, cookie };
  }

  function formBody(overrides = {}) {
    const stamp = uniq("mx");
    const phoneTail = String(1000000 + Math.floor(Math.random() * 8000000)).slice(-7);
    return {
      church_name: `Matrix Chapel ${stamp}`,
      country: "ZM",
      city: "Kitwe",
      contact_name: "Matrix Admin",
      role_in_church: "Pastor",
      phone_country: "ZM",
      phone_national: phoneTail,
      email: `${stamp}@example.org`,
      selected_plan: "foundation",
      password: PASSWORD,
      password_confirm: PASSWORD,
      consent_contact: "on",
      ...overrides,
    };
  }

  async function postRegister(app, body, plan = "foundation") {
    const page = await getRegisterPage(app, `/register-church?plan=${plan}`);
    return request(app)
      .post("/register-church")
      .set("Host", APEX)
      .set("Cookie", `${CSRF_COOKIE}=${page.cookie}`)
      .type("form")
      .send({ ...body, [CSRF_FIELD]: page.csrf });
  }

  it("Foundation fresh registration → instant success", async () => {
    requireDb();
    const app = makeApp();
    const body = formBody({ selected_plan: "foundation" });
    const res = await postRegister(app, body);
    assert.equal(res.status, 303);
    assertChurchReadySuccessRedirect(res.headers.location);
    assert.ok(extractCookie(res, DEFAULT_V5_COOKIE));
  });

  it("Growth fresh registration → instant success", async () => {
    requireDb();
    const app = makeApp();
    const body = formBody({ selected_plan: "growth", city: "Livingstone" });
    const res = await postRegister(app, body, "growth");
    assert.equal(res.status, 303);
    assertChurchReadySuccessRedirect(res.headers.location);
  });

  it("URL collision suffixes the key and still auto-provisions", async () => {
    requireDb();
    const app = makeApp();
    const churchName = `Hope Valley Assembly ${uniq("hv")}`;
    const base = deriveOrganizationKeyFromChurchName(churchName);
    assert.equal(base.ok, true);
    const first = await postRegister(
      app,
      formBody({ church_name: churchName, country: "ZM", city: "Chipata" })
    );
    assert.equal(first.status, 303);
    assertChurchReadySuccessRedirect(first.headers.location);

    const second = await postRegister(
      app,
      formBody({ church_name: churchName, country: "KE", city: "Kisumu" })
    );
    assert.equal(second.status, 303, second.text && String(second.text).slice(0, 400));
    assertChurchReadySuccessRedirect(second.headers.location);
    assert.doesNotMatch(String(second.headers.location || ""), /review=1/);

    const keys = await pool.query(
      `SELECT organization_key FROM platform.organizations
        WHERE organization_key = $1 OR organization_key = $2
        ORDER BY organization_key`,
      [base.value, `${base.value}-2`]
    );
    assert.equal(keys.rows.length, 2);
    assert.ok(keys.rows.some((r) => r.organization_key === base.value));
    assert.ok(keys.rows.some((r) => r.organization_key === `${base.value}-2`));
  });

  it("same request retry is idempotent (one church, success redirect)", async () => {
    requireDb();
    const app = makeApp();
    const body = formBody({ city: "Mansa" });
    const first = await postRegister(app, body);
    assert.equal(first.status, 303);
    assertChurchReadySuccessRedirect(first.headers.location);

    const retry = await postRegister(app, body);
    assert.equal(retry.status, 303);
    assertChurchReadySuccessRedirect(retry.headers.location);
    assert.doesNotMatch(String(retry.headers.location || ""), /review=1/);

    const apps = await pool.query(
      `SELECT COUNT(*)::int AS n FROM blessboard.platform_church_registration_applications
        WHERE lower(contact_email) = lower($1)`,
      [body.email]
    );
    assert.equal(apps.rows[0].n, 1);
    const derived = deriveOrganizationKeyFromChurchName(body.church_name);
    const orgs = await pool.query(
      `SELECT COUNT(*)::int AS n FROM platform.organizations WHERE organization_key = $1`,
      [derived.value]
    );
    assert.equal(orgs.rows[0].n, 1);
  });

  it("Network remains enquiry/review according to current product rule", async () => {
    requireDb();
    const app = makeApp();
    const body = formBody({ selected_plan: "network" });
    delete body.password;
    delete body.password_confirm;
    const res = await postRegister(app, body, "network");
    assert.equal(res.status, 303);
    assert.match(String(res.headers.location), /submitted=1/);
    assert.match(String(res.headers.location), /plan=network/);
    assert.doesNotMatch(String(res.headers.location), /ready=1/);
    const decision = decideReview({
      signals: { networkPlan: true, provisioningEnabled: true },
    });
    assert.equal(decision.reviewRequired, true);
    assert.equal(decision.reason, REVIEW_REASON.NETWORK_PLAN_MANUAL_REVIEW);
  });

  it("real risk hold (prior rejection) remains review", async () => {
    requireDb();
    const app = makeApp();
    const email = `${uniq("risk")}@example.org`;
    const prior = await appRepo.createApplication(pool, {
      church_name: `Prior Reject ${uniq("pr")}`,
      country: "ZM",
      city: "Kabwe",
      contact_name: "Prior",
      contact_email: email,
      contact_phone: `+26097${String(Date.now()).slice(-7)}`,
      contact_phone_normalized: `+26097${String(Date.now()).slice(-7)}`,
      role_in_church: "Pastor",
      selected_plan: "foundation",
      consent_terms: true,
    });
    await pool.query(
      `UPDATE blessboard.platform_church_registration_applications
          SET application_status = 'rejected'
        WHERE id = $1`,
      [prior.id]
    );

    const res = await postRegister(app, formBody({ email, city: "Solwezi" }));
    assert.equal(res.status, 303);
    assert.equal(res.headers.location, "/register-church?review=1");
  });

  it("kill switch disabled → no auto-provision", async () => {
    requireDb();
    const app = makeApp({ [ENV_KEY]: "0" });
    const body = formBody({ city: "Kasama" });
    const res = await postRegister(app, body);
    assert.equal(res.status, 303);
    assert.match(String(res.headers.location), /submitted=1|review=1/);
    assert.doesNotMatch(String(res.headers.location || ""), /\/register-church\/success/);
    const orgs = await pool.query(
      `SELECT COUNT(*)::int AS n FROM platform.organizations o
         JOIN blessboard.platform_church_registration_applications a ON a.organization_id = o.id
        WHERE lower(a.contact_email) = lower($1)`,
      [body.email]
    );
    assert.equal(orgs.rows[0].n, 0);
  });

  it("new admin cannot access another church", async () => {
    requireDb();
    const app = makeApp();
    const first = formBody({ church_name: `Tenant A ${uniq("ta")}`, city: "Mongu" });
    const second = formBody({ church_name: `Tenant B ${uniq("tb")}`, city: "Senanga" });
    const resA = await postRegister(app, first);
    const resB = await postRegister(app, second);
    assertChurchReadySuccessRedirect(resA.headers.location);
    assertChurchReadySuccessRedirect(resB.headers.location);

    const rows = await pool.query(
      `SELECT a.contact_email, a.organization_id, u.id AS user_id
         FROM blessboard.platform_church_registration_applications a
         JOIN blessboard.users u ON u.email_normalized = lower(a.contact_email)
        WHERE lower(a.contact_email) IN ($1, $2)`,
      [first.email.toLowerCase(), second.email.toLowerCase()]
    );
    assert.equal(rows.rows.length, 2);
    const orgA = rows.rows.find((r) => r.contact_email.toLowerCase() === first.email.toLowerCase());
    const orgB = rows.rows.find((r) => r.contact_email.toLowerCase() === second.email.toLowerCase());
    assert.notEqual(orgA.organization_id, orgB.organization_id);

    const cross = await pool.query(
      `SELECT COUNT(*)::int AS n FROM blessboard.user_roles
        WHERE user_id = $1 AND organization_id = $2 AND status = 'active'`,
      [orgA.user_id, orgB.organization_id]
    );
    assert.equal(cross.rows[0].n, 0);

    const sidA = extractCookie(resA, DEFAULT_V5_COOKIE);
    const hqA = await request(app).get("/hq").set("Host", APEX).set("Cookie", `${DEFAULT_V5_COOKIE}=${sidA}`);
    assert.ok([200, 303, 302].includes(hqA.status));
    if (hqA.status === 200) {
      assert.doesNotMatch(hqA.text, new RegExp(second.church_name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
    }
  });

  it("existing user with another church is sign-in, not Platform Admin review", async () => {
    requireDb();
    const app = makeApp();
    const email = `${uniq("exch")}@example.org`;
    const first = await postRegister(app, formBody({ email, city: "Choma" }));
    assertChurchReadySuccessRedirect(first.headers.location);
    const second = await postRegister(
      app,
      formBody({ email, church_name: `Other Parish ${uniq("op")}`, city: "Mazabuka" })
    );
    assert.equal(second.status, 400);
    assert.match(second.text, /already exists|Sign in/i);
    assert.doesNotMatch(String(second.headers.location || ""), /review=1/);
  });

  it("orphan user with matching password auto-provisions", async () => {
    requireDb();
    const app = makeApp();
    const email = `${uniq("orph")}@example.org`;
    const created = await createBlessBoardUser(pool, {
      email,
      password: PASSWORD,
      displayName: "Orphan Admin",
    });
    assert.equal(created.ok, true);
    const res = await postRegister(app, formBody({ email, city: "Petauke" }));
    assert.equal(res.status, 303);
    assertChurchReadySuccessRedirect(res.headers.location);
  });

  it("duplicate_email / similar_organization / country mismatch are not review reasons", async () => {
    requireDb();
    const email = decideReview({ signals: { provisioningEnabled: true } });
    assert.equal(email.autoProvision, true);
    const risk = await evaluateRegistrationRisk(pool, {
      data: {
        church_name: "Any Chapel",
        city: "Lusaka",
        country: "ZM",
        contact_email: `${uniq("nors")}@example.org`,
        contact_phone_normalized: "+260971234567",
      },
      sourceIp: "127.0.0.1",
    });
    assert.equal(risk.decision, RISK_DECISIONS.ALLOW);
    assert.equal(risk.reasonCodes.includes(RISK_REASON_CODES.DUPLICATE_EMAIL), false);
    assert.equal(risk.reasonCodes.includes(RISK_REASON_CODES.SIMILAR_ORGANIZATION), false);
    assert.equal(risk.reasonCodes.includes(RISK_REASON_CODES.COUNTRY_PHONE_MISMATCH), false);
  });
});
