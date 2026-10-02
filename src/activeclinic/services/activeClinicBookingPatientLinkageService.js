"use strict";

/**
 * Public booking ↔ clinic patient linkage (deliberate, auditable).
 *
 * Portal identity and booking ownership are distinct from clinic patient linkage.
 * Never auto-link on phone alone. Never merge. Always HCO/org scoped.
 */

const {
  findPotentialPatientDuplicates,
} = require("./activeClinicPatientDuplicateService");
const {
  registerActiveClinicPatient,
  getPatientByOrgAndNumber,
  PERM,
  CREATION_MODES,
  RESULT: PATIENT_RESULT,
} = require("./activeClinicPatientService");
const {
  authorizeStaffPermission,
} = require("./activeClinicAuthorizationService");
const { recordAuditEventSafe } = require("../../platform/services/auditEventService");
const {
  CODE_ACTIVECLINIC_ORG_V6,
} = require("../../platform/config/deploymentProfiles");
const {
  formatPatientDisplayName,
  maskPhone,
  formatApproximateAge,
} = require("./patientPrivacyHelpers");

const RESULT = Object.freeze({
  OK: "ok",
  INVALID_INPUT: "invalid_input",
  NOT_FOUND: "booking_not_found",
  PATIENT_NOT_FOUND: "patient_not_found",
  ACCESS_DENIED: "access_denied",
  ALREADY_LINKED: "already_linked",
  CONFLICT: "link_conflict",
  CROSS_TENANT: "cross_tenant_denied",
  DUPLICATE_WARNING: PATIENT_RESULT.DUPLICATE_WARNING,
  IDENTIFIER_CONFLICT: PATIENT_RESULT.IDENTIFIER_CONFLICT,
  OVERRIDE_DENIED: PATIENT_RESULT.OVERRIDE_DENIED,
});

const LINK_STATUS = Object.freeze({
  UNLINKED: "unlinked",
  POSSIBLE_MATCH: "possible_match",
  LINK_REVIEW_REQUIRED: "link_review_required",
  LINKED: "linked",
  NEW_PATIENT_PENDING: "new_patient_pending",
});

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function mapBooking(row) {
  if (!row) return null;
  return {
    id: row.id,
    organizationId: row.organization_id,
    healthcareOrganizationId: row.healthcare_organization_id,
    facilityId: row.facility_id,
    requestNumber: row.request_number,
    bookingKind: row.booking_kind,
    status: row.status,
    patientId: row.patient_id || null,
    portalPlatformIdentityId: row.portal_platform_identity_id || null,
    patientLinkStatus: row.patient_link_status || LINK_STATUS.UNLINKED,
    patientMatchCount: row.patient_match_count != null ? Number(row.patient_match_count) : 0,
    patientLinkedAt: row.patient_linked_at || null,
    patientFirstName: row.patient_first_name,
    patientLastName: row.patient_last_name,
    patientPhoneNormalized: row.patient_phone_normalized || null,
    patientPhoneDisplay: row.patient_phone_display || null,
    patientEmailNormalized: row.patient_email_normalized || null,
    preferredStartsAt: row.preferred_starts_at || null,
    appointmentId: row.appointment_id || null,
    createdAt: row.created_at,
  };
}

/**
 * Classify duplicate matches into linkage status. Never auto-links.
 * Phone exact → candidate only (possible_match / review), not linked.
 */
function classifyMatches(matches) {
  const list = Array.isArray(matches) ? matches : [];
  if (!list.length) {
    return {
      status: LINK_STATUS.UNLINKED,
      matchCount: 0,
      candidates: [],
    };
  }
  const strongOrModerate = list.filter(
    (m) => m.matchStrength === "strong" || m.matchStrength === "moderate"
  );
  if (strongOrModerate.length > 1) {
    return {
      status: LINK_STATUS.LINK_REVIEW_REQUIRED,
      matchCount: strongOrModerate.length,
      candidates: strongOrModerate,
    };
  }
  if (strongOrModerate.length === 1) {
    return {
      status: LINK_STATUS.POSSIBLE_MATCH,
      matchCount: 1,
      candidates: strongOrModerate,
    };
  }
  // Weak-only → still unlinked (informational); keep count for staff
  return {
    status: LINK_STATUS.UNLINKED,
    matchCount: list.length,
    candidates: list.slice(0, 5),
  };
}

