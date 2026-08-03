"use strict";

/**
 * ActiveClinic staff directory + detail screen loaders (AC-V6-S04).
 * No Stitch staff screens exist — UI follows shell design system (VISUAL_BLOCKED).
 */

const {
  EMPLOYMENT_TYPES,
  STATUSES,
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
  listStaffRoleAssignments,
  NETWORK_ADMIN,
} = require("./activeClinicAuthorizationService");
const {
  getInvitationStatus,
} = require("./activeClinicStaffInvitationService");
const identityRepo = require("../../platform/repositories/platformIdentityRepository");
const { mapIdentity } = require("../../platform/services/platformIdentityService");

const STATUS_LABELS = Object.freeze({
  invited: "Invited",
  active: "Active",
  inactive: "Inactive",
  suspended: "Suspended",
  archived: "Archived",
});

const EMPLOYMENT_LABELS = Object.freeze({
  permanent: "Permanent",
  contract: "Contract",
  temporary: "Temporary",
  volunteer: "Volunteer",
  visiting: "Visiting",
  agency: "Agency",
  other: "Other",
});

const ROLE_LABELS = Object.freeze({
  activeclinic_network_admin: "Network administrator",
  activeclinic_facility_admin: "Facility administrator",
  activeclinic_staff: "Staff",
});

const ACCOUNT_FILTERS = Object.freeze([
  { value: "linked", label: "Has login identity" },
  { value: "pending_invite", label: "Invitation pending" },
  { value: "no_identity", label: "No login identity" },
  { value: "must_change", label: "Password change required" },
  { value: "locked", label: "Temporarily locked" },
]);

function hasPerm(perms, key) {
  return Array.isArray(perms) ? perms.includes(key) : false;
}

function staffStatusLabel(status) {
  return STATUS_LABELS[status] || String(status || "—");
}

function employmentTypeLabel(type) {
  return EMPLOYMENT_LABELS[type] || String(type || "—");
}

function rolePlainLabel(assignment) {
  if (!assignment) return "Role";
  if (assignment.roleDisplayName) return assignment.roleDisplayName;
  return ROLE_LABELS[assignment.roleKey] || "Staff role";
}

function scopePlainLabel(assignment) {
  if (!assignment) return "";
  if (assignment.scopeType === "facility") {
    return assignment.facilityDisplayName
      ? `Facility · ${assignment.facilityDisplayName}`
      : "Facility scope";
  }
  return "Organization-wide";
}

function staffInitials(staff) {
  const first = String((staff && staff.firstName) || "").trim();
  const last = String((staff && staff.lastName) || "").trim();
  if (first && last) return `${first[0]}${last[0]}`.toUpperCase();
  const name = String((staff && staff.displayName) || "").trim();
  const parts = name.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) {
    return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
  }
  return (name.slice(0, 2) || "?").toUpperCase();
}

function hasOrgWideStaffDirectory(auth) {
  return (auth.roleAssignments || []).some(
    (r) =>
      r.roleKey === NETWORK_ADMIN &&
      (!r.status || r.status === "active") &&
      (!r.expiresAt || new Date(r.expiresAt).getTime() > Date.now())
  );
}

async function viewerFacilityIds(db, auth) {
  const listed = await listFacilitiesForStaff(db, {
    staffMemberId: auth.staffMember.id,
    organizationId: auth.organization.id,
  });
  if (!listed.ok) return new Set();
  return new Set(
    (listed.assignments || [])
      .filter((a) => a.status === "active")
      .map((a) => String(a.facilityId))
  );
}

/**
 * Safe account label — never exposes counters, tokens, or lock timestamps.
 */
