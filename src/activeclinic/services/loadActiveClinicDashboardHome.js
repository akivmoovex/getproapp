"use strict";

/**
 * ActiveClinic dashboard home loader.
 * Capability-driven tiles and metrics — permission union ∩ enabled departments.
 * No clinical KPI queries until product metrics are authorized per domain.
 */

const {
  listFacilitiesByOrganization,
} = require("./facilityService");
const {
  listStaffMembersByOrganization,
} = require("./activeClinicStaffService");
const {
  buildAuthorizedDashboardTiles,
  groupDashboardSections,
  toQuickActions,
} = require("./activeClinicDashboardCapabilities");
const {
  canSeeClinicSetupPanel,
  loadOrganizationClinicSetup,
  presentClinicSetupForViewer,
} = require("./loadActiveClinicSettingsScreens");
const {
  PRODUCT_CODE,
  buildPublicOrganizationWebsitePath,
} = require("../../platform/website/publicWebsiteUrl");

function hasPerm(set, key) {
  return set.has(key);
}

function plainRoleSummary(auth) {
  const roles = Array.isArray(auth.roleAssignments) ? auth.roleAssignments : [];
  const labels = roles
    .map((r) => r.roleDisplayName || r.displayName || null)
    .filter(Boolean);
  if (labels.length) return labels.join(", ");
  if (auth.isNetworkAdmin) return "Network administrator";
  return "ActiveClinic staff";
}

function resolveActiveDepartmentTypes(shell) {
  if (!shell) return null;
  if (shell.activeDepartmentTypes instanceof Set) {
    return shell.activeDepartmentTypes;
  }
  if (Array.isArray(shell.activeDepartmentTypes)) {
    return new Set(shell.activeDepartmentTypes);
  }
  // No facility context → department-gated modules are not reachable.
  if (!shell.selectedFacility) return null;
  return new Set();
}

/**
 * @param {{ query: Function }} db
 * @param {{ auth: object, shell: object }} input
 */
