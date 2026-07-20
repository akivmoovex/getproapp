"use strict";

/**
 * Prompt 18 — lightweight deterministic registration risk review.
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
const { createV5Session } = require("../src/platform/session/createV5Session");
const { createBlessBoardUser } = require("../src/blessboard/services/createBlessBoardUser");
const { assignBlessBoardRole } = require("../src/blessboard/services/assignBlessBoardRole");
const { provisionRegisteredBlessBoardChurch } = require("../src/blessboard/services/provisionRegisteredBlessBoardChurch");
const appRepo = require("../src/blessboard/repositories/platformChurchRegistrationRepository");
const {
  submitInstantFreeChurchRegistration,
  DUPLICATE_REVIEW_MESSAGE,
  PUBLIC_REJECT_MESSAGE,
} = require("../src/blessboard/services/platformChurchRegistrationService");
const {
  validatePlatformChurchRegistration,
} = require("../src/blessboard/services/platformChurchRegistrationValidation");
const {
  RISK_DECISIONS,
  RISK_REASON_CODES,
  ALLOWED_REASON_CODE_SET,
  filterAllowlistedReasonCodes,
  decideFromReasonCodes,
  hasCountryPhoneMismatch,
  evaluateRegistrationRisk,
  PUBLIC_REVIEW_MESSAGE,
} = require("../src/blessboard/services/registrationRiskDecision");
const {
  approveAndProvisionRegistrationApplication,
  rejectRegistrationApplication,
  getRegistrationApplicationDetail,
} = require("../src/blessboard/services/registrationApplicationsAdminService");

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

describe("registration risk review (Prompt 18)", () => {
  let pool;
  let skipSuite = false;
  let skipReason = "";
  let platformAdmin = null;

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

      const key = uniq("riskpa");
      const email = `${key}@example.org`;
      const user = await createBlessBoardUser(pool, {
        email,
        password: PASSWORD,
        displayName: "Risk Platform Admin",
      });
      assert.equal(user.ok, true, user.message);
      // Bootstrap org so platform_admin role can attach.
      const bootstrapApp = await appRepo.createApplication(pool, {
        church_name: `Risk PA Church ${key}`,
        country: "Kenya",
        city: "Nairobi",
        contact_name: "Risk PA",
        contact_email: `${uniq("riskboot")}@example.org`,
        contact_phone: `+2547${String(Date.now()).slice(-7)}`,
        contact_phone_normalized: `+2547${String(Date.now()).slice(-7)}`,
        role_in_church: "Administrator",
        selected_plan: "foundation",
        consent_terms: true,
      });
      const provisioned = await provisionRegisteredBlessBoardChurch(pool, {
        applicationId: bootstrapApp.id,
        administratorPassword: PASSWORD,
        requestedOrganizationKey: key,
        actorContext: {
          type: "test",
          source: "prompt18",
          dataEnvironment: "testing",
          deploymentCode: "blessboard-org-v5",
        },
      });
      assert.equal(provisioned.ok, true, provisioned.message || provisioned.status);
      assert.equal(
        (
          await assignBlessBoardRole(pool, {
            email,
            organizationKey: provisioned.records.organizationKey,
            roleKey: "platform_admin",
          })
        ).ok,
        true
      );
      platformAdmin = {
        userId: user.user.id,
        email,
        organizationId: provisioned.records.organizationId,
        organizationKey: provisioned.records.organizationKey,
      };
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

  function makeApp(envExtra = {}) {
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
    });
  }

  function freeBody(overrides = {}) {
    const key = uniq("risk");
    const phoneTail = String(1000000 + (Date.now() % 1000000) + Math.floor(Math.random() * 900)).slice(
      -7
    );
    return {
      church_name: `Risk Review Church ${key}`,
      country: "Kenya",
      city: "Nairobi",
      contact_name: "Risk Admin",
      role_in_church: "Administrator",
      phone: `+2547${phoneTail}`,
      email: `${key}@example.org`,
      selected_plan: "foundation",
      organization_key: key,
      password: PASSWORD,
      password_confirm: PASSWORD,
      branch_name: "HQ",
      consent_contact: "on",
      ...overrides,
    };
  }

  function validateBody(body) {
    return validatePlatformChurchRegistration(body, { instantFreeEnabled: true });
  }

  it("reason codes are allowlisted; unknown codes are dropped", () => {
    assert.ok(ALLOWED_REASON_CODE_SET.has(RISK_REASON_CODES.DUPLICATE_PHONE));
    assert.deepEqual(filterAllowlistedReasonCodes(["duplicate_phone", "ai_score", "CLEAN"]), [
      "duplicate_phone",
    ]);
    assert.equal(decideFromReasonCodes(["similar_organization"]), RISK_DECISIONS.REVIEW_REQUIRED);
    assert.equal(decideFromReasonCodes(["duplicate_phone"]), RISK_DECISIONS.REJECT);
    assert.equal(decideFromReasonCodes([]), RISK_DECISIONS.ALLOW);
    assert.equal(hasCountryPhoneMismatch("Kenya", "+254712345678"), false);
    assert.equal(hasCountryPhoneMismatch("Kenya", "+15551234567"), true);
  });

  it("1. clean registration is allowed and provisions", async () => {
    requireDb();
    const body = freeBody();
    const validation = validateBody(body);
    assert.equal(validation.ok, true);
    const result = await submitInstantFreeChurchRegistration(pool, { ip: "203.0.113.10" }, validation, {
      dataEnvironment: "testing",
      deploymentCode: "blessboard-org-v5",
    });
    assert.equal(result.ok, true, result.error || result.code);
    assert.equal(result.riskDecision, RISK_DECISIONS.ALLOW);
    assert.equal(result.provision && result.provision.ok, true);
    const row = await appRepo.findApplicationById(pool, result.application.id);
    assert.equal(row.risk_decision, "allow");
    assert.equal(row.provisioning_status, "provisioned");
    assert.ok(["submitted", "closed"].includes(String(row.application_status)));
    assert.ok(row.organization_id);
  });

  it("2. confirmed duplicate phone is blocked (reject, no provision)", async () => {
    requireDb();
    const phone = `+2547${String(Date.now()).slice(-7)}`;
    const first = freeBody({ phone, email: `${uniq("dup1")}@example.org`, organization_key: uniq("d1") });
    const firstVal = validateBody(first);
    const firstResult = await submitInstantFreeChurchRegistration(pool, { ip: "203.0.113.11" }, firstVal);
    assert.equal(firstResult.ok, true, firstResult.error);

    const second = freeBody({
      phone,
      email: `${uniq("dup2")}@example.org`,
      organization_key: uniq("d2"),
      church_name: `Other Church ${uniq("x")}`,
    });
    const secondVal = validateBody(second);
    const secondResult = await submitInstantFreeChurchRegistration(pool, { ip: "203.0.113.12" }, secondVal);
    assert.equal(secondResult.ok, false);
    assert.equal(secondResult.code, "duplicate_registration_phone");
    assert.equal(secondResult.riskDecision, RISK_DECISIONS.REJECT);
    assert.equal(secondResult.field, "phone");
    assert.doesNotMatch(String(secondResult.error || ""), /risk|fraud|velocity|reason_code/i);
    const churches = await pool.query(
      `SELECT COUNT(*)::int AS n FROM blessboard.churches c
         JOIN platform.organizations o ON o.id = c.organization_id
        WHERE o.organization_key = $1`,
      [second.organization_key]
    );
    assert.equal(churches.rows[0].n, 0);
  });

  it("3. similar organization names alone never auto-reject", async () => {
    requireDb();
    const sharedName = `Same Name Chapel ${uniq("nm")}`;
    const first = freeBody({
      church_name: sharedName,
      city: "Nairobi",
      country: "Kenya",
      email: `${uniq("nm1")}@example.org`,
      organization_key: uniq("nm1"),
    });
    const firstResult = await submitInstantFreeChurchRegistration(
      pool,
      { ip: "203.0.113.20" },
      validateBody(first)
    );
    assert.equal(firstResult.ok, true, firstResult.error);

    // Same name, different city → allow (name alone is not enough for review).
    const second = freeBody({
      church_name: sharedName,
      city: "Mombasa",
      country: "Kenya",
      email: `${uniq("nm2")}@example.org`,
      organization_key: uniq("nm2"),
    });
    const risk = await evaluateRegistrationRisk(pool, {
      data: validateBody(second).data,
      sourceIp: "203.0.113.21",
    });
    assert.notEqual(risk.decision, RISK_DECISIONS.REJECT);
    assert.ok(!risk.reasonCodes.includes(RISK_REASON_CODES.SIMILAR_ORGANIZATION));

    // Same name + city + country → review_required (never reject on this signal).
    const third = freeBody({
      church_name: sharedName,
      city: "Nairobi",
      country: "Kenya",
      email: `${uniq("nm3")}@example.org`,
      organization_key: uniq("nm3"),
    });
    const thirdResult = await submitInstantFreeChurchRegistration(
      pool,
      { ip: "203.0.113.22" },
      validateBody(third)
    );
    assert.equal(thirdResult.ok, false);
    assert.equal(thirdResult.review, true);
    assert.equal(thirdResult.riskDecision, RISK_DECISIONS.REVIEW_REQUIRED);
    assert.ok(thirdResult.riskReasonCodes.includes(RISK_REASON_CODES.SIMILAR_ORGANIZATION));
    assert.equal(thirdResult.error, PUBLIC_REVIEW_MESSAGE);
    const row = await appRepo.findApplicationById(pool, thirdResult.application.id);
    assert.equal(row.application_status, "duplicate_review");
    assert.equal(row.provisioning_status, "not_started");
    assert.equal(row.organization_id, null);
  });

  it("4. review-required application does not provision", async () => {
    requireDb();
    const email = `${uniq("exist")}@example.org`;
    const existing = await createBlessBoardUser(pool, {
      email,
      password: PASSWORD,
      displayName: "Existing User",
    });
    assert.equal(existing.ok, true);

    const body = freeBody({ email, organization_key: uniq("exu") });
    const result = await submitInstantFreeChurchRegistration(
      pool,
      { ip: "203.0.113.30" },
      validateBody(body)
    );
    assert.equal(result.ok, false);
    assert.equal(result.review, true);
    assert.equal(result.code, "review_required");
    assert.ok(result.riskReasonCodes.includes(RISK_REASON_CODES.DUPLICATE_EMAIL));
    const row = await appRepo.findApplicationById(pool, result.application.id);
    assert.equal(row.provisioning_status, "not_started");
    assert.equal(row.organization_id, null);
    assert.equal(row.application_status, "duplicate_review");
  });

  it("5. admin approval provisions once (idempotent)", async () => {
    requireDb();
    const key = uniq("appr");
    const body = freeBody({
      organization_key: key,
      email: `${uniq("appr")}@example.org`,
      church_name: `Approve Me Church ${key}`,
      city: `City-${key}`,
    });
    // Force review via country/phone mismatch without blocking uniqueness.
    const mismatched = {
      ...body,
      country: "Kenya",
      phone: `+1555${String(Date.now()).slice(-7)}`,
    };
    const held = await submitInstantFreeChurchRegistration(
      pool,
      { ip: "203.0.113.40" },
      validateBody(mismatched)
    );
    assert.equal(held.review, true, held.error || held.code);
    assert.equal(held.application.organization_id, null);

    const approved = await approveAndProvisionRegistrationApplication(pool, {
      applicationId: held.application.id,
      actorUserId: platformAdmin.userId,
      administratorPassword: PASSWORD,
      administratorPasswordConfirm: PASSWORD,
      organizationKey: key,
      deploymentCode: "blessboard-org-v5",
      dataEnvironment: "testing",
    });
    assert.equal(approved.ok, true, approved.message || approved.status);
    assert.equal(Boolean(approved.alreadyProvisioned), false);
    assert.ok(approved.records && approved.records.organizationId);

    const again = await approveAndProvisionRegistrationApplication(pool, {
      applicationId: held.application.id,
      actorUserId: platformAdmin.userId,
      administratorPassword: PASSWORD,
      administratorPasswordConfirm: PASSWORD,
      organizationKey: key,
      deploymentCode: "blessboard-org-v5",
    });
    assert.equal(again.ok, true);
    assert.equal(again.alreadyProvisioned, true);

    const audits = await pool.query(
      `SELECT action_key, outcome FROM platform.audit_events
        WHERE organization_id = $1 AND action_key = 'registration.application_approved'`,
      [approved.records.organizationId]
    );
    assert.ok(audits.rows.length >= 1);
  });

  it("6. admin rejection does not provision", async () => {
    requireDb();
    const key = uniq("rej");
    const heldBody = freeBody({
      organization_key: key,
      email: `${uniq("rej")}@example.org`,
      church_name: `Reject Me ${key}`,
      city: `RejectCity-${key}`,
      country: "Zambia",
      phone: `+1555${String(Date.now() + 1).slice(-7)}`,
    });
    const held = await submitInstantFreeChurchRegistration(
      pool,
      { ip: "203.0.113.50" },
      validateBody(heldBody)
    );
    assert.equal(held.review, true);

    const rejected = await rejectRegistrationApplication(pool, {
      applicationId: held.application.id,
      actorUserId: platformAdmin.userId,
      reason: "Unable to verify church leadership details",
    });
    assert.equal(rejected.ok, true);

    const row = await appRepo.findApplicationById(pool, held.application.id);
    assert.equal(row.application_status, "rejected");
    assert.equal(row.organization_id, null);
    assert.equal(row.provisioning_status, "not_started");
    assert.ok(String(row.rejection_reason || "").includes("Unable to verify"));

    const approveAfter = await approveAndProvisionRegistrationApplication(pool, {
      applicationId: held.application.id,
      actorUserId: platformAdmin.userId,
      administratorPassword: PASSWORD,
      administratorPasswordConfirm: PASSWORD,
      organizationKey: key,
    });
    assert.equal(approveAfter.ok, false);
    assert.equal(approveAfter.status, "not_eligible");
  });

  it("7–8. public HTTP responses stay neutral; admin detail shows allowlisted reasons", async () => {
    requireDb();
    const app = makeApp({});
    const shared = `HTTP Similar ${uniq("http")}`;
    const firstBody = freeBody({
      church_name: shared,
      city: "Lusaka",
      country: "Zambia",
      email: `${uniq("http1")}@example.org`,
      organization_key: uniq("http1"),
      phone: `+26097${String(Date.now()).slice(-7)}`,
    });
    const page1 = await request(app).get("/register-church?plan=foundation").set("Host", APEX);
    const csrf1 = extractCsrfToken(page1.text);
    const cookie1 = extractCookie(page1, CSRF_COOKIE);
    const res1 = await request(app)
      .post("/register-church")
      .set("Host", APEX)
      .set("Cookie", `${CSRF_COOKIE}=${cookie1}`)
      .type("form")
      .send({ ...firstBody, [CSRF_FIELD]: csrf1 });
    assert.equal(res1.status, 303);

    const secondBody = freeBody({
      church_name: shared,
      city: "Lusaka",
      country: "Zambia",
      email: `${uniq("http2")}@example.org`,
      organization_key: uniq("http2"),
      phone: `+26096${String(Date.now()).slice(-7)}`,
    });
    const page2 = await request(app).get("/register-church?plan=foundation").set("Host", APEX);
    const csrf2 = extractCsrfToken(page2.text);
    const cookie2 = extractCookie(page2, CSRF_COOKIE);
    const res2 = await request(app)
      .post("/register-church")
      .set("Host", APEX)
      .set("Cookie", `${CSRF_COOKIE}=${cookie2}`)
      .type("form")
      .send({ ...secondBody, [CSRF_FIELD]: csrf2 });
    assert.equal(res2.status, 303);
    assert.equal(res2.headers.location, "/register-church?review=1");
    assert.doesNotMatch(String(res2.headers.location), /similar_organization|risk|fraud/i);

    const reviewPage = await request(app)
      .get("/register-church?review=1")
      .set("Host", APEX);
    assert.equal(reviewPage.status, 200);
    assert.match(reviewPage.text, /short review|BlessBoard will assist/i);
    assert.doesNotMatch(reviewPage.text, /similar_organization|ip_velocity|risk_decision|fraud score/i);

    const held = await pool.query(
      `SELECT id FROM blessboard.platform_church_registration_applications
        WHERE lower(contact_email) = lower($1)`,
      [secondBody.email]
    );
    const detail = await getRegistrationApplicationDetail(pool, held.rows[0].id);
    assert.equal(detail.ok, true);
    assert.ok(detail.application.riskReasonLabels.some((r) => r.code === "similar_organization"));
    assert.match(detail.application.riskReasonLabels[0].label, /Organization name matches/i);
  });

  it("9–10. authorization and CSRF protect review mutations; audit on approve", async () => {
    requireDb();
    const app = makeApp({});
    const key = uniq("csrf");
    const heldBody = freeBody({
      organization_key: key,
      email: `${uniq("csrf")}@example.org`,
      church_name: `CSRF Hold ${key}`,
      city: `CsrfCity-${key}`,
      country: "Kenya",
      phone: `+1444${String(Date.now()).slice(-7)}`,
    });
    const held = await submitInstantFreeChurchRegistration(
      pool,
      { ip: "203.0.113.60" },
      validateBody(heldBody)
    );
    assert.equal(held.review, true);

    // Unauthenticated → redirect away from admin.
    const unauth = await request(app)
      .post(`/admin/registration-applications/${held.application.id}/reject`)
      .set("Host", APEX)
      .type("form")
      .send({ rejection_reason: "nope", [CSRF_FIELD]: "bad" });
    assert.ok([302, 303, 401, 403].includes(unauth.status));

    const session = await createV5Session(pool, {
      userId: platformAdmin.userId,
      deploymentCode: "blessboard-org-v5",
      organizationId: platformAdmin.organizationId,
      churchId: null,
      branchId: null,
    });
    assert.equal(session.ok, true);
    const cookie = `${DEFAULT_V5_COOKIE}=${session.rawToken}`;

    const detailGet = await request(app)
      .get(`/admin/registration-applications/${held.application.id}`)
      .set("Host", APEX)
      .set("Cookie", cookie);
    assert.equal(detailGet.status, 200);
    assert.match(detailGet.text, /data-bb-pa-approve-form="1"/);
    assert.match(detailGet.text, /data-bb-pa-reject-form="1"/);
    const csrfCookie = extractCookie(detailGet, CSRF_COOKIE);
    const csrf = extractCsrfToken(detailGet.text);

    const badCsrf = await request(app)
      .post(`/admin/registration-applications/${held.application.id}/reject`)
      .set("Host", APEX)
      .set("Cookie", `${cookie}; ${CSRF_COOKIE}=${csrfCookie}`)
      .type("form")
      .send({ rejection_reason: "Should fail CSRF", [CSRF_FIELD]: "not-valid" });
    assert.equal(badCsrf.status, 303);
    assert.match(String(badCsrf.headers.location), /error=csrf/);

    const rejectOk = await request(app)
      .post(`/admin/registration-applications/${held.application.id}/reject`)
      .set("Host", APEX)
      .set("Cookie", `${cookie}; ${CSRF_COOKIE}=${csrfCookie}`)
      .type("form")
      .send({ rejection_reason: "Operator rejection after review", [CSRF_FIELD]: csrf });
    assert.equal(rejectOk.status, 303);
    assert.match(String(rejectOk.headers.location), /notice=rejected/);

    const row = await appRepo.findApplicationById(pool, held.application.id);
    assert.equal(row.application_status, "rejected");
    assert.ok(Array.isArray(row.review_events));
    assert.ok(row.review_events.some((e) => e && e.action === "reject"));
  });

  it("public reject message does not expose risk logic", async () => {
    assert.equal(PUBLIC_REJECT_MESSAGE.includes("fraud"), false);
    assert.equal(PUBLIC_REJECT_MESSAGE.includes("risk"), false);
    assert.equal(DUPLICATE_REVIEW_MESSAGE, PUBLIC_REVIEW_MESSAGE);
  });
});
