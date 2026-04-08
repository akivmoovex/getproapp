"use strict";

const phoneRulesRepo = require("../db/pg/phoneRulesRepo");

const MAX_DIGITS = 20;
const GENERIC_MIN_DIGITS = 5;

/** Default Zambia validation regex (stored on `zm` tenant; used as compile fallback). */
const DEFAULT_ZM_PHONE_REGEX = "^(?:\\+?260|0)(?:95|96|97|76|77)\\d{7}$";

function safeCompileRegex(patternStr) {
  const s = String(patternStr || "").trim();
  if (!s) return { ok: true, regex: null };
  try {
    return { ok: true, regex: new RegExp(s) };
  } catch {
    return { ok: false, regex: null };
  }
}

/**
 * @param {object | null} row tenants row with phone_* columns
 */
function compileRules(row) {
  if (!row) {
    return {
      slug: "",
      strict: false,
      regexSource: "",
      regex: null,
      regexBroken: false,
      defaultCountry: "",
      mode: "generic_digits",
    };
  }
  const slug = String(row.slug || "").toLowerCase().trim();
  const regexSource = String(row.phone_regex != null ? row.phone_regex : "").trim();
  const compiled = safeCompileRegex(regexSource);
  const regexBroken = Boolean(regexSource) && !compiled.ok;
  const regex = compiled.ok ? compiled.regex : null;
  return {
    slug,
    strict: Boolean(row.phone_strict_validation),
    regexSource,
    regex,
    regexBroken,
    defaultCountry: String(row.phone_default_country_code != null ? row.phone_default_country_code : "").trim(),
    mode: String(row.phone_normalization_mode != null ? row.phone_normalization_mode : "generic_digits").trim() || "generic_digits",
  };
}

/** Digit-only generic fallback (Demo / unknown): safe for duplicate buckets. */
function normalizeGenericDigits(raw) {
  return String(raw || "")
    .replace(/\D/g, "")
    .slice(0, MAX_DIGITS);
}

/**
 * Zambia canonical: 260 + 9-digit national (no leading 0).
 * Accepts local 0XXXXXXXXX, +260..., 260..., and 9-digit mobile without prefix.
 */
function normalizeZmE164(raw) {
  const s = String(raw || "").trim();
  if (!s) return "";
  let d = s.replace(/\D/g, "");
  if (!d) return "";
  if (d.startsWith("260")) {
    return d.length >= 12 ? d.slice(0, 12) : d;
  }
  if (d.startsWith("0") && d.length === 10) {
    return "260" + d.slice(1);
  }
  if (d.length === 9 && /^[79]/.test(d)) {
    return "260" + d;
  }
  return d.slice(0, MAX_DIGITS);
}

function normalizeWithRules(rules, raw) {
  const mode = rules.mode;
  if (mode === "zm_e164") {
    return normalizeZmE164(raw);
  }
  return normalizeGenericDigits(raw);
}

/**
 * Expand canonical digit strings for comparing to legacy rows that may store local 0… or 9-digit forms.
 * @param {{ mode: string }} rules
 * @param {string} canonicalDigits
 * @returns {string[]}
 */
function expandDuplicateComparisonNorms(rules, canonicalDigits) {
  const d = String(canonicalDigits || "").replace(/\D/g, "");
  const out = new Set();
  if (d) out.add(d);
  if (rules.mode === "zm_e164" && d.startsWith("260") && d.length === 12) {
    const n9 = d.slice(3);
    out.add("0" + n9);
    out.add(n9);
  }
  return [...out];
}

/**
 * @param {{ strict: boolean, regex: RegExp | null, regexBroken: boolean, regexSource: string, mode: string }} rules
 * @param {string} raw
 * @param {'phone'|'whatsapp'} _type reserved for future
 */
function validateWithRules(rules, raw, _type) {
  const t = String(raw || "").trim();
  if (!t) {
    return { ok: false, error: "Phone number is required." };
  }

  if (rules.regexBroken) {
    // Safe runtime: invalid stored regex does not crash; fall back to generic length check when strict was intended
    const digits = normalizeGenericDigits(t);
    if (digits.length < GENERIC_MIN_DIGITS) {
      return { ok: false, error: "Phone number is too short." };
    }
    return { ok: true };
  }

  const useRegex = Boolean(rules.strict && rules.regex);
  if (useRegex && rules.regex && !rules.regex.test(t)) {
    return { ok: false, error: "Phone number does not match the expected format for this region." };
  }

  if (!rules.strict) {
    const digits = normalizeWithRules(rules, t);
    if (!digits) {
      return { ok: false, error: "Phone number is required." };
    }
    if (rules.mode === "generic_digits" && digits.length < GENERIC_MIN_DIGITS) {
      return { ok: false, error: "Phone number is too short." };
    }
    return { ok: true };
  }

  // strict without regex (Demo): require minimum digits
  const digits = normalizeWithRules(rules, t);
  if (!digits || (rules.mode === "generic_digits" && digits.length < GENERIC_MIN_DIGITS)) {
    return { ok: false, error: "Phone number is too short." };
  }
  return { ok: true };
}

async function loadRules(pool, tenantId) {
  let row;
  try {
    row = await phoneRulesRepo.getPhoneRulesByTenantId(pool, tenantId);
  } catch (e) {
    const code = e && e.code;
    const msg = String((e && e.message) || e);
    // 42703 = undefined_column — tolerate until migration has been applied (rolling deploys).
    if (code === "42703" || /column .* does not exist/i.test(msg)) {
      // eslint-disable-next-line no-console
      console.error(
        "[getpro] tenants.phone_* columns missing; ensureTenantPhoneRulesSchema / 003_tenant_phone_rules.sql.",
        msg
      );
      return compileRules(null);
    }
    throw e;
  }
  return compileRules(row);
}

async function normalizePhoneForTenant(pool, tenantId, raw) {
  const rules = await loadRules(pool, tenantId);
  return normalizeWithRules(rules, raw);
}

async function validatePhoneForTenant(pool, tenantId, raw, type) {
  const rules = await loadRules(pool, tenantId);
  return validateWithRules(rules, raw, type || "phone");
}

/**
 * For client-side UX: non-sensitive subset (regex pattern string optional).
 */
async function getPublicPhoneRulesForTenant(pool, tenantId) {
  const rules = await loadRules(pool, tenantId);
  return {
    slug: rules.slug,
    strict: rules.strict,
    regex: rules.regexBroken ? null : rules.regexSource || null,
    normalizationMode: rules.mode,
    regexBroken: rules.regexBroken,
  };
}

/**
 * All candidate digit norms to check against companies / signups (legacy formats).
 */
async function expandDuplicateNormsForTenant(pool, tenantId, phoneCanonical, whatsappCanonical) {
  const rules = await loadRules(pool, tenantId);
  const a = expandDuplicateComparisonNorms(rules, phoneCanonical);
  const b = expandDuplicateComparisonNorms(rules, whatsappCanonical);
  return [...new Set([...a, ...b].filter(Boolean))];
}

module.exports = {
  DEFAULT_ZM_PHONE_REGEX,
  MAX_DIGITS,
  GENERIC_MIN_DIGITS,
  safeCompileRegex,
  compileRules,
  normalizeGenericDigits,
  normalizeZmE164,
  normalizeWithRules,
  expandDuplicateComparisonNorms,
  validateWithRules,
  loadRules,
  normalizePhoneForTenant,
  validatePhoneForTenant,
  getPublicPhoneRulesForTenant,
  expandDuplicateNormsForTenant,
};
