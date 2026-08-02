"use strict";

/**
 * Resolve OTP provider adapters from configuration.
 * Paid providers remain stubs until credentials + allow-list are present.
 */

const { createTestOtpProvider } = require("./testProvider");

function createUnavailableProvider(name, reason) {
  return {
    name,
    async send() {
      return { ok: false, reason: reason || "provider_not_configured" };
    },
    async cancel() {
      return { ok: true };
    },
  };
}

/**
 * @param {NodeJS.ProcessEnv | Record<string, string|undefined>} [env]
 */
function resolveOtpProvider(env) {
  const e = env || process.env;
  const deployment = String(e.DEPLOYMENT_ENV || "")
    .trim()
    .toLowerCase();
  const requested = String(e.BLESSBOARD_OTP_PROVIDER || "test")
    .trim()
    .toLowerCase();

  if (deployment === "production" && requested === "test") {
    return createUnavailableProvider("test", "test_provider_forbidden_in_production");
  }

  if (requested === "test") {
    return createTestOtpProvider(e);
  }

  if (requested === "infobip") {
    if (!e.INFOBIP_API_KEY || !e.INFOBIP_OTP_ALLOWLIST) {
      return createUnavailableProvider("infobip", "infobip_not_configured");
    }
    // Real Infobip adapter intentionally not activated in this foundation stage.
    return createUnavailableProvider("infobip", "infobip_adapter_not_enabled");
  }

  if (requested === "twilio") {
    if (!e.TWILIO_ACCOUNT_SID || !e.TWILIO_AUTH_TOKEN || !e.TWILIO_OTP_ALLOWLIST) {
      return createUnavailableProvider("twilio", "twilio_not_configured");
    }
    return createUnavailableProvider("twilio", "twilio_adapter_not_enabled");
  }

  return createUnavailableProvider(requested || "unknown", "unknown_provider");
}

module.exports = {
  resolveOtpProvider,
};
