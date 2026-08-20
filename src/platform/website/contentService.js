"use strict";

const {
  CONTENT_TYPES,
  normalizeContentKey,
  validateContentValue,
  wrapValue,
  unwrapValue,
} = require("./contentTypes");
const { getWebsiteTemplate, getContentKeyDef, isKnownContentKey } = require("./templateRegistry");
const { assertEditableMutation, ensureProductFieldsRegistered } = require("./editableFieldSchema");
const instanceRepo = require("./instanceRepository");
const { recordWebsiteAudit } = require("./auditService");
const mediaService = require("./mediaService");
const { assertWebsiteInstanceScope } = require("./authorizeWebsite");

function mediaIdFromValue(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const id = value.mediaId || value.media_id || null;
  return id ? String(id) : null;
}

const RESULT = Object.freeze({
  OK: "ok",
  INVALID_INPUT: "invalid_input",
  UNKNOWN_KEY: "unknown_content_key",
  NOT_FOUND: "website_instance_not_found",
  TENANT_MISMATCH: "tenant_mismatch",
  VALIDATION_FAILED: "validation_failed",
});

function mapContent(row) {
  if (!row) return null;
  return {
    id: row.id,
    organizationId: row.organization_id,
    instanceId: row.instance_id,
    contentKey: row.content_key,
    contentType: row.content_type,
    draftValue: unwrapValue(row.draft_value),
    publishedValue: unwrapValue(row.published_value),
    visibility: row.visibility,
    sortOrder: Number(row.sort_order) || 0,
    updatedByIdentityId: row.updated_by_identity_id,
    updatedAt: row.updated_at,
  };
}

async function loadTemplateForInstance(instance) {
  return getWebsiteTemplate(instance.templateId, instance.templateVersion);
}

async function listWebsiteContent(db, instance, organizationId) {
  if (!instance || instance.organizationId !== organizationId) return [];
  const rows = await db.query(
    `SELECT * FROM platform.website_content
      WHERE instance_id = $1 AND organization_id = $2
      ORDER BY sort_order ASC, content_key ASC`,
    [instance.id, organizationId]
  );
  return rows.rows.map(mapContent);
}

async function getWebsiteContentRow(db, instanceId, organizationId, contentKey) {
  const rows = await db.query(
    `SELECT * FROM platform.website_content
      WHERE instance_id = $1 AND organization_id = $2 AND content_key = $3
      LIMIT 1`,
    [instanceId, organizationId, contentKey]
  );
  return mapContent(rows.rows[0] || null);
}

