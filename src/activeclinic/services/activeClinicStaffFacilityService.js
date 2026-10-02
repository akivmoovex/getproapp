"use strict";

/**
 * Staff ↔ facility assignment operations.
 */

const accessRepo = require("../repositories/staffAccessRepository");
const {
  getStaffMemberByIdAndOrganization,
  RESULT: STAFF_RESULT,
} = require("./activeClinicStaffService");
const {
  getFacilityByIdAndOrganization,
  RESULT: FAC_RESULT,
} = require("./facilityService");
const { recordAuditEventSafe } = require("../../platform/services/auditEventService");
const {
  CODE_ACTIVECLINIC_ORG_V6,
} = require("../../platform/config/deploymentProfiles");

const RESULT = Object.freeze({
  OK: "ok",
  INVALID_INPUT: "invalid_input",
  STAFF_NOT_FOUND: "staff_not_found",
  FACILITY_NOT_FOUND: "facility_not_found",
  OWNERSHIP_MISMATCH: "ownership_mismatch",
  DUPLICATE: "facility_assignment_exists",
  PRIMARY_CONFLICT: "primary_facility_conflict",
  NOT_FOUND: "facility_assignment_not_found",
  NOT_ACTIVE: "facility_assignment_not_active",
  DEPENDENT_FACILITY_ROLES: "dependent_facility_roles",
});

