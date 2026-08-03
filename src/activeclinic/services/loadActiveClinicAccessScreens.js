"use strict";

/**
 * ActiveClinic roles & access screen loaders (AC-V6-S06).
 * Stitch access screens are STITCH_GAP / VISUAL_BLOCKED.
 */

const accessRepo = require("../repositories/staffAccessRepository");
const {
  listStaffMembersByOrganization,
  getStaffMemberByIdAndOrganization,
} = require("./activeClinicStaffService");
const {
  listFacilitiesForStaff,
} = require("./activeClinicStaffFacilityService");
const {
  listFacilitiesByOrganization,
} = require("./facilityService");
const {
  RESULT,
  ROLE_LABELS,
  rolePlainLabel,
  actorIsNetworkAdmin,
  actorHasAssignAccess,
  listGrantableRoleOptions,
  mapAssignmentDetail,
  evaluateAssignmentEffectiveness,
  NETWORK_ADMIN,
  FACILITY_ADMIN,
  STAFF_ROLE,
} = require("./activeClinicAccessManagementService");

const STATUS_FILTERS = Object.freeze([
  { value: "effective", label: "Currently effective" },
  { value: "revoked", label: "Revoked" },
  { value: "expired", label: "Expired" },
  { value: "inactive", label: "Not effective" },
]);

const ROLE_FILTERS = Object.freeze([
  { value: NETWORK_ADMIN, label: ROLE_LABELS[NETWORK_ADMIN] },
  { value: FACILITY_ADMIN, label: ROLE_LABELS[FACILITY_ADMIN] },
  { value: STAFF_ROLE, label: ROLE_LABELS[STAFF_ROLE] },
]);

function staffDisplayName(row) {
  const preferred = String(row.staff_preferred_name || "").trim();
  if (preferred) return preferred;
  const first = String(row.staff_first_name || "").trim();
  const last = String(row.staff_last_name || "").trim();
  return `${first} ${last}`.trim() || "Staff member";
}

function staffInitials(staff) {
  const first = String((staff && staff.firstName) || "").trim();
  const last = String((staff && staff.lastName) || "").trim();
  if (first && last) return `${first[0]}${last[0]}`.toUpperCase();
  const name = String((staff && staff.displayName) || "").trim();
  const parts = name.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
  return (name.slice(0, 2) || "?").toUpperCase();
}

async function viewerScopedStaffIds(db, auth) {
  if (actorIsNetworkAdmin(auth)) return null;
  const listed = await listFacilitiesForStaff(db, {
    staffMemberId: auth.staffMember.id,
    organizationId: auth.organization.id,
  });
  const facilityIds = new Set(
    (listed.assignments || [])
      .filter((a) => a.status === "active")
      .map((a) => String(a.facilityId))
  );
  if (!facilityIds.size) return new Set();

  const staffListed = await listStaffMembersByOrganization(db, {
    organizationId: auth.organization.id,
  });
  const allowed = new Set();
  for (const member of staffListed.staffMembers || []) {
    const fac = await listFacilitiesForStaff(db, {
      staffMemberId: member.id,
      organizationId: auth.organization.id,
    });
    const overlap = (fac.assignments || []).some(
      (a) => a.status === "active" && facilityIds.has(String(a.facilityId))
    );
    if (overlap) allowed.add(String(member.id));
  }
  // Always include self for visibility of own grants.
  allowed.add(String(auth.staffMember.id));
  return allowed;
}

