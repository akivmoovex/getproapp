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
const departmentRepo = require("../repositories/departmentRepository");
const instanceRepo = require("../../platform/website/instanceRepository");
const submissionService = require("../../platform/website/submissionService");
const {
  NETWORK_ADMIN,
  ORGANIZATION_ADMIN,
  ORG_WIDE_ADMIN_ROLES,
} = require("./activeClinicAuthorizationService");

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
    id: facility.id || null,
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
    publicHoursJson: facility.publicHoursJson || null,
  };
}

const SETUP_CLASSIFICATION = Object.freeze({
  REQUIRED_FOR_OPERATIONS: "REQUIRED_FOR_OPERATIONS",
  RECOMMENDED: "RECOMMENDED",
});

/** Permissions that can change clinic setup — operational roles are excluded. */
const CLINIC_SETUP_ACTION_PERMISSIONS = Object.freeze([
  "activeclinic.organization.manage",
  "activeclinic.facility.create",
  "activeclinic.facility.update",
  "activeclinic.departments.manage",
  "activeclinic.staff.invite",
  "activeclinic.staff.assign_access",
  "website.edit",
]);

/**
 * Public hours are operationally optional today (no /app hours editor, used for
 * the public website). Non-empty JSON on the primary facility counts as set.
 */
function hasPublicHoursConfigured(hours) {
  let value = hours;
  if (value == null || value === "") return false;
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed || trimmed === "{}" || trimmed === "[]" || trimmed === "null") {
      return false;
    }
    try {
      value = JSON.parse(trimmed);
    } catch {
      return true;
    }
  }
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === "object") {
    return Object.keys(value).some((key) => {
      const entry = value[key];
      if (entry == null || entry === "") return false;
      if (typeof entry === "object") return Object.keys(entry).length > 0;
      return true;
    });
  }
  return false;
}

function websiteCurrentState(facts) {
  if (!facts || facts.provisioned !== true) return "not_provisioned";
  if (facts.published === true) return "published";
  const status = String(facts.latestSubmissionStatus || "").toLowerCase();
  if (status === "submitted") return "submitted";
  if (status === "changes_requested") return "changes_requested";
  return "draft";
}

function websiteItemComplete(state) {
  return state === "submitted" || state === "published";
}

function websiteItemLabel(state) {
  if (state === "published") return "Clinic website is public";
  if (state === "submitted") return "Clinic website submitted for publication";
  if (state === "changes_requested") return "Update clinic website after review";
  if (state === "draft") return "Finish clinic website draft";
  return "Set up clinic website";
}

function checkOk(checks, key) {
  const row = checks.find((c) => c.key === key);
  return Boolean(row && row.ok);
}

function setupItem(partial) {
  return {
    key: partial.key,
    label: partial.label,
    complete: Boolean(partial.complete),
    classification: partial.classification,
    destinationUrl: partial.destinationUrl || null,
    description: partial.description || "",
    currentState: partial.currentState || null,
    facilityContext: partial.facilityContext || null,
    actionPermissions: Array.isArray(partial.actionPermissions)
      ? partial.actionPermissions
      : [],
  };
}

