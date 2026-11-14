"use strict";

/**
 * Zambia SMS destinations. Uses the shared phone normalizer.
 * Only +260 E.164 numbers are eligible for the SMS adapter.
 */

const { normalizePhoneNumber } = require("../services/phoneNumberService");

function normalizeZambiaSms(raw, env) {
  const result = normalizePhoneNumber({
    phone: raw,
    selectedCountry: "ZM",
    env: env || {},
    required: true,
  });
  if (!result.ok || !result.e164) return null;
  if (result.country !== "ZM") return null;
  if (!/^\+260[1-9]\d{8}$/.test(result.e164)) return null;
  return result.e164;
}

module.exports = {
  normalizeZambiaSms,
};
