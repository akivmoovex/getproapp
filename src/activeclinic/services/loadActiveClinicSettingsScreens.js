"use strict";

/**
 * ActiveClinic organization settings screen loaders (AC-V6-S07).
 * Stitch settings screens are STITCH_GAP / VISUAL_BLOCKED.
 */

const {
  ORGANIZATION_TYPES,
  STATUSES,
  getHealthcareOrganizationByOrganizationId,
  updateHealthcareOrganization,
  RESULT: HCO_RESULT,
} = require("./healthcareOrganizationService");
const {
  listFacilitiesByOrganization,
} = require("./facilityService");
const {
  listStaffMembersByOrganization,
} = require("./activeClinicStaffService");
const {
  getOrganizationProduct,
} = require("../../platform/services/organizationProductService");
const {
  listActiveClinicTimezoneOptions,
  normalizeTimezone,
} = require("./normalizeActiveClinicContact");
const accessRepo = require("../repositories/staffAccessRepository");
const { NETWORK_ADMIN } = require("./activeClinicAuthorizationService");

const RESULT = Object.freeze({
  OK: "ok",
  DENIED: "access_denied",
  NOT_FOUND: "healthcare_organization_not_found",
  INVALID_INPUT: HCO_RESULT.INVALID_INPUT,
  INVALID_TYPE: HCO_RESULT.INVALID_TYPE,
  ...HCO_RESULT,
});

const ORGANIZATION_TYPE_LABELS = Object.freeze({
  independent_facility: "Independent facility",
  healthcare_network: "Healthcare network",
  faith_based_healthcare: "Faith-based healthcare",
  government_healthcare: "Government healthcare",
  non_profit_healthcare: "Non-profit healthcare",
  private_healthcare: "Private healthcare",
  other: "Other",
});

const HCO_STATUS_LABELS = Object.freeze({
  active: "Active",
  inactive: "Inactive",
  suspended: "Suspended",
  archived: "Archived",
});

const ENROLMENT_STATUS_LABELS = Object.freeze({
  active: "ActiveClinic enabled",
  suspended: "ActiveClinic suspended",
  inactive: "ActiveClinic inactive",
  pending: "ActiveClinic pending",
});

const PLATFORM_ORG_STATUS_LABELS = Object.freeze({
  active: "Platform organization active",
  suspended: "Platform organization suspended",
  inactive: "Platform organization inactive",
  archived: "Platform organization archived",
});

const COMMON_COUNTRIES = Object.freeze([
  { value: "ZM", label: "Zambia (ZM)" },
  { value: "ZW", label: "Zimbabwe (ZW)" },
  { value: "ZA", label: "South Africa (ZA)" },
  { value: "MW", label: "Malawi (MW)" },
  { value: "TZ", label: "Tanzania (TZ)" },
  { value: "KE", label: "Kenya (KE)" },
  { value: "NG", label: "Nigeria (NG)" },
  { value: "GH", label: "Ghana (GH)" },
  { value: "UG", label: "Uganda (UG)" },
  { value: "BW", label: "Botswana (BW)" },
  { value: "GB", label: "United Kingdom (GB)" },
  { value: "US", label: "United States (US)" },
]);

function hasPerm(perms, key) {
  return Array.isArray(perms) ? perms.includes(key) : false;
}

function organizationTypeLabel(type) {
  return ORGANIZATION_TYPE_LABELS[type] || String(type || "—");
}

function hcoStatusLabel(status) {
  return HCO_STATUS_LABELS[status] || String(status || "—");
}

function mapPrimaryFacility(facility) {
  if (!facility) return null;
  const operational = facility.status === "active";
  return {
    displayName: facility.displayName,
    facilityKey: facility.facilityKey,
    facilityType: facility.facilityType,
    facilityTypeLabel: String(facility.facilityType || "—")
      .replace(/_/g, " ")
      .replace(/^\w/, (c) => c.toUpperCase()),
    city: facility.city || null,
    district: facility.district || null,
    phoneDisplay: facility.phoneDisplay || null,
    status: facility.status,
    statusLabel: hcoStatusLabel(facility.status) === facility.status
      ? String(facility.status || "—")
      : String(facility.status || "—"),
    operational,
    href: facility.facilityKey
      ? `/app/facilities/${encodeURIComponent(facility.facilityKey)}`
      : "/app/facilities",
    locationSummary: [facility.city, facility.district].filter(Boolean).join(", ") || null,
  };
}

/**
 * Deterministic setup checks (no fabricated percentage).
 * Documented in AC_V6_S07_ORGANIZATION_SETTINGS_PARITY.md.
 */
