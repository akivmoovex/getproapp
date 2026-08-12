"use strict";

/**
 * ActiveClinic roles & access screen loaders (AC-V6-S06 / Prompt 7).
 * Stitch access screens remain STITCH_GAP / VISUAL_BLOCKED.
 */

const accessRepo = require("../repositories/staffAccessRepository");
const identityRepo = require("../../platform/repositories/platformIdentityRepository");
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
  ROLE_DESCRIPTIONS,
  rolePlainLabel,
  actorIsNetworkAdmin,
  actorHasAssignAccess,
  listGrantableRoleOptions,
  mapAssignmentDetail,
  evaluateAssignmentEffectiveness,
  scopesForRole,
  NETWORK_ADMIN,
  ORGANIZATION_ADMIN,
  FACILITY_ADMIN,
  STAFF_ROLE,
  ACTIVECLINIC_ROLE_CATALOGUE,
} = require("./activeClinicAccessManagementService");
const {
  groupPermissionKeys,
  summarizePermissionsForRoleKeys,
} = require("./activeClinicInviteAccessReview");
const {
  getInvitationStatus,
} = require("./activeClinicStaffInvitationService");

const STATUS_FILTERS = Object.freeze([
  { value: "all", label: "All staff" },
  { value: "active", label: "Active access" },
  { value: "pending_invite", label: "Invitation pending" },
  { value: "not_activated", label: "Account not activated" },
  { value: "suspended", label: "Suspended" },
  { value: "no_access_role", label: "No access role" },
  { value: "directory_only", label: "Directory only" },
]);

const ASSIGNMENT_STATUS_FILTERS = Object.freeze([
  { value: "effective", label: "Currently effective" },
  { value: "revoked", label: "Revoked" },
  { value: "expired", label: "Expired" },
  { value: "inactive", label: "Not effective" },
]);

