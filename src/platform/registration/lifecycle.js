"use strict";

const { LIFECYCLE, PRODUCT } = require("./constants");

/**
 * Map a stored product application row into the canonical lifecycle.
 * Does not mutate the source row.
 * DBCL07: no historical alias branches (pending_review, duplicate_review, closed, …).
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
  if (status === LIFECYCLE.REJECTED) return LIFECYCLE.REJECTED;
  if (status === LIFECYCLE.SUSPENDED) return LIFECYCLE.SUSPENDED;
  if (
    status === LIFECYCLE.PROVISION_FAILED ||
    provisioning === "failed" ||
    provisioning === "provisioning_failed"
  ) {
    return LIFECYCLE.PROVISION_FAILED;
  }
  if (provisioning === "website_pending") return LIFECYCLE.PROVISION_FAILED;
  if (
    status === LIFECYCLE.PROVISIONING ||
    provisioning === "in_progress" ||
    provisioning === "provisioning"
  ) {
    return LIFECYCLE.PROVISIONING;
  }
  if (status === LIFECYCLE.ACTIVE && provisioning && provisioning !== "provisioned") {
    return LIFECYCLE.PROVISION_FAILED;
  }
  if (status === LIFECYCLE.ACTIVE) return LIFECYCLE.ACTIVE;
  if (status === LIFECYCLE.ONBOARDING) return LIFECYCLE.ONBOARDING;
  if (status === LIFECYCLE.REVIEW_REQUIRED) return LIFECYCLE.REVIEW_REQUIRED;
  if (status === LIFECYCLE.SUBMITTED) return LIFECYCLE.SUBMITTED;
  return LIFECYCLE.SUBMITTED;
}

function fromBlessBoard(row) {
  const status = String(row.application_status || row.status || "");
  const provisioning = String(row.provisioning_status || "");
  if (status === LIFECYCLE.REJECTED) return LIFECYCLE.REJECTED;
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
  if (status === LIFECYCLE.ONBOARDING) return LIFECYCLE.ONBOARDING;
  if (status === LIFECYCLE.REVIEW_REQUIRED) return LIFECYCLE.REVIEW_REQUIRED;
  if (status === LIFECYCLE.SUBMITTED) return LIFECYCLE.SUBMITTED;
  return LIFECYCLE.SUBMITTED;
}

module.exports = {
  toCanonicalLifecycle,
};
