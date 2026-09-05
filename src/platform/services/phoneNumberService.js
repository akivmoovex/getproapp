"use strict";

/**
 * Canonical phone number service for ActiveClinic / platform identity.
 * One shared parser → environment validation policy → E.164 storage.
 *
 * Do not invent a second normalization system; wrappers should delegate here.
 */

const {
  parsePhoneNumberFromString,
  getCountries,
  getCountryCallingCode,
} = require("libphonenumber-js");

const PLATFORM_DEFAULT_COUNTRY = "ZM";
const PHONE_E164_RE = /^\+[1-9][0-9]{6,14}$/;

const VALIDATION_MODES = Object.freeze({
  RELAXED: "relaxed",
  STRICT: "strict",
});

/**
 * Trusted server/deployment configuration only — never request params.
 * @param {NodeJS.ProcessEnv|object} [env]
 */
function resolvePhoneValidationMode(env) {
  const e = env || process.env;
  const explicit = String(e.PHONE_VALIDATION_MODE || "")
    .trim()
    .toLowerCase();
  if (explicit === VALIDATION_MODES.RELAXED || explicit === VALIDATION_MODES.STRICT) {
    return explicit;
  }
  const deployment = String(e.DEPLOYMENT_ENV || e.NODE_ENV || "")
    .trim()
    .toLowerCase();
  if (deployment === "production") return VALIDATION_MODES.STRICT;
  // testing / demo / development / test
  return VALIDATION_MODES.RELAXED;
}

/**
 * Precedence: user selection → clinic/org default → deployment default → platform default → ZM
 * @param {{
 *   selectedCountry?: string|null,
 *   clinicDefaultCountry?: string|null,
 *   organizationDefaultCountry?: string|null,
 *   deploymentDefaultCountry?: string|null,
 *   platformDefaultCountry?: string|null,
 *   env?: NodeJS.ProcessEnv|object,
 * }} [input]
 */
function resolveDefaultCountry(input) {
  const env = (input && input.env) || process.env;
  let deploymentDefault = input && input.deploymentDefaultCountry;
  if (!deploymentDefault) {
    try {
      const {
        hasAuthoritativeDeploymentProfile,
        getDeploymentProfile,
      } = require("../config/deploymentProfiles");
      if (hasAuthoritativeDeploymentProfile(env)) {
        const profile = getDeploymentProfile(env);
        deploymentDefault = profile && profile.defaultCountry;
      }
    } catch (_err) {
      deploymentDefault = null;
    }
  }
  const candidates = [
    input && input.selectedCountry,
    input && input.clinicDefaultCountry,
    input && input.organizationDefaultCountry,
    deploymentDefault,
    input && input.platformDefaultCountry,
    PLATFORM_DEFAULT_COUNTRY,
  ];
  for (const raw of candidates) {
    const iso = String(raw || "")
      .trim()
      .toUpperCase();
    if (/^[A-Z]{2}$/.test(iso) && getCountries().includes(iso)) {
      return iso;
    }
  }
  return PLATFORM_DEFAULT_COUNTRY;
}

/**
 * Deployment-aware default country (ZM unless profile overrides).
 * @param {NodeJS.ProcessEnv|object} [env]
 */
function resolveDeploymentDefaultCountry(env) {
  return resolveDefaultCountry({ env: env || process.env });
}

function listPhoneCountries() {
  const countries = getCountries();
  const displayNames =
    typeof Intl !== "undefined" && typeof Intl.DisplayNames === "function"
      ? new Intl.DisplayNames(["en"], { type: "region" })
      : null;
  return countries
    .map((iso) => {
      const callingCode = `+${getCountryCallingCode(iso)}`;
      let name = iso;
      try {
        name = (displayNames && displayNames.of(iso)) || iso;
      } catch (_err) {
        name = iso;
      }
      return {
        iso,
        name,
        callingCode,
        searchText: `${name} ${iso} ${callingCode}`.toLowerCase(),
      };
    })
    .sort((a, b) => {
      if (a.iso === "ZM") return -1;
      if (b.iso === "ZM") return 1;
      return a.name.localeCompare(b.name);
    });
}

function getCallingCodeForCountry(iso) {
  const code = String(iso || "")
    .trim()
    .toUpperCase();
  if (!/^[A-Z]{2}$/.test(code) || !getCountries().includes(code)) return null;
  return `+${getCountryCallingCode(code)}`;
}

/**
 * Combine structured country + national, or legacy single phone string.
 * @param {{
 *   phone?: unknown,
 *   phoneCountry?: unknown,
 *   phoneNational?: unknown,
 *   country?: unknown,
 *   national?: unknown,
 *   defaultCountry?: string|null,
 *   clinicDefaultCountry?: string|null,
 *   validationMode?: string|null,
 *   env?: object,
 *   required?: boolean,
 * }} input
 */
