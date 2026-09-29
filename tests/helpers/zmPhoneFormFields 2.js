"use strict";

/**
 * Shared phone form helpers for ActiveClinic / BlessBoard registration tests.
 * V7 register/login phone fields are phone_country + phone_national (not E.164 `phone`).
 * Zambia mobiles are 9 national digits starting with 9 (typically 97…).
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

function nextZmNational(seed) {
  const n = Number(seed);
  const base = Number.isFinite(n) ? n : Date.now() + Math.floor(Math.random() * 1e6);
  return `97${String(1000000 + (Math.abs(base) % 8999999)).slice(-7)}`;
}

function zmPhoneFormFields(phoneE164OrNational) {
  const national = zmNationalFromE164(phoneE164OrNational);
  return {
    phone_country: "ZM",
    phone_national: national.length === 9 ? national : nextZmNational(national),
  };
}

module.exports = {
  zmNationalFromE164,
  nextZmNational,
  zmPhoneFormFields,
};
