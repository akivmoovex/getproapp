"use strict";

/**
 * ActiveClinic staff-managed Add Patient adapter (V2.04 Phase 3).
 *
 * Owns: Patient Number allocation, HCO, facility, patient status, portal access,
 * patient-specific demographics via existing registerActiveClinicPatient.
 * Clinical notes / diagnoses / encounters stay outside this adapter.
 */

const {
  PERSON_RELATIONSHIP_KEY,
} = require("../../platform/person/personConstants");
const {
  ACTIVECLINIC_DUPLICATE_POLICY,
  toActiveClinicMatchStrength,
} = require("../../platform/person/duplicate");
const {
  formatPatientDisplayName,
  maskPhone,
  formatApproximateAge,
} = require("./patientPrivacyHelpers");
const patientRepo = require("../repositories/patientRepository");

const PORTAL_ACCESS = Object.freeze({
  NONE: "none",
  LINKED: "linked",
  ACTIVE: "active",
});

function presentActiveClinicWorkflowMatch(candidate, scored, decision) {
  return {
    subjectRef: candidate.subjectRef || candidate.id || null,
    matchCode: scored.matchCode,
    matchStrength: toActiveClinicMatchStrength(scored.matchCode, scored.reasons),
    reasons: scored.reasons.slice(),
    action: decision.action,
    displayName: formatPatientDisplayName({
      firstName: candidate.firstName,
      lastName: candidate.lastName,
      preferredName: candidate.preferredName,
    }),
    phoneMasked: maskPhone(candidate.phoneNormalized),
    approximateAge: formatApproximateAge(candidate.dateOfBirth, false),
    patientNumber: candidate.patientNumber || null,
  };
}

