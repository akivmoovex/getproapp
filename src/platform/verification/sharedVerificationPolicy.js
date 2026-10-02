"use strict";

/**
 * V8 shared verification policy / enforcement.
 * Default preserves V7 login: never lock out legacy/unknown verification status.
 */

const ENFORCEMENT = Object.freeze({
  OFF: "off",
  SOFT: "soft",
  HARD: "hard",
});

const CHANNEL = Object.freeze({
  PHONE: "phone",
  EMAIL: "email",
});

const SUBJECT_KIND = Object.freeze({
  PLATFORM_IDENTITY: "platform_identity",
  BLESSBOARD_USER: "blessboard_user",
});

const VERIFICATION_STATUS = Object.freeze({
  MISSING: "missing",
  VERIFIED: "verified",
  UNVERIFIED: "unverified",
  /** Existing accounts with null verified_at — never auto-locked. */
  LEGACY_UNVERIFIED: "legacy_unverified",
});

const DEFAULTS = Object.freeze({
  codeLength: 6,
  ttlSeconds: 10 * 60,
  resendDelaySeconds: 45,
  maxAttempts: 5,
  identifierHourlyCap: 5,
  subjectHourlyCap: 8,
  ipHourlyCap: 20,
});

function readInt(env, key, fallback) {
  const raw = env && env[key] != null ? String(env[key]).trim() : "";
  if (!raw) return fallback;
  const n = parseInt(raw, 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

/**
 * @param {NodeJS.ProcessEnv} [env]
 */
function resolveVerificationEnforcement(env) {
  const source = env || process.env;
  const raw = String(source.GETPRO_VERIFICATION_ENFORCEMENT || "")
    .trim()
    .toLowerCase();
  if (raw === ENFORCEMENT.SOFT || raw === ENFORCEMENT.HARD || raw === ENFORCEMENT.OFF) {
    return raw;
  }
  // V8 may opt into soft prompts; V7 / unset stays off.
  const line = String(source.PLATFORM_LINE || source.GETPRO_PLATFORM_LINE || "")
    .trim()
    .toLowerCase();
  const code = String(source.PLATFORM_DEPLOYMENT_CODE || "")
    .trim()
    .toLowerCase();
  if (line === "v8" || code.includes("v8")) {
    return ENFORCEMENT.SOFT;
  }
  return ENFORCEMENT.OFF;
}

/**
 * @param {NodeJS.ProcessEnv} [env]
 */
function resolveVerificationPolicy(env) {
  const source = env || process.env;
  return Object.freeze({
    enforcement: resolveVerificationEnforcement(source),
    legacyMode: "grandfather",
    codeLength: readInt(source, "GETPRO_VERIFICATION_CODE_LENGTH", DEFAULTS.codeLength),
    ttlSeconds: readInt(source, "GETPRO_VERIFICATION_TTL_SECONDS", DEFAULTS.ttlSeconds),
    resendDelaySeconds: readInt(
      source,
      "GETPRO_VERIFICATION_RESEND_DELAY_SECONDS",
      DEFAULTS.resendDelaySeconds
    ),
    maxAttempts: readInt(source, "GETPRO_VERIFICATION_MAX_ATTEMPTS", DEFAULTS.maxAttempts),
    identifierHourlyCap: readInt(
      source,
      "GETPRO_VERIFICATION_IDENTIFIER_HOURLY_CAP",
      DEFAULTS.identifierHourlyCap
    ),
    subjectHourlyCap: readInt(
      source,
      "GETPRO_VERIFICATION_SUBJECT_HOURLY_CAP",
      DEFAULTS.subjectHourlyCap
    ),
    ipHourlyCap: readInt(
      source,
      "GETPRO_VERIFICATION_IP_HOURLY_CAP",
      DEFAULTS.ipHourlyCap
    ),
  });
}

/**
 * Classify verification state for an identifier on a subject.
 * @param {{
 *   identifierPresent: boolean,
 *   verifiedAt: Date|string|null|undefined,
 *   accountCreatedAt?: Date|string|null,
 * }} input
 */
function classifyVerificationStatus(input) {
  if (!input || !input.identifierPresent) {
    return VERIFICATION_STATUS.MISSING;
  }
  if (input.verifiedAt) {
    return VERIFICATION_STATUS.VERIFIED;
  }
  // Null verified_at on an existing principal = legacy / unknown — not lockout.
  return VERIFICATION_STATUS.LEGACY_UNVERIFIED;
}

/**
 * Login and auth must remain available for legacy/unverified under grandfather policy.
 * Hard enforcement may gate *new* sensitive actions only when explicitly configured
 * and status is not legacy.
 *
 * @param {{
 *   status: string,
 *   enforcement: string,
 *   action?: 'login'|'sensitive'|'signup',
 * }} input
 */
function evaluateVerificationGate(input) {
  const enforcement = input.enforcement || ENFORCEMENT.OFF;
  const status = input.status || VERIFICATION_STATUS.LEGACY_UNVERIFIED;
  const action = input.action || "login";

  const base = {
    enforcement,
    status,
    action,
    loginAllowed: true,
    promptsEnabled: false,
    blocked: false,
    reason: null,
  };

  if (enforcement === ENFORCEMENT.OFF) {
    return base;
  }

  if (status === VERIFICATION_STATUS.VERIFIED) {
    return base;
  }

  if (status === VERIFICATION_STATUS.LEGACY_UNVERIFIED || status === VERIFICATION_STATUS.MISSING) {
    // Grandfather: never lock existing/unknown users out of login.
    if (action === "login") {
      return {
        ...base,
        promptsEnabled: enforcement !== ENFORCEMENT.OFF,
        reason: "legacy_grandfathered",
      };
    }
  }

  if (enforcement === ENFORCEMENT.SOFT) {
    return {
      ...base,
      promptsEnabled: true,
      reason: "soft_prompt",
    };
  }

  // hard — only block non-login sensitive actions for explicitly unverified new flows
  if (action === "login") {
    return {
      ...base,
      promptsEnabled: true,
      reason: "hard_does_not_block_login",
    };
  }
  if (status === VERIFICATION_STATUS.UNVERIFIED) {
    return {
      ...base,
      promptsEnabled: true,
      blocked: true,
      reason: "verification_required",
    };
  }
  return {
    ...base,
    promptsEnabled: true,
    reason: "legacy_grandfathered",
  };
}

module.exports = {
  ENFORCEMENT,
  CHANNEL,
  SUBJECT_KIND,
  VERIFICATION_STATUS,
  DEFAULTS,
  resolveVerificationEnforcement,
  resolveVerificationPolicy,
  classifyVerificationStatus,
  evaluateVerificationGate,
};
