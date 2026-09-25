"use strict";

/**
 * Shared CDN presentation for BlessBoard + ActiveClinic website images.
 *
 * Upload → Hostinger object (storage_key) → DB metadata → presentCdnUrl(storage_key).
 * Renderers must emit absolute https CDN URLs only — never relative /media/,
 * /church/images/, /activeclinic/assets/, or data:image.
 */

const path = require("path");
const {
  resolveHostingerMediaConfig,
  resolveMediaEnvironment,
  buildPublicMediaUrl,
  normalizeMountPath,
} = require("./hostingerMediaConfig");
const {
  storageKeyForPublicPath,
  isPlatformMarketingPublicPath,
} = require("./platformMarketingAssets");

const FORBIDDEN_PREFIXES = Object.freeze([
  "/church/images/",
  "/activeclinic/assets/",
  "/media/",
]);

const APP_MEDIA_PATH_RE =
  /^\/(c|clinics)\/([^/]+)\/website\/media\/([0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})$/i;
const BB_CLASSIC_MEDIA_RE =
  /^\/_bb\/media\/([0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})$/i;
const MEDIA_KEY_RE =
  /^(?:https?:\/\/[^/]+)?\/media\/((?:testing(?:-v8)?|production)\/[A-Za-z0-9._/-]+)$/i;
const ABSOLUTE_MEDIA_KEY_RE =
  /^https:\/\/[^/]+\/media\/((?:testing(?:-v8)?|production)\/[A-Za-z0-9._/-]+)$/i;

/**
 * Absolute CDN public base (e.g. https://blessboard.pronline.org/media).
 * Relative `/media` alone is not a valid presentation base — derive an absolute
 * origin from MEDIA_CDN_ORIGIN or the deployment line fallback.
 * @param {NodeJS.ProcessEnv} [env]
 * @returns {string|null}
 */
const V7_TESTING_CDN_PUBLIC_BASE_FALLBACK = "https://blessboard.pronline.org/media";
const V8_TESTING_CDN_PUBLIC_BASE_FALLBACK =
  "https://blessboard.neuniversity.org/media";
/** @deprecated Prefer line-aware fallbacks; kept for older call sites. */
const TESTING_CDN_PUBLIC_BASE_FALLBACK = V7_TESTING_CDN_PUBLIC_BASE_FALLBACK;

/**
 * @param {NodeJS.ProcessEnv} source
 * @returns {string|null}
 */
function resolveTestingCdnFallbackBase(source) {
  const deploymentEnv = String(source.DEPLOYMENT_ENV || "").trim().toLowerCase();
  const deploymentCode = String(source.PLATFORM_DEPLOYMENT_CODE || "").trim();
  if (deploymentEnv !== "testing") return null;
  if (deploymentCode === "moovex-platform-v8-testing") {
    return V8_TESTING_CDN_PUBLIC_BASE_FALLBACK;
  }
  if (deploymentCode === "moovex-platform-testing") {
    return V7_TESTING_CDN_PUBLIC_BASE_FALLBACK;
  }
  return null;
}

