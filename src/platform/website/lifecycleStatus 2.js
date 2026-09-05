"use strict";

const LIFECYCLE_STATUS = Object.freeze({
  PROVISIONAL: "provisional",
  PUBLIC: "public",
  UNDER_REVIEW: "under_review",
  SUSPENDED: "suspended",
  OFFLINE: "offline",
});

const ALL_LIFECYCLE_STATUSES = Object.freeze(Object.values(LIFECYCLE_STATUS));

const LIFECYCLE_LABELS = Object.freeze({
  [LIFECYCLE_STATUS.PROVISIONAL]: "Temporary website",
  [LIFECYCLE_STATUS.PUBLIC]: "Website live",
  [LIFECYCLE_STATUS.UNDER_REVIEW]: "Changes under review",
  [LIFECYCLE_STATUS.SUSPENDED]: "Website blocked",
  [LIFECYCLE_STATUS.OFFLINE]: "Website hidden",
});

function isLifecycleStatus(value) {
  return ALL_LIFECYCLE_STATUSES.includes(String(value || ""));
}

function blocksAnonymousPublic(status) {
  const value = String(status || "");
  return value === LIFECYCLE_STATUS.OFFLINE || value === LIFECYCLE_STATUS.SUSPENDED;
}

function allowsPublicVisitors(status) {
  return String(status || "") === LIFECYCLE_STATUS.PUBLIC;
}

module.exports = {
  LIFECYCLE_STATUS,
  ALL_LIFECYCLE_STATUSES,
  LIFECYCLE_LABELS,
  isLifecycleStatus,
  blocksAnonymousPublic,
  allowsPublicVisitors,
};
