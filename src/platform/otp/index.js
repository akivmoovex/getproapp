"use strict";

/**
 * Shared OTP foundation. BlessBoard and ActiveClinic call this module.
 * There is no product-specific OTP engine.
 */

const { createOtpService } = require("./otpService");
const { PROTECTED_ACTIONS, getProtectedAction } = require("./otpProtectedActions");
const { OTP_POLICY } = require("./otpPolicy");
const {
  isFixedOtpPermitted,
  assertOtpProductionStartup,
} = require("./otpEnvironment");
const {
  createOtpProvider,
  resolveOtpProvider,
  createFakeOtpProvider,
} = require("./otpProviders");
const {
  diagnoseOtpReadiness,
  diagnoseOtpReadinessAsync,
  probeOtpTables,
} = require("./otpReadinessDiagnostics");

function bindProduct(productCode, options) {
  const service = createOtpService(options);
  return {
    productCode,
    begin(input, env) {
      return service.beginChallenge({ ...input, productCode }, env);
    },
    verify(input, env) {
      return service.verifyChallenge({ ...input, productCode }, env);
    },
    complete(verification, action) {
      return service.completeProtectedAction(verification, action);
    },
  };
}

module.exports = {
  OTP_POLICY,
  PROTECTED_ACTIONS,
  getProtectedAction,
  createOtpService,
  createOtpProvider,
  resolveOtpProvider,
  createFakeOtpProvider,
  bindProduct,
  isFixedOtpPermitted,
  assertOtpProductionStartup,
  diagnoseOtpReadiness,
  diagnoseOtpReadinessAsync,
  probeOtpTables,
};
