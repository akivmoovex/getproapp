"use strict";

/**
 * ActiveClinic patient list / register / profile screen loaders (AC-V6-C02).
 * Stitch P02 screens exist; UI uses shell design system with stitch markers (PARTIAL / VISUAL_BLOCKED gaps documented).
 */

const {
  searchActiveClinicPatients,
  resolvePatientForActor,
  listPatientIdentifiers,
  listEmergencyContacts,
  RESULT: PATIENT_RESULT,
  PERM,
} = require("./activeClinicPatientService");
const registrationRepo = require("../repositories/patientRegistrationRepository");
const {
  listFacilitiesByOrganization,
} = require("./facilityService");
const {
  REGISTRATION_METHODS,
  SEX_VALUES,
  STATUSES,
  IDENTIFIER_TYPES,
} = require("./activeClinicPatientValidation");
const {
  formatPatientDisplayName,
  formatApproximateAge,
  maskPhone,
  maskEmail,
  maskIdentifier,
} = require("./patientPrivacyHelpers");

const STATUS_LABELS = Object.freeze({
  active: "Active",
  inactive: "Inactive",
  deceased: "Deceased",
  archived: "Archived",
});

const SEX_LABELS = Object.freeze({
  male: "Male",
  female: "Female",
  intersex: "Intersex",
  unknown: "Unknown",
  not_recorded: "Not recorded",
});

const METHOD_LABELS = Object.freeze({
  walk_in: "Walk-in",
  referral: "Referral",
  transfer_in: "Transfer in",
  outreach: "Outreach",
  imported: "Imported",
  other: "Other",
});

const IDENTIFIER_LABELS = Object.freeze({
  national_id: "National ID",
  passport: "Passport",
  birth_certificate: "Birth certificate",
  insurance_member_number: "Insurance member number",
  facility_legacy_number: "Facility legacy number",
  other: "Other",
});

function hasPerm(perms, key) {
  return Array.isArray(perms) ? perms.includes(key) : false;
}

function actorFromAuth(auth) {
  return {
    staffMemberId: auth.staffMember.id,
    platformIdentityId: auth.platformIdentity && auth.platformIdentity.id,
    organizationId: auth.organization.id,
  };
}

function emptyFormValues() {
  return {
    firstName: "",
    middleName: "",
    lastName: "",
    preferredName: "",
    dateOfBirth: "",
    estimatedDateOfBirth: false,
    sexAtRegistration: "",
    nationalityCountryCode: "",
    primaryLanguage: "",
    phone: "",
    email: "",
    addressLine1: "",
    addressLine2: "",
    city: "",
    district: "",
    province: "",
    countryCode: "",
    postalCode: "",
    preferredContactMethod: "",
    allowAdminReminders: "",
    facilityId: "",
    registrationMethod: "walk_in",
    identifierType: "",
    identifierValue: "",
    emergencyFullName: "",
    emergencyRelationship: "",
    emergencyPhone: "",
    emergencyEmail: "",
    duplicateOverride: false,
    duplicateOverrideReason: "",
    step: "edit",
  };
}

function parsePatientFormBody(body) {
  body = body || {};
  const bool = (v) => v === true || v === "1" || v === "on" || v === "true";
  return {
    firstName: String(body.first_name || "").trim(),
    middleName: String(body.middle_name || "").trim(),
    lastName: String(body.last_name || "").trim(),
    preferredName: String(body.preferred_name || "").trim(),
    dateOfBirth: String(body.date_of_birth || "").trim(),
    estimatedDateOfBirth: bool(body.estimated_date_of_birth),
    sexAtRegistration: String(body.sex_at_registration || "").trim(),
    nationalityCountryCode: String(body.nationality_country_code || "")
      .trim()
      .toUpperCase(),
    primaryLanguage: String(body.primary_language || "").trim(),
    phone: String(body.phone || "").trim(),
    email: String(body.email || "").trim(),
    addressLine1: String(body.address_line_1 || "").trim(),
    addressLine2: String(body.address_line_2 || "").trim(),
    city: String(body.city || "").trim(),
    district: String(body.district || "").trim(),
    province: String(body.province || "").trim(),
    countryCode: String(body.country_code || "").trim().toUpperCase(),
    postalCode: String(body.postal_code || "").trim(),
    preferredContactMethod: String(body.preferred_contact_method || "").trim(),
    allowAdminReminders:
      body.allow_admin_reminders === "" || body.allow_admin_reminders == null
        ? ""
        : bool(body.allow_admin_reminders),
    facilityId: String(body.facility_id || "").trim(),
    registrationMethod: String(body.registration_method || "walk_in").trim(),
    identifierType: String(body.identifier_type || "").trim(),
    identifierValue: String(body.identifier_value || "").trim(),
    emergencyFullName: String(body.emergency_full_name || "").trim(),
    emergencyRelationship: String(body.emergency_relationship || "").trim(),
    emergencyPhone: String(body.emergency_phone || "").trim(),
    emergencyEmail: String(body.emergency_email || "").trim(),
    duplicateOverride: bool(body.duplicate_override),
    duplicateOverrideReason: String(body.duplicate_override_reason || "").trim(),
    step: String(body.step || "edit").trim(),
  };
}

