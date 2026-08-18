"use strict";

const instanceRepo = require("./instanceRepository");
const contentService = require("./contentService");
const { recordWebsiteAudit } = require("./auditService");

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
       source_policy, previous_version_id, changed_keys, moderation_status, editor_identity_id
     ) VALUES ($1,$2,$3,$4,$5::jsonb,$6,$7,$8,'published',$9,$10,$11::text[],$12,$13)
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
      version_number: versionNumber,
      count: input.changeCount || 0,
      source_policy: input.sourcePolicy || null,
      previous_version_id: previousVersionId,
      changed_keys: input.changedKeys || [],
    },
  });
  return { ok: true, version };
}

async function listWebsiteVersions(db, input) {
  const rows = await db.query(
    `SELECT * FROM platform.website_versions
      WHERE instance_id = $1 AND organization_id = $2
      ORDER BY version_number DESC`,
    [input.instanceId, input.organizationId]
  );
  return { ok: true, versions: rows.rows.map(mapVersion) };
}

async function getWebsiteVersion(db, input) {
  const rows = await db.query(
    `SELECT * FROM platform.website_versions
      WHERE id = $1 AND organization_id = $2
      LIMIT 1`,
    [input.versionId, input.organizationId]
  );
  const version = mapVersion(rows.rows[0] || null);
  if (!version) return { ok: false, code: RESULT.NOT_FOUND, version: null };
  return { ok: true, version };
}

/**
 * Restore creates a new draft from version X. Does not rewrite published history.
 */
async function restoreWebsiteVersionToDraft(db, input) {
  const organizationId = String((input && input.organizationId) || "");
  const instance = await instanceRepo.findWebsiteInstanceById(db, input.instanceId, organizationId);
  if (!instance) return { ok: false, code: "website_instance_not_found" };
  const loaded = await getWebsiteVersion(db, { versionId: input.versionId, organizationId });
  if (!loaded.ok) return loaded;
  if (loaded.version.instanceId !== instance.id) {
    return { ok: false, code: RESULT.TENANT_MISMATCH };
  }
  const snapshot = loaded.version.snapshot || {};
  const values = snapshot.values || {};
  for (const [key, value] of Object.entries(values)) {
    await contentService.saveWebsiteDraft(db, {
      organizationId,
      instanceId: instance.id,
      contentKey: key,
      value,
      actorIdentityId: input.actorIdentityId || null,
    });
  }
  await recordWebsiteAudit(db, {
    organizationId,
    instanceId: instance.id,
    actorIdentityId: input.actorIdentityId || null,
    actionKey: "website.rollback",
    versionId: loaded.version.id,
    metadata: { restored_version: loaded.version.versionNumber },
  });
  return { ok: true, version: loaded.version };
}

module.exports = {
  RESULT,
  mapVersion,
  createWebsiteVersion,
  listWebsiteVersions,
  getWebsiteVersion,
  restoreWebsiteVersionToDraft,
};