function deriveAccountState(staff, identity, invitation) {
  if (staff.status === "suspended") {
    return { key: "staff_suspended", label: "Access unavailable" };
  }
  if (staff.status === "archived") {
    return { key: "staff_archived", label: "Access unavailable" };
  }
  if (!staff.platformIdentityId || !identity) {
    if (invitation && invitation.effectiveStatus === "pending") {
      return { key: "pending_invite", label: "Invitation pending" };
    }
    if (staff.status === "invited") {
      return { key: "not_activated", label: "Not activated" };
    }
    return { key: "no_identity", label: "No login identity" };
  }
  if (identity.status !== "active" || identity.lockedAt || identity.suspendedAt) {
    return { key: "unavailable", label: "Access unavailable" };
  }
  if (
    identity.signInLockedUntil &&
    new Date(identity.signInLockedUntil).getTime() > Date.now()
  ) {
    return { key: "locked", label: "Temporarily locked" };
  }
  if (identity.mustChangePassword) {
    return { key: "must_change", label: "Password change required" };
  }
  if (staff.status === "invited" || !identity.hasPasswordHash) {
    if (invitation && invitation.effectiveStatus === "pending") {
      return { key: "pending_invite", label: "Invitation pending" };
    }
    return { key: "not_activated", label: "Not activated" };
  }
  return { key: "active", label: "Active account" };
}

async function loadIdentitySafe(db, platformIdentityId) {
  if (!platformIdentityId) return null;
  const row = await identityRepo.findIdentityById(db, platformIdentityId);
  if (!row) return null;
  return mapIdentity(row);
}

async function enrichStaffListItem(db, staff, opts) {
  const fac = await listFacilitiesForStaff(db, {
    staffMemberId: staff.id,
    organizationId: opts.organizationId,
  });
  const activeAssignments = (fac.assignments || []).filter((a) => a.status === "active");
  const primary = activeAssignments.find((a) => a.isPrimary) || activeAssignments[0] || null;
  const invitationStatus = await getInvitationStatus(db, {
    organizationId: opts.organizationId,
    staffMemberId: staff.id,
  });
  const pending =
    invitationStatus.ok && invitationStatus.pending ? invitationStatus.pending : null;
  const identity = await loadIdentitySafe(db, staff.platformIdentityId);
  const account = deriveAccountState(staff, identity, pending);

  return {
    id: staff.id,
    displayName: staff.displayName,
    preferredName: staff.preferredName,
    jobTitle: staff.jobTitle,
    employmentType: staff.employmentType,
    employmentTypeLabel: employmentTypeLabel(staff.employmentType),
    status: staff.status,
    statusLabel: staffStatusLabel(staff.status),
    initials: staffInitials(staff),
    facilitySummary: activeAssignments
      .map((a) => a.facilityDisplayName)
      .filter(Boolean)
      .join(", "),
    primaryFacilityName: primary ? primary.facilityDisplayName : null,
    facilityIds: activeAssignments.map((a) => String(a.facilityId)),
    accountKey: account.key,
    accountLabel: account.label,
    invitationPending: Boolean(pending),
    href: `/app/staff/${encodeURIComponent(staff.id)}`,
  };
}

async function listAuthorizedStaffMembers(db, auth) {
  const organizationId = auth.organization.id;
  const listed = await listStaffMembersByOrganization(db, { organizationId });
  if (!listed.ok) return listed;

  if (hasOrgWideStaffDirectory(auth)) {
    return listed;
  }

  const allowedFacilities = await viewerFacilityIds(db, auth);
  if (!allowedFacilities.size) {
    return { ok: true, staffMembers: [] };
  }

  const visible = [];
  for (const staff of listed.staffMembers || []) {
    const fac = await listFacilitiesForStaff(db, {
      staffMemberId: staff.id,
      organizationId,
    });
    const overlap = (fac.assignments || []).some(
      (a) => a.status === "active" && allowedFacilities.has(String(a.facilityId))
    );
    if (overlap) visible.push(staff);
  }
  return { ok: true, staffMembers: visible };
}

