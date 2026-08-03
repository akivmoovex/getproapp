"use strict";

/**
 * Persistence for patient registrations and facility links.
 */

async function insertRegistration(db, row) {
  const result = await db.query(
    `INSERT INTO activeclinic.patient_registrations (
       organization_id, healthcare_organization_id, patient_id, facility_id,
       registered_at, registration_method, source_reference,
       registered_by_staff_id, is_initial, status
     ) VALUES (
       $1,$2,$3,$4,COALESCE($5, now()),$6,$7,$8,$9,$10
     )
     RETURNING *`,
    [
      row.organizationId,
      row.healthcareOrganizationId,
      row.patientId,
      row.facilityId,
      row.registeredAt || null,
      row.registrationMethod,
      row.sourceReference || null,
      row.registeredByStaffId || null,
      row.isInitial === true,
      row.status || "completed",
    ]
  );
  return result.rows[0];
}

async function listRegistrationsByPatient(db, input) {
  const result = await db.query(
    `SELECT * FROM activeclinic.patient_registrations
      WHERE organization_id = $1
        AND healthcare_organization_id = $2
        AND patient_id = $3
      ORDER BY registered_at ASC`,
    [input.organizationId, input.healthcareOrganizationId, input.patientId]
  );
  return result.rows;
}

async function findInitialRegistration(db, input) {
  const result = await db.query(
    `SELECT * FROM activeclinic.patient_registrations
      WHERE organization_id = $1
        AND healthcare_organization_id = $2
        AND patient_id = $3
        AND is_initial = true
        AND status = 'completed'
      LIMIT 1`,
    [input.organizationId, input.healthcareOrganizationId, input.patientId]
  );
  return result.rows[0] || null;
}

async function insertFacilityLink(db, row) {
  const result = await db.query(
    `INSERT INTO activeclinic.patient_facility_links (
       organization_id, healthcare_organization_id, patient_id, facility_id,
       relationship_type, first_seen_at, last_seen_at, status
     ) VALUES (
       $1,$2,$3,$4,$5,COALESCE($6, now()),COALESCE($7, now()),$8
     )
     RETURNING *`,
    [
      row.organizationId,
      row.healthcareOrganizationId,
      row.patientId,
      row.facilityId,
      row.relationshipType,
      row.firstSeenAt || null,
      row.lastSeenAt || null,
      row.status || "active",
    ]
  );
  return result.rows[0];
}

async function findActiveFacilityLink(db, input) {
  const result = await db.query(
    `SELECT * FROM activeclinic.patient_facility_links
      WHERE organization_id = $1
        AND healthcare_organization_id = $2
        AND patient_id = $3
        AND facility_id = $4
        AND relationship_type = $5
        AND status = 'active'
      LIMIT 1`,
    [
      input.organizationId,
      input.healthcareOrganizationId,
      input.patientId,
      input.facilityId,
      input.relationshipType || "registered_at",
    ]
  );
  return result.rows[0] || null;
}

async function listFacilityLinksByPatient(db, input) {
  const result = await db.query(
    `SELECT * FROM activeclinic.patient_facility_links
      WHERE organization_id = $1
        AND healthcare_organization_id = $2
        AND patient_id = $3
        AND ($4::boolean = true OR status = 'active')
      ORDER BY first_seen_at ASC`,
    [
      input.organizationId,
      input.healthcareOrganizationId,
      input.patientId,
      input.includeInactive === true,
    ]
  );
  return result.rows;
}

async function touchFacilityLink(db, input) {
  const result = await db.query(
    `UPDATE activeclinic.patient_facility_links
        SET last_seen_at = now()
      WHERE id = $1
        AND organization_id = $2
        AND healthcare_organization_id = $3
      RETURNING *`,
    [input.id, input.organizationId, input.healthcareOrganizationId]
  );
  return result.rows[0] || null;
}

async function patientVisibleInFacilities(db, input) {
  const result = await db.query(
    `SELECT 1
       FROM activeclinic.patient_facility_links
      WHERE organization_id = $1
        AND healthcare_organization_id = $2
        AND patient_id = $3
        AND status = 'active'
        AND facility_id = ANY($4::uuid[])
      LIMIT 1`,
    [
      input.organizationId,
      input.healthcareOrganizationId,
      input.patientId,
      input.facilityIds,
    ]
  );
  return Boolean(result.rows[0]);
}

module.exports = {
  insertRegistration,
  listRegistrationsByPatient,
  findInitialRegistration,
  insertFacilityLink,
  findActiveFacilityLink,
  listFacilityLinksByPatient,
  touchFacilityLink,
  patientVisibleInFacilities,
};
