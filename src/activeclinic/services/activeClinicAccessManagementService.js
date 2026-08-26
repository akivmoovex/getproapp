"use strict";

/**
 * ActiveClinic roles & access assignment governance (AC-V6-S06).
 * Authorization subject = staff_members. Catalogue = blessboard.roles.
 */

const accessRepo = require("../repositories/staffAccessRepository");
const staffRepo = require("../repositories/staffMemberRepository");
const identityRepo = require("../../platform/repositories/platformIdentityRepository");
const {
  assignStaffRole,
  listStaffRoleAssignments,
  mapRoleAssignment,
  ORGANIZATION_ADMIN,
  NETWORK_ADMIN,
  FACILITY_ADMIN,
  CLINIC_MANAGER,
  RECEPTIONIST,
  MEDICAL_RECORDS_OFFICER,
  NURSE,
  CLINICIAN,
  PHARMACIST,
  LAB_TECHNICIAN,
  RADIOLOGY_STAFF,
  BILLING_OFFICER,
  CASHIER,
  FINANCE_SUPERVISOR,
  AUDITOR,
  STAFF_ROLE,
  ACTIVECLINIC_ROLE_CATALOGUE,
  ORGANISATION_SCOPE_ONLY_ROLES,
  FACILITY_SCOPE_ONLY_ROLES,
  isOrgWideAdminRole,
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
  LAST_ORG_ADMIN: "last_org_admin_protected",
  DEPENDENT_FACILITY_ROLES: "dependent_facility_roles",
});

/** @deprecated Prefer ACTIVECLINIC_ROLE_CATALOGUE — retained for callers. */
const FOUNDATIONAL_ROLES = ACTIVECLINIC_ROLE_CATALOGUE;

const ROLE_LABELS = Object.freeze({
  activeclinic_organization_admin: "Organization administrator",
  activeclinic_network_admin: "Network administrator (compat)",
  activeclinic_facility_admin: "Facility administrator",
  activeclinic_clinic_manager: "Clinic manager",
  activeclinic_receptionist: "Receptionist",
  activeclinic_medical_records_officer: "Medical records officer",
  activeclinic_nurse: "Nurse / Triage",
  activeclinic_clinician: "Clinician / Doctor",
  activeclinic_pharmacist: "Pharmacist",
  activeclinic_lab_technician: "Laboratory technician",
  activeclinic_radiology_staff: "Radiology staff",
  activeclinic_billing_officer: "Billing officer",
  activeclinic_cashier: "Cashier",
  activeclinic_finance_supervisor: "Finance supervisor",
  activeclinic_auditor: "Auditor",
  activeclinic_staff: "Staff",
});

const ROLE_DESCRIPTIONS = Object.freeze({
  [ORGANIZATION_ADMIN]:
    "Manages clinic settings, facilities, staff, access and audit. Does not receive clinical transaction rights automatically.",
  [NETWORK_ADMIN]:
    "Legacy compatibility role for organization-wide operations. It can view, edit, and submit website changes, but cannot publish, restore, or roll back the live website. Prefer Organization administrator for new grants.",
  [FACILITY_ADMIN]:
    "Manages staff and access within assigned facilities. No organization-wide ownership or clinical write rights.",
  [CLINIC_MANAGER]:
    "Operational oversight and reporting across departments without clinical or finance write rights.",
  [RECEPTIONIST]:
    "Manages patient registration, appointments, check-in and reception queues. Edits demographics; does not manage authoritative identifiers by default.",
  [MEDICAL_RECORDS_OFFICER]:
    "Manages patient registration, demographics, and authoritative identifiers (NRC/passport). No clinical, pharmacy, diagnostics, billing, or staff administration rights.",
  [NURSE]: "Records triage and nursing intake information.",
  [CLINICIAN]:
    "Documents consultations, diagnoses and clinical orders.",
  [PHARMACIST]:
    "Reviews prescriptions, dispenses medicines and manages pharmacy inventory.",
  [LAB_TECHNICIAN]:
    "Records laboratory specimens and results for laboratory requests (modality-scoped).",
  [RADIOLOGY_STAFF]:
    "Records radiology reports for imaging requests (modality-scoped; no specimen collection).",
  [BILLING_OFFICER]:
    "Creates invoices and charges. Cannot refund or reverse payments.",
  [CASHIER]:
    "Collects and allocates payments and operates cashier sessions.",
  [FINANCE_SUPERVISOR]:
    "Handles sensitive finance actions including refunds, reversals and reconciliation.",
  [AUDITOR]: "Read-only audit and reporting visibility. Cannot change access or clinical records.",
  [STAFF_ROLE]:
    "Minimal authenticated ActiveClinic access with facility visibility from assignments.",
});

