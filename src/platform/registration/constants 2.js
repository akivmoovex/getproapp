"use strict";

/**
 * Canonical platform self-registration vocabulary.
 * Product adapters map legacy row statuses into these values.
 */

const PRODUCT = Object.freeze({
  ACTIVECLINIC: "activeclinic",
  BLESSBOARD: "blessboard",
});

const ENGINE = "platform.registration";

const RESULT = Object.freeze({
  ACTIVE: "ACTIVE",
  REVIEW_REQUIRED: "REVIEW_REQUIRED",
  DUPLICATE: "DUPLICATE",
  INVALID: "INVALID",
  PROVISION_FAILED: "PROVISION_FAILED",
  REJECTED: "REJECTED",
});

const LIFECYCLE = Object.freeze({
  SUBMITTED: "submitted",
  PROVISIONING: "provisioning",
  ACTIVE: "active",
  ONBOARDING: "onboarding",
  REVIEW_REQUIRED: "review_required",
  APPROVED: "approved",
  REJECTED: "rejected",
  SUSPENDED: "suspended",
  PROVISION_FAILED: "provision_failed",
});

const REVIEW_REASON = Object.freeze({
  IDENTITY_COLLISION: "identity_collision",
  DUPLICATE_CANDIDATE: "duplicate_candidate",
  RISK_HOLD: "risk_hold",
  NETWORK_PLAN_MANUAL_REVIEW: "network_plan_manual_review",
  PROVISION_FAILURE: "provision_failure",
  MANUAL_PLATFORM_HOLD: "manual_platform_hold",
  SELF_REGISTRATION_PROVISIONING_DISABLED: "self_registration_provisioning_disabled",
  EXISTING_IDENTITY_ACK_REQUIRED: "existing_identity_acknowledgement_required",
});

module.exports = {
  PRODUCT,
  ENGINE,
  RESULT,
  LIFECYCLE,
  REVIEW_REASON,
};
