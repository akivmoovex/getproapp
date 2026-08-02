"use strict";

/**
 * Prompt 10E: Platform Admin account recovery (ephemeral Postgres).
 */

const { describe, it, before, after } = require("node:test");
const assert = require("node:assert/strict");
const request = require("supertest");
const fs = require("node:fs");
const path = require("node:path");
const bcrypt = require("bcryptjs");

const {
  resetFoundationDatabase,
  createFoundationPool,
} = require("./helpers/foundationDb");
const { migrate } = require("../db/scripts/lib/migrator");
const { ensureDatabaseIdentity } = require("../db/scripts/lib/databaseIdentity");
const { provisionPlatformTenant } = require("../src/platform/services/provisionPlatformTenant");
const { provisionBlessBoardChurch } = require("../src/blessboard/services/provisionBlessBoardChurch");
const { createBlessBoardUser } = require("../src/blessboard/services/createBlessBoardUser");
const { assignBlessBoardRole } = require("../src/blessboard/services/assignBlessBoardRole");
const { createV5Session } = require("../src/platform/session/createV5Session");
const { createV5FoundationApp } = require("../src/platform/http/v5FoundationServer");
const { DEFAULT_V5_COOKIE } = require("../src/platform/session/v5SessionCookie");
const {
  CSRF_FIELD,
  issueCsrfToken,
  CSRF_COOKIE,
} = require("../src/platform/http/v5Csrf");
const {
  completePasswordReset,
  STATUS: RESET_STATUS,
  validatePassword,
} = require("../src/blessboard/services/passwordResetService");
const { authenticateBlessBoardUser } = require("../src/blessboard/services/authenticateBlessBoardUser");
const {
  sendPasswordReset,
  resendInvitation,
  revokeSessions,
  requirePasswordChange,
  suspendSignIn,
  restoreSignIn,
  unlockAccount,
  STATUS: RECOVERY_STATUS,
} = require("../src/platform/services/platformAdminAccountRecoveryService");
const authRepo = require("../src/blessboard/repositories/blessBoardAuthRepository");
const { PLATFORM_ADMIN_PERMISSIONS } = require("../src/blessboard/rbac/legacyCompatibilityPermissions");
const { inviteBlessBoardStaff } = require("../src/blessboard/services/inviteBlessBoardStaff");
const { createRoleAssignment } = require("../src/blessboard/services/blessBoardRoleAssignmentService");
const { revokeRoleAssignment } = require("../src/blessboard/services/blessBoardRoleAssignmentService");

const IDENTITY_KEY = "blessboard-platform-v5";
const PASSWORD = "correct-horse-battery-staple";
const NEW_PASSWORD = "new-horse-battery-staple";
const HOST = "rec-a.blessboard.org";
const DEPLOYMENT = "blessboard-org-staging";

function baseEnv(overrides) {
  return {
    NODE_ENV: "test",
    PLATFORM_DEPLOYMENT_CODE: DEPLOYMENT,
    SESSION_SECRET: "test-session-secret-at-least-32-chars!!",
    SESSION_COOKIE_NAME: DEFAULT_V5_COOKIE,
    BLESSBOARD_TENANT_ROUTING_MODE: "authoritative",
    BLESSBOARD_AUTHORITATIVE_HOST_ALLOWLIST: "*",
    BLESSBOARD_APEX_ORIGIN: "https://blessboard.org",
    ...overrides,
  };
}

function cookieHeader(parts) {
  return parts.filter(Boolean).join("; ");
}

function createCaptureAdapter() {
  const sent = [];
  return {
    sent,
    adapter: Object.freeze({
      id: "test_capture",
      sendingAvailable: true,
      async send(envelope) {
        sent.push({
          to: envelope && envelope.to,
          text: String((envelope && envelope.text) || ""),
          html: String((envelope && envelope.html) || ""),
        });
        return {
          accepted_for_processing: true,
          sendingAvailable: true,
          delivered: true,
          code: "sent",
        };
      },
    }),
  };
}

