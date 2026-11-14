"use strict";

const { describe, it, afterEach } = require("node:test");
const assert = require("node:assert/strict");

const {
  createOtpService,
  generateProductionOtpCode,
  setOtpRandomIntForTests,
  PUBLIC_ACCEPTED,
} = require("../../../src/platform/otp/otpService");
const { isFixedOtpPermitted, assertOtpProductionStartup } = require("../../../src/platform/otp/otpEnvironment");
const { createOtpProvider } = require("../../../src/platform/otp/otpProviders");
const { OTP_POLICY } = require("../../../src/platform/otp/otpPolicy");

const PEPPER = "unit-test-otp-pepper-32b-minimum!!";
const ORG = "11111111-1111-4111-8111-111111111111";
const OTHER_ORG = "33333333-3333-4333-8333-333333333333";
const ACCOUNT = "22222222-2222-4222-8222-222222222222";
const SESSION = "44444444-4444-4444-8444-444444444444";

function testingEnv(extra) {
  return {
    NODE_ENV: "test",
    DEPLOYMENT_ENV: "testing",
    DATABASE_IDENTITY_ENV: "testing",
    DATABASE_IDENTITY_EXPECTED: "moovex-platform-v7",
    PLATFORM_DEPLOYMENT_CODE: "moovex-platform-testing",
    GETPRO_OTP_ALLOW_FIXED_CODE: "1",
    GETPRO_OTP_PEPPER: PEPPER,
    ...extra,
  };
}

function productionEnv(extra) {
  return {
    NODE_ENV: "production",
    DEPLOYMENT_ENV: "production",
    DATABASE_IDENTITY_ENV: "production",
    DATABASE_IDENTITY_EXPECTED: "moovex-platform-v7",
    PLATFORM_DEPLOYMENT_CODE: "moovex-platform-production",
    GETPRO_OTP_PEPPER: PEPPER,
    ...extra,
  };
}

function clockAt(start) {
  let now = start;
  return {
    clock: () => now,
    advance(ms) {
      now += ms;
    },
  };
}

function noCode(value) {
  const json = JSON.stringify(value);
  assert.equal(Object.prototype.hasOwnProperty.call(value, "code"), false);
  assert.equal(json.includes("otp_code"), false);
  if (value && typeof value === "object") {
    assert.equal(value.code, undefined);
    assert.equal(value.otp, undefined);
    assert.equal(value.codeHash, undefined);
  }
}

afterEach(() => {
  setOtpRandomIntForTests(null);
});

