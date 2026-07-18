"use strict";

/**
 * Storage factory: local filesystem by default / in tests;
 * Supabase Storage only when credentials are explicitly configured.
 * Never contacts hosted Supabase from unit tests.
 */

const path = require("path");
const { createLocalFilesystemStorage } = require("./localFilesystemStorage");
const { createSupabaseStorage } = require("./supabaseStorage");
const {
  DEFAULT_PUBLIC_BUCKET,
  DEFAULT_PRIVATE_BUCKET,
} = require("../mediaConstants");

/**
 * @param {NodeJS.ProcessEnv} [env]
 * @param {{ storage?: object, rootDir?: string }} [overrides]
 */
function createMediaStorage(env, overrides) {
  const e = env || process.env;
  if (overrides && overrides.storage) {
    return wrapAdapter(overrides.storage, e);
  }

  const nodeEnv = String(e.NODE_ENV || "");
  const forceLocal =
    nodeEnv === "test" ||
    String(e.BLESSBOARD_MEDIA_STORAGE || "").toLowerCase() === "local" ||
    String(e.BLESSBOARD_MEDIA_FORCE_LOCAL || "") === "1";

  const supabaseUrl = String(e.SUPABASE_URL || e.BLESSBOARD_SUPABASE_URL || "").trim();
  const serviceRoleKey = String(
    e.SUPABASE_SERVICE_ROLE_KEY || e.BLESSBOARD_SUPABASE_SERVICE_ROLE_KEY || ""
  ).trim();

  if (!forceLocal && supabaseUrl && serviceRoleKey) {
    const adapter = createSupabaseStorage({ supabaseUrl, serviceRoleKey });
    return wrapAdapter(adapter, e);
  }

  const rootDir =
    (overrides && overrides.rootDir) ||
    String(e.BLESSBOARD_MEDIA_ROOT || "").trim() ||
    path.join(process.cwd(), "data", "uploads", "blessboard-v5-media");

  const adapter = createLocalFilesystemStorage({
    rootDir,
    bucket: String(e.BLESSBOARD_MEDIA_LOCAL_BUCKET || "local").trim() || "local",
  });
  return wrapAdapter(adapter, e);
}

/**
 * @param {object} adapter
 * @param {NodeJS.ProcessEnv} env
 */
function wrapAdapter(adapter, env) {
  const publicBucket =
    String(env.BLESSBOARD_MEDIA_PUBLIC_BUCKET || "").trim() || DEFAULT_PUBLIC_BUCKET;
  const privateBucket =
    String(env.BLESSBOARD_MEDIA_PRIVATE_BUCKET || "").trim() || DEFAULT_PRIVATE_BUCKET;

  return {
    kind: adapter.kind,
    publicBucket,
    privateBucket,
    bucketForVisibility(visibility) {
      return visibility === "private" ? privateBucket : publicBucket;
    },
    upload: (...args) => adapter.upload(...args),
    delete: (...args) => adapter.delete(...args),
    read: adapter.read ? (...args) => adapter.read(...args) : null,
    resolvePublicUrl: adapter.resolvePublicUrl
      ? (...args) => adapter.resolvePublicUrl(...args)
      : () => null,
    resolveSignedUrl: adapter.resolveSignedUrl
      ? (...args) => adapter.resolveSignedUrl(...args)
      : async () => null,
  };
}

module.exports = {
  createMediaStorage,
};