function resolveCdnPublicBaseUrl(env) {
  const source = env || process.env;
  const raw = String(source.MEDIA_PUBLIC_BASE_URL || "").trim().replace(/\/+$/, "");
  const origin = String(source.MEDIA_CDN_ORIGIN || "").trim().replace(/\/+$/, "");
  if (/^https:\/\//i.test(raw)) return raw;
  if (/^https:\/\//i.test(origin)) {
    const mount = normalizeMountPath(
      (raw && raw.startsWith("/") ? raw : null) ||
        String(source.MEDIA_PUBLIC_MOUNT_PATH || "").trim() ||
        "/media"
    );
    return `${origin}${mount}`;
  }
  // Hostinger often sets MEDIA_PUBLIC_BASE_URL=/media (relative mount). Derive an
  // absolute https base so HTML never emits relative /media/ or the wrong line host.
  const fallback = resolveTestingCdnFallbackBase(source);
  if (fallback) {
    if (raw.startsWith("/")) {
      try {
        const u = new URL(fallback);
        return `${u.origin}${normalizeMountPath(raw)}`;
      } catch {
        return fallback;
      }
    }
    return fallback;
  }
  return null;
}

/**
 * Shared platform marketing soft-fill lives under testing/platform/ (V7 sync).
 * Coerce mistaken testing-v8/platform/ presentation keys so V8 HTML can still
 * resolve existing objects without copying or rewriting DB rows.
 * @param {string} storageKey
 * @returns {string}
 */
function coerceSharedPlatformMarketingReadKey(storageKey) {
  const key = String(storageKey || "").replace(/^\/+/, "");
  if (/^testing-v8\/platform\//i.test(key)) {
    return `testing/${key.slice("testing-v8/".length)}`;
  }
  return key;
}

/**
 * @param {string|null|undefined} storageKey
 * @param {NodeJS.ProcessEnv} [env]
 * @returns {string|null}
 */
function presentCdnUrl(storageKey, env) {
  const key = coerceSharedPlatformMarketingReadKey(
    String(storageKey || "").replace(/^\/+/, "")
  );
  if (!key || key.includes("..") || key.includes("\\")) return null;
  const base = resolveCdnPublicBaseUrl(env);
  if (base) return `${base}/${key}`;
  const cfg = resolveHostingerMediaConfig(env || process.env);
  // Refuse relative /media presentation when no absolute CDN base is configured.
  if (!cfg.publicBaseUrl || !/^https:\/\//i.test(String(cfg.publicBaseUrl))) {
    return null;
  }
  return buildPublicMediaUrl(key, { publicBaseUrl: cfg.publicBaseUrl, publicMountPath: cfg.publicMountPath });
}

/**
 * @param {unknown} src
 * @returns {boolean}
 */
function isForbiddenRuntimeImageSrc(src) {
  const raw = String(src || "").trim();
  if (!raw) return false;
  const lower = raw.toLowerCase();
  if (lower.startsWith("data:image") || lower.startsWith("blob:") || lower.startsWith("javascript:")) {
    return true;
  }
  if (raw.startsWith("/media/") || /^https?:\/\/[^/]+\/media\//i.test(raw)) {
    // Absolute https CDN URLs that include /media/ path are allowed only when
    // they match the configured CDN base; relative /media is always forbidden.
    if (raw.startsWith("/media/")) return true;
  }
  for (const prefix of FORBIDDEN_PREFIXES) {
    if (prefix === "/media/") continue;
    if (raw.startsWith(prefix)) return true;
  }
  return false;
}

/**
 * Extract Hostinger storage key from a legacy /media or absolute /media URL.
 * @param {unknown} src
 * @returns {string|null}
 */
function storageKeyFromLegacyMediaSrc(src) {
  const raw = String(src || "").trim();
  if (!raw) return null;
  const abs = raw.match(ABSOLUTE_MEDIA_KEY_RE);
  if (abs) return abs[1];
  const rel = raw.match(MEDIA_KEY_RE);
  if (rel) return rel[1];
  if (raw.startsWith("/media/")) {
    const key = raw.slice("/media/".length).replace(/^\/+/, "");
    if (/^(testing(?:-v8)?|production)\//.test(key) && !key.includes("..")) return key;
  }
  return null;
}

/**
 * @param {unknown} src
 * @returns {{ kind: 'app'|'bb_classic'|null, mediaId: string|null, slug: string|null, prefix: string|null }}
 */
function parseAppMediatedMediaSrc(src) {
  const raw = String(src || "").trim();
  const app = raw.match(APP_MEDIA_PATH_RE);
  if (app) {
    return {
      kind: "app",
      prefix: app[1].toLowerCase(),
      slug: app[2],
      mediaId: app[3].toLowerCase(),
    };
  }
  const classic = raw.match(BB_CLASSIC_MEDIA_RE);
  if (classic) {
    return { kind: "bb_classic", prefix: null, slug: null, mediaId: classic[1].toLowerCase() };
  }
  return { kind: null, mediaId: null, slug: null, prefix: null };
}

/**
 * Present a runtime image src for HTML/JSON renderers.
 * Compatibility: rewrites /media/{key} and absolute …/media/{key} to the CDN base.
 * Maps known platform marketing public paths to CDN keys.
 * Drops forbidden tenant local fallbacks and data: URLs.
 *
 * @param {unknown} src
 * @param {NodeJS.ProcessEnv} [env]
 * @param {{ allowMarketing?: boolean }} [opts]
 * @returns {string|null}
 */
function presentRuntimeImageSrc(src, env, opts) {
  const raw = String(src == null ? "" : src).trim();
  if (!raw) return null;
  const lower = raw.toLowerCase();
  if (
    lower.startsWith("data:") ||
    lower.startsWith("blob:") ||
    lower.startsWith("javascript:") ||
    lower.startsWith("vbscript:")
  ) {
    return null;
  }

  const allowMarketing = !opts || opts.allowMarketing !== false;
  const cdnBase = resolveCdnPublicBaseUrl(env);

  // Already on configured CDN base.
  if (cdnBase && (raw === cdnBase || raw.startsWith(`${cdnBase}/`))) {
    return raw;
  }

  const legacyKey = storageKeyFromLegacyMediaSrc(raw);
  if (legacyKey) {
    const presented = presentCdnUrl(legacyKey, env);
    if (presented) return presented;
    // Already-absolute https CDN URLs must survive when MEDIA_PUBLIC_BASE_URL is
    // unset (local suites / soft-fill that already resolved via marketing fallback).
    if (/^https:\/\//i.test(raw)) {
      try {
        const u = new URL(raw);
        if (u.protocol === "https:") return u.toString();
      } catch {
        return null;
      }
    }
    return null;
  }

  if (allowMarketing && isPlatformMarketingPublicPath(raw)) {
    const key = storageKeyForPublicPath(raw, env);
    if (!key) return null;
    const cdn = presentCdnUrl(key, env);
    if (cdn) return cdn;
    // Known platform soft-fill assets always map to the CDN keyspace. When the
    // absolute CDN base is unset (local suites / testing without MEDIA_PUBLIC_BASE_URL),
    // emit the documented testing CDN URL so drafts never persist /church/images paths.
    // Refuse to invent a testing CDN base for production deployments.
    const mediaEnv = resolveMediaEnvironment(env || process.env);
    if (mediaEnv === "production") return null;
    const fallbackBase =
      resolveTestingCdnFallbackBase(env || process.env) ||
      V7_TESTING_CDN_PUBLIC_BASE_FALLBACK;
    return presentCdnUrl(key, {
      ...(env || process.env),
      MEDIA_PUBLIC_BASE_URL: fallbackBase,
    });
  }

  // Tenant local filesystem paths are never presented.
  if (raw.startsWith("/church/images/") || raw.startsWith("/activeclinic/assets/")) {
    return null;
  }

  // Relative /media without a recognizable key — refuse.
  if (raw.startsWith("/media/")) return null;

  // App-mediated delivery paths (/clinics|/c/.../website/media/:id and /_bb/media/:id)
  // are valid product delivery URLs for database-payload / pre-CDN rows. Keep them
  // intact — callers with a storage key should prefer presentCdnUrl / hydrate.
  const mediated = parseAppMediatedMediaSrc(raw);
  if (mediated.kind) return raw;

  // External https URLs (non-legacy) — allow only https.
  if (/^https:\/\//i.test(raw)) {
    try {
      const u = new URL(raw);
      if (u.protocol !== "https:") return null;
      return u.toString();
    } catch {
      return null;
    }
  }

  return null;
}

/**
 * @param {unknown} value image content value ({src,alt,mediaId,placement?} | string | null)
 * @param {NodeJS.ProcessEnv} [env]
 * @param {{ storageKey?: string|null, allowMarketing?: boolean }} [opts]
 * @returns {{ src: string|null, alt: string|null, mediaId: string|null, placement?: object|null }}
 */
function presentImageValue(value, env, opts) {
  const { placementFromImageValue } = require("../website/imagePlacement");
  const options = opts || {};
  if (options.storageKey) {
    const src = presentCdnUrl(options.storageKey, env);
    if (value && typeof value === "object" && !Array.isArray(value)) {
      const out = {
        src,
        alt: value.alt != null ? String(value.alt) : null,
        mediaId: value.mediaId || value.media_id || null,
      };
      const placement = placementFromImageValue(value);
      if (placement) out.placement = placement;
      return out;
    }
    return { src, alt: null, mediaId: null };
  }
  if (value == null) return { src: null, alt: null, mediaId: null };
  if (typeof value === "string") {
    return {
      src: presentRuntimeImageSrc(value, env, options),
      alt: null,
      mediaId: null,
    };
  }
  if (typeof value !== "object" || Array.isArray(value)) {
    return { src: null, alt: null, mediaId: null };
  }
  const mediaId = value.mediaId || value.media_id || null;
  const presented = presentRuntimeImageSrc(value.src, env, options);
  const out = {
    src: presented,
    alt: value.alt != null ? String(value.alt) : null,
    mediaId: mediaId ? String(mediaId) : null,
  };
  const placement = placementFromImageValue(value);
  if (placement) out.placement = placement;
  return out;
}

/**
 * Deep-walk plain objects/arrays and rewrite image-like string fields for render.
 * Only rewrites values that look like image srcs (path or https image URL).
 * @param {unknown} input
 * @param {NodeJS.ProcessEnv} [env]
 * @returns {unknown}
 */
function presentImageTree(input, env, seen) {
  if (input == null) return input;
  if (typeof input === "string") {
    if (
      input.startsWith("/media/") ||
      input.startsWith("/church/images/") ||
      input.startsWith("/activeclinic/assets/") ||
      input.startsWith("/c/") ||
      input.startsWith("/clinics/") ||
      input.startsWith("/_bb/media/") ||
      /^https?:\/\//i.test(input) ||
      /^data:image/i.test(input)
    ) {
      return presentRuntimeImageSrc(input, env);
    }
    return input;
  }
  if (Array.isArray(input)) {
    const visited = seen || new WeakSet();
    return input.map((item) => presentImageTree(item, env, visited));
  }
  if (typeof input === "object") {
    const visited = seen || new WeakSet();
    if (visited.has(input)) return null;
    visited.add(input);
    const out = {};
    for (const [k, v] of Object.entries(input)) {
      if (
        v &&
        typeof v === "object" &&
        !Array.isArray(v) &&
        ("src" in v || "mediaId" in v || "media_id" in v)
      ) {
        out[k] = presentImageValue(v, env);
      } else if (
        typeof v === "string" &&
        /(?:src|url|image|logo|photo|thumb|media|hero|avatar|icon)$/i.test(k)
      ) {
        out[k] = presentRuntimeImageSrc(v, env) || null;
      } else {
        out[k] = presentImageTree(v, env, visited);
      }
    }
    return out;
  }
  return input;
}

/**
 * EJS/helper: marketing asset public path → CDN URL (or null).
 * @param {string} publicPath
 * @param {NodeJS.ProcessEnv} [env]
 */
function cdnMarketingAsset(publicPath, env) {
  const key = storageKeyForPublicPath(publicPath, env);
  if (key) {
    const cdn = presentCdnUrl(key, env);
    if (cdn) return cdn;
  }
  // When MEDIA_PUBLIC_BASE_URL is unset, presentRuntimeImageSrc still maps known
  // soft-fill keys to the documented testing CDN base (never /church/images).
  return presentRuntimeImageSrc(publicPath, env, { allowMarketing: true });
}

/**
 * Basename helper for building platform keys (tests / sync).
 * @param {string} publicPath
 */
function marketingPublicBasename(publicPath) {
  return path.posix.basename(String(publicPath || "").replace(/\\/g, "/"));
}

module.exports = {
  FORBIDDEN_PREFIXES,
  resolveCdnPublicBaseUrl,
  presentCdnUrl,
  presentRuntimeImageSrc,
  presentImageValue,
  presentImageTree,
  cdnMarketingAsset,
  isForbiddenRuntimeImageSrc,
  storageKeyFromLegacyMediaSrc,
  parseAppMediatedMediaSrc,
  marketingPublicBasename,
  resolveMediaEnvironment,
  V7_TESTING_CDN_PUBLIC_BASE_FALLBACK,
  V8_TESTING_CDN_PUBLIC_BASE_FALLBACK,
  TESTING_CDN_PUBLIC_BASE_FALLBACK,
};
