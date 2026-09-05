"use strict";

/**
 * ActiveClinic patient portal registration service (AC-V6-P27).
 * Guest token activation + phone match linking. Never auto-merge ambiguous duplicates.
 */

const crypto = require("crypto");
const identityRepo = require("../../platform/repositories/platformIdentityRepository");
const {
  createPlatformIdentity,
  normalizeEmail,
  isIdentityUsable,
} = require("../../platform/services/platformIdentityService");
const {
  normalizeActiveClinicPhone,
} = require("./normalizeActiveClinicContact");
const {
  setPlatformIdentityPassword,
} = require("../../platform/services/platformIdentityCredentialService");
const {
  linkIdentityToProductProfile,
} = require("../../platform/services/identityProductProfileService");
const {
  verifyBookingAccessToken,
} = require("./activeClinicPublicBookingLookupService");

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const RESULT = Object.freeze({
  OK: "ok",
  INVALID_INPUT: "invalid_input",
  INVALID_TOKEN: "invalid_guest_token",
  PHONE_REQUIRED: "phone_required",
  IDENTITY_EXISTS: "identity_already_exists",
  PATIENT_ALREADY_LINKED: "patient_already_linked",
  AMBIGUOUS_MATCH: "ambiguous_patient_match",
  NO_MATCH: "no_patient_match",
  TRANSACTION_ERROR: "transaction_error",
  WEAK_PASSWORD: "weak_password",
});

async function createIdentityWithPassword(db, input) {
  const created = await createPlatformIdentity(db, {
    status: "active",
    primaryPhone: input.phoneDisplay || input.phoneNormalized,
    phoneNormalized: input.phoneNormalized,
    phoneVerifiedAt: input.phoneVerifiedAt || new Date().toISOString(),
    primaryEmail: input.emailDisplay || input.emailNormalized || null,
    emailNormalized: input.emailNormalized || null,
    emailVerifiedAt: input.emailNormalized ? new Date().toISOString() : null,
    mustChangePassword: input.mustChangePassword === true,
    requireContact: true,
  });
  if (!created.ok) return created;
  const pwd = await setPlatformIdentityPassword(db, {
    identityId: created.identity.id,
    password: input.password,
    mustChangePassword: input.mustChangePassword === true,
  });
  if (!pwd.ok) {
    return { ok: false, code: pwd.code === "weak_password" ? RESULT.WEAK_PASSWORD : RESULT.TRANSACTION_ERROR };
  }
  return created;
}

/**
 * Register patient portal identity with guest token.
 * Always links booking → portal identity.
 * Only links portal → clinic patient when booking already has a deliberate patient_id.
 */