async function saveWebsiteDraft(db, input) {
  const organizationId = String((input && input.organizationId) || "");
  const instanceId = String((input && input.instanceId) || "");
  const keyNorm = normalizeContentKey(input.contentKey);
  if (!keyNorm.ok) return { ok: false, code: RESULT.INVALID_INPUT, content: null };

  const instance = await instanceRepo.findWebsiteInstanceById(db, instanceId, organizationId);
  const scoped = assertWebsiteInstanceScope(instance, input);
  if (!scoped.ok) {
    return {
      ok: false,
      code: scoped.code === "website_instance_not_found" ? RESULT.NOT_FOUND : RESULT.TENANT_MISMATCH,
      content: null,
    };
  }
  if (instance.editLocked === true) {
    return { ok: false, code: "website_edit_locked", content: null };
  }

  ensureProductFieldsRegistered(instance.productCode);
  const template = await loadTemplateForInstance(instance);
  const asserted = assertEditableMutation({
    productCode: instance.productCode,
    key: keyNorm.key,
    value: input.value,
    grantedPermissions: input.grantedPermissions,
  });
  if (!asserted.ok) {
    if (asserted.code === "forbidden") {
      return { ok: false, code: "forbidden", content: null };
    }
    if (asserted.code === "validation_failed") {
      return { ok: false, code: RESULT.VALIDATION_FAILED, reason: asserted.reason, content: null };
    }
    if (asserted.code === "invalid_content_key") {
      return { ok: false, code: RESULT.INVALID_INPUT, content: null };
    }
    return { ok: false, code: RESULT.UNKNOWN_KEY, content: null };
  }
  if (asserted.field && asserted.field.type === CONTENT_TYPES.IMAGE) {
    const owned = await mediaService.assertOwnedWebsiteImageValue(db, {
      organizationId,
      instance,
      value: asserted.value,
    });
    if (!owned.ok) {
      return { ok: false, code: owned.code, content: null };
    }
    asserted.value = owned.value;
  }
  const def = getContentKeyDef(template, keyNorm.key) || {
    type: asserted.field.type,
    maxLen: asserted.field.maxLen,
    sortOrder: 0,
  };
  const validated = { ok: true, value: asserted.value };
  const wrapped = validated.value == null ? null : JSON.stringify(wrapValue(validated.value));
  const visibility = input.visibility === "hidden" ? "hidden" : input.visibility === "visible" ? "visible" : null;

  const rows = await db.query(
    `INSERT INTO platform.website_content (
       organization_id, instance_id, content_key, content_type,
       draft_value, published_value, visibility, sort_order, updated_by_identity_id
     ) VALUES ($1,$2,$3,$4,$5::jsonb, NULL, COALESCE($6,'visible'), $7, $8)
     ON CONFLICT (instance_id, content_key)
     DO UPDATE SET
       draft_value = EXCLUDED.draft_value,
       visibility = COALESCE($6, platform.website_content.visibility),
       sort_order = COALESCE($9, platform.website_content.sort_order),
       updated_by_identity_id = EXCLUDED.updated_by_identity_id,
       updated_at = now()
     RETURNING *`,
    [
      organizationId,
      instanceId,
      keyNorm.key,
      def.type,
      wrapped,
      visibility,
      Number.isFinite(Number(input.sortOrder)) ? Number(input.sortOrder) : def.sortOrder || 0,
      input.actorIdentityId || null,
      Number.isFinite(Number(input.sortOrder)) ? Number(input.sortOrder) : null,
    ]
  );
  await instanceRepo.updateWebsiteInstance(db, {
    instanceId: instance.id,
    organizationId,
    lastEditorIdentityId: input.actorIdentityId || null,
  });
  await recordWebsiteAudit(db, {
    organizationId,
    instanceId: instance.id,
    actorIdentityId: input.actorIdentityId || null,
    actionKey: "website.draft.save",
    contentKey: keyNorm.key,
  });
  const mediaId = mediaIdFromValue(validated.value);
  if (mediaId) {
    await mediaService.recordMediaUsage(db, {
      organizationId,
      mediaId,
      instanceId: instance.id,
      contentKey: keyNorm.key,
      usageKind: "draft",
    });
  }
  return { ok: true, code: RESULT.OK, content: mapContent(rows.rows[0]) };
}

async function discardWebsiteDraft(db, input) {
  const organizationId = String((input && input.organizationId) || "");
  const instance = await instanceRepo.findWebsiteInstanceById(db, input.instanceId, organizationId);
  const scoped = assertWebsiteInstanceScope(instance, input);
  if (!scoped.ok) {
    return {
      ok: false,
      code: scoped.code === "website_instance_not_found" ? RESULT.NOT_FOUND : RESULT.TENANT_MISMATCH,
    };
  }
  const keyNorm = normalizeContentKey(input.contentKey);
  if (!keyNorm.ok) return { ok: false, code: RESULT.INVALID_INPUT };
  await db.query(
    `UPDATE platform.website_content
        SET draft_value = published_value,
            updated_by_identity_id = $4,
            updated_at = now()
      WHERE instance_id = $1 AND organization_id = $2 AND content_key = $3`,
    [instance.id, organizationId, keyNorm.key, input.actorIdentityId || null]
  );
  await recordWebsiteAudit(db, {
    organizationId,
    instanceId: instance.id,
    actorIdentityId: input.actorIdentityId || null,
    actionKey: "website.draft.discard",
    contentKey: keyNorm.key,
  });
  return { ok: true, code: RESULT.OK };
}

