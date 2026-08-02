"use strict";

/**
 * Prompt 11G — OTP activation and phone recovery workflows.
 */

const { describe, it, before, after } = require("node:test");
const assert = require("node:assert/strict");
const bcrypt = require("bcryptjs");

const {
  resetFoundationDatabase,
  createFoundationPool,
} = require("./helpers/foundationDb");
const { migrate } = require("../db/scripts/lib/migrator");
const { ensureDatabaseIdentity } = require("../db/scripts/lib/databaseIdentity");
const { provisionPlatformTenant } = require("../src/platform/services/provisionPlatformTenant");
const { provisionBlessBoardChurch } = require("../src/blessboard/services/provisionBlessBoardChurch");
const {
  createScopedTeamMember,
} = require("../src/platform/services/createScopedTeamMemberService");
const { createBlessBoardUser } = require("../src/blessboard/services/createBlessBoardUser");
const { assignBlessBoardRole } = require("../src/blessboard/services/assignBlessBoardRole");
const { authenticateBlessBoardUser } = require("../src/blessboard/services/authenticateBlessBoardUser");
const {
  startInvitationActivationOtp,
  completeInvitationActivation,
  startAccountPhoneVerification,
  completeAccountPhoneVerification,
  startPhonePasswordRecovery,
  completePhonePasswordRecovery,
} = require("../src/blessboard/services/phoneOtpWorkflowService");
const { checkVerification } = require("../src/blessboard/services/otp/blessBoardOtpService");
const { clearTestOtpStore } = require("../src/blessboard/services/otp/otpProviders/testProvider");

const IDENTITY_KEY = "blessboard-platform-v5";
const DEPLOYMENT = "blessboard-org-staging";
const PASSWORD = "correct-horse-battery-staple";
const NEW_PASSWORD = "new-horse-battery-staple";

const otpEnv = {
  DEPLOYMENT_ENV: "testing",
  BLESSBOARD_OTP_PROVIDER: "test",
  BLESSBOARD_OTP_PEPPER: "test-pepper-11g",
  BLESSBOARD_OTP_EXPOSE_TEST_CODE: "1",
  BLESSBOARD_OTP_RESEND_DELAY_SECONDS: "1",
};

