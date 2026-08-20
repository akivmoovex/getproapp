"use strict";

/**
 * Compose ActiveClinic authenticated shell view-model (AC-V6-10).
 */

const {
  buildActiveClinicNavigation,
  matchActiveNavKey,
} = require("./activeClinicNavigation");
const {
  listSelectableFacilities,
  resolveSelectableFacility,
} = require("./activeClinicFacilityContextService");
const {
  listEligibleActiveClinicOrganizations,
} = require("./activeClinicLoginEligibility");
const { CSRF_FIELD } = require("../../platform/http/v5Csrf");
const {
  CODE_ACTIVECLINIC_ORG_V6,
} = require("../../platform/config/deploymentProfiles");
const {
  plainRoleSummary,
} = require("./loadActiveClinicDashboardHome");
const {
  resolveEffectivePermissions,
} = require("./activeClinicAuthorizationService");
const {
  loadActiveDepartmentTypeSet,
} = require("./activeClinicModuleAvailability");

const SHELL_ASSET_VERSION = "v7-parity-23";

/**
 * @param {{ query: Function }} db
 * @param {{
 *   req: import('express').Request,
 *   auth: object,
 *   csrfToken: string,
 *   activeNav?: string|null,
 *   pageHeader?: object|null,
 *   breadcrumbs?: array|null,
 *   flash?: object|null,
 *   pageData?: object|null,
 * }} input
 */
async function buildActiveClinicShellViewModel(db, input) {
  const auth = input.auth;
  const req = input.req;
  const activeNav =
    input.activeNav != null
      ? input.activeNav
      : matchActiveNavKey(req && req.path);

  const selectable = await listSelectableFacilities(db, auth);
  const availableFacilities = selectable.ok ? selectable.facilities : [];

  let selectedFacility = auth.selectedFacility || null;
  const sessionContext =
    (req.v5Session &&
      req.v5Session.session &&
      req.v5Session.session.contextJson) ||
    {};
  const storedFacilityId = sessionContext.selectedFacilityId || null;

  if (storedFacilityId) {
    const resolved = await resolveSelectableFacility(db, auth, storedFacilityId);
    selectedFacility = resolved.ok ? resolved.facility : null;
  } else if (!selectedFacility && availableFacilities.length === 1) {
    selectedFacility = availableFacilities[0];
  }

  // Re-resolve after facility selection so nav reflects facility-scoped union,
  // not the login-time all-facility permission bag.
  let permissions = Array.isArray(auth.permissions) ? auth.permissions : [];
  if (
    selectedFacility &&
    auth.staffMember &&
    auth.organization &&
    auth.platformIdentity
  ) {
    const scoped = await resolveEffectivePermissions(db, {
      organizationId: auth.organization.id,
      staffMemberId: auth.staffMember.id,
      platformIdentityId: auth.platformIdentity.id,
      facilityId: selectedFacility.id,
    });
    if (scoped.ok) permissions = scoped.permissions;
  }

  let activeDepartmentTypes = null;
  if (selectedFacility && auth.organization) {
    activeDepartmentTypes = await loadActiveDepartmentTypeSet(db, {
      facilityId: selectedFacility.id,
      organizationId: auth.organization.id,
    });
  }
  const navigation = buildActiveClinicNavigation(permissions, activeNav, {
    activeDepartmentTypes,
  });

  let eligibleOrganizations = [];
  if (auth.platformIdentity && auth.platformIdentity.id) {
    const orgs = await listEligibleActiveClinicOrganizations(db, {
      platformIdentityId: auth.platformIdentity.id,
    });
    if (orgs.ok) {
      eligibleOrganizations = (orgs.organizations || []).map((o) => ({
        organizationId: o.organization.id,
        organizationKey: o.organization.key,
        displayName:
          (o.healthcareOrganization && o.healthcareOrganization.publicName) ||
          o.organization.displayName,
        staffDisplayName: o.staffMember && o.staffMember.displayName,
      }));
    }
  }

  const staff = auth.staffMember || {};
  const org = auth.organization || {};
  const hco = auth.healthcareOrganization || {};
  const roleSummary = plainRoleSummary(auth);
  const orgLabel = hco.publicName || hco.legalName || org.displayName || "Organization";

  return {
    product: {
      code: "activeclinic",
      displayName: "ActiveClinic",
      productLine: "ActiveClinic HMS",
    },
    deployment: {
      code: CODE_ACTIVECLINIC_ORG_V6,
    },
    assetVersion: SHELL_ASSET_VERSION,
    identity: auth.platformIdentity
      ? {
          mustChangePassword: auth.platformIdentity.mustChangePassword === true,
        }
      : null,
    staff: {
      displayName: staff.displayName || "Staff",
      jobTitle: staff.jobTitle || null,
      status: staff.status || null,
    },
    organization: {
      key: org.key || null,
      displayName: org.displayName || null,
    },
    healthcareOrganization: {
      publicName: orgLabel,
      legalName: hco.legalName || null,
    },
    selectedFacility: selectedFacility
      ? {
          facilityKey: selectedFacility.facilityKey,
          displayName: selectedFacility.displayName,
          facilityType: selectedFacility.facilityType,
          status: selectedFacility.status,
          isPrimary: selectedFacility.isPrimary,
          // id kept for server forms only — templates must not display it
          id: selectedFacility.id,
        }
      : null,
    availableFacilities: availableFacilities.map((f) => ({
      id: f.id,
      facilityKey: f.facilityKey,
      displayName: f.displayName,
      status: f.status,
      isPrimary: f.isPrimary,
    })),
    eligibleOrganizations,
    canSwitchOrganization: eligibleOrganizations.length > 1,
    canSwitchFacility:
      availableFacilities.length > 1 || auth.isNetworkAdmin === true,
    isNetworkAdmin: auth.isNetworkAdmin === true,
    roleSummary,
    permissions,
    permissionSet: Object.fromEntries(permissions.map((p) => [p, true])),
    // Set|null — dashboard/nav department gates; null when no facility selected.
    activeDepartmentTypes,
    navigation,
    breadcrumbs: Array.isArray(input.breadcrumbs) ? input.breadcrumbs : [],
    pageHeader: input.pageHeader || {
      title: "ActiveClinic",
      description: null,
      actions: [],
    },
    flash: input.flash || null,
    csrf: {
      token: input.csrfToken || "",
      field: CSRF_FIELD,
    },
    accountMenu: {
      staffDisplayName: staff.displayName || "Staff",
      jobTitle: staff.jobTitle || null,
      roleLabel: roleSummary,
      organizationLabel: orgLabel,
      facilityLabel: selectedFacility ? selectedFacility.displayName : null,
      changePasswordHref: "/account/change-password",
      selectOrganizationHref: "/app/select-organization",
      selectFacilityHref: "/app/select-facility",
      logoutAction: "/logout",
    },
    pageData: input.pageData || {},
    activeNav,
    provisioningIncomplete: auth.provisioningIncomplete === true,
    failedStage: auth.failedStage || null,
  };
}

module.exports = {
  buildActiveClinicShellViewModel,
  SHELL_ASSET_VERSION,
};