async function seedWebsiteContent(db, instance, entries, actorIdentityId) {
  const template = await loadTemplateForInstance(instance);
  if (!template) return { ok: false, seeded: 0 };
  let seeded = 0;
  for (const entry of entries || []) {
    const keyNorm = normalizeContentKey(entry.contentKey);
    if (!keyNorm.ok || !isKnownContentKey(template, keyNorm.key)) continue;
    const def = getContentKeyDef(template, keyNorm.key);
    const validated = validateContentValue(def, entry.value);
    if (!validated.ok) continue;
    const wrapped = validated.value == null ? null : JSON.stringify(wrapValue(validated.value));
    await db.query(
      `INSERT INTO platform.website_content (
         organization_id, instance_id, content_key, content_type,
         draft_value, published_value, visibility, sort_order, updated_by_identity_id
       ) VALUES ($1,$2,$3,$4,$5::jsonb,$6::jsonb,$7,$8,$9)
       ON CONFLICT (instance_id, content_key) DO NOTHING`,
      [
        instance.organizationId,
        instance.id,
        keyNorm.key,
        def.type,
        wrapped,
        entry.publish === false ? null : wrapped,
        entry.visibility === "hidden" ? "hidden" : "visible",
        def.sortOrder || 0,
        actorIdentityId || null,
      ]
    );
    seeded += 1;
  }
  return { ok: true, seeded };
}

async function applyPublishedSnapshot(db, instance, snapshot, actorIdentityId) {
  const template = await loadTemplateForInstance(instance);
  if (!template) return { ok: false, code: RESULT.INVALID_INPUT };
  const values = (snapshot && snapshot.values) || {};
  const vis = (snapshot && snapshot.visibility) || {};
  for (const key of Object.keys(template.keys)) {
    const def = getContentKeyDef(template, key);
    const validated = validateContentValue(def, values[key]);
    const wrapped = validated.ok && validated.value != null ? JSON.stringify(wrapValue(validated.value)) : null;
    const visibility = vis[key] === "hidden" ? "hidden" : "visible";
    await db.query(
      `INSERT INTO platform.website_content (
         organization_id, instance_id, content_key, content_type,
         draft_value, published_value, visibility, updated_by_identity_id
       ) VALUES ($1,$2,$3,$4,$5::jsonb,$6::jsonb,$7,$8)
       ON CONFLICT (instance_id, content_key)
       DO UPDATE SET
         published_value = EXCLUDED.published_value,
         draft_value = EXCLUDED.draft_value,
         visibility = EXCLUDED.visibility,
         updated_by_identity_id = EXCLUDED.updated_by_identity_id,
         updated_at = now()`,
      [
        instance.organizationId,
        instance.id,
        key,
        def.type,
        wrapped,
        wrapped,
        visibility,
        actorIdentityId || null,
      ]
    );
    const mediaId = mediaIdFromValue(validated.ok ? validated.value : null);
    if (mediaId) {
      await mediaService.recordMediaUsage(db, {
        organizationId: instance.organizationId,
        mediaId,
        instanceId: instance.id,
        contentKey: key,
        usageKind: "published",
      });
    }
  }
  return { ok: true };
}

/**
 * Copy a historical snapshot into draft values only.
 * Never writes published_value, so the live website stays unchanged.
 */
async function applyDraftSnapshot(db, instance, snapshot, actorIdentityId) {
  const template = await loadTemplateForInstance(instance);
  if (!template) return { ok: false, code: RESULT.INVALID_INPUT };
  const values = (snapshot && snapshot.values) || {};
  const vis = (snapshot && snapshot.visibility) || {};
  for (const key of Object.keys(template.keys)) {
    const def = getContentKeyDef(template, key);
    const validated = validateContentValue(def, values[key]);
    const wrapped = validated.ok && validated.value != null ? JSON.stringify(wrapValue(validated.value)) : null;
    const visibility = vis[key] === "hidden" ? "hidden" : vis[key] === "visible" ? "visible" : null;
    await db.query(
      `INSERT INTO platform.website_content (
         organization_id, instance_id, content_key, content_type,
         draft_value, published_value, visibility, updated_by_identity_id
       ) VALUES ($1,$2,$3,$4,$5::jsonb, NULL, COALESCE($6,'visible'), $7)
       ON CONFLICT (instance_id, content_key)
       DO UPDATE SET
         draft_value = EXCLUDED.draft_value,
         visibility = COALESCE($6, platform.website_content.visibility),
         updated_by_identity_id = EXCLUDED.updated_by_identity_id,
         updated_at = now()`,
      [
        instance.organizationId,
        instance.id,
        key,
        def.type,
        wrapped,
        visibility,
        actorIdentityId || null,
      ]
    );
    const mediaId = mediaIdFromValue(validated.ok ? validated.value : null);
    if (mediaId) {
      await mediaService.recordMediaUsage(db, {
        organizationId: instance.organizationId,
        mediaId,
        instanceId: instance.id,
        contentKey: key,
        usageKind: "draft",
      });
    }
  }
  await instanceRepo.updateWebsiteInstance(db, {
    instanceId: instance.id,
    organizationId: instance.organizationId,
    lastEditorIdentityId: actorIdentityId || null,
  });
  return { ok: true };
}

