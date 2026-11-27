"use strict";

/**
 * Mocked QA delivery fixtures. These objects never open a database or socket.
 */

const fs = require("fs");
const os = require("os");
const path = require("path");
const {
  APPROVED_QA_DATA_DIRECTORY,
  APPROVED_QA_SOCKET_DIRECTORY,
  QA_CURRENT_USER,
  QA_DATABASE_HOST,
  QA_DATABASE_NAME,
  QA_DATABASE_PORT,
  QA_HTTP_ATTEMPT_LIMIT,
  QA_IDENTITY_KEY,
  QA_INSTANCE_ID,
  QA_PRODUCT,
  QA_PURPOSE,
  QA_SENDER_EMAIL,
} = require("../../../src/platform/otp/otpQaLiveDelivery");
const { provisionIsolatedQaAttemptBudget } = require("../../../src/platform/otp/otpQaAttemptBudget");

const KEY = "re_test_key_not_a_secret";
const PEPPER = "unit-test-otp-pepper-32b-minimum!!";
const PASSWORD = "not-a-real-password";
const RECIPIENT = "qa.mailbox@pronline.org";
const MESSAGE = "Your verification code is 135790. It expires in 5 minutes.";

function databaseUrl(extra) {
  const host = extra && extra.host ? extra.host : QA_DATABASE_HOST;
  const port = extra && extra.port ? extra.port : QA_DATABASE_PORT;
  const database = extra && extra.database ? extra.database : QA_DATABASE_NAME;
  const role = extra && extra.role ? extra.role : QA_CURRENT_USER;
  return `postgresql://${role}:${PASSWORD}@${host}:${port}/${database}`;
}

function approvedQaEnv(extra) {
  return {
    NODE_ENV: "test",
    DEPLOYMENT_ENV: "testing",
    DATABASE_IDENTITY_ENV: "testing",
    DATABASE_IDENTITY_EXPECTED: QA_IDENTITY_KEY,
    PLATFORM_DEPLOYMENT_CODE: "moovex-platform-testing",
    GETPRO_OTP_QA_LIVE_DELIVERY: "owner-approved",
    GETPRO_RESEND_SENDER_PROFILE: "hosted-qa",
    GETPRO_RESEND_VERIFIED_DOMAINS: "pronline.org",
    GETPRO_RESEND_QA_RECIPIENTS: RECIPIENT,
    RESEND_API_KEY: KEY,
    GETPRO_OTP_PEPPER: PEPPER,
    GETPRO_OTP_QA_PROVIDER_BUDGET: String(QA_HTTP_ATTEMPT_LIMIT),
    GETPRO_V13_APPROVED_DB_TARGET: QA_DATABASE_NAME,
    DATABASE_URL: databaseUrl(),
    GETPRO_OTP_PROVIDER: "resend",
    GETPRO_OTP_ACTIVATION: "ACTIVE",
    GETPRO_OTP_ALLOW_FIXED_CODE: "1",
    ...(extra || {}),
  };
}

function postgresqlObservation(request, extra) {
  return {
    ok: true,
    evidence: "postgresql_observation",
    nonce: request && request.nonce,
    currentDatabase: QA_DATABASE_NAME,
    inetServerPort: QA_DATABASE_PORT,
    host: QA_DATABASE_HOST,
    currentUser: QA_CURRENT_USER,
    identityKey: QA_IDENTITY_KEY,
    identityEnv: "testing",
    instanceId: QA_INSTANCE_ID,
    dataDirectory: APPROVED_QA_DATA_DIRECTORY,
    socketDirectory: APPROVED_QA_SOCKET_DIRECTORY,
    pathEvidence: "listener_postmaster_pid",
    ...(extra || {}),
  };
}

function createMockDurableBudget(seed) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "d162-fixture-"));
  const store = provisionIsolatedQaAttemptBudget({
    directory,
    runId: "d162-fixture-run",
  });
  const used = Math.min(QA_HTTP_ATTEMPT_LIMIT, Number(seed && seed.used) || 0);
  for (let slot = 0; slot < used; slot += 1) store.tryReserve();
  return store;
}

function jsonResponse(status, body) {
  return {
    ok: status >= 200 && status < 300,
    status,
    async text() {
      return JSON.stringify(body || {});
    },
  };
}

function authorizedProbe() {
  return async (request) => postgresqlObservation(request);
}

module.exports = {
  KEY,
  PEPPER,
  PASSWORD,
  RECIPIENT,
  MESSAGE,
  QA_SENDER_EMAIL,
  QA_PRODUCT,
  QA_PURPOSE,
  databaseUrl,
  approvedQaEnv,
  postgresqlObservation,
  createMockDurableBudget,
  jsonResponse,
  authorizedProbe,
};
