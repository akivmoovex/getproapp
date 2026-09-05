"use strict";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function summarizeValues(oldValue, newValue) {
  const oldText = oldValue == null ? "" : typeof oldValue === "string" ? oldValue : JSON.stringify(oldValue);
  const newText = newValue == null ? "" : typeof newValue === "string" ? newValue : JSON.stringify(newValue);
  return {
    oldSummary: String(oldText).slice(0, 180),
    newSummary: String(newText).slice(0, 180),
    mediaChanged: /mediaId|media_id|"src"/.test(oldText + newText),
  };
}

function mapChangeRow(row) {
  const changedKeys = row.changed_keys || [];
  const snapshot = row.snapshot_json || {};
  const changes = Array.isArray(snapshot.changes) ? snapshot.changes : [];
  const first = changes[0] || {};
  const summary = summarizeValues(first.oldValue, first.proposedValue || first.newValue);
  const actionKey = row.action_key || null;
  const contentKey = changedKeys[0] ? String(changedKeys[0]) : "";
  const mediaChanged =
    summary.mediaChanged ||
    Boolean(snapshot.media_id) ||
    (actionKey && String(actionKey).includes("media"));
  return {
    id: row.id,
    kind: row.kind,
    productCode: row.product_code,
    organizationId: row.organization_id,
    organizationKey: row.organization_key,
    organizationName: row.display_name,
    instanceId: row.instance_id,
    slug: row.slug,
    editorIdentityId: row.editor_identity_id,
    timestamp: row.occurred_at,
    pageSection: contentKey ? contentKey.split(".")[0] : actionKey || row.kind,
    changeCount: changedKeys.length || Number(row.change_count) || 0,
    changedKeys,
    oldSummary: summary.oldSummary,
    newSummary: summary.newSummary,
    mediaChanged,
    lifecycleStatus: row.lifecycle_status,
    publishPolicy: row.publish_policy,
    moderationState: row.moderation_status || actionKey || row.status,
    adapterMode: row.adapter_mode,
    versionNumber: row.version_number != null ? Number(row.version_number) : null,
    actionKey,
    flagged: String(row.moderation_status || "") === "flagged" || String(actionKey || "").includes("flag"),
  };
}

async function listRecentWebsiteChanges(db, input) {
  const params = [];
  const where = ["src.kind IS NOT NULL"];
  if (input && input.productCode) {
    params.push(String(input.productCode));
    where.push(`src.product_code = $${params.length}`);
  }
  if (input && input.organizationId && UUID_RE.test(String(input.organizationId))) {
    params.push(input.organizationId);
    where.push(`src.organization_id = $${params.length}`);
  }
  if (input && input.lifecycleStatus) {
    params.push(String(input.lifecycleStatus));
    where.push(`src.lifecycle_status = $${params.length}`);
  }
  if (input && input.flagged === true) {
    where.push(`(
      COALESCE(src.moderation_status, '') = 'flagged'
      OR COALESCE(src.action_key, '') LIKE 'website.moderation.flag%'
    )`);
  }
  params.push(Math.min(Math.max(Number(input && input.limit) || 80, 1), 200));
  const limitIdx = params.length;
  const sql = `
    WITH src AS (
      SELECT v.id,
             'version'::text AS kind,
             i.product_code,
             i.organization_id,
             o.organization_key,
             o.display_name,
             i.id AS instance_id,
             i.slug,
             i.lifecycle_status,
             i.publish_policy,
             i.adapter_mode,
             COALESCE(v.editor_identity_id, v.submitter_identity_id) AS editor_identity_id,
             v.published_at AS occurred_at,
             v.changed_keys,
             v.change_count,
             v.snapshot_json,
             v.moderation_status,
             v.version_number,
             NULL::text AS action_key,
             NULL::text AS status
        FROM platform.website_versions v
        JOIN platform.website_instances i ON i.id = v.instance_id AND i.status <> 'archived'
        JOIN platform.organizations o ON o.id = i.organization_id
      UNION ALL
      SELECT s.id,
             'submission'::text,
             i.product_code,
             i.organization_id,
             o.organization_key,
             o.display_name,
             i.id,
             i.slug,
             i.lifecycle_status,
             i.publish_policy,
             i.adapter_mode,
             s.submitter_identity_id,
             s.submitted_at,
             s.changed_keys,
             cardinality(s.changed_keys),
             s.snapshot_json,
             s.status,
             NULL::integer,
             NULL::text,
             s.status
        FROM platform.website_submissions s
        JOIN platform.website_instances i ON i.id = s.instance_id AND i.status <> 'archived'
        JOIN platform.organizations o ON o.id = i.organization_id
      UNION ALL
      SELECT e.id,
             'moderation'::text,
             i.product_code,
             i.organization_id,
             o.organization_key,
             o.display_name,
             i.id,
             i.slug,
             i.lifecycle_status,
             i.publish_policy,
             i.adapter_mode,
             e.actor_identity_id,
             e.created_at,
             ARRAY[]::text[],
             0,
             jsonb_strip_nulls(jsonb_build_object(
               'reason_code', e.reason,
               'action_key', e.action_key
             )),
             NULL::text,
             NULL::integer,
             e.action_key,
             NULL::text
        FROM platform.website_moderation_events e
        JOIN platform.website_instances i ON i.id = e.instance_id AND i.status <> 'archived'
        JOIN platform.organizations o ON o.id = i.organization_id
      UNION ALL
      SELECT a.id,
             'audit'::text,
             i.product_code,
             i.organization_id,
             o.organization_key,
             o.display_name,
             i.id,
             i.slug,
             i.lifecycle_status,
             i.publish_policy,
             i.adapter_mode,
             a.actor_identity_id,
             a.created_at,
             CASE
               WHEN a.content_key IS NOT NULL AND a.content_key <> '' THEN ARRAY[a.content_key]
               ELSE ARRAY[]::text[]
             END,
             CASE WHEN a.content_key IS NOT NULL AND a.content_key <> '' THEN 1 ELSE 0 END,
             jsonb_strip_nulls(jsonb_build_object(
               'content_key', a.content_key,
               'version_id', a.version_id,
               'media_id', a.media_id,
               'reason_code', a.metadata_json->>'reason_code',
               'from_status', a.metadata_json->>'from_status',
               'to_status', a.metadata_json->>'to_status'
             )),
             NULL::text,
             NULL::integer,
             a.action_key,
             NULL::text
        FROM platform.website_audit_events a
        JOIN platform.website_instances i ON i.id = a.instance_id AND i.status <> 'archived'
        JOIN platform.organizations o ON o.id = i.organization_id
    )
    SELECT * FROM src
     WHERE ${where.join(" AND ")}
     ORDER BY occurred_at DESC
     LIMIT $${limitIdx}
  `;
  const rows = await db.query(sql, params);
  let changes = rows.rows.map(mapChangeRow);
  if (input && input.tenant) {
    const needle = String(input.tenant).toLowerCase();
    changes = changes.filter(
      (row) =>
        String(row.organizationKey || "").toLowerCase().includes(needle) ||
        String(row.organizationName || "").toLowerCase().includes(needle)
    );
  }
  return { ok: true, changes };
}

module.exports = {
  listRecentWebsiteChanges,
  summarizeValues,
};
