"use strict";

/**
 * AC-P05 patient visit summary release repository.
 * Always organization-scoped. One release row per encounter (immutable MVP).
 */

async function insertRelease(db, row) {
  const r = await db.query(
    `INSERT INTO activeclinic.patient_visit_summary_releases (
       organization_id, healthcare_organization_id, facility_id, patient_id,
       encounter_id, snapshot_json, released_by_staff_id, released_at
     ) VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7,now())
     RETURNING *`,
    [
      row.organizationId,
      row.healthcareOrganizationId,
      row.facilityId,
      row.patientId,
      row.encounterId,
      JSON.stringify(row.snapshotJson),
      row.releasedByStaffId,
    ]
  );
  return r.rows[0] || null;
}

async function findByIdAndOrganization(db, { id, organizationId }) {
  const r = await db.query(
    `SELECT r.*,
            p.patient_number,
            p.first_name AS patient_first_name,
            p.last_name AS patient_last_name,
            f.display_name AS facility_display_name,
            e.encounter_number,
            s.first_name AS released_by_first_name,
            s.last_name AS released_by_last_name
       FROM activeclinic.patient_visit_summary_releases r
       JOIN activeclinic.patients p ON p.id = r.patient_id
       JOIN activeclinic.facilities f ON f.id = r.facility_id
       JOIN activeclinic.encounters e ON e.id = r.encounter_id
       JOIN activeclinic.staff_members s ON s.id = r.released_by_staff_id
      WHERE r.id = $1
        AND r.organization_id = $2`,
    [id, organizationId]
  );
  return r.rows[0] || null;
}

async function findByEncounter(db, { organizationId, encounterId }) {
  const r = await db.query(
    `SELECT * FROM activeclinic.patient_visit_summary_releases
      WHERE organization_id = $1
        AND encounter_id = $2`,
    [organizationId, encounterId]
  );
  return r.rows[0] || null;
}

async function findByIdForPatient(db, { organizationId, patientId, summaryId }) {
  const r = await db.query(
    `SELECT r.*,
            f.display_name AS facility_display_name,
            e.encounter_number
       FROM activeclinic.patient_visit_summary_releases r
       JOIN activeclinic.facilities f ON f.id = r.facility_id
       JOIN activeclinic.encounters e ON e.id = r.encounter_id
      WHERE r.id = $1
        AND r.organization_id = $2
        AND r.patient_id = $3`,
    [summaryId, organizationId, patientId]
  );
  return r.rows[0] || null;
}

async function listForPatient(db, { organizationId, patientId, limit }) {
  const lim = Math.min(Math.max(Number(limit) || 50, 1), 100);
  const r = await db.query(
    `SELECT r.id, r.encounter_id, r.facility_id, r.released_at, r.snapshot_json,
            f.display_name AS facility_display_name,
            e.encounter_number
       FROM activeclinic.patient_visit_summary_releases r
       JOIN activeclinic.facilities f ON f.id = r.facility_id
       JOIN activeclinic.encounters e ON e.id = r.encounter_id
      WHERE r.organization_id = $1
        AND r.patient_id = $2
      ORDER BY r.released_at DESC
      LIMIT $3`,
    [organizationId, patientId, lim]
  );
  return r.rows;
}

/**
 * Find a release for this patient whose snapshot visitDate matches YYYY-MM-DD.
 */
async function findForPatientOnVisitDate(db, {
  organizationId,
  patientId,
  visitDate,
}) {
  if (!visitDate) return null;
  const r = await db.query(
    `SELECT r.id, r.encounter_id, r.released_at, r.snapshot_json,
            f.display_name AS facility_display_name
       FROM activeclinic.patient_visit_summary_releases r
       JOIN activeclinic.facilities f ON f.id = r.facility_id
      WHERE r.organization_id = $1
        AND r.patient_id = $2
        AND (r.snapshot_json->>'visitDate') = $3
      ORDER BY r.released_at DESC
      LIMIT 1`,
    [organizationId, patientId, String(visitDate).slice(0, 10)]
  );
  return r.rows[0] || null;
}

module.exports = {
  insertRelease,
  findByIdAndOrganization,
  findByEncounter,
  findByIdForPatient,
  listForPatient,
  findForPatientOnVisitDate,
};
