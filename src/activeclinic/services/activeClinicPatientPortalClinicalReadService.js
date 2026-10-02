"use strict";

/**
 * Patient portal read projections (AC-P10 prescriptions, AC-P11 referrals, AC-P12 results).
 * Ownership: organizationId + patientId only. No staff notes / prescribe / edit.
 */

const RESULT = Object.freeze({
  OK: "ok",
  INVALID_INPUT: "invalid_input",
  NOT_FOUND: "not_found",
  NO_PATIENT: "no_patient",
});

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const RX_STATUS_LABELS = Object.freeze({
  pending: "Pending",
  in_progress: "In progress",
  ready: "Ready",
  dispensed: "Dispensed",
  partially_dispensed: "Partially dispensed",
  cancelled: "Cancelled",
});

const REFERRAL_STATUS_LABELS = Object.freeze({
  open: "Open",
  in_progress: "In progress",
  completed: "Completed",
  cancelled: "Cancelled",
  deferred: "Deferred",
});

function assertPatientScope(input) {
  const organizationId = String((input && input.organizationId) || "").trim();
  const patientId = String((input && input.patientId) || "").trim();
  if (!UUID_RE.test(organizationId)) {
    return { ok: false, code: RESULT.INVALID_INPUT };
  }
  if (!patientId) {
    return { ok: false, code: RESULT.NO_PATIENT };
  }
  if (!UUID_RE.test(patientId)) {
    return { ok: false, code: RESULT.INVALID_INPUT };
  }
  return { ok: true, organizationId, patientId };
}

/**
 * AC-P10 — own prescriptions (read-only).
 */
async function listPatientPrescriptions(db, input) {
  const scope = assertPatientScope(input);
  if (!scope.ok) return { ...scope, prescriptions: [] };

  const result = await db.query(
    `SELECT pp.id, pp.prescription_number, pp.status, pp.priority, pp.created_at,
            f.display_name AS facility_display_name,
            COALESCE(sm.display_name, trim(sm.first_name || ' ' || sm.last_name)) AS prescriber_name
       FROM activeclinic.pharmacy_prescriptions pp
       JOIN activeclinic.facilities f ON f.id = pp.facility_id
       LEFT JOIN activeclinic.staff_members sm ON sm.id = pp.prescriber_staff_id
      WHERE pp.organization_id = $1
        AND pp.patient_id = $2
      ORDER BY pp.created_at DESC
      LIMIT 100`,
    [scope.organizationId, scope.patientId]
  );

  const prescriptions = result.rows.map((row) => ({
    id: row.id,
    prescriptionNumber: row.prescription_number,
    status: row.status,
    statusLabel: RX_STATUS_LABELS[row.status] || row.status,
    priority: row.priority,
    createdAt: row.created_at,
    facilityDisplayName: row.facility_display_name || null,
    prescriberName: row.prescriber_name || null,
  }));

  return { ok: true, code: RESULT.OK, prescriptions };
}

async function getPatientPrescription(db, input) {
  const scope = assertPatientScope(input);
  const prescriptionId = String((input && input.prescriptionId) || "").trim();
  if (!scope.ok) return { ...scope, prescription: null };
  if (!UUID_RE.test(prescriptionId)) {
    return { ok: false, code: RESULT.INVALID_INPUT, prescription: null };
  }

  const result = await db.query(
    `SELECT pp.id, pp.prescription_number, pp.status, pp.priority, pp.created_at,
            f.display_name AS facility_display_name,
            COALESCE(sm.display_name, trim(sm.first_name || ' ' || sm.last_name)) AS prescriber_name
       FROM activeclinic.pharmacy_prescriptions pp
       JOIN activeclinic.facilities f ON f.id = pp.facility_id
       LEFT JOIN activeclinic.staff_members sm ON sm.id = pp.prescriber_staff_id
      WHERE pp.id = $1
        AND pp.organization_id = $2
        AND pp.patient_id = $3
      LIMIT 1`,
    [prescriptionId, scope.organizationId, scope.patientId]
  );
  if (!result.rows[0]) {
    return { ok: false, code: RESULT.NOT_FOUND, prescription: null };
  }

  const itemsRes = await db.query(
    `SELECT ppi.id, ppi.quantity_ordered, ppi.quantity_dispensed, ppi.dosage_instructions,
            ppi.status, mci.generic_name AS medication_name, mci.strength
       FROM activeclinic.pharmacy_prescription_items ppi
       JOIN activeclinic.medication_catalogue_items mci
         ON mci.id = ppi.medication_catalogue_item_id
      WHERE ppi.pharmacy_prescription_id = $1
        AND ppi.organization_id = $2
      ORDER BY ppi.created_at ASC`,
    [prescriptionId, scope.organizationId]
  );

  const row = result.rows[0];
  return {
    ok: true,
    code: RESULT.OK,
    prescription: {
      id: row.id,
      prescriptionNumber: row.prescription_number,
      status: row.status,
      statusLabel: RX_STATUS_LABELS[row.status] || row.status,
      priority: row.priority,
      createdAt: row.created_at,
      facilityDisplayName: row.facility_display_name || null,
      prescriberName: row.prescriber_name || null,
      items: itemsRes.rows.map((it) => ({
        id: it.id,
        medicationName: it.medication_name,
        strength: it.strength || null,
        quantityOrdered: it.quantity_ordered,
        quantityDispensed: it.quantity_dispensed,
        dosageInstructions: it.dosage_instructions || null,
        status: it.status,
      })),
    },
  };
}