function buildRegistrationPayload(values, auth) {
  const identifiers = [];
  if (values.identifierType && values.identifierValue) {
    identifiers.push({
      identifierType: values.identifierType,
      identifierValue: values.identifierValue,
      isPrimary: true,
    });
  }
  const emergencyContacts = [];
  if (values.emergencyFullName && values.emergencyPhone) {
    emergencyContacts.push({
      fullName: values.emergencyFullName,
      relationship: values.emergencyRelationship || "emergency_contact",
      phone: values.emergencyPhone,
      email: values.emergencyEmail || null,
      isPrimary: true,
    });
  }
  let allowAdminReminders = null;
  if (values.allowAdminReminders === true || values.allowAdminReminders === false) {
    allowAdminReminders = values.allowAdminReminders;
  }
  return {
    organizationId: auth.organization.id,
    healthcareOrganizationId: auth.healthcareOrganization.id,
    facilityId: values.facilityId || (auth.selectedFacility && auth.selectedFacility.id),
    demographics: {
      firstName: values.firstName,
      middleName: values.middleName || null,
      lastName: values.lastName,
      preferredName: values.preferredName || null,
      dateOfBirth: values.dateOfBirth || null,
      estimatedDateOfBirth: values.estimatedDateOfBirth === true,
      sexAtRegistration: values.sexAtRegistration || null,
      nationalityCountryCode: values.nationalityCountryCode || null,
      primaryLanguage: values.primaryLanguage || null,
    },
    contacts: {
      phone: values.phone || null,
      email: values.email || null,
      preferredContactMethod: values.preferredContactMethod || null,
      allowAdminReminders,
    },
    address: {
      addressLine1: values.addressLine1 || null,
      addressLine2: values.addressLine2 || null,
      city: values.city || null,
      district: values.district || null,
      province: values.province || null,
      countryCode: values.countryCode || null,
      postalCode: values.postalCode || null,
    },
    identifiers,
    emergencyContacts,
    registrationMethod: values.registrationMethod || "walk_in",
    duplicateOverride: values.duplicateOverride === true,
    duplicateOverrideReason: values.duplicateOverrideReason || null,
    actor: actorFromAuth(auth),
  };
}

async function loadFacilityOptions(db, auth) {
  const listed = await listFacilitiesByOrganization(db, {
    organizationId: auth.organization.id,
  });
  const facilities = (listed.facilities || []).filter((f) =>
    ["active", "planned"].includes(f.status)
  );
  return facilities.map((f) => ({
    id: f.id,
    key: f.facilityKey,
    displayName: f.displayName,
    status: f.status,
  }));
}

async function loadActiveClinicPatientListScreen(db, input) {
  const auth = input.auth;
  const query = input.query || {};
  const perms = auth.permissions || [];
  if (!hasPerm(perms, PERM.SEARCH) && !hasPerm(perms, PERM.VIEW)) {
    return { ok: false, code: PATIENT_RESULT.ACCESS_DENIED };
  }

  const filters = {
    q: String(query.q || "").trim(),
    patientNumber: String(query.patient_number || "").trim(),
    phone: String(query.phone || "").trim(),
    dateOfBirth: String(query.dob || query.date_of_birth || "").trim(),
    status: String(query.status || "").trim(),
    facilityId: String(query.facility || "").trim(),
    active: false,
  };
  filters.active = Boolean(
    filters.q ||
      filters.patientNumber ||
      filters.phone ||
      filters.dateOfBirth ||
      filters.status ||
      filters.facilityId
  );

  const searchInput = {
    organizationId: auth.organization.id,
    healthcareOrganizationId: auth.healthcareOrganization.id,
    actor: actorFromAuth(auth),
    facilityId:
      filters.facilityId ||
      (auth.selectedFacility && auth.selectedFacility.id) ||
      null,
    patientNumber: filters.patientNumber || null,
    nameQuery: filters.q || null,
    phone: filters.phone || null,
    dateOfBirth: filters.dateOfBirth || null,
    status: filters.status || null,
    limit: 50,
    offset: 0,
  };

  const listed = await searchActiveClinicPatients(db, searchInput);
  let results = [];
  let emptyMode = null;
  if (!listed.ok && listed.code === "query_too_short") {
    emptyMode = "query_too_short";
  } else if (!listed.ok) {
    return { ok: false, code: listed.code };
  } else {
    results = listed.results || [];
    if (!results.length && filters.active) emptyMode = "filtered";
    else if (!results.length) emptyMode = "none";
  }

  const facilities = await loadFacilityOptions(db, auth);

  return {
    ok: true,
    list: {
      patients: results,
      filters,
      filterOptions: {
        statuses: STATUSES.map((s) => ({ value: s, label: STATUS_LABELS[s] || s })),
        facilities: facilities.map((f) => ({ value: f.id, label: f.displayName })),
      },
      resultCount: results.length,
      emptyMode,
      actions: {
        canCreate: hasPerm(perms, PERM.CREATE),
        createHref: "/app/patients/new",
      },
      stitch: {
        desktop: "5a6728d97b674200823562bb015e10ed",
        mobile: "58bd5e04f71340ff8d067721eb5562d4",
      },
    },
  };
}

