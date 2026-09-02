"use strict";

/**
 * Shared registration password policy (BlessBoard + ActiveClinic).
 * Single source of truth for server validation and UI rule display.
 */

const {
  PASSWORD_MIN,
  PASSWORD_MAX,
  validatePasswordPolicy,
} = require("../services/platformIdentityCredentialService");

const REGISTRATION_PASSWORD_RULES = Object.freeze([
  {
    id: "min_length",
    label: `At least ${PASSWORD_MIN} characters`,
    test: (value) => String(value || "").length >= PASSWORD_MIN,
  },
  {
    id: "max_length",
    label: `No more than ${PASSWORD_MAX} characters`,
    test: (value) => String(value || "").length <= PASSWORD_MAX,
  },
]);

/**
 * @param {unknown} password
 * @param {unknown} confirmPassword
 */
function validateRegistrationPasswordPair(password, confirmPassword) {
  const policy = validatePasswordPolicy(password);
  if (!policy.ok) {
    return {
      ok: false,
      error: `Password must be at least ${PASSWORD_MIN} characters.`,
      field: "password",
    };
  }
  const confirm = String(confirmPassword == null ? "" : confirmPassword);
  if (confirm !== policy.value) {
    return {
      ok: false,
      error: "Password and confirmation do not match.",
      field: "password_confirm",
    };
  }
  return { ok: true, value: policy.value };
}

/**
 * Evaluate live rule status for UI.
 * @param {unknown} password
 */
function evaluateRegistrationPasswordRules(password) {
  const value = String(password == null ? "" : password);
  return REGISTRATION_PASSWORD_RULES.map((rule) => ({
    id: rule.id,
    label: rule.label,
    met: rule.test(value),
  }));
}

module.exports = {
  PASSWORD_MIN,
  PASSWORD_MAX,
  REGISTRATION_PASSWORD_RULES,
  validatePasswordPolicy,
  validateRegistrationPasswordPair,
  evaluateRegistrationPasswordRules,
};
