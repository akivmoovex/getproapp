"use strict";

/**
 * ActiveClinic login eligibility chain (AC-V6-08).
 * Password verification alone is insufficient.
 */

const identityRepo = require("../../platform/repositories/platformIdentityRepository");
const staffRepo = require("../repositories/staffMemberRepository");
const { mapStaff } = require("./activeClinicStaffService");
const {
  getHealthcareOrganizationByOrganizationId,
} = require("./healthcareOrganizationService");
const {
  organizationHasActiveProduct,
  requireOrganizationProduct,
} = require("../../platform/services/organizationProductService");
const {
  resolveEffectivePermissions,
  listStaffRoleAssignments,
  isOrgWideAdminRole,
} = require("./activeClinicAuthorizationService");
const {
  listFacilitiesForStaff,
} = require("./activeClinicStaffFacilityService");
const {
  isIdentityUsable,
  mapIdentity,
} = require("../../platform/services/platformIdentityService");

const RESULT = Object.freeze({
  OK: "ok",
  IDENTITY_DISABLED: "identity_disabled",
  NO_ELIGIBLE_ORG: "no_eligible_organization",
  ACCESS_DENIED: "access_denied",
  INVALID_INPUT: "invalid_input",
});

/**
 * @param {{ query: Function }} db
 * @param {object} staffRow
 * @param {object} identityRow
 */
async function evaluateStaffEligibility(db, staffRow, identityRow) {
  if (!staffRow || staffRow.status !== "active") {
    return { ok: false, code: "staff_not_active" };
  }
  if (!staffRow.platform_identity_id) {
    return { ok: false, code: "staff_not_linked" };
  }

  const productOk = await organizationHasActiveProduct(db, {
    organizationId: staffRow.organization_id,
    applicationCode: "activeclinic",
  });
  if (!productOk) {
    return { ok: false, code: "enrolment_inactive" };
  }

  const enrolment = await requireOrganizationProduct(db, {
    organizationId: staffRow.organization_id,
    applicationCode: "activeclinic",
    allowedStatuses: ["active"],
  });

  const org = await db.query(
    `SELECT id, organization_key, display_name, status, data_environment
       FROM platform.organizations
      WHERE id = $1
      LIMIT 1`,
    [staffRow.organization_id]
  );
  const organization = org.rows[0];
  if (!organization || organization.status !== "active") {
    return { ok: false, code: "organization_inactive" };
  }

  const hco = await getHealthcareOrganizationByOrganizationId(db, {
    organizationId: staffRow.organization_id,
  });
  if (
    !hco.ok ||
    !hco.healthcareOrganization ||
    hco.healthcareOrganization.status !== "active"
  ) {
    return { ok: false, code: "healthcare_organization_inactive" };
  }

  const links = await identityRepo.listProductProfilesByIdentity(db, identityRow.id);
  const matchingLink = links.find(
    (l) =>
      l.product_key === "activeclinic" &&
      l.status === "active" &&
      String(l.product_profile_id) === String(staffRow.id)
  );
  if (!matchingLink) {
    return { ok: false, code: "product_profile_inactive" };
  }

  const roleList = await listStaffRoleAssignments(db, {
    staffMemberId: staffRow.id,
    organizationId: staffRow.organization_id,
  });
  const roles = (roleList.assignments || []).filter((r) => {
    if (r.status && r.status !== "active") return false;
    if (r.expiresAt && new Date(r.expiresAt).getTime() <= Date.now()) return false;
    return true;
  });
  if (!roles.length) {
    return { ok: false, code: "no_active_role" };
  }

  const perms = await resolveEffectivePermissions(db, {
    organizationId: staffRow.organization_id,
    staffMemberId: staffRow.id,
    platformIdentityId: identityRow.id,
    facilityId: null,
  });
  if (!perms.ok) {
    return { ok: false, code: perms.code || "permissions_denied" };
  }
  if (!perms.permissions.includes("activeclinic.access")) {
    return { ok: false, code: "missing_access_permission" };
  }

  const facilities = await listFacilitiesForStaff(db, {
    staffMemberId: staffRow.id,
    organizationId: staffRow.organization_id,
  });
  const activeFacilities = (facilities.assignments || []).filter(
    (a) => a.status === "active"
  );

  const hasOrgWide = roles.some((r) => r.scopeType === "organisation");
  const isOrgWideAdmin = roles.some((r) => isOrgWideAdminRole(r.roleKey));

  if (!hasOrgWide && !isOrgWideAdmin && activeFacilities.length === 0) {
    return { ok: false, code: "no_valid_facility_scope" };
  }

  let defaultFacilityId = null;
  if (!isOrgWideAdmin && !hasOrgWide && activeFacilities.length === 1) {
    defaultFacilityId = activeFacilities[0].facilityId;
  }

  let provisioningIncomplete = false;
  let failedStage = null;
  try {
    const {
      inspectOrganizationProvisioningCompleteness,
    } = require("../../platform/registration/provisioningRecovery");
    const completeness = await inspectOrganizationProvisioningCompleteness(db, {
      productCode: "activeclinic",
      organizationId: staffRow.organization_id,
      staffMemberId: staffRow.id,
    });
    provisioningIncomplete = completeness.complete !== true;
    failedStage = completeness.failedStage || null;
  } catch {
    provisioningIncomplete = false;
    failedStage = null;
  }

  return {
    ok: true,
    code: RESULT.OK,
    organization: {
      id: organization.id,
      key: organization.organization_key,
      displayName: organization.display_name,
      dataEnvironment: organization.data_environment,
    },
    organizationProduct: enrolment.organizationProduct || null,
    healthcareOrganization: hco.healthcareOrganization,
    staffMember: mapStaff(staffRow),
    permissions: perms.permissions,
    roleAssignments: roles,
    facilityAssignments: activeFacilities,
    defaultFacilityId,
    isNetworkAdmin: Boolean(isOrgWideAdmin || hasOrgWide),
    provisioningIncomplete,
    failedStage,
  };
}

