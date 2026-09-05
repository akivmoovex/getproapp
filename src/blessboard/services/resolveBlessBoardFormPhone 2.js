"use strict";

/**
 * Resolve V7 browser-form phone fields (phone_country + phone_national) to E.164.
 * Prefer split fields. Legacy body.phone is only accepted when allowLegacyPhone=true
 * (intentional API / transitional callers) — not for migrated V7 forms.
 */

const {
  extractPhoneFieldsFromBody,
} = require("../../platform/services/phoneNumberService");
const {
  normalizeBlessBoardPhone,
} = require("./normalizeBlessBoardPhone");
const {
  buildPlatformPhoneFieldLocals,
} = require("../../platform/services/platformPhoneFieldLocals");

/**
 * @param {object|null|undefined} body
 * @param {{
 *   prefix?: string,
 *   defaultCountry?: string,
 *   required?: boolean,
 *   allowLegacyPhone?: boolean,
 *   env?: NodeJS.ProcessEnv|object,
 * }} [opts]
 */
function resolveBlessBoardFormPhone(body, opts) {
  const options = opts || {};
  const fields = extractPhoneFieldsFromBody(body, options.prefix || "");
  const phoneCountry = fields.phoneCountry
    ? String(fields.phoneCountry).trim().toUpperCase()
    : "";
  const phoneNational = fields.phoneNational
    ? String(fields.phoneNational).trim()
    : "";
  const legacyPhone =
    options.allowLegacyPhone === true && fields.phone != null
      ? String(fields.phone).trim()
      : "";

  const nationalOrLegacy =
    phoneNational || (options.allowLegacyPhone === true ? legacyPhone : "");

  if (!nationalOrLegacy && options.required === false) {
    return {
      fields: { phoneCountry, phoneNational, phone: legacyPhone },
      result: { ok: true, display: "", normalized: null, countryCode: phoneCountry || null },
      e164: null,
    };
  }

  const result = normalizeBlessBoardPhone(nationalOrLegacy, {
    phoneCountry: phoneCountry || null,
    phoneNational: phoneNational || null,
    defaultCountry: options.defaultCountry || "ZM",
    env: options.env,
  });

  return {
    fields: { phoneCountry, phoneNational, phone: legacyPhone },
    result,
    e164: result.ok ? result.normalized : null,
  };
}

/**
 * Locals for shared phone-field partial.
 * @param {{
 *   env?: NodeJS.ProcessEnv,
 *   selectedCountry?: string|null,
 *   e164Value?: string|null,
 *   nationalValue?: string|null,
 * }} [opts]
 */
function blessBoardPhoneFieldLocals(opts) {
  const options = opts || {};
  const built = buildPlatformPhoneFieldLocals({
    env: options.env,
    selectedCountry: options.selectedCountry,
    e164Value: options.e164Value,
    nationalValue: options.nationalValue,
  });
  if (options.nationalValue != null && String(options.nationalValue).trim()) {
    built.nationalValue = String(options.nationalValue);
  }
  if (options.selectedCountry) {
    built.selectedCountry = String(options.selectedCountry).trim().toUpperCase();
  }
  return built;
}

module.exports = {
  resolveBlessBoardFormPhone,
  blessBoardPhoneFieldLocals,
  extractPhoneFieldsFromBody,
};