async function registerPatientWithGuestToken(db, input) {
  const guestToken = String((input && input.guestToken) || "").trim();
  const password = String((input && input.password) || "");
  const phoneRaw = String((input && input.phone) || "").trim();
  const email = input && input.email ? normalizeEmail(input.email) : null;
  const deploymentCode = String((input && input.deploymentCode) || "")
    .trim()
    .toLowerCase();

  if (!guestToken || !password || !deploymentCode) {
    return { ok: false, code: RESULT.INVALID_INPUT };
  }

  if (password.length < 10) {
    return { ok: false, code: RESULT.WEAK_PASSWORD, message: "password_too_short" };
  }

  const phoneNorm = normalizeActiveClinicPhone(phoneRaw, {
    country: input.country || "ZM",
  });
  if (!phoneNorm.ok || !phoneNorm.normalized) {
    return {
      ok: false,
      code: phoneNorm.code === "phone_required" ? RESULT.PHONE_REQUIRED : RESULT.INVALID_INPUT,
    };
  }

  const verified = await verifyBookingAccessToken(db, { token: guestToken });
  if (!verified.ok) {
    return { ok: false, code: RESULT.INVALID_TOKEN };
  }

  const booking = verified.booking;
  if (!booking.id) {
    return { ok: false, code: RESULT.INVALID_TOKEN };
  }

  const bookingRow = await db.query(
    `SELECT b.id, b.patient_id, b.organization_id, b.healthcare_organization_id,
            b.portal_platform_identity_id, b.patient_link_status
     FROM activeclinic.public_booking_requests b
     WHERE b.id = $1`,
    [booking.id]
  );
  if (!bookingRow.rows[0]) {
    return { ok: false, code: RESULT.INVALID_TOKEN };
  }

  const bookingRec = bookingRow.rows[0];
  const organizationId = bookingRec.organization_id;
  const healthcareOrganizationId = bookingRec.healthcare_organization_id;
  const existingPatientId = bookingRec.patient_id || null;

  if (
    bookingRec.portal_platform_identity_id &&
    bookingRec.patient_id
  ) {
    // Already fully claimed by another portal path — check conflicts later.
  }

  let patient = null;
  if (existingPatientId) {
    const patientRow = await db.query(
      `SELECT id, platform_identity_id, phone_normalized, status
       FROM activeclinic.patients
       WHERE id = $1 AND organization_id = $2 AND healthcare_organization_id = $3`,
      [existingPatientId, organizationId, healthcareOrganizationId]
    );

    if (!patientRow.rows[0]) {
      return { ok: false, code: RESULT.NO_MATCH };
    }

    patient = patientRow.rows[0];
    if (patient.status !== "active") {
      return { ok: false, code: RESULT.NO_MATCH, message: "patient_not_active" };
    }

    if (patient.platform_identity_id) {
      return { ok: false, code: RESULT.PATIENT_ALREADY_LINKED };
    }
  }

  const existingIdentity = await identityRepo.findIdentitiesByNormalizedContact(db, {
    phoneNormalized: phoneNorm.normalized,
  });
  if (existingIdentity.length > 0) {
    return { ok: false, code: RESULT.IDENTITY_EXISTS };
  }

  const client =
    typeof db.connect === "function" && typeof db.release !== "function"
      ? await db.connect()
      : null;
  const q = client || db;

  try {
    if (client) await client.query("BEGIN");

    const created = await createIdentityWithPassword(q, {
      phoneNormalized: phoneNorm.normalized,
      phoneDisplay: phoneNorm.display,
      emailNormalized: email,
      emailDisplay: email,
      password,
      mustChangePassword: false,
    });

    if (!created.ok) {
      if (client) await client.query("ROLLBACK");
      return { ok: false, code: RESULT.TRANSACTION_ERROR, message: created.code };
    }

    if (patient) {
      const linked = await linkIdentityToProductProfile(q, {
        identityId: created.identity.id,
        productKey: "activeclinic",
        profileType: "activeclinic_patient",
        productProfileId: patient.id,
      });

      if (!linked.ok) {
        if (client) await client.query("ROLLBACK");
        return { ok: false, code: RESULT.TRANSACTION_ERROR, message: linked.code };
      }

      await q.query(
        `UPDATE activeclinic.patients
         SET platform_identity_id = $1, updated_at = now()
         WHERE id = $2`,
        [created.identity.id, patient.id]
      );
    }

    // Booking → portal ownership (never implies clinic patient create).
    if (
      bookingRec.portal_platform_identity_id &&
      bookingRec.portal_platform_identity_id !== created.identity.id
    ) {
      if (client) await client.query("ROLLBACK");
      return { ok: false, code: "link_conflict", message: "booking_owned_by_other_portal" };
    }

    await q.query(
      `UPDATE activeclinic.public_booking_requests
       SET portal_platform_identity_id = $1,
           updated_at = now()
       WHERE id = $2`,
      [created.identity.id, booking.id]
    );

    await q.query(
      `INSERT INTO activeclinic.patient_portal_link_events
        (organization_id, healthcare_organization_id, patient_id, platform_identity_id, event_type, booking_request_id, metadata_json)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        organizationId,
        healthcareOrganizationId,
        patient ? patient.id : null,
        created.identity.id,
        patient ? "linked_via_guest_token" : "portal_booking_linked",
        booking.id,
        JSON.stringify({
          phone_normalized: phoneNorm.normalized,
          clinic_patient_linked: Boolean(patient),
        }),
      ]
    );

    if (client) await client.query("COMMIT");

    return {
      ok: true,
      code: RESULT.OK,
      identityId: created.identity.id,
      patientId: patient ? patient.id : null,
      portalOnly: !patient,
    };
  } catch (err) {
    if (client) await client.query("ROLLBACK").catch(() => {});
    throw err;
  } finally {
    if (client) client.release();
  }
}

/**
 * Register patient portal identity with phone match (no guest token).
 * Matches phone to existing patient in HCO.
 */
async function registerPatientWithPhoneMatch(db, input) {
  const phoneRaw = String((input && input.phone) || "").trim();
  const password = String((input && input.password) || "");
  const email = input && input.email ? normalizeEmail(input.email) : null;
  const firstName = String((input && input.firstName) || "").trim();
  const lastName = String((input && input.lastName) || "").trim();
  const deploymentCode = String((input && input.deploymentCode) || "")
    .trim()
    .toLowerCase();
  const organizationId = String((input && input.organizationId) || "").trim();
  const healthcareOrganizationId = String((input && input.healthcareOrganizationId) || "").trim();

  if (
    !phoneRaw ||
    !password ||
    !firstName ||
    !lastName ||
    !deploymentCode ||
    !UUID_RE.test(organizationId) ||
    !UUID_RE.test(healthcareOrganizationId)
  ) {
    return { ok: false, code: RESULT.INVALID_INPUT };
  }

  if (password.length < 10) {
    return { ok: false, code: RESULT.WEAK_PASSWORD, message: "password_too_short" };
  }

  const phoneNorm = normalizeActiveClinicPhone(phoneRaw, {
    country: input.country || "ZM",
  });
  if (!phoneNorm.ok || !phoneNorm.normalized) {
    return {
      ok: false,
      code: phoneNorm.code === "phone_required" ? RESULT.PHONE_REQUIRED : RESULT.INVALID_INPUT,
    };
  }

  const existingIdentity = await identityRepo.findIdentitiesByNormalizedContact(db, {
    phoneNormalized: phoneNorm.normalized,
  });
  if (existingIdentity.length > 0) {
    return { ok: false, code: RESULT.IDENTITY_EXISTS };
  }

  const patientMatches = await db.query(
    `SELECT id, platform_identity_id, first_name, last_name, status
     FROM activeclinic.patients
     WHERE phone_normalized = $1
       AND organization_id = $2
       AND healthcare_organization_id = $3
       AND status = 'active'
     ORDER BY created_at DESC`,
    [phoneNorm.normalized, organizationId, healthcareOrganizationId]
  );

  if (patientMatches.rows.length === 0) {
    return { ok: false, code: RESULT.NO_MATCH };
  }

  if (patientMatches.rows.length > 1) {
    return { ok: false, code: RESULT.AMBIGUOUS_MATCH };
  }

  const patient = patientMatches.rows[0];
  if (patient.platform_identity_id) {
    return { ok: false, code: RESULT.PATIENT_ALREADY_LINKED };
  }

  const firstNameMatch =
    patient.first_name &&
    firstName.toLowerCase() === patient.first_name.toLowerCase();
  const lastNameMatch =
    patient.last_name &&
    lastName.toLowerCase() === patient.last_name.toLowerCase();

  if (!firstNameMatch || !lastNameMatch) {
    return { ok: false, code: RESULT.NO_MATCH, message: "name_mismatch" };
  }

  const client =
    typeof db.connect === "function" && typeof db.release !== "function"
      ? await db.connect()
      : null;
  const q = client || db;

  try {
    if (client) await client.query("BEGIN");

    const created = await createIdentityWithPassword(q, {
      phoneNormalized: phoneNorm.normalized,
      phoneDisplay: phoneNorm.display,
      emailNormalized: email,
      emailDisplay: email,
      password,
      mustChangePassword: false,
    });

    if (!created.ok) {
      if (client) await client.query("ROLLBACK");
      return { ok: false, code: RESULT.TRANSACTION_ERROR, message: created.code };
    }

    const linked = await linkIdentityToProductProfile(q, {
      identityId: created.identity.id,
      productKey: "activeclinic",
      profileType: "activeclinic_patient",
      productProfileId: patient.id,
    });

    if (!linked.ok) {
      if (client) await client.query("ROLLBACK");
      return { ok: false, code: RESULT.TRANSACTION_ERROR, message: linked.code };
    }

    await q.query(
      `UPDATE activeclinic.patients
       SET platform_identity_id = $1, updated_at = now()
       WHERE id = $2`,
      [created.identity.id, patient.id]
    );

    await q.query(
      `INSERT INTO activeclinic.patient_portal_link_events
        (organization_id, healthcare_organization_id, patient_id, platform_identity_id, event_type, metadata_json)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [
        organizationId,
        healthcareOrganizationId,
        patient.id,
        created.identity.id,
        "linked_via_phone_match",
        JSON.stringify({
          phone_normalized: phoneNorm.normalized,
          matched_name: `${firstName} ${lastName}`,
        }),
      ]
    );

    if (client) await client.query("COMMIT");

    return {
      ok: true,
      code: RESULT.OK,
      identityId: created.identity.id,
      patientId: patient.id,
    };
  } catch (err) {
    if (client) await client.query("ROLLBACK").catch(() => {});
    throw err;
  } finally {
    if (client) client.release();
  }
}