/**
 * AC-P11 — own referrals (pending_referral follow-up items). No staff owner fields.
 */
async function listPatientReferrals(db, input) {
  const scope = assertPatientScope(input);
  if (!scope.ok) return { ...scope, referrals: [] };

  const result = await db.query(
    `SELECT f.id, f.title, f.reason, f.status, f.urgency, f.due_at, f.created_at,
            fac.display_name AS facility_display_name
       FROM activeclinic.clinical_follow_up_items f
       JOIN activeclinic.facilities fac ON fac.id = f.facility_id
      WHERE f.organization_id = $1
        AND f.patient_id = $2
        AND f.item_type = 'pending_referral'
      ORDER BY f.created_at DESC
      LIMIT 100`,
    [scope.organizationId, scope.patientId]
  );

  return {
    ok: true,
    code: RESULT.OK,
    referrals: result.rows.map((row) => ({
      id: row.id,
      title: row.title,
      reason: row.reason || null,
      status: row.status,
      statusLabel: REFERRAL_STATUS_LABELS[row.status] || row.status,
      urgency: row.urgency,
      dueAt: row.due_at || null,
      createdAt: row.created_at,
      facilityDisplayName: row.facility_display_name || null,
    })),
  };
}

async function getPatientReferral(db, input) {
  const scope = assertPatientScope(input);
  const referralId = String((input && input.referralId) || "").trim();
  if (!scope.ok) return { ...scope, referral: null };
  if (!UUID_RE.test(referralId)) {
    return { ok: false, code: RESULT.INVALID_INPUT, referral: null };
  }

  const result = await db.query(
    `SELECT f.id, f.title, f.reason, f.status, f.urgency, f.due_at, f.created_at,
            fac.display_name AS facility_display_name
       FROM activeclinic.clinical_follow_up_items f
       JOIN activeclinic.facilities fac ON fac.id = f.facility_id
      WHERE f.id = $1
        AND f.organization_id = $2
        AND f.patient_id = $3
        AND f.item_type = 'pending_referral'
      LIMIT 1`,
    [referralId, scope.organizationId, scope.patientId]
  );
  if (!result.rows[0]) {
    return { ok: false, code: RESULT.NOT_FOUND, referral: null };
  }
  const row = result.rows[0];
  return {
    ok: true,
    code: RESULT.OK,
    referral: {
      id: row.id,
      title: row.title,
      reason: row.reason || null,
      status: row.status,
      statusLabel: REFERRAL_STATUS_LABELS[row.status] || row.status,
      urgency: row.urgency,
      dueAt: row.due_at || null,
      createdAt: row.created_at,
      facilityDisplayName: row.facility_display_name || null,
    },
  };
}

/**
 * AC-P12 — patient-visible released diagnostic results only.
 * Clinical documents (ACN18) have no patient_release column; they are not projected.
 * Unreleased lab/radiology rows never enter the payload.
 */