/**
 * Privacy-minimized candidate for staff UI (not public portal).
 */
function toStaffCandidate(match) {
  const num = String(match.patientNumber || "");
  const ending = num.length > 4 ? num.slice(-4) : num;
  return {
    patientId: match.patientId,
    patientNumberEnding: ending ? `••••${ending}` : null,
    displayName: match.displayName,
    approximateAge: match.approximateAge || null,
    phoneMasked: match.phoneMasked || null,
    matchStrength: match.matchStrength,
    reasons: match.reasons || [],
  };
}

async function assessBookingIdentityMatches(db, input) {
  const organizationId = String((input && input.organizationId) || "").trim();
  const healthcareOrganizationId = String(
    (input && input.healthcareOrganizationId) || ""
  ).trim();
  if (!UUID_RE.test(organizationId) || !UUID_RE.test(healthcareOrganizationId)) {
    return { ok: false, code: RESULT.INVALID_INPUT };
  }

  const duplicates = await findPotentialPatientDuplicates(db, {
    organizationId,
    healthcareOrganizationId,
    phoneNormalized: input.phoneNormalized || null,
    emailNormalized: input.emailNormalized || null,
    firstName: input.firstName || null,
    lastName: input.lastName || null,
    dateOfBirth: input.dateOfBirth || null,
    identifiers: Array.isArray(input.identifiers) ? input.identifiers : [],
  });
  if (!duplicates.ok) {
    return { ok: false, code: RESULT.INVALID_INPUT };
  }

  const classified = classifyMatches(duplicates.matches);
  return {
    ok: true,
    code: RESULT.OK,
    patientLinkStatus: classified.status,
    matchCount: classified.matchCount,
    candidates: classified.candidates.map(toStaffCandidate),
    rawMatches: classified.candidates,
  };
}

async function getBookingRequestById(db, input) {
  const organizationId = String((input && input.organizationId) || "").trim();
  const bookingId = String((input && input.bookingId) || "").trim();
  if (!UUID_RE.test(organizationId) || !UUID_RE.test(bookingId)) {
    return { ok: false, code: RESULT.INVALID_INPUT, booking: null };
  }
  const r = await db.query(
    `SELECT *
       FROM activeclinic.public_booking_requests
      WHERE id = $1 AND organization_id = $2
      LIMIT 1`,
    [bookingId, organizationId]
  );
  if (!r.rows[0]) return { ok: false, code: RESULT.NOT_FOUND, booking: null };
  return { ok: true, code: RESULT.OK, booking: mapBooking(r.rows[0]), row: r.rows[0] };
}

async function listBookingsNeedingPatientReview(db, input) {
  const organizationId = String((input && input.organizationId) || "").trim();
  const facilityId = input.facilityId ? String(input.facilityId).trim() : null;
  if (!UUID_RE.test(organizationId)) {
    return { ok: false, code: RESULT.INVALID_INPUT, bookings: [] };
  }

  const params = [organizationId];
  let facilitySql = "";
  if (facilityId && UUID_RE.test(facilityId)) {
    params.push(facilityId);
    facilitySql = ` AND facility_id = $${params.length}`;
  }

  const r = await db.query(
    `SELECT *
       FROM activeclinic.public_booking_requests
      WHERE organization_id = $1
        ${facilitySql}
        AND patient_link_status IN ('unlinked', 'possible_match', 'link_review_required', 'new_patient_pending')
        AND status NOT IN ('cancelled', 'expired', 'completed', 'no_show')
      ORDER BY created_at DESC
      LIMIT 100`,
    params
  );
  return {
    ok: true,
    code: RESULT.OK,
    bookings: r.rows.map(mapBooking),
  };
}

