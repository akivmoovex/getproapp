"use strict";

/**
 * Patient duplicate detection — warning workflow only (no automatic merge).
 *
 * Strength:
 * - strong: same live identifier type+value within HCO
 * - moderate: phone+similar name, name+DOB, email+similar name
 * - weak: name only (informational; never blocks)
 */

const patientRepo = require("../repositories/patientRepository");
const identifierRepo = require("../repositories/patientIdentifierRepository");
const {
  formatPatientDisplayName,
  maskPhone,
  maskIdentifier,
  formatApproximateAge,
} = require("./patientPrivacyHelpers");

const RESULT = Object.freeze({
  OK: "ok",
  INVALID_INPUT: "invalid_input",
});

function similarName(a, b) {
  return (
    String(a || "").trim().toLowerCase() === String(b || "").trim().toLowerCase()
  );
}

function toDateOnly(value) {
  if (value == null || value === "") return null;
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}/.test(value)) {
    return value.slice(0, 10);
  }
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    // node-pg maps DATE to local midnight; use local Y-M-D (not toISOString).
    const y = value.getFullYear();
    const m = String(value.getMonth() + 1).padStart(2, "0");
    const d = String(value.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }
  const text = String(value).trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(text)) return text.slice(0, 10);
  return null;
}

function mapPatientLite(row) {
  return {
    id: row.id,
    patientNumber: row.patient_number,
    firstName: row.first_name,
    lastName: row.last_name,
    preferredName: row.preferred_name || null,
    dateOfBirth: toDateOnly(row.date_of_birth),
    estimatedDateOfBirth: row.estimated_date_of_birth === true,
    phoneNormalized: row.phone_normalized || null,
    emailNormalized: row.email_normalized || null,
    status: row.status,
  };
}

function toMatchSummary(patient, strength, reasons) {
  return {
    patientId: patient.id,
    patientNumber: patient.patientNumber,
    displayName: formatPatientDisplayName(patient),
    approximateAge: formatApproximateAge(
      patient.dateOfBirth,
      patient.estimatedDateOfBirth
    ),
    phoneMasked: maskPhone(patient.phoneNormalized),
    status: patient.status,
    matchStrength: strength,
    reasons,
  };
}

/**
 * @param {{ query: Function }} db
 * @param {object} input
 */
async function findPotentialPatientDuplicates(db, input) {
  const organizationId = String((input && input.organizationId) || "").trim();
  const healthcareOrganizationId = String(
    (input && input.healthcareOrganizationId) || ""
  ).trim();
  if (!organizationId || !healthcareOrganizationId) {
    return { ok: false, code: RESULT.INVALID_INPUT, matches: [], blocking: false };
  }

  const identifiers = Array.isArray(input.identifiers) ? input.identifiers : [];
  const rows = await patientRepo.findDuplicateCandidates(db, {
    organizationId,
    healthcareOrganizationId,
    identifiers: identifiers.map((x) => ({
      type: x.identifierType || x.type,
      valueNormalized: x.identifierValueNormalized || x.valueNormalized,
    })),
    phoneNormalized: input.phoneNormalized || null,
    emailNormalized: input.emailNormalized || null,
    dateOfBirth: input.dateOfBirth || null,
    firstName: input.firstName || null,
    lastName: input.lastName || null,
    limit: 20,
  });

  const excludeId = input.excludePatientId || null;
  const matches = [];

  for (const row of rows) {
    if (excludeId && row.id === excludeId) continue;
    const patient = mapPatientLite(row);
    const reasons = [];
    let strength = "weak";

    for (const idn of identifiers) {
      const type = idn.identifierType || idn.type;
      const value = idn.identifierValueNormalized || idn.valueNormalized;
      const live = await identifierRepo.findLiveByTypeAndValue(db, {
        organizationId,
        healthcareOrganizationId,
        identifierType: type,
        identifierValueNormalized: value,
      });
      if (live && live.patient_id === patient.id) {
        strength = "strong";
        reasons.push(`identifier:${type}`);
      }
    }

    if (
      input.phoneNormalized &&
      patient.phoneNormalized === input.phoneNormalized
    ) {
      strength = "strong";
      reasons.push("phone_exact");
    }

    if (
      input.emailNormalized &&
      patient.emailNormalized === input.emailNormalized &&
      (similarName(patient.firstName, input.firstName) ||
        similarName(patient.lastName, input.lastName))
    ) {
      if (strength !== "strong") strength = "moderate";
      reasons.push("email_and_name");
    }

    if (
      input.dateOfBirth &&
      patient.dateOfBirth &&
      toDateOnly(patient.dateOfBirth) === toDateOnly(input.dateOfBirth) &&
      similarName(patient.lastName, input.lastName) &&
      similarName(patient.firstName, input.firstName)
    ) {
      if (strength !== "strong") strength = "moderate";
      reasons.push("name_and_dob");
    }

    if (
      similarName(patient.firstName, input.firstName) &&
      similarName(patient.lastName, input.lastName) &&
      !reasons.length
    ) {
      strength = "weak";
      reasons.push("name_only");
    }

    if (!reasons.length) continue;
    matches.push(toMatchSummary(patient, strength, reasons));
  }

  const order = { strong: 0, moderate: 1, weak: 2 };
  matches.sort((a, b) => order[a.matchStrength] - order[b.matchStrength]);

  const hasStrong = matches.some((m) => m.matchStrength === "strong");
  const hasModerate = matches.some((m) => m.matchStrength === "moderate");

  return {
    ok: true,
    code: RESULT.OK,
    matches: matches.slice(0, 20),
    blocking: hasStrong || hasModerate,
    hasStrong,
    hasModerate,
  };
}

/**
 * Controlled identifier conflict probe (HCO only).
 */
async function findIdentifierConflict(db, input) {
  const row = await identifierRepo.findLiveByTypeAndValue(db, {
    organizationId: input.organizationId,
    healthcareOrganizationId: input.healthcareOrganizationId,
    identifierType: input.identifierType,
    identifierValueNormalized: input.identifierValueNormalized,
  });
  if (!row) return { ok: true, conflict: null };
  if (input.excludeIdentifierId && row.id === input.excludeIdentifierId) {
    return { ok: true, conflict: null };
  }
  return {
    ok: true,
    conflict: {
      patientId: row.patient_id,
      identifierType: row.identifier_type,
      identifierMasked: maskIdentifier(row.identifier_value_display),
      verificationStatus: row.verification_status,
    },
  };
}

module.exports = {
  RESULT,
  findPotentialPatientDuplicates,
  findIdentifierConflict,
};
