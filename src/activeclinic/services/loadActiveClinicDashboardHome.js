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
  if (
    !shell.selectedFacility &&
    !auth.isNetworkAdmin &&
    (shell.canSwitchFacility ||
      (shell.availableFacilities && shell.availableFacilities.length))
  ) {
    quickActions.push({
      label: "Select facility",
      href: "/app/select-facility",
      primary: true,
    });
  }
  if (hasPerm(perms, "activeclinic.patient.search")) {
    quickActions.push({
      label: "Patients",
      href: "/app/patients",
      primary: false,
    });
  }
  if (hasPerm(perms, "activeclinic.appointment.view")) {
    quickActions.push({
      label: "Appointments",
      href: "/app/appointments",
      primary: false,
    });
  }
  if (hasPerm(perms, "activeclinic.reception.view")) {
    quickActions.push({
      label: "Reception",
      href: "/app/reception",
      primary: false,
    });
  }
  if (hasPerm(perms, "activeclinic.encounter.view")) {
    quickActions.push({
      label: "Clinical",
      href: "/app/clinical",
      primary: false,
    });
  }
  if (hasPerm(perms, "activeclinic.pharmacy.view")) {
    quickActions.push({
      label: "Pharmacy",
      href: "/app/pharmacy",
      primary: false,
    });
  }
  if (hasPerm(perms, "activeclinic.diagnostics.view") ||
      hasPerm(perms, "activeclinic.lab.view") ||
      hasPerm(perms, "activeclinic.radiology.view")) {
    quickActions.push({
      label: "Diagnostics",
      href: "/app/diagnostics",
      primary: false,
    });
  }
  if (hasPerm(perms, "activeclinic.billing.view")) {
    quickActions.push({
      label: "Billing",
      href: "/app/billing",
      primary: false,
    });
  }
  if (hasPerm(perms, "activeclinic.cashier.open_session")) {
    quickActions.push({
      label: "Cashier",
      href: "/app/cashier",
      primary: false,
    });
  }
  if (
    hasPerm(perms, "activeclinic.facility.create") ||
    hasPerm(perms, "activeclinic.facility.update") ||
    hasPerm(perms, "activeclinic.facility.archive")
  ) {
    quickActions.push({
      label: "Facilities",
      href: "/app/facilities",
      primary: false,
    });
  }
  if (hasPerm(perms, "activeclinic.staff.view")) {
    quickActions.push({
      label: "Staff",
      href: "/app/staff",
      primary: false,
    });
  }
  if (hasPerm(perms, "activeclinic.staff.assign_access")) {
    quickActions.push({
      label: "Roles & access",
      href: "/app/access",
      primary: false,
    });
  }
  if (hasPerm(perms, "activeclinic.access")) {
    quickActions.push({
      label: "Settings",
      href: "/app/settings",
      primary: false,
    });
  }

  const empty =
    activeFacilities.length === 0 &&
    (hasPerm(perms, "activeclinic.facility.create") ||
      hasPerm(perms, "activeclinic.facility.update")) &&
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
      facilities:
        hasPerm(perms, "activeclinic.facility.create") ||
        hasPerm(perms, "activeclinic.facility.update") ||
        hasPerm(perms, "activeclinic.facility.archive")
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
    notices: [],
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
