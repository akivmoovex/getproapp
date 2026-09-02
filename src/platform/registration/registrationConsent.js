"use strict";

/**
 * Shared registration Terms/Privacy consent for BlessBoard and ActiveClinic.
 */

const CONSENT_FIELD = "registration_consent";

const CONSENT_REQUIRED_MESSAGE =
  "Please confirm that you agree to the Terms of Service and Privacy Policy.";

function isTruthyCheckbox(value) {
  return (
    value === "on" ||
    value === "1" ||
    value === true ||
    value === "true"
  );
}

/**
 * Read consent from any supported field name (shared + legacy aliases).
 * @param {object|null|undefined} body
 */
function readRegistrationConsentValue(body) {
  if (!body || typeof body !== "object") return false;
  return (
    isTruthyCheckbox(body[CONSENT_FIELD]) ||
    isTruthyCheckbox(body.consent_contact) ||
    isTruthyCheckbox(body.consent_terms) ||
    isTruthyCheckbox(body.acceptTerms) ||
    isTruthyCheckbox(body.accept_terms) ||
    isTruthyCheckbox(body.termsAccepted)
  );
}

/**
 * @param {object|null|undefined} body
 * @returns {{ ok: true } | { ok: false, error: string, field: string }}
 */
function validateRegistrationConsent(body) {
  if (readRegistrationConsentValue(body)) {
    return { ok: true };
  }
  return {
    ok: false,
    error: CONSENT_REQUIRED_MESSAGE,
    field: CONSENT_FIELD,
  };
}

module.exports = {
  CONSENT_FIELD,
  CONSENT_REQUIRED_MESSAGE,
  readRegistrationConsentValue,
  validateRegistrationConsent,
};