async function requirePatientSearch(db, actor, organizationId, facilityId) {
  return authorizeStaffPermission(db, {
    organizationId,
    staffMemberId: actor.staffMemberId,
    platformIdentityId: actor.platformIdentityId,
    facilityId: facilityId || null,
    permissionKey: PERM.SEARCH,
  });
}

/**
 * Staff: link booking to an existing clinic patient (verified selection).
 */
async function linkBookingToExistingPatient(db, input) {
  const organizationId = String((input && input.organizationId) || "").trim();
  const bookingId = String((input && input.bookingId) || "").trim();
  const patientId = String((input && input.patientId) || "").trim();
  const actor = input && input.actor;
  const source = String((input && input.source) || "staff_review").slice(0, 64);

  if (
    !UUID_RE.test(organizationId) ||
    !UUID_RE.test(bookingId) ||
    !UUID_RE.test(patientId) ||
    !actor ||
    !UUID_RE.test(String(actor.staffMemberId || ""))
  ) {
    return { ok: false, code: RESULT.INVALID_INPUT };
  }

  const loaded = await getBookingRequestById(db, { organizationId, bookingId });
  if (!loaded.ok) return { ok: false, code: loaded.code };

  const booking = loaded.booking;
  const authz = await requirePatientSearch(
    db,
    actor,
    organizationId,
    booking.facilityId
  );
  if (!authz.ok) return { ok: false, code: RESULT.ACCESS_DENIED };

  if (booking.patientLinkStatus === LINK_STATUS.LINKED && booking.patientId) {
    if (booking.patientId === patientId) {
      return { ok: true, code: RESULT.OK, booking, alreadyLinked: true };
    }
    return { ok: false, code: RESULT.ALREADY_LINKED };
  }

  const patientRow = await db.query(
    `SELECT id, organization_id, healthcare_organization_id, patient_number, status,
            first_name, last_name, phone_normalized, date_of_birth, estimated_date_of_birth
       FROM activeclinic.patients
      WHERE id = $1 AND organization_id = $2
      LIMIT 1`,
    [patientId, organizationId]
  );
  if (!patientRow.rows[0]) {
    return { ok: false, code: RESULT.PATIENT_NOT_FOUND };
  }
  const patient = patientRow.rows[0];
  if (patient.healthcare_organization_id !== booking.healthcareOrganizationId) {
    return { ok: false, code: RESULT.CROSS_TENANT };
  }
  if (patient.status === "archived") {
    return { ok: false, code: RESULT.PATIENT_NOT_FOUND };
  }

  await db.query(
    `UPDATE activeclinic.public_booking_requests
        SET patient_id = $1,
            patient_link_status = $2,
            patient_linked_at = now(),
            patient_linked_by_staff_id = $3,
            patient_match_count = GREATEST(patient_match_count, 1),
            updated_at = now()
      WHERE id = $4 AND organization_id = $5`,
    [
      patientId,
      LINK_STATUS.LINKED,
      actor.staffMemberId,
      bookingId,
      organizationId,
    ]
  );

  await recordAuditEventSafe(db, {
    deploymentCode: input.deploymentCode || CODE_ACTIVECLINIC_ORG_V6,
    organizationId,
    actorUserId: null,
    actionKey: "activeclinic.booking.patient_linked",
    entityType: "public_booking_request",
    entityId: bookingId,
    outcome: "success",
    metadata: {
      reason_code: "booking_patient_linked",
      source,
      patient_number: patient.patient_number,
      status: LINK_STATUS.LINKED,
    },
  });

  await db.query(
    `INSERT INTO activeclinic.patient_portal_link_events
       (organization_id, healthcare_organization_id, patient_id, platform_identity_id,
        event_type, booking_request_id, metadata_json)
     VALUES ($1, $2, $3, NULL, 'booking_patient_linked', $4, $5)`,
    [
      organizationId,
      booking.healthcareOrganizationId,
      patientId,
      bookingId,
      JSON.stringify({ source, staff_member_id: actor.staffMemberId }),
    ]
  );

  const refreshed = await getBookingRequestById(db, { organizationId, bookingId });
  return {
    ok: true,
    code: RESULT.OK,
    booking: refreshed.booking,
    patient: {
      id: patient.id,
      patientNumber: patient.patient_number,
      displayName: formatPatientDisplayName({
        firstName: patient.first_name,
        lastName: patient.last_name,
      }),
      approximateAge: formatApproximateAge(
        patient.date_of_birth,
        patient.estimated_date_of_birth === true
      ),
      phoneMasked: maskPhone(patient.phone_normalized),
    },
  };
}

