"use strict";

/**
 * ActiveClinic dashboard home loader (AC-V6-S02).
 * Real foundation data only — no clinical KPIs.
 */

const {
  listFacilitiesByOrganization,
} = require("./facilityService");
const {
  listStaffMembersByOrganization,
} = require("./activeClinicStaffService");

function hasPerm(set, key) {
  return set.has(key);
}

function plainRoleSummary(auth) {
  const roles = Array.isArray(auth.roleAssignments) ? auth.roleAssignments : [];
  const labels = roles
    .map((r) => r.roleDisplayName || r.displayName || null)
    .filter(Boolean);
  if (labels.length) return labels.join(", ");
  if (auth.isNetworkAdmin) return "Network administrator";
  return "ActiveClinic staff";
}

/**
 * @param {{ query: Function }} db
 * @param {{ auth: object, shell: object }} input
 */
async function loadActiveClinicDashboardHome(db, input) {
  const auth = input.auth || {};
  const shell = input.shell || {};
  const orgId = auth.organization && auth.organization.id;
  const perms = new Set(Array.isArray(auth.permissions) ? auth.permissions : []);

  let facilities = [];
  let staffMembers = [];

  if (orgId && hasPerm(perms, "activeclinic.facility.view")) {
    const listed = await listFacilitiesByOrganization(db, {
      organizationId: orgId,
      status: "active",
    });
    if (listed.ok) facilities = listed.facilities || [];
  }

  if (orgId && hasPerm(perms, "activeclinic.staff.view")) {
    const listed = await listStaffMembersByOrganization(db, {
      organizationId: orgId,
    });
    if (listed.ok) staffMembers = listed.staffMembers || [];
  }

  const activeFacilities = facilities.filter((f) => f.status === "active");
  const primaryFacility = activeFacilities.find((f) => f.isPrimary) || null;
  const activeStaff = staffMembers.filter((s) => s.status === "active");
  const invitedStaff = staffMembers.filter((s) => s.status === "invited");

  const setupTasks = [];
  if (hasPerm(perms, "activeclinic.facility.view") || hasPerm(perms, "activeclinic.facility.create")) {
    if (activeFacilities.length === 0) {
      setupTasks.push({
        key: "add_facility",
        label: "Add the first facility",
        done: false,
        href: hasPerm(perms, "activeclinic.facility.create")
          ? "/app/facilities"
          : null,
      });
    } else if (!primaryFacility) {
      setupTasks.push({
        key: "primary_facility",
        label: "Designate a primary facility",
        done: false,
        href: "/app/facilities",
      });
    } else {
      setupTasks.push({
        key: "primary_facility",
        label: "Primary facility configured",
        done: true,
        href: "/app/facilities",
      });
    }
  }

  if (hasPerm(perms, "activeclinic.staff.view") || hasPerm(perms, "activeclinic.staff.invite")) {
    if (activeStaff.length + invitedStaff.length <= 1) {
      setupTasks.push({
        key: "invite_staff",
        label: "Invite additional staff",
        done: false,
        href: hasPerm(perms, "activeclinic.staff.view") ? "/app/staff" : null,
      });
    } else {
      setupTasks.push({
        key: "invite_staff",
        label: "Staff profiles present",
        done: true,
        href: hasPerm(perms, "activeclinic.staff.view") ? "/app/staff" : null,
      });
    }
  }

  if (hasPerm(perms, "activeclinic.staff.assign_access")) {
    setupTasks.push({
      key: "review_access",
      label: "Review roles and access",
      done: false,
      href: "/app/access",
    });
  }

  if (
    !shell.selectedFacility &&
    !auth.isNetworkAdmin &&
    Array.isArray(shell.availableFacilities) &&
    shell.availableFacilities.length > 0
  ) {
    setupTasks.unshift({
      key: "select_facility",
      label: "Select a facility context",
      done: false,
      href: "/app/select-facility",
    });
  }

  const quickActions = [];
  if (hasPerm(perms, "activeclinic.facility.view")) {
    quickActions.push({
      label: "View facilities",
      href: "/app/facilities",
      primary: false,
    });
  }
  if (hasPerm(perms, "activeclinic.staff.view")) {
    quickActions.push({
      label: "View staff",
      href: "/app/staff",
      primary: false,
    });
  }
  if (hasPerm(perms, "activeclinic.staff.assign_access")) {
    quickActions.push({
      label: "Manage access",
      href: "/app/access",
      primary: false,
    });
  }
  if (hasPerm(perms, "activeclinic.organization.manage")) {
    quickActions.push({
      label: "Settings",
      href: "/app/settings",
      primary: false,
    });
  }
  if (
    !shell.selectedFacility &&
    !auth.isNetworkAdmin &&
    (shell.canSwitchFacility ||
      (shell.availableFacilities && shell.availableFacilities.length))
  ) {
    quickActions.unshift({
      label: "Select facility",
      href: "/app/select-facility",
      primary: true,
    });
  }

  const empty =
    activeFacilities.length === 0 &&
    hasPerm(perms, "activeclinic.facility.view") &&
    setupTasks.some((t) => t.key === "add_facility" && !t.done);

  const mode = empty ? "empty" : "ready";

  return {
    ok: true,
    mode,
    welcome: {
      staffDisplayName: (auth.staffMember && auth.staffMember.displayName) || "Staff",
      jobTitle: (auth.staffMember && auth.staffMember.jobTitle) || null,
      organizationName:
        (auth.healthcareOrganization &&
          (auth.healthcareOrganization.publicName ||
            auth.healthcareOrganization.legalName)) ||
        (auth.organization && auth.organization.displayName) ||
        "Organization",
      facilityName: shell.selectedFacility
        ? shell.selectedFacility.displayName
        : auth.isNetworkAdmin
          ? "Organization-wide"
          : null,
      roleSummary: plainRoleSummary(auth),
      scopeLabel: shell.selectedFacility
        ? `Working in ${shell.selectedFacility.displayName}`
        : auth.isNetworkAdmin
          ? "Organization-wide access"
          : "Select a facility to continue",
    },
    summaries: {
      facilities: hasPerm(perms, "activeclinic.facility.view")
        ? {
            label: "Active facilities",
            value: activeFacilities.length,
            href: "/app/facilities",
          }
        : null,
      staff: hasPerm(perms, "activeclinic.staff.view")
        ? {
            label: "Active staff",
            value: activeStaff.length,
            href: "/app/staff",
          }
        : null,
      invitations: hasPerm(perms, "activeclinic.staff.view")
        ? {
            label: "Pending invitations",
            value: invitedStaff.length,
            href: "/app/staff",
          }
        : null,
    },
    setupTasks,
    quickActions,
    notices: [
      {
        tone: "info",
        message:
          "Clinical modules are not enabled yet. This home view shows infrastructure readiness only.",
      },
    ],
    unsupportedStitchKpisOmitted: [
      "Patients registered today",
      "Patients waiting",
      "Consultations in progress",
      "Appointments today",
      "Reception queue",
      "Pharmacy stock alerts",
      "Billing / invoice totals",
    ],
  };
}

module.exports = {
  loadActiveClinicDashboardHome,
  plainRoleSummary,
};
