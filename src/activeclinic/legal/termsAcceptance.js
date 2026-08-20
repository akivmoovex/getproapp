"use strict";

/**
 * Server-side Terms of Service acceptance for ActiveClinic clinic registration.
 * Must be checked before any registration persist or provisioning write.
 */

const {
  TERMS_VERSION,
  PRIVACY_VERSION,
} = require("./legalMetadata");

const TERMS_REQUIRED_MESSAGE =
  "You must agree to the Terms of Service before creating your clinic.";

function isTermsAccepted(value) {
  const raw = String(value == null ? "" : value).trim().toLowerCase();
  return raw === "on" || raw === "true" || raw === "1" || raw === "yes";
}

function readAcceptanceValue(input) {
  if (!input || typeof input !== "object") return "";
  if (input.acceptTerms != null && String(input.acceptTerms).trim() !== "") {
    return input.acceptTerms;
  }
  if (input.accept_terms != null && String(input.accept_terms).trim() !== "") {
    return input.accept_terms;
  }
  if (input.termsAccepted != null && String(input.termsAccepted).trim() !== "") {
    return input.termsAccepted;
  }
  return "";
}

/**
 * @param {object} [input]
 * @returns {{
 *   ok: boolean,
 *   errors: Record<string, string>,
 *   termsVersion?: string,
 *   privacyVersion?: string,
 * }}
 */
function validateTermsAcceptance(input) {
  if (isTermsAccepted(readAcceptanceValue(input))) {
    return {
      ok: true,
      errors: {},
      termsVersion: TERMS_VERSION,
      privacyVersion: PRIVACY_VERSION,
    };
  }
  return {
    ok: false,
    errors: { acceptTerms: TERMS_REQUIRED_MESSAGE },
  };
}

module.exports = {
  TERMS_VERSION,
  PRIVACY_VERSION,
  TERMS_REQUIRED_MESSAGE,
  isTermsAccepted,
  readAcceptanceValue,
  validateTermsAcceptance,
};
