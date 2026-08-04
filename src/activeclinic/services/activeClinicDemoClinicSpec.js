"use strict";

/**
 * Idempotent ActiveClinic demo-clinic content specifications.
 * Fictional demonstration content only — never copy real clinical records.
 */

const DEMO_BANNER = "Demonstration clinic — sample information only";
const SAMPLE_PROFILE_DISCLAIMER = "Sample profile for demonstration only";

const DEMO_CLINIC_KEY = "activeclinic-demo";
const JULFLONA_CLINIC_KEY = "julflona-clinic";

const ALLOWED_SEED_ENVIRONMENTS = Object.freeze(["testing", "demo"]);

const HOURS = Object.freeze({
  Mon: "08:00–17:00",
  Tue: "08:00–17:00",
  Wed: "08:00–17:00",
  Thu: "08:00–17:00",
  Fri: "08:00–16:00",
  Sat: "09:00–12:00",
  Sun: "Closed",
});

const SHARED_SERVICES = Object.freeze([
  {
    serviceKey: "general-consultation",
    displayName: "General consultation",
    description: "Sample general outpatient consultation for demonstration.",
    publicSummary:
      "A demonstration general consultation entry. Not a real clinical service offer.",
    durationMinutes: 30,
  },
  {
    serviceKey: "child-wellness",
    displayName: "Child wellness consultation",
    description: "Sample child wellness visit entry for demonstration websites.",
    publicSummary: "Demonstration child wellness consultation listing only.",
    durationMinutes: 30,
  },
  {
    serviceKey: "antenatal-consultation",
    displayName: "Antenatal consultation",
    description: "Sample antenatal consultation listing for demonstration.",
    publicSummary: "Demonstration antenatal consultation entry only.",
    durationMinutes: 40,
  },
  {
    serviceKey: "blood-pressure-check",
    displayName: "Blood pressure check",
    description: "Sample blood pressure check listing for demonstration.",
    publicSummary: "Demonstration vital-check listing only.",
    durationMinutes: 15,
  },
  {
    serviceKey: "lab-sample-collection",
    displayName: "Basic laboratory sample collection",
    description: "Sample laboratory collection listing for demonstration.",
    publicSummary: "Demonstration lab sample-collection entry only.",
    durationMinutes: 20,
  },
  {
    serviceKey: "medication-review",
    displayName: "Medication review",
    description: "Sample medication review listing for demonstration.",
    publicSummary: "Demonstration medication review entry only.",
    durationMinutes: 25,
  },
  {
    serviceKey: "follow-up-consultation",
    displayName: "Follow-up consultation",
    description: "Sample follow-up consultation listing for demonstration.",
    publicSummary: "Demonstration follow-up consultation entry only.",
    durationMinutes: 20,
  },
]);

const SHARED_PROCEDURES = Object.freeze([
  {
    procedureKey: "basic-lab-panel",
    displayName: "Basic laboratory panel (sample)",
    summary: "Demonstration diagnostic panel listing. Not a real lab order.",
    category: "diagnostic",
    referralRequired: false,
    preparationInstructions:
      "Sample preparation note for demonstration only. Follow real clinic guidance when booking a live facility.",
    estimatedDurationMinutes: 30,
  },
  {
    procedureKey: "blood-pressure-series",
    displayName: "Blood pressure series (sample)",
    summary: "Demonstration procedure listing for public booking UX.",
    category: "procedure",
    referralRequired: false,
    preparationInstructions: null,
    estimatedDurationMinutes: 20,
  },
]);

function clinicSpec(overrides) {
  return Object.freeze({
    organizationKey: overrides.organizationKey,
    platformDisplayName: overrides.platformDisplayName,
    healthcarePublicName: overrides.healthcarePublicName,
    healthcareLegalName: overrides.healthcareLegalName,
    facilityKey: overrides.facilityKey || "lusaka",
    facilityDisplayName: overrides.facilityDisplayName,
    productTenantKey: overrides.productTenantKey || overrides.organizationKey,
    dataEnvironment: "demo",
    countryCode: "ZM",
    province: "Lusaka Province",
    city: "Lusaka",
    timezone: "Africa/Lusaka",
    currency: "ZMW",
    addressLine1: overrides.addressLine1,
    facilityPhone: overrides.facilityPhone,
    publicPhoneDisplay: overrides.publicPhoneDisplay,
    publicEmailDisplay: overrides.publicEmailDisplay,
    websiteTagline: DEMO_BANNER,
    websiteAbout: overrides.websiteAbout,
    websiteLogoUrl: null,
    publicHours: HOURS,
    services: SHARED_SERVICES,
    procedures: SHARED_PROCEDURES,
    clinicians: overrides.clinicians,
    admin: overrides.admin || null,
  });
}

