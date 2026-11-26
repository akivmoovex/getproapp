"use strict";

/**
 * OTP enforcement is not turned on for existing deployments.
 * Production stays blocked until a migration is applied, a provider is
 * configured, and a release is verified. None of those are true in D14C.
 */

const { isProductionSignal } = require("./otpEnvironment");

const BLOCK_REASONS = Object.freeze([
  "migration_not_applied",
  "provider_not_configured",
  "release_not_verified",
]);

function envActivationOverride(env) {
  const value = String((env && env.GETPRO_OTP_ACTIVATION) || "")
    .trim()
    .toUpperCase();
  return value === "ACTIVE" ? "ACTIVE" : null;
}

function resolveOtpActivation(env, override) {
  const source = env || {};
  if (isProductionSignal(source)) {
    return { status: "BLOCKED", reasons: BLOCK_REASONS.slice() };
  }
  // Explicit call-site override wins for tests. Otherwise honor non-production
  // GETPRO_OTP_ACTIVATION=ACTIVE for authorized disposable/hosted-QA only.
  const requested = override === "ACTIVE" ? "ACTIVE" : envActivationOverride(source);
  if (requested === "ACTIVE") {
    return { status: "ACTIVE", reasons: [] };
  }
  return { status: "BLOCKED", reasons: BLOCK_REASONS.slice() };
}

module.exports = {
  BLOCK_REASONS,
  resolveOtpActivation,
  envActivationOverride,
};
