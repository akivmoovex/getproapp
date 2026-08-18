"use strict";

/**
 * Read-side compatibility for registration statuses.
 * New writes use canonical lifecycle values. Historical rows keep legacy product values.
 */

const { LIFECYCLE } = require("./constants");

const CANONICAL_STORAGE = Object.freeze([
  LIFECYCLE.SUBMITTED,
  LIFECYCLE.PROVISIONING,
  LIFECYCLE.REVIEW_REQUIRED,
  LIFECYCLE.ACTIVE,
  LIFECYCLE.REJECTED,
  LIFECYCLE.SUSPENDED,
  LIFECYCLE.PROVISION_FAILED,
]);

const ACTIVECLINIC_LEGACY_TO_CANONICAL = Object.freeze({
  pending_review: LIFECYCLE.REVIEW_REQUIRED,
  approved: LIFECYCLE.ACTIVE,
  withdrawn: LIFECYCLE.REJECTED,
  duplicate: LIFECYCLE.REVIEW_REQUIRED,
});

const BLESSBOARD_LEGACY_TO_CANONICAL = Object.freeze({
  duplicate_review: LIFECYCLE.REVIEW_REQUIRED,
  pending: LIFECYCLE.REVIEW_REQUIRED,
  closed: LIFECYCLE.ACTIVE,
  cancelled: LIFECYCLE.REJECTED,
});

const ACTIVECLINIC_REVIEW_HOLD_STORED = Object.freeze([
  "submitted",
  "review_required",
  "pending_review",
]);

const ACTIVECLINIC_ACTIVE_STORED = Object.freeze(["active", "approved"]);

const BLESSBOARD_OPEN_APPLICATION_STATUSES = Object.freeze([
  "submitted",
  "provisioning",
  "review_required",
  "duplicate_review",
]);

const BLESSBOARD_ACTIVE_APPLICATION_STATUSES = Object.freeze(["active", "closed"]);

function sqlInList(values) {
  return values.map((value) => `'${String(value).replace(/'/g, "''")}'`).join(", ");
}

function isCanonicalStorage(status) {
  return CANONICAL_STORAGE.includes(String(status || ""));
}

function isActiveClinicReviewHold(status) {
  return ACTIVECLINIC_REVIEW_HOLD_STORED.includes(String(status || ""));
}

function isActiveClinicStoredActive(status) {
  return ACTIVECLINIC_ACTIVE_STORED.includes(String(status || ""));
}

function isBlessBoardOpenApplication(status) {
  return BLESSBOARD_OPEN_APPLICATION_STATUSES.includes(String(status || ""));
}

function isBlessBoardStoredActive(row) {
  const status = String((row && (row.application_status || row.status)) || "");
  const orgId = row && (row.organization_id || row.organizationId);
  if (status === "active") return true;
  if (status === "closed" && orgId) return true;
  return String((row && row.provisioning_status) || "") === "provisioned" && Boolean(orgId);
}

module.exports = {
  CANONICAL_STORAGE,
  ACTIVECLINIC_LEGACY_TO_CANONICAL,
  BLESSBOARD_LEGACY_TO_CANONICAL,
  ACTIVECLINIC_REVIEW_HOLD_STORED,
  ACTIVECLINIC_ACTIVE_STORED,
  BLESSBOARD_OPEN_APPLICATION_STATUSES,
  BLESSBOARD_ACTIVE_APPLICATION_STATUSES,
  sqlInList,
  isCanonicalStorage,
  isActiveClinicReviewHold,
  isActiveClinicStoredActive,
  isBlessBoardOpenApplication,
  isBlessBoardStoredActive,
};