async function listPatientReleasedResults(db, input) {
  const scope = assertPatientScope(input);
  if (!scope.ok) return { ...scope, results: [] };

  const lab = await db.query(
    `SELECT lr.id AS result_id, req.id AS request_id, req.request_number,
            req.test_panel_name, lr.result_summary, lr.released_at, lr.status,
            f.display_name AS facility_display_name, 'laboratory' AS modality
       FROM activeclinic.laboratory_results lr
       JOIN activeclinic.laboratory_requests req ON req.id = lr.laboratory_request_id
       JOIN activeclinic.facilities f ON f.id = lr.facility_id
      WHERE lr.organization_id = $1
        AND lr.patient_id = $2
        AND lr.status = 'released'
      ORDER BY lr.released_at DESC NULLS LAST, lr.created_at DESC
      LIMIT 100`,
    [scope.organizationId, scope.patientId]
  );

  const rad = await db.query(
    `SELECT rr.id AS result_id, req.id AS request_id, req.request_number,
            COALESCE(req.study_description, req.study_type) AS test_panel_name,
            rr.impression AS result_summary, rr.released_at, rr.status,
            f.display_name AS facility_display_name, 'radiology' AS modality
       FROM activeclinic.radiology_reports rr
       JOIN activeclinic.radiology_requests req ON req.id = rr.radiology_request_id
       JOIN activeclinic.facilities f ON f.id = rr.facility_id
      WHERE rr.organization_id = $1
        AND rr.patient_id = $2
        AND rr.status = 'released'
      ORDER BY rr.released_at DESC NULLS LAST, rr.created_at DESC
      LIMIT 100`,
    [scope.organizationId, scope.patientId]
  );

  const results = [...lab.rows, ...rad.rows]
    .map((row) => ({
      id: row.result_id,
      requestId: row.request_id,
      requestNumber: row.request_number,
      title: row.test_panel_name,
      summary: row.result_summary || null,
      releasedAt: row.released_at,
      status: row.status,
      modality: row.modality,
      facilityDisplayName: row.facility_display_name || null,
    }))
    .sort((a, b) => {
      const ta = new Date(a.releasedAt || 0).getTime();
      const tb = new Date(b.releasedAt || 0).getTime();
      return tb - ta;
    });

  return { ok: true, code: RESULT.OK, results };
}

async function getPatientReleasedResult(db, input) {
  const scope = assertPatientScope(input);
  const resultId = String((input && input.resultId) || "").trim();
  const modality = String((input && input.modality) || "").trim().toLowerCase();
  if (!scope.ok) return { ...scope, result: null };
  if (!UUID_RE.test(resultId) || (modality !== "laboratory" && modality !== "radiology")) {
    return { ok: false, code: RESULT.INVALID_INPUT, result: null };
  }

  if (modality === "laboratory") {
    const result = await db.query(
      `SELECT lr.id AS result_id, req.request_number, req.test_panel_name,
              lr.result_summary, lr.released_at, lr.status,
              f.display_name AS facility_display_name
         FROM activeclinic.laboratory_results lr
         JOIN activeclinic.laboratory_requests req ON req.id = lr.laboratory_request_id
         JOIN activeclinic.facilities f ON f.id = lr.facility_id
        WHERE lr.id = $1
          AND lr.organization_id = $2
          AND lr.patient_id = $3
          AND lr.status = 'released'
        LIMIT 1`,
      [resultId, scope.organizationId, scope.patientId]
    );
    if (!result.rows[0]) {
      return { ok: false, code: RESULT.NOT_FOUND, result: null };
    }
    const row = result.rows[0];
    return {
      ok: true,
      code: RESULT.OK,
      result: {
        id: row.result_id,
        requestNumber: row.request_number,
        title: row.test_panel_name,
        summary: row.result_summary || null,
        releasedAt: row.released_at,
        status: row.status,
        modality: "laboratory",
        facilityDisplayName: row.facility_display_name || null,
        findings: null,
        impression: null,
      },
    };
  }

  const result = await db.query(
    `SELECT rr.id AS result_id, req.request_number,
            COALESCE(req.study_description, req.study_type) AS title,
            rr.findings, rr.impression, rr.released_at, rr.status,
            f.display_name AS facility_display_name
       FROM activeclinic.radiology_reports rr
       JOIN activeclinic.radiology_requests req ON req.id = rr.radiology_request_id
       JOIN activeclinic.facilities f ON f.id = rr.facility_id
      WHERE rr.id = $1
        AND rr.organization_id = $2
        AND rr.patient_id = $3
        AND rr.status = 'released'
      LIMIT 1`,
    [resultId, scope.organizationId, scope.patientId]
  );
  if (!result.rows[0]) {
    return { ok: false, code: RESULT.NOT_FOUND, result: null };
  }
  const row = result.rows[0];
  return {
    ok: true,
    code: RESULT.OK,
    result: {
      id: row.result_id,
      requestNumber: row.request_number,
      title: row.title,
      summary: row.impression || null,
      findings: row.findings || null,
      impression: row.impression || null,
      releasedAt: row.released_at,
      status: row.status,
      modality: "radiology",
      facilityDisplayName: row.facility_display_name || null,
    },
  };
}

module.exports = {
  RESULT,
  listPatientPrescriptions,
  getPatientPrescription,
  listPatientReferrals,
  getPatientReferral,
  listPatientReleasedResults,
  getPatientReleasedResult,
};
