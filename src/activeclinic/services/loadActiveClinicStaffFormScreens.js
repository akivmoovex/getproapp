"use strict";

/**
 * ActiveClinic staff create/edit form loaders (AC-V6-S05).
 * Stitch staff management screens are STITCH_GAP / VISUAL_BLOCKED.
 */

const {
  EMPLOYMENT_TYPES,
  EMPLOYMENT_LABELS,
  employmentTypeLabel,
  hasOrgWideStaffDirectory,
  staffStatusLabel,
} = require("./loadActiveClinicStaffScreens");
const {
  getStaffMemberByIdAndOrganization,
} = require("./activeClinicStaffService");
const {
  listFacilitiesForStaff,
} = require("./activeClinicStaffFacilityService");
const {
  listFacilitiesByOrganization,
} = require("./facilityService");
const {
  NETWORK_ADMIN,
  FACILITY_ADMIN,
  STAFF_ROLE,
} = require("./activeClinicAuthorizationService");

function hasPerm(perms, key) {
  return Array.isArray(perms) ? perms.includes(key) : false;
}

async function listAssignableFacilities(db, auth) {
  const listed = await listFacilitiesByOrganization(db, {
    organizationId: auth.organization.id,
    status: "active",
  });
  let facilities = listed.ok ? listed.facilities || [] : [];
  if (!hasOrgWideStaffDirectory(auth)) {
    const assigned = await listFacilitiesForStaff(db, {
      staffMemberId: auth.staffMember.id,
      organizationId: auth.organization.id,
    });
    const allowed = new Set(
      (assigned.assignments || [])
        .filter((a) => a.status === "active")
        .map((a) => String(a.facilityId))
    );
    facilities = facilities.filter((f) => allowed.has(String(f.id)));
  }
  return facilities.map((f) => ({
    id: f.id,
    facilityKey: f.facilityKey,
    displayName: f.displayName,
  }));
}

function foundationalRoleOptions(auth) {
  const canAssignAccess = hasPerm(auth.permissions, "activeclinic.staff.assign_access");
  if (!canAssignAccess) return [];
  const options = [
    {
      value: STAFF_ROLE,
      label: "Staff",
      description: "Authenticated access with facility visibility from assignments.",
      scopes: ["facility", "organisation"],
    },
    {
      value: FACILITY_ADMIN,
      label: "Facility administrator",
      description: "Manage assigned facilities and staff within those facilities.",
      scopes: ["facility"],
    },
  ];
  if (hasOrgWideStaffDirectory(auth)) {
    options.unshift({
      value: NETWORK_ADMIN,
      label: "Network administrator",
      description: "Organization-wide administration including facilities, staff, and access.",
      scopes: ["organisation"],
    });
  }
  return options;
}

function blankStaffForm(defaults) {
  const d = defaults || {};
  return {
    firstName: d.firstName || "",
    lastName: d.lastName || "",
    preferredName: d.preferredName || "",
    phone: d.phone || d.phoneDisplay || "",
    email: d.email || d.emailDisplay || "",
    jobTitle: d.jobTitle || "",
    employmentType: d.employmentType || "permanent",
    staffNumber: d.staffNumber || "",
    startDate: d.startDate || "",
    endDate: d.endDate || "",
    facilityIds: Array.isArray(d.facilityIds) ? d.facilityIds.map(String) : [],
    primaryFacilityId: d.primaryFacilityId ? String(d.primaryFacilityId) : "",
    roleKey: d.roleKey || STAFF_ROLE,
    roleScope: d.roleScope || "facility",
    roleFacilityId: d.roleFacilityId ? String(d.roleFacilityId) : "",
    issueInvitation: d.issueInvitation !== false,
  };
}

