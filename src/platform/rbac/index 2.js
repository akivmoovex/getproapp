"use strict";

/**
 * Shared RBAC + tenant isolation (V8 / V2.02).
 * Catalogue lookup + effective-permission primitives are platform-owned.
 * Physical role/permission rows remain in blessboard.* until Phase F relocate.
 * Product assignment tables and login eligibility stay product-owned.
 */

const tenantScope = require("./sharedTenantScope");
const authzDecision = require("./sharedAuthzDecision");
const facade = require("./sharedRbacFacade");
const constants = require("./platformRbacConstants");
const catalogRepository = require("./platformRbacCatalogRepository");
const catalogService = require("./platformRbacCatalogService");
const effectivePermissions = require("./platformEffectivePermissions");
const assignmentAudit = require("./platformRbacAssignmentAudit");
const platformAdminAuthorization = require("./platformAdminAuthorization");

module.exports = {
  ...tenantScope,
  ...authzDecision,
  authorizeBlessBoard: facade.authorizeBlessBoard,
  authorizeActiveClinic: facade.authorizeActiveClinic,
  assertExpectedProduct: facade.assertExpectedProduct,

  PLATFORM_ADMINISTRATOR_ROLE_KEY:
    platformAdminAuthorization.PLATFORM_ADMINISTRATOR_ROLE_KEY,
  PLATFORM_ADMIN_PERMISSION_KEYS:
    platformAdminAuthorization.PLATFORM_ADMIN_PERMISSION_KEYS,
  PLATFORM_ADMIN_MUST_NOT_AUTO_GRANT:
    platformAdminAuthorization.PLATFORM_ADMIN_MUST_NOT_AUTO_GRANT,
  hasActivePlatformAdministratorAssignment:
    platformAdminAuthorization.hasActivePlatformAdministratorAssignment,
  authorizePlatformCataloguePermission:
    platformAdminAuthorization.authorizePlatformCataloguePermission,
  assertPlatformCataloguePermission:
    platformAdminAuthorization.assertPlatformCataloguePermission,

  // Catalogue constants
  RBAC_PRODUCT: constants.RBAC_PRODUCT,
  ROLE_CATEGORY: constants.ROLE_CATEGORY,
  ALL_ROLE_CATEGORIES: constants.ALL_ROLE_CATEGORIES,
  PRODUCT_ROLE_CATEGORIES: constants.PRODUCT_ROLE_CATEGORIES,
  PATIENT_CREATE_ALLOWED_ROLE_KEYS: constants.PATIENT_CREATE_ALLOWED_ROLE_KEYS,
  PATIENT_CREATE_PERMISSION_KEY: constants.PATIENT_CREATE_PERMISSION_KEY,
  CATALOGUE_SCHEMA: constants.CATALOGUE_SCHEMA,
  RBAC_ASSIGNMENT_EVENT: constants.RBAC_ASSIGNMENT_EVENT,

  // Catalogue repository
  findCataloguePermissionByKey: catalogRepository.findPermissionByKey,
  findCatalogueRoleByKey: catalogRepository.findRoleByKey,
  findCatalogueRoleById: catalogRepository.findRoleById,
  listCatalogueRoles: catalogRepository.listRoles,
  listCatalogueRolesByKeys: catalogRepository.listRolesByKeys,
  listPermissionKeysForRoleId: catalogRepository.listPermissionKeysForRoleId,
  listPermissionKeysForRoleIds: catalogRepository.listPermissionKeysForRoleIds,

  // Catalogue service
  LOOKUP_STATUS: catalogService.LOOKUP_STATUS,
  categoriesForProduct: catalogService.categoriesForProduct,
  roleCategoryAllowedForProduct: catalogService.roleCategoryAllowedForProduct,
  inferProductForRole: catalogService.inferProductForRole,
  lookupRole: catalogService.lookupRole,
  lookupRoles: catalogService.lookupRoles,
  lookupPermission: catalogService.lookupPermission,
  roleMayHoldPatientCreate: catalogService.roleMayHoldPatientCreate,
  assertPatientCreatePolicy: catalogService.assertPatientCreatePolicy,
  auditActiveClinicPatientCreateGrants:
    catalogService.auditActiveClinicPatientCreateGrants,

  // Effective permissions
  resolveEffectivePermissionKeys: effectivePermissions.resolveEffectivePermissionKeys,
  unionPermissionKeys: effectivePermissions.unionPermissionKeys,
  hasPermissionKey: effectivePermissions.hasPermissionKey,

  // Assignment audit primitives
  buildAssignmentAuditEvent: assignmentAudit.buildAssignmentAuditEvent,
  recordAssignmentAudit: assignmentAudit.recordAssignmentAudit,
  recordBlessBoardAssignmentAudit: assignmentAudit.recordBlessBoardAssignmentAudit,
};