function valuesEqual(a, b) {
  return JSON.stringify(a) === JSON.stringify(b);
}

function classifyDiffChange(published, draft, extra) {
  const visChanged =
    extra && extra.oldVisibility && extra.visibility && extra.oldVisibility !== extra.visibility;
  const sortChanged =
    extra &&
    Number.isFinite(Number(extra.oldSortOrder)) &&
    Number.isFinite(Number(extra.sortOrder)) &&
    Number(extra.oldSortOrder) !== Number(extra.sortOrder);
  const valueChanged = !valuesEqual(published, draft);
  if (visChanged && !valueChanged) return "visibility";
  if (sortChanged && !valueChanged) return "reorder";
  if ((published == null || published === "") && draft != null && draft !== "") return "added";
  if (published != null && published !== "" && (draft == null || draft === "")) return "removed";
  return "changed";
}

function diffContentRows(rows) {
  const changes = [];
  for (const row of rows || []) {
    const draft = row.draftValue;
    const published = row.publishedValue;
    if (!valuesEqual(draft, published)) {
      const extra = {
        visibility: row.visibility,
        oldVisibility: row.publishedVisibility || row.visibility,
        sortOrder: row.sortOrder,
        oldSortOrder: row.publishedSortOrder,
      };
      changes.push({
        contentKey: row.contentKey,
        contentType: row.contentType,
        oldValue: published,
        proposedValue: draft,
        visibility: row.visibility,
        oldVisibility: extra.oldVisibility,
        sortOrder: row.sortOrder,
        changeType: classifyDiffChange(published, draft, extra),
      });
    }
  }
  return changes;
}

async function listUnpublishedChanges(db, instance, organizationId) {
  const rows = await listWebsiteContent(db, instance, organizationId);
  return diffContentRows(rows);
}

async function setContentVisibility(db, input) {
  return saveWebsiteDraft(db, {
    ...input,
    value: (await getWebsiteContentRow(db, input.instanceId, input.organizationId, input.contentKey))?.draftValue,
    visibility: input.visibility,
  });
}

async function reorderContent(db, input) {
  const organizationId = String((input && input.organizationId) || "");
  const instance = await instanceRepo.findWebsiteInstanceById(db, input.instanceId, organizationId);
  if (!instance) return { ok: false, code: RESULT.NOT_FOUND };
  const keys = Array.isArray(input.contentKeys) ? input.contentKeys : [];
  for (let i = 0; i < keys.length; i += 1) {
    const keyNorm = normalizeContentKey(keys[i]);
    if (!keyNorm.ok) continue;
    await db.query(
      `UPDATE platform.website_content
          SET sort_order = $4, updated_at = now()
        WHERE instance_id = $1 AND organization_id = $2 AND content_key = $3`,
      [instance.id, organizationId, keyNorm.key, i]
    );
  }
  await recordWebsiteAudit(db, {
    organizationId,
    instanceId: instance.id,
    actorIdentityId: input.actorIdentityId || null,
    actionKey: "website.reorder",
  });
  return { ok: true };
}

module.exports = {
  RESULT,
  mapContent,
  listWebsiteContent,
  getWebsiteContentRow,
  saveWebsiteDraft,
  discardWebsiteDraft,
  seedWebsiteContent,
  applyPublishedSnapshot,
  applyDraftSnapshot,
  listUnpublishedChanges,
  diffContentRows,
  valuesEqual,
  setContentVisibility,
  reorderContent,
  loadTemplateForInstance,
};
