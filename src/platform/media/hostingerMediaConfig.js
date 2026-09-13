"use strict";

/**
 * Hostinger public website media configuration.
 * Bytes live under MEDIA_STORAGE_ROOT; PostgreSQL keeps metadata only for new uploads.
 * Never exposes absolute filesystem paths to clients.
 *
 * Do not silently use <cwd>/media on Hostinger — release trees under hbuilds/versions
 * are ephemeral across redeploys.
 *
 * Testing-only: when MEDIA_STORAGE_ROOT is unset on moovex-platform-testing, derive
 * path.join(os.homedir(), "moovex-media") after persistence/writability checks.
 * Production never auto-derives a filesystem root.
 */

const fs = require("fs");
const os = require("os");
const path = require("path");

const PROVIDER_HOSTINGER = "hostinger";
const PROVIDER_DATABASE = "database";

const CODE_ROOT_UNSET = "MEDIA_STORAGE_ROOT_UNSET";
const CODE_ROOT_NOT_PERSISTENT = "MEDIA_STORAGE_ROOT_NOT_PERSISTENT";
const CODE_ROOT_NOT_WRITABLE = "MEDIA_STORAGE_ROOT_NOT_WRITABLE";
const CODE_ROOT_OUTSIDE_ACCOUNT_HOME = "MEDIA_STORAGE_ROOT_OUTSIDE_ACCOUNT_HOME";

const MEDIA_ROOT_SOURCE_ENV = "env";
const MEDIA_ROOT_SOURCE_TESTING_FALLBACK = "testing_account_home_fallback";
const MEDIA_ROOT_SOURCE_DISABLED = "disabled";

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
 * @param {string} absPath
 * @param {string} accountHome
 * @returns {boolean}
 */
function isPathUnderAccountHome(absPath, accountHome) {
  if (!absPath || !accountHome) return false;
  const normalized = path.resolve(String(absPath)).replace(/\\/g, "/");
  const home = path.resolve(String(accountHome)).replace(/\\/g, "/");
  return normalized === home || normalized.startsWith(`${home}/`);
}

/**
 * @param {string} absPath
 * @returns {boolean}
 */
function ensureMediaRootWritable(absPath) {
  try {
    fs.mkdirSync(absPath, { recursive: true });
    const probe = path.join(absPath, `.getpro-media-cfg-probe-${process.pid}`);
    fs.writeFileSync(probe, "ok", { encoding: "utf8", flag: "w" });
    fs.unlinkSync(probe);
    return true;
  } catch {
    return false;
  }
}

/**
 * Testing-only fallback root: <account-home>/moovex-media (never hard-codes username).
 * Prefer /home/<user> parsed from cwd when the process runs under a Hostinger domain
 * tree (os.homedir() may be .../domains/<site> rather than the account home).
 * @param {{ homedir?: () => string, cwd?: string }} [opts]
 * @returns {{ accountHome: string|null, storageRoot: string|null }}
 */
function deriveTestingAccountHomeMediaRoot(opts) {
  const options = opts || {};
  const cwd = String(options.cwd || process.cwd()).replace(/\\/g, "/");
  const fromCwd = cwd.match(/^(\/home\/[^/]+)/);
  let accountHome = fromCwd ? fromCwd[1] : null;
  if (!accountHome) {
    const homedirFn = typeof options.homedir === "function" ? options.homedir : () => os.homedir();
    try {
      accountHome = String(homedirFn() || "").trim() || null;
    } catch {
      accountHome = null;
    }
  }
  if (!accountHome) return { accountHome: null, storageRoot: null };
  return {
    accountHome: path.resolve(accountHome),
    storageRoot: path.resolve(accountHome, "moovex-media"),
  };
}

/**
 * @param {string} storageRoot
 * @param {{
 *   cwd?: string,
 *   accountHome?: string|null,
 *   requireUnderAccountHome?: boolean,
 *   ensureWritable?: (absPath: string) => boolean,
 * }} [opts]
 * @returns {{
 *   ok: boolean,
 *   storageRoot: string,
 *   outsideReleaseTree: boolean,
 *   writable: boolean,
 *   rejectionCode: string|null,
 *   rejectionReason: string|null,
 * }}
 */