async function assertStaffReadable(db, auth, staff) {
  if (!staff) return false;
  if (hasOrgWideStaffDirectory(auth)) return true;
  const allowedFacilities = await viewerFacilityIds(db, auth);
  if (!allowedFacilities.size) return false;
  const fac = await listFacilitiesForStaff(db, {
    staffMemberId: staff.id,
    organizationId: auth.organization.id,
  });
  return (fac.assignments || []).some(
    (a) => a.status === "active" && allowedFacilities.has(String(a.facilityId))
  );
}

/**
 * @param {{ query: Function }} db
 * @param {{ auth: object, query?: object }} input
 */
async function loadActiveClinicStaffListScreen(db, input) {
  const auth = input.auth;
  const q = input.query || {};
  const search = String(q.q || q.search || "").trim().toLowerCase();
  const statusFilter = String(q.status || "").trim().toLowerCase();
  const employmentFilter = String(q.employment || q.employment_type || "").trim().toLowerCase();
  const facilityFilter = String(q.facility || "").trim();
  const accountFilter = String(q.account || "").trim().toLowerCase();

  const authorized = await listAuthorizedStaffMembers(db, auth);
  let staffMembers = authorized.ok ? authorized.staffMembers || [] : [];
  const authorizedCount = staffMembers.length;

  const orgFacilities = await listFacilitiesByOrganization(db, {
    organizationId: auth.organization.id,
    status: null,
  });
  let facilityOptions = (orgFacilities.ok ? orgFacilities.facilities : []) || [];
  if (!hasOrgWideStaffDirectory(auth)) {
    const allowed = await viewerFacilityIds(db, auth);
    facilityOptions = facilityOptions.filter((f) => allowed.has(String(f.id)));
  }

  const items = [];
  for (const s of staffMembers) {
    items.push(
      await enrichStaffListItem(db, s, { organizationId: auth.organization.id })
    );
  }

  let filtered = items;
  if (statusFilter && STATUSES.includes(statusFilter)) {
    filtered = filtered.filter((s) => s.status === statusFilter);
  }
  if (employmentFilter && EMPLOYMENT_TYPES.includes(employmentFilter)) {
    filtered = filtered.filter((s) => s.employmentType === employmentFilter);
  }
  if (facilityFilter) {
    filtered = filtered.filter((s) => s.facilityIds.includes(facilityFilter));
  }
  if (accountFilter) {
    filtered = filtered.filter((s) => s.accountKey === accountFilter);
  }
  if (search) {
    filtered = filtered.filter((s) => {
      const hay = `${s.displayName} ${s.preferredName || ""} ${s.jobTitle || ""}`
        .toLowerCase();
      return hay.includes(search);
    });
  }

  filtered = filtered
    .slice()
    .sort((a, b) => String(a.displayName).localeCompare(String(b.displayName)));

  const perms = auth.permissions || [];
  const canInvite = hasPerm(perms, "activeclinic.staff.invite");
  const filtersActive = Boolean(
    search || statusFilter || employmentFilter || facilityFilter || accountFilter
  );

  let emptyMode = null;
  if (!filtered.length) {
    if (filtersActive) emptyMode = "filtered";
    else if (facilityFilter) emptyMode = "facility";
    else if (authorizedCount === 0 && !hasOrgWideStaffDirectory(auth)) {
      const orgListed = await listStaffMembersByOrganization(db, {
        organizationId: auth.organization.id,
      });
      const orgCount =
        orgListed.ok && Array.isArray(orgListed.staffMembers)
          ? orgListed.staffMembers.length
          : 0;
      emptyMode = orgCount > 0 ? "restricted" : "none";
    } else if (
      authorizedCount > 0 &&
      items.every((s) => s.status === "invited" || s.invitationPending)
    ) {
      emptyMode = null; // still show list of invited
      // keep filtered empty only if truly empty
    } else {
      emptyMode = "none";
    }
  }

  const invitedOnly =
    filtered.length > 0 &&
    filtered.every((s) => s.status === "invited" || s.invitationPending);

  return {
    ok: true,
    staff: filtered,
    resultCount: filtered.length,
    filters: {
      q: search,
      status: statusFilter && STATUSES.includes(statusFilter) ? statusFilter : "",
      employment:
        employmentFilter && EMPLOYMENT_TYPES.includes(employmentFilter)
          ? employmentFilter
          : "",
      facility: facilityFilter,
      account: accountFilter,
      active: filtersActive,
    },
    filterOptions: {
      statuses: STATUSES.map((s) => ({ value: s, label: staffStatusLabel(s) })),
      employmentTypes: EMPLOYMENT_TYPES.map((t) => ({
        value: t,
        label: employmentTypeLabel(t),
      })),
      facilities: facilityOptions.map((f) => ({
        value: f.id,
        label: f.displayName,
      })),
      accounts: ACCOUNT_FILTERS.slice(),
    },
    actions: {
      canInvite,
      inviteHref: canInvite && hasPerm(perms, "activeclinic.staff.create")
        ? "/app/staff/new"
        : null,
    },
    emptyMode,
    invitedOnly,
  };
}

