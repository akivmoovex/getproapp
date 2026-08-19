"use strict";

const crypto = require("crypto");
const instanceRepo = require("./instanceRepository");
const { recordWebsiteAudit } = require("./auditService");
const { safeExternalUrl } = require("./safeValues");
const { assertWebsiteInstanceScope } = require("./authorizeWebsite");

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
const MEDIA_UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const CLINIC_MEDIA_PATH_RE =
  /^\/clinics\/([^/]+)\/website\/media\/([0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})$/i;
const TEMPLATE_ASSET_PREFIX = "/activeclinic/assets/";

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
  const scoped = assertWebsiteInstanceScope(instance, input);
  if (!scoped.ok) {
    return {
      ok: false,
      code: scoped.code === "tenant_mismatch" ? RESULT.TENANT_MISMATCH : "website_instance_not_found",
      media: null,
    };
  }

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
  const params = [
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
    buffer || null,
  ];
  let rows;
  try {
    rows = await db.query(
      `INSERT INTO platform.website_media (
         organization_id, instance_id, uploader_identity_id, media_kind,
         original_filename, storage_key, mime_type, size_bytes, alt_text, external_url, status, sha256,
         payload_bytes
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'active',$11,$12)
       RETURNING *`,
      params
    );
  } catch (err) {
    if (!err || err.code !== "42703") throw err;
    rows = await db.query(
      `INSERT INTO platform.website_media (
         organization_id, instance_id, uploader_identity_id, media_kind,
         original_filename, storage_key, mime_type, size_bytes, alt_text, external_url, status, sha256
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'active',$11)
       RETURNING *`,
      params.slice(0, 11)
    );
  }
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
    `SELECT id, organization_id, instance_id, uploader_identity_id, media_kind,
            original_filename, storage_key, mime_type, size_bytes, width_px, height_px,
            alt_text, external_url, status, sha256, created_at
       FROM platform.website_media
      WHERE id = $1 AND organization_id = $2
      LIMIT 1`,
    [input.mediaId, input.organizationId]
  );
  const media = mapMedia(rows.rows[0] || null);
  if (!media) return { ok: false, code: RESULT.NOT_FOUND, media: null };
  return { ok: true, media };
}

async function getWebsiteMediaById(db, mediaId) {
  const rows = await db.query(
    `SELECT id, organization_id, instance_id, uploader_identity_id, media_kind,
            original_filename, storage_key, mime_type, size_bytes, width_px, height_px,
            alt_text, external_url, status, sha256, created_at
       FROM platform.website_media
      WHERE id = $1
      LIMIT 1`,
    [mediaId]
  );
  const media = mapMedia(rows.rows[0] || null);
  if (!media) return { ok: false, code: RESULT.NOT_FOUND, media: null };
  return { ok: true, media };
}

