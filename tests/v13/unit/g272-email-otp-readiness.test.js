"use strict";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");

const {
  diagnoseOtpReadiness,
  diagnoseOtpReadinessAsync,
} = require("../../../src/platform/otp/otpReadinessDiagnostics");
const { diagnoseResendOtpTransport } = require("../../../src/platform/email/resendOtpTransport");
const {
  evaluatePasswordRecoveryOtp,
} = require("../../../src/platform/otp/otpPasswordRecoveryBridge");
const { createOtpService } = require("../../../src/platform/otp/otpService");
const { createFakeOtpProvider } = require("../../../src/platform/otp/otpProviders");

const PEPPER = "unit-test-otp-pepper-32b-minimum!!";
const ORG = "11111111-1111-4111-8111-111111111111";
const ACCOUNT = "22222222-2222-4222-8222-222222222222";

function testingEnv(extra) {
  return {
    NODE_ENV: "test",
    DEPLOYMENT_ENV: "testing",
    DATABASE_IDENTITY_ENV: "testing",
    DATABASE_IDENTITY_EXPECTED: "moovex-platform-v7",
    PLATFORM_DEPLOYMENT_CODE: "moovex-platform-testing",
    GETPRO_OTP_ALLOW_FIXED_CODE: "1",
    GETPRO_OTP_PEPPER: PEPPER,
    GETPRO_OTP_PROVIDER: "fake",
    ...(extra || {}),
  };
}

describe("G272 email OTP readiness and recovery bridge", () => {
  it("reports fail-closed readiness without inventing Resend verification or leaking secrets", () => {
    const report = diagnoseOtpReadiness(testingEnv({ GETPRO_OTP_PROVIDER: "resend" }));
    assert.equal(report.activation, "BLOCKED");
    assert.equal(report.deliveryActivated, false);
    assert.equal(report.resendApiKeyConfigured, false);
    assert.equal(report.migration048Present, false);
    assert.equal(report.recoveryMode, "password_reset_link");
    assert.equal(report.emailOtpQaGoNoGo, "NO-GO");
    assert.equal(report.liveMailboxAuthorized, false);
    assert.ok(report.blockers.includes("resend_api_key_missing"));
    assert.equal(JSON.stringify(report).includes(PEPPER), false);
    assert.equal(fs.existsSync(path.join(__dirname, "../../../db/migrations/platform/048_otp_challenges.sql")), false);
  });

  it("diagnoses Resend transport preflight without sending mail", () => {
    const missing = diagnoseResendOtpTransport(testingEnv(), "activeclinic");
    assert.equal(missing.ok, false);
    assert.ok(missing.blockers.includes("missing_api_key"));
    assert.equal(missing.liveSendAuthorized, false);

    const configured = diagnoseResendOtpTransport(
      testingEnv({
        RESEND_API_KEY: "re_test_not_a_real_key",
        GETPRO_RESEND_VERIFIED_DOMAINS: "notify.activeclinic.org",
      }),
      "activeclinic"
    );
    assert.equal(configured.apiKeyConfigured, true);
    assert.equal(configured.senderOk, true);
    assert.equal(configured.ok, true);
    assert.equal(configured.liveSendAuthorized, false);
    assert.equal(JSON.stringify(configured).includes("re_test_not_a_real_key"), false);
  });

  it("keeps password recovery on reset links while activation is blocked", async () => {
    const result = await evaluatePasswordRecoveryOtp({
      workflow: "activeclinic.forgot_password",
      env: testingEnv(),
    });
    assert.equal(result.mode, "password_reset_link");
    assert.equal(result.proceedWithLinkReset, true);
    assert.equal(result.requireCode, false);
  });

  it("requires a code challenge once recovery OTP is ACTIVE for a resolved account", async () => {
    const env = testingEnv();
    const service = createOtpService({ provider: createFakeOtpProvider() });
    const held = await evaluatePasswordRecoveryOtp({
      workflow: "blessboard.forgot_password",
      activation: "ACTIVE",
      service,
      env,
      organizationId: ORG,
      accountId: ACCOUNT,
      channel: "email",
      identifier: "qa@example.com",
      accountResolved: true,
    });
    assert.equal(held.mode, "code_otp_required");
    assert.equal(held.requireCode, true);
    assert.ok(held.attemptId);

    const verified = await evaluatePasswordRecoveryOtp({
      workflow: "blessboard.forgot_password",
      activation: "ACTIVE",
      service,
      env,
      organizationId: ORG,
      accountId: ACCOUNT,
      channel: "email",
      identifier: "qa@example.com",
      accountResolved: true,
      verification: { attemptId: held.attemptId, code: "1234" },
    });
    assert.equal(verified.gate.sessionComplete, true);
    assert.equal(verified.proceedWithLinkReset, true);

    const replay = await evaluatePasswordRecoveryOtp({
      workflow: "blessboard.forgot_password",
      activation: "ACTIVE",
      service,
      env,
      organizationId: ORG,
      accountId: ACCOUNT,
      channel: "email",
      identifier: "qa@example.com",
      accountResolved: true,
      verification: { attemptId: held.attemptId, code: "1234" },
    });
    assert.equal(replay.gate.sessionComplete, false);
    assert.equal(replay.requireCode, true);
  });

  it("suppresses unresolved recovery accounts without blocking the neutral link path", async () => {
    const env = testingEnv();
    const service = createOtpService({ provider: createFakeOtpProvider() });
    const result = await evaluatePasswordRecoveryOtp({
      workflow: "activeclinic.forgot_password",
      activation: "ACTIVE",
      service,
      env,
      identifier: "missing@example.com",
    });
    assert.equal(result.proceedWithLinkReset, true);
    assert.equal(result.requireCode, false);
    assert.equal(result.gate.reason, "account_unresolved_suppressed");
  });

  it("async diagnostics probe tables when a pool is supplied", async () => {
    const pool = {
      async query() {
        return { rows: [{ otp_challenges: true, otp_rate_buckets: true }] };
      },
    };
    const report = await diagnoseOtpReadinessAsync(testingEnv(), { pool });
    assert.equal(report.schemaTables.probed, true);
    assert.equal(report.schemaTables.otpChallenges, true);
    assert.equal(report.schemaTables.otpRateBuckets, true);
  });
});
