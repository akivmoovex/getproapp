"use strict";

/**
 * Shared website content types and validation.
 * Unknown keys are rejected by the template registry, not here.
 */

const { safeExternalUrl } = require("./safeValues");

const CONTENT_TYPES = Object.freeze({
  SHORT_TEXT: "short_text",
  LONG_TEXT: "long_text",
  RICH_TEXT: "rich_text",
  IMAGE: "image",
  VIDEO_URL: "video_url",
  URL: "url",
  EMAIL: "email",
  PHONE: "phone",
  BOOLEAN: "boolean",
  ENUM: "enum",
  STRUCTURED: "structured",
});

const CONTENT_TYPE_SET = new Set(Object.values(CONTENT_TYPES));

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_RE = /^\+?[0-9][0-9\s().-]{6,31}$/;
const KEY_RE = /^[a-z][a-z0-9_.]{0,95}$/;
const UNSAFE_SCHEME_RE = /^(javascript|data|vbscript):/i;
const SCRIPT_RE = /<\s*script\b/i;

function normalizeContentKey(raw) {
  const key = String(raw || "")
    .trim()
    .toLowerCase();
  if (!key || !KEY_RE.test(key)) {
    return { ok: false, code: "invalid_content_key" };
  }
  return { ok: true, key };
}

function wrapValue(value) {
  if (value == null) return null;
  return { v: value };
}

function unwrapValue(stored) {
  if (stored == null) return null;
  if (typeof stored === "object" && !Array.isArray(stored) && Object.prototype.hasOwnProperty.call(stored, "v")) {
    return stored.v;
  }
  return stored;
}

function rejectUnsafeText(text) {
  if (SCRIPT_RE.test(text) || UNSAFE_SCHEME_RE.test(text)) {
    return { ok: false, code: "unsafe_content" };
  }
  return { ok: true };
}

function validateContentValue(def, candidate) {
  if (!def || !CONTENT_TYPE_SET.has(def.type)) {
    return { ok: false, code: "unknown_content_type" };
  }
  if (candidate == null || candidate === "") {
    return { ok: true, value: null };
  }

  switch (def.type) {
    case CONTENT_TYPES.SHORT_TEXT:
    case CONTENT_TYPES.LONG_TEXT:
    case CONTENT_TYPES.RICH_TEXT: {
      const text = String(candidate).trim();
      const unsafe = rejectUnsafeText(text);
      if (!unsafe.ok) return unsafe;
      const max = def.maxLen || (def.type === CONTENT_TYPES.SHORT_TEXT ? 200 : 8000);
      if (text.length > max) return { ok: false, code: "too_long" };
      if (def.type !== CONTENT_TYPES.RICH_TEXT && /<\/?[a-z][\s\S]*>/i.test(text)) {
        return { ok: false, code: "html_not_allowed" };
      }
      return { ok: true, value: text };
    }
    case CONTENT_TYPES.EMAIL: {
      const text = String(candidate).trim().toLowerCase();
      if (text.length > (def.maxLen || 254) || !EMAIL_RE.test(text)) {
        return { ok: false, code: "invalid_email" };
      }
      return { ok: true, value: text };
    }
    case CONTENT_TYPES.PHONE: {
      const text = String(candidate).trim();
      if (!PHONE_RE.test(text) || text.length > (def.maxLen || 40)) {
        return { ok: false, code: "invalid_phone" };
      }
      return { ok: true, value: text };
    }
    case CONTENT_TYPES.URL:
    case CONTENT_TYPES.IMAGE:
    case CONTENT_TYPES.VIDEO_URL: {
      if (typeof candidate === "object" && candidate) {
        const src = candidate.src || candidate.url || candidate.v || "";
        const alt = candidate.alt != null ? String(candidate.alt).trim().slice(0, 240) : "";
        const mediaId = candidate.mediaId || candidate.media_id || null;
        const urlCheck = src
          ? validateContentValue({ ...def, type: CONTENT_TYPES.URL }, src)
          : { ok: true, value: null };
        if (src && !urlCheck.ok) return urlCheck;
        if (alt) {
          const unsafe = rejectUnsafeText(alt);
          if (!unsafe.ok) return unsafe;
        }
        return {
          ok: true,
          value: {
            src: src ? urlCheck.value : null,
            alt: alt || null,
            mediaId: mediaId || null,
          },
        };
      }
      const raw = String(candidate).trim();
      if (UNSAFE_SCHEME_RE.test(raw) || raw.startsWith("//")) {
        return { ok: false, code: "unsafe_url" };
      }
      const safe = safeExternalUrl(raw);
      if (!safe) return { ok: false, code: "invalid_url" };
      if (safe.length > (def.maxLen || 500)) return { ok: false, code: "too_long" };
      if (def.type === CONTENT_TYPES.VIDEO_URL) {
        if (!/^https:\/\//i.test(safe) && !safe.startsWith("/")) {
          return { ok: false, code: "invalid_video_url" };
        }
      }
      if (def.type === CONTENT_TYPES.IMAGE) {
        return { ok: true, value: { src: safe, alt: null, mediaId: null } };
      }
      return { ok: true, value: safe };
    }
    case CONTENT_TYPES.BOOLEAN:
      if (typeof candidate === "boolean") return { ok: true, value: candidate };
      if (candidate === "true" || candidate === "1") return { ok: true, value: true };
      if (candidate === "false" || candidate === "0") return { ok: true, value: false };
      return { ok: false, code: "invalid_boolean" };
    case CONTENT_TYPES.ENUM: {
      const text = String(candidate).trim();
      const allowed = Array.isArray(def.enumValues) ? def.enumValues : [];
      if (!allowed.includes(text)) return { ok: false, code: "invalid_enum" };
      return { ok: true, value: text };
    }
    case CONTENT_TYPES.STRUCTURED: {
      if (!Array.isArray(candidate)) return { ok: false, code: "invalid_structured" };
      const itemSchema = def.itemSchema || {};
      const items = [];
      for (const item of candidate) {
        if (!item || typeof item !== "object") return { ok: false, code: "invalid_structured_item" };
        const out = {};
        for (const [field, fieldDef] of Object.entries(itemSchema)) {
          const inner = validateContentValue(fieldDef, item[field]);
          if (!inner.ok) return inner;
          out[field] = inner.value;
        }
        items.push(out);
      }
      return { ok: true, value: items };
    }
    default:
      return { ok: false, code: "unknown_content_type" };
  }
}

module.exports = {
  CONTENT_TYPES,
  CONTENT_TYPE_SET,
  normalizeContentKey,
  wrapValue,
  unwrapValue,
  validateContentValue,
  rejectUnsafeText,
};