function validateMediaStorageRoot(storageRoot, opts) {
  const options = opts || {};
  const cwd = options.cwd || process.cwd();
  const abs = path.resolve(String(storageRoot));
  const persistence = classifyMediaStorageRootPersistence(abs, cwd);
  const outsideReleaseTree = !persistence.ephemeral;
  if (!outsideReleaseTree) {
    return {
      ok: false,
      storageRoot: abs,
      outsideReleaseTree: false,
      writable: false,
      rejectionCode: CODE_ROOT_NOT_PERSISTENT,
      rejectionReason: persistence.reason,
    };
  }
  if (options.requireUnderAccountHome) {
    if (!isPathUnderAccountHome(abs, options.accountHome)) {
      return {
        ok: false,
        storageRoot: abs,
        outsideReleaseTree: true,
        writable: false,
        rejectionCode: CODE_ROOT_OUTSIDE_ACCOUNT_HOME,
        rejectionReason: "outside_account_home",
      };
    }
  }
  const writableFn =
    typeof options.ensureWritable === "function" ? options.ensureWritable : ensureMediaRootWritable;
  const writable = writableFn(abs) === true;
  if (!writable) {
    return {
      ok: false,
      storageRoot: abs,
      outsideReleaseTree: true,
      writable: false,
      rejectionCode: CODE_ROOT_NOT_WRITABLE,
      rejectionReason: "not_writable",
    };
  }
  return {
    ok: true,
    storageRoot: abs,
    outsideReleaseTree: true,
    writable: true,
    rejectionCode: null,
    rejectionReason: null,
  };
}

/**
 * @param {NodeJS.ProcessEnv} [env]
 * @param {{
 *   cwd?: string,
 *   homedir?: () => string,
 *   ensureWritable?: (absPath: string) => boolean,
 * }} [opts]
 * @returns {{
 *   enabled: boolean,
 *   provider: string,
 *   environment: "testing"|"production",
 *   storageRoot: string|null,
 *   publicBaseUrl: string|null,
 *   publicMountPath: string,
 *   rejectionCode: string|null,
 *   rejectionReason: string|null,
 *   mediaStorageRootSource: "env"|"testing_account_home_fallback"|"disabled",
 *   mediaStorageRootConfigured: boolean,
 *   outsideReleaseTree: boolean|null,
 *   writable: boolean|null,
 * }}
 */
