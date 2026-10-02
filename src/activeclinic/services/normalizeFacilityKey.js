"use strict";

/**
 * ActiveClinic facility_key normalization (product-local reserved words only).
 */

const FACILITY_KEY_RE = /^[a-z][a-z0-9_-]{0,63}$/;

const RESERVED_FACILITY_KEYS = Object.freeze([
  "new",
  "edit",
  "admin",
  "app",
  "login",
  "logout",
  "healthz",
  "settings",
  "staff",
  "patients",
  "appointments",
  "api",
]);

/**
 * @param {unknown} raw
 * @returns {{ ok: true, value: string } | { ok: false, code: string }}
 */
function normalizeFacilityKey(raw) {
  const value = String(raw == null ? "" : raw)
    .trim()
    .toLowerCase();
  if (!value) return { ok: false, code: "facility_key_empty" };
  if (/[\/\\]/.test(value) || /[\u0000-\u001f]/.test(value)) {
    return { ok: false, code: "facility_key_invalid" };
  }
  if (!FACILITY_KEY_RE.test(value)) {
    return { ok: false, code: "facility_key_invalid" };
  }
  if (RESERVED_FACILITY_KEYS.includes(value)) {
    return { ok: false, code: "facility_key_reserved" };
  }
  return { ok: true, value };
}

/**
 * Derive a candidate facility_key from a display name (create form helper).
 * @param {unknown} displayName
 * @returns {string}
 */
function suggestFacilityKeyFromDisplayName(displayName) {
  let slug = String(displayName == null ? "" : displayName)
    .trim()
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-")
    .slice(0, 64);
  if (!slug) return "";
  if (!/^[a-z]/.test(slug)) slug = `f-${slug}`.slice(0, 64);
  const normalized = normalizeFacilityKey(slug);
  return normalized.ok ? normalized.value : slug.replace(/[^a-z0-9_-]/g, "").slice(0, 64);
}

module.exports = {
  FACILITY_KEY_RE,
  RESERVED_FACILITY_KEYS,
  normalizeFacilityKey,
  suggestFacilityKeyFromDisplayName,
};