function parsePhoneInput(input) {
  const opts = input || {};
  const legacy = String(opts.phone == null ? "" : opts.phone).trim();
  const national = String(
    opts.phoneNational != null
      ? opts.phoneNational
      : opts.national != null
        ? opts.national
        : ""
  ).trim();
  const selected = String(
    opts.phoneCountry != null
      ? opts.phoneCountry
      : opts.country != null
        ? opts.country
        : ""
  )
    .trim()
    .toUpperCase();

  // Call-site `defaultCountry` is a clinic/context override for interpreting
  // national numbers. Map it at clinic precedence so an authoritative
  // deployment profile (e.g. ZM) cannot silently ignore BW/KE/etc.
  const clinicOrCallerDefault =
    opts.clinicDefaultCountry != null && String(opts.clinicDefaultCountry).trim() !== ""
      ? opts.clinicDefaultCountry
      : opts.defaultCountry;
  const defaultCountry = resolveDefaultCountry({
    selectedCountry: selected || null,
    clinicDefaultCountry: clinicOrCallerDefault,
    organizationDefaultCountry: opts.organizationDefaultCountry,
    env: opts.env,
  });

  let raw = "";
  if (national) {
    raw = national;
  } else if (legacy) {
    raw = legacy;
  }

  return {
    raw,
    defaultCountry,
    selectedCountry: selected || defaultCountry,
    hasInput: Boolean(raw),
    required: opts.required !== false,
    validationMode:
      opts.validationMode || resolvePhoneValidationMode(opts.env || process.env),
  };
}

/**
 * @returns {{
 *   ok: true,
 *   e164: string,
 *   national: string,
 *   country: string|null,
 *   callingCode: string|null,
 *   display: string,
 *   displayNational: string,
 *   possible: boolean,
 *   valid: boolean,
 *   validationMode: string,
 * } | {
 *   ok: false,
 *   code: string,
 *   error: string,
 *   field: string,
 * }}
 */
function normalizePhoneNumber(input) {
  const parsed = parsePhoneInput(input);
  if (!parsed.hasInput) {
    if (parsed.required === false) {
      return {
        ok: true,
        e164: null,
        national: null,
        country: parsed.defaultCountry,
        callingCode: getCallingCodeForCountry(parsed.defaultCountry),
        display: null,
        displayNational: null,
        possible: true,
        valid: true,
        validationMode: parsed.validationMode,
      };
    }
    return {
      ok: false,
      code: "phone_required",
      error: "Please enter a phone number.",
      field: "phone",
    };
  }

  let phone;
  try {
    phone = parsePhoneNumberFromString(parsed.raw, parsed.selectedCountry);
  } catch (_err) {
    phone = null;
  }

  // Also try as international if national parse failed
  if (!phone || !phone.number) {
    try {
      const withPlus = parsed.raw.startsWith("+")
        ? parsed.raw
        : parsed.raw.startsWith("00")
          ? `+${parsed.raw.slice(2)}`
          : null;
      if (withPlus) {
        phone = parsePhoneNumberFromString(withPlus);
      }
    } catch (_err) {
      phone = null;
    }
  }

  if (!phone || !phone.number) {
    return {
      ok: false,
      code: "phone_unparseable",
      error: `Enter a valid phone number for ${parsed.selectedCountry}.`,
      field: "phone",
    };
  }

  const e164 = phone.format("E.164");
  if (!PHONE_E164_RE.test(e164)) {
    return {
      ok: false,
      code: "phone_invalid",
      error: `Enter a valid phone number for ${phone.country || parsed.selectedCountry}.`,
      field: "phone",
    };
  }

  const possible = typeof phone.isPossible === "function" ? phone.isPossible() : true;
  const valid = typeof phone.isValid === "function" ? phone.isValid() : possible;

  if (parsed.validationMode === VALIDATION_MODES.STRICT) {
    if (!valid) {
      return {
        ok: false,
        code: "phone_invalid_for_country",
        error: `Enter a valid phone number for ${phone.country || parsed.selectedCountry}.`,
        field: "phone",
      };
    }
  } else {
    // relaxed: require possible or at least E.164 length shape
    if (!possible && !PHONE_E164_RE.test(e164)) {
      return {
        ok: false,
        code: "phone_unparseable",
        error: `Enter a valid phone number for ${phone.country || parsed.selectedCountry}.`,
        field: "phone",
      };
    }
  }

  const national = phone.nationalNumber || "";
  const country = phone.country || parsed.selectedCountry || null;
  const callingCode = phone.countryCallingCode
    ? `+${phone.countryCallingCode}`
    : getCallingCodeForCountry(country);

  return {
    ok: true,
    e164,
    national,
    country,
    callingCode,
    display: e164.slice(0, 40),
    displayNational: national,
    possible: Boolean(possible),
    valid: Boolean(valid),
    validationMode: parsed.validationMode,
    // compatibility aliases used by existing callers
    normalized: e164,
  };
}

