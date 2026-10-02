"use strict";

/**
 * Shared helpers for phone-first search and form contact parsing (Prompt 11C).
 */

const {
  normalizeBlessBoardPhone,
  maskBlessBoardPhone,
} = require("./normalizeBlessBoardPhone");
const { normalizeEmail } = require("./createBlessBoardUser");

const EMAIL_RE = /^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$/;

/**
 * Detect phone-like search input and normalize when possible.
 * @param {unknown} raw
 * @param {{ country?: unknown, defaultCountry?: string }} [opts]
 * @returns {{
 *   raw: string,
 *   like: string,
 *   phoneNormalized: string | null,
 *   looksLikePhone: boolean,
 *   looksLikeEmail: boolean,
 * }}
 */
function prepareIdentitySearchQuery(raw, opts) {
  const q = String(raw == null ? "" : raw).trim();
  const lower = q.toLowerCase();
  const looksLikeEmail = q.includes("@") || EMAIL_RE.test(lower);
  const digitCount = (q.match(/\d/g) || []).length;
  const looksLikePhone = !looksLikeEmail && digitCount >= 6;
  let phoneNormalized = null;
  if (looksLikePhone || (!looksLikeEmail && digitCount >= 6)) {
    const n = normalizeBlessBoardPhone(q, {
      country: opts && opts.country,
      defaultCountry: (opts && opts.defaultCountry) || "ZM",
    });
    if (n.ok) phoneNormalized = n.normalized;
  }
  return {
    raw: q,
    like: `%${lower}%`,
    phoneNormalized,
    looksLikePhone: Boolean(phoneNormalized) || looksLikePhone,
    looksLikeEmail,
  };
}

/**
 * Parse new-record contact: phone required, email optional.
 * @param {{ phone?: unknown, email?: unknown, country?: unknown }} input
 * @param {{ requirePhone?: boolean, allowEmailOnly?: boolean }} [policy]
 */
function parsePhoneFirstContact(input, policy) {
  const requirePhone = !policy || policy.requirePhone !== false;
  const allowEmailOnly = policy && policy.allowEmailOnly === true;

  const phoneRaw = input && input.phone != null ? String(input.phone).trim() : "";
  const emailRaw = input && input.email != null ? String(input.email).trim() : "";

  let phoneNormalized = null;
  let phoneDisplay = null;
  let phoneCountryCode = null;
  if (phoneRaw) {
    const phone = normalizeBlessBoardPhone(phoneRaw, {
      country: input && input.country,
      defaultCountry: "ZM",
    });
    if (!phone.ok) {
      return { ok: false, reason: "phone", message: phone.error };
    }
    phoneNormalized = phone.normalized;
    phoneDisplay = phone.display || phoneRaw;
    phoneCountryCode = phone.countryCode || null;
  } else if (requirePhone && !allowEmailOnly) {
    return {
      ok: false,
      reason: "phone_required",
      message: "Mobile phone number is required.",
    };
  }

  let emailNormalized = null;
  let emailDisplay = null;
  if (emailRaw) {
    emailNormalized = normalizeEmail(emailRaw);
    if (
      !emailNormalized ||
      emailNormalized.length > 254 ||
      !EMAIL_RE.test(emailNormalized)
    ) {
      return { ok: false, reason: "email", message: "Enter a valid email address." };
    }
    emailDisplay = emailRaw.slice(0, 254);
  }

  if (!phoneNormalized && !emailNormalized) {
    return {
      ok: false,
      reason: "contact_required",
      message: "Enter a mobile phone number (email is optional).",
    };
  }

  return {
    ok: true,
    value: {
      phoneNormalized,
      phoneDisplay,
      phoneCountryCode,
      emailNormalized,
      emailDisplay,
    },
  };
}

module.exports = {
  prepareIdentitySearchQuery,
  parsePhoneFirstContact,
  maskBlessBoardPhone,
};
