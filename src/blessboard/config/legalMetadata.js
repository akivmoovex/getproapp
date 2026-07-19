"use strict";

/**
 * Centralized BlessBoard public legal metadata.
 * Values marked PENDING_* must not be invented in page prose — render via helpers only.
 * See docs/blessboard-legal-review-gaps.md.
 */

const EFFECTIVE_DATE_ISO = "2026-07-19";
const EFFECTIVE_DATE_DISPLAY = "19 July 2026";

/** Public brand name only — not a claim of registered company identity. */
const OPERATOR_DISPLAY_NAME = "BlessBoard";

/** Documented product relationship (footer / about copy already uses this). */
const PLATFORM_TECHNOLOGY_NOTE =
  "BlessBoard church-management services are delivered using GetPro technology.";

/**
 * Unresolved legal/operator fields. Keep null until owner/counsel confirm.
 * Do not invent emails, addresses, registration numbers, or jurisdictions.
 */
const PENDING = Object.freeze({
  registeredCompanyName: null,
  companyRegistrationNumber: null,
  legalAddress: null,
  supportEmail: null,
  privacyEmail: null,
  governingLawJurisdiction: null,
  dataProtectionOfficer: null,
  supervisoryAuthority: null,
});

const CONTACT_PATHS = Object.freeze({
  /** V5 apex church-registration / enquiry form (live). */
  registerChurch: "/register-church",
  directory: "/directory",
  login: "/login",
  /** V4 apex contact exists; V5 foundation does not yet expose /contact. */
  contact: null,
  support: null,
  security: null,
});

const DRAFT_BANNER =
  "Operational draft pending professional legal review. Unresolved operator details are listed for confirmation and are not stated as facts on this page.";

/**
 * @returns {{
 *   effectiveDateIso: string,
 *   effectiveDateDisplay: string,
 *   operatorDisplayName: string,
 *   platformTechnologyNote: string,
 *   draftBanner: string,
 *   pending: typeof PENDING,
 *   contactPaths: typeof CONTACT_PATHS,
 * }}
 */
function getLegalMetadata() {
  return {
    effectiveDateIso: EFFECTIVE_DATE_ISO,
    effectiveDateDisplay: EFFECTIVE_DATE_DISPLAY,
    operatorDisplayName: OPERATOR_DISPLAY_NAME,
    platformTechnologyNote: PLATFORM_TECHNOLOGY_NOTE,
    draftBanner: DRAFT_BANNER,
    pending: PENDING,
    contactPaths: CONTACT_PATHS,
  };
}

/**
 * Safe contact blurb for templates — never invents email/address.
 * @param {ReturnType<typeof getLegalMetadata>} [meta]
 */
function buildPublicContactInstructions(meta) {
  const m = meta || getLegalMetadata();
  const parts = [];
  if (m.pending.privacyEmail) {
    parts.push(`Privacy questions: ${m.pending.privacyEmail}.`);
  }
  if (m.pending.supportEmail) {
    parts.push(`Support: ${m.pending.supportEmail}.`);
  }
  parts.push(
    `For platform or church-onboarding questions, use <a href="${m.contactPaths.registerChurch}">Register Your Church</a>.`
  );
  parts.push(
    `To find an existing congregation, use the <a href="${m.contactPaths.directory}">church directory</a>.`
  );
  parts.push(
    "For questions about information held by a specific church, contact that church’s administrators."
  );
  if (m.pending.legalAddress) {
    parts.push(`Correspondence address: ${m.pending.legalAddress}.`);
  }
  return parts.join(" ");
}

module.exports = {
  EFFECTIVE_DATE_ISO,
  EFFECTIVE_DATE_DISPLAY,
  OPERATOR_DISPLAY_NAME,
  PLATFORM_TECHNOLOGY_NOTE,
  PENDING,
  CONTACT_PATHS,
  DRAFT_BANNER,
  getLegalMetadata,
  buildPublicContactInstructions,
};
