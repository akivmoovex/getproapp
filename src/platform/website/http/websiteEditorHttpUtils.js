"use strict";

/**
 * Shared website-editor HTTP utilities (BB + AC).
 * No product conditionals — callers supply product context.
 */

const multer = require("multer");
const { CSRF_FIELD } = require("../../http/v5Csrf");
const mediaService = require("../mediaService");
const {
  getPendingChangeSummary,
} = require("../websiteChangeManagerService");
const { PERMISSIONS: WEBSITE_PERMISSIONS } = require("../permissions");

function jsonWithCorrelation(req, res, status, body) {
  const { ensureCorrelationId } = require("../../http/sharedApiError");
  const correlationId = ensureCorrelationId(req, res);
  const payload = body && typeof body === "object" ? { ...body } : { ok: false };
  if (payload.requestId == null) payload.requestId = correlationId;
  if (payload.correlationId == null) payload.correlationId = correlationId;
  return res.status(status).json(payload);
}

function json(res, status, body) {
  const req = res && res.req;
  if (req) return jsonWithCorrelation(req, res, status, body);
  return res.status(status).json(body);
}

function csrfFrom(req) {
  const body = req.body && typeof req.body === "object" ? req.body : {};
  if (body[CSRF_FIELD]) return body[CSRF_FIELD];
  if (req.headers["x-csrf-token"] != null) return String(req.headers["x-csrf-token"]);
  return "";
}

function clientTenantOverride(body) {
  if (!body || typeof body !== "object") return false;
  return Boolean(
    body.organizationId ||
      body.organization_id ||
      body.instanceId ||
      body.instance_id ||
      body.product ||
      body.productCode
  );
}

async function pendingChangeCountFor(db, organizationId, instanceId, granted) {
  if (!organizationId || !instanceId) return undefined;
  try {
    const summary = await getPendingChangeSummary(db, {
      organizationId,
      instanceId,
      grantedPermissions: granted || [WEBSITE_PERMISSIONS.VIEW, WEBSITE_PERMISSIONS.EDIT],
    });
    return summary.ok ? summary.pendingChangeCount : undefined;
  } catch {
    return undefined;
  }
}

function statusForDraftSaveFailure(code) {
  if (code === "forbidden") return 403;
  if (code === "conflict") return 409;
  if (code === "tenant_mismatch" || code === "media_not_found" || code === "website_instance_not_found") {
    return 404;
  }
  return 400;
}

function statusForFieldRestoreFailure(code) {
  if (code === "forbidden") return 403;
  if (code === "conflict") return 409;
  return 400;
}

function createWebsiteMediaUpload() {
  return multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: mediaService.MAX_BYTES, files: 1 },
    fileFilter(_req, file, cb) {
      const mime = String((file && file.mimetype) || "").toLowerCase();
      if (mime && mime !== "application/octet-stream" && !mediaService.ALLOWED_IMAGE_MIME.has(mime)) {
        const err = new Error("unsafe_media_type");
        err.code = mediaService.RESULT.UNSAFE_TYPE;
        return cb(err);
      }
      return cb(null, true);
    },
  });
}

/**
 * True only when the client explicitly prefers HTML (CMS library browser
 * navigation). JSON remains the default when Accept is absent or non-HTML.
 * @param {import('express').Request} req
 * @returns {boolean}
 */
function wantsHtml(req) {
  const accept = String((req && req.headers && req.headers.accept) || "");
  return accept.toLowerCase().includes("text/html");
}

module.exports = {
  CSRF_FIELD,
  json,
  jsonWithCorrelation,
  csrfFrom,
  clientTenantOverride,
  pendingChangeCountFor,
  statusForDraftSaveFailure,
  statusForFieldRestoreFailure,
  createWebsiteMediaUpload,
  wantsHtml,
};