function calculateOrganizationSetupState(input) {
  const hco = input.healthcareOrganization;
  const primary = input.primaryFacility;
  const checks = [
    {
      key: "public_name",
      label: "Public name",
      ok: Boolean(hco && String(hco.publicName || "").trim()),
    },
    {
      key: "legal_name",
      label: "Legal name",
      ok: Boolean(hco && String(hco.legalName || "").trim()),
    },
    {
      key: "country",
      label: "Country",
      ok: Boolean(hco && String(hco.countryCode || "").trim()),
    },
    {
      key: "timezone",
      label: "Timezone",
      ok: Boolean(hco && normalizeTimezone(hco.timezone).ok),
    },
    {
      key: "organization_type",
      label: "Organization type",
      ok: Boolean(hco && ORGANIZATION_TYPES.includes(hco.organizationType)),
    },
    {
      key: "primary_facility",
      label: "Primary facility",
      ok: Boolean(primary && primary.operational),
    },
    {
      key: "primary_facility_phone",
      label: "Primary facility phone",
      ok: Boolean(primary && primary.operational && primary.phoneDisplay),
    },
    {
      key: "active_administrator",
      label: "Active administrator",
      ok: input.hasActiveAdministrator === true,
    },
  ];
  const missing = checks.filter((c) => !c.ok);
  const complete = missing.length === 0;
  return {
    complete,
    label: complete ? "Profile complete" : "Setup incomplete",
    actionRequired: missing.length > 0,
    checks,
    missing,
  };
}

async function hasActiveNetworkAdministrator(db, organizationId) {
  const rows = await accessRepo.listRoleAssignmentsForOrganization(db, {
    organizationId,
    status: "effective",
    roleKey: NETWORK_ADMIN,
  });
  return rows.some((r) => String(r.staff_status) === "active");
}

async function getPrimaryFacilitySummary(db, organizationId) {
  const listed = await listFacilitiesByOrganization(db, {
    organizationId,
    status: null,
  });
  const facilities = listed.ok ? listed.facilities || [] : [];
  const activeCount = facilities.filter((f) => f.status === "active").length;
  const primaryRow = facilities.find((f) => f.isPrimary === true) || null;
  const primary = mapPrimaryFacility(primaryRow);
  if (primary && !primary.operational) {
    // Do not present archived/inactive as operational primary.
    return {
      primary: {
        ...primary,
        operational: false,
        incompleteReason: "primary_not_operational",
      },
      activeCount,
      totalCount: facilities.length,
    };
  }
  return {
    primary,
    activeCount,
    totalCount: facilities.length,
  };
}

async function loadSafeEnrolmentSummary(db, organizationId) {
  const got = await getOrganizationProduct(db, {
    organizationId,
    applicationCode: "activeclinic",
  });
  if (!got.ok || !got.organizationProduct) {
    return {
      productEnrolmentStatus: "inactive",
      productEnrolmentLabel: "ActiveClinic not enabled",
      platformOrganizationStatus: null,
      platformOrganizationLabel: null,
    };
  }
  const enrolment = got.organizationProduct;
  return {
    productEnrolmentStatus: enrolment.status,
    productEnrolmentLabel:
      ENROLMENT_STATUS_LABELS[enrolment.status] || "ActiveClinic enrolment",
    platformOrganizationStatus: enrolment.organizationStatus || null,
    platformOrganizationLabel: enrolment.organizationStatus
      ? PLATFORM_ORG_STATUS_LABELS[enrolment.organizationStatus] ||
        `Platform organization ${enrolment.organizationStatus}`
      : null,
  };
}

