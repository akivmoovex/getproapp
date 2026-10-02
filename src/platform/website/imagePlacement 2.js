"use strict";

/**
 * Shared WE01 IMAGE placement metadata (field-scoped, non-destructive).
 *
 * Persisted IMAGE value (existing contract + optional placement):
 * {
 *   mediaId: string|null,
 *   src: string|null,
 *   alt: string|null,
 *   placement?: {
 *     v: 1,
 *     fit?: "cover"|"contain",   // default cover
 *     x?: number,                // focal X % 0..100, default 50
 *     y?: number,                // focal Y % 0..100, default 50
 *     zoom?: number,             // 1..3, default 1 (CSS scale; original CDN unchanged)
 *     mobile?: { fit?, x?, y?, zoom? }  // optional; only when slot allows separate framing
 *   }
 * }
 *
 * Legacy string URLs and image objects without placement remain valid.
 * Client must not supply aspect ratios or slot dimensions — those come from
 * IMAGE_SLOT_REGISTRY (server-authorized) at render time.
 */

const PLACEMENT_VERSION = 1;
const FIT_VALUES = new Set(["cover", "contain"]);
const ZOOM_MIN = 1;
const ZOOM_MAX = 3;
const FOCAL_MIN = 0;
const FOCAL_MAX = 100;

/**
 * Server-authorized image-slot hints. Not client-writable.
 * aspect* are CSS aspect-ratio hints only when the renderer opts in.
 * Unknown keys get safe defaults (no assumed 16:9 / 9:16).
 */
const IMAGE_SLOT_REGISTRY = Object.freeze({
  "home.hero.image": Object.freeze({
    supportsSeparateFraming: true,
    aspectDesktop: null,
    aspectMobile: null,
  }),
  "about.story.image": Object.freeze({
    supportsSeparateFraming: true,
    aspectDesktop: null,
    aspectMobile: null,
  }),
  "home.logo": Object.freeze({
    supportsSeparateFraming: false,
    aspectDesktop: "1 / 1",
    aspectMobile: null,
  }),
  "seo.image": Object.freeze({
    supportsSeparateFraming: false,
    aspectDesktop: null,
    aspectMobile: null,
  }),
});

const DEFAULT_SLOT = Object.freeze({
  supportsSeparateFraming: true,
  aspectDesktop: null,
  aspectMobile: null,
});

function slotDefinition(contentKey) {
  const key = String(contentKey || "").trim().toLowerCase();
  if (key && Object.prototype.hasOwnProperty.call(IMAGE_SLOT_REGISTRY, key)) {
    return IMAGE_SLOT_REGISTRY[key];
  }
  return DEFAULT_SLOT;
}

function clampNumber(raw, min, max, fallback) {
  const n = typeof raw === "number" ? raw : Number(raw);
  if (!Number.isFinite(n)) return fallback;
  if (n < min || n > max) return null;
  return Math.round(n * 1000) / 1000;
}

function normalizeFrame(raw, label) {
  if (raw == null) return { ok: true, value: null };
  if (typeof raw !== "object" || Array.isArray(raw)) {
    return { ok: false, code: "invalid_image_placement", detail: label || "frame" };
  }
  const forbidden = ["aspect", "aspectRatio", "aspect_ratio", "width", "height", "w", "h", "slot"];
  for (const key of forbidden) {
    if (Object.prototype.hasOwnProperty.call(raw, key) && raw[key] != null) {
      return { ok: false, code: "image_placement_slot_override" };
    }
  }
  const out = {};
  if (raw.fit != null) {
    const fit = String(raw.fit).trim().toLowerCase();
    if (!FIT_VALUES.has(fit)) return { ok: false, code: "invalid_image_placement_fit" };
    out.fit = fit;
  }
  if (raw.x != null || raw.focalX != null) {
    const x = clampNumber(raw.x != null ? raw.x : raw.focalX, FOCAL_MIN, FOCAL_MAX, null);
    if (x == null) return { ok: false, code: "invalid_image_placement_focal" };
    out.x = x;
  }
  if (raw.y != null || raw.focalY != null) {
    const y = clampNumber(raw.y != null ? raw.y : raw.focalY, FOCAL_MIN, FOCAL_MAX, null);
    if (y == null) return { ok: false, code: "invalid_image_placement_focal" };
    out.y = y;
  }
  if (raw.zoom != null) {
    const zoom = clampNumber(raw.zoom, ZOOM_MIN, ZOOM_MAX, null);
    if (zoom == null) return { ok: false, code: "invalid_image_placement_zoom" };
    out.zoom = zoom;
  }
  const allowed = new Set(["fit", "x", "y", "zoom", "focalX", "focalY"]);
  for (const key of Object.keys(raw)) {
    if (!allowed.has(key)) {
      return { ok: false, code: "invalid_image_placement", detail: key };
    }
  }
  return { ok: true, value: Object.keys(out).length ? out : null };
}

/**
 * Validate and normalize optional placement. Absent/empty → null (legacy default).
 * @param {unknown} raw
 * @param {{ contentKey?: string|null }} [opts]
 * @returns {{ ok: true, value: object|null } | { ok: false, code: string, detail?: string }}
 */
