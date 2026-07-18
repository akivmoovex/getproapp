"use strict";

/**
 * Shared validation helpers for BlessBoard V5 settings (application-layer).
 */

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const COUNTRY_RE = /^[A-Z]{2}$/;
const PHONE_RE = /^\+[1-9]\d{6,14}$/;
const WEBSITE_STATUSES = new Set(["draft", "published", "suspended"]);

/**
 * @param {unknown} value
 * @returns {string | null}
 */
function emptyToNull(value) {
  if (value == null) return null;
  const s = String(value).trim();
  return s === "" ? null : s;
}

/**
 * Normalize phone to E.164-compatible text (+ and digits only).
 * @param {unknown} value
 * @returns {{ ok: true, value: string | null } | { ok: false, reason: string }}
 */
function normalizePhone(value) {
  const raw = emptyToNull(value);
  if (raw == null) return { ok: true, value: null };
  let digits = String(raw).replace(/[^\d+]/g, "");
  if (digits.indexOf("+") > 0) {
    digits = digits.replace(/\+/g, "");
    digits = `+${digits}`;
  }
  if (!digits.startsWith("+")) {
    digits = `+${digits.replace(/\D/g, "")}`;
  } else {
    digits = `+${digits.slice(1).replace(/\D/g, "")}`;
  }
  if (!PHONE_RE.test(digits)) {
    return { ok: false, reason: "phone" };
  }
  return { ok: true, value: digits };
}

/**
 * @param {unknown} value
 * @returns {{ ok: true, value: string | null } | { ok: false, reason: string }}
 */
function validateEmail(value) {
  const raw = emptyToNull(value);
  if (raw == null) return { ok: true, value: null };
  const email = String(raw).toLowerCase();
  if (email.length > 254 || !EMAIL_RE.test(email)) {
    return { ok: false, reason: "email" };
  }
  return { ok: true, value: email };
}

/**
 * @param {unknown} value
 * @returns {{ ok: true, value: string | null } | { ok: false, reason: string }}
 */
function validateCountryCode(value) {
  const raw = emptyToNull(value);
  if (raw == null) return { ok: true, value: null };
  const code = String(raw).trim().toUpperCase();
  if (!COUNTRY_RE.test(code)) {
    return { ok: false, reason: "country_code" };
  }
  return { ok: true, value: code };
}

/**
 * @param {unknown} value
 * @param {number} min
 * @param {number} max
 * @returns {{ ok: true, value: number | null } | { ok: false, reason: string }}
 */
function validateCoordinate(value, min, max, reason) {
  const raw = emptyToNull(value);
  if (raw == null) return { ok: true, value: null };
  const n = Number(raw);
  if (!Number.isFinite(n) || n < min || n > max) {
    return { ok: false, reason };
  }
  return { ok: true, value: n };
}

/**
 * @param {unknown} value
 * @param {number} maxLen
 */
function validateOptionalText(value, maxLen, reason) {
  const raw = emptyToNull(value);
  if (raw == null) return { ok: true, value: null };
  if (String(raw).length > maxLen) {
    return { ok: false, reason };
  }
  return { ok: true, value: String(raw) };
}

/**
 * @param {unknown} value
 * @param {number} maxLen
 */
function validateRequiredName(value, maxLen) {
  const raw = emptyToNull(value);
  if (!raw || String(raw).length > maxLen) {
    return { ok: false, reason: "public_name" };
  }
  return { ok: true, value: String(raw) };
}

/**
 * @param {unknown} value
 */
function validateWebsiteStatus(value) {
  const status = String(value == null ? "draft" : value).trim().toLowerCase();
  if (!WEBSITE_STATUSES.has(status)) {
    return { ok: false, reason: "website_status" };
  }
  return { ok: true, value: status };
}

/**
 * @param {object} input
 */
function validateChurchSettingsInput(input) {
  const name = validateRequiredName(input && input.publicName, 200);
  if (!name.ok) return name;
  const denomination = validateOptionalText(input && input.denomination, 120, "denomination");
  if (!denomination.ok) return denomination;
  const email = validateEmail(input && input.primaryEmail);
  if (!email.ok) return email;
  const phone = normalizePhone(input && input.primaryPhone);
  if (!phone.ok) return phone;
  const tz = validateOptionalText(input && input.defaultTimezone, 64, "default_timezone");
  if (!tz.ok) return tz;
  const country = validateCountryCode(input && input.defaultCountryCode);
  if (!country.ok) return country;
  const website = validateWebsiteStatus(input && input.websiteStatus);
  if (!website.ok) return website;
  return {
    ok: true,
    value: {
      publicName: name.value,
      denomination: denomination.value,
      primaryEmail: email.value,
      primaryPhone: phone.value,
      defaultTimezone: tz.value,
      defaultCountryCode: country.value,
      websiteStatus: website.value,
    },
  };
}

/**
 * @param {object} input
 */
function validateBranchSettingsInput(input) {
  const name = validateRequiredName(input && input.publicName, 200);
  if (!name.ok) return name;
  const email = validateEmail(input && input.email);
  if (!email.ok) return email;
  const phone = normalizePhone(input && input.phone);
  if (!phone.ok) return phone;
  const tz = validateOptionalText(input && input.timezone, 64, "timezone");
  if (!tz.ok) return tz;
  const country = validateCountryCode(input && input.countryCode);
  if (!country.ok) return country;
  const a1 = validateOptionalText(input && input.addressLine1, 200, "address_line_1");
  if (!a1.ok) return a1;
  const a2 = validateOptionalText(input && input.addressLine2, 200, "address_line_2");
  if (!a2.ok) return a2;
  const city = validateOptionalText(input && input.city, 120, "city");
  if (!city.ok) return city;
  const province = validateOptionalText(input && input.provinceState, 120, "province_state");
  if (!province.ok) return province;
  const postal = validateOptionalText(input && input.postalCode, 32, "postal_code");
  if (!postal.ok) return postal;
  const lat = validateCoordinate(input && input.latitude, -90, 90, "latitude");
  if (!lat.ok) return lat;
  const lng = validateCoordinate(input && input.longitude, -180, 180, "longitude");
  if (!lng.ok) return lng;
  return {
    ok: true,
    value: {
      publicName: name.value,
      email: email.value,
      phone: phone.value,
      timezone: tz.value,
      countryCode: country.value,
      addressLine1: a1.value,
      addressLine2: a2.value,
      city: city.value,
      provinceState: province.value,
      postalCode: postal.value,
      latitude: lat.value,
      longitude: lng.value,
    },
  };
}

module.exports = {
  WEBSITE_STATUSES,
  emptyToNull,
  normalizePhone,
  validateEmail,
  validateCountryCode,
  validateCoordinate,
  validateChurchSettingsInput,
  validateBranchSettingsInput,
};