/**
 * Deterministic setup checks (no fabricated percentage).
 * Documented in AC_V6_S07_ORGANIZATION_SETTINGS_PARITY.md.
 *
 * `complete` / `label` / `checks` / `missing` stay the original profile
 * semantics for settings consumers. Clinic-setup checklist items are additive.
 *
 * Department and public-hours checks apply to the HQ/primary facility only.
 * Optional secondary or inactive facilities never make the organization incomplete.
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

  const clinicKey = String(
    (input.clinicKey || (input.website && input.website.clinicKey) || "")
  ).trim();
  const websiteEditUrl = clinicKey
    ? `/clinics/${encodeURIComponent(clinicKey)}?website_edit=1&website_mode=draft`
    : "/app/settings";
  const primaryHref =
    (primary && primary.href) ||
    (primary && primary.facilityKey
      ? `/app/facilities/${encodeURIComponent(primary.facilityKey)}`
      : "/app/facilities");
  const facilityContext = primary
    ? {
        id: primary.id || null,
        facilityKey: primary.facilityKey || null,
        displayName: primary.displayName || null,
        operational: primary.operational === true,
      }
    : null;

  const items = [
    setupItem({
      key: "clinic_profile",
      label: "Complete clinic profile",
      complete:
        checkOk(checks, "public_name") &&
        checkOk(checks, "legal_name") &&
        checkOk(checks, "country") &&
        checkOk(checks, "timezone") &&
        checkOk(checks, "organization_type"),
      classification: SETUP_CLASSIFICATION.REQUIRED_FOR_OPERATIONS,
      destinationUrl: "/app/settings/organization",
      description: "Public name, legal name, country, timezone, and organization type.",
      actionPermissions: ["activeclinic.organization.manage"],
    }),
    setupItem({
      key: "primary_facility",
      label: "Configure primary facility",
      complete: checkOk(checks, "primary_facility") && checkOk(checks, "primary_facility_phone"),
      classification: SETUP_CLASSIFICATION.REQUIRED_FOR_OPERATIONS,
      destinationUrl: primaryHref,
      description: "An active HQ / primary facility with a contact phone.",
      facilityContext,
      actionPermissions: ["activeclinic.facility.create", "activeclinic.facility.update"],
    }),
    setupItem({
      key: "administrator",
      label: "Assign a clinic administrator",
      complete: checkOk(checks, "active_administrator"),
      classification: SETUP_CLASSIFICATION.REQUIRED_FOR_OPERATIONS,
      destinationUrl: "/app/access",
      description: "An active organization or network administrator.",
      actionPermissions: ["activeclinic.staff.assign_access"],
    }),
  ];

  if (Array.isArray(input.primaryDepartments)) {
    const activeCount = input.primaryDepartments.filter(
      (d) => String(d && d.status) === "active"
    ).length;
    items.push(
      setupItem({
        key: "departments",
        label: "Configure departments",
        complete: Boolean(primary && primary.operational && activeCount > 0),
        classification: SETUP_CLASSIFICATION.REQUIRED_FOR_OPERATIONS,
        destinationUrl: "/app/settings/clinic-setup/departments",
        description: "At least one active department on the primary facility.",
        currentState: activeCount > 0 ? `${activeCount}_active` : "none_active",
        facilityContext,
        actionPermissions: ["activeclinic.departments.manage"],
      })
    );
  }

  if (primary) {
    items.push(
      setupItem({
        key: "public_hours",
        label: "Add public hours",
        complete: hasPublicHoursConfigured(primary.publicHoursJson),
        classification: SETUP_CLASSIFICATION.RECOMMENDED,
        destinationUrl: primaryHref,
        description: "Public opening hours for the primary facility (website / location page).",
        facilityContext,
        actionPermissions: ["activeclinic.facility.update"],
      })
    );
  }

  if (input.staffCounts && typeof input.staffCounts === "object") {
    const active = Number(input.staffCounts.active) || 0;
    const invited = Number(input.staffCounts.invited) || 0;
    items.push(
      setupItem({
        key: "additional_staff",
        label: "Invite additional staff",
        complete: active + invited > 1,
        classification: SETUP_CLASSIFICATION.RECOMMENDED,
        destinationUrl: "/app/staff/invite",
        description: "Invite staff beyond the original clinic administrator.",
        currentState: `${active}_active_${invited}_invited`,
        actionPermissions: ["activeclinic.staff.invite"],
      })
    );
  }

  if (input.website && typeof input.website === "object") {
    const state = websiteCurrentState(input.website);
    items.push(
      setupItem({
        key: "website",
        label: websiteItemLabel(state),
        complete: websiteItemComplete(state),
        classification: SETUP_CLASSIFICATION.RECOMMENDED,
        destinationUrl: websiteEditUrl,
        description:
          "Clinic website is recommended. Publication is controlled by Platform Admin and does not block internal operations.",
        currentState: state,
        actionPermissions: ["website.edit"],
      })
    );
  }

  const requiredItems = items.filter(
    (item) => item.classification === SETUP_CLASSIFICATION.REQUIRED_FOR_OPERATIONS
  );
  const requiredComplete = requiredItems.filter((item) => item.complete).length;
  const operationsComplete =
    requiredItems.length > 0 && requiredItems.every((item) => item.complete);

  return {
    complete,
    label: complete ? "Profile complete" : "Setup incomplete",
    actionRequired: missing.length > 0,
    checks,
    missing,
    items,
    requiredTotal: requiredItems.length,
    requiredComplete,
    operationsComplete,
  };
}

function canSeeClinicSetupPanel(permissions) {
  const set = permissions instanceof Set ? permissions : new Set(permissions || []);
  return CLINIC_SETUP_ACTION_PERMISSIONS.some((key) => set.has(key));
}

/**
 * Filter setup items to actions the viewer can perform.
 * Operational roles are not shown inaccessible admin links.
 */