async function loadActiveClinicSettingsOverviewScreen(db, input) {
  const auth = input.auth;
  const perms = auth.permissions || [];
  if (!hasPerm(perms, "activeclinic.access")) {
    return { ok: false, code: RESULT.DENIED, restricted: true };
  }

  const hcoResult = await getHealthcareOrganizationByOrganizationId(db, {
    organizationId: auth.organization.id,
  });
  const hco = hcoResult.ok ? hcoResult.healthcareOrganization : null;
  const facilitySummary = await getPrimaryFacilitySummary(db, auth.organization.id);
  const enrolment = await loadSafeEnrolmentSummary(db, auth.organization.id);
  const hasAdmin = hco
    ? await hasActiveNetworkAdministrator(db, auth.organization.id)
    : false;
  const setup = calculateOrganizationSetupState({
    healthcareOrganization: hco,
    primaryFacility: facilitySummary.primary,
    hasActiveAdministrator: hasAdmin,
  });

  let activeStaffCount = null;
  if (hasPerm(perms, "activeclinic.staff.view")) {
    const staff = await listStaffMembersByOrganization(db, {
      organizationId: auth.organization.id,
      status: "active",
    });
    activeStaffCount = (staff.staffMembers || []).length;
  }

  const categories = [];
  if (hasPerm(perms, "activeclinic.organization.view") && hco) {
    categories.push({
      key: "organization",
      title: "Organization profile",
      description: "Legal and public identity, country, and timezone.",
      href: "/app/settings/organization",
      statusLabel: setup.label,
      summary: hco.publicName || hco.legalName,
    });
  }
  if (hasPerm(perms, "activeclinic.facility.view")) {
    categories.push({
      key: "facilities",
      title: "Facilities",
      description: "Facility catalogue and primary facility.",
      href: "/app/settings/facilities",
      statusLabel: facilitySummary.primary
        ? facilitySummary.primary.operational
          ? "Primary configured"
          : "Primary needs attention"
        : "No primary facility",
      summary:
        facilitySummary.activeCount === 1
          ? "1 active facility"
          : `${facilitySummary.activeCount} active facilities`,
    });
  }
  if (hasPerm(perms, "activeclinic.staff.view")) {
    categories.push({
      key: "staff",
      title: "Staff",
      description: "Staff directory for this organization.",
      href: "/app/staff",
      statusLabel:
        activeStaffCount == null
          ? "Available"
          : `${activeStaffCount} active`,
      summary: "Manage staff profiles",
    });
  }
  if (hasPerm(perms, "activeclinic.staff.assign_access")) {
    categories.push({
      key: "access",
      title: "Roles and access",
      description: "Foundational role assignments and scopes.",
      href: "/app/settings/access",
      statusLabel: "Manage access",
      summary: "Network, facility, and staff roles",
    });
  }
  categories.push({
    key: "account",
    title: "Account security",
    description: "Password and signed-in session for your login identity.",
    href: "/app/settings/account",
    statusLabel: "Your account",
    summary:
      (auth.staffMember && auth.staffMember.displayName) ||
      "Change password and session",
  });

  return {
    ok: true,
    code: RESULT.OK,
    overview: {
      organizationName:
        (hco && (hco.publicName || hco.legalName)) ||
        (auth.organization && auth.organization.displayName) ||
        "Organization",
      healthcareOrganization: hco
        ? {
            publicName: hco.publicName,
            legalName: hco.legalName,
            statusLabel: hcoStatusLabel(hco.status),
            typeLabel: organizationTypeLabel(hco.organizationType),
          }
        : null,
      enrolment,
      primaryFacility: facilitySummary.primary,
      activeFacilityCount: facilitySummary.activeCount,
      activeStaffCount,
      setup,
      categories,
      emptyMode: categories.length ? null : "restricted",
      selectedFacility: auth.selectedFacility
        ? {
            displayName: auth.selectedFacility.displayName,
            facilityKey: auth.selectedFacility.facilityKey,
          }
        : null,
    },
  };
}

function buildProfileViewModel(input) {
  const hco = input.healthcareOrganization;
  const enrolment = input.enrolment;
  const facilitySummary = input.facilitySummary;
  const setup = input.setup;
  const canManage = input.canManage === true;
  const canViewFacilities = input.canViewFacilities === true;

  return {
    identity: {
      publicName: hco.publicName,
      legalName: hco.legalName,
      organizationType: hco.organizationType,
      organizationTypeLabel: organizationTypeLabel(hco.organizationType),
      registrationNumber: hco.registrationNumber || null,
    },
    locale: {
      countryCode: hco.countryCode,
      timezone: hco.timezone,
      timezoneNote: "Dates and times in ActiveClinic use this organization timezone.",
      primaryLocation: facilitySummary.primary
        ? facilitySummary.primary.locationSummary
        : null,
    },
    status: {
      healthcareOrganizationStatus: hco.status,
      healthcareOrganizationLabel: hcoStatusLabel(hco.status),
      productEnrolmentStatus: enrolment.productEnrolmentStatus,
      productEnrolmentLabel: enrolment.productEnrolmentLabel,
      platformOrganizationStatus: enrolment.platformOrganizationStatus,
      platformOrganizationLabel: enrolment.platformOrganizationLabel,
      readOnly: true,
    },
    facilities: {
      primary: facilitySummary.primary,
      activeCount: facilitySummary.activeCount,
      manageHref: canViewFacilities ? "/app/facilities" : null,
      configureHref:
        canViewFacilities && !facilitySummary.primary
          ? "/app/facilities"
          : null,
    },
    metadata: {
      createdAt: hco.createdAt || null,
      updatedAt: hco.updatedAt || null,
    },
    setup,
    actions: {
      canEdit: canManage,
      editHref: canManage ? "/app/settings/organization/edit" : null,
    },
  };
}

