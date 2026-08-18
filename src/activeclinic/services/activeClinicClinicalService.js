"use strict";

/**
 * ActiveClinic P04 clinical service: encounters, triage, vitals, consultation, orders, alerts.
 * Append-only clinical foundation. Draft vs signed separation. Manual alert raise only.
 */

const crypto = require("crypto");
const { recordAuditEventSafe } = require("../../platform/services/auditEventService");
const {
  authorizeStaffPermission,
} = require("./activeClinicAuthorizationService");
const {
  CODE_ACTIVECLINIC_ORG_V6,
} = require("../../platform/config/deploymentProfiles");

const RESULT = Object.freeze({
  OK: "ok",
  INVALID_INPUT: "invalid_input",
  ACCESS_DENIED: "access_denied",
  ENCOUNTER_NOT_FOUND: "encounter_not_found",
  TRIAGE_NOT_FOUND: "triage_not_found",
  CONSULTATION_NOT_FOUND: "consultation_not_found",
  ORDER_NOT_FOUND: "order_not_found",
  ALERT_NOT_FOUND: "alert_not_found",
  PATIENT_NOT_FOUND: "patient_not_found",
  FACILITY_NOT_FOUND: "facility_not_found",
  INVALID_STATUS: "invalid_status",
  INVALID_TRANSITION: "invalid_transition",
  STALE_VERSION: "stale_version",
  DUPLICATE_ACTIVE_ENCOUNTER: "duplicate_active_encounter",
  CANNOT_SIGN_DRAFT: "cannot_sign_draft",
  CANNOT_EDIT_SIGNED: "cannot_edit_signed",
  OBSERVATION_NOT_FOUND: "observation_not_found",
});

const PERM = Object.freeze({
  VIEW: "activeclinic.encounter.view",
  MANAGE: "activeclinic.encounter.manage",
  TRIAGE: "activeclinic.triage.record",
  NURSING_INTAKE: "activeclinic.nursing_intake.record",
  CONSULTATION_RECORD: "activeclinic.consultation.record",
  CONSULTATION_SIGN: "activeclinic.consultation.sign",
  DIAGNOSIS_RECORD: "activeclinic.diagnosis.record",
  ORDER_CREATE: "activeclinic.clinical_order.create",
  ALERT_VIEW: "activeclinic.clinical_alert.view",
  ALERT_RAISE: "activeclinic.clinical_alert.raise",
});

function mapEncounter(row) {
  if (!row) return null;
  return {
    id: row.id,
    organizationId: row.organization_id,
    healthcareOrganizationId: row.healthcare_organization_id,
    facilityId: row.facility_id,
    patientId: row.patient_id,
    arrivalId: row.arrival_id || null,
    encounterNumber: row.encounter_number,
    encounterType: row.encounter_type,
    status: row.status,
    openedAt: row.opened_at,
    closedAt: row.closed_at || null,
    openedByStaffId: row.opened_by_staff_id,
    closedByStaffId: row.closed_by_staff_id || null,
    closureNote: row.closure_note || null,
    version: row.version,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    patientDisplayName: row.patient_display_name || null,
    patientNumber: row.patient_number || null,
    openedByStaffDisplayName: row.opened_by_staff_display_name || null,
  };
}

function mapTriageAssessment(row) {
  if (!row) return null;
  return {
    id: row.id,
    organizationId: row.organization_id,
    healthcareOrganizationId: row.healthcare_organization_id,
    facilityId: row.facility_id,
    encounterId: row.encounter_id,
    patientId: row.patient_id,
    triageCategory: row.triage_category || null,
    chiefComplaint: row.chief_complaint,
    presentingSymptoms: row.presenting_symptoms || null,
    allergiesReported: row.allergies_reported || null,
    currentMedicationsReported: row.current_medications_reported || null,
    medicalHistorySummary: row.medical_history_summary || null,
    painLevel: row.pain_level || null,
    status: row.status,
    completedAt: row.completed_at || null,
    recordedByStaffId: row.recorded_by_staff_id,
    version: row.version,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    recordedByStaffDisplayName: row.recorded_by_staff_display_name || null,
  };
}

function mapVitalSignObservation(row) {
  if (!row) return null;
  return {
    id: row.id,
    organizationId: row.organization_id,
    healthcareOrganizationId: row.healthcare_organization_id,
    facilityId: row.facility_id,
    encounterId: row.encounter_id,
    patientId: row.patient_id,
    observationType: row.observation_type,
    valueNumeric: row.value_numeric || null,
    valueText: row.value_text || null,
    unit: row.unit || null,
    systolic: row.systolic || null,
    diastolic: row.diastolic || null,
    observedAt: row.observed_at,
    recordedByStaffId: row.recorded_by_staff_id,
    correctsObservationId: row.corrects_observation_id || null,
    correctionReason: row.correction_reason || null,
    createdAt: row.created_at,
    recordedByStaffDisplayName: row.recorded_by_staff_display_name || null,
  };
}

function mapConsultationNote(row) {
  if (!row) return null;
  return {
    id: row.id,
    organizationId: row.organization_id,
    healthcareOrganizationId: row.healthcare_organization_id,
    facilityId: row.facility_id,
    encounterId: row.encounter_id,
    patientId: row.patient_id,
    noteType: row.note_type,
    subjectiveText: row.subjective_text || null,
    objectiveText: row.objective_text || null,
    assessmentText: row.assessment_text || null,
    planText: row.plan_text || null,
    additionalNotes: row.additional_notes || null,
    status: row.status,
    signedAt: row.signed_at || null,
    signedByStaffId: row.signed_by_staff_id || null,
    createdByStaffId: row.created_by_staff_id,
    version: row.version,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    createdByStaffDisplayName: row.created_by_staff_display_name || null,
    signedByStaffDisplayName: row.signed_by_staff_display_name || null,
  };
}

