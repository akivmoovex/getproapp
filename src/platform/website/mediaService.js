"use strict";

const crypto = require("crypto");
const instanceRepo = require("./instanceRepository");
const { recordWebsiteAudit } = require("./auditService");
const { safeExternalUrl } = require("./safeValues");
const { assertWebsiteInstanceScope } = require("./authorizeWebsite");
const { PRODUCT_CODE, publicWebsitePathPrefix } = require("./publicWebsiteUrl");
const {
  PROVIDER_HOSTINGER,
  PROVIDER_DATABASE,
  resolveHostingerMediaConfig,
  buildPublicMediaUrl,
} = require("../media/hostingerMediaConfig");
const { createHostingerMediaStorage } = require("../media/hostingerMediaStorage");
const {
  presentCdnUrl,
  presentRuntimeImageSrc,
  presentImageValue,
  resolveCdnPublicBaseUrl,
  parseAppMediatedMediaSrc,
} = require("../media/cdnMediaPresentation");

const {
  MEDIA_LIMITS,
  ALLOWED_IMAGE_MIME: SHARED_ALLOWED_IMAGE_MIME,
  validateImageUpload,
} = require("../validation/sharedFieldValidators");

const RESULT = Object.freeze({
  OK: "ok",
  INVALID_INPUT: "invalid_input",
  NOT_FOUND: "media_not_found",
  TENANT_MISMATCH: "tenant_mismatch",
  IN_USE: "media_in_use",
  IN_USE_PUBLISHED: "media_in_use_published",
  IN_USE_DRAFT: "media_in_use_draft",
  UNSAFE_TYPE: "unsafe_media_type",
  TOO_LARGE: "media_too_large",
  INVALID_URL: "invalid_media_url",
});

const ALLOWED_IMAGE_MIME = SHARED_ALLOWED_IMAGE_MIME;
const REJECTED_MIME = /^(application\/x-msdownload|application\/x-executable|application\/x-sh|text\/html|image\/svg\+xml)/i;
const MAX_BYTES = MEDIA_LIMITS.maxBytes;
const MEDIA_UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const CLINIC_MEDIA_PATH_RE =
  /^\/clinics\/([^/]+)\/website\/media\/([0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})$/i;
const BLESSBOARD_MEDIA_PATH_RE =
  /^\/c\/([^/]+)\/website\/media\/([0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})$/i;
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
    storageProvider: String(row.storage_provider || PROVIDER_DATABASE).trim() || PROVIDER_DATABASE,
    mimeType: row.mime_type,
    sizeBytes: Number(row.size_bytes) || 0,
    widthPx: row.width_px,
    heightPx: row.height_px,
    altText: row.alt_text,
    externalUrl: row.external_url,
    status: row.status,
    sha256: row.sha256,
    createdAt: row.created_at,
    // Shared media folders; null means Unfiled.
    folderId: row.folder_id == null ? null : row.folder_id,
  };
}

/**
 * @param {NodeJS.ProcessEnv} [env]
 */
function resolveMediaStorage(env) {
  const cfg = resolveHostingerMediaConfig(env || process.env);
  if (!cfg.enabled) {
    return { cfg, storage: null, provider: PROVIDER_DATABASE };
  }
  return {
    cfg,
    storage: createHostingerMediaStorage(env || process.env, { config: cfg }),
    provider: PROVIDER_HOSTINGER,
  };
}

/**
 * Hostinger object keys live under testing/|production/. Never invent CDN URLs for
 * legacy database-payload keys (website/...).
 * @param {string|null|undefined} storageKey
 * @returns {boolean}
 */
function isCdnObjectStorageKey(storageKey) {
  return /^(testing(?:-v8)?|production)\//.test(String(storageKey || ""));
}

/**
 * Public URL for website media — CDN absolute URL when Hostinger-backed.
 * Legacy database-payload rows keep an app-mediated path only until migrated;
 * renderers must still run presentRuntimeImageSrc (which nulls app paths without
 * a storage key). Prefer presentWebsiteMediaForClient for API/HTML.
 * @param {{ productCode?: string, slug?: string }|null} instance
 * @param {object|null|undefined} media
 * @param {NodeJS.ProcessEnv} [env]
 * @returns {string|null}
 */
