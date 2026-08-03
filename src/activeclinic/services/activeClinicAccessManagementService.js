"use strict";

/**
 * ActiveClinic roles & access assignment governance (AC-V6-S06).
 * Authorization subject = staff_members. Catalogue = blessboard.roles.
 */

const accessRepo = require("../repositories/staffAccessRepository");
const {
  assignStaffRole,
  listStaffRoleAssignments,
  mapRoleAssignment,
  NETWORK_ADMIN,
  FACILITY_ADMIN,
  STAFF_ROLE,
  RESULT: AUTHZ_RESULT,
} = require("./activeClinicAuthorizationService");
const {
  getStaffMemberByIdAndOrganization,
} = require("./activeClinicStaffService");
const {
  listFacilitiesForStaff,
  getActiveStaffFacilityAssignment,
} = require("./activeClinicStaffFacilityService");
const {
  getFacilityByIdAndOrganization,
} = require("./facilityService");
const {
  organizationHasActiveProduct,
} = require("../../platform/services/organizationProductService");
const { recordAuditEventSafe } = require("../../platform/services/auditEventService");
const {
  CODE_ACTIVECLINIC_ORG_V6,
} = require("../../platform/config/deploymentProfiles");

const RESULT = Object.freeze({
  ...AUTHZ_RESULT,
  NOT_FOUND: "role_assignment_not_found",
  SELF_ESCALATION: "self_escalation_denied",
  GRANT_DENIED: "grant_denied",
  ACTOR_NOT_ACTIVE: "actor_not_active",
  TARGET_NOT_ACTIVE: "target_not_active",
  CROSS_ORGANIZATION: "cross_organization_denied",
  FACILITY_OUT_OF_SCOPE: "facility_out_of_scope",
  BLESSBOARD_ROLE: "blessboard_role_denied",
  RAW_PERMISSIONS: "raw_permissions_denied",
});

const FOUNDATIONAL_ROLES = Object.freeze([NETWORK_ADMIN, FACILITY_ADMIN, STAFF_ROLE]);

const ROLE_LABELS = Object.freeze({
  activeclinic_network_admin: "Network administrator",
  activeclinic_facility_admin: "Facility administrator",
  activeclinic_staff: "Staff",
});

function rolePlainLabel(roleKey, displayName) {
  if (displayName) return displayName;
  return ROLE_LABELS[roleKey] || "Staff role";
}

function isExpired(expiresAt, now = Date.now()) {
  if (!expiresAt) return false;
  return new Date(expiresAt).getTime() <= now;
}

function actorIsNetworkAdmin(auth) {
  return (auth.roleAssignments || []).some(
    (r) =>
      r.roleKey === NETWORK_ADMIN &&
      (!r.status || r.status === "active") &&
      !isExpired(r.expiresAt)
  );
}

function actorHasAssignAccess(auth) {
  return Array.isArray(auth.permissions)
    ? auth.permissions.includes("activeclinic.staff.assign_access")
    : false;
}

async function listActorFacilityIds(db, auth) {
  const listed = await listFacilitiesForStaff(db, {
    staffMemberId: auth.staffMember.id,
    organizationId: auth.organization.id,
  });
  if (!listed.ok) return new Set();
  return new Set(
    (listed.assignments || [])
      .filter((a) => a.status === "active")
      .map((a) => String(a.facilityId))
  );
}

/**
 * Roles the actor may offer in the assign UI / service.
 */
function listGrantableRoleOptions(auth) {
  if (!actorHasAssignAccess(auth)) return [];
  const options = [
    {
      value: STAFF_ROLE,
      label: ROLE_LABELS[STAFF_ROLE],
      description: "Authenticated access with facility visibility from assignments.",
      scopes: ["facility", "organisation"],
    },
    {
      value: FACILITY_ADMIN,
      label: ROLE_LABELS[FACILITY_ADMIN],
      description: "Facility-scoped administration for assigned facilities.",
      scopes: ["facility"],
    },
  ];
  if (actorIsNetworkAdmin(auth)) {
    options.unshift({
      value: NETWORK_ADMIN,
      label: ROLE_LABELS[NETWORK_ADMIN],
      description: "Organization-wide administration including facilities, staff, and access.",
      scopes: ["organisation"],
    });
  }
  return options;
}

/**
 * Whether actor may grant a specific role/scope/facility combination.
 */
