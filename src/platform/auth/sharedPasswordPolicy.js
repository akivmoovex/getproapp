"use strict";

/**
 * Shared password policy for BlessBoard + ActiveClinic (V8).
 * Single source of truth for length bounds, confirmation, and UI rule labels.
 *
 * V7 compatibility:
 * - Default min length remains 10; max 200.
 * - Env may raise the minimum (GETPRO_PASSWORD_MIN_LENGTH) but never below 10.
 * - Existing bcrypt hashes stay valid; this module does not rehash on verify.
 */

const DEFAULT_PASSWORD_MIN = 10;
const DEFAULT_PASSWORD_MAX = 200;
const ABSOLUTE_MAX = 1024;

const POLICY_RESULT = Object.freeze({
  OK: "ok",
  WEAK_PASSWORD: "weak_password",
  MISMATCH: "confirmation_mismatch",
});

/**
 * @param {NodeJS.ProcessEnv} [env]
 * @returns {{ min: number, max: number, defaultMin: number, defaultMax: number }}
 */
function resolvePasswordLengthBounds(env) {
  const source = env || process.env;
  let min = Number(source.GETPRO_PASSWORD_MIN_LENGTH);
  let max = Number(source.GETPRO_PASSWORD_MAX_LENGTH);
  if (!Number.isFinite(min)) min = DEFAULT_PASSWORD_MIN;
  if (!Number.isFinite(max)) max = DEFAULT_PASSWORD_MAX;
  // Never weaken below the V7 baseline of 10 characters.
  min = Math.max(DEFAULT_PASSWORD_MIN, Math.floor(min));
  max = Math.floor(max);
  if (max < min) max = Math.max(min, DEFAULT_PASSWORD_MAX);
  if (max > ABSOLUTE_MAX) max = ABSOLUTE_MAX;
  return Object.freeze({
    min,
    max,
    defaultMin: DEFAULT_PASSWORD_MIN,
    defaultMax: DEFAULT_PASSWORD_MAX,
  });
}

/**
 * @param {unknown} password
 * @param {NodeJS.ProcessEnv} [env]
 * @returns {{ ok: true, value: string, bounds: object } | { ok: false, code: string, bounds: object }}
 */
function validatePasswordPolicy(password, env) {
  const bounds = resolvePasswordLengthBounds(env);
  const value = password != null ? String(password) : "";
  if (!value || value.length < bounds.min || value.length > bounds.max) {
    return { ok: false, code: POLICY_RESULT.WEAK_PASSWORD, bounds };
  }
  return { ok: true, value, bounds };
}

/**
 * Validate password + confirmation for registration, reset, invite, change.
 * @param {unknown} password
 * @param {unknown} confirmPassword
 * @param {NodeJS.ProcessEnv} [env]
 */
function validatePasswordPair(password, confirmPassword, env) {
  const policy = validatePasswordPolicy(password, env);
  if (!policy.ok) {
    return {
      ok: false,
      code: POLICY_RESULT.WEAK_PASSWORD,
      error: `Password must be at least ${policy.bounds.min} characters.`,
      field: "password",
      bounds: policy.bounds,
    };
  }
  const confirm = String(confirmPassword == null ? "" : confirmPassword);
  if (confirm !== policy.value) {
    return {
      ok: false,
      code: POLICY_RESULT.MISMATCH,
      error: "Password and confirmation do not match.",
      field: "password_confirm",
      bounds: policy.bounds,
    };
  }
  return { ok: true, value: policy.value, bounds: policy.bounds };
}

/**
 * @param {NodeJS.ProcessEnv} [env]
 */
function getPasswordPolicyRules(env) {
  const bounds = resolvePasswordLengthBounds(env);
  return Object.freeze([
    {
      id: "min_length",
      label: `At least ${bounds.min} characters`,
      test: (value) => String(value || "").length >= bounds.min,
    },
    {
      id: "max_length",
      label: `No more than ${bounds.max} characters`,
      test: (value) => String(value || "").length <= bounds.max,
    },
  ]);
}

/**
 * @param {unknown} password
 * @param {NodeJS.ProcessEnv} [env]
 */
function evaluatePasswordRules(password, env) {
  const value = String(password == null ? "" : password);
  return getPasswordPolicyRules(env).map((rule) => ({
    id: rule.id,
    label: rule.label,
    met: rule.test(value),
  }));
}

/** @deprecated Prefer resolvePasswordLengthBounds().min — kept for callers. */
const PASSWORD_MIN = DEFAULT_PASSWORD_MIN;
/** @deprecated Prefer resolvePasswordLengthBounds().max */
const PASSWORD_MAX = DEFAULT_PASSWORD_MAX;

module.exports = {
  DEFAULT_PASSWORD_MIN,
  DEFAULT_PASSWORD_MAX,
  PASSWORD_MIN,
  PASSWORD_MAX,
  POLICY_RESULT,
  resolvePasswordLengthBounds,
  validatePasswordPolicy,
  validatePasswordPair,
  getPasswordPolicyRules,
  evaluatePasswordRules,
};