/**
 * Staff: create clinic patient from booking guest details, then link.
 * Reuses registerActiveClinicPatient (duplicate / identifier rules intact).
 */
async function createPatientFromBookingAndLink(db, input) {
  const organizationId = String((input && input.organizationId) || "").trim();
  const bookingId = String((input && input.bookingId) || "").trim();
  const actor = input && input.actor;

  const loaded = await getBookingRequestById(db, { organizationId, bookingId });
  if (!loaded.ok) return { ok: false, code: loaded.code };
  const booking = loaded.booking;

  // Authz before already-linked so denied roles never appear to "own" the outcome.
  const createAuthz = await authorizeStaffPermission(db, {
    organizationId,
    staffMemberId: actor.staffMemberId,
    platformIdentityId: actor.platformIdentityId,
    facilityId: booking.facilityId,
    permissionKey: PERM.CREATE,
  });
  if (!createAuthz.ok) {
    // Quick Register is for urgent walk-in clinical paths, not booking identity resolution.
    return { ok: false, code: RESULT.ACCESS_DENIED };
  }

  if (booking.patientLinkStatus === LINK_STATUS.LINKED && booking.patientId) {
    return { ok: false, code: RESULT.ALREADY_LINKED };
  }

  const created = await registerActiveClinicPatient(db, {
    organizationId,
    healthcareOrganizationId: booking.healthcareOrganizationId,
    facilityId: booking.facilityId,
    creationMode: CREATION_MODES.FULL,
    registrationStatus: "incomplete",
    registrationMethod: "walk_in",
    demographics: {
      firstName: booking.patientFirstName,
      lastName: booking.patientLastName,
      sexAtRegistration: input.sexAtRegistration || null,
      dateOfBirth: input.dateOfBirth || null,
    },
    contacts: {
      phone: booking.patientPhoneDisplay || booking.patientPhoneNormalized,
      email: booking.patientEmailNormalized || null,
    },
    address: {},
    identifiers: Array.isArray(input.identifiers) ? input.identifiers : [],
    duplicateOverride: input.duplicateOverride === true,
    duplicateOverrideReason: input.duplicateOverrideReason || "booking_create_distinct_patient",
    actor,
    deploymentCode: input.deploymentCode || CODE_ACTIVECLINIC_ORG_V6,
  });

  if (!created.ok) {
    return {
      ok: false,
      code: created.code,
      matches: created.matches || null,
      conflict: created.conflict || null,
    };
  }

  const linked = await linkBookingToExistingPatient(db, {
    organizationId,
    bookingId,
    patientId: created.patient.id,
    actor,
    source: "staff_create_from_booking",
    deploymentCode: input.deploymentCode || CODE_ACTIVECLINIC_ORG_V6,
  });
  if (!linked.ok) {
    return { ok: false, code: linked.code, patient: created.patient };
  }

  await recordAuditEventSafe(db, {
    deploymentCode: input.deploymentCode || CODE_ACTIVECLINIC_ORG_V6,
    organizationId,
    actorUserId: null,
    actionKey: "activeclinic.booking.patient_created",
    entityType: "public_booking_request",
    entityId: bookingId,
    outcome: "success",
    metadata: {
      reason_code: "booking_patient_created",
      patient_number: created.patient.patientNumber,
      registration_method: "walk_in",
      status: created.patient.registrationStatus || "incomplete",
    },
  });

  await db.query(
    `INSERT INTO activeclinic.patient_portal_link_events
       (organization_id, healthcare_organization_id, patient_id, platform_identity_id,
        event_type, booking_request_id, metadata_json)
     VALUES ($1, $2, $3, NULL, 'booking_patient_created', $4, $5)`,
    [
      organizationId,
      booking.healthcareOrganizationId,
      created.patient.id,
      bookingId,
      JSON.stringify({ source: "staff_create_from_booking" }),
    ]
  );

  return {
    ok: true,
    code: RESULT.OK,
    booking: linked.booking,
    patient: created.patient,
  };
}