async function loadActiveClinicAccessOverviewScreen(db, input) {
  const auth = input.auth;
  if (!actorHasAssignAccess(auth)) {
    return {
      ok: false,
      code: RESULT.DENIED,
      restricted: true,
      overview: null,
    };
  }

  const query = input.query || {};
  const status = String(query.status || "effective").trim() || "effective";
  const roleKey = String(query.role || "").trim();
  const facilityKey = String(query.facility || "").trim();
  const q = String(query.q || "").trim().toLowerCase();

  const facilitiesListed = await listFacilitiesByOrganization(db, {
    organizationId: auth.organization.id,
    status: null,
  });
  const facilities = facilitiesListed.ok ? facilitiesListed.facilities || [] : [];
  let facilityId = null;
  if (facilityKey) {
    const match = facilities.find((f) => f.facilityKey === facilityKey);
    facilityId = match ? match.id : "__none__";
  }

  const scopedIds = await viewerScopedStaffIds(db, auth);
  const rows = await accessRepo.listRoleAssignmentsForOrganization(db, {
    organizationId: auth.organization.id,
    status,
    roleKey: roleKey || null,
    facilityId: facilityId === "__none__" ? null : facilityId,
    staffMemberIds: scopedIds ? Array.from(scopedIds) : null,
  });

  const assignments = [];
  for (const row of rows) {
    if (facilityId === "__none__") continue;
    const mapped = mapAssignmentDetail(row);
    const staffMember = {
      id: row.staff_member_id,
      firstName: row.staff_first_name,
      lastName: row.staff_last_name,
      displayName: staffDisplayName(row),
      status: row.staff_status,
      jobTitle: row.staff_job_title,
    };
    const effectiveness = await evaluateAssignmentEffectiveness(db, {
      organizationId: auth.organization.id,
      assignment: mapped,
      staffMember,
    });
    if (q) {
      const hay = `${staffMember.displayName} ${staffMember.jobTitle || ""} ${mapped.roleLabel}`.toLowerCase();
      if (!hay.includes(q)) continue;
    }
    if (status === "effective" && !effectiveness.effective) continue;
    assignments.push({
      ...mapped,
      staff: staffMember,
      effective: effectiveness.effective,
      ineffectiveReasons: effectiveness.reasons,
      detailHref: `/app/access/staff/${staffMember.id}`,
    });
  }

  const emptyMode =
    assignments.length === 0
      ? q || roleKey || facilityKey || (status && status !== "effective")
        ? "filtered"
        : "none"
      : null;

  return {
    ok: true,
    code: RESULT.OK,
    overview: {
      roles: [
        {
          key: NETWORK_ADMIN,
          label: ROLE_LABELS[NETWORK_ADMIN],
          description:
            "Organization-wide administration including facilities, staff, and access.",
        },
        {
          key: FACILITY_ADMIN,
          label: ROLE_LABELS[FACILITY_ADMIN],
          description: "Facility-scoped administration for assigned facilities.",
        },
        {
          key: STAFF_ROLE,
          label: ROLE_LABELS[STAFF_ROLE],
          description:
            "Authenticated access with facility visibility according to assignments.",
        },
      ],
      assignments,
      resultCount: assignments.length,
      emptyMode,
      filters: {
        q: String(query.q || "").trim(),
        status,
        role: roleKey,
        facility: facilityKey,
        active: Boolean(q || roleKey || facilityKey || (status && status !== "effective")),
      },
      filterOptions: {
        statuses: STATUS_FILTERS,
        roles: ROLE_FILTERS,
        facilities: facilities
          .filter((f) => f.status !== "archived")
          .map((f) => ({ value: f.facilityKey, label: f.displayName })),
      },
      actions: {
        canAssign: true,
        staffDirectoryHref: "/app/staff",
      },
      organization: {
        publicName:
          (auth.healthcareOrganization && auth.healthcareOrganization.publicName) ||
          (auth.organization && auth.organization.displayName) ||
          "Organization",
      },
      selectedFacility: auth.selectedFacility
        ? {
            displayName: auth.selectedFacility.displayName,
            facilityKey: auth.selectedFacility.facilityKey,
          }
        : null,
    },
  };
}