async function loadActiveClinicPatientFormScreen(db, input) {
  const auth = input.auth;
  const perms = auth.permissions || [];
  const mode = input.mode || "create";
  if (mode === "create" && !hasPerm(perms, PERM.CREATE)) {
    return { ok: false, code: PATIENT_RESULT.ACCESS_DENIED };
  }
  if (mode === "edit" && !hasPerm(perms, PERM.UPDATE)) {
    return { ok: false, code: PATIENT_RESULT.ACCESS_DENIED };
  }

  const facilities = await loadFacilityOptions(db, auth);
  const values = { ...emptyFormValues(), ...(input.values || {}) };
  if (!values.facilityId && auth.selectedFacility) {
    values.facilityId = auth.selectedFacility.id;
  }

  return {
    ok: true,
    form: {
      mode,
      values,
      errors: input.errors || [],
      fieldErrors: input.fieldErrors || {},
      duplicateMatches: input.duplicateMatches || [],
      facilities,
      sexOptions: SEX_VALUES.map((v) => ({ value: v, label: SEX_LABELS[v] || v })),
      methodOptions: REGISTRATION_METHODS.map((v) => ({
        value: v,
        label: METHOD_LABELS[v] || v,
      })),
      identifierOptions: IDENTIFIER_TYPES.map((v) => ({
        value: v,
        label: IDENTIFIER_LABELS[v] || v,
      })),
      formAction:
        mode === "edit"
          ? `/app/patients/${encodeURIComponent(input.patientNumber)}`
          : "/app/patients",
      patientNumber: input.patientNumber || null,
      canOverrideDuplicate: hasPerm(perms, PERM.DUPLICATE_OVERRIDE),
      stitch: {
        identity: "40d2005b64864f35ac8df831ddae7084",
        contact: "e1ef5e5d8a1840bcbf1f4dc859f7b812",
        emergency: "026d2e6c69cd4181a282213ba1bb55da",
        review: "8ef4b4d96f1f4224994d0c627bb7550e",
        duplicate: "91e41fecc2b64496893b52317b7ab985",
        editDesktop: "0c3315d05469499d9b645bc7978001bf",
        editMobile: "4c6a5fe1c21c46709679f3707b8bf4dc",
      },
    },
  };
}

