"use strict";

/**
 * BlessBoard verification adapter — productKey + subjectKind only.
 */

const {
  createProductVerificationAdapter,
} = require("../../platform/verification/createProductVerificationAdapter");
const { SUBJECT_KIND } = require("../../platform/verification/sharedVerificationService");

const adapter = createProductVerificationAdapter({
  productKey: "blessboard",
  subjectKind: SUBJECT_KIND.BLESSBOARD_USER,
});

module.exports = {
  RESULT: adapter.RESULT,
  CHANNEL: adapter.CHANNEL,
  startBlessBoardPhoneVerification: adapter.startPhoneVerification,
  startBlessBoardEmailVerification: adapter.startEmailVerification,
  completeBlessBoardVerification: adapter.completeVerification,
  getBlessBoardVerificationStatus: adapter.getVerificationStatus,
  peekSharedVerificationCodeForTests: adapter.peekSharedVerificationCodeForTests,
};
