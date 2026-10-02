"use strict";

/**
 * Prompt 7 Stage 2 — controlled website setting key registry + typed validation.
 * Unknown keys are rejected server-side. Empty strings normalize to null (reset semantics).
 */

const { safeExternalUrl } = require("../http/tenantPublicSafe");

const SETTING_KEY_RE = /^[a-z][a-z0-9_.]{0,95}$/;

const VALUE_TYPES = Object.freeze({
  SHORT_TEXT: "short_text",
  LONG_TEXT: "long_text",
  EMAIL: "email",
  PHONE: "phone",
  URL: "url",
  IMAGE_URL: "image_url",
  BOOLEAN: "boolean",
  ENUM: "enum",
  SOCIAL_LINKS: "social_links",
});

const SOCIAL_PLATFORMS = Object.freeze([
  "facebook",
  "instagram",
  "youtube",
  "whatsapp",
  "tiktok",
  "x",
  "website",
]);

/**
 * @typedef {{
 *   type: string,
 *   maxLen?: number,
 *   enumValues?: string[],
 *   hideable?: boolean,
 *   hqOnly?: boolean,
 *   readOnly?: boolean,
 *   group: string,
 *   description: string,
 * }} SettingKeyDef
 */

/** @type {Record<string, SettingKeyDef>} */
const KEY_DEFS = Object.freeze({
  // —— Identity ——
  "identity.branch_display_name": {
    type: VALUE_TYPES.SHORT_TEXT,
    maxLen: 120,
    hideable: false,
    group: "identity",
    description: "Branch public display name",
  },
  "identity.tagline": {
    type: VALUE_TYPES.SHORT_TEXT,
    maxLen: 200,
    hideable: true,
    group: "identity",
    description: "Local tagline",
  },
  "identity.hero_title": {
    type: VALUE_TYPES.SHORT_TEXT,
    maxLen: 160,
    hideable: true,
    group: "identity",
    description: "Hero title",
  },
  "identity.hero_description": {
    type: VALUE_TYPES.LONG_TEXT,
    maxLen: 800,
    hideable: true,
    group: "identity",
    description: "Hero supporting copy",
  },
  "identity.hero_image_url": {
    type: VALUE_TYPES.IMAGE_URL,
    maxLen: 500,
    hideable: true,
    group: "identity",
    description: "Hero image URL",
  },
  "identity.hero_primary_action_label": {
    type: VALUE_TYPES.SHORT_TEXT,
    maxLen: 60,
    hideable: true,
    group: "identity",
    description: "Primary CTA label",
  },
  "identity.hero_primary_action_url": {
    type: VALUE_TYPES.URL,
    maxLen: 500,
    hideable: true,
    group: "identity",
    description: "Primary CTA URL",
  },
  "identity.hero_secondary_action_label": {
    type: VALUE_TYPES.SHORT_TEXT,
    maxLen: 60,
    hideable: true,
    group: "identity",
    description: "Secondary CTA label",
  },
  "identity.hero_secondary_action_url": {
    type: VALUE_TYPES.URL,
    maxLen: 500,
    hideable: true,
    group: "identity",
    description: "Secondary CTA URL",
  },

  // —— Contact ——
  "contact.phone": {
    type: VALUE_TYPES.PHONE,
    maxLen: 32,
    hideable: true,
    group: "contact",
    description: "Public phone",
  },
  "contact.email": {
    type: VALUE_TYPES.EMAIL,
    maxLen: 254,
    hideable: true,
    group: "contact",
    description: "Public email",
  },
  "contact.address_line_1": {
    type: VALUE_TYPES.SHORT_TEXT,
    maxLen: 200,
    hideable: true,
    group: "contact",
    description: "Address line 1",
  },
  "contact.address_line_2": {
    type: VALUE_TYPES.SHORT_TEXT,
    maxLen: 200,
    hideable: true,
    group: "contact",
    description: "Address line 2",
  },
  "contact.city": {
    type: VALUE_TYPES.SHORT_TEXT,
    maxLen: 120,
    hideable: true,
    group: "contact",
    description: "City",
  },
  "contact.province": {
    type: VALUE_TYPES.SHORT_TEXT,
    maxLen: 120,
    hideable: true,
    group: "contact",
    description: "Province / state",
  },
  "contact.country": {
    type: VALUE_TYPES.SHORT_TEXT,
    maxLen: 120,
    hideable: true,
    group: "contact",
    description: "Country",
  },
  "contact.postal_code": {
    type: VALUE_TYPES.SHORT_TEXT,
    maxLen: 32,
    hideable: true,
    group: "contact",
    description: "Postal code",
  },
  "contact.map_url": {
    type: VALUE_TYPES.URL,
    maxLen: 500,
    hideable: true,
    group: "contact",
    description: "Map or directions URL",
  },
  "contact.directions_text": {
    type: VALUE_TYPES.LONG_TEXT,
    maxLen: 500,
    hideable: true,
    group: "contact",
    description: "Directions copy",
  },

  // —— Social ——
  "social.links": {
    type: VALUE_TYPES.SOCIAL_LINKS,
    hideable: true,
    group: "social",
    description: "Structured social links",
  },

  // —— SEO ——
  "seo.title": {
    type: VALUE_TYPES.SHORT_TEXT,
    maxLen: 80,
    hideable: false,
    group: "seo",
    description: "Document title override",
  },
  "seo.description": {
    type: VALUE_TYPES.LONG_TEXT,
    maxLen: 160,
    hideable: false,
    group: "seo",
    description: "Meta description",
  },
  "seo.og_title": {
    type: VALUE_TYPES.SHORT_TEXT,
    maxLen: 80,
    hideable: false,
    group: "seo",
    description: "Open Graph title",
  },
  "seo.og_description": {
    type: VALUE_TYPES.LONG_TEXT,
    maxLen: 160,
    hideable: false,
    group: "seo",
    description: "Open Graph description",
  },
  "seo.og_image_url": {
    type: VALUE_TYPES.IMAGE_URL,
    maxLen: 500,
    hideable: false,
    group: "seo",
    description: "Open Graph image",
  },
  "seo.noindex": {
    type: VALUE_TYPES.BOOLEAN,
    hqOnly: true,
    hideable: false,
    group: "seo",
    description: "Force noindex (HQ / governance)",
  },
  "seo.canonical_url": {
    type: VALUE_TYPES.URL,
    maxLen: 500,
    hideable: false,
    group: "seo",
    description: "Canonical URL override (https, defaults to the page's own URL)",
  },
  "seo.robots": {
    type: VALUE_TYPES.ENUM,
    enumValues: ["index", "noindex"],
    hideable: false,
    group: "seo",
    description: "Search engine indexing for this site",
  },
  "seo.sitemap_include": {
    type: VALUE_TYPES.BOOLEAN,
    hideable: false,
    group: "seo",
    description: "Include this site in sitemap.xml",
  },

  // —— Presentation chrome ——
  "presentation.branch_display_label": {
    type: VALUE_TYPES.SHORT_TEXT,
    maxLen: 120,
    hideable: false,
    group: "presentation",
    description: "Header / selector branch label",
  },
  "presentation.parent_church_label": {
    type: VALUE_TYPES.SHORT_TEXT,
    maxLen: 200,
    readOnly: true,
    hideable: false,
    group: "presentation",
    description: "Parent church label (not branch-overridable)",
  },
  "presentation.branch_selector_label": {
    type: VALUE_TYPES.SHORT_TEXT,
    maxLen: 80,
    hideable: false,
    group: "presentation",
    description: "Branch selector control label",
  },
  "presentation.accent_key": {
    type: VALUE_TYPES.ENUM,
    enumValues: ["none", "warm", "cool", "neutral"],
    hideable: false,
    group: "presentation",
    description: "Approved local accent treatment key",
  },

  // —— Stage 1 coarse keys (compat; prefer dotted keys for new writes) ——
  branch_display_identity: {
    type: VALUE_TYPES.SHORT_TEXT,
    maxLen: 200,
    group: "legacy",
    description: "Stage 1 coarse identity",
  },
  hero_content: {
    type: VALUE_TYPES.LONG_TEXT,
    maxLen: 2000,
    group: "legacy",
    description: "Stage 1 coarse hero",
  },
  contact_details: {
    type: VALUE_TYPES.LONG_TEXT,
    maxLen: 2000,
    group: "legacy",
    description: "Stage 1 coarse contact",
  },
  address_and_map: {
    type: VALUE_TYPES.LONG_TEXT,
    maxLen: 2000,
    group: "legacy",
    description: "Stage 1 coarse address",
  },
  service_times: {
    type: VALUE_TYPES.LONG_TEXT,
    maxLen: 2000,
    group: "legacy",
    description: "Stage 1 coarse service times marker",
  },
  social_links: {
    type: VALUE_TYPES.SOCIAL_LINKS,
    group: "legacy",
    description: "Stage 1 coarse social",
  },
  seo: {
    type: VALUE_TYPES.LONG_TEXT,
    maxLen: 2000,
    group: "legacy",
    description: "Stage 1 coarse SEO",
  },
  page_visibility: {
    type: VALUE_TYPES.LONG_TEXT,
    maxLen: 2000,
    group: "legacy",
    description: "Stage 1 page visibility",
  },
  website_presentation: {
    type: VALUE_TYPES.LONG_TEXT,
    maxLen: 2000,
    group: "legacy",
    description: "Stage 1 presentation",
  },
});