/**
 * Apply match assessment to a booking row without linking.
 */
async function applyMatchAssessmentToBooking(db, input) {
  const organizationId = String((input && input.organizationId) || "").trim();
  const bookingId = String((input && input.bookingId) || "").trim();
  const assessment = input.assessment;
  if (!UUID_RE.test(organizationId) || !UUID_RE.test(bookingId) || !assessment) {
    return { ok: false, code: RESULT.INVALID_INPUT };
  }

  const status =
    assessment.matchCount === 0
      ? LINK_STATUS.NEW_PATIENT_PENDING
      : assessment.patientLinkStatus;

  await db.query(
    `UPDATE activeclinic.public_booking_requests
        SET patient_link_status = $1,
            patient_match_count = $2,
            patient_id = NULL,
            updated_at = now()
      WHERE id = $3
        AND organization_id = $4
        AND (patient_link_status IS DISTINCT FROM 'linked')`,
    [status, assessment.matchCount || 0, bookingId, organizationId]
  );

  if (assessment.matchCount > 0) {
    await db.query(
      `INSERT INTO activeclinic.patient_portal_link_events
         (organization_id, healthcare_organization_id, patient_id, platform_identity_id,
          event_type, booking_request_id, metadata_json)
       VALUES ($1, $2, NULL, NULL, 'booking_patient_match_detected', $3, $4)`,
      [
        organizationId,
        input.healthcareOrganizationId,
        bookingId,
        JSON.stringify({
          match_count: assessment.matchCount,
          status,
        }),
      ]
    );
  }

  return { ok: true, code: RESULT.OK, patientLinkStatus: status };
}

/**
 * Portal claim: link booking to an existing clinic patient after ownership verification.
 * Requires verified portal phone exact-match to patient phone. Never uses clinical secrets.
 */
