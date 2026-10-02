"use strict";

/**
 * Compatibility redaction for legacy member_requests prayer/pastoral bodies.
 * Does not delete stored data — only suppresses presentation without pastoral note perms.
 */

const CONFIDENTIAL_CATEGORIES = Object.freeze(new Set(["prayer", "pastoral"]));

const REDACTED_MESSAGE =
  "This prayer or pastoral message is confidential. View it only through authorized pastoral care access.";

/**
 * @param {string|null|undefined} category
 */
function isConfidentialMemberRequestCategory(category) {
  return CONFIDENTIAL_CATEGORIES.has(
    String(category || "")
      .trim()
      .toLowerCase()
  );
}

/**
 * @param {object|null|undefined} request
 * @param {{ mayViewPastoralBodies?: boolean }} [opts]
 */
function presentMemberRequestWithPastoralRedaction(request, opts) {
  if (!request) return null;
  const mayView = opts && opts.mayViewPastoralBodies === true;
  const confidential = isConfidentialMemberRequestCategory(request.category);
  const out = { ...request };
  if (confidential && !mayView) {
    out.message = REDACTED_MESSAGE;
    out.messageRedacted = true;
  } else {
    out.messageRedacted = false;
  }
  return out;
}

module.exports = {
  CONFIDENTIAL_CATEGORIES,
  REDACTED_MESSAGE,
  isConfidentialMemberRequestCategory,
  presentMemberRequestWithPastoralRedaction,
};
