"use strict";

const crypto = require("crypto");
const instanceRepo = require("./instanceRepository");
const { recordWebsiteAudit } = require("./auditService");
const { safeExternalUrl } = require("./safeValues");

const RESULT = Object.freeze({
  OK: "ok",
  INVALID_INPUT: "invalid_input",
  NOT_FOUND: "media_not_found",
  TENANT_MISMATCH: "tenant_mismatch",
  IN_USE: "media_in_use_published",
  UNSAFE_TYPE: "unsafe_media_type",
  TOO_LARGE: "media_too_large",
  INVALID_URL: "invalid_media_url",
});

const ALLOWED_IMAGE_MIME = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);
const REJECTED_MIME = /^(application\/x-msdownload|application\/x-executable|application\/x-sh|text\/html|image\/svg\+xml)/i;
const MAX_BYTES = 5 * 1024 * 1024;

function detectMimeFromSignature(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 4) return null;
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return "image/jpeg";
  if (
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47
  ) {
    return "image/png";
  }
  if (
    buffer.length >= 6 &&
    buffer[0] === 0x47 &&
    buffer[1] === 0x49 &&
    buffer[2] === 0x46 &&
    buffer[3] === 0x38
  ) {
    return "image/gif";
  }
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
  return null;
}

function sanitizeFilename(name) {
  let base = String(name == null ? "file" : name).split(/[/\\]/).pop() || "file";
  base = base.replace(/[^a-zA-Z0-9._-]+/g, "_").slice(0, 180);
  if (!base || base === "." || base === "..") base = "file";
  return base;
}

function mapMedia(row) {
  if (!row) return null;
  return {
    id: row.id,
    organizationId: row.organization_id,
    instanceId: row.instance_id,
    uploaderIdentityId: row.uploader_identity_id,
    mediaKind: row.media_kind,
    originalFilename: row.original_filename,
    storageKey: row.storage_key,
    mimeType: row.mime_type,
    sizeBytes: Number(row.size_bytes) || 0,
    widthPx: row.width_px,
    heightPx: row.height_px,
    altText: row.alt_text,
    externalUrl: row.external_url,
    status: row.status,
    sha256: row.sha256,
    createdAt: row.created_at,
  };
}

async function registerWebsiteMedia(db, input) {
  const organizationId = String((input && input.organizationId) || "");
  const instance = await instanceRepo.findWebsiteInstanceById(db, input.instanceId, organizationId);
  if (!instance) return { ok: false, code: "website_instance_not_found", media: null };

  const kind = String((input && input.mediaKind) || "image").trim();
  if (kind === "video_url") {
    const url = safeExternalUrl(input.externalUrl);
    if (!url || !/^https:\/\//i.test(url)) {
      return { ok: false, code: RESULT.INVALID_URL, media: null };
    }
    const rows = await db.query(
      `INSERT INTO platform.website_media (
         organization_id, instance_id, uploader_identity_id, media_kind,
         original_filename, storage_key, mime_type, size_bytes, alt_text, external_url, status
       ) VALUES ($1,$2,$3,'video_url',$4,$5,'video/url',0,$6,$7,'active')
       RETURNING *`,
      [
        organizationId,
        instance.id,
        input.actorIdentityId || null,
        sanitizeFilename(input.originalFilename || "video"),
        `video/${organizationId}/${crypto.randomUUID()}`,
        input.altText || null,
        url,
      ]
    );
    const media = mapMedia(rows.rows[0]);
    await recordWebsiteAudit(db, {
      organizationId,
      instanceId: instance.id,
      actorIdentityId: input.actorIdentityId || null,
      actionKey: "website.media.upload",
      mediaId: media.id,
    });
    return { ok: true, media };
  }

  const buffer = input.buffer || null;
  let mime = String(input.mimeType || "").trim().toLowerCase();
  if (buffer) {
    const detected = detectMimeFromSignature(buffer);
    if (!detected) return { ok: false, code: RESULT.UNSAFE_TYPE, media: null };
    if (mime && mime !== detected) return { ok: false, code: RESULT.UNSAFE_TYPE, media: null };
    mime = detected;
    if (buffer.length > MAX_BYTES) return { ok: false, code: RESULT.TOO_LARGE, media: null };
  }
  if (REJECTED_MIME.test(mime) || (kind === "image" && !ALLOWED_IMAGE_MIME.has(mime))) {
    return { ok: false, code: RESULT.UNSAFE_TYPE, media: null };
  }
  const sizeBytes = buffer ? buffer.length : Number(input.sizeBytes) || 0;
  if (sizeBytes > MAX_BYTES) return { ok: false, code: RESULT.TOO_LARGE, media: null };

  const filename = sanitizeFilename(input.originalFilename);
  const storageKey =
    input.storageKey ||
    `website/${organizationId}/${instance.id}/${crypto.randomUUID()}-${filename}`;
  const sha256 = buffer ? crypto.createHash("sha256").update(buffer).digest("hex") : null;

  const rows = await db.query(
    `INSERT INTO platform.website_media (
       organization_id, instance_id, uploader_identity_id, media_kind,
       original_filename, storage_key, mime_type, size_bytes, alt_text, external_url, status, sha256
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'active',$11)
     RETURNING *`,
    [
      organizationId,
      instance.id,
      input.actorIdentityId || null,
      kind,
      filename,
      storageKey,
      mime || "application/octet-stream",
      sizeBytes,
      input.altText || null,
      input.externalUrl || null,
      sha256,
    ]
  );
  const media = mapMedia(rows.rows[0]);
  await recordWebsiteAudit(db, {
    organizationId,
    instanceId: instance.id,
    actorIdentityId: input.actorIdentityId || null,
    actionKey: "website.media.upload",
    mediaId: media.id,
  });
  return { ok: true, media };
}

