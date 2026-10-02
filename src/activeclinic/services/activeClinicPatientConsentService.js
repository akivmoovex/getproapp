"use strict";

/**
 * ActiveClinic patient clinical/administrative consent ledger (ACN11).
 * Distinct from platform registrationConsent / communicationPreferences.
 * Always scoped to organization + healthcare organization — never cross-clinic.
 */

const {
  authorizeStaffPermission,
  RESULT: AUTHZ_RESULT,
} = require("./activeClinicAuthorizationService");
const { recordAuditEventSafe } = require("../../platform/services/auditEventService");
const {
  CODE_ACTIVECLINIC_ORG_V6,
} = require("../../platform/config/deploymentProfiles");
const { rejectForgedTenantIdentifiers } = require("../../platform/rbac/sharedTenantScope");
const {
  PERM: PATIENT_PERM,
  getPatientByOrgAndId,
} = require("./activeClinicPatientService");

const RESULT = Object.freeze({
  OK: "ok",
  INVALID_INPUT: "invalid_input",
  ACCESS_DENIED: "access_denied",
  PATIENT_NOT_FOUND: "patient_not_found",
  NOT_FOUND: "consent_not_found",
  INVALID_STATUS: "invalid_consent_status",
  FORGED_TENANT: "forged_tenant",
});

const CONSENT_TYPES = Object.freeze([
  "treatment",
  "data_processing",
  "sharing_with_referrer",
  "photography",
  "research_contact",
  "other",
]);

const CONSENT_STATUSES = Object.freeze([
  "granted",
  "withdrawn",
  "expired",
  "refused",
]);

const CAPTURE_METHODS = Object.freeze([
  "verbal",
  "written",
  "digital",
  "guardian_verbal",
  "guardian_written",
  "other",
]);

const TYPE_LABELS = Object.freeze({
  treatment: "Treatment",
  data_processing: "Data processing",
  sharing_with_referrer: "Sharing with referrer",
  photography: "Photography",
  research_contact: "Research contact",
  other: "Other",
});

const STATUS_LABELS = Object.freeze({
  granted: "Granted",
  withdrawn: "Withdrawn",
  expired: "Expired",
  refused: "Refused",
});

