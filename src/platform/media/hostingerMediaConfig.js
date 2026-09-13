"use strict";

/**
 * Hostinger public website media configuration.
 * Bytes live under MEDIA_STORAGE_ROOT; PostgreSQL keeps metadata only for new uploads.
 * Never exposes absolute filesystem paths to clients.
 *
 * Do not silently use <cwd>/media on Hostinger — release trees under hbuilds/versions
 * are ephemeral across redeploys.
 */

const path = require("path");

const PROVIDER_HOSTINGER = "hostinger";
const PROVIDER_DATABASE = "database";

const CODE_ROOT_UNSET = "MEDIA_STORAGE_ROOT_UNSET";
const CODE_ROOT_NOT_PERSISTENT = "MEDIA_STORAGE_ROOT_NOT_PERSISTENT";

const PRODUCT_NAMESPACE = Object.freeze({
  blessboard: "blessboard",
  activeclinic: "activeclinic",
});

const MIME_EXTENSION = Object.freeze({
  "image/jpeg": ".jpg",
  "image/png": ".png",
  "image/webp": ".webp",
  "image/gif": ".gif",
});

/**
 * @param {NodeJS.ProcessEnv} [env]
 * @returns {"testing"|"production"}
 */
function resolveMediaEnvironment(env) {
  const source = env || process.env;
  const raw = String(source.DEPLOYMENT_ENV || source.DATABASE_IDENTITY_ENV || "")
    .trim()
    .toLowerCase();
  if (raw === "production") return "production";
  return "testing";
}

/**
 * True when a filesystem path sits inside a Hostinger release/version tree (or is
 * clearly release-relative under such a cwd).
 * @param {string|null|undefined} absPath
 * @param {string} [cwd]
 * @returns {{ ephemeral: boolean, reason: string|null }}
 */
function classifyMediaStorageRootPersistence(absPath, cwd) {
  if (!absPath) {
    return { ephemeral: false, reason: null };
  }
  const normalized = path.resolve(String(absPath)).replace(/\\/g, "/");
  const cwdNorm = path.resolve(String(cwd || process.cwd())).replace(/\\/g, "/");

  if (normalized.includes("/hbuilds/versions/")) {
    return { ephemeral: true, reason: "hbuilds_versions" };
  }
  if (cwdNorm.includes("/hbuilds/versions/")) {
    const rel = path.relative(cwdNorm, normalized);
    if (rel === "" || (!rel.startsWith("..") && !path.isAbsolute(rel))) {
      return { ephemeral: true, reason: "under_ephemeral_cwd" };
    }
  }
  // Reject bare "media" next to a release nodejs cwd even if resolved outside
  // detection above (relative MEDIA_STORAGE_ROOT=media).
  if (
    cwdNorm.includes("/hbuilds/versions/") &&
    (normalized === path.resolve(cwdNorm, "media").replace(/\\/g, "/") ||
      normalized.endsWith("/nodejs/media"))
  ) {
    return { ephemeral: true, reason: "release_media_dir" };
  }
  return { ephemeral: false, reason: null };
}

/**
 * @param {string|null|undefined} absPath
 * @param {string} [cwd]
 * @returns {boolean}
 */
function isEphemeralMediaStorageRoot(absPath, cwd) {
  return classifyMediaStorageRootPersistence(absPath, cwd).ephemeral === true;
}

/**
 * Throws when root is missing or not durable for Hostinger media writes.
 * @param {string|null|undefined} storageRoot
 * @param {string} [cwd]
 */
function assertMediaStorageRootPersistent(storageRoot, cwd) {
  if (!storageRoot) {
    const err = new Error("media_storage_root_unset");
    err.code = CODE_ROOT_UNSET;
    throw err;
  }
  const verdict = classifyMediaStorageRootPersistence(storageRoot, cwd);
  if (verdict.ephemeral) {
    const err = new Error("media_storage_root_not_persistent");
    err.code = CODE_ROOT_NOT_PERSISTENT;
    err.reason = verdict.reason;
    throw err;
  }
}

/**
 * @param {NodeJS.ProcessEnv} [env]
 * @returns {{
 *   enabled: boolean,
 *   provider: string,
 *   environment: "testing"|"production",
 *   storageRoot: string|null,
 *   publicBaseUrl: string|null,
 *   publicMountPath: string,
 *   rejectionCode: string|null,
 *   rejectionReason: string|null,
 * }}
 */
function resolveHostingerMediaConfig(env) {
  const source = env || process.env;
  const configuredRoot = String(source.MEDIA_STORAGE_ROOT || "").trim() || null;
  const disabled = String(source.MEDIA_STORAGE_DISABLE || "") === "1";
  const publicBaseUrl =
    String(source.MEDIA_PUBLIC_BASE_URL || "").trim().replace(/\/+$/, "") || null;
  const publicMountPath = normalizeMountPath(
    String(source.MEDIA_PUBLIC_MOUNT_PATH || "").trim() ||
      deriveMountPath(publicBaseUrl) ||
      "/media"
  );
  const environment = resolveMediaEnvironment(source);

  if (disabled || !configuredRoot) {
    return {
      enabled: false,
      provider: PROVIDER_DATABASE,
      environment,
      storageRoot: null,
      publicBaseUrl,
      publicMountPath,
      rejectionCode: disabled ? null : configuredRoot ? null : CODE_ROOT_UNSET,
      rejectionReason: null,
    };
  }

  const storageRoot = path.resolve(configuredRoot);
  const verdict = classifyMediaStorageRootPersistence(storageRoot, process.cwd());
  if (verdict.ephemeral) {
    return {
      enabled: false,
      provider: PROVIDER_DATABASE,
      environment,
      storageRoot,
      publicBaseUrl,
      publicMountPath,
      rejectionCode: CODE_ROOT_NOT_PERSISTENT,
      rejectionReason: verdict.reason,
    };
  }

  return {
    enabled: true,
    provider: PROVIDER_HOSTINGER,
    environment,
    storageRoot,
    publicBaseUrl,
    publicMountPath,
    rejectionCode: null,
    rejectionReason: null,
  };
}

