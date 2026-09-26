"use strict";

/**
 * Platform RBAC catalogue repository.
 * Reads shared role/permission tables (physically blessboard.* until Phase F).
 * Does not mutate catalogue rows or product assignment tables.
 */

const {
  CATALOGUE_ROLES_TABLE,
  CATALOGUE_PERMISSIONS_TABLE,
  CATALOGUE_ROLE_PERMISSIONS_TABLE,
  ROLE_KEY_RE,
  PERMISSION_KEY_RE,
} = require("./platformRbacConstants");

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

/**
 * @param {{ query: Function }} client
 * @param {string} permissionKey
 * @param {{ activeOnly?: boolean }} [opts]
 */
async function findPermissionByKey(client, permissionKey, opts) {
  const key = String(permissionKey || "").trim();
  if (!key || !PERMISSION_KEY_RE.test(key)) return null;
  const activeOnly = opts && opts.activeOnly === true;
  const r = await client.query(
    `SELECT id, permission_key, resource_key, action_key, display_name, description,
            sensitivity, is_system, is_active
       FROM ${CATALOGUE_PERMISSIONS_TABLE}
      WHERE permission_key = $1
        ${activeOnly ? "AND is_active = true" : ""}
      LIMIT 1`,
    [key]
  );
  return mapPermission(r.rows[0] || null);
}

/**
 * @param {{ query: Function }} client
 * @param {string} roleKey
 * @param {{ activeOnly?: boolean }} [opts]
 */
async function findRoleByKey(client, roleKey, opts) {
  const key = String(roleKey || "").trim();
  if (!key || !ROLE_KEY_RE.test(key)) return null;
  const activeOnly = opts && opts.activeOnly === true;
  const r = await client.query(
    `SELECT id, role_key, display_name, description, role_category,
            is_system, is_sensitive, is_active
       FROM ${CATALOGUE_ROLES_TABLE}
      WHERE role_key = $1
        ${activeOnly ? "AND is_active = true" : ""}
      LIMIT 1`,
    [key]
  );
  return mapRole(r.rows[0] || null);
}

/**
 * @param {{ query: Function }} client
 * @param {string} roleId
 */
async function findRoleById(client, roleId) {
  const id = String(roleId || "").trim();
  if (!id) return null;
  const r = await client.query(
    `SELECT id, role_key, display_name, description, role_category,
            is_system, is_sensitive, is_active
       FROM ${CATALOGUE_ROLES_TABLE}
      WHERE id = $1::uuid
      LIMIT 1`,
    [id]
  );
  return mapRole(r.rows[0] || null);
}

/**
 * @param {{ query: Function }} client
 * @param {{
 *   categories?: string[],
 *   activeOnly?: boolean,
 *   roleKeys?: string[],
 * }} [opts]
 */
async function listRoles(client, opts) {
  const o = opts || {};
  const params = [];
  const clauses = [];
  if (o.activeOnly === true) {
    clauses.push("is_active = true");
  }
  if (Array.isArray(o.categories) && o.categories.length) {
    params.push(o.categories);
    clauses.push(`role_category = ANY($${params.length}::text[])`);
  }
  if (Array.isArray(o.roleKeys) && o.roleKeys.length) {
    params.push(o.roleKeys);
    clauses.push(`role_key = ANY($${params.length}::text[])`);
  }
  const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
  const r = await client.query(
    `SELECT id, role_key, display_name, description, role_category,
            is_system, is_sensitive, is_active
       FROM ${CATALOGUE_ROLES_TABLE}
      ${where}
      ORDER BY role_category ASC, role_key ASC`,
    params
  );
  return r.rows.map(mapRole);
}

/**
 * @param {{ query: Function }} client
 * @param {string} roleId
 */
async function listPermissionKeysForRoleId(client, roleId) {
  const id = String(roleId || "").trim();
  if (!id) return [];
  const r = await client.query(
    `SELECT p.permission_key
       FROM ${CATALOGUE_ROLE_PERMISSIONS_TABLE} rp
       JOIN ${CATALOGUE_PERMISSIONS_TABLE} p ON p.id = rp.permission_id
      WHERE rp.role_id = $1::uuid
        AND p.is_active = true
      ORDER BY p.permission_key`,
    [id]
  );
  return r.rows.map((row) => row.permission_key);
}

/**
 * @param {{ query: Function }} client
 * @param {string[]} roleIds
 */
async function listPermissionKeysForRoleIds(client, roleIds) {
  const ids = Array.isArray(roleIds)
    ? roleIds.map((id) => String(id || "").trim()).filter(Boolean)
    : [];
  if (!ids.length) return [];
  const r = await client.query(
    `SELECT DISTINCT p.permission_key
       FROM ${CATALOGUE_ROLE_PERMISSIONS_TABLE} rp
       JOIN ${CATALOGUE_PERMISSIONS_TABLE} p ON p.id = rp.permission_id
      WHERE rp.role_id = ANY($1::uuid[])
        AND p.is_active = true
      ORDER BY p.permission_key`,
    [ids]
  );
  return r.rows.map((row) => row.permission_key);
}

/**
 * @param {{ query: Function }} client
 * @param {string[]} roleKeys
 * @param {{ activeOnly?: boolean }} [opts]
 */
async function listRolesByKeys(client, roleKeys, opts) {
  const keys = Array.isArray(roleKeys)
    ? [...new Set(roleKeys.map((k) => String(k || "").trim()).filter(Boolean))]
    : [];
  if (!keys.length) return [];
  return listRoles(client, {
    roleKeys: keys,
    activeOnly: opts && opts.activeOnly === true,
  });
}

module.exports = {
  mapPermission,
  mapRole,
  findPermissionByKey,
  findRoleByKey,
  findRoleById,
  listRoles,
  listRolesByKeys,
  listPermissionKeysForRoleId,
  listPermissionKeysForRoleIds,
};