function resolveHostingerMediaConfig(env, opts) {
  const source = env || process.env;
  const options = opts || {};
  const cwd = options.cwd || process.cwd();
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
  const deploymentCode = String(source.PLATFORM_DEPLOYMENT_CODE || "")
    .trim()
    .toLowerCase();

  const disabledResult = (extra) => ({
    enabled: false,
    provider: PROVIDER_DATABASE,
    environment,
    storageRoot: null,
    publicBaseUrl,
    publicMountPath,
    rejectionCode: null,
    rejectionReason: null,
    mediaStorageRootSource: MEDIA_ROOT_SOURCE_DISABLED,
    mediaStorageRootConfigured: Boolean(configuredRoot),
    outsideReleaseTree: null,
    writable: null,
    ...(extra || {}),
  });

  if (disabled) {
    return disabledResult({ rejectionCode: null });
  }

  if (configuredRoot) {
    const validated = validateMediaStorageRoot(configuredRoot, {
      cwd,
      ensureWritable: options.ensureWritable,
    });
    if (!validated.ok) {
      return {
        enabled: false,
        provider: PROVIDER_DATABASE,
        environment,
        storageRoot: validated.storageRoot,
        publicBaseUrl,
        publicMountPath,
        rejectionCode: validated.rejectionCode,
        rejectionReason: validated.rejectionReason,
        mediaStorageRootSource: MEDIA_ROOT_SOURCE_DISABLED,
        mediaStorageRootConfigured: true,
        outsideReleaseTree: validated.outsideReleaseTree,
        writable: validated.writable,
      };
    }
    return {
      enabled: true,
      provider: PROVIDER_HOSTINGER,
      environment,
      storageRoot: validated.storageRoot,
      publicBaseUrl,
      publicMountPath,
      rejectionCode: null,
      rejectionReason: null,
      mediaStorageRootSource: MEDIA_ROOT_SOURCE_ENV,
      mediaStorageRootConfigured: true,
      outsideReleaseTree: true,
      writable: true,
    };
  }

  // Production (and any non-testing profile) stays fail-closed without explicit root.
  const allowTestingFallback =
    environment === "testing" && deploymentCode === "moovex-platform-testing";
  if (!allowTestingFallback) {
    return disabledResult({
      rejectionCode: CODE_ROOT_UNSET,
      mediaStorageRootConfigured: false,
    });
  }

  const derived = deriveTestingAccountHomeMediaRoot({
    homedir: options.homedir,
    cwd,
  });
  if (!derived.storageRoot || !derived.accountHome) {
    return disabledResult({
      rejectionCode: CODE_ROOT_UNSET,
      rejectionReason: "account_home_unavailable",
      mediaStorageRootConfigured: false,
    });
  }

  const validated = validateMediaStorageRoot(derived.storageRoot, {
    cwd,
    accountHome: derived.accountHome,
    requireUnderAccountHome: true,
    ensureWritable: options.ensureWritable,
  });
  if (!validated.ok) {
    return {
      enabled: false,
      provider: PROVIDER_DATABASE,
      environment,
      storageRoot: validated.storageRoot,
      publicBaseUrl,
      publicMountPath,
      rejectionCode: validated.rejectionCode,
      rejectionReason: validated.rejectionReason,
      mediaStorageRootSource: MEDIA_ROOT_SOURCE_DISABLED,
      mediaStorageRootConfigured: false,
      outsideReleaseTree: validated.outsideReleaseTree,
      writable: validated.writable,
    };
  }

  return {
    enabled: true,
    provider: PROVIDER_HOSTINGER,
    environment,
    storageRoot: validated.storageRoot,
    publicBaseUrl,
    publicMountPath,
    rejectionCode: null,
    rejectionReason: null,
    mediaStorageRootSource: MEDIA_ROOT_SOURCE_TESTING_FALLBACK,
    mediaStorageRootConfigured: false,
    outsideReleaseTree: true,
    writable: true,
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
  if (base) {
    // Prefer absolute CDN bases; relative /media is legacy mount-only.
    return `${base}/${key}`;
  }
  const mount = normalizeMountPath((cfg && cfg.publicMountPath) || "/media");
  return `${mount}/${key}`;
}

/**
 * Absolute CDN public base for presentation (https://host/media).
 * Combines MEDIA_PUBLIC_BASE_URL (when absolute) or MEDIA_CDN_ORIGIN + mount.
 * @param {NodeJS.ProcessEnv} [env]
 * @returns {string|null}
 */
function resolveAbsolutePublicMediaBaseUrl(env) {
  const source = env || process.env;
  const raw = String(source.MEDIA_PUBLIC_BASE_URL || "").trim().replace(/\/+$/, "");
  if (/^https:\/\//i.test(raw)) return raw;
  const origin = String(source.MEDIA_CDN_ORIGIN || "").trim().replace(/\/+$/, "");
  if (/^https:\/\//i.test(origin)) {
    const mount = normalizeMountPath(
      (raw && raw.startsWith("/") ? raw : null) ||
        String(source.MEDIA_PUBLIC_MOUNT_PATH || "").trim() ||
        "/media"
    );
    return `${origin}${mount}`;
  }
  return null;
}

module.exports = {
  PROVIDER_HOSTINGER,
  PROVIDER_DATABASE,
  PRODUCT_NAMESPACE,
  MIME_EXTENSION,
  CODE_ROOT_UNSET,
  CODE_ROOT_NOT_PERSISTENT,
  CODE_ROOT_NOT_WRITABLE,
  CODE_ROOT_OUTSIDE_ACCOUNT_HOME,
  MEDIA_ROOT_SOURCE_ENV,
  MEDIA_ROOT_SOURCE_TESTING_FALLBACK,
  MEDIA_ROOT_SOURCE_DISABLED,
  resolveMediaEnvironment,
  resolveHostingerMediaConfig,
  classifyMediaStorageRootPersistence,
  isEphemeralMediaStorageRoot,
  assertMediaStorageRootPersistent,
  deriveTestingAccountHomeMediaRoot,
  validateMediaStorageRoot,
  isPathUnderAccountHome,
  ensureMediaRootWritable,
  productNamespace,
  extensionForMime,
  buildHostingerStorageKey,
  assertStorageKeyWritable,
  buildPublicMediaUrl,
  resolveAbsolutePublicMediaBaseUrl,
  normalizeMountPath,
};
