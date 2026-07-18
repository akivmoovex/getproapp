"use strict";

/**
 * BlessBoard V5 media upload policy (allowlists and limits).
 * SVG is rejected. Client-declared MIME is never trusted alone.
 */

const MAX_IMAGE_BYTES = 5 * 1024 * 1024; // 5 MiB
const MAX_DOCUMENT_BYTES = 15 * 1024 * 1024; // 15 MiB
const MAX_ANY_BYTES = MAX_DOCUMENT_BYTES;

/** @type {ReadonlyMap<string, { extensions: readonly string[], category: 'image'|'document', maxBytes: number }>} */
const ALLOWED_MIME = Object.freeze(
  new Map([
    ["image/jpeg", { extensions: Object.freeze([".jpg", ".jpeg"]), category: "image", maxBytes: MAX_IMAGE_BYTES }],
    ["image/png", { extensions: Object.freeze([".png"]), category: "image", maxBytes: MAX_IMAGE_BYTES }],
    ["image/webp", { extensions: Object.freeze([".webp"]), category: "image", maxBytes: MAX_IMAGE_BYTES }],
    ["image/gif", { extensions: Object.freeze([".gif"]), category: "image", maxBytes: MAX_IMAGE_BYTES }],
    ["application/pdf", { extensions: Object.freeze([".pdf"]), category: "document", maxBytes: MAX_DOCUMENT_BYTES }],
  ])
);

const REJECTED_MIME = Object.freeze(
  new Set([
    "image/svg+xml",
    "text/html",
    "application/javascript",
    "text/javascript",
    "application/x-msdownload",
    "application/x-executable",
    "application/x-sh",
    "application/xhtml+xml",
  ])
);

const VISIBILITY = Object.freeze({
  PUBLIC: "public",
  PRIVATE: "private",
});

const ASSET_STATUS = Object.freeze({
  ACTIVE: "active",
  ARCHIVED: "archived",
});

const DEFAULT_PUBLIC_BUCKET = "blessboard-public";
const DEFAULT_PRIVATE_BUCKET = "blessboard-private";

const PUBLIC_MEDIA_PATH_PREFIX = "/_bb/media/";

const STATUS = Object.freeze({
  OK: "ok",
  INVALID_INPUT: "invalid_input",
  FORBIDDEN: "forbidden",
  NOT_FOUND: "not_found",
  CONFLICT: "conflict",
  STORAGE_ERROR: "storage_error",
  LOOKUP_ERROR: "lookup_error",
});

module.exports = {
  MAX_IMAGE_BYTES,
  MAX_DOCUMENT_BYTES,
  MAX_ANY_BYTES,
  ALLOWED_MIME,
  REJECTED_MIME,
  VISIBILITY,
  ASSET_STATUS,
  DEFAULT_PUBLIC_BUCKET,
  DEFAULT_PRIVATE_BUCKET,
  PUBLIC_MEDIA_PATH_PREFIX,
  STATUS,
};