async function confirmPortalPatientClaim(db, input) {
  const organizationId = String((input && input.organizationId) || "").trim();
  const healthcareOrganizationId = String(
    (input && input.healthcareOrganizationId) || ""
  ).trim();
  const bookingId = String((input && input.bookingId) || "").trim();
  const patientId = String((input && input.patientId) || "").trim();
  const platformIdentityId = String((input && input.platformIdentityId) || "").trim();
  const verifiedPhoneNormalized = String(
    (input && input.verifiedPhoneNormalized) || ""
  ).trim();

  if (
    !UUID_RE.test(organizationId) ||
    !UUID_RE.test(healthcareOrganizationId) ||
    !UUID_RE.test(bookingId) ||
    !UUID_RE.test(patientId) ||
    !UUID_RE.test(platformIdentityId) ||
    !verifiedPhoneNormalized
  ) {
    return { ok: false, code: RESULT.INVALID_INPUT };
  }

  const bookingRow = await db.query(
    `SELECT id, patient_id, patient_link_status, portal_platform_identity_id,
            healthcare_organization_id, facility_id
       FROM activeclinic.public_booking_requests
      WHERE id = $1 AND organization_id = $2
      LIMIT 1`,
    [bookingId, organizationId]
  );
  if (!bookingRow.rows[0]) return { ok: false, code: RESULT.NOT_FOUND };
  const booking = bookingRow.rows[0];
  if (booking.healthcare_organization_id !== healthcareOrganizationId) {
    return { ok: false, code: RESULT.CROSS_TENANT };
  }
  if (
    booking.portal_platform_identity_id &&
    booking.portal_platform_identity_id !== platformIdentityId
  ) {
    return { ok: false, code: RESULT.CONFLICT };
  }
  if (booking.patient_id && booking.patient_id !== patientId) {
    return { ok: false, code: RESULT.ALREADY_LINKED };
  }
  if (booking.patient_link_status === LINK_STATUS.LINKED && booking.patient_id === patientId) {
    return { ok: true, code: RESULT.OK, alreadyLinked: true };
  }

  const patientRow = await db.query(
    `SELECT id, phone_normalized, patient_number, first_name, last_name, status,
            date_of_birth, estimated_date_of_birth
       FROM activeclinic.patients
      WHERE id = $1
        AND organization_id = $2
        AND healthcare_organization_id = $3
      LIMIT 1`,
    [patientId, organizationId, healthcareOrganizationId]
  );
  if (!patientRow.rows[0] || patientRow.rows[0].status === "archived") {
    return { ok: false, code: RESULT.PATIENT_NOT_FOUND };
  }
  const patient = patientRow.rows[0];
  if (
    !patient.phone_normalized ||
    patient.phone_normalized !== verifiedPhoneNormalized
  ) {
    await db.query(
      `INSERT INTO activeclinic.patient_portal_link_events
         (organization_id, healthcare_organization_id, patient_id, platform_identity_id,
          event_type, booking_request_id, metadata_json)
       VALUES ($1, $2, $3, $4, 'patient_claim_rejected', $5, $6)`,
      [
        organizationId,
        healthcareOrganizationId,
        patientId,
        platformIdentityId,
        bookingId,
        JSON.stringify({ reason: "verified_phone_mismatch" }),
      ]
    );
    return { ok: false, code: RESULT.CONFLICT, reason: "verified_phone_mismatch" };
  }

  await db.query(
    `UPDATE activeclinic.public_booking_requests
        SET patient_id = $1,
            patient_link_status = $2,
            patient_linked_at = now(),
            portal_platform_identity_id = COALESCE(portal_platform_identity_id, $3),
            updated_at = now()
      WHERE id = $4 AND organization_id = $5`,
    [
      patientId,
      LINK_STATUS.LINKED,
      platformIdentityId,
      bookingId,
      organizationId,
    ]
  );

  await db.query(
    `INSERT INTO activeclinic.patient_portal_link_events
       (organization_id, healthcare_organization_id, patient_id, platform_identity_id,
        event_type, booking_request_id, metadata_json)
     VALUES ($1, $2, $3, $4, 'patient_claim_confirmed', $5, $6)`,
    [
      organizationId,
      healthcareOrganizationId,
      patientId,
      platformIdentityId,
      bookingId,
      JSON.stringify({ verification: "verified_phone_match" }),
    ]
  );

  await recordAuditEventSafe(db, {
    deploymentCode: input.deploymentCode || CODE_ACTIVECLINIC_ORG_V6,
    organizationId,
    actorUserId: null,
    actionKey: "activeclinic.booking.patient_claim_confirmed",
    entityType: "public_booking_request",
    entityId: bookingId,
    outcome: "success",
    metadata: {
      reason_code: "patient_claim_confirmed",
      patient_number_ending: String(patient.patient_number || "").slice(-4),
    },
  });

  return {
    ok: true,
    code: RESULT.OK,
    patient: {
      id: patient.id,
      patientNumberEnding: `••••${String(patient.patient_number || "").slice(-4)}`,
      approximateAge: formatApproximateAge(
        patient.date_of_birth,
        patient.estimated_date_of_birth === true
      ),
      phoneMasked: maskPhone(patient.phone_normalized),
    },
  };
}

