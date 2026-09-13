"use strict";

/**
 * Hostinger public website media configuration.
 * Bytes live under MEDIA_STORAGE_ROOT; PostgreSQL keeps metadata only for new uploads.
 * Never exposes absolute filesystem paths to clients.
 */

const path = require("path");

const PROVIDER_HOSTINGER = "hostinger";
const PROVIDER_DATABASE = "database";

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
 * @param {NodeJS.ProcessEnv} [env]
 * @returns {{
 *   enabled: boolean,
 *   provider: string,
 *   environment: "testing"|"production",
 *   storageRoot: string|null,
 *   publicBaseUrl: string|null,
 *   publicMountPath: string,
 * }}
 */
function resolveHostingerMediaConfig(env) {
  const source = env || process.env;
  const configuredRoot = String(source.MEDIA_STORAGE_ROOT || "").trim() || null;
  const deploymentCode = String(source.PLATFORM_DEPLOYMENT_CODE || "")
    .trim()
    .toLowerCase();
  // On unified Hostinger testing, default to <cwd>/media so uploads leave PG
  // without hard-coding absolute Hostinger home paths in application code.
  const autoTestingRoot =
    !configuredRoot &&
    deploymentCode === "moovex-platform-testing" &&
    String(source.MEDIA_STORAGE_DISABLE || "") !== "1"
      ? path.join(process.cwd(), "media")
      : null;
  const storageRoot = configuredRoot || autoTestingRoot;
  const publicBaseUrl =
    String(source.MEDIA_PUBLIC_BASE_URL || "").trim().replace(/\/+$/, "") || null;
  const publicMountPath = normalizeMountPath(
    String(source.MEDIA_PUBLIC_MOUNT_PATH || "").trim() ||
      deriveMountPath(publicBaseUrl) ||
      "/media"
  );
  const environment = resolveMediaEnvironment(source);
  const enabled = Boolean(storageRoot);
  return {
    enabled,
    provider: enabled ? PROVIDER_HOSTINGER : PROVIDER_DATABASE,
    environment,
    storageRoot: storageRoot ? path.resolve(storageRoot) : null,
    publicBaseUrl,
    publicMountPath,
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
  resolveMediaEnvironment,
  resolveHostingerMediaConfig,
  productNamespace,
  extensionForMime,
  buildHostingerStorageKey,
  assertStorageKeyWritable,
  buildPublicMediaUrl,
  normalizeMountPath,
};
