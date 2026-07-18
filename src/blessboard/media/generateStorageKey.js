"use strict";

/**
 * Randomized, traversal-safe storage keys. Never overwrite: UUID segment is unique.
 */

const crypto = require("crypto");
const path = require("path");
const { sanitizeOriginalFilename } = require("./validateMediaFile");

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * @param {{ churchId: string, originalFilename: string, objectId?: string }} input
 * @returns {{ ok: true, storageKey: string, objectId: string, safeFilename: string } | { ok: false, reason: string }}
 */
function generateStorageKey(input) {
  const raw = input && typeof input === "object" ? input : {};
  const churchId = String(raw.churchId || "").trim();
  if (!UUID_RE.test(churchId)) {
    return { ok: false, reason: "church_id" };
  }
  const objectId = raw.objectId ? String(raw.objectId).trim() : crypto.randomUUID();
  if (!UUID_RE.test(objectId)) {
    return { ok: false, reason: "object_id" };
  }
  const safeFilename = sanitizeOriginalFilename(raw.originalFilename);
  if (!safeFilename || safeFilename.includes("..") || path.isAbsolute(safeFilename)) {
    return { ok: false, reason: "unsafe_filename" };
  }
  // Flat POSIX-style key (no leading slash). Segments are UUIDs + sanitized basename only.
  const storageKey = `blessboard/${churchId}/${objectId}/${safeFilename}`;
  if (storageKey.includes("..") || storageKey.includes("\\") || storageKey.startsWith("/")) {
    return { ok: false, reason: "path_traversal" };
  }
  return { ok: true, storageKey, objectId, safeFilename };
}

/**
 * @param {string} storageKey
 * @returns {boolean}
 */
function isSafeStorageKey(storageKey) {
  const key = String(storageKey || "");
  if (!key || key.startsWith("/") || key.includes("..") || key.includes("\\") || key.includes("\0")) {
    return false;
  }
  const parts = key.split("/");
  if (parts.length < 4 || parts[0] !== "blessboard") return false;
  if (!UUID_RE.test(parts[1]) || !UUID_RE.test(parts[2])) return false;
  return true;
}

module.exports = {
  generateStorageKey,
  isSafeStorageKey,
};
