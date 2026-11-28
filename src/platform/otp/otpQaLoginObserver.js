"use strict";

/**
 * In-process OTP observer for the isolated testing server.
 * BlessBoard member login and ActiveClinic password recovery use separate
 * flags. The map lives only in this process. Production, a missing fixture
 * flag, and a non-loopback caller all fail closed. Codes are never logged.
 */

const { isProductionSignal } = require("./otpEnvironment");

const ATTEMPT_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const CODE_RE = /^\d{6}$/;
const codes = new Map();

function text(value) {
  return String(value || "").trim();
}

function isLoopbackAddress(value) {
  const address = text(value).toLowerCase();
  return address === "127.0.0.1" || address === "::1" || address === "::ffff:127.0.0.1";
}

function testingObserverDeployment(env) {
  const source = env || {};
  if (isProductionSignal(source)) return false;
  if (text(source.NODE_ENV).toLowerCase() === "production") return false;
  if (text(source.DEPLOYMENT_ENV).toLowerCase() !== "testing") return false;
  if (text(source.DATABASE_IDENTITY_ENV).toLowerCase() !== "testing") return false;
  if (text(source.PLATFORM_DEPLOYMENT_CODE).toLowerCase() !== "moovex-platform-testing") return false;
  if (text(source.GETPRO_V13_BROWSER_AUTHORIZED) !== "1") return false;
  if (text(source.GETPRO_V13_DB_STAGES_AUTHORIZED) !== "1") return false;
  return true;
}

function loginOtpObserverAuthorized(env) {
  return testingObserverDeployment(env) && text((env || {}).GETPRO_BB_LOGIN_OTP_OBSERVER) === "1";
}

function acRecoveryOtpObserverAuthorized(env) {
  return testingObserverDeployment(env) && text((env || {}).GETPRO_AC_RECOVERY_OTP_OBSERVER) === "1";
}

function acStaffLoginOtpObserverAuthorized(env) {
  return testingObserverDeployment(env) && text((env || {}).GETPRO_AC_STAFF_LOGIN_OTP_OBSERVER) === "1";
}

function acPatientLoginOtpObserverAuthorized(env) {
  return testingObserverDeployment(env) && text((env || {}).GETPRO_AC_PATIENT_LOGIN_OTP_OBSERVER) === "1";
}

function qaOtpObserverFixtureAuthorized(env) {
  return loginOtpObserverAuthorized(env)
    || acRecoveryOtpObserverAuthorized(env)
    || acStaffLoginOtpObserverAuthorized(env)
    || acPatientLoginOtpObserverAuthorized(env);
}

function rememberLoginOtpCode(attemptId, code, env) {
  if (!qaOtpObserverFixtureAuthorized(env)) return false;
  const attempt = text(attemptId);
  const value = text(code);
  if (!ATTEMPT_RE.test(attempt) || !CODE_RE.test(value) || value === "000000") return false;
  codes.set(attempt, value);
  return true;
}

function peekLoginOtpCode(attemptId, env) {
  if (!qaOtpObserverFixtureAuthorized(env)) return null;
  const attempt = text(attemptId);
  if (!ATTEMPT_RE.test(attempt)) return null;
  return codes.get(attempt) || null;
}

function clearLoginOtpObserverStore() {
  codes.clear();
}

/**
 * @param {{ env?: NodeJS.ProcessEnv, remoteAddress?: string, attemptId?: string }} input
 */
function observeLoginOtpDelivery(input) {
  const source = (input && input.env) || {};
  if (!qaOtpObserverFixtureAuthorized(source) || !isLoopbackAddress(input && input.remoteAddress)) {
    return { status: 404, body: { ok: false, error: "not_found" } };
  }
  const attemptId = text(input && input.attemptId);
  if (!ATTEMPT_RE.test(attemptId)) {
    return { status: 400, body: { ok: false, error: "attempt_id_required" } };
  }
  const code = peekLoginOtpCode(attemptId, source);
  if (!code) return { status: 404, body: { ok: false, error: "delivery_not_found" } };
  return { status: 200, body: { ok: true, attemptId, code } };
}

module.exports = {
  isLoopbackAddress,
  loginOtpObserverAuthorized,
  acRecoveryOtpObserverAuthorized,
  acStaffLoginOtpObserverAuthorized,
  acPatientLoginOtpObserverAuthorized,
  qaOtpObserverFixtureAuthorized,
  rememberLoginOtpCode,
  peekLoginOtpCode,
  clearLoginOtpObserverStore,
  observeLoginOtpDelivery,
};