/**
 * Privacy-minimized claim preview for a portal-owned booking (no clinical fields).
 */
async function previewPortalClaimCandidates(db, input) {
  const organizationId = String((input && input.organizationId) || "").trim();
  const healthcareOrganizationId = String(
    (input && input.healthcareOrganizationId) || ""
  ).trim();
  const bookingId = String((input && input.bookingId) || "").trim();
  const platformIdentityId = String((input && input.platformIdentityId) || "").trim();
  const verifiedPhoneNormalized = String(
    (input && input.verifiedPhoneNormalized) || ""
  ).trim();

  if (
    !UUID_RE.test(organizationId) ||
    !UUID_RE.test(healthcareOrganizationId) ||
    !UUID_RE.test(bookingId) ||
    !UUID_RE.test(platformIdentityId)
  ) {
    return { ok: false, code: RESULT.INVALID_INPUT, candidates: [] };
  }

  const bookingRow = await db.query(
    `SELECT id, patient_id, patient_link_status, portal_platform_identity_id,
            patient_first_name, patient_last_name, patient_phone_normalized,
            patient_email_normalized, healthcare_organization_id
       FROM activeclinic.public_booking_requests
      WHERE id = $1 AND organization_id = $2
      LIMIT 1`,
    [bookingId, organizationId]
  );
  if (!bookingRow.rows[0]) return { ok: false, code: RESULT.NOT_FOUND, candidates: [] };
  const booking = bookingRow.rows[0];
  if (booking.healthcare_organization_id !== healthcareOrganizationId) {
    return { ok: false, code: RESULT.CROSS_TENANT, candidates: [] };
  }
  if (
    booking.portal_platform_identity_id &&
    booking.portal_platform_identity_id !== platformIdentityId
  ) {
    return { ok: false, code: RESULT.CONFLICT, candidates: [] };
  }
  if (booking.patient_link_status === LINK_STATUS.LINKED && booking.patient_id) {
    return { ok: true, code: RESULT.OK, candidates: [], alreadyLinked: true };
  }

  // Without verified phone, never enumerate candidates publicly.
  if (!verifiedPhoneNormalized) {
    return { ok: true, code: RESULT.OK, candidates: [], requiresVerification: true };
  }

  const assessment = await assessBookingIdentityMatches(db, {
    organizationId,
    healthcareOrganizationId,
    phoneNormalized: verifiedPhoneNormalized,
    firstName: booking.patient_first_name,
    lastName: booking.patient_last_name,
    emailNormalized: booking.patient_email_normalized,
  });
  if (!assessment.ok) {
    return { ok: false, code: assessment.code, candidates: [] };
  }

  // Only surface candidates whose phone matches the verified portal phone.
  const phoneMatched = (assessment.rawMatches || []).filter(
    (m) => m.phoneNormalized && m.phoneNormalized === verifiedPhoneNormalized
  );

  return {
    ok: true,
    code: RESULT.OK,
    candidates: phoneMatched.map(toStaffCandidate),
    patientLinkStatus:
      phoneMatched.length > 1
        ? LINK_STATUS.LINK_REVIEW_REQUIRED
        : phoneMatched.length === 1
          ? LINK_STATUS.POSSIBLE_MATCH
          : LINK_STATUS.UNLINKED,
    matchCount: phoneMatched.length,
  };
}

module.exports = {
  RESULT,
  LINK_STATUS,
  mapBooking,
  classifyMatches,
  assessBookingIdentityMatches,
  getBookingRequestById,
  listBookingsNeedingPatientReview,
  linkBookingToExistingPatient,
  createPatientFromBookingAndLink,
  applyMatchAssessmentToBooking,
  toStaffCandidate,
  confirmPortalPatientClaim,
  previewPortalClaimCandidates,
};
