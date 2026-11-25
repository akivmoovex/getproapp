"use strict";

/**
 * Money is integer minor units (ngwee). 100 ngwee = K1.
 * Rates are basis points. 1000 basis points = 10%.
 */

function assertMinor(value, label) {
  if (!Number.isInteger(value) || value < 0) {
    const error = new Error(`${label || "amount"} must be a non-negative integer minor unit`);
    error.code = "invalid_amount";
    throw error;
  }
}

function assertBps(value) {
  if (!Number.isInteger(value) || value < 0 || value > 10000) {
    const error = new Error("rate must be an integer from 0 to 10000 basis points");
    error.code = "invalid_rate";
    throw error;
  }
}

function percentOfMinor(minor, basisPoints) {
  assertMinor(minor, "amount");
  assertBps(basisPoints);
  return Math.floor((minor * basisPoints + 5000) / 10000);
}

function calculateBenefit(input) {
  const amountMinor = input && input.amountMinor;
  assertMinor(amountMinor, "amount");
  const model = String((input && input.model) || "");
  if (model === "MODEL_A_DIRECT_DISCOUNT") {
    const discountBps = input.discountBps;
    assertBps(discountBps);
    const discountMinor = percentOfMinor(amountMinor, discountBps);
    return {
      model,
      amountMinor,
      discountMinor,
      payableMinor: amountMinor - discountMinor,
      contributionMinor: 0,
      patientSavingsMinor: discountMinor,
    };
  }
  if (model === "MODEL_B_COMMUNITY_CONTRIBUTION") {
    const contributionBps = input.contributionBps;
    assertBps(contributionBps);
    return {
      model,
      amountMinor,
      discountMinor: 0,
      payableMinor: amountMinor,
      contributionMinor: percentOfMinor(amountMinor, contributionBps),
      patientSavingsMinor: 0,
    };
  }
  if (model === "MODEL_C_HYBRID") {
    assertBps(input.discountBps);
    assertBps(input.contributionBps);
    const discountMinor = percentOfMinor(amountMinor, input.discountBps);
    return {
      model,
      amountMinor,
      discountMinor,
      payableMinor: amountMinor - discountMinor,
      contributionMinor: percentOfMinor(amountMinor - discountMinor, input.contributionBps),
      patientSavingsMinor: discountMinor,
    };
  }
  const error = new Error("unsupported benefit model");
  error.code = "unsupported_model";
  throw error;
}

module.exports = {
  percentOfMinor,
  calculateBenefit,
};
