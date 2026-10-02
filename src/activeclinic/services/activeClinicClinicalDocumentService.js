"use strict";

/**
 * ActiveClinic ACN18 Clinical Documents service.
 * PHI domain. Draft/final lifecycle. No binary attachments (private storage deferred).
 */

const repo = require("../repositories/clinicalDocumentRepository");
const facilityRepo = require("../repositories/facilityRepository");
const {
  getPatientByOrgAndId,
} = require("./activeClinicPatientService");
const { recordAuditEventSafe } = require("../../platform/services/auditEventService");

const DOCUMENT_TYPES = Object.freeze([
  "clinical_note",
  "medical_certificate",
  "referral_letter",
  "discharge_summary",
  "clinical_attachment",
  "other",
]);

const DOCUMENT_TYPE_LABELS = Object.freeze({
  clinical_note: "Clinical note",
  medical_certificate: "Medical certificate",
  referral_letter: "Referral letter",
  discharge_summary: "Discharge summary",
  clinical_attachment: "Clinical attachment",
  other: "Other",
});

const STATUSES = Object.freeze(["draft", "final"]);

const STATUS_LABELS = Object.freeze({
  draft: "Draft",
  final: "Final",
});

const PERM = Object.freeze({
  VIEW: "activeclinic.clinical_document.view",
  CREATE: "activeclinic.clinical_document.create",
  FINALIZE: "activeclinic.clinical_document.finalize",
});

const RESULT = Object.freeze({
  OK: "ok",
  INVALID_INPUT: "invalid_input",
  INVALID_TYPE: "invalid_document_type",
  ORGANIZATION_REQUIRED: "organization_required",
  FACILITY_NOT_FOUND: "facility_not_found",
  FACILITY_MISMATCH: "facility_ownership_mismatch",
  PATIENT_NOT_FOUND: "patient_not_found",
  ENCOUNTER_NOT_FOUND: "encounter_not_found",
  ENCOUNTER_MISMATCH: "encounter_scope_mismatch",
  NOT_FOUND: "document_not_found",
  NOT_DRAFT: "document_not_draft",
  FINAL_IMMUTABLE: "document_final_immutable",
  STAFF_REQUIRED: "staff_required",
});

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function staffName(first, last) {
  return [first, last].filter(Boolean).join(" ").trim() || null;
}

function mapDocument(row) {
  if (!row) return null;
  return {
    id: row.id,
    organizationId: row.organization_id,
    healthcareOrganizationId: row.healthcare_organization_id,
    facilityId: row.facility_id,
    facilityDisplayName: row.facility_display_name || null,
    patientId: row.patient_id,
    patientNumber: row.patient_number || null,
    patientDisplayName: staffName(row.patient_first_name, row.patient_last_name),
    encounterId: row.encounter_id || null,
    encounterNumber: row.encounter_number || null,
    documentType: row.document_type,
    documentTypeLabel: DOCUMENT_TYPE_LABELS[row.document_type] || row.document_type,
    title: row.title,
    bodyText: row.body_text || null,
    documentDate: row.document_date || null,
    status: row.status,
    statusLabel: STATUS_LABELS[row.status] || row.status,
    createdByStaffId: row.created_by_staff_id,
    createdByName: staffName(row.created_by_first_name, row.created_by_last_name),
    finalizedByStaffId: row.finalized_by_staff_id || null,
    finalizedByName: staffName(row.finalized_by_first_name, row.finalized_by_last_name),
    finalizedAt: row.finalized_at || null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    isDraft: row.status === "draft",
    isFinal: row.status === "final",
  };
}

function mapEvent(row) {
  if (!row) return null;
  return {
    id: row.id,
    eventType: row.event_type,
    actorStaffId: row.actor_staff_id || null,
    actorName: staffName(row.actor_first_name, row.actor_last_name),
    detailJson: row.detail_json || {},
    createdAt: row.created_at,
  };
}

function trimRequired(value, max) {
  const text = String(value == null ? "" : value).trim();
  if (!text || text.length > max) return null;
  return text;
}

function trimOptional(value, max) {
  if (value == null || String(value).trim() === "") return null;
  const text = String(value).trim();
  if (text.length > max) return null;
  return text;
}

