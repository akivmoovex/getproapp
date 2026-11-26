"use strict";

/**
 * G272 disposable PostgreSQL OTP lifecycle proof.
 * Does not apply schema. Does not send real email.
 */

const assert = require("node:assert/strict");
const { Pool } = require("pg");
const { createOtpService } = require("../../../src/platform/otp/otpService");
const { createFakeOtpProvider } = require("../../../src/platform/otp/otpProviders");
const {
  diagnoseOtpReadinessAsync,
} = require("../../../src/platform/otp/otpReadinessDiagnostics");
const {
  evaluatePasswordRecoveryOtp,
} = require("../../../src/platform/otp/otpPasswordRecoveryBridge");
const { diagnoseResendOtpTransport } = require("../../../src/platform/email/resendOtpTransport");

const crypto = require("crypto");
const PEPPER = "g272-disposable-otp-pepper-32b-min!!";

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

async function freshIds(pool) {
  const org = await pool.query(`SELECT id FROM platform.organizations LIMIT 1`);
  assert.ok(org.rows[0], "organization prerequisite missing");
  return {
    organizationId: org.rows[0].id,
    accountId: crypto.randomUUID(),
    identifier: `g272-${crypto.randomUUID().slice(0, 8)}@example.com`,
  };
}

async function runG272EmailOtpPostgresLifecycle(options) {
  const opts = options || {};
  const connectionString =
    opts.connectionString ||
    process.env.GETPRO_V13_ISOLATED_DATABASE_URL ||
    process.env.DATABASE_URL;
  if (!connectionString) {
    return { ok: false, reason: "missing_connection_string" };
  }
  const pool = opts.pool || new Pool({ connectionString, ssl: false, max: 2 });
  const ownsPool = !opts.pool;
  try {
    const readiness = await diagnoseOtpReadinessAsync(testingEnv(), { pool });
    assert.equal(readiness.migration048Present, false);
    assert.equal(readiness.deliveryActivated, false);
    assert.equal(readiness.schemaTables.otpChallenges, true);
    assert.equal(readiness.schemaTables.otpRateBuckets, true);

    const resend = diagnoseResendOtpTransport(testingEnv({ GETPRO_OTP_PROVIDER: "resend" }), "activeclinic");
    assert.equal(resend.ok, false);
    assert.ok(resend.blockers.includes("missing_api_key"));

    const service = createOtpService({
      pool,
      provider: createFakeOtpProvider(),
    });
    const env = testingEnv();
    const ids = await freshIds(pool);
    const held = await evaluatePasswordRecoveryOtp({
      workflow: "activeclinic.forgot_password",
      activation: "ACTIVE",
      service,
      env,
      organizationId: ids.organizationId,
      accountId: ids.accountId,
      channel: "email",
      identifier: ids.identifier,
      accountResolved: true,
    });
    assert.equal(
      held.mode,
      "code_otp_required",
      `expected code OTP hold, got ${held.mode}/${held.reason || held.gate && held.gate.reason}`
    );
    assert.ok(held.attemptId, `missing attemptId reason=${held.reason || held.gate && held.gate.reason}`);

    const completed = await evaluatePasswordRecoveryOtp({
      workflow: "activeclinic.forgot_password",
      activation: "ACTIVE",
      service,
      env,
      organizationId: ids.organizationId,
      accountId: ids.accountId,
      channel: "email",
      identifier: ids.identifier,
      accountResolved: true,
      verification: { attemptId: held.attemptId, code: "1234" },
    });
    assert.equal(completed.gate.sessionComplete, true);

    const replay = await evaluatePasswordRecoveryOtp({
      workflow: "activeclinic.forgot_password",
      activation: "ACTIVE",
      service,
      env,
      organizationId: ids.organizationId,
      accountId: ids.accountId,
      channel: "email",
      identifier: ids.identifier,
      accountResolved: true,
      verification: { attemptId: held.attemptId, code: "1234" },
    });
    assert.equal(replay.gate.sessionComplete, false);

    return {
      ok: true,
      readinessBlockers: readiness.blockers.slice(),
      resendBlockers: resend.blockers.slice(),
      attemptIdPresent: Boolean(held.attemptId),
      completedOnce: true,
      replayRejected: true,
      mailboxDelivery: "NOT_EXECUTED",
      resendAcceptance: "BLOCKED_MISSING_CREDENTIALS",
    };
  } finally {
    if (ownsPool) await pool.end();
  }
}

module.exports = {
  runG272EmailOtpPostgresLifecycle,
};