function parseStaffFormBody(body) {
  const b = body || {};
  let facilityIds = b.facility_ids || b["facility_ids[]"] || [];
  if (!Array.isArray(facilityIds)) facilityIds = facilityIds ? [facilityIds] : [];
  facilityIds = facilityIds.map((id) => String(id).trim()).filter(Boolean);

  return {
    firstName: String(b.first_name || "").trim(),
    lastName: String(b.last_name || "").trim(),
    preferredName: String(b.preferred_name || "").trim(),
    phone: String(b.phone || "").trim(),
    email: String(b.email || "").trim(),
    jobTitle: String(b.job_title || "").trim(),
    employmentType: String(b.employment_type || "permanent").trim(),
    staffNumber: String(b.staff_number || "").trim(),
    startDate: String(b.start_date || "").trim(),
    endDate: String(b.end_date || "").trim(),
    facilityIds,
    primaryFacilityId: String(b.primary_facility_id || "").trim(),
    roleKey: String(b.role_key || STAFF_ROLE).trim(),
    roleScope: String(b.role_scope || "facility").trim(),
    roleFacilityId: String(b.role_facility_id || "").trim(),
    issueInvitation:
      b.issue_invitation === undefined
        ? true
        : b.issue_invitation === "1" ||
          b.issue_invitation === "on" ||
          b.issue_invitation === true,
  };
}

function validateStaffFormValues(values, opts) {
  const errors = [];
  const fieldErrors = {};
  if (!values.firstName) {
    fieldErrors.first_name = "Enter a first name.";
    errors.push("First name is required.");
  }
  if (!values.lastName) {
    fieldErrors.last_name = "Enter a last name.";
    errors.push("Last name is required.");
  }
  if (!values.phone) {
    fieldErrors.phone = "Enter a phone number.";
    errors.push("Phone is required.");
  }
  if (!EMPLOYMENT_TYPES.includes(values.employmentType)) {
    fieldErrors.employment_type = "Choose a valid employment type.";
    errors.push("Employment type is invalid.");
  }
  if (opts && opts.requireFacilities) {
    if (!values.facilityIds.length) {
      fieldErrors.facility_ids = "Select at least one facility.";
      errors.push("Select at least one facility.");
    } else if (
      values.primaryFacilityId &&
      !values.facilityIds.includes(values.primaryFacilityId)
    ) {
      fieldErrors.primary_facility_id =
        "Primary facility must be one of the selected facilities.";
      errors.push("Primary facility must be among the selected facilities.");
    }
  }
  if (opts && opts.requireRole) {
    const allowed = (opts.roleOptions || []).map((r) => r.value);
    if (!allowed.includes(values.roleKey)) {
      fieldErrors.role_key = "Choose a role you are allowed to assign.";
      errors.push("Selected role is not permitted.");
    }
    if (values.roleKey === FACILITY_ADMIN && values.roleScope !== "facility") {
      fieldErrors.role_scope = "Facility administrator requires facility scope.";
      errors.push("Facility administrator requires facility scope.");
    }
    if (values.roleScope === "facility") {
      const roleFac = values.roleFacilityId || values.primaryFacilityId || values.facilityIds[0];
      if (!roleFac || !values.facilityIds.includes(roleFac)) {
        fieldErrors.role_facility_id =
          "Choose a facility within the assigned facilities for this role.";
        errors.push("Facility-scoped role needs a valid facility.");
      }
    }
    if (values.roleKey === NETWORK_ADMIN && values.roleScope !== "organisation") {
      fieldErrors.role_scope = "Network administrator must be organization-wide.";
      errors.push("Network administrator must be organization-wide.");
    }
  }
  return { ok: errors.length === 0, errors, fieldErrors };
}

async function loadActiveClinicCreateStaffScreen(db, input) {
  const auth = input.auth;
  const canCreate = hasPerm(auth.permissions, "activeclinic.staff.create");
  const canInvite = hasPerm(auth.permissions, "activeclinic.staff.invite");
  if (!canCreate || !canInvite) {
    return { ok: false, code: "access_denied" };
  }
  const facilities = await listAssignableFacilities(db, auth);
  const roleOptions = foundationalRoleOptions(auth);
  const values = blankStaffForm(input.values || {});
  if (!values.primaryFacilityId && values.facilityIds[0]) {
    values.primaryFacilityId = values.facilityIds[0];
  }
  if (
    !hasOrgWideStaffDirectory(auth) &&
    facilities.length === 1 &&
    !values.facilityIds.length
  ) {
    values.facilityIds = [facilities[0].id];
    values.primaryFacilityId = facilities[0].id;
    values.roleFacilityId = facilities[0].id;
  }

  return {
    ok: true,
    mode: "create",
    formAction: "/app/staff",
    values,
    errors: input.errors || [],
    fieldErrors: input.fieldErrors || {},
    facilities,
    roleOptions,
    employmentOptions: EMPLOYMENT_TYPES.map((t) => ({
      value: t,
      label: employmentTypeLabel(t),
    })),
    canAssignFacility: hasPerm(auth.permissions, "activeclinic.staff.assign_facility"),
    canAssignAccess: hasPerm(auth.permissions, "activeclinic.staff.assign_access"),
  };
}