const METHOD_LABELS = Object.freeze({
  verbal: "Verbal",
  written: "Written",
  digital: "Digital",
  guardian_verbal: "Guardian (verbal)",
  guardian_written: "Guardian (written)",
  other: "Other",
});

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function mapConsent(row) {
  if (!row) return null;
  return {
    id: row.id,
    organizationId: row.organization_id,
    healthcareOrganizationId: row.healthcare_organization_id,
    patientId: row.patient_id,
    consentType: row.consent_type,
    consentTypeLabel: TYPE_LABELS[row.consent_type] || row.consent_type,
    status: row.status,
    statusLabel: STATUS_LABELS[row.status] || row.status,
    grantedAt: row.granted_at || null,
    withdrawnAt: row.withdrawn_at || null,
    captureMethod: row.capture_method,
    captureMethodLabel: METHOD_LABELS[row.capture_method] || row.capture_method,
    consentVersion: row.consent_version,
    note: row.note || null,
    withdrawalReason: row.withdrawal_reason || null,
    capturedByStaffId: row.captured_by_staff_id || null,
    withdrawnByStaffId: row.withdrawn_by_staff_id || null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function assertTrusted(input) {
  const forged = rejectForgedTenantIdentifiers({
    body: input.body,
    query: input.query,
    trusted: {
      organizationId: input.organizationId,
      facilityId: input.facilityId || null,
    },
    allowMatchingTrusted: true,
  });
  if (!forged.ok) return { ok: false, code: RESULT.FORGED_TENANT };
  return { ok: true };
}

async function authorize(db, input, permissionKey) {
  const authz = await authorizeStaffPermission(db, {
    organizationId: input.organizationId,
    staffMemberId: input.actor.staffMemberId,
    platformIdentityId: input.actor.platformIdentityId,
    permissionKey,
    facilityId: input.facilityId || null,
  });
  if (!authz.ok) {
    return {
      ok: false,
      code:
        authz.code === AUTHZ_RESULT.DENIED
          ? RESULT.ACCESS_DENIED
          : authz.code || RESULT.ACCESS_DENIED,
    };
  }
  return { ok: true };
}

async function listPatientConsents(db, input) {
  const scope = assertTrusted(input);
  if (!scope.ok) return scope;
  const authz = await authorize(db, input, PATIENT_PERM.VIEW);
  if (!authz.ok) return authz;

  const patientId = String(input.patientId || "").trim();
  if (!UUID_RE.test(patientId)) {
    return { ok: false, code: RESULT.INVALID_INPUT, consents: [] };
  }

  const patient = await getPatientByOrgAndId(db, {
    organizationId: input.organizationId,
    healthcareOrganizationId: input.healthcareOrganizationId,
    patientId,
  });
  if (!patient.ok) {
    return { ok: false, code: RESULT.PATIENT_NOT_FOUND, consents: [] };
  }

  const result = await db.query(
    `SELECT *
       FROM activeclinic.patient_consents
      WHERE organization_id = $1
        AND healthcare_organization_id = $2
        AND patient_id = $3
      ORDER BY created_at DESC`,
    [input.organizationId, input.healthcareOrganizationId, patientId]
  );
  return {
    ok: true,
    code: RESULT.OK,
    consents: result.rows.map(mapConsent),
  };
}

async function grantPatientConsent(db, input) {
  const scope = assertTrusted(input);
  if (!scope.ok) return scope;
  const authz = await authorize(db, input, PATIENT_PERM.UPDATE);
  if (!authz.ok) return authz;

  const patientId = String(input.patientId || "").trim();
  const consentType = String(input.consentType || "").trim();
  const captureMethod = String(input.captureMethod || "").trim();
  const consentVersion = String(input.consentVersion || "1.0").trim().slice(0, 40);
  const note = input.note ? String(input.note).trim().slice(0, 500) : null;
  const status = String(input.status || "granted").trim();

  if (
    !UUID_RE.test(patientId) ||
    !CONSENT_TYPES.includes(consentType) ||
    !CAPTURE_METHODS.includes(captureMethod) ||
    !consentVersion ||
    !["granted", "refused"].includes(status)
  ) {
    return { ok: false, code: RESULT.INVALID_INPUT, consent: null };
  }

  const patient = await getPatientByOrgAndId(db, {
    organizationId: input.organizationId,
    healthcareOrganizationId: input.healthcareOrganizationId,
    patientId,
  });
  if (!patient.ok) {
    return { ok: false, code: RESULT.PATIENT_NOT_FOUND, consent: null };
  }

  const grantedAt = status === "granted" ? new Date() : null;
  const inserted = await db.query(
    `INSERT INTO activeclinic.patient_consents (
       organization_id, healthcare_organization_id, patient_id,
       consent_type, status, granted_at, capture_method, consent_version,
       note, captured_by_staff_id
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
     RETURNING *`,
    [
      input.organizationId,
      input.healthcareOrganizationId,
      patientId,
      consentType,
      status,
      grantedAt,
      captureMethod,
      consentVersion,
      note,
      input.actor.staffMemberId,
    ]
  );
  const row = inserted.rows[0];
  await db.query(
    `INSERT INTO activeclinic.patient_consent_events (
       organization_id, healthcare_organization_id, patient_consent_id,
       patient_id, from_status, to_status, reason_code, note, actor_staff_id
     ) VALUES ($1,$2,$3,$4,NULL,$5,$6,$7,$8)`,
    [
      input.organizationId,
      input.healthcareOrganizationId,
      row.id,
      patientId,
      status,
      "consent_captured",
      note,
      input.actor.staffMemberId,
    ]
  );
  await recordAuditEventSafe(db, {
    deploymentCode: input.deploymentCode || CODE_ACTIVECLINIC_ORG_V6,
    organizationId: input.organizationId,
    actorUserId: null,
    actionKey: "activeclinic.patient.consent_grant",
    entityType: "patient_consent",
    entityId: row.id,
    outcome: "success",
    metadata: {
      patient_id: patientId,
      consent_type: consentType,
      status,
      consent_version: consentVersion,
    },
  });
  return { ok: true, code: RESULT.OK, consent: mapConsent(row) };
}

async function withdrawPatientConsent(db, input) {
  const scope = assertTrusted(input);
  if (!scope.ok) return scope;
  const authz = await authorize(db, input, PATIENT_PERM.UPDATE);
  if (!authz.ok) return authz;

  const consentId = String(input.consentId || "").trim();
  const reason = String(input.withdrawalReason || input.reason || "").trim();
  if (!UUID_RE.test(consentId) || reason.length < 3) {
    return { ok: false, code: RESULT.INVALID_INPUT, consent: null };
  }

  const existing = await db.query(
    `SELECT * FROM activeclinic.patient_consents
      WHERE id = $1
        AND organization_id = $2
        AND healthcare_organization_id = $3
      LIMIT 1`,
    [consentId, input.organizationId, input.healthcareOrganizationId]
  );
  const row = existing.rows[0];
  if (!row) return { ok: false, code: RESULT.NOT_FOUND, consent: null };
  if (row.status !== "granted") {
    return { ok: false, code: RESULT.INVALID_STATUS, consent: mapConsent(row) };
  }

  const updated = await db.query(
    `UPDATE activeclinic.patient_consents
        SET status = 'withdrawn',
            withdrawn_at = now(),
            withdrawn_by_staff_id = $4,
            withdrawal_reason = $5,
            updated_at = now()
      WHERE id = $1
        AND organization_id = $2
        AND healthcare_organization_id = $3
      RETURNING *`,
    [
      consentId,
      input.organizationId,
      input.healthcareOrganizationId,
      input.actor.staffMemberId,
      reason.slice(0, 500),
    ]
  );
  const next = updated.rows[0];
  await db.query(
    `INSERT INTO activeclinic.patient_consent_events (
       organization_id, healthcare_organization_id, patient_consent_id,
       patient_id, from_status, to_status, reason_code, note, actor_staff_id
     ) VALUES ($1,$2,$3,$4,$5,'withdrawn','consent_withdrawn',$6,$7)`,
    [
      input.organizationId,
      input.healthcareOrganizationId,
      consentId,
      row.patient_id,
      row.status,
      reason.slice(0, 500),
      input.actor.staffMemberId,
    ]
  );
  await recordAuditEventSafe(db, {
    deploymentCode: input.deploymentCode || CODE_ACTIVECLINIC_ORG_V6,
    organizationId: input.organizationId,
    actorUserId: null,
    actionKey: "activeclinic.patient.consent_withdraw",
    entityType: "patient_consent",
    entityId: consentId,
    outcome: "success",
    metadata: { patient_id: row.patient_id },
  });
  return { ok: true, code: RESULT.OK, consent: mapConsent(next) };
}

async function listConsentEvents(db, input) {
  const scope = assertTrusted(input);
  if (!scope.ok) return scope;
  const authz = await authorize(db, input, PATIENT_PERM.VIEW);
  if (!authz.ok) return authz;
  const consentId = String(input.consentId || "").trim();
  if (!UUID_RE.test(consentId)) {
    return { ok: false, code: RESULT.INVALID_INPUT, events: [] };
  }
  const result = await db.query(
    `SELECT e.*
       FROM activeclinic.patient_consent_events e
       INNER JOIN activeclinic.patient_consents c ON c.id = e.patient_consent_id
      WHERE e.patient_consent_id = $1
        AND e.organization_id = $2
        AND c.healthcare_organization_id = $3
      ORDER BY e.created_at ASC`,
    [consentId, input.organizationId, input.healthcareOrganizationId]
  );
  return {
    ok: true,
    code: RESULT.OK,
    events: result.rows.map((row) => ({
      id: row.id,
      fromStatus: row.from_status,
      toStatus: row.to_status,
      reasonCode: row.reason_code,
      note: row.note,
      actorStaffId: row.actor_staff_id,
      createdAt: row.created_at,
    })),
  };
}

module.exports = {
  RESULT,
  CONSENT_TYPES,
  CONSENT_STATUSES,
  CAPTURE_METHODS,
  TYPE_LABELS,
  STATUS_LABELS,
  METHOD_LABELS,
  listPatientConsents,
  grantPatientConsent,
  withdrawPatientConsent,
  listConsentEvents,
  mapConsent,
};
