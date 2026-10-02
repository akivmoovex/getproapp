"use strict";

/**
 * Patient duplicate detection — warning workflow only (no automatic merge).
 *
 * Scoring is delegated to the shared V2.04 platform person match engine.
 * AC keeps candidate fetch, privacy masking, and the public matchStrength API
 * (strong / moderate / weak) so existing ACN10 behavior stays intact.
 *
 * Strength mapping (preserved):
 * - strong: exact identifier OR exact phone (overrideable; phone ≠ identity proof)
 * - moderate: email+similar name, name+DOB
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
const {
  scorePersonMatch,
  toActiveClinicMatchStrength,
  toDateOnly,
  ACTIVECLINIC_DUPLICATE_POLICY,
  evaluatePersonDuplicates,
  PERSON_MATCH_CODE,
} = require("../../platform/person/duplicate");

const RESULT = Object.freeze({
  OK: "ok",
  INVALID_INPUT: "invalid_input",
});

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

function toMatchSummary(patient, strength, reasons, matchCode) {
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
    matchCode: matchCode || null,
    reasons,
  };
}

function buildProbeIdentifiers(input, identifierHitsByPatientId) {
  // Identifiers are matched via live lookup; attach hits onto candidates below.
  return Array.isArray(input.identifiers) ? input.identifiers : [];
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

  const identifiers = buildProbeIdentifiers(input);
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

  // Resolve live identifier hits once per probe identifier (HCO-scoped).
  const liveHits = [];
  for (const idn of identifiers) {
    const type = idn.identifierType || idn.type;
    const value = idn.identifierValueNormalized || idn.valueNormalized;
    if (!type || !value) continue;
    const live = await identifierRepo.findLiveByTypeAndValue(db, {
      organizationId,
      healthcareOrganizationId,
      identifierType: type,
      identifierValueNormalized: value,
    });
    if (live) {
      liveHits.push({
        patientId: live.patient_id,
        key: String(type),
        valueNormalized: String(value),
      });
    }
  }

  const probe = {
    phoneNormalized: input.phoneNormalized || null,
    emailNormalized: input.emailNormalized || null,
    firstName: input.firstName || null,
    lastName: input.lastName || null,
    dateOfBirth: input.dateOfBirth || null,
    productIdentifiers: [
      ...identifiers
        .map((x) => ({
          key: String(x.identifierType || x.type || "").trim(),
          valueNormalized: String(
            x.identifierValueNormalized || x.valueNormalized || ""
          ).trim(),
          blocking: true,
        }))
        .filter((x) => x.key && x.valueNormalized),
      ...(input.patientNumber
        ? [
            {
              key: "patient_number",
              valueNormalized: String(input.patientNumber).trim(),
              blocking: true,
            },
          ]
        : []),
    ],
  };

  const candidates = [];
  for (const row of rows) {
    if (excludeId && row.id === excludeId) continue;
    const patient = mapPatientLite(row);
    const productIdentifiers = [
      {
        key: "patient_number",
        valueNormalized: String(patient.patientNumber || "").trim(),
        blocking: true,
      },
    ];
    for (const hit of liveHits) {
      if (hit.patientId === patient.id) {
        productIdentifiers.push({
          key: hit.key,
          valueNormalized: hit.valueNormalized,
          blocking: true,
        });
      }
    }
    candidates.push({
      id: patient.id,
      subjectRef: patient.id,
      organizationId,
      productCode: "activeclinic",
      firstName: patient.firstName,
      lastName: patient.lastName,
      phoneNormalized: patient.phoneNormalized,
      emailNormalized: patient.emailNormalized,
      dateOfBirth: patient.dateOfBirth,
      productIdentifiers,
      _patient: patient,
    });
  }

  const evaluated = evaluatePersonDuplicates({
    trusted: { organizationId },
    productCode: "activeclinic",
    probe,
    candidates,
    policy: ACTIVECLINIC_DUPLICATE_POLICY,
    excludeSubjectRef: excludeId,
    presentMatch(candidate, scored) {
      const patient = candidate._patient;
      const strength = toActiveClinicMatchStrength(
        scored.matchCode,
        scored.reasons
      );
      return toMatchSummary(
        patient,
        strength,
        scored.reasons,
        scored.matchCode
      );
    },
  });

  if (!evaluated.ok) {
    return {
      ok: false,
      code: RESULT.INVALID_INPUT,
      matches: [],
      blocking: false,
    };
  }

  const matches = evaluated.matches
    .filter((m) => m.display && m.display.matchStrength)
    .map((m) => m.display)
    .slice(0, 20);

  const hasStrong = matches.some((m) => m.matchStrength === "strong");
  const hasModerate = matches.some((m) => m.matchStrength === "moderate");

  return {
    ok: true,
    code: RESULT.OK,
    matches,
    blocking: hasStrong || hasModerate,
    hasStrong,
    hasModerate,
    // Additive shared-contract fields (non-breaking).
    overallMatchCode: evaluated.overallMatchCode || PERSON_MATCH_CODE.NO_MATCH,
    matchAction: evaluated.action,
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
  // Shared engine re-exports for AC callers that want the V2.04 contract directly.
  scorePersonMatch,
  evaluatePersonDuplicates,
  ACTIVECLINIC_DUPLICATE_POLICY,
};