async function loadActiveClinicEditStaffScreen(db, input) {
  const auth = input.auth;
  if (!hasPerm(auth.permissions, "activeclinic.staff.update")) {
    return { ok: false, code: "access_denied" };
  }
  const got = await getStaffMemberByIdAndOrganization(db, {
    id: input.staffId,
    organizationId: auth.organization.id,
  });
  if (!got.ok) return { ok: false, code: got.code || "staff_not_found" };

  // Reuse readability from list loader via facility overlap for non-network admins.
  if (!hasOrgWideStaffDirectory(auth)) {
    const viewerFac = await listFacilitiesForStaff(db, {
      staffMemberId: auth.staffMember.id,
      organizationId: auth.organization.id,
    });
    const allowed = new Set(
      (viewerFac.assignments || [])
        .filter((a) => a.status === "active")
        .map((a) => String(a.facilityId))
    );
    const targetFac = await listFacilitiesForStaff(db, {
      staffMemberId: got.staffMember.id,
      organizationId: auth.organization.id,
    });
    const overlap = (targetFac.assignments || []).some(
      (a) => a.status === "active" && allowed.has(String(a.facilityId))
    );
    if (!overlap) return { ok: false, code: "staff_not_found" };
  }

  const assignments = await listFacilitiesForStaff(db, {
    staffMemberId: got.staffMember.id,
    organizationId: auth.organization.id,
  });
  const active = (assignments.assignments || []).filter((a) => a.status === "active");
  const facilities = await listAssignableFacilities(db, auth);
  const s = got.staffMember;
  const defaults = blankStaffForm({
    firstName: s.firstName,
    lastName: s.lastName,
    preferredName: s.preferredName,
    phone: s.phoneDisplay,
    email: s.emailDisplay,
    jobTitle: s.jobTitle,
    employmentType: s.employmentType,
    staffNumber: s.staffNumber,
    startDate: s.startDate,
    endDate: s.endDate,
    facilityIds: active.map((a) => String(a.facilityId)),
    primaryFacilityId: String(
      (active.find((a) => a.isPrimary) || active[0] || {}).facilityId || ""
    ),
    ...(input.values || {}),
  });

  return {
    ok: true,
    mode: "edit",
    formAction: `/app/staff/${encodeURIComponent(s.id)}`,
    staff: {
      id: s.id,
      displayName: s.displayName,
      status: s.status,
      statusLabel: staffStatusLabel(s.status),
    },
    values: defaults,
    errors: input.errors || [],
    fieldErrors: input.fieldErrors || {},
    facilities,
    roleOptions: [],
    employmentOptions: EMPLOYMENT_TYPES.map((t) => ({
      value: t,
      label: employmentTypeLabel(t),
    })),
    canAssignFacility: hasPerm(auth.permissions, "activeclinic.staff.assign_facility"),
    canAssignAccess: false,
  };
}

function buildInviteRoleAssignments(values) {
  if (!values.roleKey) return [];
  const scopeType =
    values.roleKey === NETWORK_ADMIN ? "organisation" : values.roleScope || "facility";
  const facilityId =
    scopeType === "facility"
      ? values.roleFacilityId || values.primaryFacilityId || values.facilityIds[0] || null
      : null;
  return [
    {
      roleKey: values.roleKey,
      scopeType,
      facilityId,
    },
  ];
}

function orderFacilityIds(values) {
  const ids = values.facilityIds.slice();
  const primary = values.primaryFacilityId || ids[0];
  if (primary && ids.includes(primary)) {
    return [primary, ...ids.filter((id) => id !== primary)];
  }
  return ids;
}

module.exports = {
  blankStaffForm,
  parseStaffFormBody,
  validateStaffFormValues,
  loadActiveClinicCreateStaffScreen,
  loadActiveClinicEditStaffScreen,
  foundationalRoleOptions,
  listAssignableFacilities,
  buildInviteRoleAssignments,
  orderFacilityIds,
  EMPLOYMENT_LABELS,
  NETWORK_ADMIN,
  FACILITY_ADMIN,
  STAFF_ROLE,
};
