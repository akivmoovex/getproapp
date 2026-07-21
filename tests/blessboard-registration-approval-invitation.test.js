"use strict";

/**
 * Prompt 49 — platform-admin approval without password; invitation-based admin setup.
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
} = require("../src/blessboard/services/platformChurchRegistrationService");
const {
  validatePlatformChurchRegistration,
} = require("../src/blessboard/services/platformChurchRegistrationValidation");
const {
  approveAndProvisionRegistrationApplication,
  markNetworkValidationComplete,
} = require("../src/blessboard/services/registrationApplicationsAdminService");
const {
  acceptInvitation,
  getInvitationForAccept,
} = require("../src/blessboard/services/inviteBlessBoardStaff");
const { provisionRegisteredBlessBoardChurch } = require("../src/blessboard/services/provisionRegisteredBlessBoardChurch");
const appRepo = require("../src/blessboard/repositories/platformChurchRegistrationRepository");
const { ENV_KEY } = require("../src/blessboard/config/instantFreeProvisioningEnabled");
const { FULL_RESET_CONFIRM_PHRASE } = require("../src/platform/services/testingDataResetService");

const IDENTITY_KEY = "blessboard-platform-v5";
const PASSWORD = "TestPassword99!";
const APEX = "blessboard.org";
const DEPLOYMENT = "blessboard-org-v5";

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

describe("registration approval without password (Prompt 49)", () => {
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

      const key = uniq("p49pa");
      const email = `pa-${key}@example.org`;
      const user = await createBlessBoardUser(pool, {
        email,
        password: PASSWORD,
        displayName: "Prompt49 Platform Admin",
      });
      assert.equal(user.ok, true, user.message);

      const bootstrapApp = await appRepo.createApplication(pool, {
        church_name: `P49 PA Church ${key}`,
        country: "Kenya",
        city: "Nairobi",
        contact_name: "PA",
        contact_email: `${uniq("p49boot")}@example.org`,
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
          source: "prompt49",
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
      assert.equal(role.ok, true, role.message);
      platformAdmin = {
        userId: user.user.id,
        email,
        organizationId: provisioned.records.organizationId,
      };
    } catch (err) {
      skipSuite = true;
      skipReason = err && err.message ? String(err.message) : String(err);
    }
  });

  after(async () => {
    if (pool) await pool.end().catch(() => {});
  });

  function requireDb() {
    if (skipSuite) assert.fail(`DB unavailable: ${skipReason}`);
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
    assert.equal(result.ok, true, JSON.stringify(result));
    return result;
  }

  function freeBody(overrides = {}) {
    const key = uniq("p49f");
    return {
      church_name: `P49 Foundation ${key}`,
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
    const key = uniq("p49g");
    return {
      church_name: `P49 Growth ${key}`,
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

  async function heldFoundation() {
    const key = uniq("p49hold");
    const body = freeBody({
      organization_key: key,
      country: "Kenya",
      phone: `+1555${String(Date.now()).slice(-7)}`,
      email: `${key}@example.org`,
      church_name: `Held ${key}`,
      city: `City-${key}`,
    });
    const held = await submitInstantFreeChurchRegistration(
      pool,
      { ip: "203.0.113.49" },
      validateBody(body)
    );
    assert.equal(held.review, true, held.error || held.code);
    return { held, key, body };
  }

  it("1. Approval form contains no password field", () => {
    const detail = fs.readFileSync(
      path.join(__dirname, "../views/blessboard/v5/platform-admin/registration-application-detail.ejs"),
      "utf8"
    );
    assert.doesNotMatch(detail, /name="administrator_password"/);
    assert.doesNotMatch(detail, /name="administrator_password_confirm"/);
    assert.match(detail, /invitation will be created for the church administrator/i);
  });

  it("2–3. Missing password does not block Foundation exception approval", async () => {
    requireDb();
    const { held, key } = await heldFoundation();
    const approved = await approveAndProvisionRegistrationApplication(pool, {
      applicationId: held.application.id,
      actorUserId: platformAdmin.userId,
      organizationKey: key,
      deploymentCode: DEPLOYMENT,
      dataEnvironment: "testing",
    });
    assert.equal(approved.ok, true, approved.message || approved.status);
    assert.ok(approved.records.organizationId);
    assert.ok(approved.invitation && approved.invitation.rawToken);
  });

  it("4. Growth exception approval creates one 30-day trial", async () => {
    requireDb();
    const key = uniq("p49gt");
    const body = growthBody({
      organization_key: key,
      country: "Kenya",
      phone: `+1555${String(Date.now() + 1).slice(-7)}`,
      email: `${key}@example.org`,
      church_name: `Growth Held ${key}`,
      city: `G-${key}`,
    });
    const held = await submitInstantFreeChurchRegistration(
      pool,
      { ip: "203.0.113.50" },
      validateBody(body)
    );
    assert.equal(held.review, true);
    const approved = await approveAndProvisionRegistrationApplication(pool, {
      applicationId: held.application.id,
      actorUserId: platformAdmin.userId,
      organizationKey: key,
      deploymentCode: DEPLOYMENT,
      dataEnvironment: "testing",
    });
    assert.equal(approved.ok, true, approved.message || approved.status);
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
    const days =
      (new Date(subs.rows[0].ends_at).getTime() - new Date(subs.rows[0].starts_at).getTime()) /
      86400000;
    assert.ok(days >= 29.5 && days <= 30.5);
  });

  it("5. Network approval provisions without Network activation", async () => {
    requireDb();
    const key = uniq("p49net");
    const phoneTail = String(1000000 + (Date.now() % 1000000) + Math.floor(Math.random() * 900)).slice(
      -7
    );
    const app = await appRepo.createApplication(pool, {
      church_name: `Network ${key}`,
      country: "Kenya",
      city: "Nairobi",
      contact_name: "Net Admin",
      contact_email: `${key}@example.org`,
      contact_phone: `+2547${phoneTail}`,
      contact_phone_normalized: `+2547${phoneTail}`,
      role_in_church: "Administrator",
      selected_plan: "network",
      support_requested: true,
      follow_up_status: "validation_pending",
      application_status: "submitted",
      consent_terms: true,
    });
    const marked = await markNetworkValidationComplete(pool, {
      applicationId: app.id,
      actorUserId: platformAdmin.userId,
      deploymentCode: DEPLOYMENT,
    });
    assert.equal(marked.ok, true, marked.message);
    const created = await approveAndProvisionRegistrationApplication(pool, {
      applicationId: app.id,
      actorUserId: platformAdmin.userId,
      organizationKey: key,
      deploymentCode: DEPLOYMENT,
      dataEnvironment: "testing",
    });
    assert.equal(created.ok, true, created.message || created.status);
    assert.equal(created.networkOrganizationCreated, true);
    const subs = await pool.query(
      `SELECT p.plan_key FROM platform.organization_subscriptions os
         JOIN platform.plans p ON p.id = os.plan_id
        WHERE os.organization_id = $1`,
      [created.records.organizationId]
    );
    assert.equal(subs.rows[0].plan_key, "free");
  });

  it("6–9. Invitation created; accept sets password; short password rejected", async () => {
    requireDb();
    const { held, key } = await heldFoundation();
    const approved = await approveAndProvisionRegistrationApplication(pool, {
      applicationId: held.application.id,
      actorUserId: platformAdmin.userId,
      organizationKey: key,
      deploymentCode: DEPLOYMENT,
      dataEnvironment: "testing",
    });
    assert.equal(approved.ok, true);
    assert.ok(approved.invitation.rawToken);

    const peeked = await getInvitationForAccept(pool, approved.invitation.rawToken);
    assert.equal(peeked.ok, true);
    assert.equal(peeked.invitation.requiresPassword, true);

    const short = await acceptInvitation(pool, {
      token: approved.invitation.rawToken,
      password: "short",
    });
    assert.equal(short.ok, false);

    const accepted = await acceptInvitation(pool, {
      token: approved.invitation.rawToken,
      password: PASSWORD,
    });
    assert.equal(accepted.ok, true, accepted.message || accepted.status);

    const user = await pool.query(
      `SELECT status, password_hash IS NOT NULL AS has_password
         FROM blessboard.users WHERE id = $1`,
      [approved.records.administratorUserId]
    );
    assert.equal(user.rows[0].status, "active");
    assert.equal(user.rows[0].has_password, true);

    const roles = await pool.query(
      `SELECT role_key FROM blessboard.user_roles
        WHERE user_id = $1 AND organization_id = $2 AND status = 'active'`,
      [approved.records.administratorUserId, approved.records.organizationId]
    );
    assert.ok(roles.rows.some((r) => r.role_key === "church_hq_admin"));
  });

  it("10–11. Existing user password hash unchanged and linked safely", async () => {
    requireDb();
    const existingEmail = `${uniq("p49exist")}@example.org`;
    const existing = await createBlessBoardUser(pool, {
      email: existingEmail,
      password: PASSWORD,
      displayName: "Existing Admin",
    });
    assert.equal(existing.ok, true);
    const before = await pool.query(
      `SELECT password_hash FROM blessboard.users WHERE id = $1`,
      [existing.user.id]
    );
    const hashBefore = before.rows[0].password_hash;

    const key = uniq("p49link");
    const body = freeBody({
      organization_key: key,
      email: existingEmail,
      country: "Kenya",
      phone: `+1555${String(Date.now() + 9).slice(-7)}`,
      church_name: `Link Org ${key}`,
      city: `L-${key}`,
    });
    const held = await submitInstantFreeChurchRegistration(
      pool,
      { ip: "203.0.113.51" },
      validateBody(body)
    );
    assert.equal(held.review, true);

    const approved = await approveAndProvisionRegistrationApplication(pool, {
      applicationId: held.application.id,
      actorUserId: platformAdmin.userId,
      organizationKey: key,
      deploymentCode: DEPLOYMENT,
      dataEnvironment: "testing",
    });
    assert.equal(approved.ok, true, approved.message || approved.status);
    assert.equal(approved.records.administratorLinkedExisting, true);
    assert.equal(String(approved.records.administratorUserId), String(existing.user.id));

    const after = await pool.query(
      `SELECT password_hash FROM blessboard.users WHERE id = $1`,
      [existing.user.id]
    );
    assert.equal(after.rows[0].password_hash, hashBefore);
  });

  it("12–13. Duplicate submission is idempotent; one active invitation", async () => {
    requireDb();
    const { held, key } = await heldFoundation();
    const first = await approveAndProvisionRegistrationApplication(pool, {
      applicationId: held.application.id,
      actorUserId: platformAdmin.userId,
      organizationKey: key,
      deploymentCode: DEPLOYMENT,
      dataEnvironment: "testing",
    });
    assert.equal(first.ok, true);
    const second = await approveAndProvisionRegistrationApplication(pool, {
      applicationId: held.application.id,
      actorUserId: platformAdmin.userId,
      organizationKey: key,
      deploymentCode: DEPLOYMENT,
    });
    assert.equal(second.ok, true);
    assert.equal(second.alreadyProvisioned, true);

    const counts = await pool.query(
      `SELECT
         (SELECT COUNT(*)::int FROM platform.organizations WHERE organization_key = $1) AS orgs,
         (SELECT COUNT(*)::int FROM blessboard.user_invitations
            WHERE organization_id = $2 AND status = 'pending') AS invites`,
      [key, first.records.organizationId]
    );
    assert.equal(counts.rows[0].orgs, 1);
    assert.equal(counts.rows[0].invites, 1);
  });

  it("14–15. No raw token/password in audits; form has invitation copy guidance", async () => {
    requireDb();
    const audits = await pool.query(
      `SELECT action_key, metadata_json::text AS meta
         FROM platform.audit_events
        WHERE action_key IN ('invitation.created', 'registration.application_approved')
        ORDER BY created_at DESC LIMIT 20`
    );
    for (const row of audits.rows) {
      assert.doesNotMatch(String(row.meta || ""), /password/i);
      assert.doesNotMatch(String(row.meta || ""), /rawToken|token_hash/i);
    }
    const detail = fs.readFileSync(
      path.join(__dirname, "../views/blessboard/v5/platform-admin/registration-application-detail.ejs"),
      "utf8"
    );
    assert.match(detail, /Copy or resend the invitation from the organization page/);
  });

  it("16–17. CSRF required; unauthorized cannot approve", async () => {
    requireDb();
    const app = makeApp({});
    const session = await createV5Session(pool, {
      userId: platformAdmin.userId,
      deploymentCode: DEPLOYMENT,
      organizationId: platformAdmin.organizationId,
      churchId: null,
      branchId: null,
    });
    assert.equal(session.ok, true);
    const cookie = `${DEFAULT_V5_COOKIE}=${session.rawToken}`;
    const id = crypto.randomUUID();
    const bad = await request(app)
      .post(`/admin/registration-applications/${id}/approve`)
      .set("Host", APEX)
      .set("Accept", "text/html")
      .set("Cookie", cookie)
      .type("form")
      .send({ organization_key: "x" });
    assert.equal(bad.status, 303);
    assert.match(String(bad.headers.location || ""), /error=csrf/);

    const unauth = await request(app)
      .post(`/admin/registration-applications/${id}/approve`)
      .set("Host", APEX)
      .type("form")
      .send({ [CSRF_FIELD]: "x" });
    assert.ok([401, 403, 302, 303].includes(unauth.status));
  });

  it("18. Apex invite accept works for provisioned invitation", async () => {
    requireDb();
    const { held, key } = await heldFoundation();
    const approved = await approveAndProvisionRegistrationApplication(pool, {
      applicationId: held.application.id,
      actorUserId: platformAdmin.userId,
      organizationKey: key,
      deploymentCode: DEPLOYMENT,
      dataEnvironment: "testing",
    });
    assert.equal(approved.ok, true);
    const app = makeApp({});
    const page = await request(app)
      .get(`/invite/accept?token=${encodeURIComponent(approved.invitation.rawToken)}`)
      .set("Host", APEX);
    assert.equal(page.status, 200);
    assert.match(page.text, /password|Choose a password/i);
  });

  it("19–20. Maintenance phrase still present; self-service still requires password", async () => {
    requireDb();
    assert.ok(FULL_RESET_CONFIRM_PHRASE.length > 8);
    const maint = fs.readFileSync(
      path.join(__dirname, "blessboard-testing-maintenance.test.js"),
      "utf8"
    );
    assert.match(maint, /clear_invitations|invitations/);

    const blocked = await provisionRegisteredBlessBoardChurch(pool, {
      applicationId: crypto.randomUUID(),
      actorContext: { deploymentCode: DEPLOYMENT, dataEnvironment: "testing" },
    });
    assert.equal(blocked.ok, false);
    assert.match(String(blocked.message || ""), /administratorPassword/);
  });
});
