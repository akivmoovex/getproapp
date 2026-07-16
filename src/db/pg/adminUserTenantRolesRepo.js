"use strict";

/**
 * PostgreSQL access for public.admin_user_tenant_roles.
 */

const { bumpAccountSecurityVersion } = require("../../church/accountSecurityVersion");

/**
 * @param {import("pg").Pool} pool
 * @param {number} adminUserId
 */
async function listByAdminUserId(pool, adminUserId) {
  const r = await pool.query(
    `SELECT tenant_id, role FROM public.admin_user_tenant_roles WHERE admin_user_id = $1 ORDER BY tenant_id ASC`,
    [adminUserId]
  );
  return r.rows;
}

/**
 * Upsert tenant role membership and bump the admin's security_version.
 * @param {import("pg").Pool} pool
 * @param {number} adminUserId
 * @param {number} tenantId
 * @param {string} role
 */
async function upsert(pool, adminUserId, tenantId, role) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(
      `INSERT INTO public.admin_user_tenant_roles (admin_user_id, tenant_id, role)
       VALUES ($1, $2, $3)
       ON CONFLICT (admin_user_id, tenant_id) DO UPDATE SET role = EXCLUDED.role`,
      [adminUserId, tenantId, role]
    );
    await bumpAccountSecurityVersion(client, "platform_admin", adminUserId);
    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Delete tenant role membership and bump the admin's security_version.
 * @param {import("pg").Pool} pool
 */
async function deleteForUserAndTenant(pool, adminUserId, tenantId) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(`DELETE FROM public.admin_user_tenant_roles WHERE admin_user_id = $1 AND tenant_id = $2`, [
      adminUserId,
      tenantId,
    ]);
    await bumpAccountSecurityVersion(client, "platform_admin", adminUserId);
    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

/**
 * @param {import("pg").Pool} pool
 */
async function deleteAllForUser(pool, adminUserId) {
  await pool.query(`DELETE FROM public.admin_user_tenant_roles WHERE admin_user_id = $1`, [adminUserId]);
}

/**
 * @param {import("pg").Pool} pool
 */
async function countForUser(pool, adminUserId) {
  const r = await pool.query(
    `SELECT COUNT(*)::int AS c FROM public.admin_user_tenant_roles WHERE admin_user_id = $1`,
    [adminUserId]
  );
  return r.rows[0].c;
}

/**
 * @param {import("pg").Pool} pool
 * @returns {Promise<{ tenant_id: number, role: string } | null>}
 */
async function getFirstMembershipOrderByTenant(pool, adminUserId) {
  const r = await pool.query(
    `SELECT tenant_id, role FROM public.admin_user_tenant_roles WHERE admin_user_id = $1 ORDER BY tenant_id ASC LIMIT 1`,
    [adminUserId]
  );
  return r.rows[0] ?? null;
}

module.exports = {
  listByAdminUserId,
  upsert,
  deleteForUserAndTenant,
  deleteAllForUser,
  countForUser,
  getFirstMembershipOrderByTenant,
};
