"use strict";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("crypto");
const { createOtpService } = require("../../../src/platform/otp/otpService");
const { createFakeOtpProvider, resolveOtpProvider } = require("../../../src/platform/otp/otpProviders");
const { resolveOtpActivation } = require("../../../src/platform/otp/otpActivation");
const {
  createResendOtpEmailTransport,
  assertQaRecipientAllowed,
} = require("../../../src/platform/email/resendOtpTransport");
const {
  beginEligibleRecoveryOtp,
  completeEligibleRecoveryOtp,
} = require("../../../src/platform/otp/otpPasswordRecoveryBridge");

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

function productionEnv(extra) {
  return {
    NODE_ENV: "production",
    DEPLOYMENT_ENV: "production",
    DATABASE_IDENTITY_ENV: "production",
    PLATFORM_DEPLOYMENT_CODE: "moovex-platform-production",
    DATABASE_IDENTITY_EXPECTED: "moovex-platform-v7",
    ...(extra || {}),
  };
}

describe("G280 email OTP security matrix", () => {
  it("keeps production activation blocked even when GETPRO_OTP_ACTIVATION=ACTIVE", () => {
    const activation = resolveOtpActivation(
      productionEnv({ GETPRO_OTP_ACTIVATION: "ACTIVE" }),
      "ACTIVE"
    );
    assert.equal(activation.status, "BLOCKED");
  });

  it("honors non-production GETPRO_OTP_ACTIVATION=ACTIVE without deliveryActivated", () => {
    const env = testingEnv({ GETPRO_OTP_ACTIVATION: "ACTIVE" });
    assert.equal(resolveOtpActivation(env).status, "ACTIVE");
    assert.equal(resolveOtpProvider(env).deliveryActivated, false);
  });

  it("rejects hosted-QA recipients outside the allowlist and missing allowlist", async () => {
    const missing = assertQaRecipientAllowed(
      testingEnv({ GETPRO_RESEND_SENDER_PROFILE: "hosted-qa" }),
      "qa@example.com"
    );
    assert.equal(missing.ok, false);
    assert.equal(missing.reason, "qa_recipient_allowlist_missing");

    const denied = assertQaRecipientAllowed(
      testingEnv({
        GETPRO_RESEND_SENDER_PROFILE: "hosted-qa",
        GETPRO_RESEND_QA_RECIPIENTS: "allowed@pronline.org",
      }),
      "other@pronline.org"
    );
    assert.equal(denied.ok, false);
    assert.equal(denied.reason, "qa_recipient_not_allowlisted");

    const transport = createResendOtpEmailTransport(
      testingEnv({
        GETPRO_RESEND_SENDER_PROFILE: "hosted-qa",
        GETPRO_RESEND_VERIFIED_DOMAINS: "pronline.org",
        GETPRO_RESEND_QA_RECIPIENTS: "allowed@pronline.org",
        RESEND_API_KEY: "re_test_not_real",
      }),
      {
        fetchImpl: async () => {
          throw new Error("network_should_not_run");
        },
      }
    );
    const blocked = await transport({
      productCode: "activeclinic",
      destination: "blocked@pronline.org",
      text: "Your verification code is 1234. It expires in 5 minutes.",
      idempotencyKey: crypto.randomUUID(),
    });
    assert.equal(blocked.ok, false);
    assert.equal(blocked.reason, "qa_recipient_not_allowlisted");
  });

  it("completes recovery OTP once and rejects replay without creating a session on verify", async () => {
    const env = testingEnv({ GETPRO_OTP_ACTIVATION: "ACTIVE" });
    const service = createOtpService({ provider: createFakeOtpProvider() });
    const started = await beginEligibleRecoveryOtp(
      {
        workflow: "activeclinic.forgot_password",
        service,
        env,
        found: true,
        organizationId: ORG,
        accountId: ACCOUNT,
        identifier: "staff@example.com",
        channel: "email",
      },
      env
    );
    assert.equal(started.requireCode, true);
    assert.ok(started.attemptId);
    assert.equal(started.gate.sessionComplete, false);

    const completed = await completeEligibleRecoveryOtp(
      {
        workflow: "activeclinic.forgot_password",
        service,
        env,
        organizationId: ORG,
        accountId: ACCOUNT,
        identifier: "staff@example.com",
        channel: "email",
        attemptId: started.attemptId,
        code: "1234",
      },
      env
    );
    assert.equal(completed.gate.sessionComplete, true);

    const replay = await completeEligibleRecoveryOtp(
      {
        workflow: "activeclinic.forgot_password",
        service,
        env,
        organizationId: ORG,
        accountId: ACCOUNT,
        identifier: "staff@example.com",
        channel: "email",
        attemptId: started.attemptId,
        code: "1234",
      },
      env
    );
    assert.equal(replay.gate.sessionComplete, false);
  });

  it("fails closed for missing pepper and unverified Resend domain", async () => {
    const service = createOtpService({ provider: createFakeOtpProvider() });
    const missingPepper = await service.beginChallenge(
      {
        action: "auth.password_recovery",
        productCode: "blessboard",
        organizationId: ORG,
        accountId: ACCOUNT,
        channel: "email",
        identifier: "hq@example.com",
        accountResolved: true,
      },
      testingEnv({ GETPRO_OTP_PEPPER: "" })
    );
    assert.equal(missingPepper.server.reason, "pepper");

    const transport = createResendOtpEmailTransport(
      testingEnv({
        GETPRO_RESEND_SENDER_PROFILE: "hosted-qa",
        GETPRO_RESEND_VERIFIED_DOMAINS: "notify.pronline.org",
        GETPRO_RESEND_QA_RECIPIENTS: "qa@pronline.org",
        RESEND_API_KEY: "re_test_not_real",
      })
    );
    const wrongDomain = await transport({
      productCode: "activeclinic",
      destination: "qa@pronline.org",
      text: "Your verification code is 1234. It expires in 5 minutes.",
      idempotencyKey: crypto.randomUUID(),
    });
    assert.equal(wrongDomain.ok, false);
    assert.equal(wrongDomain.reason, "domain_not_verified");
  });
});
