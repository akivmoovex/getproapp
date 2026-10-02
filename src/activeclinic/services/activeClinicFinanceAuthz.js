"use strict";

/**
 * Shared finance authorization helper for billing/cashier services.
 * Wraps authorizeStaffPermission with the correct (db, input) signature.
 */

const {
  authorizeStaffPermission,
  RESULT: AUTHZ_RESULT,
} = require("./activeClinicAuthorizationService");

/**
 * @param {import('pg').Pool} pool
 * @param {{
 *   tenantId: string,
 *   staffId: string,
 *   facilityId?: string|null,
 *   platformIdentityId?: string|null,
 *   permissionKey: string,
 * }} params
 */
async function requireFinancePermission(pool, params) {
  const authz = await authorizeStaffPermission(pool, {
    organizationId: params.tenantId,
    staffMemberId: params.staffId,
    platformIdentityId: params.platformIdentityId || undefined,
    facilityId: params.facilityId || null,
    permissionKey: params.permissionKey,
  });
  if (!authz.allowed) {
    return {
      ok: false,
      code: authz.code || AUTHZ_RESULT.DENIED,
      reason: authz.code || AUTHZ_RESULT.DENIED,
    };
  }
  return { ok: true, authz };
}

/**
 * Resolve P07 tenant/staff ids from ActiveClinic auth context.
 * Supports both V6 (`organization` / `staffMember`) and legacy aliases.
 */
function financeIdsFromAuth(auth) {
  const tenantId =
    (auth && auth.tenantId) ||
    (auth && auth.organization && auth.organization.id) ||
    null;
  const staffId =
    (auth && auth.staff && auth.staff.id) ||
    (auth && auth.staffMember && auth.staffMember.id) ||
    null;
  const platformIdentityId =
    (auth && auth.platformIdentity && auth.platformIdentity.id) || null;
  const permissions = Array.isArray(auth && auth.permissions)
    ? auth.permissions
    : [];
  return { tenantId, staffId, platformIdentityId, permissions };
}

function hasFinancePermission(permissions, permissionKey) {
  return Array.isArray(permissions) && permissions.includes(permissionKey);
}

function financeIdsWithFacility(auth, facility) {
  const ids = financeIdsFromAuth(auth);
  return {
    tenantId: ids.tenantId,
    facilityId: facility && facility.id,
    staffId: ids.staffId,
    platformIdentityId: ids.platformIdentityId,
  };
}

module.exports = {
  requireFinancePermission,
  financeIdsFromAuth,
  financeIdsWithFacility,
  hasFinancePermission,
  AUTHZ_RESULT,
};