function rolePlainLabel(roleKey, displayName) {
  if (displayName) return displayName;
  return ROLE_LABELS[roleKey] || "Staff role";
}

function isExpired(expiresAt, now = Date.now()) {
  if (!expiresAt) return false;
  return new Date(expiresAt).getTime() <= now;
}

function actorIsOrganizationAdmin(auth) {
  return (auth.roleAssignments || []).some(
    (r) =>
      isOrgWideAdminRole(r.roleKey) &&
      (!r.status || r.status === "active") &&
      !isExpired(r.expiresAt)
  );
}

/** @deprecated Prefer actorIsOrganizationAdmin */
function actorIsNetworkAdmin(auth) {
  return actorIsOrganizationAdmin(auth);
}

function actorHasAssignAccess(auth) {
  return Array.isArray(auth.permissions)
    ? auth.permissions.includes("activeclinic.staff.assign_access")
    : false;
}

function isOrgWideAdminAssignmentRow(row) {
  if (!row) return false;
  const roleKey = row.role_key || row.roleKey;
  const scopeType = row.scope_type || row.scopeType;
  return isOrgWideAdminRole(roleKey) && scopeType === "organisation";
}

/**
 * Active organization-wide admin holders (organization_admin or network_admin compat).
 */
async function countActiveOrgWideAdmins(db, organizationId) {
  const result = await db.query(
    `SELECT COUNT(DISTINCT a.staff_member_id)::int AS cnt
       FROM activeclinic.staff_role_assignments a
       JOIN blessboard.roles r ON r.id = a.role_id
       JOIN activeclinic.staff_members s ON s.id = a.staff_member_id
      WHERE a.organization_id = $1
        AND a.status = 'active'
        AND (a.expires_at IS NULL OR a.expires_at > now())
        AND a.scope_type = 'organisation'
        AND r.role_key = ANY($2::text[])
        AND s.status IN ('active', 'invited')`,
    [organizationId, [ORGANIZATION_ADMIN, NETWORK_ADMIN]]
  );
  return Number(result.rows[0] && result.rows[0].cnt) || 0;
}

async function staffHoldsActiveOrgWideAdmin(db, input) {
  const result = await db.query(
    `SELECT 1
       FROM activeclinic.staff_role_assignments a
       JOIN blessboard.roles r ON r.id = a.role_id
      WHERE a.organization_id = $1
        AND a.staff_member_id = $2
        AND a.status = 'active'
        AND (a.expires_at IS NULL OR a.expires_at > now())
        AND a.scope_type = 'organisation'
        AND r.role_key = ANY($3::text[])
      LIMIT 1`,
    [input.organizationId, input.staffMemberId, [ORGANIZATION_ADMIN, NETWORK_ADMIN]]
  );
  return result.rows.length > 0;
}

/**
 * Prevent removing the last viable organization administrator for a tenant.
 */
async function assertNotLastOrgAdminRemoval(db, input) {
  const organizationId = input.organizationId;
  const staffMemberId = String(input.staffMemberId || "").trim();
  if (!organizationId || !staffMemberId) {
    return { ok: false, code: RESULT.INVALID_INPUT };
  }
  const holds = await staffHoldsActiveOrgWideAdmin(db, {
    organizationId,
    staffMemberId,
  });
  if (!holds) return { ok: true, code: RESULT.OK };
  const count = await countActiveOrgWideAdmins(db, organizationId);
  if (count <= 1) {
    return { ok: false, code: RESULT.LAST_ORG_ADMIN };
  }
  return { ok: true, code: RESULT.OK };
}