function mapClinicalOrder(row) {
  if (!row) return null;
  return {
    id: row.id,
    organizationId: row.organization_id,
    healthcareOrganizationId: row.healthcare_organization_id,
    facilityId: row.facility_id,
    encounterId: row.encounter_id,
    patientId: row.patient_id,
    orderType: row.order_type,
    orderDetails: row.order_details || null,
    instructions: row.instructions || null,
    status: row.status,
    submittedAt: row.submitted_at || null,
    orderedByStaffId: row.ordered_by_staff_id,
    cancelledAt: row.cancelled_at || null,
    cancelledByStaffId: row.cancelled_by_staff_id || null,
    cancellationReason: row.cancellation_reason || null,
    version: row.version,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    orderedByStaffDisplayName: row.ordered_by_staff_display_name || null,
  };
}

const RADIOLOGY_STUDY_TYPES = new Set([
  "x_ray",
  "ct",
  "mri",
  "ultrasound",
  "mammography",
  "fluoroscopy",
  "nuclear_medicine",
  "other",
]);

function parseOrderDetails(raw) {
  if (!raw) return {};
  if (typeof raw === "string") {
    try {
      const parsed = JSON.parse(raw);
      return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
    } catch (_err) {
      return {};
    }
  }
  if (typeof raw === "object" && !Array.isArray(raw)) return raw;
  return {};
}

function clipText(value, max) {
  const text = String(value == null ? "" : value).trim();
  if (!text) return null;
  return text.slice(0, max);
}

function laboratoryPanelName(details) {
  return (
    clipText(
      details.test_panel_name || details.test_code || details.testCode || details.panel_name,
      500
    ) || "Laboratory request"
  );
}

function laboratoryPanelCode(details) {
  return clipText(details.test_panel_code || details.test_code || details.testCode, 64);
}

function radiologyStudyType(details) {
  const raw = String(details.imaging_type || details.study_type || details.studyType || "")
    .trim()
    .toLowerCase();
  if (raw === "ct_scan") return "ct";
  if (RADIOLOGY_STUDY_TYPES.has(raw)) return raw;
  return "other";
}

function nextDiagnosticRequestNumber(prefix) {
  return `${prefix}-${Date.now().toString(36)}-${crypto.randomBytes(3).toString("hex")}`.slice(
    0,
    64
  );
}

/**
 * Clinical lab/radiology orders are the clinician-facing request. Diagnostics
 * worklists read laboratory_requests / radiology_requests, so those rows must
 * be created here (already-intended V7 fulfillment path).
 */
async function createDiagnosticFulfillmentFromClinicalOrder(db, input) {
  const orderType = String(input.orderType || "");
  const orderRow = input.orderRow;
  const details = parseOrderDetails(input.orderDetails);
  const instructions = clipText(input.instructions, 2000);
  const requestedByStaffId = input.actor && input.actor.staffMemberId;

  if (orderType === "laboratory") {
    const existing = await db.query(
      `SELECT id FROM activeclinic.laboratory_requests
        WHERE clinical_order_id = $1
        LIMIT 1`,
      [orderRow.id]
    );
    if (existing.rows[0]) return { kind: "laboratory", id: existing.rows[0].id, created: false };
    const inserted = await db.query(
      `INSERT INTO activeclinic.laboratory_requests (
         organization_id, healthcare_organization_id, facility_id,
         clinical_order_id, encounter_id, patient_id,
         request_number, test_panel_code, test_panel_name, clinical_notes,
         status, requested_by_staff_id
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'pending_collection', $11)
       RETURNING id`,
      [
        orderRow.organization_id,
        orderRow.healthcare_organization_id,
        orderRow.facility_id,
        orderRow.id,
        orderRow.encounter_id,
        orderRow.patient_id,
        nextDiagnosticRequestNumber("LAB"),
        laboratoryPanelCode(details),
        laboratoryPanelName(details),
        instructions,
        requestedByStaffId,
      ]
    );
    return { kind: "laboratory", id: inserted.rows[0].id, created: true };
  }

  if (orderType === "radiology") {
    const existing = await db.query(
      `SELECT id FROM activeclinic.radiology_requests
        WHERE clinical_order_id = $1
        LIMIT 1`,
      [orderRow.id]
    );
    if (existing.rows[0]) return { kind: "radiology", id: existing.rows[0].id, created: false };
    const studyDescription =
      clipText(details.body_part || details.study_description || details.studyDescription, 500);
    const inserted = await db.query(
      `INSERT INTO activeclinic.radiology_requests (
         organization_id, healthcare_organization_id, facility_id,
         clinical_order_id, encounter_id, patient_id,
         request_number, study_type, study_description, clinical_indication,
         status, requested_by_staff_id
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'pending', $11)
       RETURNING id`,
      [
        orderRow.organization_id,
        orderRow.healthcare_organization_id,
        orderRow.facility_id,
        orderRow.id,
        orderRow.encounter_id,
        orderRow.patient_id,
        nextDiagnosticRequestNumber("RAD"),
        radiologyStudyType(details),
        studyDescription,
        instructions,
        requestedByStaffId,
      ]
    );
    return { kind: "radiology", id: inserted.rows[0].id, created: true };
  }

  return null;
}

