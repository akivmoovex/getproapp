"use strict";

/**
 * ActiveClinic V2.04 patient domain constants (Phase 5).
 *
 * Patient lifecycle and portal access are independent.
 * Catalogue permission keys remain `activeclinic.patient.*` (ACN10/11);
 * short aliases `patients.view|create|edit` resolve to those keys.
 */

const PATIENT_STATUS = Object.freeze({
  ACTIVE: "active",
  INACTIVE: "inactive",
  DECEASED: "deceased",
  ARCHIVED: "archived",
});

const CANONICAL_PATIENT_STATUSES = Object.freeze([
  PATIENT_STATUS.ACTIVE,
  PATIENT_STATUS.INACTIVE,
  PATIENT_STATUS.DECEASED,
  PATIENT_STATUS.ARCHIVED,
]);

/** Create-time statuses only (archive/deceased are transitions). */
const CREATE_TIME_PATIENT_STATUSES = Object.freeze([
  PATIENT_STATUS.ACTIVE,
  PATIENT_STATUS.INACTIVE,
]);

/**
 * Portal access is derived from platform_identity linkage (ACN portal model).
 * Staff-created patients start with NONE — portal activation is not required.
 */
const PORTAL_ACCESS_STATUS = Object.freeze({
  NONE: "none",
  LINKED: "linked",
  ACTIVE: "active",
});

/**
 * Canonical RBAC keys already seeded for ACN10/11.
 * Do not invent a parallel permission catalogue.
 */
const PATIENT_PERMISSION = Object.freeze({
  VIEW: "activeclinic.patient.view",
  CREATE: "activeclinic.patient.create",
  EDIT: "activeclinic.patient.update",
  SEARCH: "activeclinic.patient.search",
  QUICK_REGISTER: "activeclinic.patient.quick_register",
  ARCHIVE: "activeclinic.patient.archive",
  MANAGE_IDENTIFIERS: "activeclinic.patient.manage_identifiers",
  VIEW_SENSITIVE: "activeclinic.patient.view_sensitive_contact",
  DUPLICATE_OVERRIDE: "activeclinic.patient.duplicate_override",
});

/** Spec-facing aliases → catalogue keys. */
const PATIENT_PERMISSION_ALIASES = Object.freeze({
  "patients.view": PATIENT_PERMISSION.VIEW,
  "patients.create": PATIENT_PERMISSION.CREATE,
  "patients.edit": PATIENT_PERMISSION.EDIT,
});

/**
 * Preserved ACN Patient Number policy (do not silently replace).
 * Format: AC-YYYY-NNNNNN
 * Scope: UNIQUE (healthcare_organization_id, patient_number)
 * Allocation: activeclinic.patient_number_counters per HCO + year
 * Mutability: immutable after insert (DB trigger)
 */
const PATIENT_NUMBER_POLICY = Object.freeze({
  format: "AC-YYYY-NNNNNN",
  formatRegex: /^AC-[0-9]{4}-[0-9]{6}$/,
  scope: "healthcare_organization",
  allocation: "server_side_counter",
  mutable: false,
  generatorModule: "generateActiveClinicPatientNumber",
});

/** Fields never accepted on staff demographic create/edit paths. */
const CLINICAL_FORBIDDEN_FIELDS = Object.freeze([
  "diagnosis",
  "diagnoses",
  "encounter",
  "encounters",
  "observation",
  "observations",
  "prescription",
  "prescriptions",
  "referral",
  "referrals",
  "clinicalNote",
  "clinicalNotes",
  "clinical_notes",
  "clinicalDocument",
  "clinicalDocuments",
  "clinical_documents",
]);

/** Administrative demographic fields supported without final Stitch UI. */
const STAFF_DEMOGRAPHIC_FIELDS = Object.freeze([
  "fullName",
  "firstName",
  "middleName",
  "lastName",
  "preferredName",
  "dateOfBirth",
  "sexAtRegistration",
  "phone",
  "email",
  "address",
  "nextOfKin",
  "emergencyContacts",
  "healthcareOrganizationId",
  "facilityId",
  "patientStatus",
  "patientNumber",
]);

module.exports = {
  PATIENT_STATUS,
  CANONICAL_PATIENT_STATUSES,
  CREATE_TIME_PATIENT_STATUSES,
  PORTAL_ACCESS_STATUS,
  PATIENT_PERMISSION,
  PATIENT_PERMISSION_ALIASES,
  PATIENT_NUMBER_POLICY,
  CLINICAL_FORBIDDEN_FIELDS,
  STAFF_DEMOGRAPHIC_FIELDS,
};