function formatForDisplay(e164) {
  if (!e164) return "";
  try {
    const phone = parsePhoneNumberFromString(String(e164));
    if (phone) return phone.formatInternational();
  } catch (_err) {
    /* fall through */
  }
  return String(e164);
}

function formatNational(e164) {
  if (!e164) return "";
  try {
    const phone = parsePhoneNumberFromString(String(e164));
    if (phone) return phone.formatNational();
  } catch (_err) {
    /* fall through */
  }
  return String(e164);
}

function getCountryFromE164(e164) {
  try {
    const phone = parsePhoneNumberFromString(String(e164 || ""));
    return phone && phone.country ? phone.country : null;
  } catch (_err) {
    return null;
  }
}

function comparePhoneNumbers(a, b, options) {
  const left = normalizePhoneNumber({
    phone: a,
    defaultCountry: options && options.defaultCountry,
    clinicDefaultCountry: options && options.clinicDefaultCountry,
    validationMode: VALIDATION_MODES.RELAXED,
    required: true,
  });
  const right = normalizePhoneNumber({
    phone: b,
    defaultCountry: options && options.defaultCountry,
    clinicDefaultCountry: options && options.clinicDefaultCountry,
    validationMode: VALIDATION_MODES.RELAXED,
    required: true,
  });
  if (!left.ok || !right.ok) return false;
  return left.e164 === right.e164;
}

/**
 * Extract structured phone fields from a request body (legacy + new).
 *
 * Precedence at normalize time (see parsePhoneInput): phone_national wins over
 * legacy `phone`. Legacy `phone` is RETAINED for proven callers (BB HQ/staff
 * invites, member profile, forgot-password, church auth register, CMS, etc.).
 * Do not remove until those UIs migrate to phone_country + phone_national.
 */
function extractPhoneFieldsFromBody(body, prefix) {
  const b = body || {};
  const p = prefix ? `${prefix}_` : "";
  return {
    phone: b[`${p}phone`] != null ? b[`${p}phone`] : b.phone_number || b.mobile || null,
    phoneCountry:
      b[`${p}phone_country`] != null
        ? b[`${p}phone_country`]
        : b.phone_country || b.country || null,
    phoneNational:
      b[`${p}phone_national`] != null
        ? b[`${p}phone_national`]
        : b.phone_national || b.national || null,
  };
}

/**
 * Build patient/list phone search criteria.
 * Full numbers → exact E.164. Short digit fragments → partial digit match.
 * Never uses strict production validity for search.
 *
 * @param {unknown} raw
 * @param {{ defaultCountry?: string|null, clinicDefaultCountry?: string|null }} [options]
 * @returns {{
 *   ok: true,
 *   mode: 'none'|'exact'|'partial',
 *   e164?: string|null,
 *   digits?: string|null,
 * } | { ok: false, code: string, error: string }}
 */
function buildPhoneSearchCriteria(raw, options) {
  const opts = options || {};
  const text = String(raw == null ? "" : raw).trim();
  if (!text) {
    return { ok: true, mode: "none", e164: null, digits: null };
  }

  // Reject letter-heavy nonsense for phone search.
  if (/[a-zA-Z]/.test(text) && !/^\s*\+/.test(text)) {
    return {
      ok: false,
      code: "phone_search_invalid",
      error: "Enter a phone number or digit fragment to search.",
    };
  }

  const digits = text.replace(/\D/g, "");
  const full = normalizePhoneNumber({
    phone: text,
    defaultCountry: opts.defaultCountry || PLATFORM_DEFAULT_COUNTRY,
    clinicDefaultCountry: opts.clinicDefaultCountry || null,
    validationMode: VALIDATION_MODES.RELAXED,
    required: true,
  });
  if (full.ok && full.e164) {
    return {
      ok: true,
      mode: "exact",
      e164: full.e164,
      digits: digits || null,
    };
  }

  // Partial fragment: require enough digits to be useful, allow without country.
  if (digits.length >= 3 && digits.length <= 15) {
    return { ok: true, mode: "partial", e164: null, digits };
  }

  return {
    ok: false,
    code: "phone_search_invalid",
    error: "Enter a fuller phone number or at least 3 digits.",
  };
}

module.exports = {
  PLATFORM_DEFAULT_COUNTRY,
  PHONE_E164_RE,
  VALIDATION_MODES,
  resolvePhoneValidationMode,
  resolveDefaultCountry,
  resolveDeploymentDefaultCountry,
  listPhoneCountries,
  getCallingCodeForCountry,
  parsePhoneInput,
  normalizePhoneNumber,
  formatForDisplay,
  formatNational,
  getCountryFromE164,
  comparePhoneNumbers,
  extractPhoneFieldsFromBody,
  buildPhoneSearchCriteria,
};
