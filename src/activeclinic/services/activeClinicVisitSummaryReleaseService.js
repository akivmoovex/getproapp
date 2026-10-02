"use strict";

/**
 * AC-P05 patient visit summary release service.
 * Explicit clinician release → immutable allowlisted snapshot.
 * Patient portal reads snapshots only (never raw consultation_notes).
 */

const repo = require("../repositories/patientVisitSummaryReleaseRepository");
const { recordAuditEventSafe } = require("../../platform/services/auditEventService");

const PERM = Object.freeze({
  RELEASE: "activeclinic.visit_summary.release",
});

const RESULT = Object.freeze({
  OK: "ok",
  INVALID_INPUT: "invalid_input",
  ORGANIZATION_REQUIRED: "organization_required",
  ENCOUNTER_NOT_FOUND: "encounter_not_found",
  ALREADY_RELEASED: "already_released",
  STAFF_REQUIRED: "staff_required",
  NOT_FOUND: "summary_not_found",
  ACCESS_DENIED: "access_denied",
  EMPTY_PROJECTION: "empty_patient_safe_projection",
});

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const SNAPSHOT_SCHEMA_VERSION = 1;

/**
 * Field classification (documented for AC-P05):
 * PATIENT_SAFE: visitDate, facilityDisplayName, practitionerDisplayName,
 *   serviceLabel, encounterNumber, encounterType, invoice ref
 * REQUIRES_EXPLICIT_PROJECTION: reasonForVisit (from signed subjective),
 *   assessmentSummary (signed assessment), careProvided (signed plan),
 *   medications (signed medication_text + prescription order labels),
 *   patientInstructions (release-form override only — never auto from chart),
 *   followUp (signed follow_up_plan_text)
 * INTERNAL_ONLY: raw consultation_notes rows, objective_text, additional_notes,
 *   referral_text, triage, vitals, diagnoses codes, clinical alerts, ACN18 docs,
 *   nursing intake, audit payloads
 */

function clip(value, max) {
  if (value == null) return null;
  const text = String(value).trim();
  if (!text) return null;
  return text.slice(0, max);
}

function staffName(first, last) {
  return [first, last].filter(Boolean).join(" ").trim() || null;
}

function toVisitDate(isoOrDate) {
  if (!isoOrDate) return null;
  const s = String(isoOrDate);
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 10);
}

