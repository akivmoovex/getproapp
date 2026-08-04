"use strict";

/**
 * ActiveClinic patient portal authentication (AC-V6-P27).
 * Platform identity credentials + patient profile + HCO enrollment.
 */

const identityRepo = require("../../platform/repositories/platformIdentityRepository");
const {
  normalizeEmail,
} = require("../../platform/services/platformIdentityService");
const {
  normalizeRegistrationPhone,
} = require("../../blessboard/services/normalizeRegistrationPhone");
const {
  verifyPlatformIdentityPassword,
  burnCompare,
} = require("../../platform/services/platformIdentityCredentialService");
const {
  createPlatformIdentitySession,
} = require("../../platform/session/createDeploymentSession");
const {
  recordIdentitySignInSuccess,
} = require("../../platform/repositories/platformIdentityRepository");

const EMAIL_RE = /^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const RESULT = Object.freeze({
  AUTHENTICATED: "authenticated",
  INVALID_CREDENTIALS: "invalid_credentials",
  ACCESS_UNAVAILABLE: "access_unavailable",
  INVALID_INPUT: "invalid_input",
  TRANSACTION_ERROR: "transaction_error",
});

const GENERIC_FAILURE = "invalid_credentials";
const GENERIC_ACCESS = "access_unavailable";

/**
 * Resolve platform identity by phone (preferred) or email. Ambiguous → deny.
 */
async function resolveIdentityForPatientLogin(db, input) {
  const raw = String((input && input.identifier) || "").trim();
  if (!raw) {
    return { ok: false, code: "invalid_input", rows: [] };
  }

  const email = normalizeEmail(raw);
  if (email && EMAIL_RE.test(email)) {
    const rows = await identityRepo.findIdentitiesByNormalizedContact(db, {
      emailNormalized: email,
    });
    if (rows.length > 1) {
      return { ok: false, code: "ambiguous_contact", rows, kind: "email" };
    }
    if (rows.length === 1) {
      return { ok: true, code: "ok", identityRow: rows[0], kind: "email" };
    }
  }

  const phone = normalizeRegistrationPhone(raw, input && input.country);
  if (phone.ok) {
    const rows = await identityRepo.findIdentitiesByNormalizedContact(db, {
      phoneNormalized: phone.normalized,
    });
    if (rows.length > 1) {
      return { ok: false, code: "ambiguous_contact", rows, kind: "phone" };
    }
    if (rows.length === 1) {
      return { ok: true, code: "ok", identityRow: rows[0], kind: "phone" };
    }
  }

  return { ok: false, code: "not_found", rows: [] };
}

/**
 * Resolve active patient for identity + HCO.
 */
async function resolvePatientForIdentity(db, input) {
  const identityId = String((input && input.identityId) || "").trim();
  const organizationId = String((input && input.organizationId) || "").trim();
  const healthcareOrganizationId = String((input && input.healthcareOrganizationId) || "").trim();

  if (!identityId || !UUID_RE.test(identityId) || !UUID_RE.test(organizationId) || !UUID_RE.test(healthcareOrganizationId)) {
    return { ok: false, code: "invalid_input", patient: null };
  }

  const patientRow = await db.query(
    `SELECT p.id, p.patient_number, p.first_name, p.last_name, p.preferred_name,
            p.date_of_birth, p.sex_at_registration,
            p.phone_normalized, p.phone_display,
            p.email_normalized, p.email_display,
            p.status, p.organization_id, p.healthcare_organization_id
     FROM activeclinic.patients p
     WHERE p.platform_identity_id = $1
       AND p.organization_id = $2
       AND p.healthcare_organization_id = $3
       AND p.status = 'active'
     LIMIT 1`,
    [identityId, organizationId, healthcareOrganizationId]
  );

  if (!patientRow.rows[0]) {
    return { ok: false, code: "patient_not_found", patient: null };
  }

  const patient = patientRow.rows[0];
  return {
    ok: true,
    code: "ok",
    patient: {
      id: patient.id,
      patientNumber: patient.patient_number,
      firstName: patient.first_name,
      lastName: patient.last_name,
      preferredName: patient.preferred_name,
      dateOfBirth: patient.date_of_birth,
      sexAtRegistration: patient.sex_at_registration,
      phoneNormalized: patient.phone_normalized,
      phoneDisplay: patient.phone_display,
      emailNormalized: patient.email_normalized,
      emailDisplay: patient.email_display,
      status: patient.status,
      organizationId: patient.organization_id,
      healthcareOrganizationId: patient.healthcare_organization_id,
    },
  };
}

