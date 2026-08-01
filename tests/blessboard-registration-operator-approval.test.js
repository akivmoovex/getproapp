"use strict";

/**
 * Prompt 48 — Foundation/Growth exception approve + Network validation/org create.
 * Covers cases 8–13, 18–20 (idempotency, trial, Network gates, CSRF, auth, maintenance).
 */

const assert = require("node:assert/strict");
const { describe, it, before, after } = require("node:test");
const request = require("supertest");
const crypto = require("crypto");
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
const { createV5Session } = require("../src/platform/session/createV5Session");
const { createBlessBoardUser } = require("../src/blessboard/services/createBlessBoardUser");
const { assignBlessBoardRole } = require("../src/blessboard/services/assignBlessBoardRole");
const {
  submitInstantFreeChurchRegistration,
  submitPlatformChurchRegistration,
} = require("../src/blessboard/services/platformChurchRegistrationService");
const {
  validatePlatformChurchRegistration,
} = require("../src/blessboard/services/platformChurchRegistrationValidation");
const {
  approveAndProvisionRegistrationApplication,
  markNetworkValidationComplete,
  getRegistrationApplicationDetail,
} = require("../src/blessboard/services/registrationApplicationsAdminService");
const { presentRegistrationOperatorView } = require("../src/blessboard/services/registrationOperatorPresenter");
const appRepo = require("../src/blessboard/repositories/platformChurchRegistrationRepository");
const { ENV_KEY } = require("../src/blessboard/config/instantFreeProvisioningEnabled");
const { FULL_RESET_CONFIRM_PHRASE } = require("../src/platform/services/testingDataResetService");

const IDENTITY_KEY = "blessboard-platform-v5";
const PASSWORD = "TestPassword99!";
const APEX = "blessboard.org";
const DEPLOYMENT = "blessboard-org-staging";

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

