"use strict";

const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

const UPLOAD_ROOT = path.join(__dirname, "..", "..", "data", "uploads", "church", "pastoral");
const MAX_ATTACHMENT_BYTES = 5 * 1024 * 1024;
const ALLOWED_MIME = new Set([
  "application/pdf",
  "image/png",
  "image/jpeg",
  "text/plain",
]);

function ensureUploadRoot() {
  fs.mkdirSync(UPLOAD_ROOT, { recursive: true });
}

function safeOriginalName(name) {
  return String(name || "file")
    .replace(/[/\\?%*:|"<>]/g, "_")
    .slice(0, 200);
}

function storedFilenameForUpload(originalName) {
  const ext = path.extname(safeOriginalName(originalName)).toLowerCase().slice(0, 12);
  return `${Date.now()}_${crypto.randomBytes(12).toString("hex")}${ext}`;
}

function absolutePathForStoredFilename(storedFilename) {
  const base = path.basename(String(storedFilename || ""));
  if (!base || base !== storedFilename) return null;
  return path.join(UPLOAD_ROOT, base);
}

/**
 * @param {import("express").Request} req
 * @returns {Promise<{ ok: true, file: object } | { ok: false, error: string }>}
 */
async function parsePastoralUpload(req) {
  if (!req.file) {
    return { ok: false, error: "Please choose a file to upload." };
  }
  if (req.file.size > MAX_ATTACHMENT_BYTES) {
    return { ok: false, error: "File is too large (max 5 MB)." };
  }
  const mime = String(req.file.mimetype || "").toLowerCase();
  if (!ALLOWED_MIME.has(mime)) {
    return { ok: false, error: "File type is not allowed." };
  }
  return { ok: true, file: req.file };
}

module.exports = {
  UPLOAD_ROOT,
  MAX_ATTACHMENT_BYTES,
  ALLOWED_MIME,
  ensureUploadRoot,
  safeOriginalName,
  storedFilenameForUpload,
  absolutePathForStoredFilename,
  parsePastoralUpload,
};
