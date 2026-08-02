"use strict";

/**
 * BlessBoard RBAC repository — catalogue + assignments + events.
 */

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function mapPermission(row) {
  if (!row) return null;
  return {
    id: row.id,
    permissionKey: row.permission_key,
    resourceKey: row.resource_key,
    actionKey: row.action_key,
    displayName: row.display_name,
    description: row.description || null,
    sensitivity: row.sensitivity,
    isSystem: row.is_system === true,
    isActive: row.is_active === true,
  };
}

function mapRole(row) {
  if (!row) return null;
  return {
    id: row.id,
    roleKey: row.role_key,
    displayName: row.display_name,
    description: row.description || null,
    roleCategory: row.role_category,
    isSystem: row.is_system === true,
    isSensitive: row.is_sensitive === true,
    isActive: row.is_active === true,
  };
}

function mapAssignment(row) {
  if (!row) return null;
  return {
    id: row.id,
    userId: row.user_id,
    organizationId: row.organization_id,
    churchId: row.church_id || null,
    roleId: row.role_id,
    roleKey: row.role_key || null,
    isSensitiveRole: row.is_sensitive === true,
    scopeType: row.scope_type,
    scopeId: row.scope_id || null,
    status: row.status,
    assignedByUserId: row.assigned_by_user_id || null,
    assignmentOrigin: row.assignment_origin,
    assignmentReason: row.assignment_reason || null,
    expiresAt: row.expires_at || null,
    revokedAt: row.revoked_at || null,
    revokedByUserId: row.revoked_by_user_id || null,
    revocationReason: row.revocation_reason || null,
    createdAt: row.created_at || null,
    updatedAt: row.updated_at || null,
  };
}

/**
 * @param {{ query: Function }} client
 * @param {string} permissionKey
 */
async function findPermissionByKey(client, permissionKey) {
  const r = await client.query(
    `SELECT id, permission_key, resource_key, action_key, display_name, description,
            sensitivity, is_system, is_active
       FROM blessboard.permissions
      WHERE permission_key = $1
      LIMIT 1`,
    [permissionKey]
  );
  return mapPermission(r.rows[0] || null);
}

/**
 * @param {{ query: Function }} client
 * @param {string} roleKey
 */
async function findRoleByKey(client, roleKey) {
  const r = await client.query(
    `SELECT id, role_key, display_name, description, role_category,
            is_system, is_sensitive, is_active
       FROM blessboard.roles
      WHERE role_key = $1
      LIMIT 1`,
    [roleKey]
  );
  return mapRole(r.rows[0] || null);
}

/**
 * @param {{ query: Function }} client
 * @param {string} roleId
 */
async function listPermissionKeysForRoleId(client, roleId) {
  const r = await client.query(
    `SELECT p.permission_key
       FROM blessboard.role_permissions rp
       JOIN blessboard.permissions p ON p.id = rp.permission_id
      WHERE rp.role_id = $1
        AND p.is_active = true
      ORDER BY p.permission_key`,
    [roleId]
  );
  return r.rows.map((row) => row.permission_key);
}

/**
 * Active rows only (status=active). Caller applies expiry.
 * @param {{ query: Function }} client
 * @param {string} userId
 * @param {string} [organizationId]
 */
async function listActiveAssignmentsForUser(client, userId, organizationId) {
  const params = [userId];
  let orgClause = "";
  if (organizationId && UUID_RE.test(organizationId)) {
    params.push(organizationId);
    orgClause = ` AND a.organization_id = $2`;
  }
  const r = await client.query(
    `SELECT a.id, a.user_id, a.organization_id, a.church_id, a.role_id,
            a.scope_type, a.scope_id, a.status, a.assigned_by_user_id,
            a.assignment_origin, a.assignment_reason, a.expires_at,
            a.revoked_at, a.revoked_by_user_id, a.revocation_reason,
            a.created_at, a.updated_at,
            r.role_key, r.is_sensitive
       FROM blessboard.user_role_assignments a
       JOIN blessboard.roles r ON r.id = a.role_id
      WHERE a.user_id = $1
        AND a.status = 'active'
        AND r.is_active = true
        ${orgClause}
      ORDER BY a.created_at ASC`,
    params
  );
  return r.rows.map(mapAssignment);
}

/**
 * @param {{ query: Function }} client
 * @param {string} userId
 * @param {string} organizationId
 */
async function listAssignmentsForUserOrg(client, userId, organizationId) {
  const r = await client.query(
    `SELECT a.id, a.user_id, a.organization_id, a.church_id, a.role_id,
            a.scope_type, a.scope_id, a.status, a.assigned_by_user_id,
            a.assignment_origin, a.assignment_reason, a.expires_at,
            a.revoked_at, a.revoked_by_user_id, a.revocation_reason,
            a.created_at, a.updated_at,
            r.role_key, r.is_sensitive
       FROM blessboard.user_role_assignments a
       JOIN blessboard.roles r ON r.id = a.role_id
      WHERE a.user_id = $1
        AND a.organization_id = $2
      ORDER BY a.created_at DESC`,
    [userId, organizationId]
  );
  return r.rows.map(mapAssignment);
}