function resolveWebsiteMediaPublicSrc(instance, media, env) {
  if (!media || !media.id) return null;
  if (String(media.storageProvider || "") === PROVIDER_HOSTINGER && media.storageKey) {
    const cdn = presentCdnUrl(media.storageKey, env);
    if (cdn) return cdn;
    const cfg = resolveHostingerMediaConfig(env || process.env);
    const url = buildPublicMediaUrl(media.storageKey, {
      publicBaseUrl: cfg.publicBaseUrl,
      publicMountPath: cfg.publicMountPath,
    });
    // Never present relative /media to clients when a CDN base exists or can be derived.
    if (url && /^https:\/\//i.test(url)) return url;
    if (url && url.startsWith("/media/")) {
      const rewritten = presentRuntimeImageSrc(url, env);
      if (rewritten) return rewritten;
    }
  }
  // Hostinger row with a CDN object key but missing provider label — still present CDN.
  if (isCdnObjectStorageKey(media.storageKey)) {
    const cdn = presentCdnUrl(media.storageKey, env);
    if (cdn) return cdn;
  }
  // Database-payload fallback: no CDN object yet — do not emit /media.
  // App route remains for authenticated/ops delivery + 302 upgrade after migration.
  return websiteMediaDeliveryPath(instance, media.id);
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
  if (kind === "image") {
    if (!Buffer.isBuffer(buffer) || buffer.length < 4) {
      return { ok: false, code: RESULT.UNSAFE_TYPE, media: null };
    }
  }
  if (buffer) {
    const detected = detectMimeFromSignature(buffer);
    if (!detected) return { ok: false, code: RESULT.UNSAFE_TYPE, media: null };
    if (mime && mime !== "application/octet-stream" && mime !== detected) {
      return { ok: false, code: RESULT.UNSAFE_TYPE, media: null };
    }
    mime = detected;
    const sized = validateImageUpload(
      { mimeType: mime, sizeBytes: buffer.length, buffer },
      { maxBytes: MAX_BYTES }
    );
    if (!sized.ok) {
      return {
        ok: false,
        code: sized.code === "media_too_large" ? RESULT.TOO_LARGE : RESULT.UNSAFE_TYPE,
        media: null,
      };
    }
  }
  if (REJECTED_MIME.test(mime) || (kind === "image" && !ALLOWED_IMAGE_MIME.has(mime))) {
    return { ok: false, code: RESULT.UNSAFE_TYPE, media: null };
  }
  const sizeBytes = buffer ? buffer.length : Number(input.sizeBytes) || 0;
  if (sizeBytes > MAX_BYTES) return { ok: false, code: RESULT.TOO_LARGE, media: null };
  if (!mime || mime === "application/octet-stream") {
    return { ok: false, code: RESULT.UNSAFE_TYPE, media: null };
  }

  const filename = sanitizeFilename(input.originalFilename);
  const sha256 = buffer ? crypto.createHash("sha256").update(buffer).digest("hex") : null;
  const mediaId = crypto.randomUUID();
  const env = (input && input.env) || process.env;
  const { storage, provider, cfg } = resolveMediaStorage(env);

  let storageProvider = PROVIDER_DATABASE;
  let storageKey =
    input.storageKey ||
    `website/${organizationId}/${instance.id}/${mediaId}-${filename}`;
  let payloadBuffer = buffer || null;

  if (kind === "image" && buffer && storage && provider === PROVIDER_HOSTINGER) {
    try {
      const stored = await storage.storeMedia({
        productCode: instance.productCode,
        organizationId,
        mediaId,
        mimeType: mime,
        buffer,
      });
      storageProvider = PROVIDER_HOSTINGER;
      storageKey = stored.storageKey;
      payloadBuffer = null;
    } catch (err) {
      if (
        err &&
        (err.code === "REFUSED_PRODUCTION_MEDIA_NAMESPACE" ||
          err.code === "MEDIA_STORAGE_ROOT_NOT_PERSISTENT" ||
          err.code === "MEDIA_STORAGE_ROOT_NOT_WRITABLE" ||
          err.code === "MEDIA_STORAGE_ROOT_OUTSIDE_ACCOUNT_HOME" ||
          err.code === "MEDIA_STORAGE_ROOT_UNSET")
      ) {
        return { ok: false, code: err.code, media: null };
      }
      throw err;
    }
  }

  const baseParams = [
    mediaId,
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
  ];

  let rows;
  try {
    rows = await db.query(
      `INSERT INTO platform.website_media (
         id, organization_id, instance_id, uploader_identity_id, media_kind,
         original_filename, storage_key, mime_type, size_bytes, alt_text, external_url, status, sha256,
         storage_provider, payload_bytes
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,'active',$12,$13,$14)
       RETURNING *`,
      [...baseParams, storageProvider, payloadBuffer]
    );
  } catch (err) {
    if (!err || err.code !== "42703") {
      if (storageProvider === PROVIDER_HOSTINGER && storage && storageKey) {
        try {
          await storage.deleteMedia({ storageKey });
        } catch {
          /* orphan cleanup later */
        }
      }
      throw err;
    }
    // Pre-035 schema: no storage_provider column — keep database payload path.
    if (storageProvider === PROVIDER_HOSTINGER && storage && storageKey) {
      try {
        await storage.deleteMedia({ storageKey });
      } catch {
        /* ignore */
      }
      storageProvider = PROVIDER_DATABASE;
      storageKey =
        input.storageKey ||
        `website/${organizationId}/${instance.id}/${mediaId}-${filename}`;
      payloadBuffer = buffer || null;
    }
    try {
      rows = await db.query(
        `INSERT INTO platform.website_media (
           id, organization_id, instance_id, uploader_identity_id, media_kind,
           original_filename, storage_key, mime_type, size_bytes, alt_text, external_url, status, sha256,
           payload_bytes
         ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,'active',$12,$13)
         RETURNING *`,
        [
          mediaId,
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
          payloadBuffer,
        ]
      );
    } catch (err2) {
      if (!err2 || err2.code !== "42703") throw err2;
      rows = await db.query(
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
    }
  }
  const media = mapMedia(rows.rows[0]);
  if (storageProvider === PROVIDER_HOSTINGER && storageKey) {
    media.publicSrc = presentCdnUrl(storageKey, env) || null;
    media.previewUrl = media.publicSrc;
  }
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
  let rows;
  try {
    rows = await db.query(
      `SELECT id, organization_id, instance_id, uploader_identity_id, media_kind,
              original_filename, storage_key, storage_provider, mime_type, size_bytes, width_px, height_px,
              alt_text, external_url, status, sha256, created_at
         FROM platform.website_media
        WHERE id = $1 AND organization_id = $2
        LIMIT 1`,
      [input.mediaId, input.organizationId]
    );
  } catch (err) {
    if (!err || err.code !== "42703") throw err;
    rows = await db.query(
      `SELECT id, organization_id, instance_id, uploader_identity_id, media_kind,
              original_filename, storage_key, mime_type, size_bytes, width_px, height_px,
              alt_text, external_url, status, sha256, created_at
         FROM platform.website_media
        WHERE id = $1 AND organization_id = $2
        LIMIT 1`,
      [input.mediaId, input.organizationId]
    );
  }
  const media = mapMedia(rows.rows[0] || null);
  if (!media) return { ok: false, code: RESULT.NOT_FOUND, media: null };
  return { ok: true, media };
}

async function getWebsiteMediaById(db, mediaId) {
  let rows;
  try {
    rows = await db.query(
      `SELECT id, organization_id, instance_id, uploader_identity_id, media_kind,
              original_filename, storage_key, storage_provider, mime_type, size_bytes, width_px, height_px,
              alt_text, external_url, status, sha256, created_at
         FROM platform.website_media
        WHERE id = $1
        LIMIT 1`,
      [mediaId]
    );
  } catch (err) {
    if (!err || err.code !== "42703") throw err;
    rows = await db.query(
      `SELECT id, organization_id, instance_id, uploader_identity_id, media_kind,
              original_filename, storage_key, mime_type, size_bytes, width_px, height_px,
              alt_text, external_url, status, sha256, created_at
         FROM platform.website_media
        WHERE id = $1
        LIMIT 1`,
      [mediaId]
    );
  }
  const media = mapMedia(rows.rows[0] || null);
  if (!media) return { ok: false, code: RESULT.NOT_FOUND, media: null };
  return { ok: true, media };
}

async function getWebsiteMediaPayload(db, input) {
  const env = (input && input.env) || process.env;
  try {
    let rows;
    try {
      rows = await db.query(
        `SELECT payload_bytes, mime_type, original_filename, status, organization_id,
                storage_provider, storage_key
           FROM platform.website_media
          WHERE id = $1 AND organization_id = $2
          LIMIT 1`,
        [input.mediaId, input.organizationId]
      );
    } catch (err) {
      if (!err || err.code !== "42703") throw err;
      rows = await db.query(
        `SELECT payload_bytes, mime_type, original_filename, status, organization_id
           FROM platform.website_media
          WHERE id = $1 AND organization_id = $2
          LIMIT 1`,
        [input.mediaId, input.organizationId]
      );
    }
    const row = rows.rows[0];
    if (!row || row.status !== "active") {
      return { ok: false, code: RESULT.NOT_FOUND, buffer: null, mimeType: null };
    }
    if (row.payload_bytes) {
      return {
        ok: true,
        buffer: row.payload_bytes,
        mimeType: row.mime_type,
        filename: row.original_filename,
        storageProvider: String(row.storage_provider || PROVIDER_DATABASE),
      };
    }
    const provider = String(row.storage_provider || PROVIDER_DATABASE);
    if (provider === PROVIDER_HOSTINGER && row.storage_key) {
      const { storage } = resolveMediaStorage(env);
      if (!storage) {
        return { ok: false, code: RESULT.NOT_FOUND, buffer: null, mimeType: null };
      }
      try {
        const buffer = await storage.readMedia(row.storage_key);
        return {
          ok: true,
          buffer,
          mimeType: row.mime_type,
          filename: row.original_filename,
          storageProvider: PROVIDER_HOSTINGER,
        };
      } catch {
        return { ok: false, code: RESULT.NOT_FOUND, buffer: null, mimeType: null };
      }
    }
    return { ok: false, code: RESULT.NOT_FOUND, buffer: null, mimeType: null };
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

/**
 * True when draft or published content (or usage rows) still reference the media.
 * Soft-archive must not remove shared bytes while either lifecycle side needs them.
 * Prefer published / history classification when both draft and published match.
 */
async function isMediaReferenced(db, mediaId, organizationId) {
  const published = await db.query(
    `SELECT 1 FROM platform.website_content
      WHERE organization_id = $1
        AND published_value IS NOT NULL
        AND published_value::text LIKE $2
      LIMIT 1`,
    [organizationId, `%${mediaId}%`]
  );
  if (published.rowCount) return { referenced: true, kind: "published" };

  const versions = await db.query(
    `SELECT 1 FROM platform.website_versions
      WHERE organization_id = $1
        AND snapshot_json IS NOT NULL
        AND snapshot_json::text LIKE $2
      LIMIT 1`,
    [organizationId, `%${mediaId}%`]
  );
  if (versions.rowCount) return { referenced: true, kind: "version_history" };

  const draft = await db.query(
    `SELECT 1 FROM platform.website_content
      WHERE organization_id = $1
        AND draft_value IS NOT NULL
        AND draft_value::text LIKE $2
      LIMIT 1`,
    [organizationId, `%${mediaId}%`]
  );
  if (draft.rowCount) return { referenced: true, kind: "draft" };

  const usages = await db.query(
    `SELECT usage_kind FROM platform.website_media_usages
      WHERE media_id = $1 AND organization_id = $2
      ORDER BY CASE usage_kind WHEN 'published' THEN 0 WHEN 'draft' THEN 1 ELSE 2 END
      LIMIT 1`,
    [mediaId, organizationId]
  );
  if (usages.rowCount) {
    return { referenced: true, kind: String(usages.rows[0].usage_kind || "usage") };
  }
  return { referenced: false, kind: null };
}

async function archiveWebsiteMedia(db, input) {
  const loaded = await getWebsiteMedia(db, input);
  if (!loaded.ok) return loaded;
  if (loaded.media.organizationId !== input.organizationId) {
    return { ok: false, code: RESULT.TENANT_MISMATCH };
  }
  const ref = await isMediaReferenced(db, loaded.media.id, input.organizationId);
  if (ref.referenced) {
    const code =
      ref.kind === "draft"
        ? RESULT.IN_USE_DRAFT
        : ref.kind === "published" || ref.kind === "version_history"
          ? RESULT.IN_USE_PUBLISHED
          : RESULT.IN_USE;
    return { ok: false, code, media: loaded.media, referenceKind: ref.kind };
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

async function updateWebsiteMediaMeta(db, input) {
  const loaded = await getWebsiteMedia(db, input);
  if (!loaded.ok) return loaded;
  if (loaded.media.organizationId !== String(input.organizationId || "")) {
    return { ok: false, code: RESULT.TENANT_MISMATCH };
  }
  const altText = String((input && input.altText) || "").trim().slice(0, 240);
  await db.query(
    `UPDATE platform.website_media
        SET alt_text = $3
      WHERE id = $1 AND organization_id = $2`,
    [loaded.media.id, input.organizationId, altText || null]
  );
  await recordWebsiteAudit(db, {
    organizationId: input.organizationId,
    instanceId: loaded.media.instanceId,
    actorIdentityId: input.actorIdentityId || null,
    actionKey: "website.media.update",
    mediaId: loaded.media.id,
  });
  return { ok: true, media: { ...loaded.media, altText: altText || null } };
}

function ownedWebsiteMediaSrc(instance, mediaId) {
  const product = String((instance && instance.productCode) || "");
  const prefix = publicWebsitePathPrefix(product) ||
    (product === PRODUCT_CODE.BLESSBOARD ? "/c" : "/clinics");
  const slug = String((instance && instance.slug) || "").trim();
  return `${prefix}/${slug}/website/media/${mediaId}`;
}

function ownedClinicMediaSrc(instance, mediaId) {
  return ownedWebsiteMediaSrc(instance, mediaId);
}

/**
 * Canonical tenant-owned delivery path for a website media asset.
 * @param {{ productCode?: string, slug?: string }|null} instance
 * @param {string} mediaId
 * @returns {string|null}
 */
function websiteMediaDeliveryPath(instance, mediaId) {
  const id = String(mediaId || "").trim();
  if (!instance || !id) return null;
  return ownedWebsiteMediaSrc(instance, id);
}

/**
 * API/picker DTO: storage row plus canonical delivery URLs for the owning instance.
 * @param {{ productCode?: string, slug?: string }|null} instance
 * @param {object|null|undefined} media
 * @returns {object|null}
 */
function presentWebsiteMediaForClient(instance, media, env) {
  if (!media || !media.id) return media || null;
  let path = resolveWebsiteMediaPublicSrc(instance, media, env);
  // Prefer absolute CDN for Hostinger /media keys. Keep app-mediated
  // /c|/clinics/.../website/media/:id paths for database-payload rows — those
  // are the authenticated/public delivery routes until objects live on CDN.
  if (path && path.startsWith("/media/")) {
    const rewritten = presentRuntimeImageSrc(path, env);
    path = rewritten;
  }
  if (!path && isCdnObjectStorageKey(media.storageKey)) {
    path = presentCdnUrl(media.storageKey, env);
  }
  if (!path && media.id) {
    path = websiteMediaDeliveryPath(instance, media.id);
  }
  if (!path) return { ...media, publicSrc: null, previewUrl: null };
  return {
    ...media,
    publicSrc: path,
    previewUrl: path,
  };
}

/**
 * Resolve an IMAGE content value to a CDN src for HTML/JSON renderers.
 * Recovers mediaId-only (or app-mediated) drafts that lost src on save.
 * @param {{ query: Function }} db
 * @param {{
 *   organizationId: string,
 *   instance?: { id?: string, productCode?: string, slug?: string }|null,
 *   value: unknown,
 *   env?: NodeJS.ProcessEnv,
 * }} input
 * @returns {Promise<{ src: string|null, alt: string|null, mediaId: string|null }>}
 */
async function hydrateWebsiteImageValue(db, input) {
  const env = (input && input.env) || process.env;
  const value = input && input.value;
  const organizationId = String((input && input.organizationId) || "");
  const instance = (input && input.instance) || null;
  const presented = presentImageValue(value, env);
  if (presented.src && /^https:\/\//i.test(presented.src)) {
    return presented;
  }

  let mediaId = presented.mediaId ? String(presented.mediaId) : "";
  if (!mediaId && value && typeof value === "object" && !Array.isArray(value) && value.src) {
    const mediated = parseAppMediatedMediaSrc(value.src);
    if (mediated.mediaId) mediaId = mediated.mediaId;
  }
  if (!mediaId && typeof value === "string") {
    const mediated = parseAppMediatedMediaSrc(value);
    if (mediated.mediaId) mediaId = mediated.mediaId;
  }
  if (!mediaId || !organizationId || !db || typeof db.query !== "function") {
    return presented;
  }

  const loaded = await getWebsiteMedia(db, { mediaId, organizationId });
  if (!loaded.ok || loaded.media.status !== "active") {
    return presented;
  }
  if (instance && instance.id && loaded.media.instanceId !== instance.id) {
    return presented;
  }

  const publicSrc =
    presentWebsiteMediaForClient(instance, loaded.media, env).publicSrc ||
    (isCdnObjectStorageKey(loaded.media.storageKey)
      ? presentCdnUrl(loaded.media.storageKey, env)
      : null) ||
    websiteMediaDeliveryPath(instance, loaded.media.id);
  return {
    src: publicSrc || null,
    alt: presented.alt,
    mediaId: loaded.media.id,
  };
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

  function ownedImageValue(ownedMedia, env) {
    const presented = presentWebsiteMediaForClient(instance, ownedMedia, env);
    const cdnSrc =
      (presented && presented.publicSrc) ||
      (isCdnObjectStorageKey(ownedMedia.storageKey)
        ? presentCdnUrl(ownedMedia.storageKey, env)
        : null);
    // Never persist src:null for an owned media row — CDN when available,
    // otherwise the tenant app delivery path (database-payload / local QA).
    // Nulling here caused draft refresh → missing image (image-management suite).
    const src = cdnSrc || websiteMediaDeliveryPath(instance, ownedMedia.id);
    return {
      ok: true,
      value: {
        ...value,
        mediaId: ownedMedia.id,
        src,
      },
    };
  }

  if (mediaId) {
    const owned = await loadOwned(mediaId);
    if (!owned.ok) return { ok: false, code: owned.code, value: null };
    return ownedImageValue(owned.media, (input && input.env) || process.env);
  }

  const clinicMatch = src.match(CLINIC_MEDIA_PATH_RE);
  const blessboardMatch = src.match(BLESSBOARD_MEDIA_PATH_RE);
  const pathMatch = clinicMatch || blessboardMatch;
  if (pathMatch) {
    const expectedPrefix = publicWebsitePathPrefix(instance.productCode) || "/clinics";
    const matchedPrefix = clinicMatch ? "/clinics" : "/c";
    if (matchedPrefix !== expectedPrefix || pathMatch[1] !== instance.slug) {
      return { ok: false, code: RESULT.TENANT_MISMATCH, value: null };
    }
    const owned = await loadOwned(pathMatch[2]);
    if (!owned.ok) return { ok: false, code: owned.code, value: null };
    return ownedImageValue(owned.media, (input && input.env) || process.env);
  }

  if (src.startsWith("/clinics/") || /^\/c\//.test(src)) {
    return { ok: false, code: RESULT.TENANT_MISMATCH, value: null };
  }

  // Compatibility: rewrite legacy /media/{key} (and absolute …/media/{key}) to CDN.
  const rewritten = presentRuntimeImageSrc(src, (input && input.env) || process.env, {
    allowMarketing: true,
  });
  if (rewritten && /^https:\/\//i.test(rewritten)) {
    return { ok: true, value: { ...value, src: rewritten } };
  }

  // Refuse relative /media, local tenant asset paths, and data URLs for new saves.
  if (
    src.startsWith("/media/") ||
    src.startsWith(TEMPLATE_ASSET_PREFIX) ||
    src.startsWith("/church/images/") ||
    /^data:/i.test(src)
  ) {
    return { ok: false, code: RESULT.INVALID_URL, value: null };
  }

  const cdnBase = resolveCdnPublicBaseUrl((input && input.env) || process.env);
  if (cdnBase && src.startsWith(`${cdnBase}/`)) {
    return { ok: true, value };
  }
  if (!src || /^https:\/\//i.test(src)) {
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
  updateWebsiteMediaMeta,
  isPublishedInUse,
  isMediaReferenced,
  assertOwnedWebsiteImageValue,
  hydrateWebsiteImageValue,
  listOrphanCandidates,
  websiteMediaDeliveryPath,
  resolveWebsiteMediaPublicSrc,
  presentWebsiteMediaForClient,
  resolveMediaStorage,
  isCdnObjectStorageKey,
  PROVIDER_HOSTINGER,
  PROVIDER_DATABASE,
};
