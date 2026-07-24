"use strict";

/**
 * Pure deterministic normalization for Phase2 registration duplicate matching.
 * Preserves originals; returns null for empty/unusable inputs.
 * No database queries, no scoring, no fuzzy similarity.
 *
 * Reuses:
 * - normalizeRegistrationPhone (E.164)
 * - normalizeEmail (trim + lower)
 * Church-name compare keys intentionally avoid NFKD / accent stripping
 * (organizationKey slugify is for keys only — not church-name matching).
 */

const { normalizeRegistrationPhone } = require("./normalizeRegistrationPhone");
const { normalizeEmail } = require("./createBlessBoardUser");

const EMAIL_RE = /^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$/;
const HOSTNAME_RE =
  /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/;
const REGISTRATION_NUMBER_RE = /^[A-Z0-9][A-Z0-9\-./]{1,63}$/;

/**
 * @param {unknown} value
 * @returns {string|null}
 */
function asOriginalString(value) {
  if (value == null) return null;
  if (typeof value === "string") return value;
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return null;
}

/**
 * Compare-key text: trim, collapse whitespace, lowercase.
 * Does not strip punctuation or diacritics (no NFKD).
 * @param {unknown} value
 * @param {number} [maxLen]
 * @returns {string|null}
 */
function normalizeCompareText(value, maxLen = 500) {
  const original = asOriginalString(value);
  if (original == null) return null;
  const collapsed = original
    .trim()
    .replace(/\s+/g, " ")
    .toLowerCase()
    .slice(0, maxLen);
  return collapsed || null;
}

/**
 * Church / organization display name for exact-match duplicate keys.
 * Preserves original; normalized is lower + whitespace-collapsed only.
 * @param {unknown} value
 * @returns {{ original: string, normalized: string } | null}
 */
function normalizeChurchNameForDuplicate(value) {
  const original = asOriginalString(value);
  if (original == null) return null;
  const trimmed = original.trim();
  if (!trimmed) return null;
  const normalized = normalizeCompareText(trimmed, 200);
  if (!normalized) return null;
  return { original, normalized };
}

/**
 * City / region / country-style place label (same gentle rules as church name).
 * @param {unknown} value
 * @param {number} [maxLen]
 * @returns {{ original: string, normalized: string } | null}
 */
function normalizePlaceForDuplicate(value, maxLen = 120) {
  const original = asOriginalString(value);
  if (original == null) return null;
  const trimmed = original.trim();
  if (!trimmed) return null;
  const normalized = normalizeCompareText(trimmed, maxLen);
  if (!normalized) return null;
  return { original, normalized };
}

/**
 * Exact-match triple used by registration risk (name + city + country).
 * Usable only when all three parts normalize.
 * @param {{
 *   churchName?: unknown,
 *   city?: unknown,
 *   country?: unknown,
 * }} [input]
 * @returns {{
 *   original: { churchName: string, city: string, country: string },
 *   normalized: { churchName: string, city: string, country: string },
 *   key: string
 * } | null}
 */
function normalizeChurchNameCityCountryForDuplicate(input) {
  const raw = input && typeof input === "object" ? input : {};
  const name = normalizeChurchNameForDuplicate(raw.churchName);
  const city = normalizePlaceForDuplicate(raw.city);
  const country = normalizePlaceForDuplicate(raw.country);
  if (!name || !city || !country) return null;
  return {
    original: {
      churchName: name.original,
      city: city.original,
      country: country.original,
    },
    normalized: {
      churchName: name.normalized,
      city: city.normalized,
      country: country.normalized,
    },
    key: `${name.normalized}|${city.normalized}|${country.normalized}`,
  };
}

/**
 * Phone for duplicate matching via canonical registration E.164 helper.
 * @param {unknown} phone
 * @param {unknown} [country]
 * @returns {{ original: string, normalized: string | null } | null}
 */
function normalizePhoneForDuplicate(phone, country) {
  const original = asOriginalString(phone);
  if (original == null) return null;
  if (!original.trim()) return null;

  const result = normalizeRegistrationPhone(phone, country);
  if (result && result.ok === true && result.normalized) {
    return {
      original,
      normalized: String(result.normalized),
    };
  }
  return { original, normalized: null };
}

/**
 * Email for duplicate matching (platform-user / application contact).
 * Does not treat uniqueness as ownership.
 * @param {unknown} email
 * @returns {{ original: string, normalized: string | null } | null}
 */
function normalizeEmailForDuplicate(email) {
  const original = asOriginalString(email);
  if (original == null) return null;
  if (!original.trim()) return null;

  const normalized = normalizeEmail(original);
  if (!normalized || !EMAIL_RE.test(normalized) || normalized.length > 254) {
    return { original, normalized: null };
  }
  return { original, normalized };
}

/**
 * Strip trailing dots (platform.domains trigger behavior).
 * @param {string} host
 */
function stripTrailingDots(host) {
  let out = host;
  while (out.endsWith(".")) {
    out = out.slice(0, -1);
  }
  return out;
}

/**
 * Extract a bare hostname from a pasted URL or hostname string.
 * Rejects empty / unusable values; does not invent domains.
 * @param {unknown} value
 * @returns {{ original: string, normalized: string | null } | null}
 */
