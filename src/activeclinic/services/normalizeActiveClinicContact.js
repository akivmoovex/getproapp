"use strict";

/**
 * Product-local contact helpers for ActiveClinic facilities.
 * Accepts E.164 phones; does not invent a default country.
 */

const EMAIL_RE = /^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$/;
const PHONE_E164_RE = /^\+[1-9][0-9]{6,14}$/;
const COUNTRY_RE = /^[A-Z]{2}$/;

/**
 * @param {unknown} raw
 * @returns {{ ok: true, normalized: string, display: string } | { ok: false, code: string }}
 */
function normalizeActiveClinicPhone(raw) {
  const display = String(raw == null ? "" : raw).trim();
  if (!display) return { ok: false, code: "phone_required" };
  const digits = display.replace(/[^\d+]/g, "");
  let normalized = digits;
  if (!normalized.startsWith("+")) {
    // National numbers are not accepted without a dedicated country-calling pipeline.
    return { ok: false, code: "phone_must_be_e164" };
  }
  if (!PHONE_E164_RE.test(normalized) || normalized.length > 20) {
    return { ok: false, code: "phone_invalid" };
  }
  return { ok: true, normalized, display: display.slice(0, 40) };
}

/**
 * @param {unknown} raw
 * @returns {{ ok: true, normalized: string|null, display: string|null } | { ok: false, code: string }}
 */
function normalizeActiveClinicEmail(raw) {
  if (raw == null || String(raw).trim() === "") {
    return { ok: true, normalized: null, display: null };
  }
  const display = String(raw).trim();
  const normalized = display.toLowerCase();
  if (!EMAIL_RE.test(normalized) || normalized.length > 254) {
    return { ok: false, code: "email_invalid" };
  }
  return { ok: true, normalized, display: display.slice(0, 254) };
}

/**
 * @param {unknown} raw
 * @returns {{ ok: true, value: string } | { ok: false, code: string }}
 */
function normalizeCountryCode(raw) {
  const value = String(raw == null ? "" : raw)
    .trim()
    .toUpperCase();
  if (!COUNTRY_RE.test(value)) return { ok: false, code: "country_code_invalid" };
  return { ok: true, value };
}

/**
 * @param {unknown} raw
 * @returns {{ ok: true, value: string } | { ok: false, code: string }}
 */
function normalizeTimezone(raw) {
  const value = String(raw == null ? "" : raw).trim();
  if (!value || value.length > 64) return { ok: false, code: "timezone_invalid" };
  try {
    // Throws RangeError for unknown IANA zones in modern Node.
    Intl.DateTimeFormat("en-US", { timeZone: value }).format(new Date());
  } catch (_err) {
    return { ok: false, code: "timezone_invalid" };
  }
  return { ok: true, value };
}

/** Curated options for settings selects; validation still accepts any valid IANA zone. */
function listActiveClinicTimezoneOptions() {
  const preferred = [
    "Africa/Lusaka",
    "Africa/Harare",
    "Africa/Johannesburg",
    "Africa/Nairobi",
    "Africa/Lagos",
    "Africa/Cairo",
    "UTC",
    "Europe/London",
  ];
  let supported = preferred;
  try {
    if (typeof Intl.supportedValuesOf === "function") {
      supported = Intl.supportedValuesOf("timeZone");
    }
  } catch (_err) {
    supported = preferred;
  }
  const set = new Set(supported);
  const ordered = preferred.filter((z) => set.has(z));
  for (const z of supported) {
    if (!ordered.includes(z) && z.startsWith("Africa/")) ordered.push(z);
  }
  return ordered;
}

module.exports = {
  EMAIL_RE,
  PHONE_E164_RE,
  normalizeActiveClinicPhone,
  normalizeActiveClinicEmail,
  normalizeCountryCode,
  normalizeTimezone,
  listActiveClinicTimezoneOptions,
};
