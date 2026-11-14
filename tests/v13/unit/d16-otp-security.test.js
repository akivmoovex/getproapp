"use strict";

/**
 * D16 OTP security negatives. Database-independent.
 * Production activation remains BLOCKED and is not treated as ready.
 */

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");

const {
  createOtpService,
  generateProductionOtpCode,
} = require("../../../src/platform/otp/otpService");
const {
  isFixedOtpPermitted,
  assertOtpProductionStartup,
} = require("../../../src/platform/otp/otpEnvironment");
const { resolveOtpActivation } = require("../../../src/platform/otp/otpActivation");
const { evaluateOtpSessionGate, holdIfOtpRequired } = require("../../../src/platform/otp/otpSessionGate");
const { resolveOtpProvider } = require("../../../src/platform/otp/otpProviders");
const { OTP_POLICY } = require("../../../src/platform/otp/otpPolicy");
const { issueAuthenticatedSessionCookie } = require("../../../src/platform/session/sharedSessionSecurity");
const { assignBlessBoardRole } = require("../../../src/blessboard/services/assignBlessBoardRole");

const PEPPER = "unit-test-otp-pepper-32b-minimum!!";
const ORG = "11111111-1111-4111-8111-111111111111";
const OTHER = "33333333-3333-4333-8333-333333333333";
const ACCOUNT = "22222222-2222-4222-8222-222222222222";
const OTHER_ACCOUNT = "55555555-5555-4555-8555-555555555555";
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

function noSecret(value) {
  const json = JSON.stringify(value);
  assert.equal(value && value.code, undefined);
  assert.equal(value && value.otp, undefined);
  assert.equal(json.includes("otp_code"), false);
}

