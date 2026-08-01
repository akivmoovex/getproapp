"use strict";

/**
 * Church administrator invitation delivery + password reset token lifecycle.
 */

const assert = require("node:assert/strict");
const { describe, it, before, after } = require("node:test");
const crypto = require("crypto");
const bcrypt = require("bcryptjs");
const request = require("supertest");

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
  deliverChurchAdministratorInvitation,
  STATUS: INVITE_DELIVERY_STATUS,
} = require("../src/blessboard/services/deliverChurchAdministratorInvitation");
const {
  buildChurchAdministratorInvitationMessage,
} = require("../src/blessboard/services/churchAdministratorInvitationMessage");
const {
  requestPasswordReset,
  completePasswordReset,
  platformAdminRequestPasswordReset,
  NEUTRAL_MESSAGE,
  STATUS: RESET_STATUS,
} = require("../src/blessboard/services/passwordResetService");
const { hashSessionToken } = require("../src/platform/session/sessionToken");
const inviteRepo = require("../src/blessboard/repositories/userInvitationRepository");

const IDENTITY_KEY = "blessboard-platform-v5";
const PASSWORD = "TestPassword99!";
const NEW_PASSWORD = "ReplacementPass99!";

function uniq(prefix) {
  return `${prefix}-${crypto.randomBytes(3).toString("hex")}`;
}

