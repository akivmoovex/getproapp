"use strict";

/**
 * D17 OTP behavior beyond the D16 security list.
 * A new service instance models a restarted worker. It is not a distributed store.
 */

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");

const { createOtpService } = require("../../../src/platform/otp/otpService");
const { normalizeZambiaSms } = require("../../../src/platform/otp/otpPhone");
const { deliverWithPolicy, buildOtpMessage } = require("../../../src/platform/otp/otpDelivery");
const { OTP_POLICY } = require("../../../src/platform/otp/otpPolicy");

const PEPPER = "unit-test-otp-pepper-32b-minimum!!";
const ORG = "11111111-1111-4111-8111-111111111111";
const OTHER = "33333333-3333-4333-8333-333333333333";
const A = "22222222-2222-4222-8222-222222222222";
const B = "55555555-5555-4555-8555-555555555555";
const SESSION = "44444444-4444-4444-8444-444444444444";

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

function productionEnv() {
  return {
    NODE_ENV: "production",
    DEPLOYMENT_ENV: "production",
    DATABASE_IDENTITY_ENV: "production",
    DATABASE_IDENTITY_EXPECTED: "moovex-platform-v7",
    PLATFORM_DEPLOYMENT_CODE: "moovex-platform-production",
    GETPRO_OTP_PEPPER: PEPPER,
  };
}

function login(accountId, organizationId) {
  return {
    action: "auth.login",
    productCode: "blessboard",
    channel: "email",
    organizationId: organizationId || ORG,
    accountId,
    identifier: `${accountId.slice(0, 8)}@example.com`,
    accountResolved: true,
  };
}

describe("D17 OTP behavior", () => {
  it("replaces a challenge, isolates workers, and refuses a login code for recovery", async () => {
    let now = 1_700_000_000_000;
    const first = createOtpService({ clock: () => now });
    const env = testingEnv();
    const started = await first.beginChallenge(login(A), env);
    const replaced = await first.beginChallenge(login(A), env);
    assert.equal(replaced.server.reason, "resend_cooldown");
    now += OTP_POLICY.resendCooldownSeconds * 1000;
    const next = await first.beginChallenge(login(A), env);
    assert.equal(next.server.issued, true);
    const old = await first.verifyChallenge({ ...login(A), attemptId: started.server.attemptId, code: "1234" }, env);
    assert.notEqual(old.server.reason, "verified");
    const current = await first.verifyChallenge({ ...login(A), attemptId: next.server.attemptId, code: "1234" }, env);
    assert.equal(current.server.reason, "verified");
    assert.equal(first.completeProtectedAction(current, "auth.password_recovery").sessionComplete, false);

    const otherWorker = createOtpService({ clock: () => now });
    const lost = await otherWorker.verifyChallenge({ ...login(A), attemptId: next.server.attemptId, code: "1234" }, env);
    assert.equal(lost.server.sessionComplete, false);

    const sibling = await first.beginChallenge(login(B), env);
    assert.equal(sibling.server.issued, true);
    const cross = await first.verifyChallenge({ ...login(B, OTHER), attemptId: sibling.server.attemptId, code: "1234" }, env);
    assert.equal(cross.server.reason, "cross_tenant");
  });

  it("normalizes Zambia numbers and does not put a code or clinical text in a failed delivery", async () => {
    assert.equal(normalizeZambiaSms("0977123456"), "+260977123456");
    assert.equal(normalizeZambiaSms("+260977123456"), "+260977123456");
    assert.equal(normalizeZambiaSms("+14155552671"), null);
    assert.equal(normalizeZambiaSms("977"), null);
    const message = buildOtpMessage("482913");
    assert.match(message.text, /482913/);
    assert.doesNotMatch(message.text, /patient|church|diagnosis/i);
    let attempts = 0;
    const result = await deliverWithPolicy(async () => {
      attempts += 1;
      const error = new Error("down");
      error.code = attempts < 2 ? "timeout" : "rejected";
      throw error;
    });
    assert.equal(result.publicStatus, "failed");
    assert.equal(JSON.stringify(result).includes("482913"), false);
    assert.equal(attempts, 2);

    const production = createOtpService();
    const issued = await production.beginChallenge({
      ...login(A),
      productCode: "activeclinic",
      channel: "sms",
      identifier: "+260977123456",
    }, productionEnv());
    assert.equal(issued.server.sessionComplete, false);
    assert.equal(issued.server.code, undefined);
    const fixed = await production.verifyChallenge({
      ...login(A),
      productCode: "activeclinic",
      channel: "sms",
      attemptId: issued.server.attemptId,
      code: "1234",
    }, productionEnv());
    assert.equal(fixed.server.reason, "testing_code_rejected");
    const admin = await production.beginChallenge({
      action: "admin.role_change",
      productCode: "activeclinic",
      channel: "email",
      organizationId: ORG,
      accountId: A,
      sessionId: SESSION,
      identifier: "admin@example.com",
    }, productionEnv());
    assert.notEqual(admin.server.attemptId, issued.server.attemptId);
  });
});