describe("D16 OTP security", () => {
  it("refuses the fixed code and the fake provider in production", async () => {
    assert.equal(generateProductionOtpCode(() => 482913), "482913");
    assert.equal(generateProductionOtpCode(() => 482913).length, 6);
    assert.throws(() => generateProductionOtpCode(() => 1234), /otp_generation_failed/);
    assert.equal(isFixedOtpPermitted(productionEnv({ GETPRO_OTP_ALLOW_FIXED_CODE: "1" })), false);
    assert.equal(resolveOtpProvider(productionEnv({ GETPRO_OTP_PROVIDER: "fake" })).name, "inactive");
    assert.throws(
      () => assertOtpProductionStartup(productionEnv({ GETPRO_OTP_PROVIDER: "fake" })),
      /otp_test_config_forbidden/
    );

    const otp = createOtpService();
    const started = await otp.beginChallenge(
      {
        action: "auth.login",
        productCode: "blessboard",
        channel: "email",
        organizationId: ORG,
        accountId: ACCOUNT,
        identifier: "member@example.com",
        accountResolved: true,
      },
      productionEnv()
    );
    const rejected = await otp.verifyChallenge(
      {
        action: "auth.login",
        productCode: "blessboard",
        channel: "email",
        organizationId: ORG,
        accountId: ACCOUNT,
        attemptId: started.server.attemptId,
        code: "1234",
      },
      productionEnv()
    );
    assert.equal(rejected.server.reason, "testing_code_rejected");
    assert.equal(rejected.server.sessionComplete, false);
    noSecret(rejected.public);
    noSecret(rejected.server);
    for (const event of otp.store.audits()) {
      assert.equal(event.code, undefined);
      assert.equal(event.codeHash, undefined);
    }
  });

  it("accepts 1234 only for a verified testing deployment and keeps activation blocked in production", async () => {
    assert.equal(isFixedOtpPermitted(testingEnv()), true);
    assert.equal(isFixedOtpPermitted(testingEnv({ GETPRO_OTP_ALLOW_FIXED_CODE: "0" })), false);
    assert.equal(
      isFixedOtpPermitted(testingEnv({ PLATFORM_DEPLOYMENT_CODE: "blessboard-pronline-testing" })),
      false
    );
    const activation = resolveOtpActivation(productionEnv(), "ACTIVE");
    assert.equal(activation.status, "BLOCKED");
    assert.ok(activation.reasons.includes("migration_not_applied"));
    assert.ok(activation.reasons.includes("provider_not_configured"));
    assert.ok(activation.reasons.includes("release_not_verified"));

    let began = 0;
    const blocked = await evaluateOtpSessionGate(
      {
        workflow: "blessboard.hq_administrator_login",
        activation: "ACTIVE",
        service: {
          async beginChallenge() {
            began += 1;
            throw new Error("must_not_start");
          },
        },
      },
      productionEnv()
    );
    assert.equal(blocked.activation, "BLOCKED");
    assert.equal(blocked.sessionAllowed, true);
    assert.equal(began, 0);
    assert.notEqual(blocked.activation, "READY");
  });

  it("enforces expiry, single use, attempt cap, cooldown, and bindings", async () => {
    const time = clockAt(1_700_000_000_000);
    const service = createOtpService({ clock: time.clock });
    const env = testingEnv();
    const logs = [];
    const logged = createOtpService({
      clock: time.clock,
      log(event) {
        logs.push(event);
      },
    });
    const first = await logged.beginChallenge(
      {
        action: "auth.login",
        productCode: "activeclinic",
        channel: "email",
        organizationId: ORG,
        accountId: ACCOUNT,
        identifier: "patient@example.com",
        accountResolved: true,
      },
      env
    );
    assert.equal(first.server.sessionComplete, false);
    noSecret(first.public);
    assert.equal(logs.some((event) => event.code || event.codeHash), false);

    const again = await logged.beginChallenge(
      {
        action: "auth.login",
        productCode: "activeclinic",
        channel: "email",
        organizationId: ORG,
        accountId: ACCOUNT,
        identifier: "patient@example.com",
        accountResolved: true,
      },
      env
    );
    assert.equal(again.server.reason, "resend_cooldown");

    const otherAccount = await logged.verifyChallenge(
      {
        action: "auth.login",
        productCode: "activeclinic",
        channel: "email",
        organizationId: ORG,
        accountId: OTHER_ACCOUNT,
        attemptId: first.server.attemptId,
        code: "1234",
      },
      env
    );
    assert.notEqual(otherAccount.server.sessionComplete, true);

    const otherTenant = await logged.verifyChallenge(
      {
        action: "auth.login",
        productCode: "activeclinic",
        channel: "email",
        organizationId: OTHER,
        accountId: ACCOUNT,
        attemptId: first.server.attemptId,
        code: "1234",
      },
      env
    );
    assert.equal(otherTenant.server.reason, "cross_tenant");

    const wrongPurpose = await logged.verifyChallenge(
      {
        action: "auth.login",
        purpose: "password_recovery",
        productCode: "activeclinic",
        channel: "email",
        organizationId: ORG,
        accountId: ACCOUNT,
        attemptId: first.server.attemptId,
        code: "1234",
      },
      env
    );
    assert.equal(wrongPurpose.server.reason, "wrong_purpose");

    const verified = await logged.verifyChallenge(
      {
        action: "auth.login",
        productCode: "activeclinic",
        channel: "email",
        organizationId: ORG,
        accountId: ACCOUNT,
        attemptId: first.server.attemptId,
        code: "1234",
      },
      env
    );
    assert.equal(verified.server.reason, "verified");
    assert.equal(logged.completeProtectedAction(verified, "admin.role_change").sessionComplete, false);
    const replay = await logged.verifyChallenge(
      {
        action: "auth.login",
        productCode: "activeclinic",
        channel: "email",
        organizationId: ORG,
        accountId: ACCOUNT,
        attemptId: first.server.attemptId,
        code: "1234",
      },
      env
    );
    assert.equal(replay.server.reason, "replay");

    const expiring = await service.beginChallenge(
      {
        action: "auth.password_recovery",
        productCode: "blessboard",
        channel: "email",
        organizationId: ORG,
        accountId: ACCOUNT,
        identifier: "admin@example.com",
        accountResolved: true,
      },
      env
    );
    time.advance(OTP_POLICY.ttlSeconds * 1000 + 1);
    const expired = await service.verifyChallenge(
      {
        action: "auth.password_recovery",
        productCode: "blessboard",
        channel: "email",
        organizationId: ORG,
        accountId: ACCOUNT,
        attemptId: expiring.server.attemptId,
        code: "1234",
      },
      env
    );
    assert.equal(expired.server.reason, "expired");

    const attempts = createOtpService();
    const issued = await attempts.beginChallenge(
      {
        action: "auth.account_activation",
        productCode: "blessboard",
        channel: "sms",
        organizationId: ORG,
        accountId: ACCOUNT,
        identifier: "+260977123456",
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

    const role = await attempts.beginChallenge(
      {
        action: "admin.role_change",
        productCode: "activeclinic",
        channel: "email",
        organizationId: ORG,
        accountId: ACCOUNT,
        sessionId: SESSION,
        identifier: "staff@example.com",
      },
      env
    );
    const missingSession = await attempts.verifyChallenge(
      {
        action: "admin.role_change",
        productCode: "activeclinic",
        channel: "email",
        organizationId: ORG,
        accountId: ACCOUNT,
        attemptId: role.server.attemptId,
        code: "1234",
      },
      env
    );
    assert.equal(missingSession.server.reason, "session_required");
    assert.equal(missingSession.server.sessionComplete, false);
  });

  it("does not enumerate accounts, call a provider, or issue a session before OTP", async () => {
    assert.equal(await holdIfOtpRequired({ workflow: "blessboard.forgot_password" }), null);
    assert.equal(
      await holdIfOtpRequired({
        workflow: "activeclinic.forgot_password",
        identifier: "missing@example.com",
      }),
      null
    );

    const env = testingEnv();
    const hidden = await evaluateOtpSessionGate(
      {
        workflow: "blessboard.member_login",
        activation: "ACTIVE",
        organizationId: ORG,
        accountId: ACCOUNT,
        channel: "email",
        identifier: "missing@example.com",
        accountResolved: false,
        diagnosis: "malaria",
      },
      env
    );
    const present = await evaluateOtpSessionGate(
      {
        workflow: "blessboard.member_login",
        activation: "ACTIVE",
        organizationId: ORG,
        accountId: ACCOUNT,
        channel: "email",
        identifier: "member@example.com",
        accountResolved: true,
      },
      env
    );
    assert.deepEqual(hidden.public, present.public);
    assert.equal(JSON.stringify(hidden).includes("malaria"), false);
    assert.equal(hidden.sessionComplete, false);
    assert.equal(present.sessionComplete, false);

    let calls = 0;
    const provider = {
      name: "interface",
      deliveryActivated: false,
      contactsNetwork: false,
      async dispatch() {
        calls += 1;
        const error = new Error("provider down");
        error.code = "timeout";
        throw error;
      },
    };
    const failed = createOtpService({ provider });
    const delivery = await failed.beginChallenge(
      {
        action: "auth.login",
        productCode: "activeclinic",
        channel: "email",
        organizationId: ORG,
        accountId: ACCOUNT,
        identifier: "clinic@example.com",
        accountResolved: true,
      },
      env
    );
    assert.equal(calls, 1);
    assert.equal(delivery.server.delivery, "failed");
    assert.equal(delivery.server.sessionComplete, false);
    assert.equal(provider.contactsNetwork, false);

    let cookies = 0;
    const cookie = await issueAuthenticatedSessionCookie(
      { headers: {} },
      {
        cookie() {
          cookies += 1;
        },
        setHeader() {},
      },
      {
        rawToken: "not-issued",
        env,
        otpWorkflow: "activeclinic.patient_login",
        otpActivation: "ACTIVE",
        otpService: createOtpService(),
        organizationId: ORG,
        accountId: ACCOUNT,
        otpIdentifier: "patient@example.com",
      }
    );
    assert.equal(cookie.code, "otp_required");
    assert.equal(cookies, 0);

    const deniedRole = await assignBlessBoardRole(
      null,
      { email: "admin@example.com", organizationKey: "chapel", roleKey: "not_a_role" },
      { otpActivation: "ACTIVE", env }
    );
    assert.equal(deniedRole.ok, false);
    assert.match(deniedRole.message, /invalid_input/);

    const churchService = createOtpService();
    const church = await evaluateOtpSessionGate(
      {
        workflow: "blessboard.member_login",
        activation: "ACTIVE",
        service: churchService,
        organizationId: ORG,
        accountId: ACCOUNT,
        channel: "email",
        identifier: "member@example.com",
        accountResolved: true,
      },
      env
    );
    const otherChurch = await evaluateOtpSessionGate(
      {
        workflow: "blessboard.member_login",
        activation: "ACTIVE",
        service: churchService,
        organizationId: OTHER,
        accountId: ACCOUNT,
        channel: "email",
        identifier: "member@example.com",
        verification: { attemptId: church.attemptId, code: "1234" },
      },
      env
    );
    assert.equal(otherChurch.sessionComplete, false);
  });
});
