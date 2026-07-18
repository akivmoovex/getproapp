"use strict";

/**
 * Read-only BlessBoard authorization queries (UUID-scoped).
 * No writes. Caller supplies a pool/client.
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
 * Active roles only. Returns compact mapped objects (not raw row dumps for callers).
 * @param {{ query: Function }} client
 * @param {string} userId
 */
async function listActiveAuthorizationRoles(client, userId) {
  const r = await client.query(
    `SELECT role_key, organization_id, church_id, branch_id, status
       FROM blessboard.user_roles
      WHERE user_id = $1
        AND status = 'active'
      ORDER BY role_key, organization_id`,
    [userId]
  );
  return r.rows.map((row) => ({
    roleKey: row.role_key,
    organizationId: row.organization_id,
    churchId: row.church_id,
    branchId: row.branch_id,
    status: row.status,
  }));
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
