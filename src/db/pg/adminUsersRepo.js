"use strict";

const { ROLES } = require("../../auth/roles");

/**
 * PostgreSQL access for public.admin_users (Wave 3 admin auth + CRUD).
 */

/** Match SQLite list/edit semantics: `enabled` as 0|1, stable `created_at` string. */
function serializeAdminRow(row) {
  if (!row) return row;
  const out = { ...row };
  if (out.created_at instanceof Date) {
    out.created_at = out.created_at.toISOString().replace("T", " ").slice(0, 19);
  }
  if (out.enabled != null) {
    out.enabled = out.enabled === true || Number(out.enabled) === 1 ? 1 : 0;
  }
  return out;
}

/**
 * @param {import("pg").Pool} pool
 * @param {string} usernameLower
 * @returns {Promise<object | null>} full row (enabled as boolean)
 */
async function getByUsernameLower(pool, usernameLower) {
  const u = String(usernameLower || "").toLowerCase().trim();
  if (!u) return null;
  const r = await pool.query(`SELECT * FROM public.admin_users WHERE lower(username) = lower($1) LIMIT 1`, [u]);
  return r.rows[0] ?? null;
}

/**
 * @param {import("pg").Pool} pool
 * @param {string} usernameLower
 * @returns {Promise<{ id: number } | null>}
 */
async function getIdByUsernameLower(pool, usernameLower) {
  const u = String(usernameLower || "").toLowerCase().trim();
  if (!u) return null;
  const r = await pool.query(`SELECT id FROM public.admin_users WHERE lower(username) = lower($1) LIMIT 1`, [u]);
  return r.rows[0] ?? null;
}

/**
 * @param {import("pg").Pool} pool
 * @param {number} id
 */
async function getById(pool, id) {
  const r = await pool.query(`SELECT * FROM public.admin_users WHERE id = $1`, [id]);
  const row = r.rows[0];
  return row ? serializeAdminRow(row) : null;
}

/**
 * Tenant-scoped user list (same semantics as SQLite admin /users).
 * @param {import("pg").Pool} pool
 * @param {number} tenantId
 */
async function listUsersForTenantScope(pool, tenantId) {
  const r = await pool.query(
    `
    SELECT sub.id, sub.username, sub.enabled, sub.created_at, sub.role
    FROM (
      SELECT DISTINCT u.id, u.username, u.enabled, u.created_at,
             COALESCE(m.role, u.role) AS role,
             lower(u.username) AS username_sort
      FROM public.admin_users u
      LEFT JOIN public.admin_user_tenant_roles m ON m.admin_user_id = u.id AND m.tenant_id = $1
      WHERE m.tenant_id IS NOT NULL OR u.tenant_id = $1
    ) sub
    ORDER BY sub.username_sort ASC
    `,
    [tenantId]
  );
  return r.rows.map(serializeAdminRow);
}

/**
 * User visible in tenant scope, with membership role overlay when present.
 * @param {import("pg").Pool} pool
 */
async function getUserInTenantScope(pool, userId, tenantId) {
  const r = await pool.query(
    `
    SELECT u.* FROM public.admin_users u
    WHERE u.id = $1
      AND (
        u.tenant_id = $2
        OR EXISTS (
          SELECT 1 FROM public.admin_user_tenant_roles m
          WHERE m.admin_user_id = u.id AND m.tenant_id = $2
        )
      )
    `,
    [userId, tenantId]
  );
  const row = r.rows[0];
  if (!row) return null;
  const out = serializeAdminRow(row);
  const m = await pool.query(
    `SELECT role FROM public.admin_user_tenant_roles WHERE admin_user_id = $1 AND tenant_id = $2`,
    [userId, tenantId]
  );
  if (m.rows[0] && m.rows[0].role) {
    out.role = m.rows[0].role;
  }
  return out;
}

/**
 * @param {import("pg").Pool} pool
 * @param {{ username: string, passwordHash: string, role: string, tenantId: number | null, displayName?: string }} p
 * @returns {Promise<number>} new id
 */
async function insertUser(pool, p) {
  const r = await pool.query(
    `INSERT INTO public.admin_users (username, password_hash, role, tenant_id, enabled, display_name)
     VALUES ($1, $2, $3, $4, true, $5)
     RETURNING id`,
    [p.username, p.passwordHash, p.role, p.tenantId, p.displayName != null ? p.displayName : ""]
  );
  return Number(r.rows[0].id);
}

/**
 * Tenant /users edit: username, role, enabled (0|1), optional password.
 * @param {import("pg").Pool} pool
 */
async function updateTenantScopedUser(pool, id, { username, role, enabledNum, passwordHash }) {
  if (passwordHash) {
    const r = await pool.query(
      `UPDATE public.admin_users SET username = $1, role = $2, enabled = $3, password_hash = $4 WHERE id = $5`,
      [username, role, enabledNum === 1, passwordHash, id]
    );
    return r.rowCount > 0;
  }
  const r = await pool.query(`UPDATE public.admin_users SET username = $1, role = $2, enabled = $3 WHERE id = $4`, [
    username,
    role,
    enabledNum === 1,
    id,
  ]);
  return r.rowCount > 0;
}

/**
 * Super-console user edit.
 * @param {import("pg").Pool} pool
 */
