"use strict";

/**
 * Legacy compatibility permission bundles — REMOVED (V2.02).
 *
 * blessboard.user_roles authorization fallthrough is gone.
 * This module remains only so old require() paths do not crash;
 * all exports are empty / no-op.
 *
 * Prefer catalogue role_permissions + user_role_assignments.
 */

const LEGACY_BUNDLES = Object.freeze({});

function permissionsForLegacyRoleKey(_roleKey) {
  return Object.freeze([]);
}

function mapLegacyRolesToPermissionGrants(_legacyRoles) {
  return [];
}

function isLegacyRoleKey(_roleKey) {
  return false;
}

module.exports = {
  LEGACY_BUNDLES,
  permissionsForLegacyRoleKey,
  mapLegacyRolesToPermissionGrants,
  isLegacyRoleKey,
};
