"use strict";

const { LIFECYCLE, PRODUCT } = require("./constants");

/**
 * Map a stored product application row into the canonical lifecycle.
 * Does not mutate the source row.
 */
function toCanonicalLifecycle(productCode, row) {
  const product = String(productCode || "");
  if (!row) return LIFECYCLE.SUBMITTED;
  if (product === PRODUCT.ACTIVECLINIC) return fromActiveClinic(row);
  if (product === PRODUCT.BLESSBOARD) return fromBlessBoard(row);
  return LIFECYCLE.SUBMITTED;
}

function fromActiveClinic(row) {
  const status = String(row.status || row.application_status || "");
  const provisioning = String(row.provisioning_status || "");
  if (status === "rejected" || status === "withdrawn") return LIFECYCLE.REJECTED;
  if (status === "suspended") return LIFECYCLE.SUSPENDED;
  if (provisioning === "failed" || provisioning === "provisioning_failed") {
    return LIFECYCLE.PROVISION_FAILED;
  }
  if (provisioning === "in_progress" || provisioning === "provisioning") {
    return LIFECYCLE.PROVISIONING;
  }
  if (status === "approved" && (provisioning === "provisioned" || provisioning === "website_pending")) {
    return LIFECYCLE.ACTIVE;
  }
  if (status === "approved") return LIFECYCLE.APPROVED;
  if (status === "review_required" || status === "pending_review") return LIFECYCLE.REVIEW_REQUIRED;
  return LIFECYCLE.SUBMITTED;
}

function fromBlessBoard(row) {
  const status = String(row.application_status || row.status || "");
  const provisioning = String(row.provisioning_status || "");
  if (status === "rejected" || status === "cancelled") return LIFECYCLE.REJECTED;
  if (provisioning === "provisioning_failed") return LIFECYCLE.PROVISION_FAILED;
  if (provisioning === "provisioning") return LIFECYCLE.PROVISIONING;
  if (provisioning === "provisioned" && row.organization_id) return LIFECYCLE.ACTIVE;
  if (status === "closed" && row.organization_id) return LIFECYCLE.ACTIVE;
  if (status === "review_required" || status === "duplicate_review") return LIFECYCLE.REVIEW_REQUIRED;
  if (status === "pending") return LIFECYCLE.REVIEW_REQUIRED;
  return LIFECYCLE.SUBMITTED;
}

function isReviewHold(canonical) {
  return canonical === LIFECYCLE.REVIEW_REQUIRED;
}

function isOperational(canonical) {
  return canonical === LIFECYCLE.ACTIVE || canonical === LIFECYCLE.ONBOARDING;
}

module.exports = {
  toCanonicalLifecycle,
  fromActiveClinic,
  fromBlessBoard,
  isReviewHold,
  isOperational,
};
