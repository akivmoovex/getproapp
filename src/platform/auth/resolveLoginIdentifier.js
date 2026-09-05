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
    const normalized = normalizePhoneNumber({
      phone: phoneInput,
      phoneCountry: fields.phoneCountry || country,
      phoneNational: phoneInput,
      defaultCountry: country,
      required: false,
    });
    const identifier =
      normalized.ok && normalized.e164
        ? normalized.e164
        : phoneInput;
    return { mode: "phone", identifier, country };
  }

  const legacy = String(raw.identifier || raw.login_email || raw.email || "").trim();
  const country = String(raw.phone_country || "ZM").trim().toUpperCase() || "ZM";
  return { mode: "legacy", identifier: legacy, country };
}

module.exports = {
  resolveLoginIdentifierFromBody,
};