function staffDisplayName(row) {
  const preferred = String(row.staff_preferred_name || "").trim();
  if (preferred) return preferred;
  const first = String(row.staff_first_name || row.firstName || "").trim();
  const last = String(row.staff_last_name || row.lastName || "").trim();
  if (first || last) return `${first} ${last}`.trim();
  return String(row.displayName || row.display_name || "Staff member").trim();
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

function catalogueRoleFilters() {
  return ACTIVECLINIC_ROLE_CATALOGUE.map((value) => ({
    value,
    label: ROLE_LABELS[value] || value,
  }));
}

function scopeLabelForRole(roleKey) {
  const scopes = scopesForRole(roleKey);
  if (scopes.length === 1 && scopes[0] === "organisation") {
    return "Organization-wide";
  }
  if (scopes.length === 1 && scopes[0] === "facility") {
    return "Facility";
  }
  return "Organization or facility";
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
  allowed.add(String(auth.staffMember.id));
  return allowed;
}

async function deriveAccessAccountState(db, staff, organizationId) {
  if (staff.status === "suspended") {
    return { key: "suspended", label: "Suspended" };
  }
  if (staff.status === "archived") {
    return { key: "inactive", label: "Inactive" };
  }

  let identity = null;
  if (staff.platformIdentityId) {
    const row = await identityRepo.findIdentityById(db, staff.platformIdentityId);
    if (row) {
      identity = {
        status: row.status,
        hasPasswordHash: Boolean(row.password_hash),
        lockedAt: row.locked_at || null,
        suspendedAt: row.suspended_at || null,
      };
    }
  }

  const invitationStatus = await getInvitationStatus(db, {
    organizationId,
    staffMemberId: staff.id,
  });
  const pending =
    invitationStatus.ok && invitationStatus.pending
      ? invitationStatus.pending
      : null;

  if (!staff.platformIdentityId || !identity) {
    if (pending) return { key: "pending_invite", label: "Invitation pending" };
    if (staff.status === "invited") {
      return { key: "not_activated", label: "Account not activated" };
    }
    return { key: "directory_only", label: "Directory only" };
  }
  if (identity.status !== "active" || identity.lockedAt || identity.suspendedAt) {
    return { key: "inactive", label: "Access unavailable" };
  }
  if (staff.status === "invited" || !identity.hasPasswordHash) {
    if (pending) return { key: "pending_invite", label: "Invitation pending" };
    return { key: "not_activated", label: "Account not activated" };
  }
  return { key: "active", label: "Active" };
}

async function summarizeStaffScopedAccess(db, input) {
  const permissions = await accessRepo.listPermissionKeysForStaff(db, {
    staffMemberId: input.staffMemberId,
    organizationId: input.organizationId,
    facilityId: input.facilityId || null,
  });
  return groupPermissionKeys(permissions);
}

async function buildRoleCatalogue(db, organizationId, scopedIds) {
  const countResult = await db.query(
    `SELECT r.role_key, COUNT(DISTINCT a.staff_member_id)::int AS staff_count
       FROM blessboard.roles r
       LEFT JOIN activeclinic.staff_role_assignments a
         ON a.role_id = r.id
        AND a.organization_id = $1
        AND a.status = 'active'
        AND (a.expires_at IS NULL OR a.expires_at > now())
        AND ($2::uuid[] IS NULL OR a.staff_member_id = ANY($2::uuid[]))
      WHERE r.role_category = 'activeclinic'
        AND r.is_active = true
        AND r.role_key = ANY($3::text[])
      GROUP BY r.role_key`,
    [
      organizationId,
      scopedIds ? Array.from(scopedIds) : null,
      ACTIVECLINIC_ROLE_CATALOGUE.slice(),
    ]
  );
  const counts = new Map(
    countResult.rows.map((r) => [r.role_key, Number(r.staff_count) || 0])
  );

  const roles = [];
  for (const roleKey of ACTIVECLINIC_ROLE_CATALOGUE) {
    const summary = await summarizePermissionsForRoleKeys(db, [roleKey]);
    roles.push({
      key: roleKey,
      label: ROLE_LABELS[roleKey] || roleKey,
      description: ROLE_DESCRIPTIONS[roleKey] || "",
      scopeLabel: scopeLabelForRole(roleKey),
      staffCount: counts.get(roleKey) || 0,
      compatibility: roleKey === NETWORK_ADMIN,
      capabilityGroups: (summary.groups || []).map((g) => ({
        key: g.key,
        label: g.label,
        count: g.count,
      })),
      permissionCount: summary.permissionCount || 0,
    });
  }
  return roles;
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
  const tab = String(query.tab || "staff").trim() === "catalogue" ? "catalogue" : "staff";
  const accountStatus = String(query.status || "all").trim() || "all";
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
  const roleCatalogue = await buildRoleCatalogue(
    db,
    auth.organization.id,
    scopedIds
  );

  if (tab === "catalogue") {
    return {
      ok: true,
      code: RESULT.OK,
      overview: {
        tab: "catalogue",
        roles: roleCatalogue,
        staffRows: [],
        assignments: [],
        resultCount: roleCatalogue.length,
        emptyMode: roleCatalogue.length ? null : "none",
        filters: {
          q: "",
          status: accountStatus,
          role: roleKey,
          facility: facilityKey,
          active: false,
          tab,
        },
        filterOptions: {
          statuses: STATUS_FILTERS,
          roles: catalogueRoleFilters(),
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
            (auth.healthcareOrganization &&
              auth.healthcareOrganization.publicName) ||
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

  const staffListed = await listStaffMembersByOrganization(db, {
    organizationId: auth.organization.id,
  });
  let members = staffListed.staffMembers || [];
  if (scopedIds) {
    members = members.filter((m) => scopedIds.has(String(m.id)));
  }

  const staffRows = [];
  for (const member of members) {
    if (facilityId === "__none__") continue;

    const fac = await listFacilitiesForStaff(db, {
      staffMemberId: member.id,
      organizationId: auth.organization.id,
    });
    const activeFacilities = (fac.assignments || []).filter(
      (a) => a.status === "active"
    );
    if (facilityId && !activeFacilities.some((a) => String(a.facilityId) === String(facilityId))) {
      continue;
    }

    const roleRows = await accessRepo.listRoleAssignmentsForStaff(db, {
      staffMemberId: member.id,
      organizationId: auth.organization.id,
      includeInactive: false,
    });
    const roles = [];
    for (const row of roleRows) {
      const mapped = mapAssignmentDetail(row);
      const effectiveness = await evaluateAssignmentEffectiveness(db, {
        organizationId: auth.organization.id,
        assignment: mapped,
        staffMember: member,
      });
      if (!effectiveness.effective) continue;
      roles.push({
        id: mapped.id,
        roleKey: mapped.roleKey,
        roleLabel: mapped.roleLabel,
        scopeLabel: mapped.scopeLabel,
      });
    }

    if (roleKey && !roles.some((r) => r.roleKey === roleKey)) continue;

    const account = await deriveAccessAccountState(
      db,
      member,
      auth.organization.id
    );
    let accessStatus = account;
    if (account.key === "active" && roles.length === 0) {
      accessStatus = { key: "no_access_role", label: "No access role" };
    } else if (
      (account.key === "directory_only" || account.key === "not_activated") &&
      roles.length === 0
    ) {
      // Keep directory-only / not-activated labels; not an error state.
      accessStatus = account;
    }

    if (accountStatus !== "all" && accessStatus.key !== accountStatus) {
      continue;
    }

    if (q) {
      const hay = `${member.displayName} ${member.jobTitle || ""} ${roles
        .map((r) => r.roleLabel)
        .join(" ")}`.toLowerCase();
      if (!hay.includes(q)) continue;
    }

    staffRows.push({
      id: member.id,
      displayName: member.displayName || staffDisplayName(member),
      jobTitle: member.jobTitle || "",
      accountStatus: account,
      accessStatus,
      facilities: activeFacilities.map((a) => ({
        id: a.facilityId,
        displayName: a.facilityDisplayName || a.facilityKey,
        isPrimary: a.isPrimary,
      })),
      roles,
      roleLabels: roles.map((r) => r.roleLabel),
      detailHref: `/app/access/staff/${member.id}`,
    });
  }

  // Preserve assignment-centric listing for parity tests that expect
  // ?status=effective assignment rows (when status matches assignment filters).
  const assignmentStatus = ASSIGNMENT_STATUS_FILTERS.some(
    (s) => s.value === accountStatus
  )
    ? accountStatus
    : null;
  let assignments = [];
  if (assignmentStatus) {
    const rows = await accessRepo.listRoleAssignmentsForOrganization(db, {
      organizationId: auth.organization.id,
      status: assignmentStatus,
      roleKey: roleKey || null,
      facilityId: facilityId === "__none__" ? null : facilityId,
      staffMemberIds: scopedIds ? Array.from(scopedIds) : null,
    });
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
      if (assignmentStatus === "effective" && !effectiveness.effective) continue;
      assignments.push({
        ...mapped,
        staff: staffMember,
        effective: effectiveness.effective,
        ineffectiveReasons: effectiveness.reasons,
        detailHref: `/app/access/staff/${staffMember.id}`,
      });
    }
  }

  const emptyMode =
    staffRows.length === 0 && assignments.length === 0
      ? q || roleKey || facilityKey || (accountStatus && accountStatus !== "all")
        ? "filtered"
        : "none"
      : null;

  return {
    ok: true,
    code: RESULT.OK,
    overview: {
      tab: "staff",
      roles: roleCatalogue,
      staffRows,
      assignments,
      viewMode: assignmentStatus ? "assignments" : "staff",
      resultCount: assignmentStatus ? assignments.length : staffRows.length,
      emptyMode,
      filters: {
        q: String(query.q || "").trim(),
        status: accountStatus,
        role: roleKey,
        facility: facilityKey,
        active: Boolean(
          q ||
            roleKey ||
            facilityKey ||
            (accountStatus && accountStatus !== "all")
        ),
        tab,
      },
      filterOptions: {
        statuses: [...STATUS_FILTERS, ...ASSIGNMENT_STATUS_FILTERS],
        roles: catalogueRoleFilters(),
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
          (auth.healthcareOrganization &&
            auth.healthcareOrganization.publicName) ||
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
  const account = await deriveAccessAccountState(
    db,
    staff.staffMember,
    auth.organization.id
  );

  const facilityContextId =
    (auth.selectedFacility && auth.selectedFacility.id) ||
    (facilities.find((f) => f.status === "active") || {}).id ||
    null;
  const effectiveAccess = await summarizeStaffScopedAccess(db, {
    organizationId: auth.organization.id,
    staffMemberId,
    facilityId: facilityContextId,
  });
  const orgWideAccess = await summarizeStaffScopedAccess(db, {
    organizationId: auth.organization.id,
    staffMemberId,
    facilityId: null,
  });

  const canManageCredentials = Array.isArray(auth.permissions)
    ? auth.permissions.includes("activeclinic.staff.manage_credentials")
    : false;
  const canInvite = Array.isArray(auth.permissions)
    ? auth.permissions.includes("activeclinic.staff.invite")
    : false;
  const canSuspend = Array.isArray(auth.permissions)
    ? auth.permissions.includes("activeclinic.staff.archive") ||
      auth.permissions.includes("activeclinic.staff.update")
    : false;

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
        email: staff.staffMember.emailDisplay || staff.staffMember.emailNormalized || null,
        phone: staff.staffMember.phoneDisplay || staff.staffMember.phoneNormalized || null,
        status: staff.staffMember.status,
        statusLabel: account.label,
        accountKey: account.key,
        initials: staffInitials(staff.staffMember),
        profileHref: `/app/staff/${staff.staffMember.id}`,
      },
      facilities,
      assignments,
      activeCount: assignments.filter((a) => a.effective).length,
      effectiveAccess: {
        facilityContextLabel: facilityContextId
          ? (
              facilities.find((f) => String(f.id) === String(facilityContextId)) ||
              {}
            ).displayName || "Selected facility"
          : "All facilities (union)",
        facilityScoped: effectiveAccess,
        organizationWide: orgWideAccess,
      },
      actions: {
        canAssign: grantable.length > 0,
        assignHref: `/app/access/staff/${staffMemberId}/assign`,
        profileHref: `/app/staff/${staffMemberId}`,
        canInvite,
        canManageCredentials,
        canSuspend,
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

  const defaultValues = {
    roleKeys: roleOptions[0] ? [roleOptions[0].value] : [],
    roleKey: roleOptions[0] ? roleOptions[0].value : STAFF_ROLE,
    scopeType:
      roleOptions[0] && roleOptions[0].scopes.includes("organisation")
        ? roleOptions[0].value === NETWORK_ADMIN ||
          roleOptions[0].value === ORGANIZATION_ADMIN
          ? "organisation"
          : "facility"
        : "facility",
    facilityId: facilities[0] ? facilities[0].id : "",
    expiresAt: "",
  };
  const values = input.values || defaultValues;
  const selectedKeys = Array.isArray(values.roleKeys)
    ? values.roleKeys
    : values.roleKey
      ? [values.roleKey]
      : [];
  const accessPreview = await summarizePermissionsForRoleKeys(db, selectedKeys);

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
      values: {
        ...values,
        roleKeys: selectedKeys,
      },
      accessPreview,
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
        roleKeys: [mapped.roleKey],
        scopeType: mapped.scopeType,
        facilityId: mapped.facilityId || "",
        expiresAt: expiresLocal,
        editMode: "expiry",
      },
      accessPreview: null,
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

async function loadActiveClinicRoleDetailScreen(db, input) {
  const auth = input.auth;
  if (!actorHasAssignAccess(auth)) {
    return { ok: false, code: RESULT.DENIED, restricted: true };
  }

  const roleKey = String(input.roleKey || "").trim();
  if (!roleKey || !ACTIVECLINIC_ROLE_CATALOGUE.includes(roleKey)) {
    return { ok: false, code: "role_not_found" };
  }

  const scopedIds = await viewerScopedStaffIds(db, auth);
  const catalogue = await buildRoleCatalogue(db, auth.organization.id, scopedIds);
  const role = catalogue.find((r) => r.key === roleKey);
  if (!role) {
    return { ok: false, code: "role_not_found" };
  }

  const summary = await summarizePermissionsForRoleKeys(db, [roleKey]);
  return {
    ok: true,
    code: RESULT.OK,
    detail: {
      role,
      permissionGroups: (summary.groups || []).map((g) => ({
        key: g.key,
        label: g.label,
        count: g.count,
        permissions: (g.permissions || []).map((p) => ({
          key: String(p),
          label: String(p),
        })),
      })),
      permissionCount: summary.permissionCount || 0,
      backHref: "/app/access?tab=catalogue",
      assignStaffHref: `/app/access?tab=staff&role=${encodeURIComponent(roleKey)}`,
    },
  };
}

module.exports = {
  loadActiveClinicAccessOverviewScreen,
  loadActiveClinicStaffAccessDetailScreen,
  loadActiveClinicAssignRoleScreen,
  loadActiveClinicEditRoleScreen,
  loadActiveClinicRevokeRoleScreen,
  loadActiveClinicRoleDetailScreen,
  rolePlainLabel,
  summarizeStaffScopedAccess,
};
