"use strict";

/**
 * Shared website section content validation (BB + AC).
 * Preserves V7 storage shapes: empty strings become NULL for BB CHECK constraints.
 */

const LIMITS = Object.freeze({
  heading: 200,
  body: 20000,
  bodyAc: 4000,
  mediaUrl: 2000,
  buttonLabel: 60,
  buttonUrl: 500,
  sectionKey: 64,
  title: 80,
});

const CORE_SECTION_KINDS = Object.freeze(["text", "image", "image_text"]);

/**
 * Map product type strings onto a core kind for shared validation rules.
 * @param {string} productCode
 * @param {string} sectionType
 */
function resolveCoreSectionKind(productCode, sectionType) {
  const type = String(sectionType || "").trim().toLowerCase();
  const product = String(productCode || "").trim().toLowerCase();
  if (type === "plain_text" || type === "text" || type === "cta") return "text";
  if (type === "image") return "image";
  if (type === "image_text") return "image_text";
  if (product === "blessboard" && type === "story") return "image_text";
  return type || "text";
}

/**
 * @param {unknown} value
 * @param {number} max
 * @returns {{ ok: true, value: string|null } | { ok: false, code: string, error: string }}
 */
function normalizeOptionalText(value, max) {
  if (value == null) return { ok: true, value: null };
  const raw = String(value);
  if (!raw.trim()) return { ok: true, value: null };
  if (raw.trim().length > max) {
    return {
      ok: false,
      code: "content_too_long",
      error: `Text must be at most ${max} characters.`,
    };
  }
  return { ok: true, value: raw.trim() };
}

/**
 * @param {unknown} value
 * @param {number} max
 */
function normalizeOptionalUrl(value, max) {
  if (value == null) return { ok: true, value: null };
  const raw = String(value).trim();
  if (!raw) return { ok: true, value: null };
  if (raw.length > max) {
    return {
      ok: false,
      code: "url_too_long",
      error: `URL must be at most ${max} characters.`,
    };
  }
  if (/[\s<>"]/.test(raw)) {
    return { ok: false, code: "invalid_url", error: "URL contains invalid characters." };
  }
  return { ok: true, value: raw };
}

/**
 * Validate and normalize section content for draft persistence.
 * @param {{
 *   productCode?: string,
 *   sectionType?: string,
 *   heading?: unknown,
 *   bodyText?: unknown,
 *   body?: unknown,
 *   mediaUrl?: unknown,
 *   image?: unknown,
 *   buttonLabel?: unknown,
 *   buttonUrl?: unknown,
 *   title?: unknown,
 * }} input
 */
function validateSectionContent(input) {
  const src = input && typeof input === "object" ? input : {};
  const productCode = String(src.productCode || "").trim().toLowerCase();
  const sectionType = String(src.sectionType || src.type || "text").trim();
  const kind = resolveCoreSectionKind(productCode, sectionType);
  const bodyMax = productCode === "activeclinic" ? LIMITS.bodyAc : LIMITS.body;

  const heading = normalizeOptionalText(src.heading, LIMITS.heading);
  if (!heading.ok) return heading;
  const body = normalizeOptionalText(
    src.bodyText != null ? src.bodyText : src.body,
    bodyMax
  );
  if (!body.ok) return body;
  const title = normalizeOptionalText(src.title, LIMITS.title);
  if (!title.ok) return title;
  const buttonLabel = normalizeOptionalText(src.buttonLabel, LIMITS.buttonLabel);
  if (!buttonLabel.ok) return buttonLabel;
  const buttonUrl = normalizeOptionalUrl(src.buttonUrl, LIMITS.buttonUrl);
  if (!buttonUrl.ok) return buttonUrl;

  let mediaUrl = null;
  if (src.mediaUrl != null) {
    const media = normalizeOptionalUrl(src.mediaUrl, LIMITS.mediaUrl);
    if (!media.ok) return media;
    mediaUrl = media.value;
  } else if (src.image && typeof src.image === "object" && src.image.url) {
    const media = normalizeOptionalUrl(src.image.url, LIMITS.mediaUrl);
    if (!media.ok) return media;
    mediaUrl = media.value;
  }

  if (kind === "image" && !mediaUrl && src.image == null) {
    // Allow draft create without image; editor can attach later.
  }
  if (kind === "text" && !heading.value) {
    // BB CHECK requires heading length ≥1 when not null; default on add.
  }

  return {
    ok: true,
    code: "ok",
    kind,
    sectionType,
    payload: {
      heading: heading.value,
      bodyText: body.value,
      body: body.value,
      mediaUrl,
      image:
        src.image && typeof src.image === "object"
          ? src.image
          : mediaUrl
            ? { url: mediaUrl }
            : null,
      buttonLabel: buttonLabel.value,
      buttonUrl: buttonUrl.value,
      title: title.value,
    },
  };
}

/**
 * Reject clearly malformed reorder payloads.
 * @param {unknown} order
 */
function validateSectionOrder(order) {
  if (!Array.isArray(order)) {
    return { ok: false, code: "invalid_order", error: "Order must be a list of section ids." };
  }
  const keys = order.map((x) => String(x || "").trim()).filter(Boolean);
  if (!keys.length) {
    return { ok: false, code: "invalid_order", error: "Order list cannot be empty." };
  }
  if (new Set(keys).size !== keys.length) {
    return { ok: false, code: "invalid_order", error: "Order list cannot repeat sections." };
  }
  return { ok: true, order: keys };
}

module.exports = {
  LIMITS,
  CORE_SECTION_KINDS,
  resolveCoreSectionKind,
  normalizeOptionalText,
  normalizeOptionalUrl,
  validateSectionContent,
  validateSectionOrder,
};
