"use strict";

/**
 * ActiveClinic module availability:
 * product capability ∩ active facility department ∩ user permission.
 * Department config never grants permissions.
 */

const repo = require("../repositories/departmentRepository");

const RESULT = Object.freeze({
  OK: "ok",
  DEPARTMENT_NOT_CONFIGURED: "department_not_configured",
  FACILITY_REQUIRED: "facility_required",
});

/**
 * Nav / route module keys → required active department type(s).
 * null = clinic-wide (no department gate).
 */
const MODULE_DEPARTMENT_REQUIREMENTS = Object.freeze({
  home: null,
  patients: null,
  appointments: "reception",
  reception: "reception",
  booking_requests: null,
  clinical: ["opd", "triage"],
  pharmacy: "pharmacy",
  diagnostics: ["laboratory", "radiology"],
  laboratory: "laboratory",
  radiology: "radiology",
  billing: "billing",
  cashier: "billing",
  staff: null,
  facilities: null,
  access: null,
  settings: null,
});

/**
 * @param {string|string[]|null} requirement
 * @param {Set<string>} activeTypes
 */
function departmentRequirementMet(requirement, activeTypes) {
  if (requirement == null) return true;
  if (Array.isArray(requirement)) {
    return requirement.some((t) => activeTypes.has(t));
  }
  return activeTypes.has(requirement);
}

async function loadActiveDepartmentTypeSet(db, { facilityId, organizationId }) {
  if (!facilityId || !organizationId) {
    return new Set();
  }
  const types = await repo.listActiveDepartmentTypesForFacility(db, {
    facilityId,
    organizationId,
  });
  return new Set(types);
}

/**
 * @returns {{ ok: true, result: string } | { ok: false, result: string }}
 */
async function assertModuleDepartmentAvailable(db, input) {
  const moduleKey = String(input.moduleKey || "");
  const requirement = MODULE_DEPARTMENT_REQUIREMENTS[moduleKey];
  if (requirement == null) {
    return { ok: true, result: RESULT.OK };
  }
  const facilityId =
    (input.facilityId ||
      (input.auth &&
        input.auth.selectedFacility &&
        input.auth.selectedFacility.id)) ||
    null;
  const organizationId =
    input.organizationId ||
    (input.auth && input.auth.organization && input.auth.organization.id) ||
    null;
  if (!facilityId || !organizationId) {
    return { ok: false, result: RESULT.FACILITY_REQUIRED };
  }
  const activeTypes =
    input.activeDepartmentTypes instanceof Set
      ? input.activeDepartmentTypes
      : await loadActiveDepartmentTypeSet(db, { facilityId, organizationId });
  if (!departmentRequirementMet(requirement, activeTypes)) {
    return { ok: false, result: RESULT.DEPARTMENT_NOT_CONFIGURED };
  }
  return { ok: true, result: RESULT.OK };
}

function filterNavItemsByDepartments(items, activeDepartmentTypes) {
  const set =
    activeDepartmentTypes instanceof Set
      ? activeDepartmentTypes
      : new Set(activeDepartmentTypes || []);
  return (items || []).filter((item) => {
    const requirement = MODULE_DEPARTMENT_REQUIREMENTS[item.key];
    return departmentRequirementMet(requirement, set);
  });
}

module.exports = {
  RESULT,
  MODULE_DEPARTMENT_REQUIREMENTS,
  departmentRequirementMet,
  loadActiveDepartmentTypeSet,
  assertModuleDepartmentAvailable,
  filterNavItemsByDepartments,
};
