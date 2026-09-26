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
const {
  listPatientConsents,
  TYPE_LABELS: CONSENT_TYPE_LABELS,
  METHOD_LABELS: CONSENT_METHOD_LABELS,
  CONSENT_TYPES,
  CAPTURE_METHODS,
} = require("./activeClinicPatientConsentService");
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
const {
  buildPhoneFieldLocals,
  splitE164ForForm,
} = require("./activeClinicPhoneFieldLocals");
const { parseListQuery } = require("../../platform/http/listQuery");

const STATUS_LABELS = Object.freeze({
  active: "Active",
  inactive: "Inactive",
  deceased: "Deceased",
  archived: "Archived",
});

const STITCH = Object.freeze({
  /** V2.03 Batch 2 Patients List (project 7300898757945019896) */
  listDesktop: "04c24f7dd1d847e494733d32becc9534",
  listMobile: "ccb2201ff02641e199f1a58481fb2cc4",
  /** Batch 1 ACN11 profile — Batch 2 Stitch profile screen is ABSENT */
  profileDesktop: "63b85a8c28b84e9e81db2930c93c1217",
  profileMobile: "147ab133a55f41e6afc6faf3010f03e3",
});

const SEX_SHORT = Object.freeze({
  male: "M",
  female: "F",
  intersex: "I",
  unknown: "U",
  not_recorded: "—",
});

