"use strict";

const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const {
  ALLOWED_MIME_TYPES,
  MAX_ATTACHMENT_BYTES,
  MAX_ATTACHMENTS_PER_ITEM,
  createBroadcastAttachment,
  countAttachmentsForBroadcast,
} = require("../db/pg/church/broadcastAttachmentsRepo");

const UPLOAD_ROOT = path.join(__dirname, "..", "..", "data", "uploads", "church", "broadcasts");
const ANNOUNCEMENT_UPLOAD_ROOT = path.join(__dirname, "..", "..", "data", "uploads", "church", "announcements");

const EXT_MIME = {
  ".pdf": "application/pdf",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".doc": "application/msword",
  ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
};

function ensureUploadRoot() {
  fs.mkdirSync(UPLOAD_ROOT, { recursive: true });
}

function safeOriginalName(name) {
  return String(name || "file")
    .replace(/[/\\?%*:|"<>]/g, "_")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 180) || "file";
}

function resolveMime(file) {
  const ext = path.extname(String(file.originalname || "")).toLowerCase();
  const fromExt = EXT_MIME[ext] || null;
  const fromMulter = String(file.mimetype || "").toLowerCase();
  if (fromExt && ALLOWED_MIME_TYPES.has(fromExt)) {
    if (!fromMulter || fromMulter === fromExt || fromMulter === "application/octet-stream") {
      return fromExt;
    }
    if (fromMulter === "image/jpg" && fromExt === "image/jpeg") return fromExt;
  }
  if (ALLOWED_MIME_TYPES.has(fromMulter)) return fromMulter;
  return null;
}

/**
 * Resolve relative stored_filename to absolute path under UPLOAD_ROOT.
 * @returns {string | null}
 */
function absolutePathForStoredFilename(storedFilename) {
  return absolutePathUnderRoot(UPLOAD_ROOT, storedFilename);
}

/**
 * @returns {string | null}
 */
function absolutePathForAnnouncementStoredFilename(storedFilename) {
  return absolutePathUnderRoot(ANNOUNCEMENT_UPLOAD_ROOT, storedFilename);
}

function absolutePathUnderRoot(rootDir, storedFilename) {
  const rel = String(storedFilename || "").replace(/^[/\\]+/, "");
  if (!rel || rel.includes("..")) return null;
  const abs = path.resolve(rootDir, rel);
  const root = path.resolve(rootDir);
  if (abs !== root && !abs.startsWith(root + path.sep)) return null;
  return abs;
}

/**
 * Save multer memory files for a broadcast. Skips invalid files.
 * @returns {Promise<{ saved: number, skipped: number, error: string | null }>}
 */
async function saveBroadcastAttachments(pool, { organizationId, broadcastId, adminId, files }) {
  const list = Array.isArray(files) ? files : [];
  if (!list.length) return { saved: 0, skipped: 0, error: null };

  const existing = await countAttachmentsForBroadcast(pool, broadcastId, organizationId);
  const remaining = Math.max(MAX_ATTACHMENTS_PER_ITEM - existing, 0);
  if (remaining <= 0) {
    return { saved: 0, skipped: list.length, error: `Maximum of ${MAX_ATTACHMENTS_PER_ITEM} attachments allowed.` };
  }

  ensureUploadRoot();
  const dirRel = `${organizationId}/${broadcastId}`;
  const dirAbs = path.join(UPLOAD_ROOT, String(organizationId), String(broadcastId));
  fs.mkdirSync(dirAbs, { recursive: true });

  let saved = 0;
  let skipped = 0;
  let error = null;

  for (const file of list.slice(0, remaining)) {
    const mime = resolveMime(file);
    const size = Number(file.size || (file.buffer && file.buffer.length) || 0);
    if (!mime || !file.buffer || size <= 0 || size > MAX_ATTACHMENT_BYTES) {
      skipped += 1;
      continue;
    }
    const original = safeOriginalName(file.originalname);
    const ext = path.extname(original).toLowerCase() || Object.keys(EXT_MIME).find((e) => EXT_MIME[e] === mime) || "";
    const storedName = `${Date.now()}_${crypto.randomBytes(6).toString("hex")}${ext}`;
    const storedFilename = `${dirRel}/${storedName}`.replace(/\\/g, "/");
    const abs = path.join(dirAbs, storedName);
    fs.writeFileSync(abs, file.buffer);
    await createBroadcastAttachment(pool, {
      organization_id: organizationId,
      broadcast_id: broadcastId,
      original_filename: original,
      stored_filename: storedFilename,
      mime_type: mime,
      file_size: size,
      created_by_hq_admin_id: adminId,
    });
    saved += 1;
  }

  if (list.length > remaining) {
    skipped += list.length - remaining;
    error = `Only ${MAX_ATTACHMENTS_PER_ITEM} attachments are allowed per broadcast.`;
  } else if (skipped && !saved) {
    error = "One or more attachments were rejected. Use PDF, PNG, JPG, DOC, or DOCX up to 5 MB.";
  }

  return { saved, skipped, error };
}

function unlinkStoredFilename(storedFilename) {
  const abs = absolutePathForStoredFilename(storedFilename);
  if (!abs) return;
  try {
    if (fs.existsSync(abs)) fs.unlinkSync(abs);
  } catch {
    // best-effort cleanup
  }
}

module.exports = {
  UPLOAD_ROOT,
  ANNOUNCEMENT_UPLOAD_ROOT,
  MAX_ATTACHMENT_BYTES,
  MAX_ATTACHMENTS_PER_ITEM,
  ALLOWED_MIME_TYPES,
  absolutePathForStoredFilename,
  absolutePathForAnnouncementStoredFilename,
  saveBroadcastAttachments,
  unlinkStoredFilename,
};