async function canGrantRole(db, input) {
  const auth = input.auth;
  const roleKey = String(input.roleKey || "").trim();
  const scopeType = String(input.scopeType || "").trim();
  const facilityId = input.facilityId ? String(input.facilityId).trim() : null;
  const targetStaffMemberId = String(input.targetStaffMemberId || "").trim();

  if (!actorHasAssignAccess(auth)) {
    return { ok: false, code: RESULT.GRANT_DENIED };
  }
  if (!FOUNDATIONAL_ROLES.includes(roleKey)) {
    return { ok: false, code: RESULT.INVALID_ROLE };
  }
  if (roleKey === NETWORK_ADMIN && !actorIsNetworkAdmin(auth)) {
    return { ok: false, code: RESULT.GRANT_DENIED };
  }
  if (roleKey === NETWORK_ADMIN && scopeType !== "organisation") {
    return { ok: false, code: RESULT.INVALID_SCOPE };
  }
  if (roleKey === FACILITY_ADMIN && scopeType !== "facility") {
    return { ok: false, code: RESULT.INVALID_SCOPE };
  }
  if (scopeType !== "organisation" && scopeType !== "facility") {
    return { ok: false, code: RESULT.INVALID_SCOPE };
  }

  // Self-escalation: cannot grant network admin to yourself.
  if (
    roleKey === NETWORK_ADMIN &&
    targetStaffMemberId &&
    String(auth.staffMember.id) === targetStaffMemberId
  ) {
    return { ok: false, code: RESULT.SELF_ESCALATION };
  }

  if (scopeType === "facility") {
    if (!facilityId) return { ok: false, code: RESULT.INVALID_SCOPE };
    const facility = await getFacilityByIdAndOrganization(db, {
      id: facilityId,
      organizationId: auth.organization.id,
    });
    if (!facility.ok || facility.facility.status === "archived") {
      return { ok: false, code: RESULT.FACILITY_OUT_OF_SCOPE };
    }
    if (!actorIsNetworkAdmin(auth)) {
      const allowed = await listActorFacilityIds(db, auth);
      if (!allowed.has(facilityId)) {
        return { ok: false, code: RESULT.FACILITY_OUT_OF_SCOPE };
      }
    }
  }

  return { ok: true, code: RESULT.OK };
}

function mapAssignmentDetail(row) {
  if (!row) return null;
  const base = mapRoleAssignment(row);
  const expired =
    base.status === "expired" ||
    (base.status === "active" && isExpired(base.expiresAt));
  return {
    ...base,
    roleCategory: row.role_category || null,
    facilityKey: row.facility_key || null,
    facilityDisplayName: row.facility_display_name || null,
    facilityStatus: row.facility_status || null,
    revokedAt: row.revoked_at || null,
    revocationReason: row.revocation_reason || null,
    assignmentOrigin: row.assignment_origin || null,
    isExpired: expired,
    isRevoked: base.status === "revoked",
    isActiveRecord: base.status === "active" && !expired,
    roleLabel: rolePlainLabel(base.roleKey, base.roleDisplayName),
    scopeLabel:
      base.scopeType === "facility"
        ? row.facility_display_name
          ? `Facility · ${row.facility_display_name}`
          : "Facility scope"
        : "Organization-wide",
  };
}

/**
 * Effective access considers staff status, assignment status, expiry,
 * facility assignment (for facility scope), and product enrolment.
 */
async function evaluateAssignmentEffectiveness(db, input) {
  const assignment = input.assignment;
  const staff = input.staffMember;
  const reasons = [];

  if (!assignment) {
    return { effective: false, reasons: ["missing_assignment"] };
  }
  if (assignment.status === "revoked" || assignment.isRevoked) {
    reasons.push("revoked");
  }
  if (assignment.isExpired || isExpired(assignment.expiresAt)) {
    reasons.push("expired");
  }
  if (assignment.status !== "active") {
    if (!reasons.includes(assignment.status)) reasons.push(String(assignment.status));
  }
  if (!staff || !["active", "invited"].includes(staff.status)) {
    if (staff && staff.status === "suspended") reasons.push("staff_suspended");
    else if (staff && staff.status === "inactive") reasons.push("staff_inactive");
    else if (staff && staff.status === "archived") reasons.push("staff_archived");
    else if (!staff) reasons.push("staff_missing");
  }

  const productOk = await organizationHasActiveProduct(db, {
    organizationId: input.organizationId,
    applicationCode: "activeclinic",
  });
  if (!productOk) reasons.push("product_enrolment_inactive");

  if (assignment.scopeType === "facility" && assignment.facilityId) {
    const facAssign = await getActiveStaffFacilityAssignment(db, {
      staffMemberId: staff.id,
      facilityId: assignment.facilityId,
      organizationId: input.organizationId,
    });
    if (!facAssign.ok) reasons.push("facility_assignment_inactive");
    if (
      assignment.facilityStatus &&
      ["archived", "inactive"].includes(assignment.facilityStatus)
    ) {
      reasons.push("facility_not_operational");
    }
  }

  return { effective: reasons.length === 0, reasons };
}

