"use strict";

/**
 * Compatibility helpers — project person drafts from existing product records
 * WITHOUT rewriting members/patients or requiring portal activation.
 *
 * Phase 1 does not backfill. Products call these when opting into person links.
 */

const {
  normalizePersonDemographics,
  normalizeRelatedContact,
  normalizePersonAddress,
} = require("./personNormalization");
const { PERSON_RELATIONSHIP_KEY } = require("./personConstants");

/**
 * Build a person demographic draft from a BlessBoard member-like object.
 * Does not write to DB. Strips membership-only fields.
 *
 * @param {object} member
 */
function projectPersonDraftFromBlessBoardMember(member) {
  const src = member && typeof member === "object" ? member : {};
  const demo = normalizePersonDemographics({
    firstName: src.firstName || src.first_name,
    middleName: src.middleName || src.middle_name,
    lastName: src.lastName || src.last_name,
    preferredName: src.preferredName || src.preferred_name,
    email: src.emailDisplay || src.email_display || src.email,
    phoneDisplay: src.phoneDisplay || src.phone_display,
    phoneNormalized: src.phoneNormalized || src.phone_normalized,
    dateOfBirth: src.dateOfBirth || src.date_of_birth || null,
  });
  if (!demo.ok) {
    return { ok: false, code: demo.code, detail: demo };
  }
  return {
    ok: true,
    relationshipKey: PERSON_RELATIONSHIP_KEY.BB_MEMBERSHIP,
    subjectRef: String(src.id || src.memberId || src.member_id || "").trim() || null,
    demographics: demo,
    // Explicit: membership status / church id stay product-owned.
    productOwned: {
      membershipStatus: src.status || null,
      churchId: src.churchId || src.church_id || null,
      userId: src.userId || src.user_id || null,
    },
  };
}

/**
 * Build a person demographic draft from an ActiveClinic patient-like object.
 * Does not write to DB. Strips Patient Number / clinical fields.
 *
 * @param {object} patient
 */
function projectPersonDraftFromActiveClinicPatient(patient) {
  const src = patient && typeof patient === "object" ? patient : {};
  const demo = normalizePersonDemographics({
    firstName: src.firstName || src.first_name,
    middleName: src.middleName || src.middle_name,
    lastName: src.lastName || src.last_name,
    preferredName: src.preferredName || src.preferred_name,
    email: src.emailDisplay || src.email_display || src.email,
    phoneDisplay: src.phoneDisplay || src.phone_display,
    phoneNormalized: src.phoneNormalized || src.phone_normalized,
    dateOfBirth: src.dateOfBirth || src.date_of_birth || null,
  });
  if (!demo.ok) {
    return { ok: false, code: demo.code, detail: demo };
  }

  const address = normalizePersonAddress({
    addressKind: "home",
    line1: src.addressLine1 || src.address_line_1,
    line2: src.addressLine2 || src.address_line_2,
    city: src.city,
    district: src.district,
    province: src.province,
    postalCode: src.postalCode || src.postal_code,
    countryCode: src.countryCode || src.country_code,
    isPrimary: true,
  });

  const nextOfKinName = src.nextOfKinName || src.next_of_kin_name;
  let nextOfKin = null;
  if (nextOfKinName) {
    nextOfKin = normalizeRelatedContact({
      contactRole: "next_of_kin",
      fullName: nextOfKinName,
      relationshipLabel:
        src.nextOfKinRelationship || src.next_of_kin_relationship || null,
      phoneDisplay: src.nextOfKinPhoneDisplay || src.next_of_kin_phone_display,
      phoneNormalized:
        src.nextOfKinPhoneNormalized || src.next_of_kin_phone_normalized,
      isPrimary: true,
    });
  }

  return {
    ok: true,
    relationshipKey: PERSON_RELATIONSHIP_KEY.AC_PATIENT,
    subjectRef:
      String(src.id || src.patientId || src.patient_id || "").trim() || null,
    demographics: demo,
    address: address.ok ? address : null,
    nextOfKin: nextOfKin && nextOfKin.ok ? nextOfKin : null,
    // Explicit: patient number / clinical stay product-owned.
    productOwned: {
      patientNumber: src.patientNumber || src.patient_number || null,
      patientStatus: src.status || null,
      healthcareOrganizationId:
        src.healthcareOrganizationId || src.healthcare_organization_id || null,
      platformIdentityId:
        src.platformIdentityId || src.platform_identity_id || null,
    },
  };
}

/**
 * Project emergency-contact rows into platform related-contact drafts.
 * @param {Array<object>} contacts
 */
function projectRelatedContactsFromEmergencyContacts(contacts) {
  const list = Array.isArray(contacts) ? contacts : [];
  const out = [];
  for (const row of list) {
    const draft = normalizeRelatedContact({
      contactRole: "emergency",
      fullName: row.fullName || row.full_name,
      relationshipLabel: row.relationship || row.relationship_label,
      phoneDisplay: row.phoneDisplay || row.phone_display,
      phoneNormalized: row.phoneNormalized || row.phone_normalized,
      emailDisplay: row.emailDisplay || row.email_display,
      emailNormalized: row.emailNormalized || row.email_normalized,
      isPrimary: row.isPrimary === true || row.is_primary === true,
      consentToContact:
        row.consentToContact != null
          ? row.consentToContact
          : row.consent_to_contact,
    });
    if (draft.ok) out.push(draft);
  }
  return { ok: true, contacts: out };
}

module.exports = {
  projectPersonDraftFromBlessBoardMember,
  projectPersonDraftFromActiveClinicPatient,
  projectRelatedContactsFromEmergencyContacts,
};