function presentClinicSetupForViewer(setup, permissions) {
  const permSet = permissions instanceof Set ? permissions : new Set(permissions || []);
  const visible = (setup && Array.isArray(setup.items) ? setup.items : []).filter((item) =>
    (item.actionPermissions || []).some((key) => permSet.has(key))
  );
  const required = visible.filter(
    (item) => item.classification === SETUP_CLASSIFICATION.REQUIRED_FOR_OPERATIONS
  );
  const recommendedIncomplete = visible.filter(
    (item) =>
      item.classification === SETUP_CLASSIFICATION.RECOMMENDED && item.complete !== true
  );
  const incomplete = visible.filter((item) => item.complete !== true);
  const requiredComplete = required.filter((item) => item.complete).length;
  const operationsComplete = required.length > 0 && required.every((item) => item.complete);

  let presentation = "hidden";
  if (!visible.length) presentation = "hidden";
  else if (required.length && !operationsComplete) presentation = "incomplete";
  else if (recommendedIncomplete.length) presentation = "recommended";
  else if (permSet.has("activeclinic.organization.manage")) presentation = "complete";
  else presentation = "hidden";

  return {
    visible,
    incomplete,
    recommendedIncomplete,
    requiredTotal: required.length,
    requiredComplete,
    operationsComplete,
    presentation,
    settingsHref: "/app/settings",
  };
}

async function hasActiveNetworkAdministrator(db, organizationId) {
  const rows = await accessRepo.listRoleAssignmentsForOrganization(db, {
    organizationId,
    status: "effective",
    roleKeys: ORG_WIDE_ADMIN_ROLES.length ? ORG_WIDE_ADMIN_ROLES : [ORGANIZATION_ADMIN, NETWORK_ADMIN],
  });
  return rows.some((r) => String(r.staff_status) === "active");
}

async function loadWebsiteSetupFacts(db, organizationId, clinicKey) {
  const instance = await instanceRepo.findWebsiteInstanceByOrgProduct(db, {
    organizationId,
    productCode: "activeclinic",
  });
  let published = false;
  try {
    const hcoRow = await db.query(
      `SELECT website_published FROM activeclinic.healthcare_organizations
        WHERE organization_id = $1
        LIMIT 1`,
      [organizationId]
    );
    published = Boolean(hcoRow.rows[0] && hcoRow.rows[0].website_published === true);
  } catch (err) {
    const message = err && err.message ? String(err.message) : "";
    if (!/website_published/i.test(message) && err && err.code !== "42703") throw err;
  }
  let latestSubmissionStatus = null;
  if (instance) {
    const listed = await submissionService.listWebsiteSubmissions(db, {
      organizationId,
      instanceId: instance.id,
      limit: 1,
    });
    const latest = listed.submissions && listed.submissions[0];
    latestSubmissionStatus = latest ? latest.status : null;
  }
  const resolvedKey =
    String(clinicKey || "").trim() ||
    (instance && instance.slug) ||
    null;
  return {
    provisioned: Boolean(instance),
    published,
    latestSubmissionStatus,
    clinicKey: resolvedKey,
    currentState: websiteCurrentState({
      provisioned: Boolean(instance),
      published,
      latestSubmissionStatus,
    }),
  };
}

/**
 * Load presentation-neutral clinic setup state from live configuration.
 * Primary-facility department and hours only — never secondary facilities.
 */