async function getWebsiteMediaPayload(db, input) {
  try {
    const rows = await db.query(
      `SELECT payload_bytes, mime_type, original_filename, status, organization_id
         FROM platform.website_media
        WHERE id = $1 AND organization_id = $2
        LIMIT 1`,
      [input.mediaId, input.organizationId]
    );
    const row = rows.rows[0];
    if (!row || row.status !== "active" || !row.payload_bytes) {
      return { ok: false, code: RESULT.NOT_FOUND, buffer: null, mimeType: null };
    }
    return {
      ok: true,
      buffer: row.payload_bytes,
      mimeType: row.mime_type,
      filename: row.original_filename,
    };
  } catch (err) {
    if (err && err.code === "42703") {
      return { ok: false, code: RESULT.NOT_FOUND, buffer: null, mimeType: null };
    }
    throw err;
  }
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

function ownedClinicMediaSrc(instance, mediaId) {
  return `/clinics/${instance.slug}/website/media/${mediaId}`;
}

function isUnsafeImageSrc(src) {
  const raw = String(src || "").trim().toLowerCase();
  return (
    raw.startsWith("blob:") ||
    raw.startsWith("data:") ||
    raw.startsWith("javascript:") ||
    raw.startsWith("vbscript:") ||
    raw.startsWith("//")
  );
}

/**
 * Ensure an IMAGE content value points at this tenant's media (or a template/https source).
 * Rewrites clinic media `src` to the owned delivery path. Does not leak other tenants.
 */
async function assertOwnedWebsiteImageValue(db, input) {
  const value = input && input.value;
  const instance = input && input.instance;
  const organizationId = String((input && input.organizationId) || "");
  if (!instance || !organizationId) {
    return { ok: false, code: RESULT.INVALID_INPUT, value: null };
  }
  if (value == null || typeof value !== "object" || Array.isArray(value)) {
    return { ok: true, value };
  }
  const mediaIdRaw = value.mediaId || value.media_id || null;
  const mediaId = mediaIdRaw ? String(mediaIdRaw).trim() : "";
  const src = value.src ? String(value.src).trim() : "";

  if (src && isUnsafeImageSrc(src)) {
    return { ok: false, code: RESULT.INVALID_URL, value: null };
  }

  async function loadOwned(candidateId) {
    if (!MEDIA_UUID_RE.test(candidateId)) {
      return { ok: false, code: RESULT.INVALID_INPUT };
    }
    const loaded = await getWebsiteMedia(db, { mediaId: candidateId, organizationId });
    if (!loaded.ok || loaded.media.status !== "active") {
      return { ok: false, code: RESULT.NOT_FOUND };
    }
    if (loaded.media.instanceId !== instance.id) {
      return { ok: false, code: RESULT.TENANT_MISMATCH };
    }
    return { ok: true, media: loaded.media };
  }

  if (mediaId) {
    const owned = await loadOwned(mediaId);
    if (!owned.ok) return { ok: false, code: owned.code, value: null };
    return {
      ok: true,
      value: {
        ...value,
        mediaId: owned.media.id,
        src: ownedClinicMediaSrc(instance, owned.media.id),
      },
    };
  }

  const clinicMatch = src.match(CLINIC_MEDIA_PATH_RE);
  if (clinicMatch) {
    if (clinicMatch[1] !== instance.slug) {
      return { ok: false, code: RESULT.TENANT_MISMATCH, value: null };
    }
    const owned = await loadOwned(clinicMatch[2]);
    if (!owned.ok) return { ok: false, code: owned.code, value: null };
    return {
      ok: true,
      value: {
        ...value,
        mediaId: owned.media.id,
        src: ownedClinicMediaSrc(instance, owned.media.id),
      },
    };
  }

  if (src.startsWith("/clinics/")) {
    return { ok: false, code: RESULT.TENANT_MISMATCH, value: null };
  }
  if (!src || src.startsWith(TEMPLATE_ASSET_PREFIX) || /^https:\/\//i.test(src)) {
    return { ok: true, value };
  }
  if (src.startsWith("/") && !src.startsWith("//")) {
    return { ok: true, value };
  }
  return { ok: false, code: RESULT.INVALID_URL, value: null };
}

/**
 * Active media not referenced in draft or published JSON. Never auto-deletes.
 */
async function listOrphanCandidates(db, input) {
  const empty = { ok: true, strategy: "manual_review", autoDelete: false, media: [] };
  if (!db || typeof db.query !== "function" || !input || !input.organizationId || !input.instanceId) {
    return empty;
  }
  const rows = await db.query(
    `SELECT m.id, m.original_filename, m.mime_type, m.size_bytes, m.created_at
       FROM platform.website_media m
      WHERE m.organization_id = $1
        AND m.instance_id = $2
        AND m.status = 'active'
        AND NOT EXISTS (
          SELECT 1
            FROM platform.website_content c
           WHERE c.organization_id = m.organization_id
             AND c.instance_id = m.instance_id
             AND (
               (c.draft_value IS NOT NULL AND c.draft_value::text LIKE '%' || m.id::text || '%')
               OR (c.published_value IS NOT NULL AND c.published_value::text LIKE '%' || m.id::text || '%')
             )
        )
      ORDER BY m.created_at ASC`,
    [input.organizationId, input.instanceId]
  );
  return {
    ...empty,
    media: rows.rows.map((row) => ({
      id: row.id,
      originalFilename: row.original_filename,
      mimeType: row.mime_type,
      sizeBytes: Number(row.size_bytes) || 0,
      createdAt: row.created_at,
    })),
  };
}

module.exports = {
  RESULT,
  MAX_BYTES,
  ALLOWED_IMAGE_MIME,
  detectMimeFromSignature,
  sanitizeFilename,
  registerWebsiteMedia,
  getWebsiteMedia,
  getWebsiteMediaById,
  getWebsiteMediaPayload,
  listWebsiteMedia,
  recordMediaUsage,
  archiveWebsiteMedia,
  isPublishedInUse,
  assertOwnedWebsiteImageValue,
  listOrphanCandidates,
};
