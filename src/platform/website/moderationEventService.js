"use strict";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const ACTION = Object.freeze({
  FLAGGED: "website.moderation.flagged",
  REQUEST_CHANGES: "website.moderation.request_changes",
  TAKE_OFFLINE: "website.moderation.take_offline",
  SUSPEND: "website.moderation.suspend",
  RESTORE_SITE: "website.moderation.restore_site",
  RESTORE_VERSION: "website.moderation.restore_version",
  POLICY_CHANGED: "website.moderation.policy_changed",
  EDIT_LOCKED: "website.moderation.edit_locked",
  EDIT_UNLOCKED: "website.moderation.edit_unlocked",
  AUTO_PUBLISH: "website.moderation.auto_publish",
  TENANT_PUBLISH: "website.moderation.tenant_publish",
  TENANT_UNPUBLISH: "website.moderation.tenant_unpublish",
  PROVISION: "website.moderation.provision",
  APPROVE_VERSION: "website.moderation.approve_version",
  HIDE: "website.moderation.hide",
  UNHIDE: "website.moderation.unhide",
  BLOCK: "website.moderation.block",
  UNBLOCK: "website.moderation.unblock",
  REVERT: "website.moderation.revert",
});

function mapEvent(row) {
  if (!row) return null;
  return {
    id: row.id,
    organizationId: row.organization_id,
    instanceId: row.instance_id,
    productCode: row.product_code,
    actorIdentityId: row.actor_identity_id,
    actionKey: row.action_key,
    reason: row.reason,
    notes: row.notes,
    notesTenantVisible: row.notes_tenant_visible === true,
    previousState: row.previous_state,
    newState: row.new_state,
    targetVersionId: row.target_version_id,
    submissionId: row.submission_id,
    metadata: row.metadata_json || {},
    createdAt: row.created_at,
  };
}

async function recordModerationEvent(db, input) {
  const organizationId = String((input && input.organizationId) || "");
  if (!UUID_RE.test(organizationId)) return { ok: false, event: null };
  const metadata = input.metadata && typeof input.metadata === "object" ? input.metadata : {};
  const rows = await db.query(
    `INSERT INTO platform.website_moderation_events (
       organization_id, instance_id, product_code, actor_identity_id, action_key,
       reason, notes, notes_tenant_visible, previous_state, new_state,
       target_version_id, submission_id, metadata_json
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13::jsonb)
     RETURNING *`,
    [
      organizationId,
      input.instanceId || null,
      String(input.productCode || "platform"),
      input.actorIdentityId || null,
      String(input.actionKey || ACTION.FLAGGED),
      input.reason ? String(input.reason).slice(0, 500) : null,
      input.notes ? String(input.notes).slice(0, 4000) : null,
      input.notesTenantVisible === true,
      input.previousState ? String(input.previousState).slice(0, 120) : null,
      input.newState ? String(input.newState).slice(0, 120) : null,
      input.targetVersionId || null,
      input.submissionId || null,
      JSON.stringify(metadata),
    ]
  );
  return { ok: true, event: mapEvent(rows.rows[0]) };
}

async function listModerationEvents(db, input) {
  const params = [];
  const where = [];
  if (input && input.organizationId) {
    params.push(input.organizationId);
    where.push(`organization_id = $${params.length}`);
  }
  if (input && input.instanceId) {
    params.push(input.instanceId);
    where.push(`instance_id = $${params.length}`);
  }
  if (input && input.productCode) {
    params.push(input.productCode);
    where.push(`product_code = $${params.length}`);
  }
  params.push(Math.min(Math.max(Number(input && input.limit) || 100, 1), 500));
  const sql = `SELECT * FROM platform.website_moderation_events
                ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
                ORDER BY created_at DESC
                LIMIT $${params.length}`;
  const rows = await db.query(sql, params);
  return { ok: true, events: rows.rows.map(mapEvent) };
}

async function latestTenantVisibleNote(db, instanceId, organizationId) {
  if (!UUID_RE.test(String(instanceId || "")) || !UUID_RE.test(String(organizationId || ""))) {
    return null;
  }
  const rows = await db.query(
    `SELECT notes, action_key, created_at
       FROM platform.website_moderation_events
      WHERE instance_id = $1
        AND organization_id = $2
        AND notes_tenant_visible IS TRUE
        AND notes IS NOT NULL
      ORDER BY created_at DESC
      LIMIT 1`,
    [instanceId, organizationId]
  );
  return rows.rows[0]
    ? {
        notes: rows.rows[0].notes,
        actionKey: rows.rows[0].action_key,
        createdAt: rows.rows[0].created_at,
      }
    : null;
}

module.exports = {
  ACTION,
  mapEvent,
  recordModerationEvent,
  listModerationEvents,
  latestTenantVisibleNote,
};
