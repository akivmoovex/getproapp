"use strict";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");

const { createOtpService } = require("../../../src/platform/otp/otpService");
const { createMemoryOtpStore } = require("../../../src/platform/otp/otpChallengeStore");
const { resolveOtpProvider } = require("../../../src/platform/otp/otpProviders");
const { normalizeZambiaSms } = require("../../../src/platform/otp/otpPhone");
const { evaluateOtpSessionGate } = require("../../../src/platform/otp/otpSessionGate");
const { assertOtpProductionStartup, isFixedOtpPermitted } = require("../../../src/platform/otp/otpEnvironment");

const PEPPER = "d26-unit-otp-pepper-32-characters!";
const ORG = "11111111-1111-4111-8111-111111111111";
const OTHER = "33333333-3333-4333-8333-333333333333";
const ACCOUNT = "22222222-2222-4222-8222-222222222222";
const EMAIL = "otp-d26@example.com";

function testingEnv() {
  return {
    NODE_ENV: "test",
    DEPLOYMENT_ENV: "testing",
    DATABASE_IDENTITY_ENV: "testing",
    DATABASE_IDENTITY_EXPECTED: "moovex-platform-v7",
    PLATFORM_DEPLOYMENT_CODE: "moovex-platform-testing",
    GETPRO_OTP_ALLOW_FIXED_CODE: "1",
    GETPRO_OTP_PEPPER: PEPPER,
  };
}

function login(extra) {
  return {
    action: "auth.login",
    productCode: "activeclinic",
    channel: "email",
    organizationId: ORG,
    accountId: ACCOUNT,
    identifier: EMAIL,
    ...extra,
  };
}

describe("D26 OTP security", () => {
  it("accepts 1234 only in the verified testing identity and rejects it in production", async () => {
    assert.equal(isFixedOtpPermitted(testingEnv()), true);
    assert.equal(isFixedOtpPermitted({ ...testingEnv(), NODE_ENV: "production" }), false);
    const service = createOtpService({ store: createMemoryOtpStore() });
    const issued = await service.beginChallenge(login(), testingEnv());
    assert.equal(issued.server.issued, true);
    assert.equal(issued.server.sessionComplete, false);
    const accepted = await service.verifyChallenge(
      { ...login(), attemptId: issued.server.attemptId, code: "1234" },
      testingEnv()
    );
    assert.equal(accepted.server.reason, "verified");
    const production = createOtpService({ store: createMemoryOtpStore() });
    const prodEnv = {
      NODE_ENV: "production",
      DEPLOYMENT_ENV: "production",
      DATABASE_IDENTITY_ENV: "production",
      GETPRO_OTP_PEPPER: PEPPER,
    };
    const prodIssued = await production.beginChallenge(login(), prodEnv);
    const rejected = await production.verifyChallenge(
      { ...login(), attemptId: prodIssued.server.attemptId, code: "1234" },
      prodEnv
    );
    assert.equal(rejected.server.reason, "testing_code_rejected");
    assert.throws(
      () => assertOtpProductionStartup({ ...prodEnv, GETPRO_OTP_ALLOW_FIXED_CODE: "1" }),
      /otp_test_config_forbidden/
    );
  });

  it("does not let a second memory store verify the same challenge", async () => {
    const first = createOtpService({ store: createMemoryOtpStore() });
    const second = createOtpService({ store: createMemoryOtpStore() });
    const issued = await first.beginChallenge(login(), testingEnv());
    const replay = await second.verifyChallenge(
      { ...login(), attemptId: issued.server.attemptId, code: "1234" },
      testingEnv()
    );
    assert.equal(replay.server.reason, "verification_failed");
    assert.equal(replay.server.sessionComplete, false);
  });

  it("denies a reused code, the wrong purpose, and another organization", async () => {
    const service = createOtpService({ store: createMemoryOtpStore() });
    const issued = await service.beginChallenge(login(), testingEnv());
    const input = { ...login(), attemptId: issued.server.attemptId, code: "1234" };
    assert.equal((await service.verifyChallenge(input, testingEnv())).server.reason, "verified");
    assert.equal((await service.verifyChallenge(input, testingEnv())).server.reason, "replay");
    const otherPurpose = await service.beginChallenge(login(), testingEnv());
    const purpose = await service.verifyChallenge(
      {
        ...login(),
        attemptId: otherPurpose.server.attemptId,
        purpose: "password_recovery",
        code: "1234",
      },
      testingEnv()
    );
    assert.equal(purpose.server.reason, "wrong_purpose");
    const tenantService = createOtpService({ store: createMemoryOtpStore() });
    const otherOrg = await tenantService.beginChallenge(login(), testingEnv());
    const tenant = await tenantService.verifyChallenge(
      {
        ...login({ organizationId: OTHER }),
        attemptId: otherOrg.server.attemptId,
        code: "1234",
      },
      testingEnv()
    );
    assert.equal(tenant.server.reason, "cross_tenant");
  });

  it("exhausts the attempt budget and keeps the code out of the audit log", async () => {
    const store = createMemoryOtpStore();
    const service = createOtpService({ store });
    const issued = await service.beginChallenge(login(), testingEnv());
    let last = null;
    for (let i = 0; i < 5; i += 1) {
      last = await service.verifyChallenge(
        { ...login(), attemptId: issued.server.attemptId, code: "000000" },
        testingEnv()
      );
    }
    assert.equal(last.server.reason, "exhausted");
    const audit = JSON.stringify(store.audits());
    assert.equal(audit.includes("1234"), false);
    assert.equal(audit.includes("000000"), false);
    assert.equal(audit.includes("codeHash"), false);
  });

  it("normalizes only a Zambia SMS destination and leaves providers inactive", async () => {
    assert.equal(normalizeZambiaSms("0977000333"), "+260977000333");
    assert.equal(normalizeZambiaSms("+14155550100"), null);
    const inactive = resolveOtpProvider({});
    assert.equal(inactive.name, "inactive");
    assert.equal(inactive.deliveryActivated, false);
    assert.equal(inactive.contactsNetwork, false);
    const sms = resolveOtpProvider({
      GETPRO_OTP_PROVIDER: "interface",
      GETPRO_OTP_SMS_GATEWAY: "twilio",
    });
    const delivery = await sms.dispatch({ channel: "sms", destination: "+260977000333", code: "000000" });
    assert.equal(delivery.reason, "provider_not_selected");
    assert.equal(sms.contactsNetwork, false);
    assert.throws(
      () => createOtpService({ provider: { deliveryActivated: true, async dispatch() { return {}; } } }),
      /otp_delivery_activation_forbidden/
    );
  });

  it("allows the existing login path while OTP activation is blocked", async () => {
    const gate = await evaluateOtpSessionGate(
      {
        workflow: "activeclinic.patient_login",
        organizationId: ORG,
        accountId: ACCOUNT,
        identifier: EMAIL,
      },
      { NODE_ENV: "test", DEPLOYMENT_ENV: "testing" }
    );
    assert.equal(gate.activation, "BLOCKED");
    assert.equal(gate.sessionAllowed, true);
    assert.equal(gate.otpRequired, false);
    assert.equal(gate.sessionComplete, false);
  });
});
