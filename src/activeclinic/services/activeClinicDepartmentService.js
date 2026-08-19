"use strict";

/**
 * ActiveClinic facility department configuration (clinic setup).
 * Soft activate/deactivate only — never hard-deletes operational history.
 */

const { recordAuditEventSafe } = require("../../platform/services/auditEventService");
const {
  authorizeStaffPermission,
} = require("./activeClinicAuthorizationService");
const repo = require("../repositories/departmentRepository");

const RESULT = Object.freeze({
  OK: "ok",
  INVALID_INPUT: "invalid_input",
  ACCESS_DENIED: "access_denied",
  NOT_FOUND: "department_not_found",
  FACILITY_NOT_FOUND: "facility_not_found",
  DUPLICATE_KEY: "duplicate_department_key",
  INVALID_TYPE: "invalid_department_type",
  INVALID_STATUS: "invalid_status",
});

const PERM = Object.freeze({
  MANAGE: "activeclinic.departments.manage",
});

const DEPARTMENT_TYPES = Object.freeze([
  "reception",
  "opd",
  "triage",
  "pharmacy",
  "laboratory",
  "radiology",
  "billing",
  "administration",
  "records",
  "procedure",
]);

const DEPARTMENT_TYPE_LABELS = Object.freeze({
  reception: "Reception",
  opd: "OPD",
  triage: "Triage / Nursing",
  pharmacy: "Pharmacy",
  laboratory: "Laboratory",
  radiology: "Radiology",
  billing: "Billing / Cashier",
  administration: "Administration",
  records: "Records",
  procedure: "Procedure",
});

const MODULE_BY_TYPE = Object.freeze({
  reception: "Reception / Appointments",
  opd: "Clinical",
  triage: "Clinical (triage)",
  pharmacy: "Pharmacy",
  laboratory: "Laboratory",
  radiology: "Radiology",
  billing: "Billing / Cashier",
  administration: "Settings / access / facilities",
  records: "Records (no operational module yet)",
  procedure: "Procedures (no operational module yet)",
});

/** Working app destinations unlocked by each department type. null = no module yet. */
const MODULE_HREF_BY_TYPE = Object.freeze({
  reception: "/app/reception",
  opd: "/app/clinical",
  triage: "/app/clinical",
  pharmacy: "/app/pharmacy",
  laboratory: "/app/diagnostics/laboratory",
  radiology: "/app/diagnostics/radiology",
  billing: "/app/billing",
  administration: "/app/settings",
  records: null,
  procedure: null,
});

const DEFAULT_DEPARTMENT_SPECS = Object.freeze([
  { key: "reception", type: "reception", name: "Reception" },
  { key: "opd", type: "opd", name: "OPD" },
  { key: "triage", type: "triage", name: "Triage / Nursing" },
  { key: "pharmacy", type: "pharmacy", name: "Pharmacy" },
  { key: "laboratory", type: "laboratory", name: "Laboratory" },
  { key: "radiology", type: "radiology", name: "Radiology" },
  { key: "billing", type: "billing", name: "Billing / Cashier" },
  { key: "administration", type: "administration", name: "Administration" },
]);

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const KEY_RE = /^[a-z][a-z0-9_]{0,63}$/;

function mapDepartment(row) {
  if (!row) return null;
  return {
    id: row.id,
    organizationId: row.organization_id,
    healthcareOrganizationId: row.healthcare_organization_id,
    facilityId: row.facility_id,
    departmentKey: row.department_key,
    departmentType: row.department_type,
    displayName: row.display_name,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    facilityDisplayName: row.facility_display_name || null,
    facilityKey: row.facility_key || null,
    typeLabel: DEPARTMENT_TYPE_LABELS[row.department_type] || row.department_type,
    moduleLabel: MODULE_BY_TYPE[row.department_type] || null,
    moduleHref: MODULE_HREF_BY_TYPE[row.department_type] || null,
  };
}

function slugifyKey(input) {
  return String(input || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 64);
}

async function assertManage(pool, input) {
  return authorizeStaffPermission(pool, {
    organizationId: input.organizationId,
    staffMemberId: input.staffId,
    permissionKey: PERM.MANAGE,
    facilityId: input.facilityId || null,
  });
}

async function resolveFacility(pool, { facilityId, organizationId }) {
  const r = await pool.query(
    `SELECT id, organization_id, healthcare_organization_id, display_name, facility_key, status
       FROM activeclinic.facilities
      WHERE id = $1 AND organization_id = $2
      LIMIT 1`,
    [facilityId, organizationId]
  );
  return r.rows[0] || null;
}

async function listDepartments(pool, input) {
  const { staffId, organizationId, facilityId } = input;
  if (!staffId || !organizationId) {
    return { ok: false, result: RESULT.INVALID_INPUT, departments: [] };
  }
  const auth = await assertManage(pool, {
    organizationId,
    staffId,
    facilityId: facilityId || null,
  });
  if (!auth.ok) {
    return { ok: false, result: RESULT.ACCESS_DENIED, departments: [] };
  }
  const rows = await repo.listDepartmentsByOrganization(pool, {
    organizationId,
    facilityId: facilityId || null,
    status: input.status || null,
  });
  return {
    ok: true,
    result: RESULT.OK,
    departments: rows.map(mapDepartment),
  };
}

