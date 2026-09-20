"use strict";

/**
 * Product-facing wrappers around shared verification (BB branding).
 */

const {
  startSharedVerification,
  completeSharedVerification,
  getSharedVerificationStatus,
  peekSharedVerificationCodeForTests,
  RESULT,
  CHANNEL,
  SUBJECT_KIND,
} = require("../../platform/verification/sharedVerificationService");

async function startBlessBoardPhoneVerification(db, input, env) {
  return startSharedVerification(
    db,
    {
      ...input,
      subjectKind: SUBJECT_KIND.BLESSBOARD_USER,
      productKey: "blessboard",
      channel: CHANNEL.PHONE,
      purpose: "account_verification",
    },
    env
  );
}

async function startBlessBoardEmailVerification(db, input, env) {
  return startSharedVerification(
    db,
    {
      ...input,
      subjectKind: SUBJECT_KIND.BLESSBOARD_USER,
      productKey: "blessboard",
      channel: CHANNEL.EMAIL,
      purpose: "account_verification",
    },
    env
  );
}

async function completeBlessBoardVerification(db, input, env) {
  return completeSharedVerification(
    db,
    {
      ...input,
      subjectKind: SUBJECT_KIND.BLESSBOARD_USER,
    },
    env
  );
}

async function getBlessBoardVerificationStatus(db, input, env) {
  return getSharedVerificationStatus(
    db,
    {
      ...input,
      subjectKind: SUBJECT_KIND.BLESSBOARD_USER,
    },
    env
  );
}

module.exports = {
  RESULT,
  CHANNEL,
  startBlessBoardPhoneVerification,
  startBlessBoardEmailVerification,
  completeBlessBoardVerification,
  getBlessBoardVerificationStatus,
  peekSharedVerificationCodeForTests,
};