function validateImagePlacement(raw, opts) {
  if (raw == null || raw === "") return { ok: true, value: null };
  if (typeof raw !== "object" || Array.isArray(raw)) {
    return { ok: false, code: "invalid_image_placement" };
  }
  const forbidden = ["aspect", "aspectRatio", "aspect_ratio", "width", "height", "w", "h", "slot"];
  for (const key of forbidden) {
    if (Object.prototype.hasOwnProperty.call(raw, key) && raw[key] != null) {
      return { ok: false, code: "image_placement_slot_override" };
    }
  }

  const version = raw.v != null ? Number(raw.v) : PLACEMENT_VERSION;
  if (version !== PLACEMENT_VERSION) {
    return { ok: false, code: "unsupported_image_placement_version" };
  }

  const base = normalizeFrame(
    {
      fit: raw.fit,
      x: raw.x != null ? raw.x : raw.focalX,
      y: raw.y != null ? raw.y : raw.focalY,
      zoom: raw.zoom,
    },
    "base"
  );
  if (!base.ok) return base;

  const slot = slotDefinition(opts && opts.contentKey);
  let mobile = null;
  if (raw.mobile != null) {
    if (!slot.supportsSeparateFraming) {
      return { ok: false, code: "image_placement_separate_not_supported" };
    }
    const m = normalizeFrame(raw.mobile, "mobile");
    if (!m.ok) return m;
    mobile = m.value;
  }
  if (raw.desktop != null) {
    // Desktop framing is the base frame; explicit desktop blob is rejected to
    // keep one canonical shape (base + optional mobile).
    return { ok: false, code: "invalid_image_placement", detail: "desktop" };
  }

  const allowedTop = new Set([
    "v",
    "fit",
    "x",
    "y",
    "zoom",
    "focalX",
    "focalY",
    "mobile",
  ]);
  for (const key of Object.keys(raw)) {
    if (!allowedTop.has(key)) {
      return { ok: false, code: "invalid_image_placement", detail: key };
    }
  }

  const value = {
    v: PLACEMENT_VERSION,
    fit: (base.value && base.value.fit) || "cover",
    x: base.value && base.value.x != null ? base.value.x : 50,
    y: base.value && base.value.y != null ? base.value.y : 50,
    zoom: base.value && base.value.zoom != null ? base.value.zoom : 1,
  };
  if (mobile) {
    value.mobile = {
      fit: mobile.fit || value.fit,
      x: mobile.x != null ? mobile.x : value.x,
      y: mobile.y != null ? mobile.y : value.y,
      zoom: mobile.zoom != null ? mobile.zoom : value.zoom,
    };
  }
  return { ok: true, value };
}

/**
 * Extract placement from a stored IMAGE value without mutating media refs.
 * @param {unknown} imageValue
 * @returns {object|null}
 */
function placementFromImageValue(imageValue) {
  if (!imageValue || typeof imageValue !== "object" || Array.isArray(imageValue)) return null;
  const checked = validateImagePlacement(imageValue.placement || null);
  return checked.ok ? checked.value : null;
}

/**
 * Build inline style + class for non-destructive CSS framing.
 * @param {unknown} placement
 * @param {{
 *   contentKey?: string|null,
 *   fallbackObjectPosition?: string|null,
 *   fallbackObjectFit?: string|null,
 *   aspect?: string|null,
 * }} [opts]
 * @returns {{ className: string, style: string, hasPlacement: boolean }}
 */
function renderPlacementStyle(placement, opts) {
  const options = opts || {};
  const slot = slotDefinition(options.contentKey);
  const checked = validateImagePlacement(placement, { contentKey: options.contentKey });
  const normalized = checked.ok ? checked.value : null;

  const fallbackPos = String(options.fallbackObjectPosition || "").trim() || "center center";
  const fallbackFit = String(options.fallbackObjectFit || "").trim() || "cover";
  const aspect =
    (typeof options.aspect === "string" && options.aspect.trim()) ||
    slot.aspectDesktop ||
    "";

  if (!normalized) {
    const parts = [`object-fit:${fallbackFit}`, `object-position:${fallbackPos}`];
    if (aspect) parts.push(`aspect-ratio:${aspect}`);
    return { className: "", style: parts.join(";"), hasPlacement: false };
  }

  const parts = [
    `object-fit:${normalized.fit}`,
    `object-position:${normalized.x}% ${normalized.y}%`,
    `--gp-img-fit:${normalized.fit}`,
    `--gp-img-x:${normalized.x}%`,
    `--gp-img-y:${normalized.y}%`,
    `--gp-img-zoom:${normalized.zoom}`,
  ];
  if (normalized.mobile && slot.supportsSeparateFraming) {
    parts.push(`--gp-img-mobile-fit:${normalized.mobile.fit}`);
    parts.push(`--gp-img-mobile-x:${normalized.mobile.x}%`);
    parts.push(`--gp-img-mobile-y:${normalized.mobile.y}%`);
    parts.push(`--gp-img-mobile-zoom:${normalized.mobile.zoom}`);
  }
  if (aspect) parts.push(`aspect-ratio:${aspect}`);
  if (slot.aspectMobile) {
    parts.push(`--gp-img-mobile-aspect:${slot.aspectMobile}`);
  }

  return {
    className: "gp-website-image--placed",
    style: parts.join(";"),
    hasPlacement: true,
  };
}

function objectPositionFromPlacement(placement, fallback) {
  const checked = validateImagePlacement(placement);
  if (!checked.ok || !checked.value) {
    return String(fallback || "center center");
  }
  return `${checked.value.x}% ${checked.value.y}%`;
}

module.exports = {
  PLACEMENT_VERSION,
  IMAGE_SLOT_REGISTRY,
  ZOOM_MIN,
  ZOOM_MAX,
  FOCAL_MIN,
  FOCAL_MAX,
  slotDefinition,
  validateImagePlacement,
  placementFromImageValue,
  renderPlacementStyle,
  objectPositionFromPlacement,
};