function scopesForRole(roleKey) {
  if (ORGANISATION_SCOPE_ONLY_ROLES.includes(roleKey)) return ["organisation"];
  if (FACILITY_SCOPE_ONLY_ROLES.includes(roleKey)) return ["facility"];
  if (roleKey === STAFF_ROLE) return ["facility", "organisation"];
  return ["facility"];
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
  const orgAdmin = actorIsOrganizationAdmin(auth);

  const facilityScoped = [
    STAFF_ROLE,
    FACILITY_ADMIN,
    CLINIC_MANAGER,
    RECEPTIONIST,
    MEDICAL_RECORDS_OFFICER,
    NURSE,
    CLINICIAN,
    PHARMACIST,
    LAB_TECHNICIAN,
    RADIOLOGY_STAFF,
    BILLING_OFFICER,
    CASHIER,
    FINANCE_SUPERVISOR,
  ];

  const options = facilityScoped.map((value) => ({
    value,
    label: ROLE_LABELS[value],
    description: ROLE_DESCRIPTIONS[value],
    scopes: scopesForRole(value),
  }));

  if (orgAdmin) {
    options.unshift(
      {
        value: ORGANIZATION_ADMIN,
        label: ROLE_LABELS[ORGANIZATION_ADMIN],
        description: ROLE_DESCRIPTIONS[ORGANIZATION_ADMIN],
        scopes: scopesForRole(ORGANIZATION_ADMIN),
      },
      {
        value: NETWORK_ADMIN,
        label: ROLE_LABELS[NETWORK_ADMIN],
        description: ROLE_DESCRIPTIONS[NETWORK_ADMIN],
        scopes: scopesForRole(NETWORK_ADMIN),
      },
      {
        value: AUDITOR,
        label: ROLE_LABELS[AUDITOR],
        description: ROLE_DESCRIPTIONS[AUDITOR],
        scopes: scopesForRole(AUDITOR),
      }
    );
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
  if (!ACTIVECLINIC_ROLE_CATALOGUE.includes(roleKey)) {
    return { ok: false, code: RESULT.INVALID_ROLE };
  }

  const allowedScopes = scopesForRole(roleKey);
  if (!allowedScopes.includes(scopeType)) {
    return { ok: false, code: RESULT.INVALID_SCOPE };
  }

  const isOrgAdminGrant = isOrgWideAdminRole(roleKey) || roleKey === AUDITOR;
  if (isOrgAdminGrant && !actorIsOrganizationAdmin(auth)) {
    return { ok: false, code: RESULT.GRANT_DENIED };
  }

  // Self-escalation: cannot grant org-wide admin to yourself.
  // Revoke/demotion may set allowSelfDemotion after last-admin checks.
  if (
    isOrgWideAdminRole(roleKey) &&
    targetStaffMemberId &&
    String(auth.staffMember.id) === targetStaffMemberId &&
    !input.allowSelfDemotion
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
    if (!actorIsOrganizationAdmin(auth)) {
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

  const assigned = await assignStaffRole(db, {
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
  if (!assigned.ok) return assigned;

  // If staff already set a password while invited (activate-without-role),
  // promote to active once a valid role exists.
  if (
    staff.staffMember.status === "invited" &&
    staff.staffMember.platformIdentityId
  ) {
    const identity = await identityRepo.findIdentityById(
      db,
      staff.staffMember.platformIdentityId
    );
    if (identity && identity.password_hash) {
      await staffRepo.updateStaffMember(db, {
        id: staffMemberId,
        organizationId,
        patch: { status: "active" },
      });
    }
  }
  return assigned;
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

  if (isOrgWideAdminAssignmentRow(row)) {
    const guard = await assertNotLastOrgAdminRemoval(db, {
      organizationId,
      staffMemberId,
    });
    if (!guard.ok) return { ok: false, code: guard.code };
  }

  const grant = await canGrantRole(db, {
    auth,
    roleKey: row.role_key,
    scopeType: row.scope_type,
    facilityId: row.facility_id,
    targetStaffMemberId: staffMemberId,
    allowSelfDemotion: true,
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
  ROLE_DESCRIPTIONS,
  rolePlainLabel,
  actorIsOrganizationAdmin,
  actorIsNetworkAdmin,
  actorHasAssignAccess,
  listGrantableRoleOptions,
  canGrantRole,
  scopesForRole,
  mapAssignmentDetail,
  evaluateAssignmentEffectiveness,
  assignFoundationalStaffRole,
  updateStaffRoleAssignmentExpiry,
  replaceStaffRoleAssignment,
  revokeFoundationalStaffRole,
  listStaffRoleAssignments,
  countActiveOrgWideAdmins,
  staffHoldsActiveOrgWideAdmin,
  assertNotLastOrgAdminRemoval,
  isOrgWideAdminAssignmentRow,
  ORGANIZATION_ADMIN,
  NETWORK_ADMIN,
  FACILITY_ADMIN,
  STAFF_ROLE,
  ACTIVECLINIC_ROLE_CATALOGUE,
};
