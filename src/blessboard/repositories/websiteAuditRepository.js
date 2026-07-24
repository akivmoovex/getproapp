"use strict";

/**
 * Phase3 website audit event persistence.
 */

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isUuid(value) {
  return typeof value === "string" && UUID_RE.test(value);
}

function mapEvent(row) {
  if (!row) return null;
  return {
    id: row.id,
    organizationId: row.organization_id,
    branchId: row.branch_id || null,
    branchName: row.branch_display_name || null,
    actorUserId: row.actor_user_id || null,
    actorName: row.actor_display_name || null,
    actorRole: row.actor_role || null,
    actionType: row.action_type,
    pageKey: row.page_key || null,
    sectionKey: row.section_key || null,
    entityType: row.entity_type || null,
    entityId: row.entity_id || null,
    result: row.result,
    before: row.before_json || {},
    after: row.after_json || {},
    metadata: row.metadata_json || {},
    createdAt: row.created_at,
  };
}

const LIST_SELECT = `
  SELECT
    e.*,
    u.display_name AS actor_display_name,
    b.display_name AS branch_display_name
  FROM blessboard.website_audit_events e
  LEFT JOIN blessboard.users u ON u.id = e.actor_user_id
  LEFT JOIN blessboard.branches b ON b.id = e.branch_id
`;

/**
 * @param {import('pg').Pool|import('pg').PoolClient} db
 * @param {object} input
 */
async function insertAuditEvent(db, input) {
  const res = await db.query(
    `INSERT INTO blessboard.website_audit_events (
       organization_id, branch_id, actor_user_id, actor_role, action_type,
       page_key, section_key, entity_type, entity_id, result,
       before_json, after_json, metadata_json
     ) VALUES (
       $1, $2, $3, $4, $5,
       $6, $7, $8, $9, $10,
       $11::jsonb, $12::jsonb, $13::jsonb
     )
     RETURNING *`,
    [
      input.organizationId,
      input.branchId || null,
      input.actorUserId || null,
      input.actorRole || null,
      input.actionType,
      input.pageKey || null,
      input.sectionKey || null,
      input.entityType || null,
      input.entityId || null,
      input.result || "success",
      JSON.stringify(input.before || {}),
      JSON.stringify(input.after || {}),
      JSON.stringify(input.metadata || {}),
    ]
  );
  return mapEvent(res.rows[0]);
}

/**
 * @param {import('pg').Pool|import('pg').PoolClient} db
 * @param {object} filters
 */
async function listAuditEvents(db, filters) {
  const organizationId = filters && filters.organizationId;
  if (!isUuid(organizationId)) return { items: [], total: 0 };

  const where = ["e.organization_id = $1"];
  const params = [organizationId];
  let i = 2;

  if (filters.actionType) {
    where.push(`e.action_type = $${i}`);
    params.push(String(filters.actionType).slice(0, 80));
    i += 1;
  }
  if (filters.actorUserId && isUuid(filters.actorUserId)) {
    where.push(`e.actor_user_id = $${i}`);
    params.push(filters.actorUserId);
    i += 1;
  }
  if (filters.actorRole) {
    where.push(`e.actor_role = $${i}`);
    params.push(String(filters.actorRole).slice(0, 64));
    i += 1;
  }
  if (filters.branchId && isUuid(filters.branchId)) {
    where.push(`e.branch_id = $${i}`);
    params.push(filters.branchId);
    i += 1;
  }
  if (filters.pageKey) {
    where.push(`e.page_key = $${i}`);
    params.push(String(filters.pageKey).slice(0, 64));
    i += 1;
  }
  if (filters.result) {
    where.push(`e.result = $${i}`);
    params.push(String(filters.result).slice(0, 32));
    i += 1;
  }
  if (filters.from) {
    where.push(`e.created_at >= $${i}::timestamptz`);
    params.push(filters.from);
    i += 1;
  }
  if (filters.to) {
    where.push(`e.created_at < ($${i}::date + INTERVAL '1 day')`);
    params.push(filters.to);
    i += 1;
  }

  const whereSql = where.join(" AND ");
  const limit = Math.min(Math.max(Number(filters.limit) || 50, 1), 100);
  const offset = Math.max(Number(filters.offset) || 0, 0);

  const countRes = await db.query(
    `SELECT COUNT(*)::int AS n
       FROM blessboard.website_audit_events e
      WHERE ${whereSql}`,
    params
  );
  const listRes = await db.query(
    `${LIST_SELECT}
      WHERE ${whereSql}
      ORDER BY e.created_at DESC, e.id DESC
      LIMIT $${i} OFFSET $${i + 1}`,
    params.concat([limit, offset])
  );
  return {
    items: (listRes.rows || []).map(mapEvent),
    total: countRes.rows[0] ? Number(countRes.rows[0].n) : 0,
  };
}

/**
 * @param {import('pg').Pool|import('pg').PoolClient} db
 * @param {string} organizationId
 * @param {string} eventId
 */
async function getAuditEventByOrgAndId(db, organizationId, eventId) {
  if (!isUuid(organizationId) || !isUuid(eventId)) return null;
  const res = await db.query(
    `${LIST_SELECT}
      WHERE e.organization_id = $1
        AND e.id = $2
      LIMIT 1`,
    [organizationId, eventId]
  );
  return mapEvent(res.rows[0] || null);
}

/**
 * @param {import('pg').Pool|import('pg').PoolClient} db
 * @param {string} organizationId
 */
async function listAuditActors(db, organizationId) {
  if (!isUuid(organizationId)) return [];
  const res = await db.query(
    `SELECT DISTINCT u.id, u.display_name
       FROM blessboard.website_audit_events e
       INNER JOIN blessboard.users u ON u.id = e.actor_user_id
      WHERE e.organization_id = $1
      ORDER BY u.display_name ASC
      LIMIT 100`,
    [organizationId]
  );
  return (res.rows || []).map((r) => ({ id: r.id, displayName: r.display_name }));
}

/**
 * @param {import('pg').Pool|import('pg').PoolClient} db
 * @param {string} organizationId
 */
async function listAuditActionTypes(db, organizationId) {
  if (!isUuid(organizationId)) return [];
  const res = await db.query(
    `SELECT DISTINCT action_type
       FROM blessboard.website_audit_events
      WHERE organization_id = $1
      ORDER BY action_type ASC`,
    [organizationId]
  );
  return (res.rows || []).map((r) => r.action_type);
}

module.exports = {
  isUuid,
  insertAuditEvent,
  listAuditEvents,
  getAuditEventByOrgAndId,
  listAuditActors,
  listAuditActionTypes,
};