/**
 * Authenticate patient identity and create session.
 * @param {{ query: Function, connect?: Function }} db
 * @param {{
 *   identifier: string,
 *   password: string,
 *   deploymentCode: string,
 *   clinicKey: string,
 *   organizationId: string,
 *   healthcareOrganizationId: string,
 *   country?: string|null,
 *   ip?: string|null,
 *   userAgent?: string|null,
 * }} input
 */
async function authenticatePatientIdentity(db, input) {
  const identifier = String((input && input.identifier) || "").trim();
  const password = input && input.password != null ? String(input.password) : "";
  const deploymentCode = String((input && input.deploymentCode) || "")
    .trim()
    .toLowerCase();
  const clinicKey = String((input && input.clinicKey) || "").trim();
  const organizationId = String((input && input.organizationId) || "").trim();
  const healthcareOrganizationId = String((input && input.healthcareOrganizationId) || "").trim();

  if (!identifier || !password || !deploymentCode || !clinicKey || !organizationId || !healthcareOrganizationId) {
    return {
      ok: false,
      result: RESULT.INVALID_INPUT,
      message: "invalid_input",
    };
  }

  const resolved = await resolveIdentityForPatientLogin(db, {
    identifier,
    country: input.country || "ZM",
  });

  if (!resolved.ok && resolved.code === "ambiguous_contact") {
    await burnCompare(password);
    return {
      ok: false,
      result: RESULT.INVALID_CREDENTIALS,
      message: GENERIC_FAILURE,
      failureCategory: "ambiguous_contact",
    };
  }

  if (!resolved.ok || !resolved.identityRow) {
    await burnCompare(password);
    return {
      ok: false,
      result: RESULT.INVALID_CREDENTIALS,
      message: GENERIC_FAILURE,
      failureCategory: "account_not_found",
    };
  }

  const verified = await verifyPlatformIdentityPassword(db, {
    identityId: resolved.identityRow.id,
    password,
    recordFailure: true,
  });

  if (!verified.ok) {
    return {
      ok: false,
      result: RESULT.INVALID_CREDENTIALS,
      message: GENERIC_FAILURE,
      failureCategory: verified.failureCategory || verified.code,
    };
  }

  const patientResolved = await resolvePatientForIdentity(db, {
    identityId: resolved.identityRow.id,
    organizationId,
    healthcareOrganizationId,
  });

  if (!patientResolved.ok) {
    return {
      ok: false,
      result: RESULT.ACCESS_UNAVAILABLE,
      message: GENERIC_ACCESS,
      failureCategory: "patient_not_found",
    };
  }

  const session = await createPlatformIdentitySession(db, {
    deploymentCode,
    platformIdentityId: resolved.identityRow.id,
    organizationId,
    ip: input.ip || null,
    userAgent: input.userAgent || null,
    contextJson: {
      principalKind: "patient",
      patientId: patientResolved.patient.id,
      clinicKey,
      healthcareOrganizationId,
    },
  });

  if (!session.ok) {
    return { ok: false, result: RESULT.TRANSACTION_ERROR, session: null };
  }

  await recordIdentitySignInSuccess(db, resolved.identityRow.id);

  // Record login event
  await db.query(
    `INSERT INTO activeclinic.patient_portal_link_events
      (organization_id, healthcare_organization_id, patient_id, platform_identity_id, event_type, metadata_json)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [
      organizationId,
      healthcareOrganizationId,
      patientResolved.patient.id,
      resolved.identityRow.id,
      "login",
      JSON.stringify({ clinic_key: clinicKey }),
    ]
  );

  return {
    ok: true,
    result: RESULT.AUTHENTICATED,
    rawToken: session.rawToken,
    session: session.session,
    patient: patientResolved.patient,
  };
}

module.exports = {
  RESULT,
  resolveIdentityForPatientLogin,
  resolvePatientForIdentity,
  authenticatePatientIdentity,
};
