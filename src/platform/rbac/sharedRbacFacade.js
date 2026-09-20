"use strict";

/**
 * Shared RBAC facade — dispatches to product-owned catalogues / evaluators.
 * Does not merge BlessBoard and ActiveClinic permission tables.
 */

const {
  assertResourceInsideBlessBoardTenant,
  assertActiveClinicAuthScope,
  rejectForgedTenantIdentifiers,
  uuidEqual,
} = require("./sharedTenantScope");
const {
  REASON,
  authzDecision,
  evaluatePlatformAdminPermission,
} = require("./sharedAuthzDecision");

/**
 * Authorize a BlessBoard permission using the catalogue RBAC service.
 * @param {{ query: Function }} db
 * @param {{
 *   actorUserId: string,
 *   permissionKey: string,
 *   tenant: object,
 *   resourceContext?: object,
 * }} input
 */
async function authorizeBlessBoard(db, input) {
  const {
    authorize,
    REASON: BB_REASON,
  } = require("../../blessboard/services/blessBoardRbacAuthorizationService");

  const tenant = input && input.tenant;
  const resource =
    (input && input.resourceContext) ||
    (tenant && tenant.resolved
      ? {
          organizationId: tenant.organization.id,
          churchId: tenant.church.id,
          branchId:
            tenant.primaryBranch && tenant.primaryBranch.id
              ? tenant.primaryBranch.id
              : null,
        }
      : null);

  const scope = assertResourceInsideBlessBoardTenant(resource, tenant);
  if (!scope.ok) {
    return authzDecision({
      allowed: false,
      reasonCode: scope.reasonCode,
      httpStatus: scope.httpStatus,
      productKey: "blessboard",
      permission: input && input.permissionKey,
    });
  }

  const result = await authorize(db, {
    actor: { userId: input.actorUserId },
    permission: input.permissionKey,
    tenantContext: tenant,
    resourceContext: resource,
  });

  return authzDecision({
    allowed: result.allowed,
    reasonCode: result.reasonCode || (result.allowed ? BB_REASON.ALLOWED : BB_REASON.PERMISSION_DENIED),
    permission: input.permissionKey,
    productKey: "blessboard",
    matchedAssignments: result.matchedAssignments,
    evaluatedScopes: result.evaluatedScopes,
    httpStatus: result.allowed
      ? 200
      : result.reasonCode === BB_REASON.UNAUTHENTICATED ||
          result.reasonCode === BB_REASON.INACTIVE_USER
        ? 401
        : result.reasonCode === BB_REASON.LOOKUP_ERROR
          ? 503
          : 403,
    _internal: result._internal,
  });
}

/**
 * Authorize an ActiveClinic staff permission using the AC catalogue.
 * @param {{ query: Function }} db
 * @param {{
 *   auth: object,
 *   permissionKey: string,
 *   claimed?: { organizationId?: string, facilityId?: string },
 *   requireFacility?: boolean,
 * }} input
 */
async function authorizeActiveClinic(db, input) {
  const {
    authorizeStaffPermission,
  } = require("../../activeclinic/services/activeClinicAuthorizationService");

  const scope = assertActiveClinicAuthScope(
    (input && input.claimed) || null,
    input && input.auth,
    { requireFacility: input && input.requireFacility === true }
  );
  if (!scope.ok) {
    return authzDecision({
      allowed: false,
      reasonCode: scope.reasonCode,
      httpStatus: scope.httpStatus,
      productKey: "activeclinic",
      permission: input && input.permissionKey,
    });
  }

  const auth = input.auth;
  const checked = await authorizeStaffPermission(db, {
    organizationId: auth.organization.id,
    staffMemberId: auth.staffMember.id,
    platformIdentityId: auth.platformIdentity.id,
    permissionKey: input.permissionKey,
    facilityId: scope.facilityId,
  });

  return authzDecision({
    allowed: Boolean(checked && checked.allowed),
    reasonCode: checked && checked.allowed ? REASON.ALLOWED : REASON.PERMISSION_DENIED,
    permission: input.permissionKey,
    productKey: "activeclinic",
    httpStatus: checked && checked.allowed ? 200 : 403,
  });
}

/**
 * Cross-product guard: a BlessBoard session must not authorize ActiveClinic
 * mutations and vice versa via swapped cookies alone.
 *
 * @param {'blessboard'|'activeclinic'} expectedProduct
 * @param {{ productKey?: string, productCode?: string }|null} runtime
 */
function assertExpectedProduct(expectedProduct, runtime) {
  const expected = String(expectedProduct || "").trim().toLowerCase();
  const actual = String(
    (runtime && (runtime.productKey || runtime.productCode)) || ""
  )
    .trim()
    .toLowerCase();
  if (!expected) {
    return authzDecision({
      allowed: false,
      reasonCode: REASON.LOOKUP_ERROR,
      httpStatus: 503,
    });
  }
  if (!actual) {
    // Some hosts omit product on the request; callers should attach it.
    return authzDecision({
      allowed: true,
      reasonCode: REASON.ALLOWED,
      productKey: expected,
      _internal: { productCheckSkipped: true },
    });
  }
  if (actual !== expected) {
    return authzDecision({
      allowed: false,
      reasonCode: REASON.PRODUCT_MISMATCH,
      httpStatus: 403,
      productKey: actual,
      message: `Expected product ${expected}, got ${actual}`,
    });
  }
  return authzDecision({
    allowed: true,
    reasonCode: REASON.ALLOWED,
    productKey: expected,
  });
}

module.exports = {
  authorizeBlessBoard,
  authorizeActiveClinic,
  evaluatePlatformAdminPermission,
  assertExpectedProduct,
  rejectForgedTenantIdentifiers,
  uuidEqual,
  REASON,
  authzDecision,
};