/**
 * @param {{ query: Function }} db
 * @param {{ platformIdentityId: string }} input
 */
async function listEligibleActiveClinicOrganizations(db, input) {
  const identityId = String((input && input.platformIdentityId) || "").trim();
  if (!identityId) {
    return { ok: false, code: RESULT.INVALID_INPUT, organizations: [] };
  }
  const identityRow = await identityRepo.findIdentityById(db, identityId);
  if (!identityRow || !isIdentityUsable(identityRow)) {
    return {
      ok: false,
      code: RESULT.IDENTITY_DISABLED,
      organizations: [],
      platformIdentity: mapIdentity(identityRow),
    };
  }

  const staffRows = await staffRepo.listByPlatformIdentity(db, identityId);
  const eligible = [];
  for (const row of staffRows) {
    const evaluated = await evaluateStaffEligibility(db, row, identityRow);
    if (evaluated.ok) {
      eligible.push(evaluated);
    }
  }

  return {
    ok: true,
    code: RESULT.OK,
    platformIdentity: mapIdentity(identityRow),
    organizations: eligible,
  };
}

/**
 * @param {{ query: Function }} db
 * @param {{ platformIdentityId: string, organizationId: string }} input
 */
async function resolveEligibleOrganization(db, input) {
  const listed = await listEligibleActiveClinicOrganizations(db, {
    platformIdentityId: input.platformIdentityId,
  });
  if (!listed.ok) return listed;
  const match = listed.organizations.find(
    (o) => String(o.organization.id) === String(input.organizationId)
  );
  if (!match) {
    return {
      ok: false,
      code: RESULT.ACCESS_DENIED,
      organizations: listed.organizations,
    };
  }
  return {
    ok: true,
    code: RESULT.OK,
    platformIdentity: listed.platformIdentity,
    eligibility: match,
  };
}

module.exports = {
  RESULT,
  evaluateStaffEligibility,
  listEligibleActiveClinicOrganizations,
  resolveEligibleOrganization,
};
