"use strict";

/**
 * Draft Zambia-facing Community Benefits consent notice for QA review only.
 * Not activated. Not shown to real patients. Not a live legal notice.
 */

const DRAFT_NOTICE_VERSION = "draft-notice-v2134";

const DRAFT_NOTICE_TEXT = [
  "DRAFT FOR QA REVIEW ONLY — NOT ACTIVATED.",
  "ActiveClinic Community Benefits may record your membership, clinic introductions,",
  "and visit eligibility so participating clinics can prepare inactive agreement previews.",
  "No live discount, contribution, or settlement is activated by this draft.",
  "You may ask clinic staff to explain how your chart stays clinic-scoped.",
  "This text is not approved for live patient enrollment.",
].join(" ");

function getDraftConsentNotice() {
  return {
    version: DRAFT_NOTICE_VERSION,
    status: "DRAFT_INACTIVE",
    legalApproval: "unapproved",
    text: DRAFT_NOTICE_TEXT,
    activated: false,
  };
}

module.exports = {
  DRAFT_NOTICE_VERSION,
  DRAFT_NOTICE_TEXT,
  getDraftConsentNotice,
};
