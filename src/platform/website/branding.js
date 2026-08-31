"use strict";

/**
 * Shared website branding keys, hex validation, and draft persistence.
 * Product adapters supply productCode; storage is platform.website_content.
 */

const contentService = require("./contentService");
const instanceRepo = require("./instanceRepository");
const { PERMISSIONS, hasWebsitePermission } = require("./permissions");
const { PRODUCT_CODE } = require("./publicWebsiteUrl");

const HEX_COLOR_RE = /^#[0-9A-Fa-f]{6}$/;

const BRANDING_KEYS = Object.freeze([
  "home.logo",
  "brand.primary_color",
  "brand.accent_color",
  "home.hero.image",
]);

const PRODUCT_COLOR_DEFAULTS = Object.freeze({
  [PRODUCT_CODE.ACTIVECLINIC]: Object.freeze({
    primary: "#006068",
    accent: "#0f766e",
  }),
  [PRODUCT_CODE.BLESSBOARD]: Object.freeze({
    primary: "#6c5ce7",
    accent: "#5341cd",
  }),
});

function grantedList(grantedPermissions) {
  return Array.isArray(grantedPermissions) ? grantedPermissions.map(String) : [];
}

function normalizeHexColor(raw) {
  const trimmed = String(raw == null ? "" : raw).trim();
  if (!trimmed) return { ok: true, value: null };
  const withHash = trimmed.startsWith("#") ? trimmed : `#${trimmed}`;
  if (!HEX_COLOR_RE.test(withHash)) return { ok: false, code: "invalid_hex" };
  return { ok: true, value: withHash.toLowerCase() };
}

function pickHexColor(values, key) {
  const raw = values && Object.prototype.hasOwnProperty.call(values, key) ? values[key] : null;
  const text = String(raw || "").trim();
  return HEX_COLOR_RE.test(text) ? text.toLowerCase() : null;
}

function imageValueFromParts(src, alt, mediaId) {
  const nextSrc = String(src || "").trim();
  const nextId = String(mediaId || "").trim();
  const nextAlt = String(alt || "").trim();
  if (!nextSrc && !nextId) return null;
  return { src: nextSrc || null, alt: nextAlt || null, mediaId: nextId || null };
}

function imageFromWebsiteValue(value) {
  if (!value) return { src: "", alt: "", mediaId: "" };
  if (typeof value === "string") return { src: value, alt: "", mediaId: "" };
  return {
    src: value.src ? String(value.src) : "",
    alt: value.alt != null ? String(value.alt) : "",
    mediaId: value.mediaId || value.media_id || "",
  };
}

function colorDefaultsForProduct(productCode) {
  const key = String(productCode || "").trim().toLowerCase();
  return PRODUCT_COLOR_DEFAULTS[key] || PRODUCT_COLOR_DEFAULTS[PRODUCT_CODE.BLESSBOARD];
}

/**
 * Inline CSS custom properties for the public shell.
 * Does not override semantic/system colours (error, success, GetPro accent).
 * @param {string} productCode
 * @param {string|null} primary
 * @param {string|null} accent
 * @returns {string}
 */
function publicBrandStyle(productCode, primary, accent) {
  const product = String(productCode || "").trim().toLowerCase();
  const parts = [];
  const safePrimary = pickHexColor({ v: primary }, "v");
  const safeAccent = pickHexColor({ v: accent }, "v");
  if (product === PRODUCT_CODE.ACTIVECLINIC) {
    if (safePrimary) {
      parts.push(`--acp-primary:${safePrimary}`);
      parts.push(`--acp-primary-strong:${safePrimary}`);
    }
    if (safeAccent) parts.push(`--acp-primary-hover:${safeAccent}`);
  } else if (product === PRODUCT_CODE.BLESSBOARD) {
    if (safePrimary) {
      parts.push(`--bb-color-primary:${safePrimary}`);
      parts.push(`--bb-violet:${safePrimary}`);
    }
    if (safeAccent) {
      parts.push(`--bb-color-primary-hover:${safeAccent}`);
      parts.push(`--bb-violet-deep:${safeAccent}`);
    }
  }
  return parts.join(";");
}

async function loadWebsiteBranding(db, input) {
  const organizationId = String((input && input.organizationId) || "").trim();
  const productCode = String((input && (input.productCode || input.product)) || "").trim().toLowerCase();
  if (!organizationId || !productCode) {
    return { ok: false, code: "invalid_input", values: {}, instance: null };
  }
  const instance =
    (input && input.instance) ||
    (await instanceRepo.findWebsiteInstanceByOrgProduct(db, { organizationId, productCode }));
  if (!instance || instance.organizationId !== organizationId) {
    return { ok: false, code: "website_instance_not_found", values: {}, instance: null };
  }
  const keys = Array.isArray(input.keys) && input.keys.length ? input.keys : BRANDING_KEYS;
  const rows = await Promise.all(
    keys.map((key) => contentService.getWebsiteContentRow(db, instance.id, organizationId, key))
  );
  const values = {};
  keys.forEach((key, index) => {
    const row = rows[index];
    values[key] = row ? row.draftValue : null;
  });
  const published = {};
  keys.forEach((key, index) => {
    const row = rows[index];
    published[key] = row ? row.publishedValue : null;
  });
  return { ok: true, instance, values, published };
}

async function saveWebsiteBranding(db, input) {
  const granted = grantedList(input && input.grantedPermissions);
  if (!hasWebsitePermission(granted, PERMISSIONS.EDIT)) {
    return { ok: false, code: "forbidden" };
  }
  const organizationId = String((input && input.organizationId) || "").trim();
  const productCode = String((input && (input.productCode || input.product)) || "").trim().toLowerCase();
  if (!organizationId || !productCode) {
    return { ok: false, code: "invalid_input" };
  }
  const instance =
    (input && input.instance) ||
    (await instanceRepo.findWebsiteInstanceByOrgProduct(db, { organizationId, productCode }));
  if (!instance || instance.organizationId !== organizationId) {
    return { ok: false, code: "website_instance_not_found" };
  }
  const entries = Array.isArray(input.entries) ? input.entries : [];
  for (let i = 0; i < entries.length; i += 1) {
    const entry = entries[i];
    if (!entry || !entry.key) continue;
    const saved = await contentService.saveWebsiteDraft(db, {
      organizationId,
      instanceId: instance.id,
      expectedProductCode: productCode,
      contentKey: entry.key,
      value: entry.value,
      actorIdentityId: input.actorIdentityId || null,
      grantedPermissions: granted,
    });
    if (!saved.ok) return saved;
  }
  return { ok: true, instance };
}

module.exports = {
  HEX_COLOR_RE,
  BRANDING_KEYS,
  PRODUCT_COLOR_DEFAULTS,
  normalizeHexColor,
  pickHexColor,
  imageValueFromParts,
  imageFromWebsiteValue,
  colorDefaultsForProduct,
  publicBrandStyle,
  loadWebsiteBranding,
  saveWebsiteBranding,
};
