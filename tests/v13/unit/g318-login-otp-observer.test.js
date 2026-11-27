"use strict";

/**
 * G318 BlessBoard login OTP observer guards.
 * No PostgreSQL and no network. Production and a missing fixture fail closed.
 */

const { describe, it, beforeEach, afterEach } = require("node:test");
const assert = require("node:assert/strict");
const {
  loginOtpObserverAuthorized,
  rememberLoginOtpCode,
  peekLoginOtpCode,
  clearLoginOtpObserverStore,
  observeLoginOtpDelivery,
} = require("../../../src/platform/otp/otpQaLoginObserver");
const { resolveOtpProvider } = require("../../../src/platform/otp/otpProviders");
const { assertOtpProductionStartup } = require("../../../src/platform/otp/otpEnvironment");
const { beginMemberLoginChallenge } = require("../../../src/blessboard/services/blessBoardMemberLoginOtp");

const ATTEMPT = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const CODE = "482913";

function testingEnv(extra) {
  return {
    NODE_ENV: "test",
    DEPLOYMENT_ENV: "testing",
    DATABASE_IDENTITY_ENV: "testing",
    PLATFORM_DEPLOYMENT_CODE: "moovex-platform-testing",
    GETPRO_BB_LOGIN_OTP_OBSERVER: "1",
    GETPRO_V13_BROWSER_AUTHORIZED: "1",
    GETPRO_V13_DB_STAGES_AUTHORIZED: "1",
    GETPRO_OTP_ACTIVATION: "ACTIVE",
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

describe("G318 login OTP observer", () => {
  beforeEach(() => {
    clearLoginOtpObserverStore();
  });

  afterEach(() => {
    clearLoginOtpObserverStore();
  });

  it("rejects the observer in production", () => {
    const env = productionEnv();
    assert.equal(loginOtpObserverAuthorized(env), false);
    assert.equal(rememberLoginOtpCode(ATTEMPT, CODE, env), false);
    assert.equal(peekLoginOtpCode(ATTEMPT, env), null);
    assert.equal(resolveOtpProvider(env).name, "inactive");
    const hidden = observeLoginOtpDelivery({
      env,
      remoteAddress: "127.0.0.1",
      attemptId: ATTEMPT,
    });
    assert.equal(hidden.status, 404);
    assert.equal(hidden.body.error, "not_found");
    assert.equal(Object.prototype.hasOwnProperty.call(hidden.body, "code"), false);
    assert.throws(() => assertOtpProductionStartup(env), /otp_test_config_forbidden/);
  });

  it("fails closed when the observer fixture is missing", () => {
    const env = testingEnv({ GETPRO_BB_LOGIN_OTP_OBSERVER: "" });
    assert.equal(loginOtpObserverAuthorized(env), false);
    assert.equal(rememberLoginOtpCode(ATTEMPT, CODE, env), false);
    assert.equal(resolveOtpProvider(env).name, "inactive");
    const hidden = observeLoginOtpDelivery({
      env,
      remoteAddress: "127.0.0.1",
      attemptId: ATTEMPT,
    });
    assert.equal(hidden.status, 404);
    assert.equal(JSON.stringify(hidden.body).includes(CODE), false);
  });

  it("rejects a non-loopback observer read and keeps the captured code off the response", () => {
    const env = testingEnv();
    assert.equal(rememberLoginOtpCode(ATTEMPT, CODE, env), true);
    const remote = observeLoginOtpDelivery({
      env,
      remoteAddress: "203.0.113.8",
      attemptId: ATTEMPT,
    });
    assert.equal(remote.status, 404);
    assert.equal(JSON.stringify(remote.body).includes(CODE), false);
    const missing = observeLoginOtpDelivery({
      env,
      remoteAddress: "127.0.0.1",
      attemptId: "",
    });
    assert.equal(missing.status, 400);
    assert.equal(JSON.stringify(missing.body).includes(CODE), false);
    const found = observeLoginOtpDelivery({
      env,
      remoteAddress: "::ffff:127.0.0.1",
      attemptId: ATTEMPT,
    });
    assert.equal(found.status, 200);
    assert.equal(found.body.code, CODE);
  });

  it("accepts observer delivery only while the fixture is authorized", async () => {
    const binding = {
      organizationId: "11111111-1111-4111-8111-111111111111",
      accountId: "22222222-2222-4222-8222-222222222222",
      churchId: "church-d161",
      memberId: "member-d161",
      destination: "member.d161@example.test",
    };
    const service = {
      async beginChallenge() {
        return {
          server: {
            attemptId: ATTEMPT,
            reason: "qa_observer_accepted",
            sessionComplete: false,
          },
        };
      },
    };
    const observerOnly = testingEnv();
    delete observerOnly.GETPRO_OTP_ACTIVATION;
    const open = await beginMemberLoginChallenge(binding, observerOnly, service);
    assert.equal(open.deliveryAccepted, true);
    assert.equal(open.sessionAllowed, false);
    const closed = await beginMemberLoginChallenge(
      binding,
      testingEnv({ GETPRO_BB_LOGIN_OTP_OBSERVER: "" }),
      service
    );
    assert.equal(closed.deliveryAccepted, false);
    assert.equal(closed.sessionAllowed, false);
  });

  it("does not store the wrong-code sentinel", () => {
    assert.equal(rememberLoginOtpCode(ATTEMPT, "000000", testingEnv()), false);
    assert.equal(peekLoginOtpCode(ATTEMPT, testingEnv()), null);
  });
});
