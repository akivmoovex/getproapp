"use strict";

/**
 * Testing OTP is allowed only when the deployment profile, deployment env,
 * and database identity all agree that this process is a testing deployment.
 * Any production signal rejects the fixed code.
 */

const { resolveDeploymentProfileOrError } = require("../config/deploymentProfiles");
const { OTP_POLICY, assertProductionPolicyImmutable } = require("./otpPolicy");

const FIXED_CODE_FLAG = "GETPRO_OTP_ALLOW_FIXED_CODE";
const PUBLISHED_TESTING_PEPPER = "g187-published-test-pepper-not-secret";

function signal(source, name) {
  return String(source[name] || "")
    .trim()
    .toLowerCase();
}

function isProductionSignal(env) {
  const source = env || {};
  if (signal(source, "NODE_ENV") === "production") return true;
  if (signal(source, "DEPLOYMENT_ENV") === "production") return true;
  if (signal(source, "DATABASE_IDENTITY_ENV") === "production") return true;
  const resolved = resolveDeploymentProfileOrError(source);
  if (resolved.ok && resolved.profile) {
    if (resolved.profile.deploymentEnvironment === "production") return true;
    if (resolved.profile.expectedDatabaseEnvironment === "production") return true;
  }
  return false;
}

/**
 * Fixed code 1234 is permitted only for a profile that declares a testing
 * environment and a non-empty expected identity key, with matching env values,
 * and an explicit allow flag. A testing label on one variable is not enough.
 */
function isFixedOtpPermitted(env) {
  const source = env || {};
  if (signal(source, FIXED_CODE_FLAG) !== "1") return false;
  if (isProductionSignal(source)) return false;
  if (signal(source, "NODE_ENV") === "production") return false;
  if (signal(source, "DEPLOYMENT_ENV") !== "testing") return false;
  if (signal(source, "DATABASE_IDENTITY_ENV") !== "testing") return false;
  const resolved = resolveDeploymentProfileOrError(source);
  if (!resolved.ok || !resolved.profile) return false;
  const profile = resolved.profile;
  if (profile.deploymentEnvironment !== "testing") return false;
  if (profile.expectedDatabaseEnvironment !== "testing") return false;
  const expectedKey = String(profile.expectedIdentityKey || "").trim();
  if (!expectedKey) return false;
  if (signal(source, "DATABASE_IDENTITY_EXPECTED") !== expectedKey.toLowerCase()) return false;
  return true;
}

function collectForbiddenProductionOtpSettings(env) {
  const source = env || {};
  const forbidden = [];
  if (!isProductionSignal(source) && signal(source, "NODE_ENV") !== "production") {
    return forbidden;
  }
  const flag = source[FIXED_CODE_FLAG];
  if (flag != null && String(flag).trim() !== "") forbidden.push(FIXED_CODE_FLAG);
  for (const key of ["GETPRO_OTP_TEST_CODE", "GETPRO_OTP_FIXED_CODE", "OTP_FIXED_CODE"]) {
    if (source[key] != null && String(source[key]).trim() !== "") forbidden.push(key);
  }
  const provider = signal(source, "GETPRO_OTP_PROVIDER");
  if (provider === "test" || provider === "fixed" || provider === "fake") {
    forbidden.push("GETPRO_OTP_PROVIDER");
  }
  if (String(source.GETPRO_OTP_TEST_CODE || "").trim() === OTP_POLICY.testingCode) {
    forbidden.push("testing_code_value");
  }
  if (String(source.GETPRO_OTP_PEPPER || "") === PUBLISHED_TESTING_PEPPER) {
    forbidden.push("published_testing_pepper");
  }
  for (const problem of assertProductionPolicyImmutable(source)) {
    forbidden.push(problem);
  }
  return forbidden;
}

/**
 * Production boot must fail closed when a test OTP setting is present.
 * Does nothing outside production. Does not enable OTP delivery.
 */
function publishedTestingPepper(env) {
  if (isProductionSignal(env) || signal(env || {}, "NODE_ENV") === "production") {
    const error = new Error("otp_test_pepper_forbidden");
    error.code = "otp_test_pepper_forbidden";
    throw error;
  }
  return PUBLISHED_TESTING_PEPPER;
}

function assertOtpProductionStartup(env) {
  const source = env || process.env;
  if (signal(source, "NODE_ENV") !== "production" && !isProductionSignal(source)) {
    return { ok: true };
  }
  if (signal(source, "NODE_ENV") !== "production" && signal(source, "DEPLOYMENT_ENV") !== "production") {
    return { ok: true };
  }
  const forbidden = collectForbiddenProductionOtpSettings(source);
  if (forbidden.length === 0) return { ok: true };
  const error = new Error(
    `otp_test_config_forbidden: OTP test configuration is forbidden in production (${forbidden.join(", ")})`
  );
  error.code = "otp_test_config_forbidden";
  throw error;
}

module.exports = {
  PUBLISHED_TESTING_PEPPER,
  isProductionSignal,
  isFixedOtpPermitted,
  collectForbiddenProductionOtpSettings,
  assertOtpProductionStartup,
  publishedTestingPepper,
};
