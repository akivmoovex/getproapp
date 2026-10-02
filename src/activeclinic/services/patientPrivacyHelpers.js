"use strict";

/**
 * Privacy helpers for ActiveClinic patient administrative data.
 * Masking only — never invent clinical confidentiality rules here.
 */

function maskPhone(normalized) {
  if (!normalized) return null;
  const s = String(normalized);
  if (s.length <= 6) return "***";
  return `${s.slice(0, 4)}***${s.slice(-2)}`;
}

function maskEmail(normalized) {
  if (!normalized) return null;
  const s = String(normalized);
  const at = s.indexOf("@");
  if (at <= 1) return "***";
  return `${s[0]}***${s.slice(at)}`;
}

function maskIdentifier(display) {
  if (!display) return null;
  const s = String(display).trim();
  if (s.length <= 4) return "****";
  return `${"*".repeat(Math.max(s.length - 4, 4))}${s.slice(-4)}`;
}

function formatPatientDisplayName(patient) {
  if (!patient) return "";
  if (patient.preferredName) return String(patient.preferredName).trim();
  const parts = [patient.firstName, patient.middleName, patient.lastName]
    .filter(Boolean)
    .map((p) => String(p).trim());
  return parts.join(" ");
}

/**
 * Derive age at a reference date. Never store as authoritative.
 * @param {string|Date|null} dateOfBirth
 * @param {Date} [at]
 * @returns {number|null}
 */
function deriveAgeYears(dateOfBirth, at = new Date()) {
  if (!dateOfBirth) return null;
  const dob = dateOfBirth instanceof Date ? dateOfBirth : new Date(`${dateOfBirth}T00:00:00Z`);
  if (Number.isNaN(dob.getTime())) return null;
  let age = at.getUTCFullYear() - dob.getUTCFullYear();
  const m = at.getUTCMonth() - dob.getUTCMonth();
  if (m < 0 || (m === 0 && at.getUTCDate() < dob.getUTCDate())) age -= 1;
  if (age < 0 || age > 150) return null;
  return age;
}

function formatApproximateAge(dateOfBirth, estimated) {
  const age = deriveAgeYears(dateOfBirth);
  if (age == null) return null;
  return estimated ? `~${age}` : String(age);
}

/**
 * Minimized search/list summary.
 * @param {object} patient mapped patient
 * @param {{ includeDob?: boolean, includeSex?: boolean, facilitySummary?: string|null, duplicateWarning?: boolean }} opts
 */
function toPatientSearchSummary(patient, opts = {}) {
  return {
    id: patient.id,
    patientNumber: patient.patientNumber,
    displayName: formatPatientDisplayName(patient),
    approximateAge: formatApproximateAge(patient.dateOfBirth, patient.estimatedDateOfBirth),
    dateOfBirth: opts.includeDob ? patient.dateOfBirth : null,
    sexAtRegistration: opts.includeSex ? patient.sexAtRegistration : null,
    phoneMasked: maskPhone(patient.phoneNormalized),
    status: patient.status,
    facilitySummary: opts.facilitySummary || null,
    duplicateWarning: opts.duplicateWarning === true,
  };
}

module.exports = {
  maskPhone,
  maskEmail,
  maskIdentifier,
  formatPatientDisplayName,
  deriveAgeYears,
  formatApproximateAge,
  toPatientSearchSummary,
};
