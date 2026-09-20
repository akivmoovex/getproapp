"use strict";

/**
 * Product-facing wrappers around shared verification (ActiveClinic branding).
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

async function startActiveClinicPhoneVerification(db, input, env) {
  return startSharedVerification(
    db,
    {
      ...input,
      subjectKind: SUBJECT_KIND.PLATFORM_IDENTITY,
      productKey: "activeclinic",
      channel: CHANNEL.PHONE,
      purpose: "account_verification",
    },
    env
  );
}

async function startActiveClinicEmailVerification(db, input, env) {
  return startSharedVerification(
    db,
    {
      ...input,
      subjectKind: SUBJECT_KIND.PLATFORM_IDENTITY,
      productKey: "activeclinic",
      channel: CHANNEL.EMAIL,
      purpose: "account_verification",
    },
    env
  );
}

async function completeActiveClinicVerification(db, input, env) {
  return completeSharedVerification(
    db,
    {
      ...input,
      subjectKind: SUBJECT_KIND.PLATFORM_IDENTITY,
    },
    env
  );
}

async function getActiveClinicVerificationStatus(db, input, env) {
  return getSharedVerificationStatus(
    db,
    {
      ...input,
      subjectKind: SUBJECT_KIND.PLATFORM_IDENTITY,
    },
    env
  );
}

module.exports = {
  RESULT,
  CHANNEL,
  startActiveClinicPhoneVerification,
  startActiveClinicEmailVerification,
  completeActiveClinicVerification,
  getActiveClinicVerificationStatus,
  peekSharedVerificationCodeForTests,
};
