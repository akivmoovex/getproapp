"use strict";

/**
 * Local filesystem storage adapter for tests and local development.
 * Does not contact hosted Supabase.
 */

const fs = require("fs");
const fsp = require("fs/promises");
const path = require("path");
const { isSafeStorageKey } = require("../generateStorageKey");

/**
 * @param {{ rootDir: string, bucket?: string }} opts
 */
function createLocalFilesystemStorage(opts) {
  const rootDir = path.resolve(String(opts.rootDir || ""));
  const defaultBucket = String(opts.bucket || "local");

  function absoluteFor(bucket, storageKey) {
    if (!isSafeStorageKey(storageKey)) {
      const err = new Error("unsafe_storage_key");
      err.code = "UNSAFE_KEY";
      throw err;
    }
    const bucketSafe = String(bucket || defaultBucket).replace(/[^a-zA-Z0-9._-]/g, "_");
    const abs = path.resolve(rootDir, bucketSafe, ...storageKey.split("/"));
    const root = path.resolve(rootDir, bucketSafe);
    if (abs !== root && !abs.startsWith(root + path.sep)) {
      const err = new Error("path_traversal");
      err.code = "PATH_TRAVERSAL";
      throw err;
    }
    return abs;
  }

  return {
    kind: "local",
    defaultBucket,

    /**
     * @param {{ bucket: string, storageKey: string, buffer: Buffer, contentType: string }} input
     */
    async upload(input) {
      const bucket = String(input.bucket || defaultBucket);
      const storageKey = String(input.storageKey || "");
      const abs = absoluteFor(bucket, storageKey);
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
      return { bucket, storageKey };
    },

    /**
     * @param {{ bucket: string, storageKey: string }} input
     */
    async delete(input) {
      const abs = absoluteFor(input.bucket, input.storageKey);
      try {
        await fsp.unlink(abs);
      } catch (err) {
        if (err && err.code === "ENOENT") return;
        throw err;
      }
    },

    /**
     * @param {{ bucket: string, storageKey: string }} input
     * @returns {Promise<Buffer>}
     */
    async read(input) {
      const abs = absoluteFor(input.bucket, input.storageKey);
      return fsp.readFile(abs);
    },

    /**
     * Local public URL is always app-mediated (`/_bb/media/:id`); no direct file URL.
     * @returns {null}
     */
    resolvePublicUrl() {
      return null;
    },

    /**
     * @returns {null}
     */
    async resolveSignedUrl() {
      return null;
    },

    existsSync(bucket, storageKey) {
      try {
        return fs.existsSync(absoluteFor(bucket, storageKey));
      } catch {
        return false;
      }
    },
  };
}

module.exports = {
  createLocalFilesystemStorage,
};