async function createDepartment(pool, input) {
  const {
    staffId,
    organizationId,
    facilityId,
    departmentType,
    displayName,
    departmentKey,
  } = input;

  if (!staffId || !organizationId || !facilityId || !displayName) {
    return { ok: false, result: RESULT.INVALID_INPUT };
  }
  if (!UUID_RE.test(facilityId)) {
    return { ok: false, result: RESULT.INVALID_INPUT };
  }
  if (!DEPARTMENT_TYPES.includes(departmentType)) {
    return { ok: false, result: RESULT.INVALID_TYPE };
  }

  const auth = await assertManage(pool, { organizationId, staffId, facilityId });
  if (!auth.ok) {
    return { ok: false, result: RESULT.ACCESS_DENIED };
  }

  const facility = await resolveFacility(pool, { facilityId, organizationId });
  if (!facility) {
    return { ok: false, result: RESULT.FACILITY_NOT_FOUND };
  }

  const key =
    (departmentKey && KEY_RE.test(departmentKey) && departmentKey) ||
    slugifyKey(displayName) ||
    `${departmentType}_${Date.now().toString(36)}`;
  if (!KEY_RE.test(key)) {
    return { ok: false, result: RESULT.INVALID_INPUT };
  }

  const existing = await repo.findDepartmentByFacilityAndKey(pool, {
    facilityId,
    departmentKey: key,
    organizationId,
  });
  if (existing) {
    return { ok: false, result: RESULT.DUPLICATE_KEY };
  }

  const row = await repo.insertDepartment(pool, {
    organizationId,
    healthcareOrganizationId: facility.healthcare_organization_id,
    facilityId,
    departmentKey: key,
    departmentType,
    displayName: String(displayName).trim().slice(0, 100),
    status: "active",
  });

  await recordAuditEventSafe(pool, {
    organizationId,
    eventType: "activeclinic.department.create",
    actorType: "staff_member",
    actorId: staffId,
    resourceType: "department",
    resourceId: row.id,
    eventMetadata: {
      department_key: row.department_key,
      department_type: row.department_type,
      facility_id: facilityId,
    },
  });

  return { ok: true, result: RESULT.OK, department: mapDepartment(row) };
}

async function updateDepartment(pool, input) {
  const { staffId, organizationId, departmentId, displayName, status } = input;
  if (!staffId || !organizationId || !departmentId || !UUID_RE.test(departmentId)) {
    return { ok: false, result: RESULT.INVALID_INPUT };
  }
  if (status != null && !["active", "inactive"].includes(status)) {
    return { ok: false, result: RESULT.INVALID_STATUS };
  }

  const existing = await repo.findDepartmentById(pool, {
    id: departmentId,
    organizationId,
  });
  if (!existing) {
    return { ok: false, result: RESULT.NOT_FOUND };
  }

  const auth = await assertManage(pool, {
    organizationId,
    staffId,
    facilityId: existing.facility_id,
  });
  if (!auth.ok) {
    return { ok: false, result: RESULT.ACCESS_DENIED };
  }

  const updated = await repo.updateDepartment(pool, {
    id: departmentId,
    organizationId,
    displayName:
      displayName != null ? String(displayName).trim().slice(0, 100) : null,
    status: status || null,
  });

  await recordAuditEventSafe(pool, {
    organizationId,
    eventType:
      status === "inactive"
        ? "activeclinic.department.deactivate"
        : status === "active"
          ? "activeclinic.department.activate"
          : "activeclinic.department.update",
    actorType: "staff_member",
    actorId: staffId,
    resourceType: "department",
    resourceId: departmentId,
    eventMetadata: {
      department_key: existing.department_key,
      previous_status: existing.status,
      status: updated && updated.status,
    },
  });

  return { ok: true, result: RESULT.OK, department: mapDepartment(updated) };
}

/**
 * Idempotent default department set for a facility (demo / provisioning).
 */
async function ensureDefaultDepartments(pool, input) {
  const { organizationId, healthcareOrganizationId, facilityId, specs } = input;
  if (!organizationId || !healthcareOrganizationId || !facilityId) {
    return { ok: false, result: RESULT.INVALID_INPUT, created: 0, updated: 0, unchanged: 0 };
  }
  const defaults = Array.isArray(specs) && specs.length ? specs : DEFAULT_DEPARTMENT_SPECS;

  let created = 0;
  let updated = 0;
  let unchanged = 0;
  const departments = [];

  for (const spec of defaults) {
    const result = await repo.upsertDepartmentByKey(pool, {
      organizationId,
      healthcareOrganizationId,
      facilityId,
      departmentKey: spec.key,
      departmentType: spec.type,
      displayName: spec.name,
      status: "active",
    });
    if (result.created) created += 1;
    else if (result.updated) updated += 1;
    else unchanged += 1;
    departments.push(mapDepartment(result.row));
  }

  return {
    ok: true,
    result: RESULT.OK,
    created,
    updated,
    unchanged,
    departments,
  };
}

module.exports = {
  RESULT,
  PERM,
  DEPARTMENT_TYPES,
  DEPARTMENT_TYPE_LABELS,
  MODULE_BY_TYPE,
  MODULE_HREF_BY_TYPE,
  mapDepartment,
  listDepartments,
  createDepartment,
  updateDepartment,
  ensureDefaultDepartments,
  DEFAULT_DEPARTMENT_SPECS,
};