async function assignFoundationalStaffRole(db, input) {
  const auth = input.auth;
  const organizationId = auth.organization.id;
  const staffMemberId = String(input.staffMemberId || "").trim();
  const roleKey = String(input.roleKey || "").trim();
  const scopeType = String(input.scopeType || "").trim();
  const facilityId = input.facilityId ? String(input.facilityId).trim() : null;
  const deploymentCode = input.deploymentCode || CODE_ACTIVECLINIC_ORG_V6;

  if (input.permissionKeys || input.permissions) {
    return { ok: false, code: RESULT.RAW_PERMISSIONS, assignment: null };
  }
  if (input.organizationId && String(input.organizationId) !== organizationId) {
    return { ok: false, code: RESULT.CROSS_ORGANIZATION, assignment: null };
  }
  if (!staffMemberId || !roleKey || !scopeType) {
    return { ok: false, code: RESULT.INVALID_INPUT, assignment: null };
  }

  if (!auth.staffMember || auth.staffMember.status !== "active") {
    return { ok: false, code: RESULT.ACTOR_NOT_ACTIVE, assignment: null };
  }

  const grant = await canGrantRole(db, {
    auth,
    roleKey,
    scopeType,
    facilityId,
    targetStaffMemberId: staffMemberId,
  });
  if (!grant.ok) return { ok: false, code: grant.code, assignment: null };

  const staff = await getStaffMemberByIdAndOrganization(db, {
    id: staffMemberId,
    organizationId,
  });
  if (!staff.ok) {
    return { ok: false, code: RESULT.STAFF_NOT_FOUND, assignment: null };
  }
  if (!["active", "invited"].includes(staff.staffMember.status)) {
    return { ok: false, code: RESULT.TARGET_NOT_ACTIVE, assignment: null };
  }

  if (scopeType === "facility") {
    const facAssign = await getActiveStaffFacilityAssignment(db, {
      staffMemberId,
      facilityId,
      organizationId,
    });
    if (!facAssign.ok) {
      return { ok: false, code: RESULT.FACILITY_ASSIGNMENT_REQUIRED, assignment: null };
    }
  }

  return assignStaffRole(db, {
    organizationId,
    staffMemberId,
    roleKey,
    scopeType,
    facilityId,
    expiresAt: input.expiresAt || null,
    assignedByPlatformIdentityId: auth.platformIdentity && auth.platformIdentity.id,
    deploymentCode,
    assignmentOrigin: "manual",
  });
}

async function updateStaffRoleAssignmentExpiry(db, input) {
  const auth = input.auth;
  const organizationId = auth.organization.id;
  const assignmentId = String(input.assignmentId || "").trim();
  const staffMemberId = String(input.staffMemberId || "").trim();
  const deploymentCode = input.deploymentCode || CODE_ACTIVECLINIC_ORG_V6;

  if (!actorHasAssignAccess(auth) || auth.staffMember.status !== "active") {
    return { ok: false, code: RESULT.GRANT_DENIED };
  }
  if (!assignmentId || !staffMemberId) {
    return { ok: false, code: RESULT.INVALID_INPUT };
  }

  const row = await accessRepo.findRoleAssignmentById(db, {
    id: assignmentId,
    organizationId,
  });
  if (!row || String(row.staff_member_id) !== staffMemberId) {
    return { ok: false, code: RESULT.NOT_FOUND };
  }
  if (row.status !== "active" || isExpired(row.expires_at)) {
    return { ok: false, code: RESULT.INVALID_INPUT };
  }

  const grant = await canGrantRole(db, {
    auth,
    roleKey: row.role_key,
    scopeType: row.scope_type,
    facilityId: row.facility_id,
    targetStaffMemberId: staffMemberId,
  });
  if (!grant.ok) return { ok: false, code: grant.code };

  const updated = await accessRepo.updateRoleAssignmentExpiry(db, {
    id: assignmentId,
    organizationId,
    expiresAt: input.expiresAt || null,
  });
  if (!updated) return { ok: false, code: RESULT.NOT_FOUND };

  await recordAuditEventSafe(db, {
    deploymentCode,
    organizationId,
    actorUserId: null,
    actionKey: "activeclinic.staff.role_expiry_updated",
    entityType: "staff_role_assignment",
    entityId: assignmentId,
    outcome: "success",
    metadataJson: {
      actor_kind: "staff",
      changed_fields: ["expires_at"],
    },
  });

  return {
    ok: true,
    code: RESULT.OK,
    assignment: mapAssignmentDetail({ ...row, ...updated }),
  };
}

