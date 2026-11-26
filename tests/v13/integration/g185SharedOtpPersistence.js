"use strict";

const assert = require("node:assert/strict");
const crypto = require("crypto");
const { Pool } = require("pg");
const { createOtpService } = require("../../../src/platform/otp/otpService");
const { publishedTestingPepper } = require("../../../src/platform/otp/otpEnvironment");

async function runSharedOtpPersistence(pool, connectionString) {
  assert.equal(typeof connectionString, "string");
  assert.equal(connectionString.includes("127.0.0.1:55432"), true);
  const org = await pool.query(`SELECT id FROM platform.organizations LIMIT 1`);
  assert.ok(org.rows[0], "organization prerequisite missing");
  const organizationId = org.rows[0].id;
  const accountId = crypto.randomUUID();
  const stamp = `${Date.now().toString(36)}${crypto.randomBytes(2).toString("hex")}`;
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
    identifier: `otp-${stamp}@v13d19.example`,
    accountResolved: true,
  };
  const workerB = new Pool({ connectionString, ssl: false, max: 1 });
  const first = createOtpService({ pool, clock: () => now });
  const second = createOtpService({ pool: workerB, clock: () => now });
  let attemptId = null;
  try {
    const issued = await first.beginChallenge(input, env);
    assert.equal(issued.server.issued, true);
    assert.equal(issued.server.sessionComplete, false);
    attemptId = issued.server.attemptId;
    const wrongTenant = await second.verifyChallenge(
      {
        ...input,
        organizationId: "33333333-3333-4333-8333-333333333333",
        attemptId,
        code: "1234",
      },
      env
    );
    assert.equal(wrongTenant.server.reason, "cross_tenant");
    assert.equal(wrongTenant.server.sessionComplete, false);
    const verified = await second.verifyChallenge({ ...input, attemptId, code: "1234" }, env);
    assert.equal(verified.server.reason, "verified");
    assert.equal(verified.server.sessionComplete, false);
    const [left, right] = await Promise.all([
      first.completeProtectedAction(verified, "auth.login"),
      second.completeProtectedAction(verified, "auth.login"),
    ]);
    assert.equal([left, right].filter((row) => row.sessionComplete === true).length, 1);
    const stored = await workerB.query(
      `SELECT code_hash, consumed, status, organization_id, product_code, purpose
         FROM platform.otp_challenges
        WHERE attempt_id = $1`,
      [attemptId]
    );
    assert.equal(stored.rows.length, 1);
    assert.equal(stored.rows[0].consumed, true);
    assert.equal(stored.rows[0].status, "verified");
    assert.equal(stored.rows[0].organization_id, organizationId);
    assert.equal(stored.rows[0].product_code, "blessboard");
    assert.equal(stored.rows[0].purpose, "login");
    assert.equal(String(stored.rows[0].code_hash).includes("1234"), false);
    const bucket = await pool.query(
      `SELECT attempt_count
         FROM platform.otp_rate_buckets
        WHERE bucket_key LIKE $1`,
      [`%${organizationId}%${accountId}%`]
    );
    assert.equal(bucket.rows.length > 0, true);
    assert.equal(Number(bucket.rows[0].attempt_count) >= 1, true);
    const replay = await first.verifyChallenge({ ...input, attemptId, code: "1234" }, env);
    assert.equal(replay.server.sessionComplete, false);
    assert.notEqual(replay.server.reason, "verified");
  } finally {
    await pool.query(
      `DELETE FROM platform.otp_challenges WHERE account_id = $1 AND organization_id = $2`,
      [accountId, organizationId]
    );
    await pool.query(
      `DELETE FROM platform.otp_rate_buckets
        WHERE bucket_key LIKE $1 AND bucket_key LIKE $2`,
      [`%${organizationId}%`, `%${accountId}%`]
    );
    await workerB.end();
  }
}

module.exports = {
  runSharedOtpPersistence,
};
