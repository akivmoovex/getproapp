"use strict";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const FORBIDDEN_METADATA_KEY_RE = /password|token|secret|cookie|csrf|email|phone|name|address|body|notes|message/i;

const ALLOWED_METADATA_KEYS = new Set([
  "entity_key",
  "facility_key",
  "application_id",
  "from_status",
  "to_status",
  "reason_code",
  "status",
  "count",
  "field_keys",
  "product_code",
  "product_key",
  "version_number",
  "policy",
  "source",
  "actor_type",
  "retry",
  "ready",
  "previous",
  "next",
]);

function sanitizeWebsiteAuditMetadata(raw) {
  if (raw == null) return {};
  if (typeof raw !== "object" || Array.isArray(raw)) return {};
  const metadata = {};
  for (const [key, value] of Object.entries(raw)) {
    const k = String(key).trim().toLowerCase();
    if (!k || k.length > 64) continue;
    if (FORBIDDEN_METADATA_KEY_RE.test(k)) continue;
    if (!ALLOWED_METADATA_KEYS.has(k)) continue;
    if (value == null) continue;
    if (typeof value === "string") {
      const s = value.trim();
      if (s.length && s.length <= 120) metadata[k] = s;
    } else if (typeof value === "number" && Number.isFinite(value)) {
      metadata[k] = value;
    } else if (typeof value === "boolean") {
      metadata[k] = value;
    } else if (Array.isArray(value) && k === "field_keys") {
      metadata[k] = value
        .filter((x) => typeof x === "string")
        .map((x) => String(x).slice(0, 80))
        .slice(0, 40);
    }
  }
  return metadata;
}

async function recordWebsiteAudit(db, input) {
  const organizationId = String((input && input.organizationId) || "");
  if (!UUID_RE.test(organizationId)) return { ok: false };
  const metadata = sanitizeWebsiteAuditMetadata(input && input.metadata);
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
  sanitizeWebsiteAuditMetadata,
};