async function loadOrganizationClinicSetup(db, input) {
  const organizationId = input.organizationId;
  let hco = input.healthcareOrganization || null;
  if (!hco) {
    const hcoResult = await getHealthcareOrganizationByOrganizationId(db, {
      organizationId,
    });
    hco = hcoResult.ok ? hcoResult.healthcareOrganization : null;
  }
  const facilitySummary = await getPrimaryFacilitySummary(db, organizationId);
  const hasAdmin = hco
    ? await hasActiveNetworkAdministrator(db, organizationId)
    : false;

  let primaryDepartments = [];
  const primaryId = facilitySummary.primary && facilitySummary.primary.id;
  if (primaryId) {
    const rows = await departmentRepo.listDepartmentsByFacility(db, {
      facilityId: primaryId,
      organizationId,
    });
    primaryDepartments = rows.map((row) => ({
      id: row.id,
      status: row.status,
      departmentType: row.department_type,
      departmentKey: row.department_key,
    }));
  }

  let staffCounts = input.staffCounts || null;
  if (!staffCounts) {
    if (input.staffMembers && Array.isArray(input.staffMembers)) {
      staffCounts = {
        active: input.staffMembers.filter((s) => s.status === "active").length,
        invited: input.staffMembers.filter((s) => s.status === "invited").length,
      };
    } else {
      const listed = await listStaffMembersByOrganization(db, { organizationId });
      const members = listed.ok ? listed.staffMembers || [] : [];
      staffCounts = {
        active: members.filter((s) => s.status === "active").length,
        invited: members.filter((s) => s.status === "invited").length,
      };
    }
  }

  const website = await loadWebsiteSetupFacts(
    db,
    organizationId,
    input.clinicKey || (input.organization && input.organization.key)
  );

  return calculateOrganizationSetupState({
    healthcareOrganization: hco,
    primaryFacility: facilitySummary.primary,
    hasActiveAdministrator: hasAdmin,
    primaryDepartments,
    staffCounts,
    website,
    clinicKey: website.clinicKey,
  });
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
  if (hasPerm(perms, "activeclinic.departments.manage")) {
    categories.push({
      key: "departments",
      title: "Departments",
      description: "Clinic Setup — enable operational departments per facility.",
      href: "/app/settings/clinic-setup/departments",
      statusLabel: "Clinic setup",
      summary: "Reception, OPD, Pharmacy, Lab, and more",
    });
  }
  if (hasPerm(perms, "activeclinic.organization.manage")) {
    categories.push({
      key: "regional",
      title: "Regional settings",
      description: "Clinic Setup — default country for phone numbers and regional defaults.",
      href: "/app/settings/clinic-setup/regional",
      statusLabel: "Clinic setup",
      summary: (hco && hco.countryCode) || "ZM",
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

/**
 * Settings → Clinic Setup → Regional Settings
 * Default country drives default phone country for forms (does not rewrite stored phones).
 */
async function loadRegionalSettingsScreen(db, input) {
  const auth = input.auth;
  if (!hasPerm(auth.permissions, "activeclinic.organization.manage")) {
    return { ok: false, code: RESULT.DENIED };
  }
  const hcoResult = await getHealthcareOrganizationByOrganizationId(db, {
    organizationId: auth.organization.id,
  });
  if (!hcoResult.ok) return { ok: false, code: RESULT.NOT_FOUND };
  const hco = hcoResult.healthcareOrganization;
  const phoneLocals = require("./activeClinicPhoneFieldLocals").buildPhoneFieldLocals({
    clinicDefaultCountry: hco.countryCode || "ZM",
    selectedCountry:
      (input.values && input.values.countryCode) || hco.countryCode || "ZM",
  });
  return {
    ok: true,
    form: {
      formAction: "/app/settings/clinic-setup/regional",
      cancelHref: "/app/settings",
      values: {
        countryCode:
          (input.values && input.values.countryCode) || hco.countryCode || "ZM",
        timezone: (input.values && input.values.timezone) || hco.timezone || "Africa/Lusaka",
      },
      errors: input.errors || [],
      fieldErrors: input.fieldErrors || {},
      timezoneOptions: listActiveClinicTimezoneOptions(),
      ...phoneLocals,
      note:
        "Changing the default country updates new phone forms only. Existing stored phone numbers are not rewritten.",
    },
  };
}

async function updateRegionalSettings(db, input) {
  const auth = input.auth;
  if (!hasPerm(auth.permissions, "activeclinic.organization.manage")) {
    return { ok: false, code: RESULT.DENIED };
  }
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
      countryCode: input.countryCode,
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
  SETUP_CLASSIFICATION,
  CLINIC_SETUP_ACTION_PERMISSIONS,
  organizationTypeLabel,
  hcoStatusLabel,
  hasPublicHoursConfigured,
  calculateOrganizationSetupState,
  canSeeClinicSetupPanel,
  presentClinicSetupForViewer,
  hasActiveNetworkAdministrator,
  loadWebsiteSetupFacts,
  loadOrganizationClinicSetup,
  getPrimaryFacilitySummary,
  loadActiveClinicSettingsOverviewScreen,
  loadHealthcareOrganizationSettingsScreen,
  loadEditHealthcareOrganizationScreen,
  updateHealthcareOrganizationSettings,
  loadRegionalSettingsScreen,
  updateRegionalSettings,
};