function createCaptureAdapter() {
  const sent = [];
  return {
    adapter: Object.freeze({
      id: "test_capture",
      sendingAvailable: true,
      async send(envelope) {
        sent.push(envelope);
        return {
          accepted_for_processing: true,
          sendingAvailable: true,
          delivered: true,
          code: "sent",
        };
      },
    }),
    sent,
  };
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

describe("invitation delivery and password reset", () => {
  let pool;
  let skipSuite = false;
  let skipReason = "";
  let app;
  let platformAdmin;
  let org;
  let church;
  let invitation;

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

      const adminCreated = await createBlessBoardUser(pool, {
        email: `${uniq("pa")}@example.com`,
        displayName: "Platform Admin",
        password: PASSWORD,
      });
      assert.equal(adminCreated.ok, true, adminCreated.message);
      platformAdmin = adminCreated.user;

      const key = uniq("invorg");
      const application = await appRepo.createApplication(pool, {
        church_name: `Invite Reset Church ${key}`,
        country: "Kenya",
        city: "Nairobi",
        contact_name: "Invite Contact",
        contact_email: `${key}-admin@example.org`,
        contact_phone: "+254700111333",
        role_in_church: "Administrator",
        selected_plan: "foundation",
        consent_terms: true,
      });
      const provisioned = await provisionRegisteredBlessBoardChurch(pool, {
        applicationId: application.id,
        administratorPassword: PASSWORD,
        requestedOrganizationKey: key,
        requestId: "invite-reset-fixture",
        actorContext: {
          type: "test",
          source: "auth-fix",
          dataEnvironment: "testing",
          deploymentCode: "blessboard-org-staging",
        },
      });
      assert.equal(provisioned.ok, true, provisioned.message);
      org = {
        id: provisioned.records.organizationId,
        organization_key: provisioned.records.organizationKey,
        display_name: `Invite Reset Church ${key}`,
      };
      church = { id: provisioned.records.churchId };

      assert.equal(
        (
          await assignBlessBoardRole(pool, {
            email: platformAdmin.email,
            organizationKey: org.organization_key,
            roleKey: "platform_admin",
          })
        ).ok,
        true
      );

      const token = crypto.randomBytes(32).toString("base64url");
      invitation = await inviteRepo.insertInvitation(pool, {
        organizationId: org.id,
        churchId: church.id,
        emailNormalized: `${uniq("setup")}@example.com`,
        emailDisplay: `${uniq("setup")}@example.com`,
        displayName: "Setup Admin",
        roleKey: "church_hq_admin",
        tokenHash: hashSessionToken(token),
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
        invitedByUserId: platformAdmin.id,
      });
      invitation._rawToken = token;

      app = createV5FoundationApp({
        getPool: () => pool,
        env: {
          ...process.env,
          NODE_ENV: "test",
          SESSION_SECRET: "test-session-secret-for-csrf-32chars",
          BLESSBOARD_APEX_ORIGIN: "https://blessboard.org",
          PLATFORM_DEPLOYMENT_CODE: "blessboard-org-staging",
        },
      });
    } catch (err) {
      skipSuite = true;
      skipReason = err && err.message ? err.message : String(err);
    }
  });

  after(async () => {
    if (pool) await pool.end().catch(() => null);
  });

  function requireDb() {
    if (skipSuite) assert.fail(`Local PostgreSQL unavailable: ${skipReason}`);
  }

  it("escapes church names in invitation HTML", () => {
    const msg = buildChurchAdministratorInvitationMessage({
      churchName: `<script>alert(1)</script> & Co`,
      recipientEmail: "a@example.com",
      inviteUrl: "https://blessboard.org/invite/accept?token=abc",
      loginUrl: "https://blessboard.org/login",
      expiresAt: new Date(Date.now() + 3600000),
      kind: "setup_invitation",
    });
    assert.equal(msg.subject, "Your BlessBoard church workspace is ready");
    assert.doesNotMatch(msg.html, /<script>/);
    assert.match(msg.html, /&lt;script&gt;/);
  });

  it("delivers invitation after commit and stores hashed token only", async () => {
    requireDb();
    const capture = createCaptureAdapter();
    const result = await deliverChurchAdministratorInvitation(
      pool,
      {
        invitationId: invitation.id,
        rawToken: invitation._rawToken,
        churchName: "Invite Test Church",
        administratorName: "Admin User",
        recipientEmail: invitation.emailNormalized,
        organizationId: org.id,
        churchId: church.id,
        actorUserId: platformAdmin.id,
        existingActiveUser: false,
        env: { BLESSBOARD_APEX_ORIGIN: "https://blessboard.org" },
        idempotencyKey: `provision:${invitation.id}`,
      },
      { emailAdapter: capture.adapter }
    );
    assert.equal(result.ok, true);
    assert.equal(capture.sent.length, 1);
    assert.match(capture.sent[0].text, /invite\/accept\?token=/);
    assert.doesNotMatch(capture.sent[0].text, /password_hash|hunter2|TestPassword/i);

    const row = await inviteRepo.findById(pool, invitation.id);
    assert.equal(row.deliveryStatus, "sent");
    assert.equal(row.tokenHash, hashSessionToken(invitation._rawToken));
    assert.notEqual(row.tokenHash, invitation._rawToken);

    const skipped = await deliverChurchAdministratorInvitation(
      pool,
      {
        invitationId: invitation.id,
        rawToken: invitation._rawToken,
        churchName: "Invite Test Church",
        recipientEmail: invitation.emailNormalized,
        organizationId: org.id,
        churchId: church.id,
        actorUserId: platformAdmin.id,
        existingActiveUser: false,
        env: { BLESSBOARD_APEX_ORIGIN: "https://blessboard.org" },
        idempotencyKey: `provision:${invitation.id}`,
      },
      { emailAdapter: capture.adapter }
    );
    assert.equal(skipped.status, INVITE_DELIVERY_STATUS.SKIPPED);
    assert.equal(capture.sent.length, 1);
  });

  it("existing active user gets access confirmation without invite URL", async () => {
    requireDb();
    const capture = createCaptureAdapter();
    const result = await deliverChurchAdministratorInvitation(
      pool,
      {
        churchName: "Invite Test Church",
        recipientEmail: "existing@example.com",
        organizationId: org.id,
        churchId: church.id,
        actorUserId: platformAdmin.id,
        existingActiveUser: true,
        env: { BLESSBOARD_APEX_ORIGIN: "https://blessboard.org" },
      },
      { emailAdapter: capture.adapter }
    );
    assert.equal(result.ok, true);
    assert.equal(capture.sent.length, 1);
    assert.doesNotMatch(capture.sent[0].text, /invite\/accept/);
    assert.match(capture.sent[0].text, /Sign in:/);
  });

  it("public forgot-password is enumeration-safe and rate-limited neutrally", async () => {
    requireDb();
    const capture = createCaptureAdapter();
    const user = await createBlessBoardUser(pool, {
      email: `${uniq("reset")}@example.com`,
      displayName: "Reset User",
      password: PASSWORD,
    });
    assert.equal(user.ok, true);

    const known = await requestPasswordReset(
      pool,
      {
        email: user.user.email,
        requestIp: "203.0.113.10",
        env: { BLESSBOARD_APEX_ORIGIN: "https://blessboard.org" },
        churchId: church.id,
        organizationId: org.id,
      },
      { emailAdapter: capture.adapter }
    );
    assert.equal(known.ok, true);
    assert.equal(known.message, NEUTRAL_MESSAGE);
    assert.equal(known.sent, true);
    assert.equal(capture.sent.length, 1);
    const resetUrl = capture.sent[0].text.match(/https:\/\/blessboard\.org\/reset-password\?token=[^\s]+/);
    assert.ok(resetUrl);

    const unknown = await requestPasswordReset(
      pool,
      {
        email: `${uniq("ghost")}@example.com`,
        requestIp: "203.0.113.11",
        env: { BLESSBOARD_APEX_ORIGIN: "https://blessboard.org" },
        churchId: church.id,
        organizationId: org.id,
      },
      { emailAdapter: capture.adapter }
    );
    assert.equal(unknown.ok, true);
    assert.equal(unknown.message, NEUTRAL_MESSAGE);
    assert.equal(unknown.sent, false);

    const tokenMatch = resetUrl[0].split("token=")[1];
    const hashRows = await pool.query(
      `SELECT token_hash FROM blessboard.user_action_tokens WHERE purpose = 'password_reset'`
    );
    for (const row of hashRows.rows) {
      assert.notEqual(row.token_hash, tokenMatch);
      assert.equal(row.token_hash.length, 64);
    }

    const completed = await completePasswordReset(pool, {
      token: tokenMatch,
      password: NEW_PASSWORD,
      passwordConfirm: NEW_PASSWORD,
    });
    assert.equal(completed.ok, true);

    const reused = await completePasswordReset(pool, {
      token: tokenMatch,
      password: NEW_PASSWORD,
      passwordConfirm: NEW_PASSWORD,
    });
    assert.equal(reused.ok, false);
    assert.equal(reused.status, RESET_STATUS.CONSUMED);

    const loginCheck = await bcrypt.compare(
      NEW_PASSWORD,
      (await pool.query(`SELECT password_hash FROM blessboard.users WHERE id = $1`, [user.user.id]))
        .rows[0].password_hash
    );
    assert.equal(loginCheck, true);
  });

  it("apex forgot-password page and CSRF-protected POST", async () => {
    requireDb();
    const getPage = await request(app).get("/forgot-password").set("Host", "blessboard.org");
    assert.equal(getPage.status, 200);
    assert.match(getPage.text, /Forgot password/i);
    assert.match(getPage.text, /data-bb-page="forgot-password"/);

    const csrf = extractCsrfToken(getPage.text);
    const csrfCookie = extractCookie(getPage, CSRF_COOKIE);
    assert.ok(csrf && csrfCookie);

    const missingCsrf = await request(app)
      .post("/forgot-password")
      .set("Host", "blessboard.org")
      .set("Cookie", `${CSRF_COOKIE}=${csrfCookie}`)
      .type("form")
      .send({ email: "anyone@example.com" });
    assert.equal(missingCsrf.status, 403);

    const ok = await request(app)
      .post("/forgot-password")
      .set("Host", "blessboard.org")
      .set("Cookie", `${CSRF_COOKIE}=${csrfCookie}`)
      .type("form")
      .send({ [CSRF_FIELD]: csrf, email: "anyone@example.com" });
    assert.equal(ok.status, 200);
    assert.match(ok.text, /If an eligible account exists/);
  });

  it("login shows forgot-password link", async () => {
    requireDb();
    const res = await request(app).get("/login").set("Host", "blessboard.org");
    assert.equal(res.status, 200);
    assert.match(res.text, /data-bb-auth-forgot="1"/);
    assert.match(res.text, /href="\/forgot-password"/);
  });

  it("platform admin password reset requires CSRF and membership scope", async () => {
    requireDb();
    const staff = await createBlessBoardUser(pool, {
      email: `${uniq("staff")}@example.com`,
      displayName: "Staff User",
      password: PASSWORD,
    });
    assert.equal(staff.ok, true);
    await assignBlessBoardRole(pool, {
      email: staff.user.email,
      organizationKey: org.organization_key,
      roleKey: "church_hq_admin",
      churchKey: org.organization_key,
    });

    const session = await createV5Session(pool, {
      userId: platformAdmin.id,
      deploymentCode: "blessboard-org-staging",
      organizationId: org.id,
    });
    assert.equal(session.ok, true, session.code);
    const cookie = `${DEFAULT_V5_COOKIE}=${session.rawToken}`;

    const detail = await request(app)
      .get(`/admin/organizations/${org.organization_key}`)
      .set("Host", "blessboard.org")
      .set("Cookie", cookie);
    assert.equal(detail.status, 200);
    assert.match(detail.text, /data-bb-pa-org-staff="1"/);
    assert.match(detail.text, /Send password reset/);

    const csrfPage = await request(app)
      .get(`/admin/organizations/${org.organization_key}`)
      .set("Host", "blessboard.org")
      .set("Cookie", cookie);
    const csrf = extractCsrfToken(csrfPage.text);
    const csrfCookie = extractCookie(csrfPage, CSRF_COOKIE);

    const noCsrf = await request(app)
      .post(`/admin/organizations/${org.organization_key}/users/${staff.user.id}/password-reset`)
      .set("Host", "blessboard.org")
      .set("Cookie", `${cookie}; ${CSRF_COOKIE}=${csrfCookie}`)
      .type("form")
      .send({});
    assert.equal(noCsrf.status, 303);
    assert.match(noCsrf.headers.location || "", /error=csrf/);

    const capture = createCaptureAdapter();
    const adminResult = await platformAdminRequestPasswordReset(
      pool,
      {
        email: staff.user.email,
        actorUserId: platformAdmin.id,
        organizationId: org.id,
        churchId: church.id,
        env: { BLESSBOARD_APEX_ORIGIN: "https://blessboard.org" },
      },
      { emailAdapter: capture.adapter }
    );
    assert.equal(adminResult.ok, true);
    assert.equal(adminResult.sent, true);

    const foreign = await platformAdminRequestPasswordReset(pool, {
      email: `${uniq("foreign")}@example.com`,
      actorUserId: platformAdmin.id,
      organizationId: org.id,
      churchId: church.id,
    });
    assert.equal(foreign.ok, false);
    assert.equal(foreign.status, RESET_STATUS.FORBIDDEN);

    const withCsrf = await request(app)
      .post(`/admin/organizations/${org.organization_key}/users/${staff.user.id}/password-reset`)
      .set("Host", "blessboard.org")
      .set("Cookie", `${cookie}; ${CSRF_COOKIE}=${csrfCookie}`)
      .type("form")
      .send({ [CSRF_FIELD]: csrf });
    assert.equal(withCsrf.status, 303);
    assert.match(withCsrf.headers.location || "", /notice=password_reset_/);
  });
});
