"use strict";

/**
 * Minimal product configuration adapter over shared verification.
 * Products differ only by productKey + subjectKind (+ branded export aliases).
 */

const {
  startSharedVerification,
  completeSharedVerification,
  getSharedVerificationStatus,
  peekSharedVerificationCodeForTests,
  RESULT,
  CHANNEL,
  SUBJECT_KIND,
} = require("./sharedVerificationService");

/**
 * @param {{
 *   productKey: string,
 *   subjectKind: string,
 *   purpose?: string,
 * }} config
 */
function createProductVerificationAdapter(config) {
  const productKey = String((config && config.productKey) || "")
    .trim()
    .toLowerCase();
  const subjectKind = String((config && config.subjectKind) || "").trim();
  const purpose = String((config && config.purpose) || "account_verification").trim();

  if (!productKey || !subjectKind) {
    throw new Error("createProductVerificationAdapter requires productKey and subjectKind");
  }

  async function startPhoneVerification(db, input, env) {
    return startSharedVerification(
      db,
      {
        ...input,
        subjectKind,
        productKey,
        channel: CHANNEL.PHONE,
        purpose,
      },
      env
    );
  }

  async function startEmailVerification(db, input, env) {
    return startSharedVerification(
      db,
      {
        ...input,
        subjectKind,
        productKey,
        channel: CHANNEL.EMAIL,
        purpose,
      },
      env
    );
  }

  async function completeVerification(db, input, env) {
    return completeSharedVerification(
      db,
      {
        ...input,
        subjectKind,
      },
      env
    );
  }

  async function getVerificationStatus(db, input, env) {
    return getSharedVerificationStatus(
      db,
      {
        ...input,
        subjectKind,
      },
      env
    );
  }

  return {
    productKey,
    subjectKind,
    RESULT,
    CHANNEL,
    SUBJECT_KIND,
    startPhoneVerification,
    startEmailVerification,
    completeVerification,
    getVerificationStatus,
    peekSharedVerificationCodeForTests,
  };
}

module.exports = {
  createProductVerificationAdapter,
};
