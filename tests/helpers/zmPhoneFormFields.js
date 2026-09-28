"use strict";

/**
 * Shared phone form helpers for ActiveClinic patient-portal tests.
 * V7 register/login phone fields are phone_country + phone_national (not E.164 `phone`).
 */

function zmNationalFromE164(phone) {
  const raw = String(phone || "").trim();
  const m = raw.match(/^\+?260(\d{9})$/);
  if (m) return m[1];
  const digits = raw.replace(/\D/g, "");
  if (digits.length === 9 && digits.startsWith("9")) return digits;
  if (digits.length === 12 && digits.startsWith("260")) return digits.slice(3);
  return digits;
}

function zmPhoneFormFields(phoneE164OrNational) {
  return {
    phone_country: "ZM",
    phone_national: zmNationalFromE164(phoneE164OrNational),
  };
}

module.exports = {
  zmNationalFromE164,
  zmPhoneFormFields,
};