async function loadActiveClinicStaffAccessDetailScreen(db, input) {
  const auth = input.auth;
  if (!actorHasAssignAccess(auth)) {
    return { ok: false, code: RESULT.DENIED, restricted: true };
  }

  const staffMemberId = String(input.staffMemberId || "").trim();
  const staff = await getStaffMemberByIdAndOrganization(db, {
    id: staffMemberId,
    organizationId: auth.organization.id,
  });
  if (!staff.ok) {
    return { ok: false, code: RESULT.STAFF_NOT_FOUND };
  }

  const scopedIds = await viewerScopedStaffIds(db, auth);
  if (scopedIds && !scopedIds.has(String(staffMemberId))) {
    return { ok: false, code: RESULT.DENIED };
  }

  const facilityRows = await listFacilitiesForStaff(db, {
    staffMemberId,
    organizationId: auth.organization.id,
  });
  const facilities = (facilityRows.assignments || []).map((a) => ({
    id: a.facilityId,
    facilityKey: a.facilityKey,
    displayName: a.facilityDisplayName,
    status: a.status,
    facilityStatus: a.facilityStatus,
    isPrimary: a.isPrimary,
  }));

  const rows = await accessRepo.listRoleAssignmentsForStaff(db, {
    staffMemberId,
    organizationId: auth.organization.id,
    includeInactive: true,
  });

  const assignments = [];
  for (const row of rows) {
    const mapped = mapAssignmentDetail(row);
    const effectiveness = await evaluateAssignmentEffectiveness(db, {
      organizationId: auth.organization.id,
      assignment: mapped,
      staffMember: staff.staffMember,
    });
    assignments.push({
      ...mapped,
      effective: effectiveness.effective,
      ineffectiveReasons: effectiveness.reasons,
      canEditExpiry: mapped.isActiveRecord,
      canRevoke: mapped.status === "active",
      editHref: `/app/access/staff/${staffMemberId}/roles/${mapped.id}/edit`,
      revokeHref: `/app/access/staff/${staffMemberId}/roles/${mapped.id}/revoke`,
    });
  }

  const grantable = listGrantableRoleOptions(auth);

  return {
    ok: true,
    code: RESULT.OK,
    detail: {
      staff: {
        id: staff.staffMember.id,
        displayName: staff.staffMember.displayName,
        firstName: staff.staffMember.firstName,
        lastName: staff.staffMember.lastName,
        jobTitle: staff.staffMember.jobTitle,
        status: staff.staffMember.status,
        statusLabel:
          staff.staffMember.status === "active"
            ? "Active"
            : staff.staffMember.status === "invited"
              ? "Invited"
              : staff.staffMember.status === "suspended"
                ? "Suspended"
                : String(staff.staffMember.status || "—"),
        initials: staffInitials(staff.staffMember),
        profileHref: `/app/staff/${staff.staffMember.id}`,
      },
      facilities,
      assignments,
      activeCount: assignments.filter((a) => a.effective).length,
      actions: {
        canAssign: grantable.length > 0,
        assignHref: `/app/access/staff/${staffMemberId}/assign`,
      },
    },
  };
}

async function loadActiveClinicAssignRoleScreen(db, input) {
  const auth = input.auth;
  if (!actorHasAssignAccess(auth)) {
    return { ok: false, code: RESULT.DENIED, restricted: true };
  }

  const staffMemberId = String(input.staffMemberId || "").trim();
  const staff = await getStaffMemberByIdAndOrganization(db, {
    id: staffMemberId,
    organizationId: auth.organization.id,
  });
  if (!staff.ok) {
    return { ok: false, code: RESULT.STAFF_NOT_FOUND };
  }

  const scopedIds = await viewerScopedStaffIds(db, auth);
  if (scopedIds && !scopedIds.has(String(staffMemberId))) {
    return { ok: false, code: RESULT.DENIED };
  }

  const roleOptions = listGrantableRoleOptions(auth);
  const facilityRows = await listFacilitiesForStaff(db, {
    staffMemberId,
    organizationId: auth.organization.id,
  });
  let facilities = (facilityRows.assignments || [])
    .filter((a) => a.status === "active")
    .map((a) => ({
      id: a.facilityId,
      facilityKey: a.facilityKey,
      displayName: a.facilityDisplayName,
    }));

  if (!actorIsNetworkAdmin(auth)) {
    const allowed = await listFacilitiesForStaff(db, {
      staffMemberId: auth.staffMember.id,
      organizationId: auth.organization.id,
    });
    const allowedIds = new Set(
      (allowed.assignments || [])
        .filter((a) => a.status === "active")
        .map((a) => String(a.facilityId))
    );
    facilities = facilities.filter((f) => allowedIds.has(String(f.id)));
  }

  const values = input.values || {
    roleKey: roleOptions[0] ? roleOptions[0].value : STAFF_ROLE,
    scopeType:
      roleOptions[0] && roleOptions[0].scopes.includes("organisation")
        ? roleOptions[0].value === NETWORK_ADMIN
          ? "organisation"
          : "facility"
        : "facility",
    facilityId: facilities[0] ? facilities[0].id : "",
    expiresAt: "",
  };

  return {
    ok: true,
    code: RESULT.OK,
    form: {
      mode: "assign",
      formAction: `/app/access/staff/${staffMemberId}/roles`,
      cancelHref: `/app/access/staff/${staffMemberId}`,
      staff: {
        id: staff.staffMember.id,
        displayName: staff.staffMember.displayName,
        status: staff.staffMember.status,
      },
      roleOptions,
      facilities,
      values,
      errors: input.errors || [],
      fieldErrors: input.fieldErrors || {},
    },
  };
}