describe("platform account recovery catalogue", () => {
  it("includes recovery permissions without Finance/pastoral grants", () => {
    for (const key of [
      "platform.users.reset_access",
      "platform.users.revoke_sessions",
      "platform.users.suspend",
      "platform.users.restore",
      "platform.users.unlock",
    ]) {
      assert.ok(PLATFORM_ADMIN_PERMISSIONS.includes(key), key);
    }
    assert.ok(!PLATFORM_ADMIN_PERMISSIONS.includes("finance.transactions.view"));
  });

  it("ships migration 071", () => {
    const mig = fs.readFileSync(
      path.join(
        __dirname,
        "../db/migrations/blessboard/071_platform_account_recovery_permissions.sql"
      ),
      "utf8"
    );
    assert.match(mig, /platform\.users\.reset_access/);
    assert.match(mig, /password_change_required/);
    assert.match(mig, /sign_in_locked_until/);
  });

  it("enforces password policy", () => {
    assert.equal(validatePassword("short").ok, false);
    assert.equal(validatePassword(PASSWORD).ok, true);
  });
});

describe("blessboard platform account recovery", () => {
  let pool;
  let skipSuite = false;
  let skipReason = "";
  let app;
  let org;
  let church;
  let users = {};
  let sessionCookie;
  let csrf;

  before(async () => {
    try {
      process.env.PLATFORM_DEPLOYMENT_CODE = DEPLOYMENT;
      const databaseUrl = await resetFoundationDatabase();
      pool = createFoundationPool(databaseUrl);
      await migrate({ connectionString: databaseUrl });
      await ensureDatabaseIdentity(pool, {
        connectionString: databaseUrl,
        identityKey: IDENTITY_KEY,
        environmentCode: "testing",
      });

      const prov = await provisionPlatformTenant(pool, {
        organizationKey: "rec-org-a",
        displayName: "Recovery Org A",
        legalName: null,
        dataEnvironment: "testing",
        productKey: "blessboard",
        productTenantKey: "rec-org-a",
        hostname: HOST,
        domainType: "canonical",
        deploymentCode: DEPLOYMENT,
        isPrimary: true,
      });
      assert.equal(prov.ok, true, prov.message);
      org = prov.records.organization;

      const churchProv = await provisionBlessBoardChurch(pool, {
        organizationKey: "rec-org-a",
        churchKey: "rec-org-a",
        displayName: "Recovery Church A",
        legalName: null,
        dataEnvironment: "testing",
        hqBranchKey: "hq",
        hqBranchDisplayName: "HQ",
      });
      assert.equal(churchProv.ok, true, churchProv.message);
      church = churchProv.records.church;

      async function makeUser(email, displayName) {
        const created = await createBlessBoardUser(pool, {
          email,
          displayName,
          password: PASSWORD,
        });
        assert.equal(created.ok, true, created.message);
        return created.user;
      }

      users.platform = await makeUser("rec-pa@example.org", "Recovery PA");
      users.staff = await makeUser("rec-staff@example.org", "Recovery Staff");
      users.other = await makeUser("rec-other@example.org", "Other Staff");

      assert.equal(
        (
          await assignBlessBoardRole(pool, {
            email: "rec-pa@example.org",
            organizationKey: "rec-org-a",
            roleKey: "platform_admin",
          })
        ).ok,
        true
      );
      assert.equal(
        (
          await assignBlessBoardRole(pool, {
            email: "rec-staff@example.org",
            organizationKey: "rec-org-a",
            roleKey: "church_hq_admin",
            churchKey: "rec-org-a",
          })
        ).ok,
        true
      );
      assert.equal(
        (
          await assignBlessBoardRole(pool, {
            email: "rec-other@example.org",
            organizationKey: "rec-org-a",
            roleKey: "branch_admin",
            churchKey: "rec-org-a",
            branchKey: "hq",
          })
        ).ok,
        true
      );

      app = createV5FoundationApp({
        getPool: () => pool,
        env: baseEnv(),
      });
      const session = await createV5Session(pool, {
        deploymentCode: DEPLOYMENT,
        userId: users.platform.id,
        organizationId: org.id,
        churchId: church.id,
        branchId: null,
      });
      assert.equal(session.ok, true, session.code);
      sessionCookie = `${DEFAULT_V5_COOKIE}=${session.rawToken}`;
      csrf = issueCsrfToken(baseEnv());
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

  const TEST_ENV = baseEnv();

  it("requests password reset, enforces token single-use/expiry, and never logs tokens", async () => {
    requireDb();
    const capture = createCaptureAdapter();
    const result = await sendPasswordReset(pool, {
      actorUserId: users.platform.id,
      userId: users.staff.id,
      requestIp: "198.51.100.10",
      env: TEST_ENV,
      publicBaseUrl: "https://blessboard.org",
      deps: { emailAdapter: capture.adapter },
    });
    assert.equal(result.ok, true, result.reason);
    assert.equal(result.sent, true);
    assert.equal(Object.prototype.hasOwnProperty.call(result, "rawToken"), false);
    assert.equal(Object.prototype.hasOwnProperty.call(result, "token"), false);

    assert.equal(capture.sent.length, 1);
    const match = capture.sent[0].text.match(
      /https:\/\/blessboard\.org\/reset-password\?token=([^\s]+)/
    );
    assert.ok(match);
    const rawToken = match[1];

    // Service/audit surfaces must not include the raw token.
    const audits = await pool.query(
      `SELECT metadata_json::text AS meta FROM platform.audit_events
        WHERE action_key = 'platform.user.password_reset_requested'
        ORDER BY created_at DESC LIMIT 5`
    );
    for (const row of audits.rows) {
      assert.doesNotMatch(String(row.meta || ""), new RegExp(rawToken.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
    }

    const weak = await completePasswordReset(pool, {
      token: rawToken,
      password: "short",
      passwordConfirm: "short",
    });
    assert.equal(weak.ok, false);
    assert.equal(weak.status, RESET_STATUS.WEAK_PASSWORD);

    // Expire token artificially while satisfying expires_after_created.
    await pool.query(
      `UPDATE blessboard.user_action_tokens
          SET created_at = now() - interval '2 hours',
              expires_at = now() - interval '1 hour'
        WHERE user_id = $1 AND purpose = 'password_reset' AND consumed_at IS NULL`,
      [users.staff.id]
    );
    const expired = await completePasswordReset(pool, {
      token: rawToken,
      password: NEW_PASSWORD,
      passwordConfirm: NEW_PASSWORD,
    });
    assert.equal(expired.ok, false);
    assert.equal(expired.status, RESET_STATUS.EXPIRED);

    // Consume expired rows so a fresh token can be minted cleanly.
    await pool.query(
      `UPDATE blessboard.user_action_tokens
          SET consumed_at = now()
        WHERE user_id = $1 AND purpose = 'password_reset' AND consumed_at IS NULL`,
      [users.staff.id]
    );

    // Fresh reset for single-use check.
    const capture2 = createCaptureAdapter();
    await pool.query(
      `UPDATE blessboard.password_reset_rate_limits SET attempt_count = 0`
    );
    const again = await sendPasswordReset(pool, {
      actorUserId: users.platform.id,
      userId: users.staff.id,
      requestIp: "198.51.100.11",
      env: TEST_ENV,
      publicBaseUrl: "https://blessboard.org",
      deps: { emailAdapter: capture2.adapter },
    });
    assert.equal(again.ok, true, again.reason);
    const token2 = capture2.sent[0].text.match(
      /https:\/\/blessboard\.org\/reset-password\?token=([^\s]+)/
    )[1];
    const completed = await completePasswordReset(pool, {
      token: token2,
      password: NEW_PASSWORD,
      passwordConfirm: NEW_PASSWORD,
    });
    assert.equal(completed.ok, true);
    const reused = await completePasswordReset(pool, {
      token: token2,
      password: NEW_PASSWORD,
      passwordConfirm: NEW_PASSWORD,
    });
    assert.equal(reused.ok, false);
    assert.equal(reused.status, RESET_STATUS.CONSUMED);

    // Restore known password for later tests.
    const hash = await bcrypt.hash(PASSWORD, 12);
    await authRepo.updateUserPasswordHash(pool, users.staff.id, hash);
    await authRepo.clearPasswordRecoveryFlags(pool, users.staff.id);
  });

  it("revokes sessions, requires password change, suspends/restores, and unlocks", async () => {
    requireDb();
    const sess = await createV5Session(pool, {
      deploymentCode: DEPLOYMENT,
      userId: users.staff.id,
      organizationId: org.id,
      churchId: church.id,
      branchId: null,
    });
    assert.equal(sess.ok, true);

    const revoked = await revokeSessions(pool, {
      actorUserId: users.platform.id,
      userId: users.staff.id,
      env: TEST_ENV,
    });
    assert.equal(revoked.ok, true, revoked.reason);
    assert.ok(revoked.revokedCount >= 1);
    const active = await authRepo.countActiveSessionsForUser(pool, users.staff.id);
    assert.equal(active, 0);

    const required = await requirePasswordChange(pool, {
      actorUserId: users.platform.id,
      userId: users.staff.id,
      env: TEST_ENV,
    });
    assert.equal(required.ok, true, required.reason);
    const blockedChange = await authenticateBlessBoardUser(pool, {
      email: "rec-staff@example.org",
      password: PASSWORD,
      deploymentCode: DEPLOYMENT,
    });
    assert.equal(blockedChange.ok, false);
    assert.equal(blockedChange.failureCategory, "password_change_required");
    await authRepo.clearPasswordRecoveryFlags(pool, users.staff.id);

    const suspended = await suspendSignIn(pool, {
      actorUserId: users.platform.id,
      userId: users.staff.id,
      env: TEST_ENV,
    });
    assert.equal(suspended.ok, true, suspended.reason);
    const blockedSuspend = await authenticateBlessBoardUser(pool, {
      email: "rec-staff@example.org",
      password: PASSWORD,
      deploymentCode: DEPLOYMENT,
    });
    assert.equal(blockedSuspend.ok, false);
    assert.equal(blockedSuspend.failureCategory, "account_inactive");

    // Revoke an RBAC assignment while suspended; restore must not revive it.
    await authRepo.updateUserStatus(pool, users.staff.id, "active");
    const assigned = await createRoleAssignment(pool, {
      actorUserId: users.platform.id,
      userId: users.staff.id,
      roleKey: "website_editor",
      organizationId: org.id,
      churchId: church.id,
      scopeType: "church",
      scopeId: church.id,
      assignmentOrigin: "manual",
      assignmentReason: "temp editor",
      tenantContext: {
        resolved: true,
        organization: { id: org.id },
        church: { id: church.id },
        primaryBranch: null,
      },
      actorChurchId: church.id,
      forbidPlatformScope: true,
    });
    assert.equal(assigned.ok, true, assigned.reason);
    const revokedRole = await revokeRoleAssignment(pool, {
      actorUserId: users.platform.id,
      assignmentId: assigned.assignment.id,
      revocationReason: "ended",
      tenantContext: {
        resolved: true,
        organization: { id: org.id },
        church: { id: church.id },
        primaryBranch: null,
      },
      actorChurchId: church.id,
    });
    assert.equal(revokedRole.ok, true, revokedRole.reason);

    await suspendSignIn(pool, {
      actorUserId: users.platform.id,
      userId: users.staff.id,
      env: TEST_ENV,
    });
    const restored = await restoreSignIn(pool, {
      actorUserId: users.platform.id,
      userId: users.staff.id,
      env: TEST_ENV,
    });
    assert.equal(restored.ok, true, restored.reason);
    const stillRevoked = await pool.query(
      `SELECT status FROM blessboard.user_role_assignments WHERE id = $1`,
      [assigned.assignment.id]
    );
    assert.equal(String(stillRevoked.rows[0].status), "revoked");

    await authRepo.setSignInLockedUntil(
      pool,
      users.staff.id,
      new Date(Date.now() + 60 * 60 * 1000).toISOString()
    );
    const lockedAuth = await authenticateBlessBoardUser(pool, {
      email: "rec-staff@example.org",
      password: PASSWORD,
      deploymentCode: DEPLOYMENT,
    });
    assert.equal(lockedAuth.ok, false);
    assert.equal(lockedAuth.failureCategory, "account_locked");

    const unlocked = await unlockAccount(pool, {
      actorUserId: users.platform.id,
      userId: users.staff.id,
      env: TEST_ENV,
    });
    assert.equal(unlocked.ok, true, unlocked.reason);
    const afterUnlock = await authenticateBlessBoardUser(pool, {
      email: "rec-staff@example.org",
      password: PASSWORD,
      deploymentCode: DEPLOYMENT,
    });
    assert.equal(afterUnlock.ok, true, afterUnlock.message);
  });

  it("resends invitation and rate-limits recovery actions", async () => {
    requireDb();
    const invited = await inviteBlessBoardStaff(pool, {
      organizationId: org.id,
      churchId: church.id,
      actorUserId: users.platform.id,
      email: "rec-invitee@example.org",
      roleKey: "church_hq_admin",
      displayName: "Invitee Person",
      env: TEST_ENV,
      deploymentCode: DEPLOYMENT,
    });
    assert.equal(invited.ok, true, invited.reason);
    const invitee = await authRepo.findUserByEmail(pool, "rec-invitee@example.org");
    assert.ok(invitee);

    const resent = await resendInvitation(pool, {
      actorUserId: users.platform.id,
      userId: invitee.id,
      env: TEST_ENV,
    });
    assert.equal(resent.ok, true, resent.reason);

    // Force rate limit by exhausting PA action slots.
    for (let i = 0; i < 10; i += 1) {
      await revokeSessions(pool, {
        actorUserId: users.platform.id,
        userId: users.other.id,
        env: TEST_ENV,
      });
    }
    const limited = await revokeSessions(pool, {
      actorUserId: users.platform.id,
      userId: users.other.id,
      env: TEST_ENV,
    });
    assert.equal(limited.ok, false);
    assert.equal(limited.status, RECOVERY_STATUS.RATE_LIMITED);
  });

  it("records audit events and handles CSRF / unknown user concealment", async () => {
    requireDb();
    const audits = await pool.query(
      `SELECT action_key FROM platform.audit_events
        WHERE action_key LIKE 'platform.user.%'
        ORDER BY created_at DESC
        LIMIT 30`
    );
    const keys = audits.rows.map((r) => r.action_key);
    for (const needed of [
      "platform.user.password_reset_requested",
      "platform.user.sessions_revoked",
      "platform.user.password_change_required",
      "platform.user.suspended",
      "platform.user.restored",
      "platform.user.unlocked",
      "platform.user.invitation_resent",
    ]) {
      assert.ok(keys.includes(needed), `missing audit ${needed} in ${keys.join(",")}`);
    }

    const agentCookie = cookieHeader([sessionCookie, `${CSRF_COOKIE}=${csrf}`]);
    const detail = await request(app)
      .get(`/admin/users/${users.staff.id}`)
      .set("Host", "blessboard.org")
      .set("Cookie", agentCookie);
    assert.equal(detail.status, 200);
    assert.match(detail.text, /Account recovery/);
    assert.match(detail.text, /Send password-reset link/);
    assert.doesNotMatch(detail.text, /password_hash|rawToken|secret_token/i);

    const badCsrf = await request(app)
      .post(`/admin/users/${users.staff.id}/revoke-sessions`)
      .set("Host", "blessboard.org")
      .set("Cookie", agentCookie)
      .type("form")
      .send({ [CSRF_FIELD]: "bad-token" });
    assert.equal(badCsrf.status, 303);
    assert.match(String(badCsrf.headers.location || ""), /error=csrf/);

    const missing = await request(app)
      .post("/admin/users/00000000-0000-4000-8000-000000000099/revoke-sessions")
      .set("Host", "blessboard.org")
      .set("Cookie", agentCookie)
      .type("form")
      .send({ [CSRF_FIELD]: csrf });
    assert.equal(missing.status, 404);

    // Cross-org user handling: PA may act on any staff user id (platform scope).
    const cross = await sendPasswordReset(pool, {
      actorUserId: users.platform.id,
      userId: users.other.id,
      requestIp: "198.51.100.50",
      env: TEST_ENV,
      publicBaseUrl: "https://blessboard.org",
      deps: { emailAdapter: createCaptureAdapter().adapter },
    });
    assert.equal(cross.ok, true, cross.reason);
  });
});
