"use strict";

/**
 * ActiveClinic RBAC: assign roles to staff and resolve effective permissions.
 * Authorization subject = staff_members (not platform identity alone).
 */

const accessRepo = require("../repositories/staffAccessRepository");
const {
  requireActiveStaffMember,
  getStaffMemberByIdAndOrganization,
  RESULT: STAFF_RESULT,
} = require("./activeClinicStaffService");
const {
  getActiveStaffFacilityAssignment,
} = require("./activeClinicStaffFacilityService");
const {
  organizationHasActiveProduct,
} = require("../../platform/services/organizationProductService");
const { recordAuditEventSafe } = require("../../platform/services/auditEventService");
const {
  CODE_ACTIVECLINIC_ORG_V6,
} = require("../../platform/config/deploymentProfiles");

const RESULT = Object.freeze({
  OK: "ok",
  INVALID_INPUT: "invalid_input",
  INVALID_ROLE: "invalid_role",
  INVALID_SCOPE: "invalid_scope",
  STAFF_NOT_FOUND: "staff_not_found",
  STAFF_NOT_ACTIVE: "staff_not_active",
  PRODUCT_NOT_ENABLED: "activeclinic_product_not_enabled",
  FACILITY_ASSIGNMENT_REQUIRED: "facility_assignment_required",
  DENIED: "access_denied",
  DUPLICATE: "role_assignment_exists",
});

const NETWORK_ADMIN = "activeclinic_network_admin";
const FACILITY_ADMIN = "activeclinic_facility_admin";
const STAFF_ROLE = "activeclinic_staff";

