"use strict";

/**
 * Community Benefits stays off unless a non-production process opts in.
 * Financial posting is not enabled by this module.
 */

const { isProductionSignal } = require("../../platform/otp/otpEnvironment");

function communityBenefitsEnabled(env) {
  const source = env || process.env;
  if (isProductionSignal(source)) return false;
  return String(source.GETPRO_AC_COMMUNITY_BENEFITS_ENABLED || "") === "1";
}

function financialPostingEnabled() {
  return false;
}

module.exports = {
  communityBenefitsEnabled,
  financialPostingEnabled,
};