function mapAssignment(row) {
  if (!row) return null;
  return {
    id: row.id,
    organizationId: row.organization_id,
    healthcareOrganizationId: row.healthcare_organization_id,
    staffMemberId: row.staff_member_id,
    facilityId: row.facility_id,
    status: row.status,
    isPrimary: row.is_primary === true,
    startsAt: row.starts_at || null,
    endsAt: row.ends_at || null,
    facilityKey: row.facility_key || null,
    facilityDisplayName: row.facility_display_name || null,
    facilityStatus: row.facility_status || null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

async function assignStaffToFacility(db, input) {
  const staff = await getStaffMemberByIdAndOrganization(db, {
    id: input.staffMemberId,
    organizationId: input.organizationId,
  });
  if (!staff.ok) {
    return { ok: false, code: RESULT.STAFF_NOT_FOUND, assignment: null };
  }
  const facility = await getFacilityByIdAndOrganization(db, {
    id: input.facilityId,
    organizationId: input.organizationId,
  });
  if (!facility.ok) {
    return { ok: false, code: RESULT.FACILITY_NOT_FOUND, assignment: null };
  }
  if (
    facility.facility.healthcareOrganizationId !==
    staff.staffMember.healthcareOrganizationId
  ) {
    return { ok: false, code: RESULT.OWNERSHIP_MISMATCH, assignment: null };
  }
  if (facility.facility.status === "archived") {
    return { ok: false, code: RESULT.FACILITY_NOT_FOUND, assignment: null };
  }

  try {
    const row = await accessRepo.insertFacilityAssignment(db, {
      organizationId: input.organizationId,
      healthcareOrganizationId: staff.staffMember.healthcareOrganizationId,
      staffMemberId: input.staffMemberId,
      facilityId: input.facilityId,
      status: input.status || "active",
      isPrimary: input.isPrimary === true,
      startsAt: input.startsAt || null,
      endsAt: input.endsAt || null,
    });
    await recordAuditEventSafe(db, {
      deploymentCode: input.deploymentCode || CODE_ACTIVECLINIC_ORG_V6,
      organizationId: input.organizationId,
      actorUserId: null,
      actionKey: "activeclinic.staff.facility_assign",
      entityType: "staff_facility_assignment",
      entityId: row.id,
      outcome: "success",
      metadataJson: { actor_kind: "system" },
    });
    return { ok: true, code: RESULT.OK, assignment: mapAssignment(row) };
  } catch (err) {
    const msg = err && err.message ? String(err.message) : "";
    if (/staff_facility_assignments_active_uidx/i.test(msg)) {
      return { ok: false, code: RESULT.DUPLICATE, assignment: null };
    }
    if (/staff_facility_assignments_one_primary_uidx/i.test(msg)) {
      return { ok: false, code: RESULT.PRIMARY_CONFLICT, assignment: null };
    }
    if (/ownership|healthcare organization/i.test(msg)) {
      return { ok: false, code: RESULT.OWNERSHIP_MISMATCH, assignment: null };
    }
    throw err;
  }
}

async function listFacilitiesForStaff(db, input) {
  const staff = await getStaffMemberByIdAndOrganization(db, {
    id: input.staffMemberId,
    organizationId: input.organizationId,
  });
  if (!staff.ok) {
    return { ok: false, code: RESULT.STAFF_NOT_FOUND, assignments: [] };
  }
  const rows = await accessRepo.listFacilitiesForStaff(db, {
    staffMemberId: input.staffMemberId,
    organizationId: input.organizationId,
  });
  return { ok: true, code: RESULT.OK, assignments: rows.map(mapAssignment) };
}

async function getActiveStaffFacilityAssignment(db, input) {
  const row = await accessRepo.findActiveAssignment(db, {
    staffMemberId: input.staffMemberId,
    facilityId: input.facilityId,
    organizationId: input.organizationId,
  });
  if (!row) return { ok: false, code: RESULT.NOT_ACTIVE, assignment: null };
  return { ok: true, code: RESULT.OK, assignment: mapAssignment(row) };
}

async function removeStaffFromFacility(db, input) {
  const listed = await listFacilitiesForStaff(db, input);
  if (!listed.ok) return { ok: false, code: listed.code, assignment: null };
  const match = listed.assignments.find(
    (a) => a.facilityId === input.facilityId && a.status === "active"
  );
  if (!match) return { ok: false, code: RESULT.NOT_FOUND, assignment: null };

  // Require dependent facility-scoped roles to be revoked first.
  const dependent = await db.query(
    `SELECT a.id, r.role_key, r.display_name
       FROM activeclinic.staff_role_assignments a
       JOIN blessboard.roles r ON r.id = a.role_id
      WHERE a.organization_id = $1
        AND a.staff_member_id = $2
        AND a.facility_id = $3
        AND a.scope_type = 'facility'
        AND a.status = 'active'
        AND (a.expires_at IS NULL OR a.expires_at > now())
      ORDER BY r.role_key ASC`,
    [input.organizationId, input.staffMemberId, input.facilityId]
  );
  if (dependent.rows.length) {
    return {
      ok: false,
      code: RESULT.DEPENDENT_FACILITY_ROLES,
      assignment: null,
      dependentRoles: dependent.rows.map((r) => ({
        id: r.id,
        roleKey: r.role_key,
        roleLabel: r.display_name || r.role_key,
      })),
    };
  }

  const row = await accessRepo.archiveFacilityAssignment(db, {
    id: match.id,
    organizationId: input.organizationId,
  });
  await recordAuditEventSafe(db, {
    deploymentCode: input.deploymentCode || CODE_ACTIVECLINIC_ORG_V6,
    organizationId: input.organizationId,
    actorUserId: null,
    actionKey: "activeclinic.staff.facility_unassign",
    entityType: "staff_facility_assignment",
    entityId: match.id,
    outcome: "success",
    metadataJson: { actor_kind: "system" },
  });
  return { ok: true, code: RESULT.OK, assignment: mapAssignment(row) };
}

async function setPrimaryFacilityForStaff(db, input) {
  const listed = await listFacilitiesForStaff(db, input);
  if (!listed.ok) return { ok: false, code: listed.code, assignment: null };
  const match = listed.assignments.find(
    (a) => a.facilityId === input.facilityId && a.status === "active"
  );
  if (!match) return { ok: false, code: RESULT.NOT_FOUND, assignment: null };
  const row = await accessRepo.setPrimaryFacilityAssignment(db, {
    id: match.id,
    staffMemberId: input.staffMemberId,
    organizationId: input.organizationId,
  });
  await recordAuditEventSafe(db, {
    deploymentCode: input.deploymentCode || CODE_ACTIVECLINIC_ORG_V6,
    organizationId: input.organizationId,
    actorUserId: null,
    actionKey: "activeclinic.staff.primary_facility_change",
    entityType: "staff_facility_assignment",
    entityId: match.id,
    outcome: "success",
    metadataJson: { actor_kind: "system" },
  });
  return { ok: true, code: RESULT.OK, assignment: mapAssignment(row) };
}

module.exports = {
  RESULT,
  mapAssignment,
  assignStaffToFacility,
  listFacilitiesForStaff,
  getActiveStaffFacilityAssignment,
  removeStaffFromFacility,
  setPrimaryFacilityForStaff,
  STAFF_RESULT,
  FAC_RESULT,
};
