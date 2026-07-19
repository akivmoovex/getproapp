"use strict";

/**
 * BlessBoard auth repository helpers (parameterized SQL).
 */

/**
 * @param {{ query: Function }} client
 * @param {string} emailNormalized
 */
async function findUserByEmail(client, emailNormalized) {
  const r = await client.query(
    `SELECT id, email_normalized, email_display, password_hash, status, display_name,
            created_at, updated_at, password_changed_at, last_login_at
       FROM blessboard.users
      WHERE email_normalized = $1
      LIMIT 1`,
    [emailNormalized]
  );
  return r.rows[0] || null;
}

/**
 * @param {{ query: Function }} client
 * @param {{
 *   emailNormalized: string,
 *   emailDisplay: string,
 *   passwordHash: string,
 *   displayName: string,
 *   status?: string
 * }} fields
 */
async function insertUser(client, fields) {
  const r = await client.query(
    `INSERT INTO blessboard.users
       (email_normalized, email_display, password_hash, status, display_name)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING id, email_normalized, email_display, status, display_name, created_at`,
    [
      fields.emailNormalized,
      fields.emailDisplay,
      fields.passwordHash,
      fields.status || "active",
      fields.displayName,
    ]
  );
  return r.rows[0];
}

/**
 * @param {{ query: Function }} client
 * @param {string} userId
 */
async function listActiveRolesForUser(client, userId) {
  const r = await client.query(
    `SELECT id, user_id, organization_id, church_id, branch_id, role_key, status
       FROM blessboard.user_roles
      WHERE user_id = $1 AND status = 'active'
      ORDER BY role_key, organization_id`,
    [userId]
  );
  return r.rows;
}

/**
 * @param {{ query: Function }} client
 * @param {string} organizationKey
 */
async function findOrganizationByKey(client, organizationKey) {
  const r = await client.query(
    `SELECT id, organization_key, status, data_environment
       FROM platform.organizations
      WHERE organization_key = $1
      LIMIT 1`,
    [organizationKey]
  );
  return r.rows[0] || null;
}

/**
 * @param {{ query: Function }} client
 * @param {string} churchKey
 */
async function findChurchByKey(client, churchKey) {
  const r = await client.query(
    `SELECT id, organization_id, church_key, status
       FROM blessboard.churches
      WHERE church_key = $1
      LIMIT 1`,
    [churchKey]
  );
  return r.rows[0] || null;
}

/**
 * @param {{ query: Function }} client
 * @param {string} churchId
 * @param {string} branchKey
 */
async function findBranchByChurchAndKey(client, churchId, branchKey) {
  const r = await client.query(
    `SELECT id, church_id, branch_key, status, branch_type
       FROM blessboard.branches
      WHERE church_id = $1 AND branch_key = $2
      LIMIT 1`,
    [churchId, branchKey]
  );
  return r.rows[0] || null;
}

/**
 * @param {{ query: Function }} client
 * @param {{
 *   userId: string,
 *   organizationId: string,
 *   churchId: string | null,
 *   branchId: string | null,
 *   roleKey: string
 * }} fields
 */
async function findRole(client, fields) {
  const r = await client.query(
    `SELECT id, user_id, organization_id, church_id, branch_id, role_key, status
       FROM blessboard.user_roles
      WHERE user_id = $1
        AND organization_id = $2
        AND role_key = $3
        AND church_id IS NOT DISTINCT FROM $4
        AND branch_id IS NOT DISTINCT FROM $5
      LIMIT 1`,
    [
      fields.userId,
      fields.organizationId,
      fields.roleKey,
      fields.churchId,
      fields.branchId,
    ]
  );
  return r.rows[0] || null;
}

/**
 * @param {{ query: Function }} client
 * @param {{
 *   userId: string,
 *   organizationId: string,
 *   churchId: string | null,
 *   branchId: string | null,
 *   roleKey: string
 * }} fields
 */
async function insertRole(client, fields) {
  const r = await client.query(
    `INSERT INTO blessboard.user_roles
       (user_id, organization_id, church_id, branch_id, role_key, status)
     VALUES ($1, $2, $3, $4, $5, 'active')
     RETURNING id, user_id, organization_id, church_id, branch_id, role_key, status`,
    [
      fields.userId,
      fields.organizationId,
      fields.churchId,
      fields.branchId,
      fields.roleKey,
    ]
  );
  return r.rows[0];
}

/**
 * @param {{ query: Function }} client
 * @param {string} roleId
 */
async function findRoleById(client, roleId) {
  const r = await client.query(
    `SELECT id, user_id, organization_id, church_id, branch_id, role_key, status, created_at, updated_at
       FROM blessboard.user_roles
      WHERE id = $1
      LIMIT 1`,
    [roleId]
  );
  return r.rows[0] || null;
}

/**
 * @param {{ query: Function }} client
 * @param {string} roleId
 * @param {string} status
 */
