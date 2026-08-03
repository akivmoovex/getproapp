"use strict";

/**
 * Persistence for activeclinic.staff_members.
 */

async function insertStaffMember(db, row) {
  const result = await db.query(
    `INSERT INTO activeclinic.staff_members (
       organization_id, healthcare_organization_id, platform_identity_id,
       staff_number, first_name, last_name, preferred_name, display_name,
       phone_normalized, phone_display, email_normalized, email_display,
       job_title, employment_type, status, start_date, end_date
     ) VALUES (
       $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17
     )
     RETURNING *`,
    [
      row.organizationId,
      row.healthcareOrganizationId,
      row.platformIdentityId,
      row.staffNumber,
      row.firstName,
      row.lastName,
      row.preferredName,
      row.displayName,
      row.phoneNormalized,
      row.phoneDisplay,
      row.emailNormalized,
      row.emailDisplay,
      row.jobTitle,
      row.employmentType,
      row.status,
      row.startDate,
      row.endDate,
    ]
  );
  return result.rows[0];
}

async function findByIdAndOrganization(db, input) {
  const result = await db.query(
    `SELECT * FROM activeclinic.staff_members
      WHERE id = $1 AND organization_id = $2
      LIMIT 1`,
    [input.id, input.organizationId]
  );
  return result.rows[0] || null;
}

async function findByIdentityAndOrganization(db, input) {
  const result = await db.query(
    `SELECT * FROM activeclinic.staff_members
      WHERE platform_identity_id = $1
        AND organization_id = $2
        AND status <> 'archived'
      LIMIT 1`,
    [input.platformIdentityId, input.organizationId]
  );
  return result.rows[0] || null;
}

async function findByOrganizationAndStaffNumber(db, input) {
  const result = await db.query(
    `SELECT * FROM activeclinic.staff_members
      WHERE organization_id = $1 AND staff_number = $2
      LIMIT 1`,
    [input.organizationId, input.staffNumber]
  );
  return result.rows[0] || null;
}

async function listByOrganization(db, input) {
  if (input.status) {
    const result = await db.query(
      `SELECT * FROM activeclinic.staff_members
        WHERE organization_id = $1 AND status = $2
        ORDER BY last_name ASC, first_name ASC`,
      [input.organizationId, input.status]
    );
    return result.rows;
  }
  const result = await db.query(
    `SELECT * FROM activeclinic.staff_members
      WHERE organization_id = $1
      ORDER BY last_name ASC, first_name ASC`,
    [input.organizationId]
  );
  return result.rows;
}

/**
 * @param {{ query: Function }} db
 * @param {string} platformIdentityId
 */
async function listByPlatformIdentity(db, platformIdentityId) {
  const result = await db.query(
    `SELECT * FROM activeclinic.staff_members
      WHERE platform_identity_id = $1
        AND status <> 'archived'
      ORDER BY created_at ASC`,
    [platformIdentityId]
  );
  return result.rows;
}

async function listByFacility(db, input) {
  const result = await db.query(
    `SELECT s.*
       FROM activeclinic.staff_members s
       JOIN activeclinic.staff_facility_assignments a
         ON a.staff_member_id = s.id
        AND a.organization_id = s.organization_id
      WHERE s.organization_id = $1
        AND a.facility_id = $2
        AND a.status = 'active'
      ORDER BY s.last_name ASC, s.first_name ASC`,
    [input.organizationId, input.facilityId]
  );
  return result.rows;
}

async function updateStaffMember(db, input) {
  const p = input.patch || {};
  const result = await db.query(
    `UPDATE activeclinic.staff_members
        SET first_name = COALESCE($3, first_name),
            last_name = COALESCE($4, last_name),
            preferred_name = COALESCE($5, preferred_name),
            display_name = COALESCE($6, display_name),
            phone_normalized = COALESCE($7, phone_normalized),
            phone_display = COALESCE($8, phone_display),
            email_normalized = COALESCE($9, email_normalized),
            email_display = COALESCE($10, email_display),
            job_title = COALESCE($11, job_title),
            employment_type = COALESCE($12, employment_type),
            status = COALESCE($13, status),
            staff_number = COALESCE($14, staff_number),
            start_date = COALESCE($15, start_date),
            end_date = COALESCE($16, end_date),
            platform_identity_id = COALESCE($17, platform_identity_id),
            updated_at = now()
      WHERE id = $1 AND organization_id = $2
      RETURNING *`,
    [
      input.id,
      input.organizationId,
      p.firstName != null ? p.firstName : null,
      p.lastName != null ? p.lastName : null,
      p.preferredName !== undefined ? p.preferredName : null,
      p.displayName != null ? p.displayName : null,
      p.phoneNormalized != null ? p.phoneNormalized : null,
      p.phoneDisplay != null ? p.phoneDisplay : null,
      p.emailNormalized !== undefined ? p.emailNormalized : null,
      p.emailDisplay !== undefined ? p.emailDisplay : null,
      p.jobTitle !== undefined ? p.jobTitle : null,
      p.employmentType != null ? p.employmentType : null,
      p.status != null ? p.status : null,
      p.staffNumber !== undefined ? p.staffNumber : null,
      p.startDate !== undefined ? p.startDate : null,
      p.endDate !== undefined ? p.endDate : null,
      p.platformIdentityId !== undefined ? p.platformIdentityId : null,
    ]
  );
  return result.rows[0] || null;
}

async function setPlatformIdentity(db, input) {
  const result = await db.query(
    `UPDATE activeclinic.staff_members
        SET platform_identity_id = $3,
            updated_at = now()
      WHERE id = $1 AND organization_id = $2
      RETURNING *`,
    [input.id, input.organizationId, input.platformIdentityId]
  );
  return result.rows[0] || null;
}

async function clearPlatformIdentity(db, input) {
  const result = await db.query(
    `UPDATE activeclinic.staff_members
        SET platform_identity_id = NULL,
            updated_at = now()
      WHERE id = $1 AND organization_id = $2
      RETURNING *`,
    [input.id, input.organizationId]
  );
  return result.rows[0] || null;
}

module.exports = {
  insertStaffMember,
  findByIdAndOrganization,
  findByIdentityAndOrganization,
  findByOrganizationAndStaffNumber,
  listByOrganization,
  listByPlatformIdentity,
  listByFacility,
  updateStaffMember,
  setPlatformIdentity,
  clearPlatformIdentity,
};
