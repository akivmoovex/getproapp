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
  insertUser,
  listActiveRolesForUser,
  findOrganizationByKey,
  findChurchByKey,
  findBranchByChurchAndKey,
  findRole,
  insertRole,
  touchLastLogin,
  isUniqueViolation,
};
