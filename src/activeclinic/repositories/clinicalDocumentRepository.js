"use strict";

/**
 * ActiveClinic clinical documents repository (ACN18).
 * Always organization-scoped. No binary attachment storage.
 */

async function insertDocument(db, row) {
  const r = await db.query(
    `INSERT INTO activeclinic.clinical_documents (
       organization_id, healthcare_organization_id, facility_id, patient_id,
       encounter_id, document_type, title, body_text, document_date, status,
       created_by_staff_id
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'draft',$10)
     RETURNING *`,
    [
      row.organizationId,
      row.healthcareOrganizationId,
      row.facilityId,
      row.patientId,
      row.encounterId || null,
      row.documentType,
      row.title,
      row.bodyText || null,
      row.documentDate || null,
      row.createdByStaffId,
    ]
  );
  return r.rows[0] || null;
}

async function updateDraftDocument(db, row) {
  const r = await db.query(
    `UPDATE activeclinic.clinical_documents
        SET encounter_id = $4,
            document_type = $5,
            title = $6,
            body_text = $7,
            document_date = $8,
            updated_at = now()
      WHERE id = $1
        AND organization_id = $2
        AND patient_id = $3
        AND status = 'draft'
      RETURNING *`,
    [
      row.id,
      row.organizationId,
      row.patientId,
      row.encounterId || null,
      row.documentType,
      row.title,
      row.bodyText || null,
      row.documentDate || null,
    ]
  );
  return r.rows[0] || null;
}

async function finalizeDocument(db, row) {
  const r = await db.query(
    `UPDATE activeclinic.clinical_documents
        SET status = 'final',
            finalized_by_staff_id = $4,
            finalized_at = now(),
            updated_at = now()
      WHERE id = $1
        AND organization_id = $2
        AND patient_id = $3
        AND status = 'draft'
      RETURNING *`,
    [row.id, row.organizationId, row.patientId, row.finalizedByStaffId]
  );
  return r.rows[0] || null;
}

async function findByIdAndOrganization(db, { id, organizationId }) {
  const r = await db.query(
    `SELECT d.*,
            p.patient_number,
            p.first_name AS patient_first_name,
            p.last_name AS patient_last_name,
            e.encounter_number,
            f.display_name AS facility_display_name,
            cs.first_name AS created_by_first_name,
            cs.last_name AS created_by_last_name,
            fs.first_name AS finalized_by_first_name,
            fs.last_name AS finalized_by_last_name
       FROM activeclinic.clinical_documents d
       JOIN activeclinic.patients p ON p.id = d.patient_id
       JOIN activeclinic.facilities f ON f.id = d.facility_id
       JOIN activeclinic.staff_members cs ON cs.id = d.created_by_staff_id
       LEFT JOIN activeclinic.encounters e ON e.id = d.encounter_id
       LEFT JOIN activeclinic.staff_members fs ON fs.id = d.finalized_by_staff_id
      WHERE d.id = $1
        AND d.organization_id = $2`,
    [id, organizationId]
  );
  return r.rows[0] || null;
}

async function listForPatient(db, input) {
  const params = [input.organizationId, input.patientId];
  const where = ["d.organization_id = $1", "d.patient_id = $2"];

  if (input.facilityId) {
    params.push(input.facilityId);
    where.push(`d.facility_id = $${params.length}`);
  }
  if (input.encounterId) {
    params.push(input.encounterId);
    where.push(`d.encounter_id = $${params.length}`);
  }
  if (input.documentType) {
    params.push(input.documentType);
    where.push(`d.document_type = $${params.length}`);
  }
  if (input.status) {
    params.push(input.status);
    where.push(`d.status = $${params.length}`);
  }
  if (input.q) {
    params.push(`%${String(input.q).trim()}%`);
    where.push(
      `(d.title ILIKE $${params.length} OR COALESCE(d.body_text, '') ILIKE $${params.length})`
    );
  }

  const limit = Math.min(Math.max(Number(input.limit) || 50, 1), 100);
  params.push(limit);

  const r = await db.query(
    `SELECT d.*,
            e.encounter_number,
            cs.first_name AS created_by_first_name,
            cs.last_name AS created_by_last_name
       FROM activeclinic.clinical_documents d
       JOIN activeclinic.staff_members cs ON cs.id = d.created_by_staff_id
       LEFT JOIN activeclinic.encounters e ON e.id = d.encounter_id
      WHERE ${where.join(" AND ")}
      ORDER BY d.created_at DESC
      LIMIT $${params.length}`,
    params
  );
  return r.rows;
}

async function insertEvent(db, row) {
  const r = await db.query(
    `INSERT INTO activeclinic.clinical_document_events (
       organization_id, document_id, event_type,
       actor_staff_id, actor_platform_identity_id, detail_json
     ) VALUES ($1,$2,$3,$4,$5,$6::jsonb)
     RETURNING *`,
    [
      row.organizationId,
      row.documentId,
      row.eventType,
      row.actorStaffId || null,
      row.actorPlatformIdentityId || null,
      JSON.stringify(row.detailJson || {}),
    ]
  );
  return r.rows[0] || null;
}

async function listEvents(db, { organizationId, documentId }) {
  const r = await db.query(
    `SELECT ev.*,
            s.first_name AS actor_first_name,
            s.last_name AS actor_last_name
       FROM activeclinic.clinical_document_events ev
       LEFT JOIN activeclinic.staff_members s ON s.id = ev.actor_staff_id
      WHERE ev.organization_id = $1
        AND ev.document_id = $2
      ORDER BY ev.created_at ASC`,
    [organizationId, documentId]
  );
  return r.rows;
}

async function listPatientEncounters(db, { organizationId, patientId, facilityId }) {
  const params = [organizationId, patientId];
  let facilityClause = "";
  if (facilityId) {
    params.push(facilityId);
    facilityClause = ` AND facility_id = $${params.length}`;
  }
  const r = await db.query(
    `SELECT id, encounter_number, facility_id, status, opened_at
       FROM activeclinic.encounters
      WHERE organization_id = $1
        AND patient_id = $2
        ${facilityClause}
      ORDER BY opened_at DESC
      LIMIT 50`,
    params
  );
  return r.rows;
}

module.exports = {
  insertDocument,
  updateDraftDocument,
  finalizeDocument,
  findByIdAndOrganization,
  listForPatient,
  insertEvent,
  listEvents,
  listPatientEncounters,
};