async function updateRoleStatus(client, roleId, status) {
  const r = await client.query(
    `UPDATE blessboard.user_roles
        SET status = $2, updated_at = now()
      WHERE id = $1
      RETURNING id, user_id, organization_id, church_id, branch_id, role_key, status`,
    [roleId, status]
  );
  return r.rows[0] || null;
}

/**
 * Active church-scoped staff roles (HQ + branch admin). Never returns platform_admin.
 * @param {{ query: Function }} client
 * @param {{ churchId: string, organizationId: string, q?: string | null, roleKey?: string | null, limit?: number, offset?: number }} filters
 */
async function listChurchStaffRoles(client, filters) {
  const churchId = String(filters.churchId || "").trim();
  const organizationId = String(filters.organizationId || "").trim();
  const q = filters.q ? String(filters.q).trim().toLowerCase().slice(0, 100) : "";
  const roleKey = filters.roleKey ? String(filters.roleKey).trim().toLowerCase() : "";
  const limit = Math.min(Math.max(Number(filters.limit) || 50, 1), 100);
  const offset = Math.max(Number(filters.offset) || 0, 0);
  const params = [organizationId, churchId];
  let roleClause = "";
  if (roleKey === "church_hq_admin" || roleKey === "branch_admin") {
    params.push(roleKey);
    roleClause = ` AND ur.role_key = $${params.length}`;
  }
  let searchClause = "";
  if (q) {
    params.push(`%${q}%`);
    searchClause = ` AND (
      u.email_normalized LIKE $${params.length}
      OR lower(coalesce(u.display_name, '')) LIKE $${params.length}
      OR lower(coalesce(b.branch_key, '')) LIKE $${params.length}
      OR lower(coalesce(b.display_name, '')) LIKE $${params.length}
    )`;
  }
  params.push(limit);
  const limitIdx = params.length;
  params.push(offset);
  const offsetIdx = params.length;

  const { rows } = await client.query(
    `SELECT ur.id, ur.user_id, ur.organization_id, ur.church_id, ur.branch_id,
            ur.role_key, ur.status, ur.created_at, ur.updated_at,
            u.email_display, u.email_normalized, u.display_name AS user_display_name, u.status AS user_status,
            b.branch_key, b.display_name AS branch_display_name,
            COUNT(*) OVER()::int AS total_count
       FROM blessboard.user_roles ur
       INNER JOIN blessboard.users u ON u.id = ur.user_id
       LEFT JOIN blessboard.branches b ON b.id = ur.branch_id
      WHERE ur.organization_id = $1
        AND ur.church_id = $2
        AND ur.status = 'active'
        AND ur.role_key IN ('church_hq_admin', 'branch_admin')
        ${roleClause}
        ${searchClause}
      ORDER BY ur.role_key ASC, u.display_name ASC NULLS LAST, u.email_normalized ASC
      LIMIT $${limitIdx} OFFSET $${offsetIdx}`,
    params
  );
  return rows;
}

/**
 * @param {{ query: Function }} client
 * @param {string} churchId
 * @param {string} organizationId
 */
async function countActiveChurchStaffRoles(client, churchId, organizationId) {
  const { rows } = await client.query(
    `SELECT
        COUNT(*) FILTER (WHERE role_key = 'church_hq_admin')::int AS hq_admins,
        COUNT(*) FILTER (WHERE role_key = 'branch_admin')::int AS branch_admins
       FROM blessboard.user_roles
      WHERE organization_id = $1
        AND church_id = $2
        AND status = 'active'
        AND role_key IN ('church_hq_admin', 'branch_admin')`,
    [organizationId, churchId]
  );
  return {
    hqAdmins: Number(rows[0] && rows[0].hq_admins) || 0,
    branchAdmins: Number(rows[0] && rows[0].branch_admins) || 0,
  };
}

/**
 * @param {{ query: Function }} client
 * @param {string} userId
 */
async function findUserById(client, userId) {
  const r = await client.query(
    `SELECT id, email_normalized, email_display, password_hash, status, display_name,
            created_at, updated_at, password_changed_at, last_login_at
       FROM blessboard.users
      WHERE id = $1
      LIMIT 1`,
    [userId]
  );
  return r.rows[0] || null;
}

/**
 * @param {{ query: Function }} client
 * @param {string} userId
 */
async function touchLastLogin(client, userId) {
  await client.query(
    `UPDATE blessboard.users SET last_login_at = now(), updated_at = now() WHERE id = $1`,
    [userId]
  );
}

function isUniqueViolation(err) {
  return Boolean(err && (err.code === "23505" || /unique|duplicate/i.test(String(err.message || ""))));
}

module.exports = {
  findUserByEmail,
  findUserById,
  insertUser,
  listActiveRolesForUser,
  findOrganizationByKey,
  findChurchByKey,
  findBranchByChurchAndKey,
  findRole,
  findRoleById,
  insertRole,
  updateRoleStatus,
  listChurchStaffRoles,
  countActiveChurchStaffRoles,
  touchLastLogin,
  isUniqueViolation,
};
