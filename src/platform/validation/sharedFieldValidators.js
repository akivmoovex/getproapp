"use strict";

/**
 * Shared field validators for BlessBoard + ActiveClinic (V8).
 * Product business rules stay in product services; this module owns reusable
 * identity / text / URL / media / required-field checks.
 *
 * V7 compatibility: regexes and length bounds match existing website contentTypes
 * and registration password policy. Callers may keep product-specific codes.
 */

const { safeExternalUrl } = require("../website/safeValues");
const {
  validatePasswordPolicy,
  validatePasswordPair,
  POLICY_RESULT,
} = require("../auth/sharedPasswordPolicy");

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_RE = /^\+?[0-9][0-9\s().-]{6,31}$/;
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const UNSAFE_SCHEME_RE = /^(javascript|data|vbscript):/i;
const SCRIPT_RE = /<\s*script\b/i;

const VALIDATION_CODE = Object.freeze({
  OK: "ok",
  REQUIRED: "required",
  INVALID_EMAIL: "invalid_email",
  INVALID_PHONE: "invalid_phone",
  INVALID_URL: "invalid_url",
  INVALID_UUID: "invalid_uuid",
  INVALID_TEXT: "invalid_text",
  TEXT_TOO_LONG: "text_too_long",
  TEXT_TOO_SHORT: "text_too_short",
  UNSAFE_CONTENT: "unsafe_content",
  UNSAFE_MEDIA_TYPE: "unsafe_media_type",
  MEDIA_TOO_LARGE: "media_too_large",
  INVALID_INPUT: "invalid_input",
  WEAK_PASSWORD: POLICY_RESULT.WEAK_PASSWORD,
  PASSWORD_MISMATCH: POLICY_RESULT.MISMATCH,
});

const MEDIA_LIMITS = Object.freeze({
  maxBytes: 5 * 1024 * 1024,
  allowedImageMime: Object.freeze(["image/jpeg", "image/png", "image/webp", "image/gif"]),
});

const ALLOWED_IMAGE_MIME = new Set(MEDIA_LIMITS.allowedImageMime);
const REJECTED_MIME =
  /^(application\/x-msdownload|application\/x-executable|application\/x-sh|text\/html|image\/svg\+xml)/i;

/**
 * @param {unknown} value
 * @returns {string}
 */
function asTrimmedString(value) {
  if (value == null) return "";
  return String(value).trim();
}

/**
 * @param {unknown} value
 * @param {{ field?: string, label?: string }} [opts]
 */
function validateRequired(value, opts) {
  const field = (opts && opts.field) || "field";
  const label = (opts && opts.label) || field;
  const text = asTrimmedString(value);
  if (!text) {
    return {
      ok: false,
      code: VALIDATION_CODE.REQUIRED,
      field,
      error: `${label} is required.`,
      value: null,
    };
  }
  return { ok: true, code: VALIDATION_CODE.OK, field, value: text };
}

/**
 * @param {unknown} value
 * @param {{ field?: string, required?: boolean, maxLen?: number }} [opts]
 */
function validateEmail(value, opts) {
  const field = (opts && opts.field) || "email";
  const required = opts && opts.required === true;
  const maxLen = Number.isFinite(Number(opts && opts.maxLen)) ? Number(opts.maxLen) : 254;
  const text = asTrimmedString(value).toLowerCase();
  if (!text) {
    if (required) {
      return {
        ok: false,
        code: VALIDATION_CODE.REQUIRED,
        field,
        error: "Email is required.",
        value: null,
      };
    }
    return { ok: true, code: VALIDATION_CODE.OK, field, value: null };
  }
  if (text.length > maxLen || !EMAIL_RE.test(text)) {
    return {
      ok: false,
      code: VALIDATION_CODE.INVALID_EMAIL,
      field,
      error: "Enter a valid email address.",
      value: null,
    };
  }
  return { ok: true, code: VALIDATION_CODE.OK, field, value: text };
}

/**
 * Lightweight phone shape check (website content / simple forms).
 * Full E.164 normalization stays in phoneNumberService for login/registration.
 * @param {unknown} value
 * @param {{ field?: string, required?: boolean, maxLen?: number }} [opts]
 */