function mapClinicalAlert(row) {
  if (!row) return null;
  return {
    id: row.id,
    organizationId: row.organization_id,
    healthcareOrganizationId: row.healthcare_organization_id,
    facilityId: row.facility_id,
    encounterId: row.encounter_id || null,
    patientId: row.patient_id,
    alertType: row.alert_type,
    alertMessage: row.alert_message,
    priority: row.priority,
    status: row.status,
    raisedByStaffId: row.raised_by_staff_id,
    acknowledgedByStaffId: row.acknowledged_by_staff_id || null,
    acknowledgedAt: row.acknowledged_at || null,
    resolvedByStaffId: row.resolved_by_staff_id || null,
    resolvedAt: row.resolved_at || null,
    resolutionNote: row.resolution_note || null,
    version: row.version,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    patientDisplayName: row.patient_display_name || null,
    raisedByStaffDisplayName: row.raised_by_staff_display_name || null,
  };
}

/**
 * Start a new clinical encounter for a patient.
 */
async function startEncounter(db, input) {
  const authz = await authorizeStaffPermission(db, {
    organizationId: input.organizationId,
    staffMemberId: input.actor.staffMemberId,
    platformIdentityId: input.actor.platformIdentityId,
    permissionKey: PERM.MANAGE,
    facilityId: input.facilityId,
  });
  if (!authz.ok) {
    return { ok: false, code: RESULT.ACCESS_DENIED, encounter: null };
  }

  const checkActive = await db.query(
    `SELECT id FROM activeclinic.encounters
     WHERE patient_id = $1 AND facility_id = $2 AND status = 'open'
     LIMIT 1`,
    [input.patientId, input.facilityId]
  );
  if (checkActive.rows.length > 0) {
    return { ok: false, code: RESULT.DUPLICATE_ACTIVE_ENCOUNTER, encounter: null };
  }

  const encounterNumber = `ENC-${Date.now()}-${Math.random().toString(36).substring(2, 8).toUpperCase()}`;
  const row = await db.query(
    `INSERT INTO activeclinic.encounters (
       organization_id, healthcare_organization_id, facility_id, patient_id,
       arrival_id, encounter_number, encounter_type, opened_by_staff_id
     ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     RETURNING *`,
    [
      input.organizationId,
      input.healthcareOrganizationId,
      input.facilityId,
      input.patientId,
      input.arrivalId || null,
      encounterNumber,
      input.encounterType || "outpatient",
      input.actor.staffMemberId,
    ]
  );

  await db.query(
    `INSERT INTO activeclinic.encounter_events (
       organization_id, healthcare_organization_id, encounter_id,
       event_type, actor_staff_id
     ) VALUES ($1, $2, $3, $4, $5)`,
    [
      input.organizationId,
      input.healthcareOrganizationId,
      row.rows[0].id,
      "opened",
      input.actor.staffMemberId,
    ]
  );

  await recordAuditEventSafe(db, {
    deploymentCode: input.deploymentCode || CODE_ACTIVECLINIC_ORG_V6,
    organizationId: input.organizationId,
    actorUserId: input.actor.platformIdentityId || null,
    actionKey: "activeclinic.encounter.started",
    entityType: "encounter",
    entityId: row.rows[0].id,
    outcome: "success",
    metadataJson: {
      facility_id: input.facilityId,
      patient_id: input.patientId,
      encounter_type: input.encounterType || "outpatient",
    },
  });

  return { ok: true, code: RESULT.OK, encounter: mapEncounter(row.rows[0]) };
}

/**
 * List open encounters for facility (clinical queue).
 */
async function listOpenEncounters(db, input) {
  const authz = await authorizeStaffPermission(db, {
    organizationId: input.organizationId,
    staffMemberId: input.actor.staffMemberId,
    platformIdentityId: input.actor.platformIdentityId,
    permissionKey: PERM.VIEW,
    facilityId: input.facilityId,
  });
  if (!authz.ok) {
    return { ok: false, code: RESULT.ACCESS_DENIED, encounters: [] };
  }

  const result = await db.query(
    `SELECT e.*,
            (p.first_name || ' ' || p.last_name) AS patient_display_name,
            p.patient_number,
            s.display_name AS opened_by_staff_display_name
       FROM activeclinic.encounters e
       JOIN activeclinic.patients p ON p.id = e.patient_id
       JOIN activeclinic.staff_members s ON s.id = e.opened_by_staff_id
      WHERE e.facility_id = $1
        AND e.status = 'open'
      ORDER BY e.opened_at DESC
      LIMIT 100`,
    [input.facilityId]
  );

  return {
    ok: true,
    code: RESULT.OK,
    encounters: result.rows.map(mapEncounter),
  };
}

/**
 * Get encounter by ID with authorization.
 */
async function getEncounterById(db, input) {
  const authz = await authorizeStaffPermission(db, {
    organizationId: input.organizationId,
    staffMemberId: input.actor.staffMemberId,
    platformIdentityId: input.actor.platformIdentityId,
    permissionKey: PERM.VIEW,
    facilityId: input.facilityId,
  });
  if (!authz.ok) {
    return { ok: false, code: RESULT.ACCESS_DENIED, encounter: null };
  }

  const result = await db.query(
    `SELECT e.*,
            (p.first_name || ' ' || p.last_name) AS patient_display_name,
            p.patient_number,
            s.display_name AS opened_by_staff_display_name
       FROM activeclinic.encounters e
       JOIN activeclinic.patients p ON p.id = e.patient_id
       JOIN activeclinic.staff_members s ON s.id = e.opened_by_staff_id
      WHERE e.id = $1
        AND e.facility_id = $2
        AND e.organization_id = $3`,
    [input.encounterId, input.facilityId, input.organizationId]
  );

  if (result.rows.length === 0) {
    return { ok: false, code: RESULT.ENCOUNTER_NOT_FOUND, encounter: null };
  }

  return { ok: true, code: RESULT.OK, encounter: mapEncounter(result.rows[0]) };
}