/**
 * @param {string|null|undefined} baseUrl
 * @returns {string|null}
 */
function deriveMountPath(baseUrl) {
  if (!baseUrl) return null;
  try {
    if (baseUrl.startsWith("/")) return normalizeMountPath(baseUrl);
    const u = new URL(baseUrl);
    return normalizeMountPath(u.pathname || "/media");
  } catch {
    return null;
  }
}

/**
 * @param {string} mount
 * @returns {string}
 */
function normalizeMountPath(mount) {
  let p = String(mount || "/media").trim() || "/media";
  if (!p.startsWith("/")) p = `/${p}`;
  p = p.replace(/\/+$/, "") || "/media";
  return p;
}

/**
 * @param {string} productCode
 * @returns {string|null}
 */
function productNamespace(productCode) {
  const key = String(productCode || "")
    .trim()
    .toLowerCase();
  return PRODUCT_NAMESPACE[key] || null;
}

/**
 * @param {string} mimeType
 * @returns {string}
 */
function extensionForMime(mimeType) {
  const mime = String(mimeType || "")
    .trim()
    .toLowerCase();
  return MIME_EXTENSION[mime] || ".bin";
}

/**
 * Immutable Hostinger object key. Never uses user filenames.
 * @param {{
 *   environment: string,
 *   productCode: string,
 *   organizationId: string,
 *   mediaId: string,
 *   mimeType: string,
 * }} input
 * @returns {string}
 */
function buildHostingerStorageKey(input) {
  const environment = String((input && input.environment) || "")
    .trim()
    .toLowerCase();
  const product = productNamespace(input && input.productCode);
  const organizationId = String((input && input.organizationId) || "")
    .trim()
    .toLowerCase();
  const mediaId = String((input && input.mediaId) || "")
    .trim()
    .toLowerCase();
  if (environment !== "testing" && environment !== "production") {
    const err = new Error("invalid_media_environment");
    err.code = "INVALID_MEDIA_ENVIRONMENT";
    throw err;
  }
  if (!product) {
    const err = new Error("invalid_media_product");
    err.code = "INVALID_MEDIA_PRODUCT";
    throw err;
  }
  if (!/^[0-9a-f-]{36}$/i.test(organizationId)) {
    const err = new Error("invalid_organization_id");
    err.code = "INVALID_ORGANIZATION_ID";
    throw err;
  }
  if (!/^[0-9a-f-]{36}$/i.test(mediaId)) {
    const err = new Error("invalid_media_id");
    err.code = "INVALID_MEDIA_ID";
    throw err;
  }
  const ext = extensionForMime(input && input.mimeType);
  return `${environment}/${product}/${organizationId}/${mediaId}${ext}`;
}

/**
 * Testing runtimes must never write under production/.
 * @param {string} runtimeEnvironment
 * @param {string} storageKey
 */
function assertStorageKeyWritable(runtimeEnvironment, storageKey) {
  const key = String(storageKey || "").replace(/^\/+/, "");
  const runtime = String(runtimeEnvironment || "")
    .trim()
    .toLowerCase();
  if (runtime === "testing" && (key === "production" || key.startsWith("production/"))) {
    const err = new Error("refused_production_media_namespace");
    err.code = "REFUSED_PRODUCTION_MEDIA_NAMESPACE";
    throw err;
  }
  if (runtime !== "testing" && runtime !== "production") {
    const err = new Error("invalid_media_environment");
    err.code = "INVALID_MEDIA_ENVIRONMENT";
    throw err;
  }
  if (!key.startsWith(`${runtime}/`)) {
    const err = new Error("media_environment_mismatch");
    err.code = "MEDIA_ENVIRONMENT_MISMATCH";
    throw err;
  }
  if (key.includes("..") || key.includes("\\") || key.startsWith("/") || path.isAbsolute(key)) {
    const err = new Error("unsafe_storage_key");
    err.code = "UNSAFE_STORAGE_KEY";
    throw err;
  }
  const parts = key.split("/");
  if (parts.length !== 4) {
    const err = new Error("unsafe_storage_key");
    err.code = "UNSAFE_STORAGE_KEY";
    throw err;
  }
}

/**
 * @param {string} storageKey
 * @param {{ publicBaseUrl?: string|null, publicMountPath?: string }} [cfg]
 * @returns {string|null}
 */
function buildPublicMediaUrl(storageKey, cfg) {
  const key = String(storageKey || "").replace(/^\/+/, "");
  if (!key) return null;
  const base = cfg && cfg.publicBaseUrl ? String(cfg.publicBaseUrl).replace(/\/+$/, "") : "";
  if (base) return `${base}/${key}`;
  const mount = normalizeMountPath((cfg && cfg.publicMountPath) || "/media");
  return `${mount}/${key}`;
}

module.exports = {
  PROVIDER_HOSTINGER,
  PROVIDER_DATABASE,
  PRODUCT_NAMESPACE,
  MIME_EXTENSION,
  CODE_ROOT_UNSET,
  CODE_ROOT_NOT_PERSISTENT,
  resolveMediaEnvironment,
  resolveHostingerMediaConfig,
  classifyMediaStorageRootPersistence,
  isEphemeralMediaStorageRoot,
  assertMediaStorageRootPersistent,
  productNamespace,
  extensionForMime,
  buildHostingerStorageKey,
  assertStorageKeyWritable,
  buildPublicMediaUrl,
  normalizeMountPath,
};