/**
 * Role/scope changes revoke the old assignment and create a replacement.
 */
async function replaceStaffRoleAssignment(db, input) {
  const revoked = await revokeFoundationalStaffRole(db, {
    auth: input.auth,
    staffMemberId: input.staffMemberId,
    assignmentId: input.assignmentId,
    reason: input.reason || "replaced_by_edit",
    deploymentCode: input.deploymentCode,
  });
  if (!revoked.ok) return revoked;

  const created = await assignFoundationalStaffRole(db, {
    auth: input.auth,
    staffMemberId: input.staffMemberId,
    roleKey: input.roleKey,
    scopeType: input.scopeType,
    facilityId: input.facilityId,
    expiresAt: input.expiresAt,
    deploymentCode: input.deploymentCode,
  });
  if (!created.ok) {
    return {
      ok: false,
      code: created.code,
      assignment: null,
      priorRevoked: true,
    };
  }
  return { ok: true, code: RESULT.OK, assignment: created.assignment, replaced: true };
}

async function revokeFoundationalStaffRole(db, input) {
  const auth = input.auth;
  const organizationId = auth.organization.id;
  const assignmentId = String(input.assignmentId || "").trim();
  const staffMemberId = String(input.staffMemberId || "").trim();
  const deploymentCode = input.deploymentCode || CODE_ACTIVECLINIC_ORG_V6;

  if (!actorHasAssignAccess(auth) || auth.staffMember.status !== "active") {
    return { ok: false, code: RESULT.GRANT_DENIED };
  }
  if (!assignmentId || !staffMemberId) {
    return { ok: false, code: RESULT.INVALID_INPUT };
  }

  const row = await accessRepo.findRoleAssignmentById(db, {
    id: assignmentId,
    organizationId,
  });
  if (!row || String(row.staff_member_id) !== staffMemberId) {
    return { ok: false, code: RESULT.NOT_FOUND };
  }
  if (row.status !== "active") {
    return { ok: false, code: RESULT.INVALID_INPUT };
  }

  const grant = await canGrantRole(db, {
    auth,
    roleKey: row.role_key,
    scopeType: row.scope_type,
    facilityId: row.facility_id,
    targetStaffMemberId: staffMemberId,
  });
  if (!grant.ok) return { ok: false, code: grant.code };

  const revoked = await accessRepo.revokeRoleAssignment(db, {
    id: assignmentId,
    organizationId,
    revokedByPlatformIdentityId: auth.platformIdentity && auth.platformIdentity.id,
    revocationReason: input.reason || "admin_revoke",
  });
  if (!revoked) return { ok: false, code: RESULT.NOT_FOUND };

  await recordAuditEventSafe(db, {
    deploymentCode,
    organizationId,
    actorUserId: null,
    actionKey: "activeclinic.staff.role_revoked",
    entityType: "staff_role_assignment",
    entityId: assignmentId,
    outcome: "success",
    metadataJson: {
      actor_kind: "staff",
      role_key: row.role_key,
      scope_type: row.scope_type,
    },
  });

  return {
    ok: true,
    code: RESULT.OK,
    assignment: mapAssignmentDetail({ ...row, ...revoked }),
  };
}

module.exports = {
  RESULT,
  FOUNDATIONAL_ROLES,
  ROLE_LABELS,
  rolePlainLabel,
  actorIsNetworkAdmin,
  actorHasAssignAccess,
  listGrantableRoleOptions,
  canGrantRole,
  mapAssignmentDetail,
  evaluateAssignmentEffectiveness,
  assignFoundationalStaffRole,
  updateStaffRoleAssignmentExpiry,
  replaceStaffRoleAssignment,
  revokeFoundationalStaffRole,
  listStaffRoleAssignments,
  NETWORK_ADMIN,
  FACILITY_ADMIN,
  STAFF_ROLE,
};
