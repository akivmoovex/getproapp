"use strict";

/**
 * Access / discovery constants for shared tenant forms (SH07).
 * Discovery (unlist) is independent of payload access control.
 */

const ACCESS_MODES = Object.freeze({
  OPEN_PUBLIC: "open_public",
  EMAIL_TOKEN: "email_token",
});

const FORM_STATUSES = Object.freeze({
  DRAFT: "draft",
  PUBLISHED: "published",
  ARCHIVED: "archived",
});

const PRODUCT_CODES = Object.freeze({
  BLESSBOARD: "blessboard",
  ACTIVECLINIC: "activeclinic",
});

/** Form submission review statuses (SH13) — not clinical record states. */
const REVIEW_STATUSES = Object.freeze({
  SUBMITTED: "submitted",
  IN_REVIEW: "in_review",
  ACCEPTED: "accepted",
  REJECTED: "rejected",
  CLOSED: "closed",
});

const REVIEW_TRANSITIONS = Object.freeze({
  submitted: Object.freeze(["in_review", "rejected", "closed"]),
  in_review: Object.freeze(["accepted", "rejected", "submitted", "closed"]),
  accepted: Object.freeze(["closed", "in_review"]),
  rejected: Object.freeze(["closed", "in_review"]),
  closed: Object.freeze([]),
});

module.exports = {
  ACCESS_MODES,
  FORM_STATUSES,
  PRODUCT_CODES,
  REVIEW_STATUSES,
  REVIEW_TRANSITIONS,
};