/**
 * Record or update triage assessment.
 */
async function recordTriageAssessment(db, input) {
  const authz = await authorizeStaffPermission(db, {
    organizationId: input.organizationId,
    staffMemberId: input.actor.staffMemberId,
    platformIdentityId: input.actor.platformIdentityId,
    permissionKey: PERM.TRIAGE,
    facilityId: input.facilityId,
  });
  if (!authz.ok) {
    return { ok: false, code: RESULT.ACCESS_DENIED, triage: null };
  }

  const encounter = await getEncounterById(db, input);
  if (!encounter.ok) {
    return { ok: false, code: encounter.code, triage: null };
  }

  const existing = await db.query(
    `SELECT * FROM activeclinic.triage_assessments WHERE encounter_id = $1`,
    [input.encounterId]
  );

  let row;
  if (existing.rows.length === 0) {
    row = await db.query(
      `INSERT INTO activeclinic.triage_assessments (
         organization_id, healthcare_organization_id, facility_id, encounter_id, patient_id,
         triage_category, chief_complaint, presenting_symptoms, allergies_reported,
         current_medications_reported, medical_history_summary, pain_level, status,
         recorded_by_staff_id
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
       RETURNING *`,
      [
        input.organizationId,
        input.healthcareOrganizationId,
        input.facilityId,
        input.encounterId,
        encounter.encounter.patientId,
        input.triageCategory || null,
        input.chiefComplaint,
        input.presentingSymptoms || null,
        input.allergiesReported || null,
        input.currentMedicationsReported || null,
        input.medicalHistorySummary || null,
        input.painLevel || null,
        input.status || "draft",
        input.actor.staffMemberId,
      ]
    );

    await db.query(
      `INSERT INTO activeclinic.encounter_events (
         organization_id, healthcare_organization_id, encounter_id,
         event_type, actor_staff_id
       ) VALUES ($1, $2, $3, $4, $5)`,
      [
        input.organizationId,
        input.healthcareOrganizationId,
        input.encounterId,
        "triage_recorded",
        input.actor.staffMemberId,
      ]
    );
  } else {
    row = await db.query(
      `UPDATE activeclinic.triage_assessments
          SET triage_category = $1,
              chief_complaint = $2,
              presenting_symptoms = $3,
              allergies_reported = $4,
              current_medications_reported = $5,
              medical_history_summary = $6,
              pain_level = $7,
              status = $8,
              version = version + 1
        WHERE id = $9
          AND version = $10
       RETURNING *`,
      [
        input.triageCategory || null,
        input.chiefComplaint,
        input.presentingSymptoms || null,
        input.allergiesReported || null,
        input.currentMedicationsReported || null,
        input.medicalHistorySummary || null,
        input.painLevel || null,
        input.status || existing.rows[0].status,
        existing.rows[0].id,
        existing.rows[0].version,
      ]
    );

    if (row.rows.length === 0) {
      return { ok: false, code: RESULT.STALE_VERSION, triage: null };
    }
  }

  await recordAuditEventSafe(db, {
    deploymentCode: input.deploymentCode || CODE_ACTIVECLINIC_ORG_V6,
    organizationId: input.organizationId,
    actorUserId: input.actor.platformIdentityId || null,
    actionKey: "activeclinic.triage.recorded",
    entityType: "triage_assessment",
    entityId: row.rows[0].id,
    outcome: "success",
    metadataJson: {
      encounter_id: input.encounterId,
      triage_category: input.triageCategory || null,
    },
  });

  return { ok: true, code: RESULT.OK, triage: mapTriageAssessment(row.rows[0]) };
}

/**
 * Record vital sign observation (immutable).
 */
async function recordVitalSignObservation(db, input) {
  const authz = await authorizeStaffPermission(db, {
    organizationId: input.organizationId,
    staffMemberId: input.actor.staffMemberId,
    platformIdentityId: input.actor.platformIdentityId,
    permissionKey: PERM.TRIAGE,
    facilityId: input.facilityId,
  });
  if (!authz.ok) {
    return { ok: false, code: RESULT.ACCESS_DENIED, observation: null };
  }

  const encounter = await getEncounterById(db, input);
  if (!encounter.ok) {
    return { ok: false, code: encounter.code, observation: null };
  }

  const row = await db.query(
    `INSERT INTO activeclinic.vital_sign_observations (
       organization_id, healthcare_organization_id, facility_id, encounter_id, patient_id,
       observation_type, value_numeric, value_text, unit, systolic, diastolic,
       observed_at, recorded_by_staff_id, corrects_observation_id, correction_reason
     ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
     RETURNING *`,
    [
      input.organizationId,
      input.healthcareOrganizationId,
      input.facilityId,
      input.encounterId,
      encounter.encounter.patientId,
      input.observationType,
      input.valueNumeric || null,
      input.valueText || null,
      input.unit || null,
      input.systolic || null,
      input.diastolic || null,
      input.observedAt || new Date(),
      input.actor.staffMemberId,
      input.correctsObservationId || null,
      input.correctionReason || null,
    ]
  );

  await db.query(
    `INSERT INTO activeclinic.encounter_events (
       organization_id, healthcare_organization_id, encounter_id,
       event_type, actor_staff_id
     ) VALUES ($1, $2, $3, $4, $5)`,
    [
      input.organizationId,
      input.healthcareOrganizationId,
      input.encounterId,
      "vitals_recorded",
      input.actor.staffMemberId,
    ]
  );

  await recordAuditEventSafe(db, {
    deploymentCode: input.deploymentCode || CODE_ACTIVECLINIC_ORG_V6,
    organizationId: input.organizationId,
    actorUserId: input.actor.platformIdentityId || null,
    actionKey: "activeclinic.vitals.recorded",
    entityType: "vital_sign_observation",
    entityId: row.rows[0].id,
    outcome: "success",
    metadataJson: {
      encounter_id: input.encounterId,
      observation_type: input.observationType,
    },
  });

  return { ok: true, code: RESULT.OK, observation: mapVitalSignObservation(row.rows[0]) };
}