describe("D14A shared OTP", () => {
  it("issues a testing code only for a verified testing deployment and keeps it out of the response", async () => {
    assert.equal(isFixedOtpPermitted(testingEnv()), true);
    assert.equal(isFixedOtpPermitted(testingEnv({ GETPRO_OTP_ALLOW_FIXED_CODE: "0" })), false);
    assert.equal(
      isFixedOtpPermitted(testingEnv({ PLATFORM_DEPLOYMENT_CODE: "blessboard-pronline-testing" })),
      false
    );
    assert.equal(isFixedOtpPermitted(productionEnv({ GETPRO_OTP_ALLOW_FIXED_CODE: "1" })), false);
    assert.equal(createOtpProvider().deliveryActivated, false);

    const logs = [];
    let delivered = 0;
    const provider = {
      name: "inactive",
      deliveryActivated: false,
      async deliver() {
        delivered += 1;
        return { ok: true };
      },
    };
    const otp = createOtpService({ log: (event) => logs.push(event), provider });
    const started = await otp.beginChallenge(
      {
        action: "auth.login",
        productCode: "blessboard",
        channel: "email",
        organizationId: ORG,
        accountId: ACCOUNT,
        identifier: "member@example.com",
        accountResolved: true,
        context: "203.0.113.5",
      },
      testingEnv()
    );
    assert.deepEqual(started.public, PUBLIC_ACCEPTED);
    assert.equal(started.server.sessionComplete, false);
    assert.equal(started.server.delivery, "not_activated");
    assert.equal(delivered, 0);
    noCode(started.public);
    noCode(started.server);
    noCode(logs[0]);

    const missing = await otp.beginChallenge(
      {
        action: "auth.login",
        productCode: "activeclinic",
        channel: "sms",
        organizationId: ORG,
        accountId: ACCOUNT,
        identifier: "+260971234567",
        accountResolved: false,
      },
      testingEnv()
    );
    assert.deepEqual(missing.public, started.public);

    const verified = await otp.verifyChallenge(
      {
        action: "auth.login",
        productCode: "blessboard",
        channel: "email",
        organizationId: ORG,
        accountId: ACCOUNT,
        attemptId: started.server.attemptId,
        code: OTP_POLICY.testingCode,
      },
      testingEnv()
    );
    assert.equal(verified.server.reason, "verified");
    assert.equal(verified.server.sessionComplete, false);
    noCode(verified.public);
    const completed = otp.completeProtectedAction(verified, "auth.login");
    assert.equal(completed.sessionComplete, true);
    assert.equal(otp.completeProtectedAction(verified, "auth.login").sessionComplete, false);
    const replay = await otp.verifyChallenge(
      {
        action: "auth.login",
        productCode: "blessboard",
        channel: "email",
        organizationId: ORG,
        accountId: ACCOUNT,
        attemptId: started.server.attemptId,
        code: OTP_POLICY.testingCode,
      },
      testingEnv()
    );
    assert.equal(replay.server.reason, "replay");
    assert.equal(replay.server.sessionComplete, false);
  });

  it("rejects expiry, resend flooding, wrong purpose, cross-tenant use, and a fifth failed attempt", async () => {
    const time = clockAt(1_700_000_000_000);
    const otp = createOtpService({ clock: time.clock });
    const env = testingEnv();
    const started = await otp.beginChallenge(
      {
        action: "auth.password_recovery",
        productCode: "activeclinic",
        channel: "email",
        organizationId: ORG,
        accountId: ACCOUNT,
        identifier: "clinic@example.com",
        accountResolved: true,
      },
      env
    );
    const again = await otp.beginChallenge(
      {
        action: "auth.password_recovery",
        productCode: "activeclinic",
        channel: "email",
        organizationId: ORG,
        accountId: ACCOUNT,
        identifier: "clinic@example.com",
        accountResolved: true,
      },
      env
    );
    assert.equal(again.server.reason, "resend_cooldown");
    assert.deepEqual(again.public, PUBLIC_ACCEPTED);

    const wrongPurpose = await otp.verifyChallenge(
      {
        action: "auth.password_recovery",
        purpose: "login",
        productCode: "activeclinic",
        channel: "email",
        organizationId: ORG,
        accountId: ACCOUNT,
        attemptId: started.server.attemptId,
        code: "1234",
      },
      env
    );
    assert.equal(wrongPurpose.server.reason, "wrong_purpose");

    const otherTenant = await otp.verifyChallenge(
      {
        action: "auth.password_recovery",
        productCode: "activeclinic",
        channel: "email",
        organizationId: OTHER_ORG,
        accountId: ACCOUNT,
        attemptId: started.server.attemptId,
        code: "1234",
      },
      env
    );
    assert.equal(otherTenant.server.reason, "cross_tenant");

    time.advance(OTP_POLICY.ttlSeconds * 1000 + 1);
    const expired = await otp.verifyChallenge(
      {
        action: "auth.password_recovery",
        productCode: "activeclinic",
        channel: "email",
        organizationId: ORG,
        accountId: ACCOUNT,
        attemptId: started.server.attemptId,
        code: "1234",
      },
      env
    );
    assert.equal(expired.server.reason, "expired");
    assert.equal(otp.completeProtectedAction(expired, "auth.password_recovery").sessionComplete, false);

    const fresh = clockAt(1_700_000_000_000);
    const attempts = createOtpService({ clock: fresh.clock });
    const issued = await attempts.beginChallenge(
      {
        action: "auth.account_activation",
        productCode: "blessboard",
        channel: "sms",
        organizationId: ORG,
        accountId: ACCOUNT,
        identifier: "+260971234567",
        accountResolved: true,
      },
      env
    );
    for (let i = 0; i < 5; i += 1) {
      const failed = await attempts.verifyChallenge(
        {
          action: "auth.account_activation",
          productCode: "blessboard",
          channel: "sms",
          organizationId: ORG,
          accountId: ACCOUNT,
          attemptId: issued.server.attemptId,
          code: "000000",
        },
        env
      );
      assert.equal(failed.server.reason, i === 4 ? "exhausted" : "invalid_code");
    }
    const sixth = await attempts.verifyChallenge(
      {
        action: "auth.account_activation",
        productCode: "blessboard",
        channel: "sms",
        organizationId: ORG,
        accountId: ACCOUNT,
        attemptId: issued.server.attemptId,
        code: "1234",
      },
      env
    );
    assert.equal(sixth.server.reason, "exhausted");
    assert.equal(sixth.server.sessionComplete, false);
  });

  it("rate limits by account and does not complete an admin action without the bound session", async () => {
    const time = clockAt(1_700_000_000_000);
    const otp = createOtpService({ clock: time.clock });
    const env = testingEnv();
    let last = null;
    for (let i = 0; i < 5; i += 1) {
      if (i > 0) time.advance(OTP_POLICY.resendCooldownSeconds * 1000);
      last = await otp.beginChallenge(
        {
          action: "admin.role_change",
          productCode: "blessboard",
          channel: "email",
          organizationId: ORG,
          accountId: ACCOUNT,
          sessionId: SESSION,
          identifier: "admin@example.com",
          context: "198.51.100.10",
        },
        env
      );
      assert.equal(last.server.issued, true);
    }
    time.advance(OTP_POLICY.resendCooldownSeconds * 1000);
    const limited = await otp.beginChallenge(
      {
        action: "admin.role_change",
        productCode: "blessboard",
        channel: "email",
        organizationId: ORG,
        accountId: ACCOUNT,
        sessionId: SESSION,
        identifier: "admin@example.com",
        context: "198.51.100.10",
      },
      env
    );
    assert.equal(limited.server.reason, "rate_limited");
    assert.equal(limited.server.sessionComplete, false);

    const verified = await otp.verifyChallenge(
      {
        action: "admin.role_change",
        productCode: "blessboard",
        channel: "email",
        organizationId: ORG,
        accountId: ACCOUNT,
        sessionId: SESSION,
        attemptId: last.server.attemptId,
        code: "1234",
      },
      env
    );
    assert.equal(verified.server.reason, "verified");
    const withoutSession = await otp.verifyChallenge(
      {
        action: "admin.security_setting",
        productCode: "blessboard",
        channel: "email",
        organizationId: ORG,
        accountId: ACCOUNT,
        attemptId: last.server.attemptId,
        code: "1234",
      },
      env
    );
    assert.notEqual(withoutSession.server.sessionComplete, true);
    const done = otp.completeProtectedAction(verified, "admin.role_change");
    assert.equal(done.sessionComplete, true);
    assert.equal(otp.completeProtectedAction(verified, "admin.member_export").sessionComplete, false);
  });

  it("rejects the testing code in production and refuses a test configuration at startup", async () => {
    const sequence = [1234, 482913];
    const code = generateProductionOtpCode(() => sequence.shift());
    assert.equal(code, "482913");
    assert.throws(() => generateProductionOtpCode(() => 1234), /otp_generation_failed/);

    const otp = createOtpService();
    const started = await otp.beginChallenge(
      {
        action: "auth.login",
        productCode: "activeclinic",
        channel: "email",
        organizationId: ORG,
        accountId: ACCOUNT,
        identifier: "person@example.com",
        accountResolved: true,
      },
      productionEnv()
    );
    assert.equal(started.server.issued, true);
    const rejected = await otp.verifyChallenge(
      {
        action: "auth.login",
        productCode: "activeclinic",
        channel: "email",
        organizationId: ORG,
        accountId: ACCOUNT,
        attemptId: started.server.attemptId,
        code: "1234",
      },
      productionEnv()
    );
    assert.equal(rejected.server.reason, "testing_code_rejected");
    assert.equal(otp.completeProtectedAction(rejected, "auth.login").sessionComplete, false);
    for (const event of otp.store.audits()) {
      assert.equal(event.code, undefined);
      assert.equal(event.otp, undefined);
      assert.equal(event.codeHash, undefined);
    }

    assert.throws(
      () => assertOtpProductionStartup(productionEnv({ GETPRO_OTP_ALLOW_FIXED_CODE: "1" })),
      /otp_test_config_forbidden/
    );
    assert.doesNotThrow(() => assertOtpProductionStartup(productionEnv()));
    const shortPepper = await otp.beginChallenge(
      {
        action: "auth.login",
        productCode: "blessboard",
        channel: "email",
        organizationId: ORG,
        accountId: ACCOUNT,
        identifier: "person@example.com",
        accountResolved: true,
      },
      productionEnv({ GETPRO_OTP_PEPPER: "short", SESSION_SECRET: "" })
    );
    assert.equal(shortPepper.server.reason, "pepper");
    assert.equal(shortPepper.server.sessionComplete, false);
  });
});
