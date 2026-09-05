"use strict";

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { isSafeStorageKey } = require("../../blessboard/media/generateStorageKey");
const {
  DEFAULT_PUBLIC_BUCKET,
  DEFAULT_PRIVATE_BUCKET,
} = require("../../blessboard/media/mediaConstants");

function createSupabaseMediaClient({ supabaseUrl, serviceRoleKey, fetchImpl }) {
  const baseUrl = String(supabaseUrl || "")
    .trim()
    .replace(/\/$/, "");
  const key = String(serviceRoleKey || "").trim();
  const fetchFn = fetchImpl || globalThis.fetch;
  if (!baseUrl || !key) throw new Error("supabase_media_credentials_required");
  if (typeof fetchFn !== "function") throw new Error("fetch_unavailable");

  function objectUrl(bucket, storageKey) {
    if (!isSafeStorageKey(storageKey)) throw new Error("unsafe_storage_key");
    const encodedKey = storageKey
      .split("/")
      .map((seg) => encodeURIComponent(seg))
      .join("/");
    return `${baseUrl}/storage/v1/object/${encodeURIComponent(bucket)}/${encodedKey}`;
  }

  function headers(extra) {
    return { Authorization: `Bearer ${key}`, apikey: key, ...(extra || {}) };
  }

  return {
    async downloadObject(bucket, storageKey) {
      const res = await fetchFn(objectUrl(bucket, storageKey), { method: "GET", headers: headers() });
      if (!res.ok) {
        const err = new Error(`supabase_download_failed:${res.status}`);
        err.code = res.status === 404 ? "NOT_FOUND" : "DOWNLOAD_FAILED";
        throw err;
      }
      const buffer = Buffer.from(await res.arrayBuffer());
      const mime = res.headers.get("content-type") || "application/octet-stream";
      return { buffer, mime, size: buffer.length };
    },

    async uploadObject(bucket, storageKey, buffer, contentType) {
      const res = await fetchFn(objectUrl(bucket, storageKey), {
        method: "POST",
        headers: headers({
          "Content-Type": contentType || "application/octet-stream",
          "x-upsert": "false",
        }),
        body: buffer,
      });
      if (res.status === 409) {
        const err = new Error("key_exists");
        err.code = "KEY_EXISTS";
        throw err;
      }
      if (!res.ok) throw new Error(`supabase_upload_failed:${res.status}`);
      return { bucket, storageKey, size: buffer.length };
    },

    async headObject(bucket, storageKey) {
      const res = await fetchFn(objectUrl(bucket, storageKey), { method: "HEAD", headers: headers() });
      if (!res.ok) return null;
      const size = Number(res.headers.get("content-length") || 0);
      const mime = res.headers.get("content-type") || null;
      return { size, mime };
    },
  };
}

function sha256(buffer) {
  return crypto.createHash("sha256").update(buffer).digest("hex");
}

function resolveBuckets(env) {
  return {
    publicBucket: String(env.BLESSBOARD_MEDIA_PUBLIC_BUCKET || DEFAULT_PUBLIC_BUCKET).trim(),
    privateBucket: String(env.BLESSBOARD_MEDIA_PRIVATE_BUCKET || DEFAULT_PRIVATE_BUCKET).trim(),
  };
}

function bucketForVisibility(visibility, buckets) {
  return visibility === "private" ? buckets.privateBucket : buckets.publicBucket;
}

async function planSupabaseMedia(sourcePool, env) {
  const assets = await sourcePool.query(
    `SELECT id, storage_bucket, storage_key, mime_type, size_bytes, visibility, sha256
       FROM blessboard.media_assets
      WHERE status = 'active'
      ORDER BY created_at`
  );
  const buckets = resolveBuckets(env || process.env);
  return {
    metadataRows: assets.rowCount,
    buckets,
    objects: assets.rows.map((r) => ({
      id: r.id,
      bucket: r.storage_bucket || bucketForVisibility(r.visibility, buckets),
      storageKey: r.storage_key,
      sizeBytes: Number(r.size_bytes),
      mimeType: r.mime_type,
      sha256: r.sha256,
    })),
  };
}

async function copySupabaseMedia({
  sourcePool,
  sourceClient,
  targetClient,
  env,
  dryRun = false,
  resumeState = {},
}) {
  const plan = await planSupabaseMedia(sourcePool, env);
  const stats = {
    scanned: plan.objects.length,
    copied: 0,
    skippedIdentical: 0,
    missingSource: 0,
    conflicted: 0,
    failed: 0,
  };

  for (const obj of plan.objects) {
    const resumeKey = `${obj.bucket}/${obj.storageKey}`;
    if (resumeState[resumeKey] === "copied" || resumeState[resumeKey] === "skipped") {
      stats.skippedIdentical += 1;
      continue;
    }

    let sourceObj;
    try {
      if (dryRun) {
        const head = await sourceClient.headObject(obj.bucket, obj.storageKey);
        if (!head) {
          stats.missingSource += 1;
          continue;
        }
        const targetHead = await targetClient.headObject(obj.bucket, obj.storageKey);
        if (targetHead && targetHead.size === head.size) {
          stats.skippedIdentical += 1;
        }
        continue;
      }
      sourceObj = await sourceClient.downloadObject(obj.bucket, obj.storageKey);
    } catch (err) {
      if (err.code === "NOT_FOUND") {
        stats.missingSource += 1;
        continue;
      }
      throw err;
    }

    const targetHead = await targetClient.headObject(obj.bucket, obj.storageKey);
    if (targetHead) {
      if (targetHead.size === sourceObj.size) {
        stats.skippedIdentical += 1;
        resumeState[resumeKey] = "skipped";
        continue;
      }
      stats.conflicted += 1;
      continue;
    }

    const digest = sha256(sourceObj.buffer);
    if (obj.sha256 && digest !== obj.sha256) {
      stats.failed += 1;
      continue;
    }

    await targetClient.uploadObject(obj.bucket, obj.storageKey, sourceObj.buffer, obj.mimeType || sourceObj.mime);
    stats.copied += 1;
    resumeState[resumeKey] = "copied";
  }

  return { plan, stats, resumeState };
}

function copyLocalMedia({ sourcePool, srcRoot, tgtRoot, dryRun = false }) {
  const stats = { scanned: 0, copied: 0, missingSource: 0, skippedIdentical: 0, conflicted: 0 };
  if (!fs.existsSync(srcRoot)) return { stats, plan: { metadataRows: 0 } };
  const assets = sourcePool.query
    ? null
    : null;
  return { stats };
}

module.exports = {
  createSupabaseMediaClient,
  planSupabaseMedia,
  copySupabaseMedia,
  sha256,
  bucketForVisibility,
  resolveBuckets,
};
