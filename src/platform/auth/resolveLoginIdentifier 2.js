"use strict";

const {
  normalizePhoneNumber,
  extractPhoneFieldsFromBody,
} = require("../services/phoneNumberService");

/**
 * Resolve login identifier from Stitch tabbed email/phone form POST.
 * Preserves legacy combined `identifier` field for backward compatibility.
 *
 * @param {object} body - req.body
 * @returns {{ mode: 'email'|'phone'|'legacy', identifier: string, country: string }}
 */
function resolveLoginIdentifierFromBody(body) {
  const raw = body && typeof body === "object" ? body : {};
  const mode = String(raw.login_mode || "").trim().toLowerCase();

  if (mode === "email") {
    const email = String(raw.login_email || raw.email || "").trim();
    return { mode: "email", identifier: email, country: "" };
  }

  if (mode === "phone") {
    const country = String(raw.phone_country || "ZM").trim().toUpperCase() || "ZM";
    const fields = extractPhoneFieldsFromBody(raw);
    // V7 login forms submit phone_national (not legacy phone).
    const phoneInput = String(fields.phoneNational || "").trim();
    if (!phoneInput) {
      return { mode: "phone", identifier: "", country, phoneOk: false };
    }
    const normalized = normalizePhoneNumber({
      phone: phoneInput,
      phoneCountry: fields.phoneCountry || country,
      phoneNational: phoneInput,
      defaultCountry: country,
      required: true,
    });
    // Never fall back to raw national digits — that diverges from stored E.164
    // and can create ambiguous login lookups across products.
    if (!normalized.ok || !normalized.e164) {
      return {
        mode: "phone",
        identifier: "",
        country,
        phoneOk: false,
        phoneError: normalized.error || "Enter a valid phone number.",
        phoneCode: normalized.code || "phone_invalid",
      };
    }
    return {
      mode: "phone",
      identifier: normalized.e164,
      country: normalized.country || country,
      phoneOk: true,
    };
  }

  const legacy = String(raw.identifier || raw.login_email || raw.email || "").trim();
  const country = String(raw.phone_country || "ZM").trim().toUpperCase() || "ZM";
  return { mode: "legacy", identifier: legacy, country };
}

module.exports = {
  resolveLoginIdentifierFromBody,
};
