"use strict";

const { REVIEW_REASON } = require("./constants");

/**
 * Shared review policy. Product adapters only contribute signals.
 * A reason means review_required. Absence of a reason means auto-provision.
 */
function decideReview(input) {
  const signals = (input && input.signals) || {};
  const reasons = [];

  if (signals.provisioningEnabled === false) {
    reasons.push(REVIEW_REASON.SELF_REGISTRATION_PROVISIONING_DISABLED);
  }
  if (signals.networkPlan === true) {
    reasons.push(REVIEW_REASON.NETWORK_PLAN_MANUAL_REVIEW);
  }
  if (signals.identityCollision === true) {
    reasons.push(
      signals.identityCollisionReason || REVIEW_REASON.IDENTITY_COLLISION
    );
  }
  if (signals.duplicateCandidate === true) {
    reasons.push(REVIEW_REASON.DUPLICATE_CANDIDATE);
  }
  if (signals.riskHold === true) {
    reasons.push(signals.riskReason || REVIEW_REASON.RISK_HOLD);
  }
  if (signals.manualPlatformHold === true) {
    reasons.push(REVIEW_REASON.MANUAL_PLATFORM_HOLD);
  }
  if (Array.isArray(signals.extraReasons)) {
    for (const extra of signals.extraReasons) {
      if (extra) reasons.push(String(extra));
    }
  }

  const unique = [];
  for (const reason of reasons) {
    if (reason && !unique.includes(reason)) unique.push(reason);
  }
  return {
    autoProvision: unique.length === 0,
    reviewRequired: unique.length > 0,
    reasons: unique,
    reason: unique[0] || null,
  };
}

module.exports = {
  decideReview,
};
