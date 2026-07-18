"use strict";

/**
 * platform.audit_events repository — INSERT + SELECT only.
 */

const COLS = `id, deployment_code, organization_id, church_id, branch_id, actor_user_id,
  action_key, entity_type, entity_id, outcome, metadata_json, created_at`;

function mapEvent(row) {
  if (!row) return null;
  return {
    id: row.id,
    deploymentCode: row.deployment_code,
    organizationId: row.organization_id,
    churchId: row.church_id || null,
    branchId: row.branch_id || null,
    actorUserId: row.actor_user_id || null,
    actionKey: row.action_key,
    entityType: row.entity_type,
    entityId: row.entity_id || null,
    outcome: row.outcome,
    metadata: row.metadata_json || {},
    createdAt: row.created_at,
  };
}

async function insertAuditEvent(client, fields) {
  const { rows } = await client.query(
    `INSERT INTO platform.audit_events
       (deployment_code, organization_id, church_id, branch_id, actor_user_id,
        action_key, entity_type, entity_id, outcome, metadata_json)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb)
     RETURNING ${COLS}`,
    [
      fields.deploymentCode,
      fields.organizationId,
      fields.churchId || null,
      fields.branchId || null,
      fields.actorUserId || null,
      fields.actionKey,
      fields.entityType,
      fields.entityId || null,
      fields.outcome,
      JSON.stringify(fields.metadata || {}),
    ]
  );
  return mapEvent(rows[0]);
}

/**
 * @param {{ query: Function }} client
 * @param {{
 *   organizationId: string,
 *   churchId?: string|null,
 *   actionKey?: string|null,
 *   before?: string|null,
 *   limit?: number,
 * }} opts
 */
async function listAuditEvents(client, opts) {
  const params = [opts.organizationId];
  let where = `organization_id = $1`;
  if (opts.churchId) {
    params.push(opts.churchId);
    where += ` AND church_id = $${params.length}`;
  }
  if (opts.actionKey) {
    params.push(opts.actionKey);
    where += ` AND action_key = $${params.length}`;
  }
  if (opts.before) {
    params.push(opts.before);
    where += ` AND created_at < $${params.length}::timestamptz`;
  }
  const limit = Math.min(Math.max(Number(opts.limit) || 50, 1), 100);
  params.push(limit + 1); // fetch one extra for hasMore
  const { rows } = await client.query(
    `SELECT ${COLS}
       FROM platform.audit_events
      WHERE ${where}
      ORDER BY created_at DESC, id DESC
      LIMIT $${params.length}`,
    params
  );
  const hasMore = rows.length > limit;
  const page = hasMore ? rows.slice(0, limit) : rows;
  return {
    events: page.map(mapEvent),
    hasMore,
    nextBefore: hasMore && page.length ? page[page.length - 1].created_at : null,
  };
}

module.exports = {
  mapEvent,
  insertAuditEvent,
  listAuditEvents,
};