function validatePhone(value, opts) {
  const field = (opts && opts.field) || "phone";
  const required = opts && opts.required === true;
  const maxLen = Number.isFinite(Number(opts && opts.maxLen)) ? Number(opts.maxLen) : 40;
  const text = asTrimmedString(value);
  if (!text) {
    if (required) {
      return {
        ok: false,
        code: VALIDATION_CODE.REQUIRED,
        field,
        error: "Phone number is required.",
        value: null,
      };
    }
    return { ok: true, code: VALIDATION_CODE.OK, field, value: null };
  }
  if (!PHONE_RE.test(text) || text.length > maxLen) {
    return {
      ok: false,
      code: VALIDATION_CODE.INVALID_PHONE,
      field,
      error: "Enter a valid phone number.",
      value: null,
    };
  }
  return { ok: true, code: VALIDATION_CODE.OK, field, value: text };
}

/**
 * @param {unknown} value
 * @param {{ field?: string, required?: boolean, maxLen?: number, minLen?: number, allowEmpty?: boolean, stripHtmlRisk?: boolean }} [opts]
 */
function validateText(value, opts) {
  const field = (opts && opts.field) || "text";
  const required = opts && opts.required === true;
  const maxLen = Number.isFinite(Number(opts && opts.maxLen)) ? Number(opts.maxLen) : 2000;
  const minLen = Number.isFinite(Number(opts && opts.minLen)) ? Number(opts.minLen) : 0;
  const stripHtmlRisk = !opts || opts.stripHtmlRisk !== false;
  const text = asTrimmedString(value);
  if (!text) {
    if (required) {
      return {
        ok: false,
        code: VALIDATION_CODE.REQUIRED,
        field,
        error: "This field is required.",
        value: null,
      };
    }
    return { ok: true, code: VALIDATION_CODE.OK, field, value: null };
  }
  if (stripHtmlRisk && (SCRIPT_RE.test(text) || UNSAFE_SCHEME_RE.test(text))) {
    return {
      ok: false,
      code: VALIDATION_CODE.UNSAFE_CONTENT,
      field,
      error: "This text contains unsafe content.",
      value: null,
    };
  }
  if (text.length < minLen) {
    return {
      ok: false,
      code: VALIDATION_CODE.TEXT_TOO_SHORT,
      field,
      error: `Enter at least ${minLen} characters.`,
      value: null,
    };
  }
  if (text.length > maxLen) {
    return {
      ok: false,
      code: VALIDATION_CODE.TEXT_TOO_LONG,
      field,
      error: `Text must be at most ${maxLen} characters.`,
      value: null,
    };
  }
  return { ok: true, code: VALIDATION_CODE.OK, field, value: text };
}

/**
 * @param {unknown} value
 * @param {{ field?: string, required?: boolean, allowRelative?: boolean }} [opts]
 */
function validateUrl(value, opts) {
  const field = (opts && opts.field) || "url";
  const required = opts && opts.required === true;
  const allowRelative = !opts || opts.allowRelative !== false;
  const raw = asTrimmedString(value);
  if (!raw) {
    if (required) {
      return {
        ok: false,
        code: VALIDATION_CODE.REQUIRED,
        field,
        error: "URL is required.",
        value: null,
      };
    }
    return { ok: true, code: VALIDATION_CODE.OK, field, value: null };
  }
  const safe = safeExternalUrl(raw);
  if (!safe) {
    return {
      ok: false,
      code: VALIDATION_CODE.INVALID_URL,
      field,
      error: "Enter a valid URL.",
      value: null,
    };
  }
  if (!allowRelative && safe.startsWith("/")) {
    return {
      ok: false,
      code: VALIDATION_CODE.INVALID_URL,
      field,
      error: "Enter an absolute https URL.",
      value: null,
    };
  }
  return { ok: true, code: VALIDATION_CODE.OK, field, value: safe };
}

/**
 * @param {unknown} value
 * @param {{ field?: string, required?: boolean }} [opts]
 */
