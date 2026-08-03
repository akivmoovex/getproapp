"use strict";

/**
 * Persistence for staff facility and role assignments.
 */

async function insertFacilityAssignment(db, row) {
  const result = await db.query(
    `INSERT INTO activeclinic.staff_facility_assignments (
       organization_id, healthcare_organization_id, staff_member_id,
       facility_id, status, is_primary, starts_at, ends_at
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
     RETURNING *`,
    [
      row.organizationId,
      row.healthcareOrganizationId,
      row.staffMemberId,
      row.facilityId,
      row.status || "active",
      row.isPrimary === true,
      row.startsAt || null,
      row.endsAt || null,
    ]
  );
  return result.rows[0];
}

async function listFacilitiesForStaff(db, input) {
  const result = await db.query(
    `SELECT a.*, f.facility_key, f.display_name AS facility_display_name,
            f.status AS facility_status
       FROM activeclinic.staff_facility_assignments a
       JOIN activeclinic.facilities f
         ON f.id = a.facility_id AND f.organization_id = a.organization_id
      WHERE a.staff_member_id = $1
        AND a.organization_id = $2
      ORDER BY a.is_primary DESC, f.facility_key ASC`,
    [input.staffMemberId, input.organizationId]
  );
  return result.rows;
}

async function findActiveAssignment(db, input) {
  const result = await db.query(
    `SELECT * FROM activeclinic.staff_facility_assignments
      WHERE staff_member_id = $1
        AND facility_id = $2
        AND organization_id = $3
        AND status = 'active'
        AND (starts_at IS NULL OR starts_at <= now())
        AND (ends_at IS NULL OR ends_at > now())
      LIMIT 1`,
    [input.staffMemberId, input.facilityId, input.organizationId]
  );
  return result.rows[0] || null;
}

async function archiveFacilityAssignment(db, input) {
  const result = await db.query(
    `UPDATE activeclinic.staff_facility_assignments
        SET status = 'archived',
            is_primary = false,
            updated_at = now()
      WHERE id = $1 AND organization_id = $2
      RETURNING *`,
    [input.id, input.organizationId]
  );
  return result.rows[0] || null;
}

async function setPrimaryFacilityAssignment(db, input) {
  await db.query(
    `UPDATE activeclinic.staff_facility_assignments
        SET is_primary = false, updated_at = now()
      WHERE staff_member_id = $1
        AND organization_id = $2
        AND is_primary = true
        AND status = 'active'
        AND id IS DISTINCT FROM $3`,
    [input.staffMemberId, input.organizationId, input.id]
  );
  const result = await db.query(
    `UPDATE activeclinic.staff_facility_assignments
        SET is_primary = true,
            status = 'active',
            updated_at = now()
      WHERE id = $1 AND organization_id = $2
      RETURNING *`,
    [input.id, input.organizationId]
  );
  return result.rows[0] || null;
}

async function findRoleByKey(db, roleKey) {
  const result = await db.query(
    `SELECT * FROM blessboard.roles
      WHERE role_key = $1 AND is_active = true
      LIMIT 1`,
    [roleKey]
  );
  return result.rows[0] || null;
}

async function insertRoleAssignment(db, row) {
  const result = await db.query(
    `INSERT INTO activeclinic.staff_role_assignments (
       organization_id, healthcare_organization_id, staff_member_id,
       role_id, scope_type, scope_id, facility_id, status,
       assignment_origin, assignment_reason, expires_at,
       assigned_by_platform_identity_id
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
     RETURNING *`,
    [
      row.organizationId,
      row.healthcareOrganizationId,
      row.staffMemberId,
      row.roleId,
      row.scopeType,
      row.scopeId,
      row.facilityId,
      row.status || "active",
      row.assignmentOrigin || "manual",
      row.assignmentReason || null,
      row.expiresAt || null,
      row.assignedByPlatformIdentityId || null,
    ]
  );
  return result.rows[0];
}

async function listActiveRoleAssignments(db, input) {
  const result = await db.query(
    `SELECT a.*, r.role_key, r.display_name AS role_display_name
       FROM activeclinic.staff_role_assignments a
       JOIN blessboard.roles r ON r.id = a.role_id
      WHERE a.staff_member_id = $1
        AND a.organization_id = $2
        AND a.status = 'active'
        AND (a.expires_at IS NULL OR a.expires_at > now())
      ORDER BY r.role_key ASC`,
    [input.staffMemberId, input.organizationId]
  );
  return result.rows;
}

async function revokeRoleAssignment(db, input) {
  const result = await db.query(
    `UPDATE activeclinic.staff_role_assignments
        SET status = 'revoked',
            revoked_at = now(),
            revoked_by_platform_identity_id = $3,
            revocation_reason = $4,
            updated_at = now()
      WHERE id = $1 AND organization_id = $2 AND status = 'active'
      RETURNING *`,
    [
      input.id,
      input.organizationId,
      input.revokedByPlatformIdentityId || null,
      input.revocationReason || null,
    ]
  );
  return result.rows[0] || null;
}

async function listPermissionKeysForStaff(db, input) {
  const facilityId = input.facilityId || null;
  const result = await db.query(
    `SELECT DISTINCT p.permission_key
       FROM activeclinic.staff_role_assignments a
       JOIN blessboard.role_permissions rp ON rp.role_id = a.role_id
       JOIN blessboard.permissions p ON p.id = rp.permission_id
      WHERE a.staff_member_id = $1
        AND a.organization_id = $2
        AND a.status = 'active'
        AND (a.expires_at IS NULL OR a.expires_at > now())
        AND p.is_active = true
        AND (
          $3::uuid IS NULL
          OR a.scope_type = 'organisation'
          OR (
            a.scope_type = 'facility'
            AND a.facility_id = $3
          )
        )
      ORDER BY p.permission_key ASC`,
    [input.staffMemberId, input.organizationId, facilityId]
  );
  return result.rows.map((r) => r.permission_key);
}

module.exports = {
  insertFacilityAssignment,
  listFacilitiesForStaff,
  findActiveAssignment,
  archiveFacilityAssignment,
  setPrimaryFacilityAssignment,
  findRoleByKey,
  insertRoleAssignment,
  listActiveRoleAssignments,
  revokeRoleAssignment,
  listPermissionKeysForStaff,
};
