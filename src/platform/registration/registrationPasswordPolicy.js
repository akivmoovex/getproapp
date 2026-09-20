"use strict";

/**
 * Shared registration password policy (BlessBoard + ActiveClinic).
 * Delegates to platform auth sharedPasswordPolicy (V8 single source of truth).
 */

const {
  PASSWORD_MIN,
  PASSWORD_MAX,
  DEFAULT_PASSWORD_MIN,
  DEFAULT_PASSWORD_MAX,
  resolvePasswordLengthBounds,
  validatePasswordPolicy,
  validatePasswordPair,
  getPasswordPolicyRules,
  evaluatePasswordRules,
  POLICY_RESULT,
} = require("../auth/sharedPasswordPolicy");

/**
 * @param {NodeJS.ProcessEnv} [env]
 */
function getRegistrationPasswordRules(env) {
  return getPasswordPolicyRules(env);
}

/** @type {ReadonlyArray<{ id: string, label: string, test: Function }>} */
const REGISTRATION_PASSWORD_RULES = getPasswordPolicyRules();

/**
 * @param {unknown} password
 * @param {unknown} confirmPassword
 * @param {NodeJS.ProcessEnv} [env]
 */
function validateRegistrationPasswordPair(password, confirmPassword, env) {
  return validatePasswordPair(password, confirmPassword, env);
}

/**
 * @param {unknown} password
 * @param {NodeJS.ProcessEnv} [env]
 */
function evaluateRegistrationPasswordRules(password, env) {
  return evaluatePasswordRules(password, env);
}

module.exports = {
  PASSWORD_MIN,
  PASSWORD_MAX,
  DEFAULT_PASSWORD_MIN,
  DEFAULT_PASSWORD_MAX,
  POLICY_RESULT,
  REGISTRATION_PASSWORD_RULES,
  getRegistrationPasswordRules,
  resolvePasswordLengthBounds,
  validatePasswordPolicy,
  validatePasswordPair,
  validateRegistrationPasswordPair,
  evaluateRegistrationPasswordRules,
  evaluatePasswordRules,
};
