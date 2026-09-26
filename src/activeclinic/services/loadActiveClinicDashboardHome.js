"use strict";

/**
 * ActiveClinic dashboard home loader (V2.03 Batch 2 / AC-B2-01).
 * Capability-driven tiles + RBAC-gated operational counts from existing repos.
 * Stitch demo metrics without a legitimate data source are listed as unsupported.
 */

const {
  listFacilitiesByOrganization,
} = require("./facilityService");
const {
  listStaffMembersByOrganization,
} = require("./activeClinicStaffService");
const {
  buildAuthorizedDashboardTiles,
  groupDashboardSections,
  toQuickActions,
} = require("./activeClinicDashboardCapabilities");
const {
  canSeeClinicSetupPanel,
  loadOrganizationClinicSetup,
  presentClinicSetupForViewer,
} = require("./loadActiveClinicSettingsScreens");
const {
  PRODUCT_CODE,
  buildPublicOrganizationWebsitePath,
  buildPublicWebsiteSettingsPath,
} = require("../../platform/website/publicWebsiteUrl");
const appointmentRepo = require("../repositories/appointmentRepository");
const receptionRepo = require("../repositories/receptionRepository");
const {
  listOpenEncounters,
} = require("./activeClinicClinicalService");

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

function resolveActiveDepartmentTypes(shell) {
  if (!shell) return null;
  if (shell.activeDepartmentTypes instanceof Set) {
    return shell.activeDepartmentTypes;
  }
  if (Array.isArray(shell.activeDepartmentTypes)) {
    return new Set(shell.activeDepartmentTypes);
  }
  if (!shell.selectedFacility) return null;
  return new Set();
}

function dayPartGreeting(now) {
  const hour = now.getHours();
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

function startOfUtcDay(now) {
  return new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 0, 0, 0, 0)
  );
}

function endOfUtcDay(now) {
  const start = startOfUtcDay(now);
  return new Date(start.getTime() + 24 * 60 * 60 * 1000);
}

/**
 * Facility-scoped operational KPI cards + short previews from existing lists.
 * Fail-soft: any query error yields empty cards for that domain.
 */