/**
 * Link an existing guest booking to an authenticated portal identity via access token.
 * Does NOT set clinic patient_id / patient_link_status=linked.
 */
async function linkGuestBookingToPatient(db, input) {
  const guestToken = String((input && input.guestToken) || "").trim();
  const patientId = input && input.patientId ? String(input.patientId).trim() : null;
  const platformIdentityId = String((input && input.platformIdentityId) || "").trim();
  const organizationId = String((input && input.organizationId) || "").trim();
  const healthcareOrganizationId = String((input && input.healthcareOrganizationId) || "").trim();

  if (
    !guestToken ||
    !UUID_RE.test(platformIdentityId) ||
    !UUID_RE.test(organizationId) ||
    !UUID_RE.test(healthcareOrganizationId)
  ) {
    return { ok: false, code: RESULT.INVALID_INPUT };
  }

  const verified = await verifyBookingAccessToken(db, { token: guestToken });
  if (!verified.ok) {
    return { ok: false, code: RESULT.INVALID_TOKEN };
  }

  const bookingRow = await db.query(
    `SELECT b.id, b.request_number, b.patient_id, b.organization_id, b.healthcare_organization_id,
            b.portal_platform_identity_id, b.patient_link_status
     FROM activeclinic.public_booking_requests b
     WHERE b.id = $1`,
    [verified.booking.id]
  );

  if (!bookingRow.rows[0]) {
    return { ok: false, code: RESULT.INVALID_TOKEN };
  }

  const booking = bookingRow.rows[0];
  if (
    booking.organization_id !== organizationId ||
    booking.healthcare_organization_id !== healthcareOrganizationId
  ) {
    return { ok: false, code: RESULT.INVALID_TOKEN };
  }

  if (
    booking.portal_platform_identity_id &&
    booking.portal_platform_identity_id !== platformIdentityId
  ) {
    await db.query(
      `INSERT INTO activeclinic.patient_portal_link_events
        (organization_id, healthcare_organization_id, patient_id, platform_identity_id, event_type, booking_request_id, metadata_json)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        organizationId,
        healthcareOrganizationId,
        patientId,
        platformIdentityId,
        "link_conflict",
        booking.id,
        JSON.stringify({ reason: "booking_owned_by_other_portal" }),
      ]
    );
    return { ok: false, code: "link_conflict" };
  }

  await db.query(
    `UPDATE activeclinic.public_booking_requests
     SET portal_platform_identity_id = $1,
         updated_at = now()
     WHERE id = $2`,
    [platformIdentityId, booking.id]
  );

  await db.query(
    `INSERT INTO activeclinic.patient_portal_link_events
      (organization_id, healthcare_organization_id, patient_id, platform_identity_id, event_type, booking_request_id, metadata_json)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [
      organizationId,
      healthcareOrganizationId,
      patientId,
      platformIdentityId,
      "portal_booking_linked",
      booking.id,
      JSON.stringify({
        linked_existing_account: true,
        clinic_patient_auto_linked: false,
      }),
    ]
  );

  return {
    ok: true,
    code: RESULT.OK,
    requestNumber: booking.request_number,
    clinicPatientLinked: false,
    patientLinkStatus: booking.patient_link_status,
  };
}

module.exports = {
  RESULT,
  registerPatientWithGuestToken,
  registerPatientWithPhoneMatch,
  linkGuestBookingToPatient,
};