async function loadActiveClinicEditRoleScreen(db, input) {
  const auth = input.auth;
  if (!actorHasAssignAccess(auth)) {
    return { ok: false, code: RESULT.DENIED, restricted: true };
  }

  const staffMemberId = String(input.staffMemberId || "").trim();
  const assignmentId = String(input.assignmentId || "").trim();
  const staff = await getStaffMemberByIdAndOrganization(db, {
    id: staffMemberId,
    organizationId: auth.organization.id,
  });
  if (!staff.ok) return { ok: false, code: RESULT.STAFF_NOT_FOUND };

  const scopedIds = await viewerScopedStaffIds(db, auth);
  if (scopedIds && !scopedIds.has(String(staffMemberId))) {
    return { ok: false, code: RESULT.DENIED };
  }

  const row = await accessRepo.findRoleAssignmentById(db, {
    id: assignmentId,
    organizationId: auth.organization.id,
  });
  if (!row || String(row.staff_member_id) !== staffMemberId) {
    return { ok: false, code: RESULT.NOT_FOUND };
  }

  const mapped = mapAssignmentDetail(row);
  const roleOptions = listGrantableRoleOptions(auth);
  const facilityRows = await listFacilitiesForStaff(db, {
    staffMemberId,
    organizationId: auth.organization.id,
  });
  let facilities = (facilityRows.assignments || [])
    .filter((a) => a.status === "active")
    .map((a) => ({
      id: a.facilityId,
      facilityKey: a.facilityKey,
      displayName: a.facilityDisplayName,
    }));
  if (!actorIsNetworkAdmin(auth)) {
    const allowed = await listFacilitiesForStaff(db, {
      staffMemberId: auth.staffMember.id,
      organizationId: auth.organization.id,
    });
    const allowedIds = new Set(
      (allowed.assignments || [])
        .filter((a) => a.status === "active")
        .map((a) => String(a.facilityId))
    );
    facilities = facilities.filter((f) => allowedIds.has(String(f.id)));
  }

  const expiresLocal = mapped.expiresAt
    ? new Date(mapped.expiresAt).toISOString().slice(0, 16)
    : "";

  return {
    ok: true,
    code: RESULT.OK,
    form: {
      mode: "edit",
      formAction: `/app/access/staff/${staffMemberId}/roles/${assignmentId}`,
      cancelHref: `/app/access/staff/${staffMemberId}`,
      staff: {
        id: staff.staffMember.id,
        displayName: staff.staffMember.displayName,
        status: staff.staffMember.status,
      },
      assignment: mapped,
      roleOptions,
      facilities,
      values: input.values || {
        roleKey: mapped.roleKey,
        scopeType: mapped.scopeType,
        facilityId: mapped.facilityId || "",
        expiresAt: expiresLocal,
        editMode: "expiry",
      },
      errors: input.errors || [],
      fieldErrors: input.fieldErrors || {},
      policyNote:
        "Changing role or scope revokes the current assignment and creates a new one. Expiry-only edits preserve the assignment history.",
    },
  };
}

async function loadActiveClinicRevokeRoleScreen(db, input) {
  const auth = input.auth;
  if (!actorHasAssignAccess(auth)) {
    return { ok: false, code: RESULT.DENIED, restricted: true };
  }

  const staffMemberId = String(input.staffMemberId || "").trim();
  const assignmentId = String(input.assignmentId || "").trim();
  const staff = await getStaffMemberByIdAndOrganization(db, {
    id: staffMemberId,
    organizationId: auth.organization.id,
  });
  if (!staff.ok) return { ok: false, code: RESULT.STAFF_NOT_FOUND };

  const row = await accessRepo.findRoleAssignmentById(db, {
    id: assignmentId,
    organizationId: auth.organization.id,
  });
  if (!row || String(row.staff_member_id) !== staffMemberId) {
    return { ok: false, code: RESULT.NOT_FOUND };
  }

  return {
    ok: true,
    code: RESULT.OK,
    revoke: {
      formAction: `/app/access/staff/${staffMemberId}/roles/${assignmentId}/revoke`,
      cancelHref: `/app/access/staff/${staffMemberId}`,
      staff: {
        id: staff.staffMember.id,
        displayName: staff.staffMember.displayName,
      },
      assignment: mapAssignmentDetail(row),
    },
  };
}

module.exports = {
  loadActiveClinicAccessOverviewScreen,
  loadActiveClinicStaffAccessDetailScreen,
  loadActiveClinicAssignRoleScreen,
  loadActiveClinicEditRoleScreen,
  loadActiveClinicRevokeRoleScreen,
  rolePlainLabel,
};