function validateUuid(value, opts) {
  const field = (opts && opts.field) || "id";
  const required = opts && opts.required === true;
  const text = asTrimmedString(value).toLowerCase();
  if (!text) {
    if (required) {
      return {
        ok: false,
        code: VALIDATION_CODE.REQUIRED,
        field,
        error: "Identifier is required.",
        value: null,
      };
    }
    return { ok: true, code: VALIDATION_CODE.OK, field, value: null };
  }
  if (!UUID_RE.test(text)) {
    return {
      ok: false,
      code: VALIDATION_CODE.INVALID_UUID,
      field,
      error: "Enter a valid identifier.",
      value: null,
    };
  }
  return { ok: true, code: VALIDATION_CODE.OK, field, value: text };
}

/**
 * @param {{ mimeType?: unknown, sizeBytes?: unknown, buffer?: Buffer|null }} input
 * @param {{ field?: string, maxBytes?: number }} [opts]
 */
function validateImageUpload(input, opts) {
  const field = (opts && opts.field) || "image";
  const maxBytes =
    Number.isFinite(Number(opts && opts.maxBytes)) ? Number(opts.maxBytes) : MEDIA_LIMITS.maxBytes;
  const mime = asTrimmedString(input && input.mimeType).toLowerCase();
  const size =
    Number.isFinite(Number(input && input.sizeBytes))
      ? Number(input.sizeBytes)
      : Buffer.isBuffer(input && input.buffer)
        ? input.buffer.length
        : 0;
  if (!mime || REJECTED_MIME.test(mime) || !ALLOWED_IMAGE_MIME.has(mime)) {
    return {
      ok: false,
      code: VALIDATION_CODE.UNSAFE_MEDIA_TYPE,
      field,
      error: "Use a JPEG, PNG, WebP, or GIF image.",
      value: null,
    };
  }
  if (!size || size > maxBytes) {
    return {
      ok: false,
      code: VALIDATION_CODE.MEDIA_TOO_LARGE,
      field,
      error: "Image must be 5 MB or smaller.",
      value: null,
    };
  }
  return {
    ok: true,
    code: VALIDATION_CODE.OK,
    field,
    value: { mimeType: mime, sizeBytes: size },
  };
}

/**
 * Validate a map of fields. Stops collecting after each field's first error.
 * @param {Record<string, { kind: string, required?: boolean, maxLen?: number, minLen?: number, allowRelative?: boolean, label?: string }>} schema
 * @param {Record<string, unknown>} input
 */
function validateFields(schema, input) {
  const source = input && typeof input === "object" ? input : {};
  const fieldErrors = {};
  const values = {};
  let formError = null;
  for (const [field, rule] of Object.entries(schema || {})) {
    const kind = String((rule && rule.kind) || "text").toLowerCase();
    const opts = { ...(rule || {}), field };
    let result;
    switch (kind) {
      case "email":
        result = validateEmail(source[field], opts);
        break;
      case "phone":
        result = validatePhone(source[field], opts);
        break;
      case "url":
        result = validateUrl(source[field], opts);
        break;
      case "uuid":
      case "id":
        result = validateUuid(source[field], opts);
        break;
      case "password":
        result = validatePasswordPolicy(source[field]);
        if (!result.ok) {
          result = {
            ok: false,
            code: result.code,
            field,
            error: `Password must be at least ${result.bounds.min} characters.`,
            value: null,
          };
        } else {
          result = { ok: true, code: VALIDATION_CODE.OK, field, value: result.value };
        }
        break;
      case "required":
        result = validateRequired(source[field], opts);
        break;
      case "text":
      default:
        result = validateText(source[field], opts);
        break;
    }
    if (!result.ok) {
      fieldErrors[field] = result.error || result.code;
      if (!formError) formError = "Please correct the highlighted fields.";
    } else {
      values[field] = result.value;
    }
  }
  const ok = Object.keys(fieldErrors).length === 0;
  return {
    ok,
    code: ok ? VALIDATION_CODE.OK : VALIDATION_CODE.INVALID_INPUT,
    fieldErrors,
    formError,
    values,
  };
}

module.exports = {
  EMAIL_RE,
  PHONE_RE,
  UUID_RE,
  VALIDATION_CODE,
  MEDIA_LIMITS,
  ALLOWED_IMAGE_MIME,
  validateRequired,
  validateEmail,
  validatePhone,
  validateText,
  validateUrl,
  validateUuid,
  validateImageUpload,
  validateFields,
  validatePasswordPolicy,
  validatePasswordPair,
  asTrimmedString,
};