/**
 * Record nursing intake note.
 */
async function recordNursingIntake(db, input) {
  const authz = await authorizeStaffPermission(db, {
    organizationId: input.organizationId,
    staffMemberId: input.actor.staffMemberId,
    platformIdentityId: input.actor.platformIdentityId,
    permissionKey: PERM.NURSING_INTAKE,
    facilityId: input.facilityId,
  });
  if (!authz.ok) {
    return { ok: false, code: RESULT.ACCESS_DENIED, nursingIntake: null };
  }

  const encounter = await getEncounterById(db, input);
  if (!encounter.ok) {
    return { ok: false, code: encounter.code, nursingIntake: null };
  }

  const row = await db.query(
    `INSERT INTO activeclinic.nursing_intake_notes (
       organization_id, healthcare_organization_id, facility_id, encounter_id, patient_id,
       intake_note_text, recorded_by_staff_id
     ) VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING *`,
    [
      input.organizationId,
      input.healthcareOrganizationId,
      input.facilityId,
      input.encounterId,
      encounter.encounter.patientId,
      input.intakeNoteText,
      input.actor.staffMemberId,
    ]
  );

  await db.query(
    `INSERT INTO activeclinic.encounter_events (
       organization_id, healthcare_organization_id, encounter_id,
       event_type, actor_staff_id
     ) VALUES ($1, $2, $3, $4, $5)`,
    [
      input.organizationId,
      input.healthcareOrganizationId,
      input.encounterId,
      "nursing_intake_recorded",
      input.actor.staffMemberId,
    ]
  );

  await recordAuditEventSafe(db, {
    deploymentCode: input.deploymentCode || CODE_ACTIVECLINIC_ORG_V6,
    organizationId: input.organizationId,
    actorUserId: input.actor.platformIdentityId || null,
    actionKey: "activeclinic.nursing_intake.recorded",
    entityType: "nursing_intake_note",
    entityId: row.rows[0].id,
    outcome: "success",
    metadataJson: {
      encounter_id: input.encounterId,
    },
  });

  return { ok: true, code: RESULT.OK, nursingIntake: row.rows[0] };
}

/**
 * List nursing intake notes for encounter.
 */
async function listNursingIntakesForEncounter(db, input) {
  const authz = await authorizeStaffPermission(db, {
    organizationId: input.organizationId,
    staffMemberId: input.actor.staffMemberId,
    platformIdentityId: input.actor.platformIdentityId,
    permissionKey: PERM.VIEW,
    facilityId: input.facilityId,
  });
  if (!authz.ok) {
    return { ok: false, code: RESULT.ACCESS_DENIED, nursingIntakes: [] };
  }

  const result = await db.query(
    `SELECT n.*, s.display_name AS recorded_by_staff_display_name
       FROM activeclinic.nursing_intake_notes n
       JOIN activeclinic.staff_members s ON s.id = n.recorded_by_staff_id
      WHERE n.encounter_id = $1
      ORDER BY n.created_at DESC`,
    [input.encounterId]
  );

  return {
    ok: true,
    code: RESULT.OK,
    nursingIntakes: result.rows,
  };
}

/**
 * List vital signs for encounter.
 */
async function listVitalSignsForEncounter(db, input) {
  const authz = await authorizeStaffPermission(db, {
    organizationId: input.organizationId,
    staffMemberId: input.actor.staffMemberId,
    platformIdentityId: input.actor.platformIdentityId,
    permissionKey: PERM.VIEW,
    facilityId: input.facilityId,
  });
  if (!authz.ok) {
    return { ok: false, code: RESULT.ACCESS_DENIED, observations: [] };
  }

  const result = await db.query(
    `SELECT v.*, s.display_name AS recorded_by_staff_display_name
       FROM activeclinic.vital_sign_observations v
       JOIN activeclinic.staff_members s ON s.id = v.recorded_by_staff_id
      WHERE v.encounter_id = $1
      ORDER BY v.observed_at DESC`,
    [input.encounterId]
  );

  return {
    ok: true,
    code: RESULT.OK,
    observations: result.rows.map(mapVitalSignObservation),
  };
}

/**
 * Create or update draft consultation note.
 */