function normalizeWebsiteDomainForDuplicate(value) {
  const original = asOriginalString(value);
  if (original == null) return null;
  const trimmed = original.trim();
  if (!trimmed) return null;

  let host = trimmed;
  // Accept full URLs for compare-key extraction only; original is preserved.
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(host)) {
    try {
      const url = new URL(host);
      host = url.hostname || "";
    } catch {
      return { original, normalized: null };
    }
  } else {
    // hostname[/path] or host:port — take host only; reject whitespace.
    if (/\s/.test(host)) {
      return { original, normalized: null };
    }
    host = host.split("/")[0] || "";
    host = host.split("?")[0] || "";
    host = host.split("#")[0] || "";
    if (host.includes(":")) {
      // Reject ports (platform domains forbid ':'); IPv6 not supported for matching.
      return { original, normalized: null };
    }
  }

  host = stripTrailingDots(String(host).trim().toLowerCase());
  if (!host) {
    return { original, normalized: null };
  }

  // Compare key: optional single leading www. (original unchanged).
  if (host.startsWith("www.")) {
    host = host.slice(4);
  }
  host = stripTrailingDots(host);

  if (!host || host.length > 253 || !HOSTNAME_RE.test(host)) {
    return { original, normalized: null };
  }
  return { original, normalized: host };
}

/**
 * Registration / legal identifier when present.
 * No country-specific PACRA/tax formats invented — alphanumeric + limited separators only.
 * @param {unknown} value
 * @returns {{ original: string, normalized: string | null } | null}
 */
function normalizeRegistrationNumberForDuplicate(value) {
  const original = asOriginalString(value);
  if (original == null) return null;
  const trimmed = original.trim();
  if (!trimmed) return null;

  const collapsed = trimmed.replace(/\s+/g, "").toUpperCase();
  if (!collapsed || collapsed.length < 2 || collapsed.length > 64) {
    return { original, normalized: null };
  }
  if (!REGISTRATION_NUMBER_RE.test(collapsed)) {
    return { original, normalized: null };
  }
  return { original, normalized: collapsed };
}

/**
 * Address parts where safe exact-match keys are possible (no geocoding).
 * Usable when at least city+country normalize, or a usable postal code alone
 * with country, or a street line with city+country.
 *
 * @param {{
 *   line1?: unknown,
 *   line2?: unknown,
 *   city?: unknown,
 *   region?: unknown,
 *   postalCode?: unknown,
 *   country?: unknown,
 * }} [input]
 * @returns {{
 *   original: object,
 *   normalized: {
 *     line1: string | null,
 *     line2: string | null,
 *     city: string | null,
 *     region: string | null,
 *     postalCode: string | null,
 *     country: string | null,
 *   },
 *   key: string | null
 * } | null}
 */
function normalizeAddressForDuplicate(input) {
  if (input == null || typeof input !== "object") return null;

  const line1 = normalizePlaceForDuplicate(input.line1, 200);
  const line2 = normalizePlaceForDuplicate(input.line2, 200);
  const city = normalizePlaceForDuplicate(input.city, 120);
  const region = normalizePlaceForDuplicate(input.region, 120);
  const country = normalizePlaceForDuplicate(input.country, 120);

  let postalOriginal = asOriginalString(input.postalCode);
  let postalNormalized = null;
  if (postalOriginal != null && postalOriginal.trim()) {
    const compact = postalOriginal
      .trim()
      .replace(/\s+/g, "")
      .toUpperCase()
      .replace(/[^A-Z0-9-]/g, "");
    if (compact.length >= 2 && compact.length <= 16) {
      postalNormalized = compact;
    } else {
      postalNormalized = null;
    }
  } else {
    postalOriginal = null;
  }

  const hasAnyOriginal =
    line1 ||
    line2 ||
    city ||
    region ||
    country ||
    (postalOriginal != null && String(postalOriginal).trim() !== "");
  if (!hasAnyOriginal) return null;

  const normalized = {
    line1: line1 ? line1.normalized : null,
    line2: line2 ? line2.normalized : null,
    city: city ? city.normalized : null,
    region: region ? region.normalized : null,
    postalCode: postalNormalized,
    country: country ? country.normalized : null,
  };

  // Safe exact keys only — never invent coordinates or scores.
  let key = null;
  if (normalized.city && normalized.country) {
    const parts = [
      normalized.line1 || "",
      normalized.city,
      normalized.region || "",
      normalized.postalCode || "",
      normalized.country,
    ];
    key = parts.join("|");
  } else if (normalized.postalCode && normalized.country) {
    key = `postal|${normalized.postalCode}|${normalized.country}`;
  }

  return {
    original: {
      line1: line1 ? line1.original : asOriginalString(input.line1),
      line2: line2 ? line2.original : asOriginalString(input.line2),
      city: city ? city.original : asOriginalString(input.city),
      region: region ? region.original : asOriginalString(input.region),
      postalCode: postalOriginal,
      country: country ? country.original : asOriginalString(input.country),
    },
    normalized,
    key,
  };
}

module.exports = {
  normalizeCompareText,
  normalizeChurchNameForDuplicate,
  normalizePlaceForDuplicate,
  normalizeChurchNameCityCountryForDuplicate,
  normalizePhoneForDuplicate,
  normalizeEmailForDuplicate,
  normalizeWebsiteDomainForDuplicate,
  normalizeRegistrationNumberForDuplicate,
  normalizeAddressForDuplicate,
};
