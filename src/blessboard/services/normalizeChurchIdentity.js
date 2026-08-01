"use strict";

/**
 * Canonical church display-name + country identity for uniqueness enforcement.
 * Deterministic. Not fuzzy. Scope: normalized_name + country_code (ISO-2).
 */

const DUPLICATE_CHURCH_NAME_MESSAGE =
  "A church with this name is already registered in the selected country.";

/** Common English country names / aliases → ISO-3166-1 alpha-2. */
const COUNTRY_NAME_TO_ISO2 = Object.freeze({
  zm: "ZM",
  zambia: "ZM",
  ke: "KE",
  kenya: "KE",
  za: "ZA",
  "south africa": "ZA",
  ng: "NG",
  nigeria: "NG",
  gh: "GH",
  ghana: "GH",
  tz: "TZ",
  tanzania: "TZ",
  ug: "UG",
  uganda: "UG",
  mw: "MW",
  malawi: "MW",
  bw: "BW",
  botswana: "BW",
  zw: "ZW",
  zimbabwe: "ZW",
  us: "US",
  usa: "US",
  "united states": "US",
  "united states of america": "US",
  ca: "CA",
  canada: "CA",
  gb: "GB",
  uk: "GB",
  "united kingdom": "GB",
  au: "AU",
  australia: "AU",
  in: "IN",
  india: "IN",
});

const ISO2_RE = /^[A-Z]{2}$/;

/**
 * Normalize a church display name for uniqueness comparison / storage.
 * Matches SQL generation for blessboard.churches.display_name_normalized:
 *   lower(regexp_replace(trim(…), '\s+', ' ', 'g')) then strip trailing punctuation.
 * JS applies apostrophe + trailing punctuation normalization before the shared lower/collapse.
 *
 * @param {unknown} value
 * @returns {string|null}
 */
function normalizeChurchDisplayNameForUniqueness(value) {
  if (value == null) return null;
  let s = String(value)
    .normalize("NFKC")
    .replace(/[\u2018\u2019\u201A\u2032`]/g, "'")
    .replace(/[\u201C\u201D\u201E\u2033]/g, '"')
    .trim();
  if (!s) return null;
  // Remove apostrophes entirely for matching (St. Peter's → st. peters).
  s = s.replace(/'/g, "");
  // Collapse whitespace then lowercase.
  s = s.replace(/\s+/g, " ").toLowerCase();
  // Ignore harmless trailing punctuation (Grace Church. → grace church).
  s = s.replace(/[.,;:!?]+$/g, "").trim();
  // Drop remaining punctuation that is not alphanumeric or space (keep letters/digits/spaces).
  // Meaningful words stay; dots inside (st. peter) become spaces then collapse.
  s = s
    .replace(/[^a-z0-9\s]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return s || null;
}

/**
 * Resolve free-text or ISO country input to ISO-2 uppercase.
 * @param {unknown} country
 * @returns {string|null}
 */
function resolveCountryCodeForUniqueness(country) {
  const raw = String(country == null ? "" : country)
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
  if (!raw) return null;
  if (/^[a-z]{2}$/.test(raw)) {
    return raw.toUpperCase();
  }
  const mapped = COUNTRY_NAME_TO_ISO2[raw];
  return mapped || null;
}

/**
 * @param {{ churchName?: unknown, country?: unknown, countryCode?: unknown }} input
 * @returns {{ ok: true, normalizedName: string, countryCode: string } | { ok: false, reason: string, message: string }}
 */
function prepareChurchIdentityForUniqueness(input) {
  const src = input && typeof input === "object" ? input : {};
  const normalizedName = normalizeChurchDisplayNameForUniqueness(
    src.churchName != null ? src.churchName : src.displayName
  );
  if (!normalizedName) {
    return {
      ok: false,
      reason: "church_name",
      message: "Enter a church name.",
    };
  }
  const countryCode =
    resolveCountryCodeForUniqueness(src.countryCode) ||
    resolveCountryCodeForUniqueness(src.country);
  if (!countryCode || !ISO2_RE.test(countryCode)) {
    return {
      ok: false,
      reason: "country",
      message: "Enter a valid country so we can check the church name.",
    };
  }
  return { ok: true, normalizedName, countryCode };
}

module.exports = {
  DUPLICATE_CHURCH_NAME_MESSAGE,
  COUNTRY_NAME_TO_ISO2,
  normalizeChurchDisplayNameForUniqueness,
  resolveCountryCodeForUniqueness,
  prepareChurchIdentityForUniqueness,
};