async function updateSuperConsoleUser(pool, id, { username, role, tenantId, enabledNum, passwordHash }) {
  if (passwordHash) {
    const r = await pool.query(
      `UPDATE public.admin_users SET username = $1, role = $2, tenant_id = $3, enabled = $4, password_hash = $5 WHERE id = $6`,
      [username, role, tenantId, enabledNum === 1, passwordHash, id]
    );
    return r.rowCount > 0;
  }
  const r = await pool.query(
    `UPDATE public.admin_users SET username = $1, role = $2, tenant_id = $3, enabled = $4 WHERE id = $5`,
    [username, role, tenantId, enabledNum === 1, id]
  );
  return r.rowCount > 0;
}

/**
 * @param {import("pg").Pool} pool
 */
async function deleteById(pool, id) {
  const r = await pool.query(`DELETE FROM public.admin_users WHERE id = $1`, [id]);
  return r.rowCount > 0;
}

/**
 * @param {import("pg").Pool} pool
 */
async function countByRoleAndEnabled(pool, role, enabledOnly) {
  const r = await pool.query(
    enabledOnly
      ? `SELECT COUNT(*)::int AS c FROM public.admin_users WHERE role = $1 AND enabled = true`
      : `SELECT COUNT(*)::int AS c FROM public.admin_users WHERE role = $1`,
    [role]
  );
  return r.rows[0].c;
}

/**
 * Super-console user list with tenant join (same filters as legacy SQLite).
 * @param {import("pg").Pool} pool
 * @param {string} filterKey all | global_zm | gz | global | zm
 */
async function listForSuperConsole(pool, filterKey) {
  const base = `
    SELECT u.id, u.username, u.role, u.enabled, u.tenant_id, u.created_at,
           t.slug AS tenant_slug, t.name AS tenant_name
    FROM public.admin_users u
    LEFT JOIN public.tenants t ON u.tenant_id = t.id
  `;
  const orderBy = " ORDER BY COALESCE(t.slug, ''), u.username ASC";
  const f = String(filterKey || "all").toLowerCase();

  const rG = await pool.query(`SELECT id FROM public.tenants WHERE slug = 'global' LIMIT 1`);
  const rZ = await pool.query(`SELECT id FROM public.tenants WHERE slug = 'zm' LIMIT 1`);
  const globalId = rG.rows[0]?.id ?? null;
  const zmId = rZ.rows[0]?.id ?? null;

  if (f === "global_zm" || f === "gz") {
    const ids = [globalId, zmId].filter((x) => x != null);
    const params = [];
    const parts = [];
    let idx = 1;
    if (ids.length) {
      parts.push(`u.tenant_id IN (${ids.map(() => `$${idx++}`).join(", ")})`);
      params.push(...ids);
    }
    parts.push(`(u.role = $${idx} AND u.tenant_id IS NULL)`);
    params.push(ROLES.SUPER_ADMIN);
    const sql = `${base} WHERE ${parts.join(" OR ")}${orderBy}`;
    const r = await pool.query(sql, params);
    return r.rows.map(serializeAdminRow);
  }
  if (f === "global" && globalId != null) {
    const r = await pool.query(
      `${base} WHERE u.tenant_id = $1 OR (u.role = $2 AND u.tenant_id IS NULL)${orderBy}`,
      [globalId, ROLES.SUPER_ADMIN]
    );
    return r.rows.map(serializeAdminRow);
  }
  if (f === "zm" && zmId != null) {
    const r = await pool.query(`${base} WHERE u.tenant_id = $1${orderBy}`, [zmId]);
    return r.rows.map(serializeAdminRow);
  }
  const r = await pool.query(`${base}${orderBy}`);
  return r.rows.map(serializeAdminRow);
}

/**
 * @param {import("pg").Pool} pool
 */
async function updateDisplayNameAndPasswordHash(pool, id, displayName, passwordHash) {
  await pool.query(`UPDATE public.admin_users SET display_name = $1, password_hash = $2 WHERE id = $3`, [
    displayName,
    passwordHash,
    id,
  ]);
}

/**
 * @param {import("pg").Pool} pool
 */
async function updateRoleTenantHome(pool, id, role, tenantId) {
  await pool.query(`UPDATE public.admin_users SET role = $1, tenant_id = $2 WHERE id = $3`, [role, tenantId, id]);
}

/**
 * @param {import("pg").Pool} pool
 */
async function tenantExistsById(pool, tenantId) {
  const r = await pool.query(`SELECT id FROM public.tenants WHERE id = $1 LIMIT 1`, [tenantId]);
  return r.rows.length > 0;
}

/**
 * @param {import("pg").Pool} pool
 */
async function getTenantNameSlug(pool, tenantId) {
  const r = await pool.query(`SELECT name, slug FROM public.tenants WHERE id = $1`, [tenantId]);
  return r.rows[0] ?? null;
}

module.exports = {
  getByUsernameLower,
  getIdByUsernameLower,
  getById,
  listUsersForTenantScope,
  getUserInTenantScope,
  insertUser,
  updateTenantScopedUser,
  updateSuperConsoleUser,
  deleteById,
  countByRoleAndEnabled,
  listForSuperConsole,
  updateDisplayNameAndPasswordHash,
  updateRoleTenantHome,
  tenantExistsById,
  getTenantNameSlug,
};
