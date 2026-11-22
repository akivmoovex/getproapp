"use strict";

/**
 * Record-migration inventory. Binary file bytes stay deferred.
 * Digitisation does not authorize destruction of paper records.
 */

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const IMPORT_PERMISSION = "activeclinic.clinical_document.create";

const RESULT = Object.freeze({
  OK: "ok",
  INVALID_INPUT: "invalid_input",
  ACCESS_DENIED: "access_denied",
  BINARY_STORAGE_DEFERRED: "binary_storage_deferred",
  CATEGORY_NOT_APPROVED: "category_not_approved",
  LEGAL_APPROVAL_REQUIRED: "legal_approval_required",
});

function classifyRecordOrigin(value) {
  const raw = String(value || "").trim();
  if (raw === "clinician_authored" || raw === "imported") return raw;
  return null;
}

function reviewMigrationPatientMatch(matches) {
  const list = Array.isArray(matches) ? matches.filter(Boolean) : [];
  const strong = list.filter((row) => row.strength === "strong" && row.patientId);
  if (list.length === 1 && strong.length === 1) {
    return { status: "candidate", patientId: strong[0].patientId, merged: false };
  }
  if (list.length === 0) {
    return { status: "unmatched", patientId: null, merged: false };
  }
  return { status: "review_required", patientId: null, merged: false };
}

function declareMigrationFile(input) {
  const source = input || {};
  if (source.bytes || source.buffer || source.contents) {
    return { ok: false, code: RESULT.BINARY_STORAGE_DEFERRED, stored: false };
  }
  const filename = String(source.filename || "").trim();
  const declaredMediaType = String(source.declaredMediaType || "").trim();
  const declaredByteSize = source.declaredByteSize;
  if (!filename || filename.length > 200 || !declaredMediaType || declaredMediaType.length > 100) {
    return { ok: false, code: RESULT.INVALID_INPUT, stored: false };
  }
  if (!Number.isInteger(declaredByteSize) || declaredByteSize <= 0) {
    return { ok: false, code: RESULT.INVALID_INPUT, stored: false };
  }
  return {
    ok: true,
    code: RESULT.OK,
    stored: false,
    file: { filename, declaredMediaType, declaredByteSize },
  };
}

function selectRetentionCategory(categoryKey, approvedCategories) {
  const key = String(categoryKey || "").trim();
  const approved = Array.isArray(approvedCategories) ? approvedCategories : [];
  if (!key || !approved.includes(key)) {
    return { ok: false, code: RESULT.CATEGORY_NOT_APPROVED, deletesOnElapsedTime: false };
  }
  return { ok: true, code: RESULT.OK, categoryKey: key, deletesOnElapsedTime: false };
}

function requestPaperDisposal() {
  return {
    ok: false,
    code: RESULT.LEGAL_APPROVAL_REQUIRED,
    paperRecordsRetained: true,
    deleted: false,
  };
}

function migrationWriteAuthorized(source) {
  const authz = source && source.authorization;
  return Boolean(
    authz &&
      authz.ok === true &&
      authz.permissionKey === IMPORT_PERMISSION
  );
}

async function openMigrationBatch(db, input) {
  const source = input || {};
  if (!migrationWriteAuthorized(source)) {
    return { ok: false, code: RESULT.ACCESS_DENIED, batchId: null };
  }
  const sourceLabel = String(source.sourceLabel || "").trim();
  if (
    !UUID_RE.test(String(source.organizationId || "")) ||
    !UUID_RE.test(String(source.healthcareOrganizationId || "")) ||
    !UUID_RE.test(String(source.facilityId || "")) ||
    !UUID_RE.test(String(source.openedByStaffId || "")) ||
    !sourceLabel ||
    sourceLabel.length > 200
  ) {
    return { ok: false, code: RESULT.INVALID_INPUT, batchId: null };
  }
  const inserted = await db.query(
    `INSERT INTO activeclinic.record_migration_batches (
       organization_id, healthcare_organization_id, facility_id, source_label, opened_by_staff_id
     ) VALUES ($1, $2, $3, $4, $5)
     RETURNING id`,
    [
      source.organizationId,
      source.healthcareOrganizationId,
      source.facilityId,
      sourceLabel,
      source.openedByStaffId,
    ]
  );
  return { ok: true, code: RESULT.OK, batchId: inserted.rows[0].id };
}

module.exports = {
  IMPORT_PERMISSION,
  RESULT,
  migrationWriteAuthorized,
  classifyRecordOrigin,
  reviewMigrationPatientMatch,
  declareMigrationFile,
  selectRetentionCategory,
  requestPaperDisposal,
  openMigrationBatch,
};
