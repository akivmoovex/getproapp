"use strict";

/**
 * Platform effective-permission primitives.
 * Resolves permission keys from catalogue role ids/keys.
 * Does not apply product assignment scopes, legacy compat, or login rules.
 */

const catalogRepo = require("./platformRbacCatalogRepository");
const { lookupRoles, LOOKUP_STATUS } = require("./platformRbacCatalogService");

/**
 * @param {{ query: Function }} client
 * @param {{
 *   roleIds?: string[],
 *   roleKeys?: string[],
 *   product?: string,
 *   activeRolesOnly?: boolean,
 * }} input
 */
async function resolveEffectivePermissionKeys(client, input) {
  const src = input || {};
  const activeRolesOnly = src.activeRolesOnly !== false;
  const roleIds = new Set();
  const unresolvedKeys = [];
  const inactiveKeys = [];
  const productMismatchKeys = [];
  const invalidKeys = [];
  const duplicateRequestKeys = [];

  if (Array.isArray(src.roleIds)) {
    for (const id of src.roleIds) {
      const trimmed = String(id || "").trim();
      if (trimmed) roleIds.add(trimmed);
    }
  }

  if (Array.isArray(src.roleKeys) && src.roleKeys.length) {
    const looked = await lookupRoles(client, src.roleKeys, {
      product: src.product,
      activeOnly: activeRolesOnly,
    });
    duplicateRequestKeys.push(...looked.duplicateRequestKeys);
    for (const row of looked.results) {
      if (row.status === LOOKUP_STATUS.OK && row.role) {
        roleIds.add(row.role.id);
      } else if (row.status === LOOKUP_STATUS.MISSING) {
        unresolvedKeys.push(row.roleKey);
      } else if (row.status === LOOKUP_STATUS.INACTIVE) {
        inactiveKeys.push(row.roleKey);
      } else if (row.status === LOOKUP_STATUS.PRODUCT_MISMATCH) {
        productMismatchKeys.push(row.roleKey);
      } else if (row.status === LOOKUP_STATUS.INVALID_KEY) {
        invalidKeys.push(row.roleKey);
      }
    }
  }

  const ids = [...roleIds];
  const permissionKeys = await catalogRepo.listPermissionKeysForRoleIds(client, ids);

  return {
    permissionKeys,
    permissionKeySet: new Set(permissionKeys),
    roleIds: ids,
    missingRoleKeys: unresolvedKeys,
    inactiveRoleKeys: inactiveKeys,
    productMismatchRoleKeys: productMismatchKeys,
    invalidRoleKeys: invalidKeys,
    duplicateRequestKeys,
    hasPermission(permissionKey) {
      return permissionKeys.includes(String(permissionKey || ""));
    },
  };
}

/**
 * Pure helper — union permission key arrays without DB.
 * @param {...string[]} lists
 */
function unionPermissionKeys(...lists) {
  const set = new Set();
  for (const list of lists) {
    if (!Array.isArray(list)) continue;
    for (const key of list) {
      const k = String(key || "").trim();
      if (k) set.add(k);
    }
  }
  return [...set].sort();
}

/**
 * @param {string[]} permissionKeys
 * @param {string} permissionKey
 */
function hasPermissionKey(permissionKeys, permissionKey) {
  const want = String(permissionKey || "").trim();
  if (!want) return false;
  return (permissionKeys || []).includes(want);
}

module.exports = {
  resolveEffectivePermissionKeys,
  unionPermissionKeys,
  hasPermissionKey,
};