function patientInitials(displayName) {
  const parts = String(displayName || "")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (!parts.length) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0] || ""}${parts[parts.length - 1][0] || ""}`.toUpperCase();
}

function presentListPatient(row) {
  const displayName = row.displayName || "";
  const sex = row.sexAtRegistration || null;
  return {
    ...row,
    displayName,
    initials: patientInitials(displayName),
    statusLabel: STATUS_LABELS[row.status] || row.status,
    sexShort: sex ? SEX_SHORT[sex] || null : null,
    sexLabel: sex ? SEX_LABELS[sex] || sex : null,
    href: `/app/patients/${encodeURIComponent(row.patientNumber)}`,
  };
}

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
    phoneCountry: "",
    phoneNational: "",
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
    step: "find",
    returnTo: "",
    returnContext: "",
    creationMode: "full_registration",
    approximateAgeYears: "",
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
    phoneCountry: String(body.phone_country || "").trim().toUpperCase(),
    phoneNational: String(body.phone_national || "").trim(),
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
    emergencyPhoneCountry: String(body.emergency_phone_country || "").trim().toUpperCase(),
    emergencyPhoneNational: String(body.emergency_phone_national || "").trim(),
    emergencyEmail: String(body.emergency_email || "").trim(),
    nextOfKinFullName: String(body.next_of_kin_full_name || "").trim(),
    nextOfKinRelationship: String(body.next_of_kin_relationship || "").trim(),
    nextOfKinPhone: String(body.next_of_kin_phone || "").trim(),
    clinicFields: {
      insurance: String(body.clinic_field_insurance || "").trim(),
      referral_source: String(body.clinic_field_referral || "").trim(),
    },
    duplicateOverride: bool(body.duplicate_override),
    duplicateOverrideReason: String(body.duplicate_override_reason || "").trim(),
    step: String(body.step || "edit").trim(),
    returnTo: String(body.return_to || "").trim(),
    returnContext: String(body.return_context || "").trim(),
    creationMode: String(body.creation_mode || "full_registration").trim(),
    approximateAgeYears: String(body.approximate_age_years || "").trim(),
    findQuery: String(body.find_query || body.q || "").trim(),
    findPhone: String(body.find_phone || "").trim(),
    findPatientNumber: String(body.find_patient_number || "").trim(),
    findDob: String(body.find_dob || "").trim(),
    findIdentifier: String(body.find_identifier || "").trim(),
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
  const emergencyPhoneValue =
    values.emergencyPhoneNational || values.emergencyPhone || "";
  if (values.emergencyFullName && emergencyPhoneValue) {
    emergencyContacts.push({
      fullName: values.emergencyFullName,
      relationship: values.emergencyRelationship || "emergency_contact",
      phone: values.emergencyPhone || null,
      phoneCountry: values.emergencyPhoneCountry || null,
      phoneNational: values.emergencyPhoneNational || null,
      clinicDefaultCountry:
        (auth.healthcareOrganization && auth.healthcareOrganization.countryCode) || null,
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
      phoneCountry: values.phoneCountry || null,
      phoneNational: values.phoneNational || null,
      clinicDefaultCountry:
        (auth.healthcareOrganization && auth.healthcareOrganization.countryCode) || null,
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
    nextOfKin: {
      fullName: values.nextOfKinFullName || null,
      relationship: values.nextOfKinRelationship || null,
      phone: values.nextOfKinPhone || null,
      clinicDefaultCountry:
        (auth.healthcareOrganization && auth.healthcareOrganization.countryCode) ||
        null,
    },
    clinicFields: values.clinicFields || {},
    identifiers,
    emergencyContacts,
    registrationMethod: values.registrationMethod || "walk_in",
    duplicateOverride: values.duplicateOverride === true,
    duplicateOverrideReason: values.duplicateOverrideReason || null,
    creationMode: values.creationMode || "full_registration",
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

  const listQuery = parseListQuery(query, {
    defaultLimit: 25,
    maxLimit: 50,
    searchKeys: ["q"],
    filterKeys: ["patient_number", "phone", "dob", "date_of_birth", "status", "facility"],
  });

  const filters = {
    q: listQuery.q || String(query.q || "").trim(),
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
    clinicDefaultCountry:
      (auth.healthcareOrganization && auth.healthcareOrganization.countryCode) ||
      null,
    dateOfBirth: filters.dateOfBirth || null,
    status: filters.status || null,
    limit: listQuery.limit,
    offset: listQuery.offset,
  };

  const listed = await searchActiveClinicPatients(db, searchInput);
  let results = [];
  let emptyMode = null;
  let total = 0;
  if (!listed.ok && listed.code === "query_too_short") {
    emptyMode = "query_too_short";
  } else if (!listed.ok) {
    return { ok: false, code: listed.code };
  } else {
    results = (listed.results || []).map(presentListPatient);
    total = Number(listed.total);
    if (!Number.isFinite(total) || total < 0) total = results.length;
    if (!results.length && filters.active) emptyMode = "filtered";
    else if (!results.length) emptyMode = "none";
  }

  const facilities = await loadFacilityOptions(db, auth);
  const page = listQuery.page;
  const limit = listQuery.limit;
  const totalPages = Math.max(1, Math.ceil(total / limit) || 1);
  const paginationQuery = {
    q: filters.q || undefined,
    patient_number: filters.patientNumber || undefined,
    phone: filters.phone || undefined,
    dob: filters.dateOfBirth || undefined,
    status: filters.status || undefined,
    facility: filters.facilityId || undefined,
    limit: String(limit),
  };

  return {
    ok: true,
    list: {
      patients: results,
      filters,
      filterOptions: {
        statuses: STATUSES.map((s) => ({ value: s, label: STATUS_LABELS[s] || s })),
        facilities: facilities.map((f) => ({ value: f.id, label: f.displayName })),
      },
      resultCount: emptyMode ? 0 : total,
      page,
      limit,
      totalPages,
      pagination: {
        page,
        totalPages,
        baseHref: "/app/patients",
        query: paginationQuery,
      },
      emptyMode,
      actions: {
        canCreate: hasPerm(perms, PERM.CREATE),
        canQuickRegister:
          hasPerm(perms, PERM.QUICK_REGISTER) && !hasPerm(perms, PERM.CREATE),
        createHref: "/app/patients/new",
        quickRegisterHref: "/app/patients/quick-register",
      },
      unsupportedStitchColumns: [
        {
          key: "primary_care_provider",
          label: "Primary Care Provider",
          reason: "No PCP assignment on patient directory search results.",
        },
        {
          key: "last_visit",
          label: "Last Visit",
          reason: "Visit history is not aggregated on the patient list.",
        },
        {
          key: "next_appointment",
          label: "Next Appointment",
          reason: "Upcoming appointment is not joined into directory search.",
        },
      ],
      unsupportedStitchFilters: [
        "provider",
        "age_band",
        "recency",
        "import_export",
      ],
      stitch: {
        code: "AC-B2-02",
        desktop: STITCH.listDesktop,
        mobile: STITCH.listMobile,
      },
    },
  };
}

async function loadActiveClinicPatientFormScreen(db, input) {
  const auth = input.auth;
  const perms = auth.permissions || [];
  const mode = input.mode || "create";
  const quick = mode === "quick_create";
  if (mode === "create" && !hasPerm(perms, PERM.CREATE)) {
    return { ok: false, code: PATIENT_RESULT.ACCESS_DENIED };
  }
  if (
    quick &&
    !hasPerm(perms, PERM.QUICK_REGISTER) &&
    !hasPerm(perms, PERM.CREATE)
  ) {
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
  if (quick) {
    values.creationMode = "quick_registration";
    if (!values.step || values.step === "find") values.step = "edit";
  } else if (mode === "create" && !values.step) {
    values.step = "find";
  }
  if (!values.phoneCountry) {
    values.phoneCountry =
      (auth.healthcareOrganization && auth.healthcareOrganization.countryCode) || "ZM";
  }
  if (!values.emergencyPhoneCountry) {
    values.emergencyPhoneCountry = values.phoneCountry;
  }

  return {
    ok: true,
    form: {
      mode: quick ? "quick_create" : mode,
      values,
      errors: input.errors || [],
      fieldErrors: input.fieldErrors || {},
      duplicateMatches: input.duplicateMatches || [],
      findMatches: input.findMatches || [],
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
      canManageIdentifiers: hasPerm(perms, PERM.MANAGE_IDENTIFIERS),
      formAction:
        mode === "edit"
          ? `/app/patients/${encodeURIComponent(input.patientNumber)}`
          : quick
            ? "/app/patients/quick-register"
            : "/app/patients",
      patientNumber: input.patientNumber || null,
      canOverrideDuplicate: hasPerm(perms, PERM.DUPLICATE_OVERRIDE),
      returnTo: values.returnTo || "",
      returnContext: values.returnContext || "",
      ...buildPhoneFieldLocals({
        clinicDefaultCountry:
          (auth.healthcareOrganization && auth.healthcareOrganization.countryCode) || "ZM",
        selectedCountry:
          values.phoneCountry ||
          (auth.healthcareOrganization && auth.healthcareOrganization.countryCode) ||
          "ZM",
      }),
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

  let consents = [];
  try {
    const consentList = await listPatientConsents(db, {
      organizationId: auth.organization.id,
      healthcareOrganizationId: auth.healthcareOrganization.id,
      patientId: patient.id,
      actor: actorFromAuth(auth),
      facilityId: auth.selectedFacility && auth.selectedFacility.id,
      body: {},
    });
    if (consentList.ok) consents = consentList.consents;
  } catch (_err) {
    consents = [];
  }

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
        registrationIncomplete: patient.registrationStatus === "incomplete",
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
        nextOfKinFullName: canSensitive ? patient.nextOfKinFullName : null,
        nextOfKinRelationship: canSensitive ? patient.nextOfKinRelationship : null,
        nextOfKinPhoneDisplay: canSensitive
          ? patient.nextOfKinPhoneDisplay
          : maskPhone(patient.nextOfKinPhoneNormalized),
        clinicFields: patient.clinicFields || {},
      },
      identifiers: identifiers.ok ? identifiers.identifiers : [],
      emergencyContacts: emergency.ok ? emergency.contacts : [],
      emergencyHidden: !canSensitive,
      consents,
      consentOptions: {
        types: CONSENT_TYPES.map((v) => ({
          value: v,
          label: CONSENT_TYPE_LABELS[v] || v,
        })),
        methods: CAPTURE_METHODS.map((v) => ({
          value: v,
          label: CONSENT_METHOD_LABELS[v] || v,
        })),
      },
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
        canManageConsent: hasPerm(perms, PERM.UPDATE),
        canPrintCard: hasPerm(perms, PERM.VIEW),
        editHref: `/app/patients/${encodeURIComponent(patient.patientNumber)}/edit`,
        printCardHref: `/app/patients/${encodeURIComponent(patient.patientNumber)}/print-card`,
      },
      stitch: {
        desktop: STITCH.profileDesktop,
        mobile: STITCH.profileMobile,
        batch2: "absent",
        batch2Note:
          "AC-B2-03 Patient Profile is absent from Batch 2 Stitch project 7300898757945019896; keep ACN11 functional profile.",
      },
      ...buildPhoneFieldLocals({
        clinicDefaultCountry:
          (auth.healthcareOrganization && auth.healthcareOrganization.countryCode) ||
          "ZM",
      }),
    },
  };
}

/**
 * Printable patient identity card (Stitch P02 Print Patient Card Preview).
 * Uses only identity + non-clinical registration fields already on the profile.
 */
function formatPrintCardDate(value) {
  if (value == null || value === "") return null;
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    const y = value.getUTCFullYear();
    const m = String(value.getUTCMonth() + 1).padStart(2, "0");
    const d = String(value.getUTCDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }
  const text = String(value).trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(text)) return text.slice(0, 10);
  const parsed = new Date(text);
  if (!Number.isNaN(parsed.getTime())) {
    return formatPrintCardDate(parsed);
  }
  return text;
}

async function loadActiveClinicPatientPrintCardScreen(db, input) {
  const loaded = await loadActiveClinicPatientProfileScreen(db, input);
  if (!loaded.ok) return loaded;
  const patient = loaded.profile.patient;
  const orgName =
    (input.auth &&
      input.auth.healthcareOrganization &&
      (input.auth.healthcareOrganization.publicName ||
        input.auth.healthcareOrganization.legalName)) ||
    (input.auth && input.auth.organization && input.auth.organization.displayName) ||
    "ActiveClinic";
  const facilityName =
    (input.auth &&
      input.auth.selectedFacility &&
      input.auth.selectedFacility.displayName) ||
    null;
  return {
    ok: true,
    card: {
      organizationName: orgName,
      facilityName,
      patientNumber: patient.patientNumber,
      displayName: patient.displayName,
      dateOfBirth: formatPrintCardDate(patient.dateOfBirth),
      estimatedDateOfBirth: patient.estimatedDateOfBirth === true,
      approximateAge: patient.approximateAge || null,
      sexLabel: patient.sexLabel || null,
      status: patient.status,
      statusLabel: patient.statusLabel || patient.status,
      phoneDisplay: patient.phoneDisplay || null,
      printedAt: new Date().toISOString(),
      stitch: {
        desktop: "3c113fe684604dfcaeb8f6b2c071a6ca",
      },
    },
  };
}

function patientFormFromPatient(patient, clinicDefaultCountry) {
  const phoneParts = splitE164ForForm(
    patient.phoneNormalized || patient.phoneDisplay,
    clinicDefaultCountry || patient.countryCode || "ZM"
  );
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
    phoneCountry: phoneParts.country,
    phoneNational: phoneParts.national,
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
  loadActiveClinicPatientPrintCardScreen,
  maskIdentifier,
};
