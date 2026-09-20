"use strict";

/**
 * platform.audit_events repository — INSERT + SELECT only.
 */

const COLS = `id, deployment_code, organization_id, church_id, branch_id, facility_id, product_code,
  actor_user_id, action_key, entity_type, entity_id, outcome, metadata_json, created_at`;

const COLS_LEGACY = `id, deployment_code, organization_id, church_id, branch_id,
  actor_user_id, action_key, entity_type, entity_id, outcome, metadata_json, created_at`;

function mapEvent(row) {
  if (!row) return null;
  return {
    id: row.id,
    deploymentCode: row.deployment_code,
    organizationId: row.organization_id,
    churchId: row.church_id || null,
    branchId: row.branch_id || null,
    facilityId: row.facility_id || null,
    productCode: row.product_code || null,
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
  try {
    const { rows } = await client.query(
      `INSERT INTO platform.audit_events
         (deployment_code, organization_id, church_id, branch_id, facility_id, product_code,
          actor_user_id, action_key, entity_type, entity_id, outcome, metadata_json)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12::jsonb)
       RETURNING ${COLS}`,
      [
        fields.deploymentCode,
        fields.organizationId,
        fields.churchId || null,
        fields.branchId || null,
        fields.facilityId || null,
        fields.productCode || null,
        fields.actorUserId || null,
        fields.actionKey,
        fields.entityType,
        fields.entityId || null,
        fields.outcome,
        JSON.stringify(fields.metadata || {}),
      ]
    );
    return mapEvent(rows[0]);
  } catch (err) {
    // Pre-037 schema: facility_id / product_code columns absent — preserve V7 writers.
    if (!err || err.code !== "42703") throw err;
    const { rows } = await client.query(
      `INSERT INTO platform.audit_events
         (deployment_code, organization_id, church_id, branch_id, actor_user_id,
          action_key, entity_type, entity_id, outcome, metadata_json)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb)
       RETURNING ${COLS_LEGACY}`,
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
}

/**
 * @param {{ query: Function }} client
 * @param {{
 *   organizationId: string,
 *   churchId?: string|null,
 *   branchId?: string|null,
 *   facilityId?: string|null,
 *   productCode?: string|null,
 *   actorUserId?: string|null,
 *   actionKey?: string|null,
 *   actionCategory?: string|null,
 *   entityType?: string|null,
 *   outcome?: string|null,
 *   createdOnOrAfter?: string|null,
 *   createdBeforeExclusive?: string|null,
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
  if (opts.branchId) {
    params.push(opts.branchId);
    where += ` AND branch_id = $${params.length}`;
  }
  if (opts.facilityId) {
    params.push(opts.facilityId);
    where += ` AND facility_id = $${params.length}`;
  }
  if (opts.productCode) {
    params.push(opts.productCode);
    where += ` AND product_code = $${params.length}`;
  }
  if (opts.actorUserId) {
    params.push(opts.actorUserId);
    where += ` AND actor_user_id = $${params.length}`;
  }
  if (opts.actionKey) {
    params.push(opts.actionKey);
    where += ` AND action_key = $${params.length}`;
  } else if (opts.actionCategory) {
    params.push(opts.actionCategory);
    const catIdx = params.length;
    params.push(`${opts.actionCategory}.%`);
    where += ` AND (action_key = $${catIdx} OR action_key LIKE $${params.length})`;
  }
  if (opts.entityType) {
    params.push(opts.entityType);
    where += ` AND entity_type = $${params.length}`;
  }
  if (opts.outcome) {
    params.push(opts.outcome);
    where += ` AND outcome = $${params.length}`;
  }
  if (opts.createdOnOrAfter) {
    params.push(opts.createdOnOrAfter);
    where += ` AND created_at >= $${params.length}::timestamptz`;
  }
  if (opts.createdBeforeExclusive) {
    params.push(opts.createdBeforeExclusive);
    where += ` AND created_at < $${params.length}::timestamptz`;
  }
  if (opts.before) {
    params.push(opts.before);
    where += ` AND created_at < $${params.length}::timestamptz`;
  }
  const limit = Math.min(Math.max(Number(opts.limit) || 50, 1), 100);
  params.push(limit + 1); // fetch one extra for hasMore
  let rows;
  try {
    const result = await client.query(
      `SELECT ${COLS}
         FROM platform.audit_events
        WHERE ${where}
        ORDER BY created_at DESC, id DESC
        LIMIT $${params.length}`,
      params
    );
    rows = result.rows;
  } catch (err) {
    if (!err || err.code !== "42703") throw err;
    // Drop additive filters/columns when migrating mid-suite against pre-037 schema.
    const legacyParams = [opts.organizationId];
    let legacyWhere = `organization_id = $1`;
    if (opts.churchId) {
      legacyParams.push(opts.churchId);
      legacyWhere += ` AND church_id = $${legacyParams.length}`;
    }
    if (opts.branchId) {
      legacyParams.push(opts.branchId);
      legacyWhere += ` AND branch_id = $${legacyParams.length}`;
    }
    if (opts.actorUserId) {
      legacyParams.push(opts.actorUserId);
      legacyWhere += ` AND actor_user_id = $${legacyParams.length}`;
    }
    if (opts.actionKey) {
      legacyParams.push(opts.actionKey);
      legacyWhere += ` AND action_key = $${legacyParams.length}`;
    } else if (opts.actionCategory) {
      legacyParams.push(opts.actionCategory);
      const catIdx = legacyParams.length;
      legacyParams.push(`${opts.actionCategory}.%`);
      legacyWhere += ` AND (action_key = $${catIdx} OR action_key LIKE $${legacyParams.length})`;
    }
    if (opts.entityType) {
      legacyParams.push(opts.entityType);
      legacyWhere += ` AND entity_type = $${legacyParams.length}`;
    }
    if (opts.outcome) {
      legacyParams.push(opts.outcome);
      legacyWhere += ` AND outcome = $${legacyParams.length}`;
    }
    if (opts.createdOnOrAfter) {
      legacyParams.push(opts.createdOnOrAfter);
      legacyWhere += ` AND created_at >= $${legacyParams.length}::timestamptz`;
    }
    if (opts.createdBeforeExclusive) {
      legacyParams.push(opts.createdBeforeExclusive);
      legacyWhere += ` AND created_at < $${legacyParams.length}::timestamptz`;
    }
    if (opts.before) {
      legacyParams.push(opts.before);
      legacyWhere += ` AND created_at < $${legacyParams.length}::timestamptz`;
    }
    legacyParams.push(limit + 1);
    const result = await client.query(
      `SELECT ${COLS_LEGACY}
         FROM platform.audit_events
        WHERE ${legacyWhere}
        ORDER BY created_at DESC, id DESC
        LIMIT $${legacyParams.length}`,
      legacyParams
    );
    rows = result.rows;
  }
  const hasMore = rows.length > limit;
  const events = rows.slice(0, limit).map(mapEvent);
  const nextBefore =
    hasMore && events.length ? events[events.length - 1].createdAt : null;
  return { events, hasMore, nextBefore };
}

module.exports = {
  insertAuditEvent,
  listAuditEvents,
  mapEvent,
};