const SETTING_KEYS = Object.freeze(Object.keys(KEY_DEFS));
const STAGE2_SETTING_KEYS = Object.freeze(
  SETTING_KEYS.filter((k) => KEY_DEFS[k].group !== "legacy")
);

function normalizeSettingKey(raw) {
  const key = String(raw || "")
    .trim()
    .toLowerCase();
  if (!SETTING_KEY_RE.test(key)) return null;
  if (!Object.prototype.hasOwnProperty.call(KEY_DEFS, key)) return null;
  return key;
}

function isKnownSettingKey(raw) {
  return Boolean(normalizeSettingKey(raw));
}

function getKeyDef(raw) {
  const key = normalizeSettingKey(raw);
  return key ? KEY_DEFS[key] : null;
}

/**
 * Strip HTML / angle brackets from plain text fields.
 * @param {unknown} raw
 * @param {number} maxLen
 */
function normalizePlainText(raw, maxLen) {
  if (raw == null) return { ok: true, value: null };
  if (typeof raw !== "string" && typeof raw !== "number") {
    return { ok: false, reason: "type" };
  }
  const trimmed = String(raw)
    .replace(/<[^>]*>/g, "")
    .replace(/[<>]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  if (!trimmed) return { ok: true, value: null };
  if (trimmed.length > maxLen) return { ok: false, reason: "too_long" };
  return { ok: true, value: trimmed };
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_RE = /^\+?[0-9][0-9\s().-]{2,30}$/;

/**
 * Validate and normalize a raw value for a known key.
 * Empty → null (caller may treat as reset).
 * @param {string} settingKey
 * @param {unknown} rawValue
 * @returns {{ ok: true, value: * } | { ok: false, reason: string, message?: string }}
 */
function validateSettingValue(settingKey, rawValue) {
  const def = getKeyDef(settingKey);
  if (!def) return { ok: false, reason: "unknown_key", message: "Unsupported setting key." };

  if (def.readOnly) {
    return { ok: false, reason: "read_only", message: "This setting cannot be overridden." };
  }

  // Accept { value: X } envelopes from API clients.
  let candidate = rawValue;
  if (
    candidate &&
    typeof candidate === "object" &&
    !Array.isArray(candidate) &&
    Object.prototype.hasOwnProperty.call(candidate, "value") &&
    def.type !== VALUE_TYPES.SOCIAL_LINKS
  ) {
    candidate = candidate.value;
  }

  switch (def.type) {
    case VALUE_TYPES.SHORT_TEXT:
    case VALUE_TYPES.LONG_TEXT: {
      return normalizePlainText(candidate, def.maxLen || 200);
    }
    case VALUE_TYPES.EMAIL: {
      const text = normalizePlainText(candidate, def.maxLen || 254);
      if (!text.ok) return text;
      if (text.value == null) return text;
      if (!EMAIL_RE.test(text.value)) {
        return { ok: false, reason: "email", message: "Invalid email address." };
      }
      return { ok: true, value: text.value.toLowerCase() };
    }
    case VALUE_TYPES.PHONE: {
      const text = normalizePlainText(candidate, def.maxLen || 32);
      if (!text.ok) return text;
      if (text.value == null) return text;
      if (!PHONE_RE.test(text.value)) {
        return { ok: false, reason: "phone", message: "Invalid phone number." };
      }
      return { ok: true, value: text.value };
    }
    case VALUE_TYPES.URL:
    case VALUE_TYPES.IMAGE_URL: {
      if (candidate == null || candidate === "") return { ok: true, value: null };
      const raw = String(candidate).trim();
      if (!raw) return { ok: true, value: null };
      if (/^javascript:/i.test(raw) || /^data:/i.test(raw) || raw.startsWith("//")) {
        return { ok: false, reason: "url", message: "Unsafe URL scheme." };
      }
      const safe = safeExternalUrl(raw);
      if (!safe) return { ok: false, reason: "url", message: "Invalid or disallowed URL." };
      if (safe.length > (def.maxLen || 500)) {
        return { ok: false, reason: "too_long" };
      }
      if (def.type === VALUE_TYPES.IMAGE_URL) {
        const isRelative = safe.startsWith("/");
        const isHttp = /^https?:/i.test(safe);
        if (!isRelative && !isHttp) {
          return { ok: false, reason: "image_url", message: "Image URL must be http(s) or relative." };
        }
      }
      return { ok: true, value: safe };
    }
    case VALUE_TYPES.BOOLEAN: {
      if (candidate == null || candidate === "") return { ok: true, value: null };
      if (candidate === true || candidate === false) return { ok: true, value: candidate };
      if (candidate === "true") return { ok: true, value: true };
      if (candidate === "false") return { ok: true, value: false };
      return { ok: false, reason: "boolean", message: "Boolean must be true or false." };
    }
    case VALUE_TYPES.ENUM: {
      const text = normalizePlainText(candidate, 64);
      if (!text.ok) return text;
      if (text.value == null) return text;
      const allowed = def.enumValues || [];
      if (!allowed.includes(text.value)) {
        return { ok: false, reason: "enum", message: "Value is not an allowed option." };
      }
      return { ok: true, value: text.value };
    }
    case VALUE_TYPES.SOCIAL_LINKS: {
      if (candidate == null || candidate === "") return { ok: true, value: null };
      let list = candidate;
      if (list && typeof list === "object" && !Array.isArray(list) && Array.isArray(list.links)) {
        list = list.links;
      }
      if (!Array.isArray(list)) {
        return { ok: false, reason: "social_links", message: "Social links must be an array." };
      }
      if (list.length > 12) {
        return { ok: false, reason: "social_links", message: "Too many social links." };
      }
      const out = [];
      for (const item of list) {
        if (!item || typeof item !== "object") {
          return { ok: false, reason: "social_links", message: "Invalid social link entry." };
        }
        const platform = String(item.platform || "")
          .trim()
          .toLowerCase();
        if (!SOCIAL_PLATFORMS.includes(platform)) {
          return { ok: false, reason: "social_links", message: `Unsupported platform: ${platform}` };
        }
        const href = safeExternalUrl(item.href || item.url || "");
        if (!href) {
          return { ok: false, reason: "social_links", message: "Social link URL is invalid." };
        }
        const label = normalizePlainText(item.label || platform, 60);
        if (!label.ok) return label;
        out.push({ platform, href, label: label.value || platform });
      }
      return { ok: true, value: out.length ? out : null };
    }
    default:
      return { ok: false, reason: "type" };
  }
}

/**
 * Persist shape for website_scope_settings.value_json.
 * @param {*} normalizedValue
 */
function toValueJson(normalizedValue) {
  if (normalizedValue == null) return {};
  if (Array.isArray(normalizedValue)) return { value: normalizedValue };
  if (typeof normalizedValue === "object") return { value: normalizedValue };
  return { value: normalizedValue };
}

/**
 * Extract scalar/structured value from stored value_json.
 * @param {object|null} valueJson
 */
function fromValueJson(valueJson) {
  if (!valueJson || typeof valueJson !== "object") return null;
  if (Object.prototype.hasOwnProperty.call(valueJson, "value")) {
    return valueJson.value == null ? null : valueJson.value;
  }
  // Legacy Stage 1 coarse blobs may store arbitrary objects.
  if (Object.keys(valueJson).length === 0) return null;
  return valueJson;
}

module.exports = {
  SETTING_KEY_RE,
  VALUE_TYPES,
  SOCIAL_PLATFORMS,
  KEY_DEFS,
  SETTING_KEYS,
  STAGE2_SETTING_KEYS,
  normalizeSettingKey,
  isKnownSettingKey,
  getKeyDef,
  validateSettingValue,
  toValueJson,
  fromValueJson,
};