/**
 * @param {{ query: Function }} client
 * @param {string} assignmentId
 */
async function findAssignmentById(client, assignmentId) {
  const r = await client.query(
    `SELECT a.id, a.user_id, a.organization_id, a.church_id, a.role_id,
            a.scope_type, a.scope_id, a.status, a.assigned_by_user_id,
            a.assignment_origin, a.assignment_reason, a.expires_at,
            a.revoked_at, a.revoked_by_user_id, a.revocation_reason,
            a.created_at, a.updated_at,
            r.role_key, r.is_sensitive
       FROM blessboard.user_role_assignments a
       JOIN blessboard.roles r ON r.id = a.role_id
      WHERE a.id = $1
      LIMIT 1`,
    [assignmentId]
  );
  return mapAssignment(r.rows[0] || null);
}

/**
 * @param {{ query: Function }} client
 * @param {object} input
 */
async function insertAssignment(client, input) {
  const r = await client.query(
    `INSERT INTO blessboard.user_role_assignments (
       user_id, organization_id, church_id, role_id, scope_type, scope_id,
       status, assigned_by_user_id, assignment_origin, assignment_reason, expires_at
     ) VALUES ($1,$2,$3,$4,$5,$6,'active',$7,$8,$9,$10)
     RETURNING id, user_id, organization_id, church_id, role_id, scope_type, scope_id,
               status, assigned_by_user_id, assignment_origin, assignment_reason,
               expires_at, revoked_at, revoked_by_user_id, revocation_reason,
               created_at, updated_at`,
    [
      input.userId,
      input.organizationId,
      input.churchId || null,
      input.roleId,
      input.scopeType,
      input.scopeId || null,
      input.assignedByUserId || null,
      input.assignmentOrigin,
      input.assignmentReason || null,
      input.expiresAt || null,
    ]
  );
  return mapAssignment(r.rows[0]);
}

/**
 * @param {{ query: Function }} client
 * @param {{
 *   assignmentId: string,
 *   revokedByUserId: string | null,
 *   revocationReason: string | null,
 * }} input
 */
async function revokeAssignment(client, input) {
  const r = await client.query(
    `UPDATE blessboard.user_role_assignments
        SET status = 'revoked',
            revoked_at = now(),
            revoked_by_user_id = $2,
            revocation_reason = $3,
            updated_at = now()
      WHERE id = $1
        AND status = 'active'
      RETURNING id, user_id, organization_id, church_id, role_id, scope_type, scope_id,
                status, assigned_by_user_id, assignment_origin, assignment_reason,
                expires_at, revoked_at, revoked_by_user_id, revocation_reason,
                created_at, updated_at`,
    [input.assignmentId, input.revokedByUserId || null, input.revocationReason || null]
  );
  return mapAssignment(r.rows[0] || null);
}

/**
 * Mark a single assignment expired when encountered during evaluation.
 * @param {{ query: Function }} client
 * @param {string} assignmentId
 */
async function markAssignmentExpired(client, assignmentId) {
  const r = await client.query(
    `UPDATE blessboard.user_role_assignments
        SET status = 'expired',
            updated_at = now()
      WHERE id = $1
        AND status = 'active'
        AND expires_at IS NOT NULL
        AND expires_at <= now()
      RETURNING id`,
    [assignmentId]
  );
  return r.rowCount > 0;
}

/**
 * @param {{ query: Function }} client
 * @param {object} input
 */
async function insertAssignmentEvent(client, input) {
  const r = await client.query(
    `INSERT INTO blessboard.user_role_assignment_events (
       assignment_id, organization_id, actor_user_id, event_key,
       previous_status, new_status, reason, metadata_json
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb)
     RETURNING id, created_at`,
    [
      input.assignmentId,
      input.organizationId,
      input.actorUserId || null,
      input.eventKey,
      input.previousStatus || null,
      input.newStatus || null,
      input.reason || null,
      JSON.stringify(input.metadata || {}),
    ]
  );
  return r.rows[0] || null;
}

/**
 * Permission keys for many role ids (deduped in SQL).
 * @param {{ query: Function }} client
 * @param {string[]} roleIds
 */
async function listPermissionKeysForRoleIds(client, roleIds) {
  if (!roleIds || !roleIds.length) return [];
  const r = await client.query(
    `SELECT DISTINCT p.permission_key
       FROM blessboard.role_permissions rp
       JOIN blessboard.permissions p ON p.id = rp.permission_id
      WHERE rp.role_id = ANY($1::uuid[])
        AND p.is_active = true
      ORDER BY p.permission_key`,
    [roleIds]
  );
  return r.rows.map((row) => row.permission_key);
}

module.exports = {
  findPermissionByKey,
  findRoleByKey,
  listPermissionKeysForRoleId,
  listPermissionKeysForRoleIds,
  listActiveAssignmentsForUser,
  listAssignmentsForUserOrg,
  findAssignmentById,
  insertAssignment,
  revokeAssignment,
  markAssignmentExpired,
  insertAssignmentEvent,
};