async function loadActiveClinicPatientProfileScreen(db, input) {
  const auth = input.auth;
  const perms = auth.permissions || [];
  if (!hasPerm(perms, PERM.VIEW)) {
    return { ok: false, code: PATIENT_RESULT.ACCESS_DENIED };
  }

  const got = await resolvePatientForActor(db, {
    organizationId: auth.organization.id,
    healthcareOrganizationId: auth.healthcareOrganization.id,
    patientNumber: input.patientNumber,
    facilityId: auth.selectedFacility && auth.selectedFacility.id,
    actor: actorFromAuth(auth),
  });
  if (!got.ok) return { ok: false, code: got.code };

  const patient = got.patient;
  const canSensitive = hasPerm(perms, PERM.VIEW_SENSITIVE);
  const canManageId = hasPerm(perms, PERM.MANAGE_IDENTIFIERS);

  const identifiers = await listPatientIdentifiers(db, {
    organizationId: auth.organization.id,
    healthcareOrganizationId: auth.healthcareOrganization.id,
    patientId: patient.id,
    actor: actorFromAuth(auth),
    facilityId: auth.selectedFacility && auth.selectedFacility.id,
  });

  let emergency = { ok: true, contacts: [] };
  if (canSensitive) {
    emergency = await listEmergencyContacts(db, {
      organizationId: auth.organization.id,
      healthcareOrganizationId: auth.healthcareOrganization.id,
      patientId: patient.id,
      actor: actorFromAuth(auth),
      facilityId: auth.selectedFacility && auth.selectedFacility.id,
    });
  }

  const registrations = await registrationRepo.listRegistrationsByPatient(db, {
    organizationId: auth.organization.id,
    healthcareOrganizationId: auth.healthcareOrganization.id,
    patientId: patient.id,
  });
  const links = await registrationRepo.listFacilityLinksByPatient(db, {
    organizationId: auth.organization.id,
    healthcareOrganizationId: auth.healthcareOrganization.id,
    patientId: patient.id,
    includeInactive: true,
  });

  const facilities = await loadFacilityOptions(db, auth);
  const facilityName = (id) => {
    const f = facilities.find((x) => String(x.id) === String(id));
    return f ? f.displayName : "Facility";
  };

  return {
    ok: true,
    profile: {
      patient: {
        ...patient,
        displayName: formatPatientDisplayName(patient),
        approximateAge: formatApproximateAge(
          patient.dateOfBirth,
          patient.estimatedDateOfBirth
        ),
        statusLabel: STATUS_LABELS[patient.status] || patient.status,
        sexLabel: patient.sexAtRegistration
          ? SEX_LABELS[patient.sexAtRegistration] || patient.sexAtRegistration
          : null,
        phoneDisplay: canSensitive
          ? patient.phoneDisplay
          : maskPhone(patient.phoneNormalized),
        emailDisplay: canSensitive
          ? patient.emailDisplay
          : maskEmail(patient.emailNormalized),
        showAddress: canSensitive,
      },
      identifiers: identifiers.ok ? identifiers.identifiers : [],
      emergencyContacts: emergency.ok ? emergency.contacts : [],
      emergencyHidden: !canSensitive,
      registrations: registrations.map((r) => ({
        id: r.id,
        facilityName: facilityName(r.facility_id),
        registeredAt: r.registered_at,
        method: METHOD_LABELS[r.registration_method] || r.registration_method,
        isInitial: r.is_initial === true,
        status: r.status,
      })),
      facilityLinks: links.map((l) => ({
        id: l.id,
        facilityName: facilityName(l.facility_id),
        relationshipType: l.relationship_type,
        status: l.status,
        firstSeenAt: l.first_seen_at,
        lastSeenAt: l.last_seen_at,
      })),
      actions: {
        canEdit: hasPerm(perms, PERM.UPDATE) && patient.status !== "archived",
        canArchive: hasPerm(perms, PERM.ARCHIVE) && patient.status !== "archived",
        canMarkDeceased:
          hasPerm(perms, PERM.ARCHIVE) && patient.status !== "deceased",
        canManageIdentifiers: canManageId,
        canManageEmergency: hasPerm(perms, PERM.UPDATE) && canSensitive,
        editHref: `/app/patients/${encodeURIComponent(patient.patientNumber)}/edit`,
      },
      stitch: {
        desktop: "1a15f0bf4e564c4993ca33aa2d578a58",
        mobile: "99eb441b48a24fa19855e76669c0da86",
      },
    },
  };
}

function patientFormFromPatient(patient) {
  return {
    ...emptyFormValues(),
    firstName: patient.firstName || "",
    middleName: patient.middleName || "",
    lastName: patient.lastName || "",
    preferredName: patient.preferredName || "",
    dateOfBirth: patient.dateOfBirth
      ? String(patient.dateOfBirth).slice(0, 10)
      : "",
    estimatedDateOfBirth: patient.estimatedDateOfBirth === true,
    sexAtRegistration: patient.sexAtRegistration || "",
    nationalityCountryCode: patient.nationalityCountryCode || "",
    primaryLanguage: patient.primaryLanguage || "",
    phone: patient.phoneDisplay || patient.phoneNormalized || "",
    email: patient.emailDisplay || patient.emailNormalized || "",
    addressLine1: patient.addressLine1 || "",
    addressLine2: patient.addressLine2 || "",
    city: patient.city || "",
    district: patient.district || "",
    province: patient.province || "",
    countryCode: patient.countryCode || "",
    postalCode: patient.postalCode || "",
    preferredContactMethod: patient.preferredContactMethod || "",
    allowAdminReminders:
      patient.allowAdminReminders === true
        ? true
        : patient.allowAdminReminders === false
          ? false
          : "",
  };
}

module.exports = {
  STATUS_LABELS,
  SEX_LABELS,
  METHOD_LABELS,
  IDENTIFIER_LABELS,
  parsePatientFormBody,
  buildRegistrationPayload,
  patientFormFromPatient,
  loadActiveClinicPatientListScreen,
  loadActiveClinicPatientFormScreen,
  loadActiveClinicPatientProfileScreen,
  maskIdentifier,
};
