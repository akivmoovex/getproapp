"use strict";

/**
 * Server-side patient number generation: AC-YYYY-NNNNNN (HCO scoped).
 */

const patientRepo = require("../repositories/patientRepository");

/**
 * @param {{ query: Function }} db
 * @param {{ healthcareOrganizationId: string, at?: Date }} input
 * @returns {Promise<string>}
 */
async function generateActiveClinicPatientNumber(db, input) {
  const at = input.at instanceof Date ? input.at : new Date();
  const yearBucket = at.getUTCFullYear();
  const seq = await patientRepo.allocatePatientNumberSequence(db, {
    healthcareOrganizationId: input.healthcareOrganizationId,
    yearBucket,
  });
  return `AC-${yearBucket}-${String(seq).padStart(6, "0")}`;
}

function isValidPatientNumberFormat(value) {
  return /^AC-[0-9]{4}-[0-9]{6}$/.test(String(value || ""));
}

module.exports = {
  generateActiveClinicPatientNumber,
  isValidPatientNumberFormat,
};