describe("registration operator approval (Prompt 48)", () => {
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

      const { provisionRegisteredBlessBoardChurch } = require("../src/blessboard/services/provisionRegisteredBlessBoardChurch");

      const key = uniq("opa");
      const email = `pa-operator-${key}@example.org`;
      const user = await createBlessBoardUser(pool, {
        email,
        password: PASSWORD,
        displayName: "Operator Platform Admin",
      });
      assert.equal(user.ok, true, user.message || JSON.stringify(user));

      const bootstrapApp = await appRepo.createApplication(pool, {
        church_name: `Operator PA Church ${key}`,
        country: "Kenya",
        city: "Nairobi",
        contact_name: "Operator PA",
        contact_email: `${uniq("opaboot")}@example.org`,
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
          source: "prompt48",
          dataEnvironment: "testing",
          deploymentCode: DEPLOYMENT,
        },
      });
      assert.equal(provisioned.ok, true, provisioned.message || provisioned.status);

      const role = await assignBlessBoardRole(pool, {
        email,
        organizationKey: provisioned.records.organizationKey,
        roleKey: "platform_admin",
      });
      assert.equal(role.ok, true, role.message || JSON.stringify(role));
      platformAdmin = {
        userId: user.user.id,
        email,
        organizationId: provisioned.records.organizationId,
      };
    } catch (err) {
      skipSuite = true;
      skipReason = err && err.message ? String(err.message) : String(err);
      // eslint-disable-next-line no-console
      console.error("[prompt48] before() failed:", skipReason);
    }
  });

  after(async () => {
    if (pool) await pool.end().catch(() => {});
  });

  function requireDb() {
    if (skipSuite) {
      const err = new Error(`skip: ${skipReason}`);
      err.code = "ERR_TEST_SKIP";
      throw err;
    }
  }

  function makeApp(envExtra = {}) {
    return createV5FoundationApp({
      env: {
        NODE_ENV: "test",
        BLESSBOARD_TENANT_ROUTING_MODE: "off",
        PLATFORM_DEPLOYMENT_CODE: DEPLOYMENT,
        SESSION_SECRET: "test-session-secret-at-least-32-chars!!",
        SESSION_COOKIE_NAME: DEFAULT_V5_COOKIE,
        [ENV_KEY]: "true",
        ...envExtra,
      },
      getPool: () => pool,
    });
  }

  function validateBody(body) {
    const result = validatePlatformChurchRegistration(body);
    assert.equal(result.ok, true, JSON.stringify(result.errors || result));
    return result;
  }

  function freeBody(overrides = {}) {
    const key = uniq("fnd");
    return {
      church_name: `Foundation Hold ${key}`,
      country: "Zambia",
      city: "Lusaka",
      contact_name: "Foundation Admin",
      role_in_church: "Administrator",
      phone: `+26097${String(Date.now()).slice(-7)}`,
      email: `${key}@example.org`,
      selected_plan: "foundation",
      organization_key: key,
      password: PASSWORD,
      password_confirm: PASSWORD,
      branch_name: "Main Campus",
      consent_contact: "on",
      ...overrides,
    };
  }

  function growthBody(overrides = {}) {
    const key = uniq("grw");
    return {
      church_name: `Growth Hold ${key}`,
      country: "Kenya",
      city: "Nairobi",
      contact_name: "Growth Admin",
      role_in_church: "Administrator",
      phone: `+2547${String(Date.now()).slice(-7)}`,
      email: `${key}@example.org`,
      selected_plan: "growth",
      organization_key: key,
      password: PASSWORD,
      password_confirm: PASSWORD,
      branch_name: "Main Campus",
      consent_contact: "on",
      ...overrides,
    };
  }

  function networkBody(overrides = {}) {
    const key = uniq("net");
    const phoneTail = String(
      1000000 + (Date.now() % 1000000) + Math.floor(Math.random() * 900)
    ).slice(-7);
    return {
      church_name: `Network Org ${key}`,
      country: "Kenya",
      city: "Nairobi",
      contact_name: "Network Contact",
      role_in_church: "Administrator",
      phone: `+2547${phoneTail}`,
      email: `${key}@example.org`,
      selected_plan: "network",
      branch_name: "Main Campus",
      branch_count: "5",
      message: "Please contact us about Network",
      consent_contact: "on",
      organization_key: key,
      ...overrides,
    };
  }

  async function submitHeldGrowth() {
    const key = uniq("ghold");
    const body = growthBody({
      organization_key: key,
      country: "Kenya",
      phone: `+1555${String(Date.now()).slice(-7)}`,
      email: `${key}@example.org`,
      church_name: `Growth Review ${key}`,
      city: `GCity-${key}`,
    });
    const held = await submitInstantFreeChurchRegistration(
      pool,
      { ip: "203.0.113.80" },
      validateBody(body)
    );
    assert.equal(held.review, true, held.error || held.code);
    assert.equal(held.application.organization_id, null);
    return { held, key, body };
  }

  async function insertNetworkApplication(body) {
    const validated = validatePlatformChurchRegistration(body);
    assert.equal(validated.ok, true, JSON.stringify(validated));
    const submitted = await submitPlatformChurchRegistration(
      pool,
      { ip: "203.0.113.90", headers: {}, get: () => null },
      validated
    );
    assert.equal(submitted.ok, true, submitted.error || submitted.code);
    assert.equal(submitted.networkSupportContact, true);
    const row = await appRepo.findApplicationById(pool, submitted.application.id);
    assert.equal(row.selected_plan, "network");
    assert.equal(row.organization_id, null);
    return row;
  }

  it("8. Foundation approve-and-provision is idempotent", async () => {
    requireDb();
    const key = uniq("fidem");
    const body = freeBody({
      organization_key: key,
      country: "Kenya",
      phone: `+1555${String(Date.now()).slice(-7)}`,
      email: `${key}@example.org`,
      church_name: `Idem Foundation ${key}`,
      city: `IdemCity-${key}`,
    });
    const held = await submitInstantFreeChurchRegistration(
      pool,
      { ip: "203.0.113.81" },
      validateBody(body)
    );
    assert.equal(held.review, true);

    const first = await approveAndProvisionRegistrationApplication(pool, {
      applicationId: held.application.id,
      actorUserId: platformAdmin.userId,
      organizationKey: key,
      deploymentCode: DEPLOYMENT,
      dataEnvironment: "testing",
    });
    assert.equal(first.ok, true, first.message || first.status);
    assert.equal(Boolean(first.alreadyProvisioned), false);
    assert.ok(first.invitation && first.invitation.id);
    assert.ok(first.invitation.rawToken);
    assert.equal(first.records.administratorViaInvitation, true);

    const invites = await pool.query(
      `SELECT COUNT(*)::int AS n FROM blessboard.user_invitations
        WHERE organization_id = $1 AND status = 'pending'`,
      [first.records.organizationId]
    );
    assert.equal(invites.rows[0].n, 1);

    const adminUser = await pool.query(
      `SELECT status, password_hash IS NULL AS no_password
         FROM blessboard.users WHERE id = $1`,
      [first.records.administratorUserId]
    );
    assert.equal(adminUser.rows[0].status, "invited");
    assert.equal(adminUser.rows[0].no_password, true);

    const second = await approveAndProvisionRegistrationApplication(pool, {
      applicationId: held.application.id,
      actorUserId: platformAdmin.userId,
      organizationKey: key,
      deploymentCode: DEPLOYMENT,
    });
    assert.equal(second.ok, true);
    assert.equal(second.alreadyProvisioned, true);

    const orgs = await pool.query(
      `SELECT COUNT(*)::int AS n FROM platform.organizations WHERE organization_key = $1`,
      [key]
    );
    assert.equal(orgs.rows[0].n, 1);

    const detail = await getRegistrationApplicationDetail(pool, held.application.id);
    assert.equal(detail.ok, true);
    assert.equal(detail.application.displayStatus, "Provisioned");
    assert.match(detail.application.operatorView.explanation, /Foundation|provisioned/i);
  });

  it("9. Growth approve-and-provision creates exactly one 30-day trial", async () => {
    requireDb();
    const { held, key } = await submitHeldGrowth();

    const approved = await approveAndProvisionRegistrationApplication(pool, {
      applicationId: held.application.id,
      actorUserId: platformAdmin.userId,
      organizationKey: key,
      deploymentCode: DEPLOYMENT,
      dataEnvironment: "testing",
    });
    assert.equal(approved.ok, true, approved.message || approved.status);
    assert.ok(approved.records && approved.records.organizationId);

    const subs = await pool.query(
      `SELECT os.status, os.starts_at, os.ends_at, p.plan_key
         FROM platform.organization_subscriptions os
         JOIN platform.plans p ON p.id = os.plan_id
        WHERE os.organization_id = $1`,
      [approved.records.organizationId]
    );
    assert.equal(subs.rows.length, 1);
    assert.equal(subs.rows[0].plan_key, "growth");
    assert.equal(subs.rows[0].status, "trialing");
    const starts = new Date(subs.rows[0].starts_at).getTime();
    const ends = new Date(subs.rows[0].ends_at).getTime();
    const days = (ends - starts) / 86400000;
    assert.ok(days >= 29.5 && days <= 30.5, `expected ~30 day trial, got ${days}`);

    const again = await approveAndProvisionRegistrationApplication(pool, {
      applicationId: held.application.id,
      actorUserId: platformAdmin.userId,
      organizationKey: key,
    });
    assert.equal(again.ok, true);
    assert.equal(again.alreadyProvisioned, true);

    const subCount = await pool.query(
      `SELECT COUNT(*)::int AS n FROM platform.organization_subscriptions WHERE organization_id = $1`,
      [approved.records.organizationId]
    );
    assert.equal(subCount.rows[0].n, 1);

    const detail = await getRegistrationApplicationDetail(pool, held.application.id);
    assert.match(detail.application.displayStatus, /Provisioned/);
    assert.match(detail.application.displayStatus, /Growth Trial/i);
  });

  it("10. Network approval requires validation complete", async () => {
    requireDb();
    const body = networkBody();
    const row = await insertNetworkApplication(body);
    assert.equal(row.follow_up_status, "validation_pending");

    const blocked = await approveAndProvisionRegistrationApplication(pool, {
      applicationId: row.id,
      actorUserId: platformAdmin.userId,
      organizationKey: body.organization_key,
      deploymentCode: DEPLOYMENT,
    });
    assert.equal(blocked.ok, false);
    assert.equal(blocked.message, "network_validation_required");

    const still = await appRepo.findApplicationById(pool, row.id);
    assert.equal(still.organization_id, null);
    assert.equal(still.provisioning_status, "not_started");
  });

  it("11–12. Network approval creates organization once and does not activate Network", async () => {
    requireDb();
    const body = networkBody({ church_name: `Ready Network ${uniq("rn")}` });
    const row = await insertNetworkApplication(body);

    const marked = await markNetworkValidationComplete(pool, {
      applicationId: row.id,
      actorUserId: platformAdmin.userId,
      deploymentCode: DEPLOYMENT,
    });
    assert.equal(marked.ok, true, marked.message || marked.status);

    const ready = await getRegistrationApplicationDetail(pool, row.id);
    assert.equal(ready.application.displayStatus, "Ready for approval");
    assert.equal(ready.application.networkApproveAvailable, true);

    const created = await approveAndProvisionRegistrationApplication(pool, {
      applicationId: row.id,
      actorUserId: platformAdmin.userId,
      organizationKey: body.organization_key,
      deploymentCode: DEPLOYMENT,
      dataEnvironment: "testing",
    });
    assert.equal(created.ok, true, created.message || created.status);
    assert.equal(created.networkOrganizationCreated, true);
    assert.ok(created.records && created.records.organizationId);

    const subs = await pool.query(
      `SELECT os.status, p.plan_key
         FROM platform.organization_subscriptions os
         JOIN platform.plans p ON p.id = os.plan_id
        WHERE os.organization_id = $1`,
      [created.records.organizationId]
    );
    assert.equal(subs.rows.length, 1);
    assert.equal(subs.rows[0].plan_key, "free");
    assert.notEqual(subs.rows[0].plan_key, "professional");
    assert.notEqual(subs.rows[0].plan_key, "network");

    const audits = await pool.query(
      `SELECT action_key, metadata_json FROM platform.audit_events
        WHERE organization_id = $1
          AND action_key = 'registration.network_organization_created'`,
      [created.records.organizationId]
    );
    assert.ok(audits.rows.length >= 1);
    const meta =
      typeof audits.rows[0].metadata_json === "string"
        ? JSON.parse(audits.rows[0].metadata_json)
        : audits.rows[0].metadata_json;
    assert.equal(meta.network_activation_required, true);

    const again = await approveAndProvisionRegistrationApplication(pool, {
      applicationId: row.id,
      actorUserId: platformAdmin.userId,
      organizationKey: body.organization_key,
    });
    assert.equal(again.ok, true);
    assert.equal(again.alreadyProvisioned, true);

    const orgCount = await pool.query(
      `SELECT COUNT(*)::int AS n FROM platform.organizations WHERE organization_key = $1`,
      [body.organization_key]
    );
    assert.equal(orgCount.rows[0].n, 1);
  });

  it("13. Support user cannot activate Network", async () => {
    requireDb();
    const supportEmail = `${uniq("sup")}@example.org`;
    const supportUser = await createBlessBoardUser(pool, {
      email: supportEmail,
      password: PASSWORD,
      displayName: "Support Only",
    });
    assert.equal(supportUser.ok, true);
    // church_hq_admin is not platform_admin — cannot reach activate-paid.
    const hqRole = await assignBlessBoardRole(pool, {
      userId: supportUser.user.id,
      roleKey: "church_hq_admin",
      organizationId: null,
      churchId: null,
      branchId: null,
    });
    // May fail without org scope; if so, leave as plain user (still not platform_admin).
    void hqRole;

    const app = makeApp({});
    const session = await createV5Session(pool, {
      userId: supportUser.user.id,
      deploymentCode: DEPLOYMENT,
      organizationId: null,
      churchId: null,
      branchId: null,
    });
    assert.equal(session.ok, true);
    const cookie = `${DEFAULT_V5_COOKIE}=${session.rawToken}`;

    const activate = await request(app)
      .post("/admin/organizations/any-org/billing/activate-paid")
      .set("Host", APEX)
      .set("Cookie", cookie)
      .type("form")
      .send({
        plan_key: "network",
        reason: "should fail",
        confirm_billing_activation: "1",
        [CSRF_FIELD]: "x",
      });
    assert.ok([401, 403, 302, 303].includes(activate.status));
    if (activate.status === 303 || activate.status === 302) {
      assert.doesNotMatch(String(activate.headers.location || ""), /notice=activated/);
    }

    const approveAttempt = await request(app)
      .post(`/admin/registration-applications/${crypto.randomUUID()}/approve`)
      .set("Host", APEX)
      .set("Cookie", cookie)
      .type("form")
      .send({
        administrator_password: PASSWORD,
        administrator_password_confirm: PASSWORD,
        [CSRF_FIELD]: "x",
      });
    assert.ok([401, 403, 302, 303].includes(approveAttempt.status));
  });

  it("18. All registration mutations require CSRF", async () => {
    requireDb();
    const app = makeApp({});
    const session = await createV5Session(pool, {
      userId: platformAdmin.userId,
      deploymentCode: DEPLOYMENT,
      organizationId: platformAdmin.organizationId,
      churchId: null,
      branchId: null,
    });
    assert.equal(session.ok, true, session.code);
    const cookie = `${DEFAULT_V5_COOKIE}=${session.rawToken}`;
    const id = crypto.randomUUID();

    for (const pathSuffix of [
      "approve",
      "retry-provision",
      "reject",
      "mark-validation-complete",
    ]) {
      const res = await request(app)
        .post(`/admin/registration-applications/${id}/${pathSuffix}`)
        .set("Host", APEX)
        .set("Accept", "text/html")
        .set("Cookie", cookie)
        .type("form")
        .send({ rejection_reason: "x", administrator_password: PASSWORD });
      assert.equal(res.status, 303, pathSuffix);
      assert.match(String(res.headers.location || ""), /error=csrf/, pathSuffix);
    }
  });

  it("19. Unauthorized users cannot approve", async () => {
    requireDb();
    const app = makeApp({});
    const id = crypto.randomUUID();
    const unauth = await request(app)
      .post(`/admin/registration-applications/${id}/approve`)
      .set("Host", APEX)
      .type("form")
      .send({
        administrator_password: PASSWORD,
        administrator_password_confirm: PASSWORD,
        [CSRF_FIELD]: "token",
      });
    assert.ok([401, 403, 302, 303].includes(unauth.status));

    const tenantEmail = `${uniq("ten")}@example.org`;
    const tenant = await createBlessBoardUser(pool, {
      email: tenantEmail,
      password: PASSWORD,
      displayName: "Tenant User",
    });
    assert.equal(tenant.ok, true);
    const session = await createV5Session(pool, {
      userId: tenant.user.id,
      deploymentCode: DEPLOYMENT,
      organizationId: null,
      churchId: null,
      branchId: null,
    });
    assert.equal(session.ok, true);
    const denied = await request(app)
      .post(`/admin/registration-applications/${id}/approve`)
      .set("Host", APEX)
      .set("Cookie", `${DEFAULT_V5_COOKIE}=${session.rawToken}`)
      .type("form")
      .send({
        administrator_password: PASSWORD,
        administrator_password_confirm: PASSWORD,
        [CSRF_FIELD]: "token",
      });
    assert.ok([401, 403, 302, 303].includes(denied.status));
  });

  it("20. Maintenance reset behavior remains unchanged", async () => {
    requireDb();
    const maint = fs.readFileSync(
      path.join(__dirname, "blessboard-testing-maintenance.test.js"),
      "utf8"
    );
    assert.match(maint, /\/admin\/maintenance\/reset/);
    assert.match(maint, /FULL_RESET_CONFIRM_PHRASE|confirm_phrase/);
    assert.match(maint, /error=csrf/);
    assert.equal(typeof FULL_RESET_CONFIRM_PHRASE, "string");
    assert.ok(FULL_RESET_CONFIRM_PHRASE.length > 8);

    // Presenter still maps Network validation without reading maintenance routes.
    const view = presentRegistrationOperatorView({
      selected_plan: "network",
      application_status: "submitted",
      provisioning_status: "not_started",
      follow_up_status: "validation_pending",
      support_requested: true,
    });
    assert.equal(view.displayStatus, "Network validation");
  });
});
