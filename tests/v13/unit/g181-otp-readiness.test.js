"use strict";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");

const { createOtpService } = require("../../../src/platform/otp/otpService");
const { createMemoryOtpStore } = require("../../../src/platform/otp/otpChallengeStore");
const { resolveOtpActivation } = require("../../../src/platform/otp/otpActivation");

const ROOT = path.join(__dirname, "../../..");

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), "utf8");
}

function testingEnv() {
  return {
    NODE_ENV: "test",
    DEPLOYMENT_ENV: "testing",
    DATABASE_IDENTITY_ENV: "testing",
    GETPRO_OTP_ALLOW_FIXED_CODE: "1",
    PLATFORM_DEPLOYMENT_CODE: "moovex-platform-testing",
    DATABASE_IDENTITY_EXPECTED: "moovex-platform-v7",
    GETPRO_OTP_PEPPER: "x".repeat(32),
  };
}

const input = {
  action: "auth.login",
  productCode: "blessboard",
  channel: "email",
  organizationId: "11111111-1111-4111-8111-111111111111",
  accountId: "22222222-2222-4222-8222-222222222222",
  sessionId: "44444444-4444-4444-8444-444444444444",
  identifier: "otp@v13d19.example",
};

describe("G181 OTP persistence readiness", () => {
  it("keeps the forbidden migration path absent and matches the service columns", () => {
    assert.equal(fs.existsSync(path.join(ROOT, "db/migrations/platform/048_otp_challenges.sql")), false);
    const sql = read("docs/qa/V2132_G181_OTP_CHALLENGES.sql");
    assert.match(sql, /NOT APPLIED/);
    for (const column of [
      "product_code",
      "organization_id uuid NOT NULL",
      "account_id",
      "session_id",
      "attempt_id",
      "action text",
      "purpose text",
      "identifier_hash",
      "code_hash",
      "context_hash",
      "attempt_count",
      "max_attempts",
      "consumed",
      "last_sent_at",
      "verified_at",
      "otp_rate_buckets",
    ]) {
      assert.match(sql, new RegExp(column));
    }
    assert.match(sql, /'pending', 'verified', 'expired', 'cancelled', 'exhausted'/);
    assert.doesNotMatch(sql, /'locked'/);
    assert.doesNotMatch(sql, /^\s*(otp_code|plaintext|email|phone)\s+/m);
    const d16 = read("tests/v13/integration/v13AuthorizedScenarios.js");
    assert.match(d16, /platform\.otp_challenges is not present/);
    assert.match(d16, /replay\.server\.sessionComplete/);
    assert.match(d16, /a second worker must read the same persisted challenge/);
  });

  it("does not let a second memory worker verify a challenge, and verify does not complete the session", async () => {
    const now = Date.now();
    const env = testingEnv();
    const store = createMemoryOtpStore();
    const first = createOtpService({ store, clock: () => now });
    const issued = await first.beginChallenge(input, env);
    assert.equal(issued.server.issued, true);
    const isolated = createOtpService({ clock: () => now });
    const missed = await isolated.verifyChallenge(
      { ...input, attemptId: issued.server.attemptId, code: "1234" },
      env
    );
    assert.equal(missed.server.sessionComplete, false);
    assert.equal(missed.server.reason, "verification_failed");

    const verified = await first.verifyChallenge(
      { ...input, attemptId: issued.server.attemptId, code: "1234" },
      env
    );
    assert.equal(verified.server.ok, true);
    assert.equal(verified.server.sessionComplete, false);
    const completed = first.completeProtectedAction(verified, "auth.login");
    assert.equal(completed.sessionComplete, true);
    const replay = first.completeProtectedAction(verified, "auth.login");
    assert.equal(replay.sessionComplete, false);

    const otherOrg = await createOtpService({ store, clock: () => now }).verifyChallenge(
      {
        ...input,
        organizationId: "33333333-3333-4333-8333-333333333333",
        attemptId: issued.server.attemptId,
        code: "1234",
      },
      env
    );
    assert.equal(otherOrg.server.sessionComplete, false);
    assert.equal(resolveOtpActivation({ NODE_ENV: "production", DEPLOYMENT_ENV: "production" }, "ACTIVE").status, "BLOCKED");
  });
});
