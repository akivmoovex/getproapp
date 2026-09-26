"use strict";

/**
 * ActiveClinic verification adapter — productKey + subjectKind only.
 */

const {
  createProductVerificationAdapter,
} = require("../../platform/verification/createProductVerificationAdapter");
const { SUBJECT_KIND } = require("../../platform/verification/sharedVerificationService");

const adapter = createProductVerificationAdapter({
  productKey: "activeclinic",
  subjectKind: SUBJECT_KIND.PLATFORM_IDENTITY,
});

module.exports = {
  RESULT: adapter.RESULT,
  CHANNEL: adapter.CHANNEL,
  startActiveClinicPhoneVerification: adapter.startPhoneVerification,
  startActiveClinicEmailVerification: adapter.startEmailVerification,
  completeActiveClinicVerification: adapter.completeVerification,
  getActiveClinicVerificationStatus: adapter.getVerificationStatus,
  peekSharedVerificationCodeForTests: adapter.peekSharedVerificationCodeForTests,
};