async function loadActiveClinicDashboardHome(db, input) {
  const auth = input.auth || {};
  const shell = input.shell || {};
  const orgId = auth.organization && auth.organization.id;
  const perms = new Set(Array.isArray(auth.permissions) ? auth.permissions : []);
  // Prefer facility-scoped shell permissions when present (multi-role union).
  if (Array.isArray(shell.permissions) && shell.permissions.length) {
    perms.clear();
    for (const p of shell.permissions) perms.add(p);
  }

  let facilities = [];
  let staffMembers = [];

  // Metrics: only load datasets the user is authorized to see (server-side).
  if (orgId && hasPerm(perms, "activeclinic.facility.view")) {
    const listed = await listFacilitiesByOrganization(db, {
      organizationId: orgId,
      status: "active",
    });
    if (listed.ok) facilities = listed.facilities || [];
  }

  if (orgId && hasPerm(perms, "activeclinic.staff.view")) {
    const listed = await listStaffMembersByOrganization(db, {
      organizationId: orgId,
    });
    if (listed.ok) staffMembers = listed.staffMembers || [];
  }

  const activeFacilities = facilities.filter((f) => f.status === "active");
  const activeStaff = staffMembers.filter((s) => s.status === "active");
  const invitedStaff = staffMembers.filter((s) => s.status === "invited");

  const needsFacilitySelect =
    !shell.selectedFacility &&
    !auth.isNetworkAdmin &&
    Array.isArray(shell.availableFacilities) &&
    shell.availableFacilities.length > 0;

  let clinicSetup = null;
  if (orgId && canSeeClinicSetupPanel(perms)) {
    const setupState = await loadOrganizationClinicSetup(db, {
      organizationId: orgId,
      healthcareOrganization: auth.healthcareOrganization || null,
      clinicKey: auth.organization && auth.organization.key,
      staffMembers,
      staffCounts: hasPerm(perms, "activeclinic.staff.view")
        ? { active: activeStaff.length, invited: invitedStaff.length }
        : undefined,
    });
    clinicSetup = presentClinicSetupForViewer(setupState, perms);
    clinicSetup.state = setupState;
  }

  const sessionTasks = [];
  if (needsFacilitySelect) {
    sessionTasks.push({
      key: "select_facility",
      label: "Select a facility context",
      href: "/app/select-facility",
    });
  }

  const setupTasks = [];
  if (clinicSetup && clinicSetup.presentation === "incomplete") {
    for (const item of clinicSetup.incomplete) {
      setupTasks.push({
        key: item.key,
        label: item.label,
        done: false,
        href: item.destinationUrl,
      });
    }
  }

  const activeDepartmentTypes = resolveActiveDepartmentTypes(shell);
  const authorizedTiles = buildAuthorizedDashboardTiles(perms, {
    activeDepartmentTypes,
    includeSelectFacility: Boolean(
      needsFacilitySelect ||
        (!shell.selectedFacility &&
          !auth.isNetworkAdmin &&
          (shell.canSwitchFacility ||
            (shell.availableFacilities && shell.availableFacilities.length)))
    ),
  });
  const { buckets, sections } = groupDashboardSections(authorizedTiles);
  const quickActions = toQuickActions(authorizedTiles);

  const empty =
    activeFacilities.length === 0 &&
    (hasPerm(perms, "activeclinic.facility.create") ||
      hasPerm(perms, "activeclinic.facility.update"));

  const mode = empty ? "empty" : "ready";

  const orgKey =
    (auth.organization && (auth.organization.key || auth.organization.organizationKey)) ||
    (shell.organization && (shell.organization.key || shell.organization.organizationKey)) ||
    "";
  const canWebsite = hasPerm(perms, "website.view") || hasPerm(perms, "website.edit");
  const canOrgProfile =
    hasPerm(perms, "activeclinic.organization.view") ||
    hasPerm(perms, "activeclinic.organization.manage");
  const showOrganizationConsole =
    canSeeClinicSetupPanel(perms) || canWebsite || canOrgProfile;
  let onboardingStatus = null;
  if (clinicSetup && clinicSetup.presentation === "incomplete") onboardingStatus = "onboarding_required";
  else if (clinicSetup && clinicSetup.presentation === "recommended") onboardingStatus = "recommended";
  else if (clinicSetup && clinicSetup.presentation === "complete") onboardingStatus = "completed";
  const organizationConsole = showOrganizationConsole
    ? {
        publicPath: orgKey
          ? buildPublicOrganizationWebsitePath({
              product: PRODUCT_CODE.ACTIVECLINIC,
              organizationKey: orgKey,
            })
          : null,
        websiteHref: canWebsite ? "/app/settings/website" : null,
        organizationHref: canOrgProfile ? "/app/settings/organization" : null,
        staffHref: hasPerm(perms, "activeclinic.staff.view") ? "/app/staff" : null,
        accessHref: hasPerm(perms, "activeclinic.staff.assign_access") ? "/app/access" : null,
        facilitiesHref:
          hasPerm(perms, "activeclinic.facility.create") ||
          hasPerm(perms, "activeclinic.facility.update") ||
          hasPerm(perms, "activeclinic.facility.archive")
            ? "/app/facilities"
            : null,
        settingsHref: "/app/settings",
        onboardingHref: onboardingStatus === "onboarding_required" ? "/app/onboarding" : null,
        onboardingStatus,
      }
    : null;

  const metrics = [];
  if (
    hasPerm(perms, "activeclinic.facility.create") ||
    hasPerm(perms, "activeclinic.facility.update") ||
    hasPerm(perms, "activeclinic.facility.archive")
  ) {
    metrics.push({
      key: "facilities",
      label: "Active facilities",
      value: activeFacilities.length,
      href: "/app/facilities",
    });
  }
  if (hasPerm(perms, "activeclinic.staff.view")) {
    metrics.push({
      key: "staff",
      label: "Active staff",
      value: activeStaff.length,
      href: "/app/staff",
    });
    metrics.push({
      key: "invitations",
      label: "Pending invitations",
      value: invitedStaff.length,
      href: "/app/staff",
    });
  }

  return {
    ok: true,
    mode,
    welcome: {
      staffDisplayName: (auth.staffMember && auth.staffMember.displayName) || "Staff",
      jobTitle: (auth.staffMember && auth.staffMember.jobTitle) || null,
      organizationName:
        (auth.healthcareOrganization &&
          (auth.healthcareOrganization.publicName ||
            auth.healthcareOrganization.legalName)) ||
        (auth.organization && auth.organization.displayName) ||
        "Organization",
      facilityName: shell.selectedFacility
        ? shell.selectedFacility.displayName
        : auth.isNetworkAdmin
          ? "Organization-wide"
          : null,
      roleSummary: plainRoleSummary(auth),
      scopeLabel: shell.selectedFacility
        ? `Working in ${shell.selectedFacility.displayName}`
        : auth.isNetworkAdmin
          ? "Organization-wide access"
          : "Select a facility to continue",
    },
    /** @deprecated prefer metrics[]; kept for existing templates/tests */
    summaries: {
      facilities: metrics.find((m) => m.key === "facilities") || null,
      staff: metrics.find((m) => m.key === "staff") || null,
      invitations: metrics.find((m) => m.key === "invitations") || null,
    },
    metrics,
    sections,
    modules: buckets,
    authorizedTiles,
    clinicSetup,
    organizationConsole,
    sessionTasks,
    setupTasks,
    quickActions,
    notices: [],
    unsupportedStitchKpisOmitted: [
      "Patients registered today",
      "Patients waiting",
      "Consultations in progress",
      "Appointments today",
      "Reception queue",
      "Pharmacy stock alerts",
      "Billing / invoice totals",
    ],
  };
}

module.exports = {
  loadActiveClinicDashboardHome,
  plainRoleSummary,
};