const ACTIVECLINIC_DEMO = clinicSpec({
  organizationKey: DEMO_CLINIC_KEY,
  platformDisplayName: "ActiveClinic Demo Centre",
  healthcarePublicName: "ActiveClinic Demo Centre",
  healthcareLegalName: "ActiveClinic Demo Centre (Sample)",
  facilityDisplayName: "ActiveClinic Demo Centre – Lusaka",
  addressLine1: "Demo Campus, Cairo Road (sample address)",
  facilityPhone: "+260900000101",
  publicPhoneDisplay: "+260 900 000 101 (demo)",
  publicEmailDisplay: "demo.centre@activeclinic.example",
  websiteAbout:
    "ActiveClinic Demo Centre is a fictional demonstration clinic used to show public website, directory, booking entry, and patient-portal handoff screens. All clinical names, contacts, and profiles are sample information only.",
  clinicians: Object.freeze([
    {
      profileKey: "dr-demo-chanda",
      firstName: "Demo",
      lastName: "Chanda",
      displayName: "Dr. Demo Chanda",
      title: "Sample clinician — demonstration only",
      bio: `${SAMPLE_PROFILE_DISCLAIMER}. Fictional general clinician profile for ActiveClinic public pages.`,
      phone: "+260900000111",
    },
    {
      profileKey: "nurse-demo-mwila",
      firstName: "Demo",
      lastName: "Mwila",
      displayName: "Nurse Demo Mwila",
      title: "Sample nurse — demonstration only",
      bio: `${SAMPLE_PROFILE_DISCLAIMER}. Fictional nursing profile for ActiveClinic public pages.`,
      phone: "+260900000112",
    },
    {
      profileKey: "dr-demo-phiri",
      firstName: "Demo",
      lastName: "Phiri",
      displayName: "Dr. Demo Phiri",
      title: "Sample clinician — demonstration only",
      bio: `${SAMPLE_PROFILE_DISCLAIMER}. Fictional clinician profile for ActiveClinic public pages.`,
      phone: "+260900000113",
    },
  ]),
  admin: Object.freeze({
    email: "demo.admin@activeclinic.example",
    displayName: "ActiveClinic Demo Administrator",
    firstName: "Demo",
    lastName: "Administrator",
    phone: "+260900000100",
    jobTitle: "Clinic Administrator (demo)",
  }),
});

const JULFLONA_CLINIC = clinicSpec({
  organizationKey: JULFLONA_CLINIC_KEY,
  platformDisplayName: "Julflona Clinic",
  healthcarePublicName: "Julflona Clinic",
  healthcareLegalName: "Julflona Clinic (Sample Demonstration)",
  facilityDisplayName: "Julflona Clinic – Lusaka",
  addressLine1: "Sample Julflona Way, Lusaka (demonstration address)",
  facilityPhone: "+260900000201",
  publicPhoneDisplay: "+260 900 000 201 (demo)",
  publicEmailDisplay: "hello@julflona.example",
  websiteAbout:
    "Julflona Clinic is a fictional ActiveClinic demonstration tenant created for product walkthroughs. Content mirrors the supported public-page structure used in Juflona-style Stitch references, without copying private operational or clinical records.",
  clinicians: Object.freeze([
    {
      profileKey: "dr-julflona-banda",
      firstName: "Julflona",
      lastName: "Banda",
      displayName: "Dr. Julflona Banda",
      title: "Sample clinician — demonstration only",
      bio: `${SAMPLE_PROFILE_DISCLAIMER}. Fictional Julflona clinician profile for public demonstration pages.`,
      phone: "+260900000211",
    },
    {
      profileKey: "nurse-julflona-tembo",
      firstName: "Julflona",
      lastName: "Tembo",
      displayName: "Nurse Julflona Tembo",
      title: "Sample nurse — demonstration only",
      bio: `${SAMPLE_PROFILE_DISCLAIMER}. Fictional Julflona nursing profile for public demonstration pages.`,
      phone: "+260900000212",
    },
    {
      profileKey: "dr-julflona-mwansa",
      firstName: "Julflona",
      lastName: "Mwansa",
      displayName: "Dr. Julflona Mwansa",
      title: "Sample clinician — demonstration only",
      bio: `${SAMPLE_PROFILE_DISCLAIMER}. Fictional Julflona clinician profile for public demonstration pages.`,
      phone: "+260900000213",
    },
  ]),
  admin: Object.freeze({
    email: "julflona@gmail.com",
    displayName: "Julflona Clinic Administrator",
    firstName: "Julflona",
    lastName: "Administrator",
    phone: "+260900000200",
    jobTitle: "Clinic Administrator",
  }),
});

const CLINIC_SPECS = Object.freeze({
  [DEMO_CLINIC_KEY]: ACTIVECLINIC_DEMO,
  [JULFLONA_CLINIC_KEY]: JULFLONA_CLINIC,
});

module.exports = {
  DEMO_BANNER,
  SAMPLE_PROFILE_DISCLAIMER,
  DEMO_CLINIC_KEY,
  JULFLONA_CLINIC_KEY,
  ALLOWED_SEED_ENVIRONMENTS,
  CLINIC_SPECS,
  ACTIVECLINIC_DEMO,
  JULFLONA_CLINIC,
};