describe("blessboard phone OTP workflows (11G)", () => {
  let pool;
  let org;
  let church;
  let actorId;

  before(async () => {
    const databaseUrl = await resetFoundationDatabase();
    pool = createFoundationPool(databaseUrl);
    await migrate({ connectionString: databaseUrl });
    await ensureDatabaseIdentity(pool, {
      connectionString: databaseUrl,
      identityKey: IDENTITY_KEY,
      environmentCode: "testing",
    });
    clearTestOtpStore();

    const prov = await provisionPlatformTenant(pool, {
      organizationKey: "otp-workflows-11g",
      displayName: "OTP Workflows Org",
      legalName: null,
      dataEnvironment: "testing",
      productKey: "blessboard",
      productTenantKey: "otp-workflows-11g",
      hostname: "otp-workflows-11g.blessboard.org",
      domainType: "canonical",
      deploymentCode: DEPLOYMENT,
      isPrimary: true,
    });
    assert.equal(prov.ok, true, prov.message);
    org = prov.records.organization;

    const ch = await provisionBlessBoardChurch(pool, {
      organizationKey: "otp-workflows-11g",
      churchKey: "otp-workflows-11g",
      displayName: "OTP Workflows Church",
      legalName: null,
      dataEnvironment: "testing",
      hqBranchKey: "hq",
      hqBranchDisplayName: "HQ",
      countryCode: "ZM",
    });
    assert.equal(ch.ok, true, ch.message);
    church = ch.records.church;

    const actor = await createBlessBoardUser(pool, {
      email: "actor-11g@example.test",
      displayName: "Actor 11G",
      password: PASSWORD,
      status: "active",
    });
    assert.equal(actor.ok, true, actor.message);
    actorId = actor.user.id;
    const role = await assignBlessBoardRole(pool, {
      email: "actor-11g@example.test",
      organizationKey: "otp-workflows-11g",
      churchKey: "otp-workflows-11g",
      roleKey: "church_hq_admin",
    });
    assert.equal(role.ok, true, role.message);
  });

  after(async () => {
    clearTestOtpStore();
    if (pool) await pool.end();
  });

  it("activates phone-only invitation via purpose-bound OTP then phone login", async () => {
    const invited = await createScopedTeamMember(pool, {
      organizationId: org.id,
      churchId: church.id,
      actorUserId: actorId,
      firstName: "Invite",
      lastName: "Otp",
      phone: "0978000111",
      placement: "hq",
      roleKey: "church_hq_admin",
      invitationAcceptBase: "https://example.test/accept",
      deploymentCode: DEPLOYMENT,
      actorSource: "platform_admin",
    });
    assert.equal(invited.ok, true, invited.reason || invited.message);
    assert.ok(invited.rawToken);

    const wrongPhone = await startInvitationActivationOtp(
      pool,
      { token: invited.rawToken, phone: "0978000999" },
      otpEnv
    );
    assert.equal(wrongPhone.ok, false);

    const started = await startInvitationActivationOtp(
      pool,
      { token: invited.rawToken, phone: "0978000111" },
      otpEnv
    );
    assert.equal(started.ok, true, started.reason);
    assert.ok(started.testCode);

    // Password-recovery purpose cannot verify invitation OTP.
    const wrongPurpose = await checkVerification(
      pool,
      {
        verificationId: started.challenge.id,
        purpose: "password_recovery",
        code: started.testCode,
      },
      otpEnv
    );
    assert.equal(wrongPurpose.ok, false);

    const completed = await completeInvitationActivation(
      pool,
      {
        token: invited.rawToken,
        verificationId: started.challenge.id,
        code: started.testCode,
        password: PASSWORD,
      },
      otpEnv
    );
    assert.equal(completed.ok, true, completed.reason || completed.message);
    assert.equal(completed.phoneVerified, true);

    const auth = await authenticateBlessBoardUser(pool, {
      identifier: "0978000111",
      password: PASSWORD,
      deploymentCode: DEPLOYMENT,
    });
    assert.equal(auth.ok, true, auth.message);
    assert.equal(auth.phoneStatus, "phone_verified");
  });

  it("verifies phone on email-only account and recovers password by phone OTP", async () => {
    const emailUser = await createBlessBoardUser(pool, {
      email: "email-otp-11g@example.test",
      displayName: "Email OTP",
      password: PASSWORD,
      status: "active",
    });
    assert.equal(emailUser.ok, true);
    await assignBlessBoardRole(pool, {
      email: "email-otp-11g@example.test",
      organizationKey: "otp-workflows-11g",
      churchKey: "otp-workflows-11g",
      roleKey: "church_hq_admin",
    });

    const verifyStart = await startAccountPhoneVerification(
      pool,
      {
        userId: emailUser.user.id,
        phone: "0978000222",
        organizationId: org.id,
      },
      otpEnv
    );
    assert.equal(verifyStart.ok, true, verifyStart.reason);
    const verified = await completeAccountPhoneVerification(
      pool,
      {
        userId: emailUser.user.id,
        verificationId: verifyStart.challenge.id,
        code: verifyStart.testCode,
        purpose: "phone_verification",
      },
      otpEnv
    );
    assert.equal(verified.ok, true, verified.reason);

    const session = await authenticateBlessBoardUser(pool, {
      identifier: "0978000222",
      password: PASSWORD,
      deploymentCode: DEPLOYMENT,
    });
    assert.equal(session.ok, true);
    assert.ok(session.session);

    const recovery = await startPhonePasswordRecovery(
      pool,
      { phone: "0978000222" },
      otpEnv
    );
    assert.equal(recovery.ok, true);
    assert.equal(recovery.sent, true);
    assert.ok(recovery.testCode);

    // Invitation OTP purpose cannot complete recovery.
    const invitePurpose = await checkVerification(
      pool,
      {
        verificationId: recovery.challenge.id,
        purpose: "invitation_activation",
        code: recovery.testCode,
      },
      otpEnv
    );
    assert.equal(invitePurpose.ok, false);

    const reset = await completePhonePasswordRecovery(
      pool,
      {
        verificationId: recovery.challenge.id,
        code: recovery.testCode,
        password: NEW_PASSWORD,
        passwordConfirm: NEW_PASSWORD,
      },
      otpEnv
    );
    assert.equal(reset.ok, true, reset.reason);
    assert.ok(reset.sessionsRevoked >= 1);

    const oldDenied = await authenticateBlessBoardUser(pool, {
      identifier: "0978000222",
      password: PASSWORD,
      deploymentCode: DEPLOYMENT,
    });
    assert.equal(oldDenied.ok, false);

    const newOk = await authenticateBlessBoardUser(pool, {
      identifier: "0978000222",
      password: NEW_PASSWORD,
      deploymentCode: DEPLOYMENT,
    });
    assert.equal(newOk.ok, true, newOk.message);
  });

  it("keeps suspended users suspended after recovery attempt", async () => {
    const hash = await bcrypt.hash(PASSWORD, 4);
    const suspended = await pool.query(
      `INSERT INTO blessboard.users
         (email_normalized, email_display, display_name, password_hash, status,
          phone_normalized, phone_display, phone_verified_at)
       VALUES ('suspended-11g@example.test', 'suspended-11g@example.test', 'Suspended',
               $1, 'suspended', '+260978000333', '0978000333', now())
       RETURNING id`,
      [hash]
    );
    const recovery = await startPhonePasswordRecovery(
      pool,
      { phone: "0978000333" },
      otpEnv
    );
    assert.equal(recovery.ok, true);
    assert.equal(recovery.sent, false);
    void suspended;
  });
});