async function recordConsultationNote(db, input) {
  const authz = await authorizeStaffPermission(db, {
    organizationId: input.organizationId,
    staffMemberId: input.actor.staffMemberId,
    platformIdentityId: input.actor.platformIdentityId,
    permissionKey: PERM.CONSULTATION_RECORD,
    facilityId: input.facilityId,
  });
  if (!authz.ok) {
    return { ok: false, code: RESULT.ACCESS_DENIED, consultation: null };
  }

  const encounter = await getEncounterById(db, input);
  if (!encounter.ok) {
    return { ok: false, code: encounter.code, consultation: null };
  }

  const existing = await db.query(
    `SELECT * FROM activeclinic.consultation_notes
     WHERE encounter_id = $1 AND status = 'draft'
     ORDER BY created_at DESC
     LIMIT 1`,
    [input.encounterId]
  );

  let row;
  if (existing.rows.length === 0) {
    row = await db.query(
      `INSERT INTO activeclinic.consultation_notes (
         organization_id, healthcare_organization_id, facility_id, encounter_id, patient_id,
         note_type, subjective_text, objective_text, assessment_text, plan_text,
         additional_notes, created_by_staff_id
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
       RETURNING *`,
      [
        input.organizationId,
        input.healthcareOrganizationId,
        input.facilityId,
        input.encounterId,
        encounter.encounter.patientId,
        input.noteType || "consultation",
        input.subjectiveText || null,
        input.objectiveText || null,
        input.assessmentText || null,
        input.planText || null,
        input.additionalNotes || null,
        input.actor.staffMemberId,
      ]
    );

    await db.query(
      `INSERT INTO activeclinic.encounter_events (
         organization_id, healthcare_organization_id, encounter_id,
         event_type, actor_staff_id
       ) VALUES ($1, $2, $3, $4, $5)`,
      [
        input.organizationId,
        input.healthcareOrganizationId,
        input.encounterId,
        "consultation_started",
        input.actor.staffMemberId,
      ]
    );
  } else {
    if (existing.rows[0].status === "signed") {
      return { ok: false, code: RESULT.CANNOT_EDIT_SIGNED, consultation: null };
    }

    row = await db.query(
      `UPDATE activeclinic.consultation_notes
          SET subjective_text = $1,
              objective_text = $2,
              assessment_text = $3,
              plan_text = $4,
              additional_notes = $5,
              version = version + 1
        WHERE id = $6
          AND version = $7
       RETURNING *`,
      [
        input.subjectiveText || null,
        input.objectiveText || null,
        input.assessmentText || null,
        input.planText || null,
        input.additionalNotes || null,
        existing.rows[0].id,
        existing.rows[0].version,
      ]
    );

    if (row.rows.length === 0) {
      return { ok: false, code: RESULT.STALE_VERSION, consultation: null };
    }
  }

  await recordAuditEventSafe(db, {
    deploymentCode: input.deploymentCode || CODE_ACTIVECLINIC_ORG_V6,
    organizationId: input.organizationId,
    actorUserId: input.actor.platformIdentityId || null,
    actionKey: "activeclinic.consultation.recorded",
    entityType: "consultation_note",
    entityId: row.rows[0].id,
    outcome: "success",
    metadataJson: {
      encounter_id: input.encounterId,
      note_type: input.noteType || "consultation",
    },
  });

  return { ok: true, code: RESULT.OK, consultation: mapConsultationNote(row.rows[0]) };
}

/**
 * Sign consultation note (finalize).
 */
async function signConsultationNote(db, input) {
  const authz = await authorizeStaffPermission(db, {
    organizationId: input.organizationId,
    staffMemberId: input.actor.staffMemberId,
    platformIdentityId: input.actor.platformIdentityId,
    permissionKey: PERM.CONSULTATION_SIGN,
    facilityId: input.facilityId,
  });
  if (!authz.ok) {
    return { ok: false, code: RESULT.ACCESS_DENIED, consultation: null };
  }

  const existing = await db.query(
    `SELECT * FROM activeclinic.consultation_notes WHERE id = $1`,
    [input.consultationNoteId]
  );
  if (existing.rows.length === 0) {
    return { ok: false, code: RESULT.CONSULTATION_NOT_FOUND, consultation: null };
  }

  if (existing.rows[0].status === "signed") {
    return { ok: false, code: RESULT.CANNOT_EDIT_SIGNED, consultation: null };
  }

  const row = await db.query(
    `UPDATE activeclinic.consultation_notes
        SET status = 'signed',
            signed_at = now(),
            signed_by_staff_id = $1,
            version = version + 1
      WHERE id = $2
        AND version = $3
     RETURNING *`,
    [input.actor.staffMemberId, input.consultationNoteId, existing.rows[0].version]
  );

  if (row.rows.length === 0) {
    return { ok: false, code: RESULT.STALE_VERSION, consultation: null };
  }

  await db.query(
    `INSERT INTO activeclinic.encounter_events (
       organization_id, healthcare_organization_id, encounter_id,
       event_type, actor_staff_id
     ) VALUES ($1, $2, $3, $4, $5)`,
    [
      input.organizationId,
      input.healthcareOrganizationId,
      existing.rows[0].encounter_id,
      "consultation_signed",
      input.actor.staffMemberId,
    ]
  );

  await recordAuditEventSafe(db, {
    deploymentCode: input.deploymentCode || CODE_ACTIVECLINIC_ORG_V6,
    organizationId: input.organizationId,
    actorUserId: input.actor.platformIdentityId || null,
    actionKey: "activeclinic.consultation.signed",
    entityType: "consultation_note",
    entityId: input.consultationNoteId,
    outcome: "success",
    metadataJson: {
      encounter_id: existing.rows[0].encounter_id,
    },
  });

  return { ok: true, code: RESULT.OK, consultation: mapConsultationNote(row.rows[0]) };
}

/**
 * Create clinical order (lab/prescription/radiology).
 */
