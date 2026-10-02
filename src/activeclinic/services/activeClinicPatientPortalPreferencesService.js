"use strict";

/**
 * Patient portal communication preferences (AC-P09).
 * Reuses platform.communication_preferences — not clinical consent ledger (ACN11).
 */

const {
  upsertCommunicationPreference,
  listCommunicationPreferences,
} = require("../../platform/consent/communicationPreferences");

const RESULT = Object.freeze({
  OK: "ok",
  INVALID_INPUT: "invalid_input",
  ACCESS_DENIED: "access_denied",
  NO_PATIENT: "no_patient",
});

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const PURPOSE = Object.freeze({
  BOOKING: "booking_updates",
  ADMIN: "administrative_reminders",
});

const CHANNELS = Object.freeze(["email", "sms", "in_app"]);

function emptyPrefs() {
  return {
    email: { booking_updates: false, administrative_reminders: false },
    sms: { booking_updates: false, administrative_reminders: false },
    in_app: { booking_updates: true, administrative_reminders: true },
  };
}

function mapListed(rows) {
  const prefs = emptyPrefs();
  for (const row of rows || []) {
    const channel = row.channel;
    const purpose = row.purposeKey || row.purpose_key;
    if (!CHANNELS.includes(channel)) continue;
    if (purpose !== PURPOSE.BOOKING && purpose !== PURPOSE.ADMIN) continue;
    prefs[channel][purpose] = row.optedIn === true || row.opted_in === true;
  }
  return prefs;
}

/**
 * Load durable communication preferences for the portal patient.
 */
async function getPatientCommunicationPreferences(db, input) {
  const organizationId = String((input && input.organizationId) || "").trim();
  const patientId = String((input && input.patientId) || "").trim();
  if (!UUID_RE.test(organizationId)) {
    return { ok: false, code: RESULT.INVALID_INPUT, preferences: emptyPrefs() };
  }
  if (!patientId) {
    return { ok: false, code: RESULT.NO_PATIENT, preferences: emptyPrefs() };
  }
  if (!UUID_RE.test(patientId)) {
    return { ok: false, code: RESULT.INVALID_INPUT, preferences: emptyPrefs() };
  }

  const listed = await listCommunicationPreferences(db, {
    trusted: { organizationId },
    productCode: "activeclinic",
    subjectKind: "patient",
    subjectRef: patientId,
  });
  if (!listed.ok) {
    return {
      ok: false,
      code: listed.code === "tenant_unresolved" ? RESULT.ACCESS_DENIED : RESULT.INVALID_INPUT,
      preferences: emptyPrefs(),
    };
  }

  return {
    ok: true,
    code: RESULT.OK,
    preferences: mapListed(listed.preferences || []),
    clinicalConsentNote:
      "Clinical / treatment consent is managed by clinic staff and cannot be changed here.",
  };
}

/**
 * Persist portal communication preferences (channels only).
 * Ownership: organizationId + patientId from trusted auth only — never from body.
 * Does not mutate activeclinic.patient_consents (clinical/treatment consent).
 */
async function updatePatientCommunicationPreferences(db, input) {
  const organizationId = String((input && input.organizationId) || "").trim();
  const patientId = String((input && input.patientId) || "").trim();
  const actorIdentityId =
    input && input.actorIdentityId ? String(input.actorIdentityId).trim() : null;
  if (!UUID_RE.test(organizationId) || !UUID_RE.test(patientId)) {
    return { ok: false, code: RESULT.INVALID_INPUT, preferences: emptyPrefs() };
  }

  // Reject client-supplied tenant/patient identifiers (trusted scope only).
  const body = (input && input.body) || {};
  if (
    body.patient_id != null ||
    body.patientId != null ||
    body.organization_id != null ||
    body.organizationId != null ||
    body.subject_ref != null ||
    body.subjectRef != null
  ) {
    return { ok: false, code: RESULT.ACCESS_DENIED, preferences: emptyPrefs() };
  }

  const updates = [
    {
      channel: "email",
      purposeKey: PURPOSE.BOOKING,
      optedIn: body.email_booking_updates === "1" || body.email_booking_updates === true,
    },
    {
      channel: "email",
      purposeKey: PURPOSE.ADMIN,
      optedIn:
        body.email_administrative_reminders === "1" ||
        body.email_administrative_reminders === true,
    },
    {
      channel: "sms",
      purposeKey: PURPOSE.BOOKING,
      optedIn: body.sms_booking_updates === "1" || body.sms_booking_updates === true,
    },
    {
      channel: "sms",
      purposeKey: PURPOSE.ADMIN,
      optedIn:
        body.sms_administrative_reminders === "1" ||
        body.sms_administrative_reminders === true,
    },
    {
      channel: "in_app",
      purposeKey: PURPOSE.BOOKING,
      optedIn: body.in_app_booking_updates !== "0" && body.in_app_booking_updates !== false,
    },
    {
      channel: "in_app",
      purposeKey: PURPOSE.ADMIN,
      optedIn:
        body.in_app_administrative_reminders !== "0" &&
        body.in_app_administrative_reminders !== false,
    },
  ];

  for (const u of updates) {
    const saved = await upsertCommunicationPreference(db, {
      trusted: { organizationId },
      body: {},
      productCode: "activeclinic",
      subjectKind: "patient",
      subjectRef: patientId,
      channel: u.channel,
      purposeKey: u.purposeKey,
      optedIn: u.optedIn,
      source: "patient_portal",
      actorIdentityId,
    });
    if (!saved.ok) {
      return {
        ok: false,
        code: saved.code === "tenant_unresolved" ? RESULT.ACCESS_DENIED : RESULT.INVALID_INPUT,
        preferences: emptyPrefs(),
      };
    }
  }

  return getPatientCommunicationPreferences(db, { organizationId, patientId });
}

module.exports = {
  RESULT,
  PURPOSE,
  getPatientCommunicationPreferences,
  updatePatientCommunicationPreferences,
};