async function getWebsiteMedia(db, input) {
  const rows = await db.query(
    `SELECT * FROM platform.website_media
      WHERE id = $1 AND organization_id = $2
      LIMIT 1`,
    [input.mediaId, input.organizationId]
  );
  const media = mapMedia(rows.rows[0] || null);
  if (!media) return { ok: false, code: RESULT.NOT_FOUND, media: null };
  return { ok: true, media };
}

async function listWebsiteMedia(db, input) {
  const rows = await db.query(
    `SELECT * FROM platform.website_media
      WHERE organization_id = $1 AND instance_id = $2 AND status = 'active'
      ORDER BY created_at DESC`,
    [input.organizationId, input.instanceId]
  );
  return { ok: true, media: rows.rows.map(mapMedia) };
}

async function recordMediaUsage(db, input) {
  await db.query(
    `INSERT INTO platform.website_media_usages (
       organization_id, media_id, instance_id, content_key, usage_kind
     ) VALUES ($1,$2,$3,$4,$5)
     ON CONFLICT (media_id, instance_id, content_key, usage_kind) DO NOTHING`,
    [input.organizationId, input.mediaId, input.instanceId, input.contentKey, input.usageKind || "draft"]
  );
}

async function isPublishedInUse(db, mediaId, organizationId) {
  const rows = await db.query(
    `SELECT 1 FROM platform.website_media_usages
      WHERE media_id = $1 AND organization_id = $2 AND usage_kind = 'published'
      LIMIT 1`,
    [mediaId, organizationId]
  );
  if (rows.rowCount) return true;
  const published = await db.query(
    `SELECT 1 FROM platform.website_content
      WHERE organization_id = $1
        AND published_value IS NOT NULL
        AND published_value::text LIKE $2
      LIMIT 1`,
    [organizationId, `%${mediaId}%`]
  );
  return published.rowCount > 0;
}

async function archiveWebsiteMedia(db, input) {
  const loaded = await getWebsiteMedia(db, input);
  if (!loaded.ok) return loaded;
  if (loaded.media.organizationId !== input.organizationId) {
    return { ok: false, code: RESULT.TENANT_MISMATCH };
  }
  if (await isPublishedInUse(db, loaded.media.id, input.organizationId)) {
    return { ok: false, code: RESULT.IN_USE, media: loaded.media };
  }
  await db.query(
    `UPDATE platform.website_media SET status = 'archived' WHERE id = $1 AND organization_id = $2`,
    [loaded.media.id, input.organizationId]
  );
  await recordWebsiteAudit(db, {
    organizationId: input.organizationId,
    instanceId: loaded.media.instanceId,
    actorIdentityId: input.actorIdentityId || null,
    actionKey: "website.media.delete",
    mediaId: loaded.media.id,
  });
  return { ok: true, media: { ...loaded.media, status: "archived" } };
}

function listOrphanCandidates() {
  return { ok: true, strategy: "manual_review", autoDelete: false };
}

module.exports = {
  RESULT,
  MAX_BYTES,
  ALLOWED_IMAGE_MIME,
  detectMimeFromSignature,
  sanitizeFilename,
  registerWebsiteMedia,
  getWebsiteMedia,
  listWebsiteMedia,
  recordMediaUsage,
  archiveWebsiteMedia,
  isPublishedInUse,
  listOrphanCandidates,
};
