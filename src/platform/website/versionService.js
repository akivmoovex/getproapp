"use strict";

const instanceRepo = require("./instanceRepository");
const contentService = require("./contentService");
const { recordWebsiteAudit } = require("./auditService");
const { assertWebsiteInstanceScope } = require("./authorizeWebsite");

const RESULT = Object.freeze({
  OK: "ok",
  NOT_FOUND: "website_version_not_found",
  TENANT_MISMATCH: "tenant_mismatch",
});

function mapVersion(row) {
  if (!row) return null;
  return {
    id: row.id,
    organizationId: row.organization_id,
    instanceId: row.instance_id,
    submissionId: row.submission_id,
    versionNumber: Number(row.version_number),
    snapshot: row.snapshot_json,
    submitterIdentityId: row.submitter_identity_id,
    reviewerIdentityId: row.reviewer_identity_id,
    changeCount: Number(row.change_count) || 0,
    status: row.status,
    publishedAt: row.published_at,
    sourcePolicy: row.source_policy || null,
    previousVersionId: row.previous_version_id || null,
    changedKeys: row.changed_keys || [],
    moderationStatus: row.moderation_status || row.status,
    editorIdentityId: row.editor_identity_id || row.submitter_identity_id || null,
    editSessionId: row.edit_session_id || null,
    sessionStartedAt: row.session_started_at || null,
    sessionClosedAt: row.session_closed_at || null,
    sessionStatus: row.session_status || null,
    sessionCloseReason: row.session_close_reason || null,
  };
}

async function createWebsiteVersion(db, input) {
  const instance = input.instance;
  const next = await db.query(
    `SELECT COALESCE(MAX(version_number), 0) + 1 AS n
       FROM platform.website_versions
      WHERE instance_id = $1`,
    [instance.id]
  );
  const versionNumber = Number(next.rows[0].n);
  const previousPublished = await db.query(
    `SELECT id FROM platform.website_versions
      WHERE instance_id = $1 AND status = 'published'
      ORDER BY version_number DESC LIMIT 1`,
    [instance.id]
  );
  const previousVersionId =
    input.previousVersionId || (previousPublished.rows[0] && previousPublished.rows[0].id) || null;
  await db.query(
    `UPDATE platform.website_versions
        SET status = 'superseded'
      WHERE instance_id = $1 AND status = 'published'`,
    [instance.id]
  );
  const rows = await db.query(
    `INSERT INTO platform.website_versions (
       organization_id, instance_id, submission_id, version_number,
       snapshot_json, submitter_identity_id, reviewer_identity_id, change_count, status,
       source_policy, previous_version_id, changed_keys, moderation_status, editor_identity_id,
       edit_session_id
     ) VALUES ($1,$2,$3,$4,$5::jsonb,$6,$7,$8,'published',$9,$10,$11::text[],$12,$13,$14)
     RETURNING *`,
    [
      instance.organizationId,
      instance.id,
      input.submissionId || null,
      versionNumber,
      JSON.stringify(input.snapshot || {}),
      input.submitterIdentityId || null,
      input.reviewerIdentityId || null,
      Number(input.changeCount) || 0,
      input.sourcePolicy || null,
      previousVersionId,
      input.changedKeys || [],
      input.moderationStatus || "published",
      input.editorIdentityId || input.submitterIdentityId || null,
      input.editSessionId || null,
    ]
  );
  const version = mapVersion(rows.rows[0]);
  await recordWebsiteAudit(db, {
    organizationId: instance.organizationId,
    instanceId: instance.id,
    actorIdentityId: input.reviewerIdentityId || null,
    actionKey: input.auditActionKey || "website.publish",
    submissionId: input.submissionId || null,
    versionId: version.id,
    metadata: {
      count: input.changeCount || 0,
      policy: input.sourcePolicy || null,
      field_keys: input.changedKeys || [],
    },
  });
  return { ok: true, version };
}