async function createClinicalOrder(db, input) {
  const authz = await authorizeStaffPermission(db, {
    organizationId: input.organizationId,
    staffMemberId: input.actor.staffMemberId,
    platformIdentityId: input.actor.platformIdentityId,
    permissionKey: PERM.ORDER_CREATE,
    facilityId: input.facilityId,
  });
  if (!authz.ok) {
    return { ok: false, code: RESULT.ACCESS_DENIED, order: null };
  }

  const encounter = await getEncounterById(db, input);
  if (!encounter.ok) {
    return { ok: false, code: encounter.code, order: null };
  }

  const row = await db.query(
    `INSERT INTO activeclinic.clinical_orders (
       organization_id, healthcare_organization_id, facility_id, encounter_id, patient_id,
       order_type, order_details, instructions, ordered_by_staff_id
     ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
     RETURNING *`,
    [
      input.organizationId,
      input.healthcareOrganizationId,
      input.facilityId,
      input.encounterId,
      encounter.encounter.patientId,
      input.orderType,
      JSON.stringify(input.orderDetails || {}),
      input.instructions || null,
      input.actor.staffMemberId,
    ]
  );

  await db.query(
    `INSERT INTO activeclinic.encounter_events (
       organization_id, healthcare_organization_id, encounter_id,
       event_type, actor_staff_id
     ) VALUES ($1, $2, $3, $4, $5)`,
    [
      input.organizationId,
      input.healthcareOrganizationId,
      input.encounterId,
      "order_created",
      input.actor.staffMemberId,
    ]
  );

  const diagnosticRequest = await createDiagnosticFulfillmentFromClinicalOrder(db, {
    orderType: input.orderType,
    orderRow: row.rows[0],
    orderDetails: input.orderDetails,
    instructions: input.instructions || null,
    actor: input.actor,
  });

  await recordAuditEventSafe(db, {
    deploymentCode: input.deploymentCode || CODE_ACTIVECLINIC_ORG_V6,
    organizationId: input.organizationId,
    actorUserId: input.actor.platformIdentityId || null,
    actionKey: "activeclinic.clinical_order.created",
    entityType: "clinical_order",
    entityId: row.rows[0].id,
    outcome: "success",
    metadataJson: {
      encounter_id: input.encounterId,
      order_type: input.orderType,
      diagnostic_request_id: diagnosticRequest && diagnosticRequest.id ? diagnosticRequest.id : null,
    },
  });

  return {
    ok: true,
    code: RESULT.OK,
    order: mapClinicalOrder(row.rows[0]),
    diagnosticRequest,
  };
}

/**
 * Record clinical diagnosis.
 */
async function recordClinicalDiagnosis(db, input) {
  const authz = await authorizeStaffPermission(db, {
    organizationId: input.organizationId,
    staffMemberId: input.actor.staffMemberId,
    platformIdentityId: input.actor.platformIdentityId,
    permissionKey: PERM.DIAGNOSIS_RECORD,
    facilityId: input.facilityId,
  });
  if (!authz.ok) {
    return { ok: false, code: RESULT.ACCESS_DENIED, diagnosis: null };
  }

  const encounter = await getEncounterById(db, input);
  if (!encounter.ok) {
    return { ok: false, code: encounter.code, diagnosis: null };
  }

  const row = await db.query(
    `INSERT INTO activeclinic.clinical_diagnoses (
       organization_id, healthcare_organization_id, facility_id, encounter_id, patient_id,
       diagnosis_code, diagnosis_text, diagnosis_type, certainty, recorded_by_staff_id,
       corrects_diagnosis_id
     ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
     RETURNING *`,
    [
      input.organizationId,
      input.healthcareOrganizationId,
      input.facilityId,
      input.encounterId,
      encounter.encounter.patientId,
      input.diagnosisCode || null,
      input.diagnosisText,
      input.diagnosisType || "primary",
      input.certainty || null,
      input.actor.staffMemberId,
      input.correctsDiagnosisId || null,
    ]
  );

  await db.query(
    `INSERT INTO activeclinic.encounter_events (
       organization_id, healthcare_organization_id, encounter_id,
       event_type, actor_staff_id
     ) VALUES ($1, $2, $3, $4, $5)`,
    [
      input.organizationId,
      input.healthcareOrganizationId,
      input.encounterId,
      "diagnosis_recorded",
      input.actor.staffMemberId,
    ]
  );

  await recordAuditEventSafe(db, {
    deploymentCode: input.deploymentCode || CODE_ACTIVECLINIC_ORG_V6,
    organizationId: input.organizationId,
    actorUserId: input.actor.platformIdentityId || null,
    actionKey: "activeclinic.diagnosis.recorded",
    entityType: "clinical_diagnosis",
    entityId: row.rows[0].id,
    outcome: "success",
    metadataJson: {
      encounter_id: input.encounterId,
      diagnosis_type: input.diagnosisType || "primary",
    },
  });

  return { ok: true, code: RESULT.OK, diagnosis: row.rows[0] };
}

/**
 * List clinical diagnoses for encounter.
 */
async function listDiagnosesForEncounter(db, input) {
  const authz = await authorizeStaffPermission(db, {
    organizationId: input.organizationId,
    staffMemberId: input.actor.staffMemberId,
    platformIdentityId: input.actor.platformIdentityId,
    permissionKey: PERM.VIEW,
    facilityId: input.facilityId,
  });
  if (!authz.ok) {
    return { ok: false, code: RESULT.ACCESS_DENIED, diagnoses: [] };
  }

  const result = await db.query(
    `SELECT d.*, s.display_name AS recorded_by_staff_display_name
       FROM activeclinic.clinical_diagnoses d
       JOIN activeclinic.staff_members s ON s.id = d.recorded_by_staff_id
      WHERE d.encounter_id = $1
      ORDER BY d.created_at DESC`,
    [input.encounterId]
  );

  return {
    ok: true,
    code: RESULT.OK,
    diagnoses: result.rows,
  };
}

/**
 * Raise clinical alert (manual only).
 */
