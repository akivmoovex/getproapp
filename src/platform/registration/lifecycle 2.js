"use strict";

const { LIFECYCLE, PRODUCT } = require("./constants");
const {
  ACTIVECLINIC_LEGACY_TO_CANONICAL,
  BLESSBOARD_LEGACY_TO_CANONICAL,
} = require("./statusCompatibility");

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
  if (status === LIFECYCLE.REJECTED || status === "withdrawn") return LIFECYCLE.REJECTED;
  if (status === LIFECYCLE.SUSPENDED) return LIFECYCLE.SUSPENDED;
  if (status === LIFECYCLE.PROVISION_FAILED || provisioning === "failed" || provisioning === "provisioning_failed") {
    return LIFECYCLE.PROVISION_FAILED;
  }
  if (provisioning === "website_pending") return LIFECYCLE.PROVISION_FAILED;
  if (status === LIFECYCLE.PROVISIONING || provisioning === "in_progress" || provisioning === "provisioning") {
    return LIFECYCLE.PROVISIONING;
  }
  if (status === LIFECYCLE.ACTIVE && provisioning && provisioning !== "provisioned") {
    return LIFECYCLE.PROVISION_FAILED;
  }
  if (status === LIFECYCLE.ACTIVE) return LIFECYCLE.ACTIVE;
  if (status === "approved" && provisioning === "provisioned") {
    return LIFECYCLE.ACTIVE;
  }
  if (status === "approved" && provisioning === "website_pending") {
    return LIFECYCLE.PROVISION_FAILED;
  }
  if (status === "approved") return LIFECYCLE.APPROVED;
  if (status === LIFECYCLE.REVIEW_REQUIRED || status === "pending_review") {
    return LIFECYCLE.REVIEW_REQUIRED;
  }
  if (status === LIFECYCLE.SUBMITTED) return LIFECYCLE.SUBMITTED;
  if (ACTIVECLINIC_LEGACY_TO_CANONICAL[status]) return ACTIVECLINIC_LEGACY_TO_CANONICAL[status];
  return LIFECYCLE.SUBMITTED;
}

function fromBlessBoard(row) {
  const status = String(row.application_status || row.status || "");
  const provisioning = String(row.provisioning_status || "");
  if (status === LIFECYCLE.REJECTED || status === "cancelled") return LIFECYCLE.REJECTED;
  if (status === LIFECYCLE.SUSPENDED) return LIFECYCLE.SUSPENDED;
  if (status === LIFECYCLE.PROVISION_FAILED || provisioning === "provisioning_failed") {
    return LIFECYCLE.PROVISION_FAILED;
  }
  if (provisioning === "website_pending") return LIFECYCLE.PROVISION_FAILED;
  if (status === LIFECYCLE.PROVISIONING || provisioning === "provisioning") {
    return LIFECYCLE.PROVISIONING;
  }
  if (status === LIFECYCLE.ACTIVE && provisioning && provisioning !== "provisioned") {
    return LIFECYCLE.PROVISION_FAILED;
  }
  if (status === LIFECYCLE.ACTIVE) return LIFECYCLE.ACTIVE;
  if (provisioning === "provisioned" && row.organization_id) return LIFECYCLE.ACTIVE;
  if (status === "closed" && row.organization_id) return LIFECYCLE.ACTIVE;
  if (status === "closed" && !row.organization_id) {
    return LIFECYCLE.SUBMITTED;
  }
  if (status === LIFECYCLE.REVIEW_REQUIRED || status === "duplicate_review") {
    return LIFECYCLE.REVIEW_REQUIRED;
  }
  if (status === "pending") return LIFECYCLE.REVIEW_REQUIRED;
  if (status === LIFECYCLE.SUBMITTED) return LIFECYCLE.SUBMITTED;
  if (BLESSBOARD_LEGACY_TO_CANONICAL[status]) return BLESSBOARD_LEGACY_TO_CANONICAL[status];
  return LIFECYCLE.SUBMITTED;
}

function isReviewHold(canonical) {
  return canonical === LIFECYCLE.REVIEW_REQUIRED;
}

function isOperational(canonical) {
  return canonical === LIFECYCLE.ACTIVE || canonical === LIFECYCLE.ONBOARDING;
}

function isAmbiguousBlessBoardClosed(row) {
  return String((row && (row.application_status || row.status)) || "") === "closed" && !row.organization_id;
}

module.exports = {
  toCanonicalLifecycle,
  fromActiveClinic,
  fromBlessBoard,
  isReviewHold,
  isOperational,
  isAmbiguousBlessBoardClosed,
};