function mapRoleAssignment(row) {
  if (!row) return null;
  return {
    id: row.id,
    organizationId: row.organization_id,
    healthcareOrganizationId: row.healthcare_organization_id,
    staffMemberId: row.staff_member_id,
    roleId: row.role_id,
    roleKey: row.role_key || null,
    roleDisplayName: row.role_display_name || null,
    scopeType: row.scope_type,
    scopeId: row.scope_id || null,
    facilityId: row.facility_id || null,
    status: row.status,
    expiresAt: row.expires_at || null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/**
 * @param {{ query: Function }} db
 * @param {{
 *   organizationId: string,
 *   staffMemberId: string,
 *   roleKey: string,
 *   scopeType: 'organisation'|'facility',
 *   facilityId?: string|null,
 *   expiresAt?: string|Date|null,
 *   assignedByPlatformIdentityId?: string|null,
 *   deploymentCode?: string|null,
 * }} input
 */
async function assignStaffRole(db, input) {
  const staff = await getStaffMemberByIdAndOrganization(db, {
    id: input.staffMemberId,
    organizationId: input.organizationId,
  });
  if (!staff.ok) {
    return { ok: false, code: RESULT.STAFF_NOT_FOUND, assignment: null };
  }

  const role = await accessRepo.findRoleByKey(db, input.roleKey);
  if (!role || role.role_category !== "activeclinic") {
    return { ok: false, code: RESULT.INVALID_ROLE, assignment: null };
  }

  const scopeType = String(input.scopeType || "").trim();
  if (scopeType !== "organisation" && scopeType !== "facility") {
    return { ok: false, code: RESULT.INVALID_SCOPE, assignment: null };
  }

  let facilityId = null;
  let scopeId = null;
  if (scopeType === "facility") {
    facilityId = String(input.facilityId || "").trim();
    if (!facilityId) {
      return { ok: false, code: RESULT.INVALID_SCOPE, assignment: null };
    }
    scopeId = facilityId;
    if (role.role_key === NETWORK_ADMIN) {
      return { ok: false, code: RESULT.INVALID_SCOPE, assignment: null };
    }
  } else {
    scopeId = input.organizationId;
    if (role.role_key === FACILITY_ADMIN) {
      return { ok: false, code: RESULT.INVALID_SCOPE, assignment: null };
    }
  }

  try {
    const row = await accessRepo.insertRoleAssignment(db, {
      organizationId: input.organizationId,
      healthcareOrganizationId: staff.staffMember.healthcareOrganizationId,
      staffMemberId: input.staffMemberId,
      roleId: role.id,
      scopeType,
      scopeId,
      facilityId,
      expiresAt: input.expiresAt || null,
      assignedByPlatformIdentityId: input.assignedByPlatformIdentityId || null,
      assignmentOrigin: input.assignmentOrigin || "manual",
    });
    await recordAuditEventSafe(db, {
      deploymentCode: input.deploymentCode || CODE_ACTIVECLINIC_ORG_V6,
      organizationId: input.organizationId,
      actorUserId: null,
      actionKey: "activeclinic.staff.role_assign",
      entityType: "staff_role_assignment",
      entityId: row.id,
      outcome: "success",
      metadataJson: {
        role_key: role.role_key,
        scope_type: scopeType,
        actor_kind: "system",
      },
    });
    return {
      ok: true,
      code: RESULT.OK,
      assignment: mapRoleAssignment({ ...row, role_key: role.role_key }),
    };
  } catch (err) {
    const msg = err && err.message ? String(err.message) : "";
    if (/staff_role_assignments_active_scope_uidx/i.test(msg)) {
      return { ok: false, code: RESULT.DUPLICATE, assignment: null };
    }
    throw err;
  }
}

async function listStaffRoleAssignments(db, input) {
  const rows = await accessRepo.listActiveRoleAssignments(db, {
    staffMemberId: input.staffMemberId,
    organizationId: input.organizationId,
  });
  return { ok: true, code: RESULT.OK, assignments: rows.map(mapRoleAssignment) };
}

/**
 * Resolve effective permission keys for an active staff member.
 * Facility-scoped permissions require facilityId + active facility assignment
 * (except organisation-scoped roles which apply network-wide).
 */
async function resolveEffectivePermissions(db, input) {
  const active = await requireActiveStaffMember(db, {
    organizationId: input.organizationId,
    staffMemberId: input.staffMemberId,
    platformIdentityId: input.platformIdentityId,
  });
  if (!active.ok) {
    return {
      ok: false,
      code:
        active.code === STAFF_RESULT.NOT_ACTIVE
          ? RESULT.STAFF_NOT_ACTIVE
          : active.code === STAFF_RESULT.PRODUCT_NOT_ENABLED
            ? RESULT.PRODUCT_NOT_ENABLED
            : RESULT.DENIED,
      permissions: [],
      staffMember: active.staffMember || null,
    };
  }

  const facilityId = input.facilityId || null;
  if (facilityId) {
    const roles = await accessRepo.listActiveRoleAssignments(db, {
      staffMemberId: active.staffMember.id,
      organizationId: input.organizationId,
    });
    const needsFacilityAssignment = roles.some(
      (r) => r.scope_type === "facility" && r.facility_id === facilityId
    );
    const hasOrgWide = roles.some((r) => r.scope_type === "organisation");
    if (needsFacilityAssignment || (!hasOrgWide && roles.length)) {
      const assignment = await getActiveStaffFacilityAssignment(db, {
        staffMemberId: active.staffMember.id,
        facilityId,
        organizationId: input.organizationId,
      });
      if (!assignment.ok && needsFacilityAssignment) {
        return {
          ok: false,
          code: RESULT.FACILITY_ASSIGNMENT_REQUIRED,
          permissions: [],
          staffMember: active.staffMember,
        };
      }
      // Facility admin without org-wide role still needs facility assignment.
      if (!hasOrgWide) {
        if (!assignment.ok) {
          return {
            ok: false,
            code: RESULT.FACILITY_ASSIGNMENT_REQUIRED,
            permissions: [],
            staffMember: active.staffMember,
          };
        }
      }
    }
  }

  const permissions = await accessRepo.listPermissionKeysForStaff(db, {
    staffMemberId: active.staffMember.id,
    organizationId: input.organizationId,
    facilityId,
  });

  // When facilityId is provided, also include organisation-scoped permissions.
  let merged = permissions;
  if (facilityId) {
    const orgPerms = await accessRepo.listPermissionKeysForStaff(db, {
      staffMemberId: active.staffMember.id,
      organizationId: input.organizationId,
      facilityId: null,
    });
    merged = Array.from(new Set([...orgPerms, ...permissions])).sort();
  }

  return {
    ok: true,
    code: RESULT.OK,
    permissions: merged,
    staffMember: active.staffMember,
  };
}

/**
 * @param {{ query: Function }} db
 * @param {{
 *   organizationId: string,
 *   staffMemberId?: string,
 *   platformIdentityId?: string,
 *   permissionKey: string,
 *   facilityId?: string|null,
 * }} input
 */
async function authorizeStaffPermission(db, input) {
  const enabled = await organizationHasActiveProduct(db, {
    organizationId: input.organizationId,
    applicationCode: "activeclinic",
  });
  if (!enabled) {
    return { ok: false, code: RESULT.PRODUCT_NOT_ENABLED, allowed: false };
  }

  const resolved = await resolveEffectivePermissions(db, input);
  if (!resolved.ok) {
    return { ok: false, code: resolved.code, allowed: false };
  }
  const allowed = resolved.permissions.includes(String(input.permissionKey));
  return {
    ok: allowed,
    code: allowed ? RESULT.OK : RESULT.DENIED,
    allowed,
    permissions: resolved.permissions,
    staffMember: resolved.staffMember,
  };
}

module.exports = {
  RESULT,
  NETWORK_ADMIN,
  FACILITY_ADMIN,
  STAFF_ROLE,
  mapRoleAssignment,
  assignStaffRole,
  listStaffRoleAssignments,
  resolveEffectivePermissions,
  authorizeStaffPermission,
};