async function amendOpenSessionVersion(db, input) {
  const versionId = String((input && input.versionId) || "");
  const organizationId = String((input && input.organizationId) || "");
  const editSessionId = String((input && input.editSessionId) || "");
  if (!versionId || !organizationId || !editSessionId) {
    return { ok: false, code: RESULT.NOT_FOUND, version: null };
  }
  const changedKeys = Array.isArray(input.changedKeys) ? input.changedKeys : [];
  const rows = await db.query(
    `UPDATE platform.website_versions v
        SET snapshot_json = $4::jsonb,
            changed_keys = $5::text[],
            change_count = $6
      FROM platform.website_edit_sessions s
     WHERE v.id = $1
       AND v.organization_id = $2
       AND v.edit_session_id = $3
       AND v.status = 'published'
       AND s.id = v.edit_session_id
       AND s.status = 'open'
     RETURNING v.*`,
    [
      versionId,
      organizationId,
      editSessionId,
      JSON.stringify(input.snapshot || {}),
      changedKeys,
      changedKeys.length,
    ]
  );
  const version = mapVersion(rows.rows[0] || null);
  if (!version) return { ok: false, code: RESULT.NOT_FOUND, version: null };
  return { ok: true, version };
}

async function listWebsiteVersions(db, input) {
  const rows = await db.query(
    `SELECT v.*,
            s.started_at AS session_started_at,
            s.closed_at AS session_closed_at,
            s.status AS session_status,
            s.close_reason AS session_close_reason
       FROM platform.website_versions v
       LEFT JOIN platform.website_edit_sessions s ON s.id = v.edit_session_id
      WHERE v.instance_id = $1 AND v.organization_id = $2
      ORDER BY v.version_number DESC`,
    [input.instanceId, input.organizationId]
  );
  return { ok: true, versions: rows.rows.map(mapVersion) };
}

async function getWebsiteVersion(db, input) {
  const rows = await db.query(
    `SELECT v.*,
            s.started_at AS session_started_at,
            s.closed_at AS session_closed_at,
            s.status AS session_status,
            s.close_reason AS session_close_reason
       FROM platform.website_versions v
       LEFT JOIN platform.website_edit_sessions s ON s.id = v.edit_session_id
      WHERE v.id = $1 AND v.organization_id = $2
      LIMIT 1`,
    [input.versionId, input.organizationId]
  );
  const version = mapVersion(rows.rows[0] || null);
  if (!version) return { ok: false, code: RESULT.NOT_FOUND, version: null };
  if (input.instanceId && version.instanceId !== String(input.instanceId)) {
    return { ok: false, code: RESULT.NOT_FOUND, version: null };
  }
  return { ok: true, version };
}

/**
 * Restore copies version X into the current draft. Never publishes.
 * Historical versions stay immutable; the live published version is unchanged.
 */
async function restoreWebsiteVersionToDraft(db, input) {
  const organizationId = String((input && input.organizationId) || "");
  const instance = await instanceRepo.findWebsiteInstanceById(db, input.instanceId, organizationId);
  const scoped = assertWebsiteInstanceScope(instance, input);
  if (!scoped.ok) {
    return {
      ok: false,
      code: scoped.code === "website_instance_not_found" ? "website_instance_not_found" : RESULT.TENANT_MISMATCH,
    };
  }
  const loaded = await getWebsiteVersion(db, {
    versionId: input.versionId,
    organizationId,
    instanceId: instance.id,
  });
  if (!loaded.ok) return loaded;
  if (loaded.version.instanceId !== instance.id) {
    return { ok: false, code: RESULT.TENANT_MISMATCH };
  }
  const applied = await contentService.applyDraftSnapshot(
    db,
    instance,
    loaded.version.snapshot || {},
    input.actorIdentityId || null
  );
  if (!applied.ok) return applied;
  await recordWebsiteAudit(db, {
    organizationId,
    instanceId: instance.id,
    actorIdentityId: input.actorIdentityId || null,
    actionKey: "website.rollback",
    versionId: loaded.version.id,
    metadata: {
      restored_version: loaded.version.versionNumber,
      restore_mode: "draft",
      published_unchanged: true,
    },
  });
  return { ok: true, version: loaded.version, restoredFrom: loaded.version, publishedUnchanged: true };
}

module.exports = {
  RESULT,
  mapVersion,
  createWebsiteVersion,
  amendOpenSessionVersion,
  listWebsiteVersions,
  getWebsiteVersion,
  restoreWebsiteVersionToDraft,
};
