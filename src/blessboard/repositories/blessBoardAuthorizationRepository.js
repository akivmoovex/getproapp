"use strict";

/**
 * Read-only BlessBoard authorization queries (UUID-scoped).
 * Catalogue assignments only (V2.02) — does not read blessboard.user_roles.
 */

/**
 * @param {{ query: Function }} client
 * @param {string} userId
 * @returns {Promise<{ id: string, status: string } | null>}
 */
async function findUserStatusById(client, userId) {
  const r = await client.query(
    `SELECT id, status
       FROM blessboard.users
      WHERE id = $1
      LIMIT 1`,
    [userId]
  );
  return r.rows[0] || null;
}

/**
 * Active catalogue role assignments for authorization (not legacy user_roles).
 * Maps scope_type/scope_id onto organizationId / churchId / branchId.
 *
 * @param {{ query: Function }} client
 * @param {string} userId
 */
async function listActiveAuthorizationRoles(client, userId) {
  const r = await client.query(
    `SELECT r.role_key,
            a.organization_id,
            a.church_id,
            a.scope_type,
            a.scope_id,
            a.status
       FROM blessboard.user_role_assignments a
       INNER JOIN blessboard.roles r ON r.id = a.role_id AND r.is_active = true
      WHERE a.user_id = $1
        AND a.status = 'active'
        AND a.revoked_at IS NULL
        AND (a.expires_at IS NULL OR a.expires_at > now())
      ORDER BY r.role_key, a.organization_id NULLS LAST`,
    [userId]
  );
  return r.rows.map((row) => {
    const scopeType = String(row.scope_type || "");
    let branchId = null;
    let churchId = row.church_id || null;
    if (scopeType === "branch") {
      branchId = row.scope_id || null;
    }
    return {
      roleKey: row.role_key,
      organizationId: row.organization_id,
      churchId,
      branchId,
      scopeType,
      status: row.status,
    };
  });
}

/**
 * Confirm a branch UUID belongs to a church UUID (both must be active).
 * @param {{ query: Function }} client
 * @param {string} branchId
 * @param {string} churchId
 */
async function isActiveBranchOfChurch(client, branchId, churchId) {
  const r = await client.query(
    `SELECT 1 AS ok
       FROM blessboard.branches b
       JOIN blessboard.churches c ON c.id = b.church_id
      WHERE b.id = $1
        AND b.church_id = $2
        AND b.status = 'active'
        AND c.status = 'active'
      LIMIT 1`,
    [branchId, churchId]
  );
  return r.rows.length > 0;
}

module.exports = {
  findUserStatusById,
  listActiveAuthorizationRoles,
  isActiveBranchOfChurch,
};
