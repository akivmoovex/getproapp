"use strict";

/**
 * ActiveClinic recovery OTP observer and fail-closed provider checks.
 * No PostgreSQL and no network. Production and a missing fixture fail closed.
 */

const { describe, it, beforeEach, afterEach } = require("node:test");
const assert = require("node:assert/strict");
const {
  loginOtpObserverAuthorized,
  acRecoveryOtpObserverAuthorized,
  rememberLoginOtpCode,
  clearLoginOtpObserverStore,
  observeLoginOtpDelivery,
} = require("../../../src/platform/otp/otpQaLoginObserver");
const { resolveOtpProvider } = require("../../../src/platform/otp/otpProviders");
const { assertOtpProductionStartup } = require("../../../src/platform/otp/otpEnvironment");
const { beginEligibleRecoveryOtp } = require("../../../src/platform/otp/otpPasswordRecoveryBridge");

const ATTEMPT = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const CODE = "593024";
const ORG = "11111111-1111-4111-8111-111111111111";
const ACCOUNT = "22222222-2222-4222-8222-222222222222";

function testingEnv(extra) {
  return {
    NODE_ENV: "test",
    DEPLOYMENT_ENV: "testing",
    DATABASE_IDENTITY_ENV: "testing",
    PLATFORM_DEPLOYMENT_CODE: "moovex-platform-testing",
    GETPRO_AC_RECOVERY_OTP_OBSERVER: "1",
    GETPRO_V13_BROWSER_AUTHORIZED: "1",
    GETPRO_V13_DB_STAGES_AUTHORIZED: "1",
    GETPRO_OTP_PROVIDER: "qa-observer",
    ...(extra || {}),
  };
}

function productionEnv(extra) {
  return testingEnv({
    NODE_ENV: "production",
    DEPLOYMENT_ENV: "production",
    DATABASE_IDENTITY_ENV: "production",
    PLATFORM_DEPLOYMENT_CODE: "moovex-platform-production",
    ...(extra || {}),
  });
}

describe("G319 ActiveClinic recovery OTP", () => {
  beforeEach(() => {
    clearLoginOtpObserverStore();
  });

  afterEach(() => {
    clearLoginOtpObserverStore();
  });

  it("rejects the recovery observer in production", () => {
    const env = productionEnv();
    assert.equal(acRecoveryOtpObserverAuthorized(env), false);
    assert.equal(rememberLoginOtpCode(ATTEMPT, CODE, env), false);
    assert.equal(resolveOtpProvider(env).name, "inactive");
    const hidden = observeLoginOtpDelivery({
      env,
      remoteAddress: "127.0.0.1",
      attemptId: ATTEMPT,
    });
    assert.equal(hidden.status, 404);
    assert.equal(Object.prototype.hasOwnProperty.call(hidden.body, "code"), false);
    assert.throws(() => assertOtpProductionStartup(env), /otp_test_config_forbidden/);
  });

  it("fails closed when the recovery fixture and provider are missing", async () => {
    const env = testingEnv({ GETPRO_AC_RECOVERY_OTP_OBSERVER: "" });
    delete env.GETPRO_OTP_PROVIDER;
    assert.equal(acRecoveryOtpObserverAuthorized(env), false);
    assert.equal(resolveOtpProvider({ ...env, GETPRO_OTP_PROVIDER: "qa-observer" }).name, "inactive");
    const inactive = {
      async beginChallenge() {
        return {
          public: { ok: false },
          server: {
            ok: false,
            issued: true,
            attemptId: ATTEMPT,
            reason: "delivery_not_activated",
            sessionComplete: false,
          },
        };
      },
    };
    const held = await beginEligibleRecoveryOtp(
      {
        workflow: "activeclinic.forgot_password",
        found: true,
        organizationId: ORG,
        accountId: ACCOUNT,
        identifier: "g319-missing@g319.v13d19.example",
        channel: "email",
        activation: "ACTIVE",
        service: inactive,
      },
      env
    );
    assert.equal(held.proceedWithLinkReset, false);
    assert.equal(held.requireCode, true);
    assert.equal(held.reason, "delivery_not_activated");
  });

  it("keeps the default recovery path on the reset link", async () => {
    const open = await beginEligibleRecoveryOtp(
      {
        workflow: "activeclinic.forgot_password",
        found: true,
        organizationId: ORG,
        accountId: ACCOUNT,
        identifier: "g319-link@g319.v13d19.example",
        channel: "email",
      },
      { NODE_ENV: "test", DEPLOYMENT_ENV: "testing" }
    );
    assert.equal(open.mode, "password_reset_link");
    assert.equal(open.proceedWithLinkReset, true);
    assert.equal(open.requireCode, false);
  });

  it("captures a recovery code only for the loopback fixture", () => {
    const env = testingEnv();
    assert.equal(loginOtpObserverAuthorized(env), false);
    assert.equal(acRecoveryOtpObserverAuthorized(env), true);
    assert.equal(rememberLoginOtpCode(ATTEMPT, CODE, env), true);
    assert.equal(resolveOtpProvider(env).name, "qa-observer");
    const remote = observeLoginOtpDelivery({
      env,
      remoteAddress: "203.0.113.8",
      attemptId: ATTEMPT,
    });
    assert.equal(remote.status, 404);
    assert.equal(Object.prototype.hasOwnProperty.call(remote.body, "code"), false);
    const local = observeLoginOtpDelivery({
      env,
      remoteAddress: "127.0.0.1",
      attemptId: ATTEMPT,
    });
    assert.equal(local.status, 200);
    assert.equal(local.body.code, CODE);
  });

  it("does not store the wrong-code sentinel", () => {
    assert.equal(rememberLoginOtpCode(ATTEMPT, "000000", testingEnv()), false);
    assert.equal(
      observeLoginOtpDelivery({
        env: testingEnv(),
        remoteAddress: "::ffff:127.0.0.1",
        attemptId: ATTEMPT,
      }).status,
      404
    );
  });
});