async function raiseClinicalAlert(db, input) {
  const authz = await authorizeStaffPermission(db, {
    organizationId: input.organizationId,
    staffMemberId: input.actor.staffMemberId,
    platformIdentityId: input.actor.platformIdentityId,
    permissionKey: PERM.ALERT_RAISE,
    facilityId: input.facilityId,
  });
  if (!authz.ok) {
    return { ok: false, code: RESULT.ACCESS_DENIED, alert: null };
  }

  const row = await db.query(
    `INSERT INTO activeclinic.clinical_alerts (
       organization_id, healthcare_organization_id, facility_id, encounter_id, patient_id,
       alert_type, alert_message, priority, raised_by_staff_id
     ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
     RETURNING *`,
    [
      input.organizationId,
      input.healthcareOrganizationId,
      input.facilityId,
      input.encounterId || null,
      input.patientId,
      input.alertType,
      input.alertMessage,
      input.priority || "medium",
      input.actor.staffMemberId,
    ]
  );

  if (input.encounterId) {
    await db.query(
      `INSERT INTO activeclinic.encounter_events (
         organization_id, healthcare_organization_id, encounter_id,
         event_type, actor_staff_id
       ) VALUES ($1, $2, $3, $4, $5)`,
      [
        input.organizationId,
        input.healthcareOrganizationId,
        input.encounterId,
        "alert_raised",
        input.actor.staffMemberId,
      ]
    );
  }

  await recordAuditEventSafe(db, {
    deploymentCode: input.deploymentCode || CODE_ACTIVECLINIC_ORG_V6,
    organizationId: input.organizationId,
    actorUserId: input.actor.platformIdentityId || null,
    actionKey: "activeclinic.clinical_alert.raised",
    entityType: "clinical_alert",
    entityId: row.rows[0].id,
    outcome: "success",
    metadataJson: {
      alert_type: input.alertType,
      priority: input.priority || "medium",
      patient_id: input.patientId,
    },
  });

  return { ok: true, code: RESULT.OK, alert: mapClinicalAlert(row.rows[0]) };
}

/**
 * List active clinical alerts for facility.
 */
async function listActiveAlertsForFacility(db, input) {
  const authz = await authorizeStaffPermission(db, {
    organizationId: input.organizationId,
    staffMemberId: input.actor.staffMemberId,
    platformIdentityId: input.actor.platformIdentityId,
    permissionKey: PERM.ALERT_VIEW,
    facilityId: input.facilityId,
  });
  if (!authz.ok) {
    return { ok: false, code: RESULT.ACCESS_DENIED, alerts: [] };
  }

  const result = await db.query(
    `SELECT a.*,
            (p.first_name || ' ' || p.last_name) AS patient_display_name,
            s.display_name AS raised_by_staff_display_name
       FROM activeclinic.clinical_alerts a
       JOIN activeclinic.patients p ON p.id = a.patient_id
       JOIN activeclinic.staff_members s ON s.id = a.raised_by_staff_id
      WHERE a.facility_id = $1
        AND a.status = 'active'
      ORDER BY a.priority DESC, a.created_at DESC
      LIMIT 50`,
    [input.facilityId]
  );

  return {
    ok: true,
    code: RESULT.OK,
    alerts: result.rows.map(mapClinicalAlert),
  };
}

/**
 * Close encounter.
 */
async function closeEncounter(db, input) {
  const authz = await authorizeStaffPermission(db, {
    organizationId: input.organizationId,
    staffMemberId: input.actor.staffMemberId,
    platformIdentityId: input.actor.platformIdentityId,
    permissionKey: PERM.MANAGE,
    facilityId: input.facilityId,
  });
  if (!authz.ok) {
    return { ok: false, code: RESULT.ACCESS_DENIED, encounter: null };
  }

  const row = await db.query(
    `UPDATE activeclinic.encounters
        SET status = 'completed',
            closed_at = now(),
            closed_by_staff_id = $1,
            closure_note = $2,
            version = version + 1
      WHERE id = $3
        AND facility_id = $4
        AND status = 'open'
        AND version = $5
     RETURNING *`,
    [
      input.actor.staffMemberId,
      input.closureNote || null,
      input.encounterId,
      input.facilityId,
      input.version,
    ]
  );

  if (row.rows.length === 0) {
    return { ok: false, code: RESULT.STALE_VERSION, encounter: null };
  }

  await db.query(
    `INSERT INTO activeclinic.encounter_events (
       organization_id, healthcare_organization_id, encounter_id,
       event_type, actor_staff_id
     ) VALUES ($1, $2, $3, $4, $5)`,
    [
      input.organizationId,
      input.healthcareOrganizationId,
      input.encounterId,
      "closed",
      input.actor.staffMemberId,
    ]
  );

  await recordAuditEventSafe(db, {
    deploymentCode: input.deploymentCode || CODE_ACTIVECLINIC_ORG_V6,
    organizationId: input.organizationId,
    actorUserId: input.actor.platformIdentityId || null,
    actionKey: "activeclinic.encounter.closed",
    entityType: "encounter",
    entityId: input.encounterId,
    outcome: "success",
    metadataJson: {
      facility_id: input.facilityId,
    },
  });

  return { ok: true, code: RESULT.OK, encounter: mapEncounter(row.rows[0]) };
}

module.exports = {
  RESULT,
  PERM,
  startEncounter,
  listOpenEncounters,
  getEncounterById,
  recordTriageAssessment,
  recordVitalSignObservation,
  listVitalSignsForEncounter,
  recordNursingIntake,
  listNursingIntakesForEncounter,
  recordConsultationNote,
  signConsultationNote,
  recordClinicalDiagnosis,
  listDiagnosesForEncounter,
  createClinicalOrder,
  raiseClinicalAlert,
  listActiveAlertsForFacility,
  closeEncounter,
};
