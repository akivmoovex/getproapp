"use strict";

/**
 * Compatibility alias for the shared self-registration provisioning kill switch.
 *
 * Canonical control: SELF_REGISTRATION_PROVISIONING_ENABLED
 * Legacy alias: BLESSBOARD_INSTANT_FREE_PROVISIONING_ENABLED
 *
 * The flag no longer selects a BlessBoard-only registration engine. When disabled,
 * both products persist the application and enter review_required.
 */

const {
  ENV_KEY: SHARED_ENV_KEY,
  LEGACY_ENV_KEY,
  DISABLE_VALUES,
  ENABLE_VALUES,
  parseSelfRegistrationProvisioningEnabled,
  isSelfRegistrationProvisioningEnabled,
} = require("../../platform/registration/killSwitch");

const ENV_KEY = LEGACY_ENV_KEY;

function parseInstantFreeProvisioningEnabled(env) {
  const parsed = parseSelfRegistrationProvisioningEnabled(env);
  return {
    ok: parsed.ok,
    enabled: parsed.enabled,
    reason: parsed.reason,
    raw: parsed.raw,
  };
}

function isInstantFreeProvisioningEnabled(env) {
  return isSelfRegistrationProvisioningEnabled(env);
}

function formatInstantFreeProvisioningEnabledLog(env) {
  const parsed = parseSelfRegistrationProvisioningEnabled(env);
  return `${SHARED_ENV_KEY}=${parsed.enabled ? "1" : "0"} (${parsed.reason}; alias ${ENV_KEY})`;
}

module.exports = {
  ENV_KEY,
  SHARED_ENV_KEY,
  DISABLE_VALUES,
  ENABLE_VALUES,
  parseInstantFreeProvisioningEnabled,
  isInstantFreeProvisioningEnabled,
  formatInstantFreeProvisioningEnabledLog,
};
