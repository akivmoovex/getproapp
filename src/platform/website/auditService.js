"use strict";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

async function recordWebsiteAudit(db, input) {
  const organizationId = String((input && input.organizationId) || "");
  if (!UUID_RE.test(organizationId)) return { ok: false };
  const metadata = input.metadata && typeof input.metadata === "object" ? input.metadata : {};
  await db.query(
    `INSERT INTO platform.website_audit_events (
       organization_id, instance_id, actor_identity_id, action_key,
       content_key, submission_id, version_id, media_id, metadata_json
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb)`,
    [
      organizationId,
      input.instanceId || null,
      input.actorIdentityId || null,
      String(input.actionKey || "website.event"),
      input.contentKey || null,
      input.submissionId || null,
      input.versionId || null,
      input.mediaId || null,
      JSON.stringify(metadata),
    ]
  );
  return { ok: true };
}

async function listWebsiteAudit(db, input) {
  const params = [input.organizationId];
  let sql = `SELECT id, organization_id, instance_id, actor_identity_id, action_key,
                    content_key, submission_id, version_id, media_id, metadata_json, created_at
               FROM platform.website_audit_events
              WHERE organization_id = $1`;
  if (input.instanceId) {
    params.push(input.instanceId);
    sql += ` AND instance_id = $${params.length}`;
  }
  params.push(Math.min(Math.max(Number(input.limit) || 100, 1), 500));
  sql += ` ORDER BY created_at DESC LIMIT $${params.length}`;
  const rows = await db.query(sql, params);
  return {
    ok: true,
    events: rows.rows.map((row) => ({
      id: row.id,
      organizationId: row.organization_id,
      instanceId: row.instance_id,
      actorIdentityId: row.actor_identity_id,
      actionKey: row.action_key,
      contentKey: row.content_key,
      submissionId: row.submission_id,
      versionId: row.version_id,
      mediaId: row.media_id,
      metadata: row.metadata_json,
      createdAt: row.created_at,
    })),
  };
}

module.exports = {
  recordWebsiteAudit,
  listWebsiteAudit,
};
