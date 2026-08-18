"use strict";

/** Open (non-terminal) church registration application statuses, including canonical hold. */
const OPEN_CHURCH_APPLICATION_STATUSES = Object.freeze([
  "submitted",
  "duplicate_review",
  "review_required",
]);

function isOpenChurchApplicationStatus(status) {
  return OPEN_CHURCH_APPLICATION_STATUSES.includes(String(status || ""));
}

module.exports = {
  OPEN_CHURCH_APPLICATION_STATUSES,
  isOpenChurchApplicationStatus,
};