/**
 * @param {{ query: Function }} db
 * @param {{ auth: object, staffId: string }} input
 */
async function loadActiveClinicStaffDetailScreen(db, input) {
  const auth = input.auth;
  const got = await getStaffMemberByIdAndOrganization(db, {
    id: input.staffId,
    organizationId: auth.organization.id,
  });
  if (!got.ok) {
    return { ok: false, code: got.code || "staff_not_found", staff: null };
  }
  const readable = await assertStaffReadable(db, auth, got.staffMember);
  if (!readable) {
    return { ok: false, code: "staff_not_found", staff: null };
  }

  const staff = got.staffMember;
  const organizationId = auth.organization.id;
  const fac = await listFacilitiesForStaff(db, {
    staffMemberId: staff.id,
    organizationId,
  });
  let assignments = (fac.assignments || []).slice();
  if (!hasOrgWideStaffDirectory(auth)) {
    const allowed = await viewerFacilityIds(db, auth);
    assignments = assignments.filter((a) => allowed.has(String(a.facilityId)));
  }

  const activeAssignments = assignments.filter((a) => a.status === "active");
  const inactiveAssignments = assignments.filter((a) => a.status !== "active");

  const roles = await listStaffRoleAssignments(db, {
    staffMemberId: staff.id,
    organizationId,
  });
  const facilityNameById = new Map(
    assignments
      .filter((a) => a.facilityId && a.facilityDisplayName)
      .map((a) => [String(a.facilityId), a.facilityDisplayName])
  );
  const accessSummary = (roles.assignments || [])
    .filter((r) => {
      if (r.status && r.status !== "active") return false;
      if (r.expiresAt && new Date(r.expiresAt).getTime() <= Date.now()) return false;
      return true;
    })
    .map((r) => ({
      label: rolePlainLabel(r),
      scopeLabel: scopePlainLabel({
        ...r,
        facilityDisplayName: r.facilityId
          ? facilityNameById.get(String(r.facilityId)) || null
          : null,
      }),
      expiresAt: r.expiresAt || null,
      statusLabel: "Active",
    }));

  const invitationStatus = await getInvitationStatus(db, {
    organizationId,
    staffMemberId: staff.id,
  });
  const pending =
    invitationStatus.ok && invitationStatus.pending ? invitationStatus.pending : null;
  const identity = await loadIdentitySafe(db, staff.platformIdentityId);
  const account = deriveAccountState(staff, identity, pending);

  const perms = auth.permissions || [];
  const canInvite = hasPerm(perms, "activeclinic.staff.invite");
  const canManageCredentials = hasPerm(perms, "activeclinic.staff.manage_credentials");
  const canArchive = hasPerm(perms, "activeclinic.staff.archive");
  const canUpdate = hasPerm(perms, "activeclinic.staff.update");
  const canAssignFacility = hasPerm(perms, "activeclinic.staff.assign_facility");
  const canAssignAccess = hasPerm(perms, "activeclinic.staff.assign_access");

  const activated =
    Boolean(identity && identity.hasPasswordHash && staff.status === "active");

  const actions = {
    canInvite,
    canManageCredentials,
    canArchive,
    canUpdate,
    canAssignFacility,
    canAssignAccess,
    editHref: canUpdate
      ? `/app/staff/${encodeURIComponent(staff.id)}/edit`
      : null,
    reissueInvitation:
      canInvite && pending
        ? `/app/staff/${encodeURIComponent(staff.id)}/invitations/reissue`
        : null,
    revokeInvitation:
      canInvite && pending
        ? `/app/staff/${encodeURIComponent(staff.id)}/invitations/revoke`
        : null,
    sendReset:
      canManageCredentials && activated
        ? `/app/staff/${encodeURIComponent(staff.id)}/send-reset`
        : null,
    revokeSessions:
      canManageCredentials && staff.platformIdentityId
        ? `/app/staff/${encodeURIComponent(staff.id)}/revoke-sessions`
        : null,
    requirePasswordChange:
      canManageCredentials && activated
        ? `/app/staff/${encodeURIComponent(staff.id)}/require-password-change`
        : null,
    unlock:
      canManageCredentials && account.key === "locked"
        ? `/app/staff/${encodeURIComponent(staff.id)}/unlock`
        : null,
    suspend:
      canArchive && staff.status !== "suspended" && staff.status !== "archived"
        ? `/app/staff/${encodeURIComponent(staff.id)}/suspend`
        : null,
    restore:
      canArchive && staff.status === "suspended"
        ? `/app/staff/${encodeURIComponent(staff.id)}/restore`
        : null,
  };

  return {
    ok: true,
    staff: {
      id: staff.id,
      displayName: staff.displayName,
      preferredName: staff.preferredName,
      firstName: staff.firstName,
      lastName: staff.lastName,
      jobTitle: staff.jobTitle,
      employmentType: staff.employmentType,
      employmentTypeLabel: employmentTypeLabel(staff.employmentType),
      staffNumber: staff.staffNumber,
      status: staff.status,
      statusLabel: staffStatusLabel(staff.status),
      startDate: staff.startDate,
      endDate: staff.endDate,
      phoneDisplay: staff.phoneDisplay,
      emailDisplay: staff.emailDisplay,
      initials: staffInitials(staff),
      createdAt: staff.createdAt,
      updatedAt: staff.updatedAt,
    },
    account: {
      key: account.key,
      label: account.label,
      invitationStatus: pending
        ? "Invitation pending"
        : invitationStatus.ok &&
            (invitationStatus.invitations || []).some((i) => i.effectiveStatus === "expired")
          ? "Invitation expired"
          : null,
      hasIdentity: Boolean(staff.platformIdentityId),
    },
    facilities: {
      active: activeAssignments.map((a) => ({
        facilityKey: a.facilityKey,
        displayName: a.facilityDisplayName,
        status: a.status,
        statusLabel: STATUS_LABELS[a.status] || String(a.status || "—"),
        isPrimary: a.isPrimary === true,
        startsAt: a.startsAt,
        endsAt: a.endsAt,
        isSelected:
          auth.selectedFacility &&
          String(auth.selectedFacility.id) === String(a.facilityId),
      })),
      history: inactiveAssignments.map((a) => ({
        displayName: a.facilityDisplayName,
        status: a.status,
        isPrimary: a.isPrimary === true,
      })),
    },
    access: accessSummary,
    actions,
  };
}

module.exports = {
  STATUS_LABELS,
  EMPLOYMENT_LABELS,
  ROLE_LABELS,
  staffStatusLabel,
  employmentTypeLabel,
  staffInitials,
  deriveAccountState,
  loadActiveClinicStaffListScreen,
  loadActiveClinicStaffDetailScreen,
  assertStaffReadable,
  hasOrgWideStaffDirectory,
  EMPLOYMENT_TYPES,
  STATUSES,
};
