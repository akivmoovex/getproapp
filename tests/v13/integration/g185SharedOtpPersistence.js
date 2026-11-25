"use strict";

const assert = require("node:assert/strict");
const { createOtpService } = require("../../../src/platform/otp/otpService");
const { publishedTestingPepper } = require("../../../src/platform/otp/otpEnvironment");

async function runSharedOtpPersistence(pool) {
  const org = await pool.query(`SELECT id FROM platform.organizations LIMIT 1`);
  assert.ok(org.rows[0], "organization prerequisite missing");
  const organizationId = org.rows[0].id;
  const accountId = "22222222-2222-4222-8222-222222222222";
  const now = Date.now();
  const env = {
    NODE_ENV: "test",
    DEPLOYMENT_ENV: "testing",
    DATABASE_IDENTITY_ENV: "testing",
    DATABASE_IDENTITY_EXPECTED: "moovex-platform-v7",
    PLATFORM_DEPLOYMENT_CODE: "moovex-platform-testing",
    GETPRO_OTP_ALLOW_FIXED_CODE: "1",
    GETPRO_OTP_PEPPER: publishedTestingPepper({ NODE_ENV: "test" }),
  };
  const input = {
    action: "auth.login",
    productCode: "blessboard",
    channel: "email",
    organizationId,
    accountId,
    identifier: "otp@v13d19.example",
    accountResolved: true,
  };
  const first = createOtpService({ pool, clock: () => now });
  const second = createOtpService({ pool, clock: () => now });
  try {
    const issued = await first.beginChallenge(input, env);
    assert.equal(issued.server.issued, true);
    assert.equal(issued.server.sessionComplete, false);
    const verified = await second.verifyChallenge(
      { ...input, attemptId: issued.server.attemptId, code: "1234" },
      env
    );
    assert.equal(verified.server.reason, "verified");
    assert.equal(verified.server.sessionComplete, false);
    const [left, right] = await Promise.all([
      first.completeProtectedAction(verified, "auth.login"),
      second.completeProtectedAction(verified, "auth.login"),
    ]);
    const sessions = [left, right].filter((row) => row.sessionComplete === true);
    assert.equal(sessions.length, 1);
    const stored = await pool.query(
      `SELECT code_hash, consumed, status
         FROM platform.otp_challenges
        WHERE attempt_id = $1`,
      [issued.server.attemptId]
    );
    assert.equal(stored.rows.length, 1);
    assert.equal(stored.rows[0].consumed, true);
    assert.equal(stored.rows[0].status, "verified");
    assert.equal(String(stored.rows[0].code_hash).includes("1234"), false);
  } finally {
    await pool.query(`DELETE FROM platform.otp_challenges WHERE account_id = $1 AND organization_id = $2`, [
      accountId,
      organizationId,
    ]);
    await pool.query(`DELETE FROM platform.otp_rate_buckets WHERE bucket_key LIKE $1`, [`%${organizationId}%`]);
  }
}

module.exports = {
  runSharedOtpPersistence,
};
