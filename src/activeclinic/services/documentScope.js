"use strict";

/**
 * Patient attachment check for a document already loaded in one organization.
 * A blank caller patient means the caller did not narrow the read.
 */

function documentMatchesCallerPatient(document, patientId) {
  if (patientId == null || String(patientId).trim() === "") return true;
  if (!document) return false;
  const owner = document.patient_id != null ? document.patient_id : document.patientId;
  return String(owner) === String(patientId);
}

function documentMatchesCallerFacility(document, facilityId) {
  if (facilityId == null || String(facilityId).trim() === "") return true;
  if (!document) return false;
  const owner = document.facility_id != null ? document.facility_id : document.facilityId;
  return String(owner) === String(facilityId);
}

module.exports = {
  documentMatchesCallerPatient,
  documentMatchesCallerFacility,
};