function createActiveClinicStaffPatientAdapter(deps) {
  const registerFn =
    (deps && deps.registerActiveClinicPatient) ||
    ((db, input) =>
      require("./activeClinicPatientService").registerActiveClinicPatient(
        db,
        input
      ));

  return {
    productCode: "activeclinic",
    relationshipKey: PERSON_RELATIONSHIP_KEY.AC_PATIENT,
    createPermissionKey: "activeclinic.patient.create",
    duplicatePolicy: ACTIVECLINIC_DUPLICATE_POLICY,
    presentMatch: presentActiveClinicWorkflowMatch,

    async authorize(db, ctx) {
      const organizationId = String(
        (ctx.trusted && ctx.trusted.organizationId) || ""
      ).trim();
      const facilityId = String(
        (ctx.trusted && ctx.trusted.facilityId) ||
          (ctx.product && ctx.product.facilityId) ||
          ""
      ).trim();
      const staffMemberId = String(
        (ctx.actor && ctx.actor.staffMemberId) || ""
      ).trim();
      if (!organizationId || !facilityId || !staffMemberId) {
        return { ok: false, code: "unauthorized_context" };
      }
      // Full permission check is enforced again inside registerActiveClinicPatient.
      // Lightweight pre-check keeps workflow fail-fast without clinical coupling.
      const {
        authorizeStaffPermission,
        RESULT: AUTHZ_RESULT,
      } = require("./activeClinicAuthorizationService");
      const authz = await authorizeStaffPermission(db, {
        organizationId,
        staffMemberId,
        platformIdentityId: ctx.actor && ctx.actor.platformIdentityId,
        permissionKey: "activeclinic.patient.create",
        facilityId,
      });
      if (!authz.ok) {
        return {
          ok: false,
          code:
            authz.code === AUTHZ_RESULT.DENIED
              ? "access_denied"
              : authz.code || "unauthorized",
        };
      }
      return { ok: true, authz };
    },

    normalizeProductFields(input) {
      const src = (input && input.product) || {};
      const trusted = (input && input.trusted) || {};

      for (const forbidden of [
        "diagnosis",
        "diagnoses",
        "encounter",
        "encounters",
        "prescription",
        "prescriptions",
        "clinicalNote",
        "clinical_notes",
        "memberNumber",
        "churchId",
        "ministryId",
      ]) {
        if (src[forbidden] != null) {
          return { ok: false, code: "forbidden_clinical_or_bb_field", field: forbidden };
        }
      }

      const healthcareOrganizationId = String(
        src.healthcareOrganizationId ||
          src.healthcare_organization_id ||
          trusted.healthcareOrganizationId ||
          ""
      ).trim();
      const facilityId = String(
        src.facilityId || trusted.facilityId || ""
      ).trim();
      if (!healthcareOrganizationId) {
        return { ok: false, code: "hco_required" };
      }
      if (!facilityId) {
        return { ok: false, code: "facility_id_required" };
      }

      const patientStatus = String(src.patientStatus || src.status || "active")
        .trim()
        .toLowerCase();
      if (!["active", "inactive"].includes(patientStatus)) {
        // deceased/archived are not create-time statuses for staff add.
        return { ok: false, code: "invalid_patient_status" };
      }

      const portalAccessStatus = String(
        src.portalAccessStatus || PORTAL_ACCESS.NONE
      )
        .trim()
        .toLowerCase();
      if (!Object.values(PORTAL_ACCESS).includes(portalAccessStatus)) {
        return { ok: false, code: "invalid_portal_access_status" };
      }

      const productIdentifiers = [];
      if (src.patientNumber) {
        productIdentifiers.push({
          key: "patient_number",
          valueNormalized: String(src.patientNumber).trim(),
          blocking: true,
        });
      }

      return {
        ok: true,
        product: {
          healthcareOrganizationId,
          facilityId,
          patientStatus,
          portalAccessStatus,
          registrationMethod: src.registrationMethod || "walk_in",
          creationMode: src.creationMode || "full",
          identifiers: Array.isArray(src.identifiers) ? src.identifiers : [],
          emergencyContacts: Array.isArray(src.emergencyContacts)
            ? src.emergencyContacts
            : [],
          nextOfKin: src.nextOfKin || null,
          address: src.address || null,
          sexAtRegistration: src.sexAtRegistration || null,
          // Patient Number is server-allocated unless explicitly probing duplicates.
          patientNumber: src.patientNumber || null,
        },
        productIdentifiers,
      };
    },

    async loadDuplicateCandidates(db, ctx) {
      const organizationId = String(
        (ctx.trusted && ctx.trusted.organizationId) || ""
      ).trim();
      const hcoId = String(
        (ctx.product && ctx.product.healthcareOrganizationId) || ""
      ).trim();
      const probe = ctx.probe || {};
      const product = ctx.product || {};
      const rows = await patientRepo.findDuplicateCandidates(db, {
        organizationId,
        healthcareOrganizationId: hcoId,
        identifiers: (product.identifiers || []).map((x) => ({
          type: x.identifierType || x.type,
          valueNormalized: x.identifierValueNormalized || x.valueNormalized,
        })),
        phoneNormalized: probe.phoneNormalized || null,
        emailNormalized: probe.emailNormalized || null,
        dateOfBirth: probe.dateOfBirth || null,
        firstName: probe.firstName || null,
        lastName: probe.lastName || null,
        limit: 20,
      });
      return {
        ok: true,
        candidates: rows.map((row) => ({
          id: row.id,
          subjectRef: row.id,
          organizationId,
          productCode: "activeclinic",
          firstName: row.first_name,
          lastName: row.last_name,
          preferredName: row.preferred_name || null,
          phoneNormalized: row.phone_normalized || null,
          emailNormalized: row.email_normalized || null,
          dateOfBirth: row.date_of_birth || null,
          patientNumber: row.patient_number || null,
          productIdentifiers: row.patient_number
            ? [
                {
                  key: "patient_number",
                  valueNormalized: String(row.patient_number).trim(),
                  blocking: true,
                },
              ]
            : [],
        })),
      };
    },

    async createProductRelationship(db, ctx) {
      const product = ctx.product || {};
      const demographics = ctx.demographics || {};
      const trusted = ctx.trusted || {};
      const actor = ctx.actor || {};

      const registered = await registerFn(db, {
        organizationId: trusted.organizationId,
        healthcareOrganizationId: product.healthcareOrganizationId,
        facilityId: product.facilityId,
        actor: {
          staffMemberId: actor.staffMemberId,
          platformIdentityId: actor.platformIdentityId || null,
          organizationId: trusted.organizationId,
        },
        creationMode: product.creationMode || "full",
        registrationMethod: product.registrationMethod || "walk_in",
        demographics: {
          firstName: demographics.firstName,
          middleName: demographics.middleName,
          lastName: demographics.lastName,
          preferredName: demographics.preferredName,
          dateOfBirth: demographics.dateOfBirth,
          sexAtRegistration: product.sexAtRegistration || null,
        },
        contacts: {
          phoneNormalized: demographics.phoneNormalized,
          phoneDisplay: demographics.phoneDisplay,
          emailNormalized: demographics.emailNormalized,
          emailDisplay: demographics.emailDisplay,
        },
        address: product.address || {},
        identifiers: product.identifiers || [],
        emergencyContacts: product.emergencyContacts || [],
        nextOfKin: product.nextOfKin || {},
        duplicateOverride: ctx.duplicateOverride === true,
        duplicateOverrideReason: ctx.duplicateOverrideReason || null,
      });

      if (!registered || !registered.ok) {
        return {
          ok: false,
          code: (registered && registered.code) || "patient_create_failed",
          detail: registered,
        };
      }

      const patient = registered.patient;
      const portalAccessStatus =
        patient && patient.platformIdentityId
          ? PORTAL_ACCESS.LINKED
          : PORTAL_ACCESS.NONE;

      return {
        ok: true,
        subjectRef: patient.id,
        productIdentifier: patient.patientNumber || null,
        relationshipStatus: patient.status || product.patientStatus || "active",
        portalAccessStatus,
        productRecord: { patient, registration: registered },
        location: {
          organizationId: trusted.organizationId,
          healthcareOrganizationId: product.healthcareOrganizationId,
          facilityId: product.facilityId,
        },
      };
    },
  };
}

const activeClinicStaffPatientAdapter = createActiveClinicStaffPatientAdapter();

module.exports = {
  createActiveClinicStaffPatientAdapter,
  activeClinicStaffPatientAdapter,
  PORTAL_ACCESS,
  presentActiveClinicWorkflowMatch,
};