async function loadHealthcareOrganizationSettingsScreen(db, input) {
  const auth = input.auth;
  if (!hasPerm(auth.permissions, "activeclinic.organization.view")) {
    return { ok: false, code: RESULT.DENIED, restricted: true };
  }

  const hcoResult = await getHealthcareOrganizationByOrganizationId(db, {
    organizationId: auth.organization.id,
  });
  if (!hcoResult.ok) {
    return { ok: false, code: RESULT.NOT_FOUND };
  }

  const facilitySummary = await getPrimaryFacilitySummary(db, auth.organization.id);
  const enrolment = await loadSafeEnrolmentSummary(db, auth.organization.id);
  const hasAdmin = await hasActiveNetworkAdministrator(db, auth.organization.id);
  const setup = calculateOrganizationSetupState({
    healthcareOrganization: hcoResult.healthcareOrganization,
    primaryFacility: facilitySummary.primary,
    hasActiveAdministrator: hasAdmin,
  });

  return {
    ok: true,
    code: RESULT.OK,
    profile: buildProfileViewModel({
      healthcareOrganization: hcoResult.healthcareOrganization,
      enrolment,
      facilitySummary,
      setup,
      canManage: hasPerm(auth.permissions, "activeclinic.organization.manage"),
      canViewFacilities: hasPerm(auth.permissions, "activeclinic.facility.view"),
    }),
  };
}

async function loadEditHealthcareOrganizationScreen(db, input) {
  const auth = input.auth;
  if (!hasPerm(auth.permissions, "activeclinic.organization.manage")) {
    return { ok: false, code: RESULT.DENIED, restricted: true };
  }

  const hcoResult = await getHealthcareOrganizationByOrganizationId(db, {
    organizationId: auth.organization.id,
  });
  if (!hcoResult.ok) {
    return { ok: false, code: RESULT.NOT_FOUND };
  }
  const hco = hcoResult.healthcareOrganization;
  const values = input.values || {
    legalName: hco.legalName,
    publicName: hco.publicName,
    organizationType: hco.organizationType,
    countryCode: hco.countryCode,
    registrationNumber: hco.registrationNumber || "",
    timezone: hco.timezone,
  };

  const timezoneOptions = listActiveClinicTimezoneOptions();
  if (values.timezone && !timezoneOptions.includes(values.timezone)) {
    timezoneOptions.unshift(values.timezone);
  }

  return {
    ok: true,
    code: RESULT.OK,
    form: {
      mode: "edit",
      formAction: "/app/settings/organization",
      cancelHref: "/app/settings/organization",
      values,
      errors: input.errors || [],
      fieldErrors: input.fieldErrors || {},
      typeOptions: ORGANIZATION_TYPES.map((value) => ({
        value,
        label: organizationTypeLabel(value),
      })),
      countryOptions: COMMON_COUNTRIES,
      timezoneOptions: timezoneOptions.map((value) => ({ value, label: value })),
      typeChangeWarning:
        "Changing organization type does not move facilities or staff. Existing access and tenancy stay as they are.",
      timezoneNote:
        "Changing timezone does not rewrite historical timestamps. Future displays use the new zone.",
      statusNote: `Healthcare organization status (${hcoStatusLabel(
        hco.status
      )}) is read-only here.`,
    },
  };
}

async function updateHealthcareOrganizationSettings(db, input) {
  const auth = input.auth;
  if (!hasPerm(auth.permissions, "activeclinic.organization.manage")) {
    return { ok: false, code: RESULT.DENIED };
  }
  // Never trust client organization ID, status, or enrolment fields.
  const organizationId = auth.organization.id;

  const hcoResult = await getHealthcareOrganizationByOrganizationId(db, {
    organizationId,
  });
  if (!hcoResult.ok) return { ok: false, code: RESULT.NOT_FOUND };

  return updateHealthcareOrganization(db, {
    id: hcoResult.healthcareOrganization.id,
    organizationId,
    deploymentCode: input.deploymentCode,
    allowStatusChange: false,
    patch: {
      legalName: input.legalName,
      publicName: input.publicName,
      organizationType: input.organizationType,
      countryCode: input.countryCode,
      registrationNumber: input.registrationNumber,
      timezone: input.timezone,
    },
  });
}

module.exports = {
  RESULT,
  ORGANIZATION_TYPE_LABELS,
  HCO_STATUS_LABELS,
  ORGANIZATION_TYPES,
  STATUSES,
  organizationTypeLabel,
  hcoStatusLabel,
  calculateOrganizationSetupState,
  getPrimaryFacilitySummary,
  loadActiveClinicSettingsOverviewScreen,
  loadHealthcareOrganizationSettingsScreen,
  loadEditHealthcareOrganizationScreen,
  updateHealthcareOrganizationSettings,
};
