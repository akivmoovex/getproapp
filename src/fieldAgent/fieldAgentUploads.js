"use strict";

const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const sharp = require("sharp");

const REPO_ROOT = path.join(__dirname, "..", "..");
const UPLOAD_PUBLIC = path.join(REPO_ROOT, "public", "uploads", "field-agent");

const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

/**
 * Save images under public/uploads/field-agent (served as static /uploads/field-agent/...).
 * @returns {Promise<string[]>} public URL paths
 */
async function saveJpegImages(tenantId, submissionId, files, { maxFiles = 10 } = {}) {
  ensureDir(UPLOAD_PUBLIC);
  const tid = String(tenantId);
  const sid = String(submissionId);
  const baseDir = path.join(UPLOAD_PUBLIC, tid, sid);
  ensureDir(baseDir);
  const urls = [];
  const list = (files || []).slice(0, maxFiles);
  for (const f of list) {
    if (!f || !f.buffer || f.buffer.length < 8) continue;
    if (f.buffer.length > MAX_IMAGE_BYTES) continue;
    const mime = String(f.mimetype || "").toLowerCase();
    if (!/^image\/(jpeg|jpg|png|webp|gif)$/i.test(mime)) continue;

    const name = `${Date.now()}_${crypto.randomBytes(4).toString("hex")}.jpg`;
    const abs = path.join(baseDir, name);
    await sharp(f.buffer)
      .rotate()
      .resize({ width: 1600, height: 1600, fit: "inside", withoutEnlargement: true })
      .jpeg({ quality: 80, mozjpeg: true })
      .toFile(abs);
    urls.push(`/uploads/field-agent/${tid}/${sid}/${name}`);
    if (urls.length >= maxFiles) break;
  }
  return urls;
}

module.exports = {
  saveJpegImages,
  MAX_IMAGE_BYTES,
};
