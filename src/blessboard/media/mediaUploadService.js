"use strict";

/**
 * BlessBoard V5 media upload service: validate → store → metadata → delivery URL.
 * Binaries never enter PostgreSQL. Failed uploads clean up object storage.
 */

const crypto = require("crypto");
const {
  STATUS,
  VISIBILITY,
  ASSET_STATUS,
  PUBLIC_MEDIA_PATH_PREFIX,
} = require("./mediaConstants");
const { validateMediaFile } = require("./validateMediaFile");
const { generateStorageKey } = require("./generateStorageKey");
const { createMediaStorage } = require("./storage/createMediaStorage");
const repo = require("./mediaAssetsRepository");

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * @param {string} assetId
 */
function deliveryPathForAsset(assetId) {
  return `${PUBLIC_MEDIA_PATH_PREFIX}${assetId}`;
}

/**
 * @param {unknown} value
 */
function parseMediaAssetIdFromPath(value) {
  const raw = String(value == null ? "" : value).trim();
  if (!raw.startsWith(PUBLIC_MEDIA_PATH_PREFIX)) return null;
  const id = raw.slice(PUBLIC_MEDIA_PATH_PREFIX.length).split(/[/?#]/)[0];
  if (!UUID_RE.test(id)) return null;
  return id;
}

/**
 * @param {{ connect?: Function, query?: Function }} db
 * @param {(client: object) => Promise<T>} fn
 * @returns {Promise<T>}
 * @template T
 */
async function withClient(db, fn) {
  if (db && typeof db.connect === "function") {
    const client = await db.connect();
    try {
      return await fn(client);
    } finally {
      client.release();
    }
  }
  return fn(db);
}

/**
 * @param {NodeJS.ProcessEnv} [env]
 * @param {{ storage?: object, rootDir?: string }} [storageOverrides]
 */
function createMediaUploadService(env, storageOverrides) {
  const e = env || process.env;
  const storage = createMediaStorage(e, storageOverrides || {});

  /**
   * @param {{ query: Function }} db
   * @param {{
   *   churchId: string,
   *   branchId?: string|null,
   *   uploadedByUserId: string,
   *   buffer: Buffer,
   *   originalFilename?: string,
   *   claimedMime?: string,
   *   visibility?: string,
   *   dedupeByHash?: boolean,
   * }} input
   */
  async function uploadMediaAsset(db, input) {
    const raw = input && typeof input === "object" ? input : {};
    const churchId = String(raw.churchId || "").trim();
    const uploadedByUserId = String(raw.uploadedByUserId || "").trim();
    const branchId =
      raw.branchId != null && String(raw.branchId).trim() ? String(raw.branchId).trim() : null;
    const visibility =
      String(raw.visibility || VISIBILITY.PUBLIC).trim().toLowerCase() === VISIBILITY.PRIVATE
        ? VISIBILITY.PRIVATE
        : VISIBILITY.PUBLIC;
    const dedupeByHash = raw.dedupeByHash !== false;

    if (!UUID_RE.test(churchId)) {
      return { ok: false, status: STATUS.INVALID_INPUT, reason: "church_id", asset: null };
    }
    if (!UUID_RE.test(uploadedByUserId)) {
      return { ok: false, status: STATUS.INVALID_INPUT, reason: "uploaded_by_user_id", asset: null };
    }
    if (branchId && !UUID_RE.test(branchId)) {
      return { ok: false, status: STATUS.INVALID_INPUT, reason: "branch_id", asset: null };
    }

    const validated = validateMediaFile({
      buffer: raw.buffer,
      originalFilename: raw.originalFilename,
      claimedMime: raw.claimedMime,
    });
    if (!validated.ok) {
      return { ok: false, status: STATUS.INVALID_INPUT, reason: validated.reason, asset: null };
    }

    const sha256 = crypto.createHash("sha256").update(raw.buffer).digest("hex");

    if (dedupeByHash) {
      try {
        const existing = await withClient(db, (client) =>
          repo.findActiveByChurchSha256(client, { churchId, sha256 })
        );
        if (existing) {
          return {
            ok: true,
            status: STATUS.OK,
            asset: existing,
            deliveryPath: deliveryPathForAsset(existing.id),
            deduped: true,
          };
        }
      } catch {
        return { ok: false, status: STATUS.LOOKUP_ERROR, reason: "lookup", asset: null };
      }
    }

    const keyGen = generateStorageKey({
      churchId,
      originalFilename: validated.originalFilename,
    });
    if (!keyGen.ok) {
      return { ok: false, status: STATUS.INVALID_INPUT, reason: keyGen.reason, asset: null };
    }

    const bucket = storage.bucketForVisibility(visibility);
    let uploaded = false;
    try {
      await storage.upload({
        bucket,
        storageKey: keyGen.storageKey,
        buffer: raw.buffer,
        contentType: validated.mimeType,
      });
      uploaded = true;

      const asset = await withClient(db, (client) =>
        repo.insertMediaAsset(client, {
          churchId,
          branchId,
          uploadedByUserId,
          storageBucket: bucket,
          storageKey: keyGen.storageKey,
          originalFilename: validated.originalFilename,
          mimeType: validated.mimeType,
          sizeBytes: validated.sizeBytes,
          sha256,
          visibility,
        })
      );

      return {
        ok: true,
        status: STATUS.OK,
        asset,
        deliveryPath: deliveryPathForAsset(asset.id),
        deduped: false,
      };
    } catch (err) {
      if (uploaded) {
        try {
          await storage.delete({ bucket, storageKey: keyGen.storageKey });
        } catch {
          // best-effort cleanup
        }
      }
      if (err && err.code === "KEY_EXISTS") {
        return { ok: false, status: STATUS.CONFLICT, reason: "key_exists", asset: null };
      }
      const msg = String((err && err.message) || err || "");
      if (/branch|church|foreign|violates/i.test(msg)) {
        return { ok: false, status: STATUS.INVALID_INPUT, reason: "ownership", asset: null };
      }
      return { ok: false, status: STATUS.STORAGE_ERROR, reason: "upload_failed", asset: null };
    }
  }

  /**
   * Soft-archive only; object retained for audit / possible restore in a later phase.
   * @param {{ query: Function }} db
   * @param {{ assetId: string, churchId: string }} input
   */
  async function archiveMediaAsset(db, input) {
    const assetId = String((input && input.assetId) || "").trim();
    const churchId = String((input && input.churchId) || "").trim();
    if (!UUID_RE.test(assetId) || !UUID_RE.test(churchId)) {
      return { ok: false, status: STATUS.INVALID_INPUT, reason: "ids", asset: null };
    }
    try {
      const asset = await withClient(db, (client) =>
        repo.archiveMediaAsset(client, { id: assetId, churchId })
      );
      if (!asset) {
        return { ok: false, status: STATUS.NOT_FOUND, reason: "not_found", asset: null };
      }
      return { ok: true, status: STATUS.OK, asset };
    } catch {
      return { ok: false, status: STATUS.LOOKUP_ERROR, reason: "lookup", asset: null };
    }
  }

  /**
   * Tenant-scoped library listing for the media picker (safe fields only).
   * @param {{ query: Function }} db
   * @param {{
   *   churchId: string,
   *   visibility?: string | null,
   *   limit?: number,
   * }} input
   */
  async function listMediaAssets(db, input) {
    const churchId = String((input && input.churchId) || "").trim();
    if (!UUID_RE.test(churchId)) {
      return { ok: false, status: STATUS.INVALID_INPUT, reason: "church_id", assets: [] };
    }
    const visibilityRaw =
      input && input.visibility != null ? String(input.visibility).trim().toLowerCase() : "";
    const visibility =
      visibilityRaw === VISIBILITY.PUBLIC || visibilityRaw === VISIBILITY.PRIVATE
        ? visibilityRaw
        : null;
    const limit = Math.min(Math.max(Number(input && input.limit) || 50, 1), 100);
    try {
      const rows = await withClient(db, (client) =>
        repo.listActiveMediaAssetsForChurch(client, {
          churchId,
          visibility,
          limit,
          offset: 0,
        })
      );
      const assets = (rows || []).map((asset) => {
        if (!asset) return null;
        const mime = String(asset.mimeType || "");
        return {
          id: asset.id,
          originalFilename: asset.originalFilename,
          mimeType: mime,
          sizeBytes: asset.sizeBytes,
          visibility: asset.visibility,
          createdAt: asset.createdAt,
          category: mime.startsWith("image/") ? "image" : "document",
          deliveryPath: deliveryPathForAsset(asset.id),
        };
      }).filter(Boolean);
      return { ok: true, status: STATUS.OK, assets };
    } catch {
      return { ok: false, status: STATUS.LOOKUP_ERROR, reason: "lookup", assets: [] };
    }
  }

  /**
   * Resolve bytes for delivery. Caller must enforce access control.
   * @param {{ query: Function }} db
   * @param {{ assetId: string, churchId?: string|null, allowPrivate?: boolean, viewerChurchId?: string|null }} input
   */
  async function loadMediaBytes(db, input) {
    const assetId = String((input && input.assetId) || "").trim();
    if (!UUID_RE.test(assetId)) {
      return { ok: false, status: STATUS.INVALID_INPUT, reason: "asset_id", asset: null, buffer: null };
    }
    let asset;
    try {
      asset = await withClient(db, (client) => repo.findMediaAssetById(client, assetId));
    } catch {
      return { ok: false, status: STATUS.LOOKUP_ERROR, reason: "lookup", asset: null, buffer: null };
    }
    if (!asset || asset.status !== ASSET_STATUS.ACTIVE) {
      return { ok: false, status: STATUS.NOT_FOUND, reason: "not_found", asset: null, buffer: null };
    }

    const viewerChurchId =
      input.viewerChurchId != null ? String(input.viewerChurchId).trim() : null;
    const requiredChurchId =
      input.churchId != null && String(input.churchId).trim()
        ? String(input.churchId).trim()
        : null;

    if (requiredChurchId && asset.churchId !== requiredChurchId) {
      return { ok: false, status: STATUS.FORBIDDEN, reason: "cross_tenant", asset: null, buffer: null };
    }
    if (viewerChurchId && asset.churchId !== viewerChurchId) {
      return { ok: false, status: STATUS.FORBIDDEN, reason: "cross_tenant", asset: null, buffer: null };
    }

    if (asset.visibility === VISIBILITY.PRIVATE && !input.allowPrivate) {
      return { ok: false, status: STATUS.FORBIDDEN, reason: "private", asset: null, buffer: null };
    }

    if (typeof storage.read !== "function") {
      // Supabase: prefer signed URL for private; public URL for public buckets.
      if (asset.visibility === VISIBILITY.PUBLIC) {
        const publicUrl = storage.resolvePublicUrl({
          bucket: asset.storageBucket,
          storageKey: asset.storageKey,
        });
        if (publicUrl) {
          return {
            ok: true,
            status: STATUS.OK,
            asset,
            buffer: null,
            redirectUrl: publicUrl,
          };
        }
      }
      if (input.allowPrivate || asset.visibility === VISIBILITY.PRIVATE) {
        const signed = await storage.resolveSignedUrl({
          bucket: asset.storageBucket,
          storageKey: asset.storageKey,
          expiresInSeconds: 300,
        });
        if (signed) {
          return {
            ok: true,
            status: STATUS.OK,
            asset,
            buffer: null,
            redirectUrl: signed,
          };
        }
      }
      return { ok: false, status: STATUS.STORAGE_ERROR, reason: "read_unavailable", asset, buffer: null };
    }

    try {
      const buffer = await storage.read({
        bucket: asset.storageBucket,
        storageKey: asset.storageKey,
      });
      return { ok: true, status: STATUS.OK, asset, buffer, redirectUrl: null };
    } catch {
      return { ok: false, status: STATUS.STORAGE_ERROR, reason: "read_failed", asset, buffer: null };
    }
  }

  /**
   * App-relative delivery path for public assets; HTTPS public URL when adapter provides one
   * and preferDirectPublicUrl is set. Default is always `/_bb/media/:id` so access control stays in-app.
   * @param {object} asset
   */
  function resolveDeliveryUrl(asset, opts) {
    if (!asset || !asset.id) return null;
    if (opts && opts.preferDirectPublicUrl && asset.visibility === VISIBILITY.PUBLIC) {
      const direct = storage.resolvePublicUrl({
        bucket: asset.storageBucket,
        storageKey: asset.storageKey,
      });
      if (direct) return direct;
    }
    return deliveryPathForAsset(asset.id);
  }

  return {
    storage,
    uploadMediaAsset,
    archiveMediaAsset,
    listMediaAssets,
    loadMediaBytes,
    resolveDeliveryUrl,
    deliveryPathForAsset,
  };
}

module.exports = {
  createMediaUploadService,
  deliveryPathForAsset,
  parseMediaAssetIdFromPath,
  STATUS,
  VISIBILITY,
  ASSET_STATUS,
  PUBLIC_MEDIA_PATH_PREFIX,
};
