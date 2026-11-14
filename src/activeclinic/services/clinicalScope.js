"use strict";

/**
 * Checks already stored in ActiveClinic clinical constraints.
 * No diagnostic range and no encounter state beyond the stored set.
 */

const STORED_ENCOUNTER_STATUSES = Object.freeze(["open", "completed", "cancelled"]);
const STORED_ENCOUNTER_TYPES = Object.freeze([
  "outpatient",
  "emergency",
  "referral",
  "follow_up",
  "other",
]);
const STORED_TRIAGE_CATEGORIES = Object.freeze([
  "emergency",
  "urgent",
  "semi_urgent",
  "non_urgent",
]);
const STORED_TRIAGE_STATUSES = Object.freeze(["draft", "completed"]);

function rowBelongsToOrganization(row, organizationId) {
  if (!row || organizationId == null || String(organizationId).trim() === "") return false;
  const rowOrg = row.organization_id != null ? row.organization_id : row.organizationId;
  return String(rowOrg) === String(organizationId);
}

function isStoredPainLevel(value) {
  if (value == null || value === "") return true;
  const number = Number(value);
  return Number.isInteger(number) && number >= 0 && number <= 10;
}

function isStoredTriageCategory(value) {
  if (value == null || value === "") return true;
  return STORED_TRIAGE_CATEGORIES.includes(value);
}

function isStoredTriageStatus(value) {
  if (value == null || value === "") return true;
  return STORED_TRIAGE_STATUSES.includes(value);
}

function isStoredEncounterStatus(value) {
  return STORED_ENCOUNTER_STATUSES.includes(value);
}

function isStoredEncounterType(value) {
  if (value == null || String(value).trim() === "") return true;
  return STORED_ENCOUNTER_TYPES.includes(String(value).trim());
}

module.exports = {
  STORED_ENCOUNTER_STATUSES,
  STORED_ENCOUNTER_TYPES,
  STORED_TRIAGE_CATEGORIES,
  STORED_TRIAGE_STATUSES,
  rowBelongsToOrganization,
  isStoredPainLevel,
  isStoredTriageCategory,
  isStoredTriageStatus,
  isStoredEncounterStatus,
  isStoredEncounterType,
};
