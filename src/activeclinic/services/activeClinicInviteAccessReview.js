"use strict";

/**
 * Server-side capability summary for invite access review.
 * Groups permission keys — does not authorize; callers must still enforce grants.
 */

const CAPABILITY_GROUPS = Object.freeze([
  {
    key: "administration",
    label: "Administration",
    match: (k) =>
      k === "activeclinic.access" ||
      k.startsWith("activeclinic.organization.") ||
      k.startsWith("activeclinic.facility."),
  },
  {
    key: "staff",
    label: "Staff",
    match: (k) => k.startsWith("activeclinic.staff."),
  },
  {
    key: "patients",
    label: "Patients",
    match: (k) => k.startsWith("activeclinic.patient."),
  },
  {
    key: "appointments",
    label: "Appointments",
    match: (k) => k.startsWith("activeclinic.appointment."),
  },
  {
    key: "reception",
    label: "Reception",
    match: (k) => k.startsWith("activeclinic.reception."),
  },
  {
    key: "clinical",
    label: "Clinical",
    match: (k) =>
      k.startsWith("activeclinic.encounter.") ||
      k.startsWith("activeclinic.triage.") ||
      k.startsWith("activeclinic.nursing_intake.") ||
      k.startsWith("activeclinic.consultation.") ||
      k.startsWith("activeclinic.diagnosis.") ||
      k.startsWith("activeclinic.clinical_"),
  },
  {
    key: "pharmacy",
    label: "Pharmacy",
    match: (k) =>
      k.startsWith("activeclinic.pharmacy.") ||
      k.startsWith("activeclinic.inventory."),
  },
  {
    key: "diagnostics",
    label: "Diagnostics",
    match: (k) => k.startsWith("activeclinic.diagnostics."),
  },
  {
    key: "laboratory",
    label: "Laboratory",
    match: (k) => k.startsWith("activeclinic.lab."),
  },
  {
    key: "radiology",
    label: "Radiology",
    match: (k) => k.startsWith("activeclinic.radiology."),
  },
  {
    key: "billing",
    label: "Billing",
    match: (k) => k.startsWith("activeclinic.billing."),
  },
  {
    key: "cashier",
    label: "Cashier",
    match: (k) =>
      k.startsWith("activeclinic.cashier.") ||
      k.startsWith("activeclinic.payment."),
  },
  {
    key: "reports_audit",
    label: "Reports / Audit",
    match: (k) =>
      k.startsWith("activeclinic.audit.") ||
      k.includes(".reports.") ||
      k.endsWith(".audit_view"),
  },
]);

function groupPermissionKeys(permissionKeys) {
  const keys = Array.isArray(permissionKeys) ? permissionKeys.slice().sort() : [];
  const used = new Set();
  const groups = [];
  for (const group of CAPABILITY_GROUPS) {
    const matched = keys.filter((k) => group.match(k));
    matched.forEach((k) => used.add(k));
    if (matched.length) {
      groups.push({
        key: group.key,
        label: group.label,
        count: matched.length,
        permissions: matched,
      });
    }
  }
  const other = keys.filter((k) => !used.has(k));
  if (other.length) {
    groups.push({
      key: "other",
      label: "Other",
      count: other.length,
      permissions: other,
    });
  }
  return {
    permissionCount: keys.length,
    groups,
    permissions: keys,
  };
}

/**
 * @param {{ query: Function }} db
 * @param {string[]} roleKeys
 */
async function summarizePermissionsForRoleKeys(db, roleKeys) {
  const keys = Array.from(
    new Set((roleKeys || []).map((k) => String(k || "").trim()).filter(Boolean))
  );
  if (!keys.length) {
    return groupPermissionKeys([]);
  }
  const result = await db.query(
    `SELECT DISTINCT p.permission_key
       FROM blessboard.roles r
       JOIN blessboard.role_permissions rp ON rp.role_id = r.id
       JOIN blessboard.permissions p ON p.id = rp.permission_id
      WHERE r.role_key = ANY($1::text[])
        AND r.role_category = 'activeclinic'
        AND r.is_active = true
        AND p.is_active = true
      ORDER BY p.permission_key ASC`,
    [keys]
  );
  return groupPermissionKeys(result.rows.map((r) => r.permission_key));
}

module.exports = {
  CAPABILITY_GROUPS,
  groupPermissionKeys,
  summarizePermissionsForRoleKeys,
};
