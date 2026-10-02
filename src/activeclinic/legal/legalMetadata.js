"use strict";

/**
 * ActiveClinic public legal metadata.
 * PENDING values must not be invented in page prose.
 */

const EFFECTIVE_DATE_ISO = "2026-08-19";
const EFFECTIVE_DATE_DISPLAY = "19 August 2026";
const TERMS_VERSION = "2026-08-19";
const PRIVACY_VERSION = "2026-08-19";

const OPERATOR_DISPLAY_NAME = "ActiveClinic";

const PLATFORM_TECHNOLOGY_NOTE =
  "ActiveClinic platform services are delivered using GetPro technology.";

const PENDING = Object.freeze({
  registeredCompanyName: null,
  companyRegistrationNumber: null,
  legalAddress: null,
  supportEmail: null,
  privacyEmail: null,
  governingLawJurisdiction: null,
  dataProtectionOfficer: null,
  supervisoryAuthority: null,
  liabilityCap: null,
});

const CONTACT_PATHS = Object.freeze({
  registerClinic: "/register-clinic",
  directory: "/clinics",
  login: "/login",
  about: "/about",
  contact: null,
  support: null,
});

const DRAFT_BANNER =
  "Operational draft pending professional legal review. Unresolved operator details are listed for confirmation and are not stated as facts on this page.";

function getLegalMetadata() {
  return {
    effectiveDateIso: EFFECTIVE_DATE_ISO,
    effectiveDateDisplay: EFFECTIVE_DATE_DISPLAY,
    termsVersion: TERMS_VERSION,
    privacyVersion: PRIVACY_VERSION,
    operatorDisplayName: OPERATOR_DISPLAY_NAME,
    platformTechnologyNote: PLATFORM_TECHNOLOGY_NOTE,
    draftBanner: DRAFT_BANNER,
    pending: PENDING,
    contactPaths: CONTACT_PATHS,
  };
}

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
    `For clinic onboarding questions, use <a href="${m.contactPaths.registerClinic}">Register your clinic</a>.`
  );
  parts.push(
    `To find a published clinic, use the <a href="${m.contactPaths.directory}">clinic directory</a>.`
  );
  parts.push(
    `Authorized staff can <a href="${m.contactPaths.login}">sign in</a>.`
  );
  parts.push(
    "For questions about information held by a specific clinic, contact that clinic’s administrators."
  );
  if (m.pending.legalAddress) {
    parts.push(`Correspondence address: ${m.pending.legalAddress}.`);
  }
  return parts.join(" ");
}

module.exports = {
  EFFECTIVE_DATE_ISO,
  EFFECTIVE_DATE_DISPLAY,
  TERMS_VERSION,
  PRIVACY_VERSION,
  OPERATOR_DISPLAY_NAME,
  PLATFORM_TECHNOLOGY_NOTE,
  PENDING,
  CONTACT_PATHS,
  DRAFT_BANNER,
  getLegalMetadata,
  buildPublicContactInstructions,
};
