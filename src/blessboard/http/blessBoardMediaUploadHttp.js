"use strict";

/**
 * Shared BlessBoard media upload HTTP glue.
 *
 * Reuses createMediaUploadService storage/validation; callers supply
 * authorization middleware and optional visibility forcing for purpose-scoped
 * mounts (e.g. announcement attachments require private).
 */

const multer = require("multer");
const {
  CSRF_FIELD,
  validateCsrf,
} = require("../../platform/http/v5Csrf");
const { areMediaUploadsEnabled } = require("../config/mediaUploadsEnabled");
const { MAX_ANY_BYTES, VISIBILITY } = require("../media/mediaConstants");
const { STATUS: MEDIA_STATUS } = require("../media/mediaUploadService");

/**
 * @param {NodeJS.ProcessEnv} [env]
 */
function createBlessBoardMediaUploadMulter(env) {
  void env;
  return multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: MAX_ANY_BYTES, files: 1 },
  });
}

/**
 * Middleware: refuse when BLESSBOARD_MEDIA_UPLOADS_ENABLED is off.
 * @param {NodeJS.ProcessEnv} env
 */
function requireMediaUploadsEnabled(env) {
  return function mediaUploadsEnabledGate(req, res, next) {
    if (!areMediaUploadsEnabled(env)) {
      return res.status(403).json({ ok: false, reason: "media_uploads_disabled" });
    }
    return next();
  };
}

/**
 * @param {import('multer').Multer} upload
 */
function createMulterSingleMiddleware(upload) {
  return function multerSingle(req, res, next) {
    upload.single("file")(req, res, (err) => {
      if (!err) return next();
      if (err instanceof multer.MulterError && err.code === "LIMIT_FILE_SIZE") {
        return res.status(400).json({ ok: false, reason: "size_limit" });
      }
      return res.status(400).json({ ok: false, reason: "upload_error" });
    });
  };
}

/**
 * Persist multipart upload via mediaUploadService and return the standard JSON body.
 *
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 * @param {{
 *   getPool: () => { query: Function },
 *   mediaService: { uploadMediaAsset: Function },
 *   env?: NodeJS.ProcessEnv,
 *   churchId: string,
 *   branchId?: string | null,
 *   uploadedByUserId?: string | null,
 *   forceVisibility?: 'public' | 'private' | null,
 * }} opts
 */
async function respondWithMediaUpload(req, res, opts) {
  const env = opts.env || process.env;
  const submitted =
    (req.body && req.body[CSRF_FIELD]) ||
    (req.headers["x-csrf-token"] != null ? String(req.headers["x-csrf-token"]) : "");
  if (!validateCsrf(req, submitted, env)) {
    return res.status(403).json({ ok: false, reason: "csrf" });
  }
  if (!req.file || !req.file.buffer) {
    return res.status(400).json({ ok: false, reason: "empty_file" });
  }

  let visibility =
    String((req.body && req.body.visibility) || VISIBILITY.PUBLIC).toLowerCase() ===
    VISIBILITY.PRIVATE
      ? VISIBILITY.PRIVATE
      : VISIBILITY.PUBLIC;
  if (opts.forceVisibility === VISIBILITY.PRIVATE || opts.forceVisibility === VISIBILITY.PUBLIC) {
    visibility = opts.forceVisibility;
  }

  const result = await opts.mediaService.uploadMediaAsset(opts.getPool(), {
    churchId: opts.churchId,
    branchId: opts.branchId != null ? opts.branchId : null,
    uploadedByUserId: opts.uploadedByUserId || null,
    buffer: req.file.buffer,
    originalFilename: req.file.originalname,
    claimedMime: req.file.mimetype,
    visibility,
  });

  if (!result.ok) {
    const status =
      result.status === MEDIA_STATUS.FORBIDDEN
        ? 403
        : result.status === MEDIA_STATUS.CONFLICT
          ? 409
          : result.status === MEDIA_STATUS.STORAGE_ERROR
            ? 503
            : 400;
    const cleanup =
      result.status === MEDIA_STATUS.STORAGE_ERROR || result.reason === "upload_failed";
    return res.status(status).json({
      ok: false,
      reason: result.reason || "upload_failed",
      cleanup: cleanup ? "removed" : null,
    });
  }

  return res.status(200).json({
    ok: true,
    assetId: result.asset.id,
    deliveryPath: result.deliveryPath,
    mimeType: result.asset.mimeType,
    sizeBytes: result.asset.sizeBytes,
    visibility: result.asset.visibility,
    originalFilename: result.asset.originalFilename,
    deduped: Boolean(result.deduped),
  });
}

module.exports = {
  createBlessBoardMediaUploadMulter,
  requireMediaUploadsEnabled,
  createMulterSingleMiddleware,
  respondWithMediaUpload,
  VISIBILITY,
};
