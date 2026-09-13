"use strict";

/**
 * Testing-only Hostinger media persistence probes (no secrets).
 * Discovers writable paths outside hbuilds/versions from the live process cwd.
 */

const fs = require("fs");
const fsp = require("fs/promises");
const path = require("path");
const {
  resolveHostingerMediaConfig,
  classifyMediaStorageRootPersistence,
} = require("./hostingerMediaConfig");

/**
 * @param {string} cwd
 * @returns {string|null}
 */
function accountHomeFromCwd(cwd) {
  const m = String(cwd || "")
    .replace(/\\/g, "/")
    .match(/^(\/home\/[^/]+)/);
  return m ? m[1] : null;
}

/**
 * Preferred durable roots for this Hostinger account — never under hbuilds/versions.
 * @param {string} cwd
 * @returns {string[]}
 */
function buildPersistentMediaRootCandidates(cwd) {
  const home = accountHomeFromCwd(cwd);
  if (!home) return [];
  return [
    path.join(home, "moovex-media"),
    path.join(home, "domains", "pronline.org", "moovex-media"),
  ];
}

/**
 * @param {string} dir
 * @returns {Promise<{
 *   path: string,
 *   exists: boolean,
 *   writable: boolean,
 *   outsideReleaseTree: boolean,
 *   persistenceReason: string|null,
 *   probeError: string|null,
 * }>}
 */
async function probeWritableDirectory(dir) {
  const abs = path.resolve(dir);
  const verdict = classifyMediaStorageRootPersistence(abs, process.cwd());
  const outsideReleaseTree = !verdict.ephemeral;
  let exists = false;
  let writable = false;
  let probeError = null;
  try {
    exists = fs.existsSync(abs);
    if (!outsideReleaseTree) {
      return {
        path: abs,
        exists,
        writable: false,
        outsideReleaseTree,
        persistenceReason: verdict.reason,
        probeError: "ephemeral_path",
      };
    }
    await fsp.mkdir(abs, { recursive: true });
    exists = true;
    const probeFile = path.join(abs, `.getpro-media-probe-${process.pid}`);
    await fsp.writeFile(probeFile, "ok", { encoding: "utf8", flag: "w" });
    await fsp.unlink(probeFile);
    writable = true;
  } catch (err) {
    probeError = err && err.code ? String(err.code) : "probe_failed";
    writable = false;
  }
  return {
    path: abs,
    exists,
    writable,
    outsideReleaseTree,
    persistenceReason: verdict.reason,
    probeError,
  };
}

/**
 * Safe diagnostic payload for `/__platform/runtime` (testing only).
 * @param {NodeJS.ProcessEnv} [env]
 */
async function buildHostingerMediaPersistenceSnapshot(env) {
  const source = env || process.env;
  const cwd = path.resolve(process.cwd()).replace(/\\/g, "/");
  const cwdVerdict = classifyMediaStorageRootPersistence(cwd, cwd);
  const cfg = resolveHostingerMediaConfig(source);
  const candidates = [];
  for (const candidate of buildPersistentMediaRootCandidates(cwd)) {
    // eslint-disable-next-line no-await-in-loop
    candidates.push(await probeWritableDirectory(candidate));
  }
  const recommended = candidates.find((c) => c.writable && c.outsideReleaseTree) || null;
  const configuredVerdict = cfg.storageRoot
    ? classifyMediaStorageRootPersistence(cfg.storageRoot, cwd)
    : { ephemeral: false, reason: null };

  return {
    cwd,
    cwdEphemeral: cwdVerdict.ephemeral === true,
    cwdEphemeralReason: cwdVerdict.reason,
    accountHome: accountHomeFromCwd(cwd),
    mediaStorageRootConfigured: Boolean(String(source.MEDIA_STORAGE_ROOT || "").trim()),
    mediaStorageRootEnabled: cfg.enabled === true,
    mediaStorageRejectionCode: cfg.rejectionCode || null,
    mediaStorageRejectionReason: cfg.rejectionReason || null,
    configuredRootEphemeral: configuredVerdict.ephemeral === true,
    configuredRootEphemeralReason: configuredVerdict.reason,
    publicMountPath: cfg.publicMountPath,
    publicBaseUrlConfigured: Boolean(cfg.publicBaseUrl),
    // Absolute configured root is OK on testing diagnostics (ops need the value).
    // Never include production secrets; this is a filesystem path only.
    configuredStorageRoot: cfg.storageRoot,
    recommendedMediaStorageRoot: recommended ? recommended.path : null,
    candidates,
  };
}

module.exports = {
  accountHomeFromCwd,
  buildPersistentMediaRootCandidates,
  probeWritableDirectory,
  buildHostingerMediaPersistenceSnapshot,
};
