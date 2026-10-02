"use strict";

/**
 * V2.04 person foundation constants.
 *
 * Person ≠ membership ≠ patient ≠ login identity.
 * Product relationships use opaque relationship_key + subject_ref.
 */

const PERSON_STATUS = Object.freeze({
  ACTIVE: "active",
  INACTIVE: "inactive",
  ARCHIVED: "archived",
});

const PERSON_LINK_STATUS = Object.freeze({
  ACTIVE: "active",
  INACTIVE: "inactive",
  UNLINKED: "unlinked",
});

/** Canonical relationship keys (products may register aliases via adapters). */
const PERSON_RELATIONSHIP_KEY = Object.freeze({
  BB_MEMBERSHIP: "bb.membership",
  AC_PATIENT: "ac.patient",
});

const PERSON_ADDRESS_KIND = Object.freeze({
  HOME: "home",
  WORK: "work",
  POSTAL: "postal",
  BILLING: "billing",
  OTHER: "other",
});

const PERSON_CONTACT_ROLE = Object.freeze({
  RELATED: "related",
  NEXT_OF_KIN: "next_of_kin",
  EMERGENCY: "emergency",
});

const PRODUCT_CODES = Object.freeze(["blessboard", "activeclinic"]);

/** Fields that must NEVER be stored on platform.persons. */
const PERSON_FORBIDDEN_FIELDS = Object.freeze([
  "churchId",
  "church_id",
  "memberNumber",
  "member_number",
  "churchMemberNumber",
  "membershipStatus",
  "membership_status",
  "ministryId",
  "ministry_id",
  "attendance",
  "patientNumber",
  "patient_number",
  "diagnosis",
  "diagnoses",
  "encounter",
  "encounters",
  "prescription",
  "prescriptions",
  "clinicalNote",
  "clinical_notes",
  "clinicalObservation",
  "clinical_observations",
]);

module.exports = {
  PERSON_STATUS,
  PERSON_LINK_STATUS,
  PERSON_RELATIONSHIP_KEY,
  PERSON_ADDRESS_KIND,
  PERSON_CONTACT_ROLE,
  PRODUCT_CODES,
  PERSON_FORBIDDEN_FIELDS,
};
