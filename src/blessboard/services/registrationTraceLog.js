"use strict";

/**
 * Safe structured tracing for apex /register-church (Foundation + Growth).
 * Default: enabled. Disable with BLESSBOARD_REGISTRATION_TRACE=0|false|no|off.
 * Error-class events (db_error, session failure, transaction rollback) always log.
 *
 * Never log passwords, tokens, cookies, CSRF, emails, phones, addresses, or SQL params.
 */

const ENV_KEY = "BLESSBOARD_REGISTRATION_TRACE";
const DISABLE_VALUES = Object.freeze(["0", "false", "no", "off"]);
const LOG_PREFIX = "[blessboard-church-registration]";

/** Events that always emit even when the lifecycle gate is off. */
const ALWAYS_ON_EVENTS = Object.freeze(
  new Set([
    "church_registration_db_error",
    "church_registration_session",
    "church_registration_transaction",
    "platform_church_registration_db_error",
    "instant_free_session_establish_failed",
    "failure_state_persist_failed",
  ])
);

const ALLOWED_KEYS = Object.freeze(
  new Set([
    "event",
    "operation",
    "requestId",
    "outcome",
    "failureCategory",
    "field",
    "publicPlanCode",
    "canonicalPlanKey",
    "applicationId",
    "organizationKey",
    "alreadyProvisioned",
    "transactionRolledBack",
    "subscriptionStatus",
    "subscriptionStartsAt",
    "subscriptionEndsAt",
    "hasTrialEndsAt",
    "redirectPath",
    "mode",
    "status",
    "applicationStatus",
    "provisioningStatus",
    "riskDecision",
    "riskReasonCodes",
    "duplicate",
    "durationMs",
    "ok",
    "pgCode",
    "schema",
    "table",
    "targetRelation",
    "undefinedTable",
    "reasonCodes",
    "decision",
    "rootStatus",
    "persistError",
  ])
);

/**
 * @param {NodeJS.ProcessEnv} [env]
 * @returns {boolean}
 */
function isRegistrationTraceEnabled(env) {
  const source = env || process.env;
  const raw = String(source[ENV_KEY] || "")
    .trim()
    .toLowerCase();
  if (!raw) return true;
  if (DISABLE_VALUES.includes(raw)) return false;
  return true;
}

/**
 * @param {unknown} value
 * @param {number} [max]
 */
function clip(value, max) {
  if (value == null) return null;
  const s = String(value).trim();
  if (!s) return null;
  return s.slice(0, max == null ? 120 : max);
}

/**
 * Build a safe payload; drops unknown keys and empty values.
 * @param {Record<string, unknown>} fields
 * @returns {Record<string, unknown>}
 */
function sanitizeRegistrationTraceFields(fields) {
  const out = {};
  if (!fields || typeof fields !== "object") return out;
  for (const key of Object.keys(fields)) {
    if (!ALLOWED_KEYS.has(key)) continue;
    const value = fields[key];
    if (value === undefined) continue;
    if (key === "riskReasonCodes" || key === "reasonCodes") {
      if (!Array.isArray(value)) continue;
      out[key] = value
        .map((c) => clip(c, 64))
        .filter(Boolean)
        .slice(0, 20);
      continue;
    }
    if (typeof value === "boolean" || typeof value === "number") {
      out[key] = value;
      continue;
    }
    if (value === null) {
      out[key] = null;
      continue;
    }
    out[key] = clip(value, key === "redirectPath" ? 200 : 120);
  }
  return out;
}

/**
 * @param {import('express').Request | null | undefined} req
 * @param {Record<string, unknown>} fields
 * @param {{ env?: NodeJS.ProcessEnv, force?: boolean, level?: "log" | "error" }} [opts]
 */
function logRegistrationTrace(req, fields, opts) {
  const options = opts && typeof opts === "object" ? opts : {};
  const env = options.env || process.env;
  const event = fields && fields.event != null ? String(fields.event) : "";
  const force = Boolean(options.force) || ALWAYS_ON_EVENTS.has(event);
  if (!force && !isRegistrationTraceEnabled(env)) return;

  const payload = sanitizeRegistrationTraceFields({
    ...fields,
    requestId:
      (fields && fields.requestId) ||
      (req && req.requestId) ||
      null,
  });
  if (!payload.event) return;

  const line = `${LOG_PREFIX} ${JSON.stringify(payload)}`;
  try {
    if (options.level === "error") {
      // eslint-disable-next-line no-console
      console.error(line);
    } else {
      // eslint-disable-next-line no-console
      console.log(line);
    }
  } catch {
    /* logging must not throw */
  }
}

module.exports = {
  ENV_KEY,
  LOG_PREFIX,
  ALWAYS_ON_EVENTS,
  ALLOWED_KEYS,
  isRegistrationTraceEnabled,
  sanitizeRegistrationTraceFields,
  logRegistrationTrace,
};