function parseDocumentDate(raw) {
  if (raw == null || String(raw).trim() === "") return null;
  const text = String(raw).trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return null;
  const d = new Date(`${text}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return null;
  return text;
}

async function requireOrgPatient(db, { organizationId, patientId }) {
  if (!organizationId || !UUID_RE.test(organizationId)) {
    return { ok: false, code: RESULT.ORGANIZATION_REQUIRED };
  }
  if (!patientId || !UUID_RE.test(patientId)) {
    return { ok: false, code: RESULT.INVALID_INPUT };
  }
  const got = await getPatientByOrgAndId(db, {
    organizationId,
    patientId,
  });
  if (!got || !got.ok || !got.patient) {
    return { ok: false, code: RESULT.PATIENT_NOT_FOUND };
  }
  return { ok: true, patient: got.patient };
}

async function requireOrgFacility(db, { organizationId, facilityId }) {
  if (!facilityId || !UUID_RE.test(facilityId)) {
    return { ok: false, code: RESULT.INVALID_INPUT };
  }
  const facility = await facilityRepo.findByIdAndOrganization(db, {
    id: facilityId,
    organizationId,
  });
  if (!facility) {
    return { ok: false, code: RESULT.FACILITY_NOT_FOUND };
  }
  if (String(facility.organization_id) !== String(organizationId)) {
    return { ok: false, code: RESULT.FACILITY_MISMATCH };
  }
  return { ok: true, facility };
}

async function resolveOptionalEncounter(db, {
  organizationId,
  patientId,
  facilityId,
  encounterId,
}) {
  if (encounterId == null || String(encounterId).trim() === "") {
    return { ok: true, encounterId: null };
  }
  if (!UUID_RE.test(String(encounterId))) {
    return { ok: false, code: RESULT.INVALID_INPUT };
  }
  const r = await db.query(
    `SELECT id, patient_id, facility_id, organization_id, healthcare_organization_id
       FROM activeclinic.encounters
      WHERE id = $1
        AND organization_id = $2`,
    [encounterId, organizationId]
  );
  const enc = r.rows[0];
  if (!enc) {
    return { ok: false, code: RESULT.ENCOUNTER_NOT_FOUND };
  }
  if (String(enc.patient_id) !== String(patientId)) {
    return { ok: false, code: RESULT.ENCOUNTER_MISMATCH };
  }
  if (String(enc.facility_id) !== String(facilityId)) {
    return { ok: false, code: RESULT.ENCOUNTER_MISMATCH };
  }
  return { ok: true, encounterId: enc.id };
}

async function writeEventAndAudit(db, {
  organizationId,
  documentId,
  eventType,
  actor,
  detailJson,
  actionKey,
}) {
  await repo.insertEvent(db, {
    organizationId,
    documentId,
    eventType,
    actorStaffId: actor && actor.staffMemberId,
    actorPlatformIdentityId: actor && actor.platformIdentityId,
    detailJson,
  });
  await recordAuditEventSafe(db, {
    organizationId,
    actorPlatformIdentityId: actor && actor.platformIdentityId,
    actorUserId: actor && actor.platformIdentityId,
    actionKey: actionKey || `activeclinic.clinical_document.${eventType}`,
    entityType: "clinical_document",
    entityId: documentId,
    detailJson: detailJson || {},
  });
}

/**
 * @param {{ query: Function }} db
 * @param {object} input
 */
async function createClinicalDocument(db, input) {
  const organizationId = input && input.organizationId;
  const patientGate = await requireOrgPatient(db, {
    organizationId,
    patientId: input && input.patientId,
  });
  if (!patientGate.ok) return patientGate;

  const facilityGate = await requireOrgFacility(db, {
    organizationId,
    facilityId: input.facilityId,
  });
  if (!facilityGate.ok) return facilityGate;

  const staffId = input.actor && input.actor.staffMemberId;
  if (!staffId || !UUID_RE.test(staffId)) {
    return { ok: false, code: RESULT.STAFF_REQUIRED };
  }

  const title = trimRequired(input.title, 200);
  const documentType = String(input.documentType || "").trim();
  const bodyText = trimOptional(input.bodyText, 20000);
  const documentDate = parseDocumentDate(input.documentDate);

  if (!title) return { ok: false, code: RESULT.INVALID_INPUT };
  if (!DOCUMENT_TYPES.includes(documentType)) {
    return { ok: false, code: RESULT.INVALID_TYPE };
  }
  if (input.documentDate && !documentDate) {
    return { ok: false, code: RESULT.INVALID_INPUT };
  }

  const encGate = await resolveOptionalEncounter(db, {
    organizationId,
    patientId: patientGate.patient.id,
    facilityId: facilityGate.facility.id,
    encounterId: input.encounterId,
  });
  if (!encGate.ok) return encGate;

  let row;
  try {
    row = await repo.insertDocument(db, {
      organizationId,
      healthcareOrganizationId: facilityGate.facility.healthcare_organization_id,
      facilityId: facilityGate.facility.id,
      patientId: patientGate.patient.id,
      encounterId: encGate.encounterId,
      documentType,
      title,
      bodyText,
      documentDate,
      createdByStaffId: staffId,
    });
  } catch (err) {
    if (err && err.code === "23514") {
      return { ok: false, code: RESULT.INVALID_INPUT };
    }
    throw err;
  }

  await writeEventAndAudit(db, {
    organizationId,
    documentId: row.id,
    eventType: "created",
    actor: input.actor,
    detailJson: { status: "draft", documentType, title },
  });

  const loaded = await repo.findByIdAndOrganization(db, {
    id: row.id,
    organizationId,
  });
  return { ok: true, code: RESULT.OK, document: mapDocument(loaded) };
}

async function updateClinicalDocumentDraft(db, input) {
  const organizationId = input && input.organizationId;
  const documentId = input && input.documentId;
  if (!organizationId || !UUID_RE.test(organizationId)) {
    return { ok: false, code: RESULT.ORGANIZATION_REQUIRED };
  }
  if (!documentId || !UUID_RE.test(documentId)) {
    return { ok: false, code: RESULT.INVALID_INPUT };
  }

  const existing = await repo.findByIdAndOrganization(db, {
    id: documentId,
    organizationId,
  });
  if (!existing) return { ok: false, code: RESULT.NOT_FOUND };
  if (existing.status !== "draft") {
    return { ok: false, code: RESULT.FINAL_IMMUTABLE };
  }

  // Patient scope: if caller provides patientId, must match
  if (input.patientId && String(input.patientId) !== String(existing.patient_id)) {
    return { ok: false, code: RESULT.PATIENT_NOT_FOUND };
  }

  const title = trimRequired(input.title, 200);
  const documentType = String(input.documentType || "").trim();
  const bodyText = trimOptional(input.bodyText, 20000);
  const documentDate = parseDocumentDate(input.documentDate);

  if (!title) return { ok: false, code: RESULT.INVALID_INPUT };
  if (!DOCUMENT_TYPES.includes(documentType)) {
    return { ok: false, code: RESULT.INVALID_TYPE };
  }
  if (input.documentDate && !documentDate) {
    return { ok: false, code: RESULT.INVALID_INPUT };
  }

  const encGate = await resolveOptionalEncounter(db, {
    organizationId,
    patientId: existing.patient_id,
    facilityId: existing.facility_id,
    encounterId: input.encounterId,
  });
  if (!encGate.ok) return encGate;

  const updated = await repo.updateDraftDocument(db, {
    id: existing.id,
    organizationId,
    patientId: existing.patient_id,
    encounterId: encGate.encounterId,
    documentType,
    title,
    bodyText,
    documentDate,
  });
  if (!updated) {
    return { ok: false, code: RESULT.FINAL_IMMUTABLE };
  }

  await writeEventAndAudit(db, {
    organizationId,
    documentId: existing.id,
    eventType: "updated",
    actor: input.actor,
    detailJson: { status: "draft", documentType, title },
  });

  const loaded = await repo.findByIdAndOrganization(db, {
    id: existing.id,
    organizationId,
  });
  return { ok: true, code: RESULT.OK, document: mapDocument(loaded) };
}

async function finalizeClinicalDocument(db, input) {
  const organizationId = input && input.organizationId;
  const documentId = input && input.documentId;
  const staffId = input.actor && input.actor.staffMemberId;

  if (!organizationId || !UUID_RE.test(organizationId)) {
    return { ok: false, code: RESULT.ORGANIZATION_REQUIRED };
  }
  if (!documentId || !UUID_RE.test(documentId)) {
    return { ok: false, code: RESULT.INVALID_INPUT };
  }
  if (!staffId || !UUID_RE.test(staffId)) {
    return { ok: false, code: RESULT.STAFF_REQUIRED };
  }

  const existing = await repo.findByIdAndOrganization(db, {
    id: documentId,
    organizationId,
  });
  if (!existing) return { ok: false, code: RESULT.NOT_FOUND };
  if (input.patientId && String(input.patientId) !== String(existing.patient_id)) {
    return { ok: false, code: RESULT.PATIENT_NOT_FOUND };
  }
  if (existing.status !== "draft") {
    return { ok: false, code: RESULT.NOT_DRAFT };
  }

  const finalized = await repo.finalizeDocument(db, {
    id: existing.id,
    organizationId,
    patientId: existing.patient_id,
    finalizedByStaffId: staffId,
  });
  if (!finalized) {
    return { ok: false, code: RESULT.NOT_DRAFT };
  }

  await writeEventAndAudit(db, {
    organizationId,
    documentId: existing.id,
    eventType: "finalized",
    actor: input.actor,
    detailJson: { status: "final" },
  });

  const loaded = await repo.findByIdAndOrganization(db, {
    id: existing.id,
    organizationId,
  });
  return { ok: true, code: RESULT.OK, document: mapDocument(loaded) };
}

async function getClinicalDocument(db, input) {
  const organizationId = input && input.organizationId;
  const documentId = input && input.documentId;
  if (!organizationId || !UUID_RE.test(organizationId)) {
    return { ok: false, code: RESULT.ORGANIZATION_REQUIRED };
  }
  if (!documentId || !UUID_RE.test(documentId)) {
    return { ok: false, code: RESULT.INVALID_INPUT };
  }
  const row = await repo.findByIdAndOrganization(db, {
    id: documentId,
    organizationId,
  });
  if (!row) return { ok: false, code: RESULT.NOT_FOUND };
  if (input.patientId && String(input.patientId) !== String(row.patient_id)) {
    return { ok: false, code: RESULT.NOT_FOUND };
  }
  const events = await repo.listEvents(db, {
    organizationId,
    documentId: row.id,
  });
  return {
    ok: true,
    code: RESULT.OK,
    document: mapDocument(row),
    events: events.map(mapEvent),
  };
}

async function listClinicalDocuments(db, input) {
  const organizationId = input && input.organizationId;
  const patientGate = await requireOrgPatient(db, {
    organizationId,
    patientId: input && input.patientId,
  });
  if (!patientGate.ok) return patientGate;

  if (input.facilityId) {
    const facilityGate = await requireOrgFacility(db, {
      organizationId,
      facilityId: input.facilityId,
    });
    if (!facilityGate.ok) return facilityGate;
  }

  const rows = await repo.listForPatient(db, {
    organizationId,
    patientId: patientGate.patient.id,
    facilityId: input.facilityId || null,
    encounterId: input.encounterId || null,
    documentType: input.documentType || null,
    status: input.status || null,
    q: input.q || null,
    limit: input.limit,
  });

  return {
    ok: true,
    code: RESULT.OK,
    patient: patientGate.patient,
    documents: rows.map(mapDocument),
  };
}

async function listEncountersForDocumentForm(db, input) {
  const organizationId = input && input.organizationId;
  const patientGate = await requireOrgPatient(db, {
    organizationId,
    patientId: input && input.patientId,
  });
  if (!patientGate.ok) return patientGate;
  const rows = await repo.listPatientEncounters(db, {
    organizationId,
    patientId: patientGate.patient.id,
    facilityId: input.facilityId || null,
  });
  return {
    ok: true,
    code: RESULT.OK,
    encounters: rows.map((e) => ({
      id: e.id,
      encounterNumber: e.encounter_number,
      facilityId: e.facility_id,
      status: e.status,
      openedAt: e.opened_at,
    })),
  };
}

module.exports = {
  DOCUMENT_TYPES,
  DOCUMENT_TYPE_LABELS,
  STATUSES,
  STATUS_LABELS,
  PERM,
  RESULT,
  createClinicalDocument,
  updateClinicalDocumentDraft,
  finalizeClinicalDocument,
  getClinicalDocument,
  listClinicalDocuments,
  listEncountersForDocumentForm,
  mapDocument,
};
