"use strict";

/**
 * Validate upload buffers: size, sanitized name, magic-byte signatures.
 * Never trust client MIME or extension alone.
 */

const path = require("path");
const {
  ALLOWED_MIME,
  REJECTED_MIME,
  MAX_ANY_BYTES,
} = require("./mediaConstants");

/**
 * @param {unknown} name
 * @returns {string}
 */
function sanitizeOriginalFilename(name) {
  let base = path.basename(String(name == null ? "file" : name));
  base = base.replace(/\0/g, "");
  base = base.replace(/[/\\?%*:|"<>]/g, "_");
  base = base.replace(/\s+/g, " ").trim();
  if (!base || base === "." || base === "..") base = "file";
  if (base.length > 180) {
    const ext = path.extname(base).slice(0, 16);
    base = `${base.slice(0, 180 - ext.length)}${ext}`;
  }
  return base;
}

/**
 * Detect MIME from magic bytes. Returns null when unknown / rejected.
 * @param {Buffer} buffer
 * @returns {string|null}
 */
function detectMimeFromSignature(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 4) return null;

  // JPEG
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return "image/jpeg";
  }
  // PNG
  if (
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47 &&
    buffer[4] === 0x0d &&
    buffer[5] === 0x0a &&
    buffer[6] === 0x1a &&
    buffer[7] === 0x0a
  ) {
    return "image/png";
  }
  // GIF
  if (
    buffer.length >= 6 &&
    buffer[0] === 0x47 &&
    buffer[1] === 0x49 &&
    buffer[2] === 0x46 &&
    buffer[3] === 0x38 &&
    (buffer[4] === 0x37 || buffer[4] === 0x39) &&
    buffer[5] === 0x61
  ) {
    return "image/gif";
  }
  // WEBP (RIFF....WEBP)
  if (
    buffer.length >= 12 &&
    buffer[0] === 0x52 &&
    buffer[1] === 0x49 &&
    buffer[2] === 0x46 &&
    buffer[3] === 0x46 &&
    buffer[8] === 0x57 &&
    buffer[9] === 0x45 &&
    buffer[10] === 0x42 &&
    buffer[11] === 0x50
  ) {
    return "image/webp";
  }
  // PDF (%PDF)
  if (
    buffer[0] === 0x25 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x44 &&
    buffer[3] === 0x46
  ) {
    return "application/pdf";
  }
  // Reject SVG / XML-ish text pretending to be image
  const head = buffer.slice(0, Math.min(256, buffer.length)).toString("utf8").toLowerCase();
  if (head.includes("<svg") || head.includes("<!doctype html") || head.includes("<html")) {
    return null;
  }
  return null;
}

/**
 * @param {{ buffer: Buffer, originalFilename?: string, claimedMime?: string, maxBytes?: number }} input
 * @returns {{ ok: true, mimeType: string, sizeBytes: number, originalFilename: string, category: string } | { ok: false, reason: string }}
 */
function validateMediaFile(input) {
  const raw = input && typeof input === "object" ? input : {};
  const buffer = raw.buffer;
  if (!Buffer.isBuffer(buffer) || buffer.length === 0) {
    return { ok: false, reason: "empty_file" };
  }

  const sizeBytes = buffer.length;
  const maxBytes = Number(raw.maxBytes) > 0 ? Number(raw.maxBytes) : MAX_ANY_BYTES;
  if (sizeBytes > maxBytes) {
    return { ok: false, reason: "size_limit" };
  }

  const originalFilename = sanitizeOriginalFilename(raw.originalFilename);
  if (originalFilename.includes("..") || originalFilename.includes("/") || originalFilename.includes("\\")) {
    return { ok: false, reason: "unsafe_filename" };
  }

  const claimed = String(raw.claimedMime || "")
    .trim()
    .toLowerCase();
  if (claimed && REJECTED_MIME.has(claimed)) {
    return { ok: false, reason: "mime_rejected" };
  }

  const detected = detectMimeFromSignature(buffer);
  if (!detected) {
    return { ok: false, reason: "signature_unrecognized" };
  }
  if (REJECTED_MIME.has(detected)) {
    return { ok: false, reason: "mime_rejected" };
  }

  const policy = ALLOWED_MIME.get(detected);
  if (!policy) {
    return { ok: false, reason: "mime_not_allowed" };
  }
  if (sizeBytes > policy.maxBytes) {
    return { ok: false, reason: "size_limit" };
  }

  // Client MIME may be missing or octet-stream; if present and non-generic, must match signature.
  if (
    claimed &&
    claimed !== "application/octet-stream" &&
    claimed !== "binary/octet-stream" &&
    claimed !== detected &&
    !(claimed === "image/jpg" && detected === "image/jpeg")
  ) {
    return { ok: false, reason: "mime_mismatch" };
  }

  const ext = path.extname(originalFilename).toLowerCase();
  if (ext && !policy.extensions.includes(ext)) {
    return { ok: false, reason: "extension_mismatch" };
  }

  return {
    ok: true,
    mimeType: detected,
    sizeBytes,
    originalFilename,
    category: policy.category,
  };
}

module.exports = {
  sanitizeOriginalFilename,
  detectMimeFromSignature,
  validateMediaFile,
};
