"use strict";

/**
 * Hostinger filesystem media adapter for public website images only.
 * API: storeMedia / deleteMedia / getPublicUrl / mediaExists
 */

const fs = require("fs");
const fsp = require("fs/promises");
const path = require("path");
const {
  resolveHostingerMediaConfig,
  buildHostingerStorageKey,
  assertStorageKeyWritable,
  assertMediaStorageRootPersistent,
  buildPublicMediaUrl,
  PROVIDER_HOSTINGER,
  CODE_ROOT_NOT_PERSISTENT,
  CODE_ROOT_UNSET,
} = require("./hostingerMediaConfig");

/**
 * @param {NodeJS.ProcessEnv} [env]
 * @param {{ config?: object }} [overrides]
 */
function createHostingerMediaStorage(env, overrides) {
  const cfg =
    (overrides && overrides.config) || resolveHostingerMediaConfig(env || process.env);

  function absoluteFor(storageKey) {
    assertStorageKeyWritable(cfg.environment, storageKey);
    if (!cfg.storageRoot) {
      const err = new Error("media_storage_root_unset");
      err.code = CODE_ROOT_UNSET;
      throw err;
    }
    assertMediaStorageRootPersistent(cfg.storageRoot, process.cwd());
    const abs = path.resolve(cfg.storageRoot, ...String(storageKey).split("/"));
    const root = path.resolve(cfg.storageRoot);
    if (abs !== root && !abs.startsWith(root + path.sep)) {
      const err = new Error("path_traversal");
      err.code = "PATH_TRAVERSAL";
      throw err;
    }
    return abs;
  }

  return {
    kind: PROVIDER_HOSTINGER,
    config: cfg,

    /**
     * @param {{
     *   productCode: string,
     *   organizationId: string,
     *   mediaId: string,
     *   mimeType: string,
     *   buffer: Buffer,
     *   storageKey?: string,
     * }} input
     */
    async storeMedia(input) {
      if (cfg.rejectionCode) {
        const err = new Error(String(cfg.rejectionCode).toLowerCase());
        err.code = cfg.rejectionCode;
        err.reason = cfg.rejectionReason;
        throw err;
      }
      if (!cfg.enabled || !cfg.storageRoot) {
        const err = new Error("media_storage_disabled");
        err.code = "MEDIA_STORAGE_DISABLED";
        throw err;
      }
      assertMediaStorageRootPersistent(cfg.storageRoot, process.cwd());
      if (!Buffer.isBuffer(input && input.buffer) || !input.buffer.length) {
        const err = new Error("invalid_media_buffer");
        err.code = "INVALID_MEDIA_BUFFER";
        throw err;
      }
      const storageKey =
        input.storageKey ||
        buildHostingerStorageKey({
          environment: cfg.environment,
          productCode: input.productCode,
          organizationId: input.organizationId,
          mediaId: input.mediaId,
          mimeType: input.mimeType,
        });
      assertStorageKeyWritable(cfg.environment, storageKey);
      const abs = absoluteFor(storageKey);
      await fsp.mkdir(path.dirname(abs), { recursive: true });
      try {
        await fsp.writeFile(abs, input.buffer, { flag: "wx" });
      } catch (err) {
        if (err && err.code === "EEXIST") {
          const conflict = new Error("key_exists");
          conflict.code = "KEY_EXISTS";
          throw conflict;
        }
        throw err;
      }
      return {
        storageProvider: PROVIDER_HOSTINGER,
        storageKey,
        publicUrl: buildPublicMediaUrl(storageKey, cfg),
      };
    },

    /**
     * Prefer orphan cleanup later; callers should avoid deleting published refs.
     * @param {{ storageKey: string }} input
     */
    async deleteMedia(input) {
      const abs = absoluteFor(input.storageKey);
      try {
        await fsp.unlink(abs);
      } catch (err) {
        if (err && err.code === "ENOENT") return { ok: true, missing: true };
        throw err;
      }
      return { ok: true, missing: false };
    },

    /**
     * @param {string} storageKey
     * @returns {string|null}
     */
    getPublicUrl(storageKey) {
      return buildPublicMediaUrl(storageKey, cfg);
    },

    /**
     * @param {string} storageKey
     * @returns {boolean}
     */
    mediaExists(storageKey) {
      try {
        return fs.existsSync(absoluteFor(storageKey));
      } catch {
        return false;
      }
    },

    /**
     * @param {string} storageKey
     * @returns {Promise<Buffer>}
     */
    async readMedia(storageKey) {
      return fsp.readFile(absoluteFor(storageKey));
    },
  };
}

module.exports = {
  createHostingerMediaStorage,
};
