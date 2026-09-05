"use strict";

/**
 * Server-side Terms of Service acceptance for ActiveClinic clinic registration.
 * Delegates to shared registration consent validation.
 */

const {
  CONSENT_FIELD,
  CONSENT_REQUIRED_MESSAGE,
  readRegistrationConsentValue,
  validateRegistrationConsent,
} = require("../../platform/registration/registrationConsent");
const {
  TERMS_VERSION,
  PRIVACY_VERSION,
} = require("./legalMetadata");

const TERMS_REQUIRED_MESSAGE = CONSENT_REQUIRED_MESSAGE;

function isTermsAccepted(value) {
  return readRegistrationConsentValue({ [CONSENT_FIELD]: value });
}

function readAcceptanceValue(input) {
  if (!input || typeof input !== "object") return "";
  if (input[CONSENT_FIELD] != null && String(input[CONSENT_FIELD]).trim() !== "") {
    return input[CONSENT_FIELD];
  }
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
  const result = validateRegistrationConsent(input);
  if (result.ok) {
    return {
      ok: true,
      errors: {},
      termsVersion: TERMS_VERSION,
      privacyVersion: PRIVACY_VERSION,
    };
  }
  return {
    ok: false,
    errors: { [CONSENT_FIELD]: result.error },
  };
}

module.exports = {
  TERMS_VERSION,
  PRIVACY_VERSION,
  TERMS_REQUIRED_MESSAGE,
  CONSENT_FIELD,
  isTermsAccepted,
  readAcceptanceValue,
  validateTermsAcceptance,
};
