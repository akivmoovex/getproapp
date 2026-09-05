"use strict";

/**
 * Shared operational control for public self-registration auto-provisioning.
 * Default: enabled. When disabled, both products persist the application and
 * enter review_required — they do not switch to a different registration engine.
 *
 * Compatibility: BLESSBOARD_INSTANT_FREE_PROVISIONING_ENABLED is still read as
 * an alias so existing testing env files keep working.
 */

const ENV_KEY = "SELF_REGISTRATION_PROVISIONING_ENABLED";
const LEGACY_ENV_KEY = "BLESSBOARD_INSTANT_FREE_PROVISIONING_ENABLED";
const DISABLE_VALUES = Object.freeze(["0", "false", "no", "off"]);
const ENABLE_VALUES = Object.freeze(["1", "true", "yes", "on"]);

function parseFlag(raw) {
  const value = String(raw || "").trim().toLowerCase();
  if (!value) return { present: false, enabled: true, reason: "default_enabled", raw: "" };
  if (DISABLE_VALUES.includes(value)) {
    return { present: true, enabled: false, reason: "explicit_disable", raw: value };
  }
  if (ENABLE_VALUES.includes(value)) {
    return { present: true, enabled: true, reason: "explicit_enable", raw: value };
  }
  return { present: true, enabled: false, reason: "unsupported", raw: value };
}

function parseSelfRegistrationProvisioningEnabled(env) {
  const source = env || process.env;
  const primary = parseFlag(source[ENV_KEY]);
  if (primary.present) {
    return { ok: primary.reason !== "unsupported", enabled: primary.enabled, reason: primary.reason, raw: primary.raw, key: ENV_KEY };
  }
  const legacy = parseFlag(source[LEGACY_ENV_KEY]);
  if (legacy.present) {
    return {
      ok: legacy.reason !== "unsupported",
      enabled: legacy.enabled,
      reason: `legacy_alias:${legacy.reason}`,
      raw: legacy.raw,
      key: LEGACY_ENV_KEY,
    };
  }
  return { ok: true, enabled: true, reason: "default_enabled", raw: "", key: ENV_KEY };
}

function isSelfRegistrationProvisioningEnabled(env) {
  return parseSelfRegistrationProvisioningEnabled(env).enabled;
}

module.exports = {
  ENV_KEY,
  LEGACY_ENV_KEY,
  DISABLE_VALUES,
  ENABLE_VALUES,
  parseSelfRegistrationProvisioningEnabled,
  isSelfRegistrationProvisioningEnabled,
};
