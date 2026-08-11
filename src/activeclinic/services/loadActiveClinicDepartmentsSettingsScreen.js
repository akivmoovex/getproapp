"use strict";

/**
 * Settings → Clinic Setup → Departments screen loaders.
 */

const {
  listDepartments,
  createDepartment,
  updateDepartment,
  DEPARTMENT_TYPES,
  DEPARTMENT_TYPE_LABELS,
  PERM,
  RESULT,
} = require("./activeClinicDepartmentService");
const {
  listFacilitiesByOrganization,
} = require("./facilityService");

function hasPerm(perms, key) {
  return Array.isArray(perms) ? perms.includes(key) : false;
}

async function loadDepartmentsSettingsScreen(db, input) {
  const auth = input.auth;
  const perms = auth.permissions || [];
  const canManage = hasPerm(perms, PERM.MANAGE);
  if (!canManage) {
    return { ok: false, code: RESULT.ACCESS_DENIED };
  }

  const listed = await listDepartments(db, {
    staffId: auth.staffMember.id,
    organizationId: auth.organization.id,
    facilityId: input.facilityId || null,
  });
  if (!listed.ok) {
    return { ok: false, code: listed.result };
  }

  const facilitiesListed = await listFacilitiesByOrganization(db, {
    organizationId: auth.organization.id,
  });
  const facilities = (facilitiesListed.facilities || [])
    .filter((f) => ["active", "planned"].includes(f.status))
    .map((f) => ({
      id: f.id,
      displayName: f.displayName,
      facilityKey: f.facilityKey,
      status: f.status,
      isPrimary: f.isPrimary === true,
      selected:
        (auth.selectedFacility && auth.selectedFacility.id === f.id) ||
        f.isPrimary === true,
    }));

  return {
    ok: true,
    departmentsPage: {
      departments: listed.departments,
      facilities,
      types: DEPARTMENT_TYPES.map((value) => ({
        value,
        label: DEPARTMENT_TYPE_LABELS[value] || value,
      })),
      actions: { canManage },
    },
  };
}

module.exports = {
  loadDepartmentsSettingsScreen,
  createDepartment,
  updateDepartment,
  RESULT,
  PERM,
};