async function loadOperationalSnapshot(db, input) {
  const { auth, shell, perms } = input;
  const orgId = auth.organization && auth.organization.id;
  const hcoId =
    auth.healthcareOrganization && auth.healthcareOrganization.id;
  const facilityId = shell.selectedFacility && shell.selectedFacility.id;
  const kpiCards = [];
  const queuePreview = [];
  const upcomingPreview = [];
  const openEncounterPreview = [];

  if (!orgId || !hcoId || !facilityId) {
    return { kpiCards, queuePreview, upcomingPreview, openEncounterPreview };
  }

  const now = new Date();

  if (hasPerm(perms, "activeclinic.appointment.view")) {
    try {
      const rows = await appointmentRepo.listAppointmentsByOrg(db, {
        organizationId: orgId,
        healthcareOrganizationId: hcoId,
        facilityId,
        startsFrom: startOfUtcDay(now),
        startsTo: endOfUtcDay(now),
        limit: 200,
        offset: 0,
      });
      const completed = rows.filter((r) => r.status === "completed").length;
      const withPractitioner = rows.filter(
        (r) => r.status === "with_practitioner"
      ).length;
      kpiCards.push({
        key: "appts_today",
        label: "Today's Appts",
        value: rows.length,
        hint:
          rows.length === 0
            ? "No appointments scheduled today"
            : `${completed} completed · ${withPractitioner} with practitioner`,
        href: "/app/appointments",
        icon: "event",
      });

      const horizon = new Date(now.getTime() + 3 * 60 * 60 * 1000);
      const upcoming = rows
        .filter((r) => {
          const start = r.starts_at ? new Date(r.starts_at) : null;
          if (!start || Number.isNaN(start.getTime())) return false;
          if (start < now || start > horizon) return false;
          return ["scheduled", "confirmed", "arrived", "waiting"].includes(
            String(r.status)
          );
        })
        .slice(0, 5);
      for (const row of upcoming) {
        upcomingPreview.push({
          id: row.id,
          startsAt: row.starts_at,
          status: row.status,
          href: `/app/appointments/${encodeURIComponent(row.id)}`,
          label: row.status,
        });
      }
    } catch {
      /* omit appointment KPI on failure */
    }
  }

  if (hasPerm(perms, "activeclinic.reception.view")) {
    try {
      const rows = await receptionRepo.listQueueEntriesByFacility(db, {
        organizationId: orgId,
        healthcareOrganizationId: hcoId,
        facilityId,
        statuses: ["waiting", "called", "serving", "paused"],
        limit: 100,
        offset: 0,
      });
      const waiting = rows.filter((r) =>
        ["waiting", "called"].includes(String(r.status))
      );
      kpiCards.push({
        key: "waiting_room",
        label: "Waiting Room",
        value: waiting.length,
        hint: `${rows.length} active in queue`,
        href: "/app/reception",
        icon: "desk",
      });
      for (const row of waiting.slice(0, 5)) {
        queuePreview.push({
          id: row.id,
          queueNumber: row.queue_number,
          status: row.status,
          href: `/app/reception/queue/${encodeURIComponent(row.id)}`,
          label: row.queue_number
            ? `Queue #${row.queue_number}`
            : "Queue entry",
        });
      }
    } catch {
      /* omit reception KPI on failure */
    }
  }

  if (
    hasPerm(perms, "activeclinic.encounter.view") &&
    auth.staffMember &&
    auth.staffMember.id &&
    auth.platformIdentity &&
    auth.platformIdentity.id
  ) {
    try {
      const listed = await listOpenEncounters(db, {
        organizationId: orgId,
        facilityId,
        actor: {
          staffMemberId: auth.staffMember.id,
          platformIdentityId: auth.platformIdentity.id,
        },
      });
      if (listed.ok) {
        const encounters = listed.encounters || [];
        kpiCards.push({
          key: "clinical_tasks",
          label: "Clinical Tasks",
          value: encounters.length,
          hint: encounters.length
            ? "Open encounters at this facility"
            : "No open encounters",
          href: "/app/clinical",
          icon: "medical_services",
        });
        for (const enc of encounters.slice(0, 5)) {
          openEncounterPreview.push({
            id: enc.id,
            label: enc.patientDisplayName || enc.encounterNumber || "Encounter",
            status: enc.status,
            href: `/app/clinical/encounter/${encodeURIComponent(enc.id)}`,
          });
        }
      }
    } catch {
      /* omit clinical KPI on failure */
    }
  }

  return { kpiCards, queuePreview, upcomingPreview, openEncounterPreview };
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
  if (Array.isArray(shell.permissions) && shell.permissions.length) {
    perms.clear();
    for (const p of shell.permissions) perms.add(p);
  }

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
  const activeStaff = staffMembers.filter((s) => s.status === "active");
  const invitedStaff = staffMembers.filter((s) => s.status === "invited");

  const needsFacilitySelect =
    !shell.selectedFacility &&
    Array.isArray(shell.availableFacilities) &&
    shell.availableFacilities.length > 0;

  let clinicSetup = null;
  if (orgId && canSeeClinicSetupPanel(perms)) {
    const setupState = await loadOrganizationClinicSetup(db, {
      organizationId: orgId,
      healthcareOrganization: auth.healthcareOrganization || null,
      clinicKey: auth.organization && auth.organization.key,
      staffMembers,
      staffCounts: hasPerm(perms, "activeclinic.staff.view")
        ? { active: activeStaff.length, invited: invitedStaff.length }
        : undefined,
    });
    clinicSetup = presentClinicSetupForViewer(setupState, perms);
    clinicSetup.state = setupState;
  }

  const sessionTasks = [];
  if (needsFacilitySelect) {
    sessionTasks.push({
      key: "select_facility",
      label: "Select a facility context",
      href: "/app/select-facility",
    });
  }

  const setupTasks = [];
  if (clinicSetup && clinicSetup.presentation === "incomplete") {
    for (const item of clinicSetup.incomplete) {
      setupTasks.push({
        key: item.key,
        label: item.label,
        done: false,
        href: item.destinationUrl,
      });
    }
  }

  const activeDepartmentTypes = resolveActiveDepartmentTypes(shell);
  const authorizedTiles = buildAuthorizedDashboardTiles(perms, {
    activeDepartmentTypes,
    includeSelectFacility: Boolean(
      needsFacilitySelect ||
        (!shell.selectedFacility &&
          (shell.canSwitchFacility ||
            (shell.availableFacilities && shell.availableFacilities.length)))
    ),
  });
  const { buckets, sections } = groupDashboardSections(authorizedTiles);
  const quickActions = toQuickActions(authorizedTiles);

  const empty =
    activeFacilities.length === 0 &&
    (hasPerm(perms, "activeclinic.facility.create") ||
      hasPerm(perms, "activeclinic.facility.update"));

  const mode = empty ? "empty" : "ready";

  const orgKey =
    (auth.organization && (auth.organization.key || auth.organization.organizationKey)) ||
    (shell.organization && (shell.organization.key || shell.organization.organizationKey)) ||
    "";
  const canWebsite = hasPerm(perms, "website.view") || hasPerm(perms, "website.edit");
  const canOrgManage = hasPerm(perms, "activeclinic.organization.manage");
  const showOrganizationConsole =
    canSeeClinicSetupPanel(perms) || canWebsite || canOrgManage;
  let onboardingStatus = null;
  if (clinicSetup && clinicSetup.presentation === "incomplete") onboardingStatus = "onboarding_required";
  else if (clinicSetup && clinicSetup.presentation === "recommended") onboardingStatus = "recommended";
  else if (clinicSetup && clinicSetup.presentation === "complete") onboardingStatus = "completed";
  const organizationConsole = showOrganizationConsole
    ? {
        publicPath: orgKey
          ? buildPublicOrganizationWebsitePath({
              product: PRODUCT_CODE.ACTIVECLINIC,
              organizationKey: orgKey,
            })
          : null,
        websiteHref: canWebsite
          ? buildPublicWebsiteSettingsPath({ product: PRODUCT_CODE.ACTIVECLINIC })
          : null,
        organizationHref: canOrgManage ? "/app/settings/organization" : null,
        staffHref: hasPerm(perms, "activeclinic.staff.view") ? "/app/staff" : null,
        accessHref: hasPerm(perms, "activeclinic.staff.assign_access") ? "/app/access" : null,
        facilitiesHref:
          hasPerm(perms, "activeclinic.facility.create") ||
          hasPerm(perms, "activeclinic.facility.update") ||
          hasPerm(perms, "activeclinic.facility.archive")
            ? "/app/facilities"
            : null,
        settingsHref: "/app/settings",
        onboardingHref:
          onboardingStatus === "onboarding_required" || onboardingStatus === "recommended"
            ? "/app/onboarding"
            : null,
        onboardingStatus,
      }
    : null;

  const metrics = [];
  if (
    hasPerm(perms, "activeclinic.facility.create") ||
    hasPerm(perms, "activeclinic.facility.update") ||
    hasPerm(perms, "activeclinic.facility.archive")
  ) {
    metrics.push({
      key: "facilities",
      label: "Active facilities",
      value: activeFacilities.length,
      href: "/app/facilities",
      icon: "apartment",
    });
  }
  if (hasPerm(perms, "activeclinic.staff.view")) {
    metrics.push({
      key: "staff",
      label: "Active staff",
      value: activeStaff.length,
      href: "/app/staff",
      icon: "groups",
    });
    metrics.push({
      key: "invitations",
      label: "Pending invitations",
      value: invitedStaff.length,
      href: "/app/staff",
      icon: "person_add",
    });
  }

  const operational = await loadOperationalSnapshot(db, { auth, shell, perms });
  const kpiCards = [...operational.kpiCards, ...metrics];

  const staffDisplayName =
    (auth.staffMember && auth.staffMember.displayName) || "Staff";
  const greetingPrefix = dayPartGreeting(new Date());
  const greeting = `${greetingPrefix}, ${staffDisplayName}`;

  let operationalStatus = {
    tone: "warning",
    label: "Select facility",
  };
  if (shell.selectedFacility) {
    if (clinicSetup && clinicSetup.presentation === "incomplete") {
      operationalStatus = { tone: "warning", label: "Setup incomplete" };
    } else {
      operationalStatus = { tone: "success", label: "Clinic Operational" };
    }
  } else if (auth.isNetworkAdmin) {
    operationalStatus = { tone: "info", label: "Organization-wide" };
  }

  const now = new Date();
  const dateLine = now.toLocaleDateString(undefined, {
    weekday: "long",
    month: "short",
    day: "numeric",
    year: "numeric",
  });

  const recentActivity = [];
  for (const task of sessionTasks) {
    recentActivity.push({
      key: task.key,
      title: task.label,
      href: task.href,
      tone: "warning",
      badgeLabel: "Action needed",
    });
  }
  if (clinicSetup && clinicSetup.presentation === "incomplete") {
    recentActivity.push({
      key: "clinic_setup",
      title: "Clinic setup still has required items",
      href: "/app/onboarding",
      tone: "warning",
      badgeLabel: "Setup",
    });
  } else if (clinicSetup && clinicSetup.presentation === "complete") {
    recentActivity.push({
      key: "clinic_setup_done",
      title: "Clinic setup complete",
      href: "/app/settings",
      tone: "success",
      badgeLabel: "Ready",
    });
  }
  if (operational.queuePreview.length) {
    recentActivity.push({
      key: "queue_preview",
      title: `${operational.queuePreview.length} patient(s) in waiting room`,
      href: "/app/reception",
      tone: "info",
      badgeLabel: "Queue",
    });
  }
  if (operational.openEncounterPreview.length) {
    recentActivity.push({
      key: "open_encounters",
      title: `${operational.openEncounterPreview.length} open encounter(s)`,
      href: "/app/clinical",
      tone: "info",
      badgeLabel: "Clinical",
    });
  }

  const unsupportedStitchPanels = [
    {
      key: "lab_sign_off",
      label: "Lab Sign-Off",
      reason: "No dashboard aggregation for lab result sign-off; use Diagnostics.",
      href: hasPerm(perms, "activeclinic.lab.view") ||
        hasPerm(perms, "activeclinic.diagnostics.view")
        ? "/app/diagnostics"
        : null,
    },
    {
      key: "dispensary_fulfillment",
      label: "Dispensary Fulfillment",
      reason: "No dashboard pharmacy queue aggregate; use Pharmacy.",
      href: hasPerm(perms, "activeclinic.pharmacy.view") ? "/app/pharmacy" : null,
    },
    {
      key: "clinic_audit_trail",
      label: "Clinic Audit Trail",
      reason: "Live audit feed is not exposed on the staff dashboard.",
      href: null,
    },
    {
      key: "billing_revenue_kpi",
      label: "Collected / revenue KPI",
      reason: "Billing totals are not aggregated on the home dashboard.",
      href: hasPerm(perms, "activeclinic.billing.view") ? "/app/billing" : null,
    },
  ];

  return {
    ok: true,
    mode,
    stitch: {
      code: "AC-B2-01",
      desktop: "ed2ef3ac64d44c398f177d1b58ffc430",
      mobile: "2cb0ef951e1e40418cc7272d1392b26d",
    },
    greeting,
    dateLine,
    operationalStatus,
    welcome: {
      staffDisplayName,
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
    /** @deprecated prefer metrics[]; kept for existing templates/tests */
    summaries: {
      facilities: metrics.find((m) => m.key === "facilities") || null,
      staff: metrics.find((m) => m.key === "staff") || null,
      invitations: metrics.find((m) => m.key === "invitations") || null,
    },
    metrics,
    kpiCards,
    queuePreview: operational.queuePreview,
    upcomingPreview: operational.upcomingPreview,
    openEncounterPreview: operational.openEncounterPreview,
    recentActivity,
    sections,
    modules: buckets,
    authorizedTiles,
    clinicSetup,
    organizationConsole,
    sessionTasks,
    setupTasks,
    quickActions,
    notices: [],
    unsupportedStitchPanels,
    unsupportedStitchKpisOmitted: [
      "Average wait minutes",
      "Pharmacy dispensary queue depth",
      "Billing revenue / collected today",
      "Lab abnormal sign-off feed",
      "Live clinic audit trail",
    ],
  };
}

module.exports = {
  loadActiveClinicDashboardHome,
  plainRoleSummary,
  dayPartGreeting,
};
