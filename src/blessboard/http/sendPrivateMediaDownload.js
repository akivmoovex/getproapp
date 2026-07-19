"use strict";

/**
 * Safe private media download headers (nosniff, attachment disposition).
 * Filename is sanitized for Content-Disposition (no CRLF / quotes).
 *
 * @param {import('express').Response} res
 * @param {{ asset?: object, buffer: Buffer }} delivered
 */
function sendPrivateMediaDownload(res, delivered) {
  const asset = delivered.asset || {};
  const mime = asset.mimeType || asset.contentType || "application/octet-stream";
  const rawName = String(asset.originalFilename || "download")
    .replace(/[\r\n"]/g, "")
    .slice(0, 180);
  const filename = rawName || "download";
  res.setHeader("Content-Type", mime);
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Cache-Control", "private, no-store");
  res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
  return res.status(200).send(delivered.buffer);
}

module.exports = {
  sendPrivateMediaDownload,
};