function mapReleaseRow(row) {
  if (!row) return null;
  const snapshot =
    row.snapshot_json && typeof row.snapshot_json === "object"
      ? row.snapshot_json
      : {};
  return {
    id: row.id,
    organizationId: row.organization_id,
    healthcareOrganizationId: row.healthcare_organization_id,
    facilityId: row.facility_id,
    facilityDisplayName:
      row.facility_display_name || snapshot.facilityDisplayName || null,
    patientId: row.patient_id,
    patientNumber: row.patient_number || null,
    patientDisplayName: staffName(
      row.patient_first_name,
      row.patient_last_name
    ),
    encounterId: row.encounter_id,
    encounterNumber: row.encounter_number || snapshot.encounterNumber || null,
    snapshot,
    releasedByStaffId: row.released_by_staff_id,
    releasedByName: staffName(
      row.released_by_first_name,
      row.released_by_last_name
    ),
    releasedAt: row.released_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

async function loadSignedConsultation(db, { organizationId, encounterId }) {
  const r = await db.query(
    `SELECT cn.*,
            s.first_name AS created_by_first_name,
            s.last_name AS created_by_last_name,
            sg.first_name AS signed_by_first_name,
            sg.last_name AS signed_by_last_name
       FROM activeclinic.consultation_notes cn
       JOIN activeclinic.staff_members s ON s.id = cn.created_by_staff_id
       LEFT JOIN activeclinic.staff_members sg ON sg.id = cn.signed_by_staff_id
      WHERE cn.organization_id = $1
        AND cn.encounter_id = $2
        AND cn.status = 'signed'
      ORDER BY cn.signed_at DESC NULLS LAST, cn.created_at DESC
      LIMIT 1`,
    [organizationId, encounterId]
  );
  return r.rows[0] || null;
}

async function loadPrescriptionSummaries(db, { organizationId, encounterId }) {
  const r = await db.query(
    `SELECT order_details, instructions
       FROM activeclinic.clinical_orders
      WHERE organization_id = $1
        AND encounter_id = $2
        AND order_type = 'prescription'
        AND status <> 'cancelled'
      ORDER BY created_at ASC
      LIMIT 20`,
    [organizationId, encounterId]
  );
  const meds = [];
  for (const row of r.rows) {
    let details = row.order_details;
    if (typeof details === "string") {
      try {
        details = JSON.parse(details);
      } catch (_e) {
        details = {};
      }
    }
    details = details && typeof details === "object" ? details : {};
    const name =
      clip(details.medication_name || details.medicationName || details.drug, 200) ||
      clip(details.name, 200);
    const instructions =
      clip(row.instructions, 500) ||
      clip(details.directions || details.instructions || details.sig, 500);
    if (name || instructions) {
      meds.push({
        name: name || "Medication",
        instructions: instructions || null,
      });
    }
  }
  return meds;
}

async function loadPatientInvoice(db, { organizationId, patientId, facilityId }) {
  // Prefer recent patient-visible invoice at same facility; tenant_id = organization.
  const r = await db.query(
    `SELECT i.id, i.invoice_number, i.status, i.invoice_date
       FROM activeclinic.invoices i
      WHERE i.tenant_id = $1
        AND i.patient_id = $2
        AND i.facility_id = $3
        AND i.status IN ('pending', 'posted')
      ORDER BY i.invoice_date DESC NULLS LAST, i.created_at DESC
      LIMIT 1`,
    [organizationId, patientId, facilityId]
  );
  const row = r.rows[0];
  if (!row) return null;
  return {
    invoiceId: row.id,
    invoiceNumber: row.invoice_number,
    status: row.status,
    invoiceDate: row.invoice_date
      ? String(row.invoice_date).slice(0, 10)
      : null,
  };
}

/**
 * Build allowlisted patient-safe projection for preview / release.
 * Does not include raw note objects or internal fields.
 */
async function buildPatientSafeProjection(db, input) {
  const organizationId = input && input.organizationId;
  const encounterId = input && input.encounterId;
  if (!organizationId || !UUID_RE.test(organizationId)) {
    return { ok: false, code: RESULT.ORGANIZATION_REQUIRED };
  }
  if (!encounterId || !UUID_RE.test(encounterId)) {
    return { ok: false, code: RESULT.INVALID_INPUT };
  }

  // Always load encounter via org-scoped query (never trust body org; no patient portal path).
  const raw = await db.query(
    `SELECT e.*,
            f.display_name AS facility_display_name,
            p.first_name AS patient_first_name,
            p.last_name AS patient_last_name,
            p.patient_number,
            COALESCE(os.display_name,
              NULLIF(trim(both from coalesce(os.first_name,'') || ' ' || coalesce(os.last_name,'')), '')
            ) AS opened_by_staff_display_name
       FROM activeclinic.encounters e
       JOIN activeclinic.facilities f ON f.id = e.facility_id
       JOIN activeclinic.patients p ON p.id = e.patient_id
       JOIN activeclinic.staff_members os ON os.id = e.opened_by_staff_id
      WHERE e.id = $1
        AND e.organization_id = $2`,
    [encounterId, organizationId]
  );
  if (!raw.rows[0]) {
    return { ok: false, code: RESULT.ENCOUNTER_NOT_FOUND };
  }
  const row = raw.rows[0];
  const encounter = {
    id: row.id,
    organizationId: row.organization_id,
    healthcareOrganizationId: row.healthcare_organization_id,
    facilityId: row.facility_id,
    facilityDisplayName: row.facility_display_name,
    patientId: row.patient_id,
    patientNumber: row.patient_number,
    patientDisplayName: staffName(row.patient_first_name, row.patient_last_name),
    encounterNumber: row.encounter_number,
    encounterType: row.encounter_type,
    status: row.status,
    openedAt: row.opened_at,
    openedByStaffDisplayName: row.opened_by_staff_display_name || null,
  };

  const signed = await loadSignedConsultation(db, {
    organizationId,
    encounterId: encounter.id,
  });

  const practitioner =
    (signed &&
      staffName(signed.signed_by_first_name, signed.signed_by_last_name)) ||
    (signed &&
      staffName(signed.created_by_first_name, signed.created_by_last_name)) ||
    encounter.openedByStaffDisplayName ||
    encounter.openedByDisplayName ||
    null;

  const prescriptionMeds = await loadPrescriptionSummaries(db, {
    organizationId,
    encounterId: encounter.id,
  });

  const medications = [];
  const medText = signed ? clip(signed.medication_text, 2000) : null;
  if (medText) {
    medications.push({ name: "Reviewed medications", instructions: medText });
  }
  for (const m of prescriptionMeds) medications.push(m);

  const invoice = await loadPatientInvoice(db, {
    organizationId,
    patientId: encounter.patientId,
    facilityId: encounter.facilityId,
  });

  // Explicit overrides from clinician release form (already patient-facing text)
  const override = (input && input.overrides) || {};

  const snapshot = {
    schemaVersion: SNAPSHOT_SCHEMA_VERSION,
    visitDate:
      clip(override.visitDate, 10) ||
      toVisitDate(encounter.openedAt) ||
      toVisitDate(new Date().toISOString()),
    facilityDisplayName:
      clip(override.facilityDisplayName, 200) ||
      encounter.facilityDisplayName ||
      null,
    practitionerDisplayName:
      clip(override.practitionerDisplayName, 200) || practitioner,
    serviceLabel:
      clip(override.serviceLabel, 200) ||
      (encounter.encounterType
        ? String(encounter.encounterType).replace(/_/g, " ")
        : "Clinical visit"),
    encounterNumber: encounter.encounterNumber || null,
    encounterType: encounter.encounterType || null,
    reasonForVisit:
      clip(override.reasonForVisit, 2000) ||
      (signed ? clip(signed.subjective_text, 2000) : null),
    assessmentSummary:
      clip(override.assessmentSummary, 2000) ||
      (signed ? clip(signed.assessment_text, 2000) : null),
    careProvided:
      clip(override.careProvided, 2000) ||
      (signed ? clip(signed.plan_text, 2000) : null),
    medications: Array.isArray(override.medications)
      ? override.medications
      : medications,
    // Patient instructions require clinician release-form text (do not auto-copy
    // plan_text — that would duplicate careProvided / leak ambiguous chart text).
    patientInstructions: clip(override.patientInstructions, 2000),
    followUp:
      clip(override.followUp, 2000) ||
      (signed ? clip(signed.follow_up_plan_text, 2000) : null),
    invoice: invoice,
    // Explicitly NOT included: objective, additional_notes, referral_text,
    // vitals, triage, diagnoses, ACN18 documents, raw note ids
  };

  const hasContent = Boolean(
    snapshot.reasonForVisit ||
      snapshot.assessmentSummary ||
      snapshot.careProvided ||
      (snapshot.medications && snapshot.medications.length) ||
      snapshot.patientInstructions ||
      snapshot.followUp ||
      snapshot.practitionerDisplayName
  );

  return {
    ok: true,
    code: RESULT.OK,
    encounter,
    signedConsultationPresent: Boolean(signed),
    projection: snapshot,
    hasContent,
  };
}

async function releaseVisitSummary(db, input) {
  const organizationId = input && input.organizationId;
  const encounterId = input && input.encounterId;
  const staffId = input.actor && input.actor.staffMemberId;

  if (!organizationId || !UUID_RE.test(organizationId)) {
    return { ok: false, code: RESULT.ORGANIZATION_REQUIRED };
  }
  if (!encounterId || !UUID_RE.test(encounterId)) {
    return { ok: false, code: RESULT.INVALID_INPUT };
  }
  if (!staffId || !UUID_RE.test(staffId)) {
    return { ok: false, code: RESULT.STAFF_REQUIRED };
  }

  const existing = await repo.findByEncounter(db, {
    organizationId,
    encounterId,
  });
  if (existing) {
    return {
      ok: false,
      code: RESULT.ALREADY_RELEASED,
      release: mapReleaseRow(existing),
    };
  }

  const built = await buildPatientSafeProjection(db, input);
  if (!built.ok) return built;
  if (!built.hasContent) {
    return { ok: false, code: RESULT.EMPTY_PROJECTION, projection: built.projection };
  }

  const enc = built.encounter;
  let row;
  try {
    row = await repo.insertRelease(db, {
      organizationId,
      healthcareOrganizationId: enc.healthcareOrganizationId,
      facilityId: enc.facilityId,
      patientId: enc.patientId,
      encounterId: enc.id,
      snapshotJson: built.projection,
      releasedByStaffId: staffId,
    });
  } catch (err) {
    if (err && err.code === "23505") {
      return { ok: false, code: RESULT.ALREADY_RELEASED };
    }
    throw err;
  }

  await recordAuditEventSafe(db, {
    organizationId,
    actorPlatformIdentityId: input.actor && input.actor.platformIdentityId,
    actorUserId: input.actor && input.actor.platformIdentityId,
    actionKey: "activeclinic.visit_summary.released",
    entityType: "patient_visit_summary_release",
    entityId: row.id,
    detailJson: {
      encounterId: enc.id,
      patientId: enc.patientId,
      facilityId: enc.facilityId,
    },
  });

  const loaded = await repo.findByIdAndOrganization(db, {
    id: row.id,
    organizationId,
  });
  return { ok: true, code: RESULT.OK, release: mapReleaseRow(loaded) };
}

async function getReleaseForEncounter(db, { organizationId, encounterId }) {
  if (!organizationId || !UUID_RE.test(organizationId)) {
    return { ok: false, code: RESULT.ORGANIZATION_REQUIRED };
  }
  if (!encounterId || !UUID_RE.test(encounterId)) {
    return { ok: false, code: RESULT.INVALID_INPUT };
  }
  const row = await repo.findByEncounter(db, { organizationId, encounterId });
  if (!row) return { ok: false, code: RESULT.NOT_FOUND };
  return { ok: true, code: RESULT.OK, release: mapReleaseRow(row) };
}

async function getReleasedSummaryForPatient(db, input) {
  const organizationId = input && input.organizationId;
  const patientId = input && input.patientId;
  const summaryId = input && input.summaryId;
  if (!organizationId || !UUID_RE.test(organizationId)) {
    return { ok: false, code: RESULT.ORGANIZATION_REQUIRED };
  }
  if (!patientId || !UUID_RE.test(patientId)) {
    return { ok: false, code: RESULT.ACCESS_DENIED };
  }
  if (!summaryId || !UUID_RE.test(summaryId)) {
    return { ok: false, code: RESULT.NOT_FOUND };
  }
  const row = await repo.findByIdForPatient(db, {
    organizationId,
    patientId,
    summaryId,
  });
  if (!row) return { ok: false, code: RESULT.NOT_FOUND };
  return { ok: true, code: RESULT.OK, release: mapReleaseRow(row) };
}

async function listReleasedSummariesForPatient(db, input) {
  const organizationId = input && input.organizationId;
  const patientId = input && input.patientId;
  if (!organizationId || !UUID_RE.test(organizationId)) {
    return { ok: false, code: RESULT.ORGANIZATION_REQUIRED };
  }
  if (!patientId || !UUID_RE.test(patientId)) {
    return { ok: false, code: RESULT.ACCESS_DENIED };
  }
  const rows = await repo.listForPatient(db, {
    organizationId,
    patientId,
    limit: input.limit,
  });
  return {
    ok: true,
    code: RESULT.OK,
    releases: rows.map(mapReleaseRow),
  };
}

async function findReleaseLinkedToBooking(db, input) {
  const organizationId = input && input.organizationId;
  const patientId = input && input.patientId;
  const visitDate = toVisitDate(input.visitDate || input.preferredStartsAt);
  if (!organizationId || !patientId || !visitDate) {
    return { ok: true, code: RESULT.OK, release: null };
  }
  const row = await repo.findForPatientOnVisitDate(db, {
    organizationId,
    patientId,
    visitDate,
  });
  return {
    ok: true,
    code: RESULT.OK,
    release: row ? mapReleaseRow(row) : null,
  };
}

module.exports = {
  PERM,
  RESULT,
  SNAPSHOT_SCHEMA_VERSION,
  buildPatientSafeProjection,
  releaseVisitSummary,
  getReleaseForEncounter,
  getReleasedSummaryForPatient,
  listReleasedSummariesForPatient,
  findReleaseLinkedToBooking,
  mapReleaseRow,
};
