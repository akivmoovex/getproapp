"use strict";

/**
 * ActiveClinic dashboard capability model — role/permission/department gates.
 */

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");

const {
  buildAuthorizedDashboardTiles,
  groupDashboardSections,
  toQuickActions,
} = require("../src/activeclinic/services/activeClinicDashboardCapabilities");
const {
  loadActiveClinicDashboardHome,
} = require("../src/activeclinic/services/loadActiveClinicDashboardHome");
const {
  renderActiveClinicAppPage,
} = require("../src/activeclinic/http/renderActiveClinicShell");
const {
  buildActiveClinicNavigation,
} = require("../src/activeclinic/services/activeClinicNavigation");

const ALL_DEPARTMENTS = new Set([
  "reception",
  "opd",
  "triage",
  "pharmacy",
  "laboratory",
  "radiology",
  "billing",
  "administration",
]);

/** Permission bags approximating migration 088/089/090 matrices (entry perms). */
const ROLE_PERMS = Object.freeze({
  clinic_manager: [
    "activeclinic.access",
    "activeclinic.facility.view",
    "activeclinic.staff.view",
    "activeclinic.patient.search",
    "activeclinic.appointment.view",
    "activeclinic.reception.view",
    "activeclinic.encounter.view",
    "activeclinic.pharmacy.view",
    "activeclinic.diagnostics.view",
    "activeclinic.billing.view",
    "activeclinic.audit.view",
    "activeclinic.departments.manage",
  ],
  receptionist: [
    "activeclinic.access",
    "activeclinic.facility.view",
    "activeclinic.patient.search",
    "activeclinic.patient.create",
    "activeclinic.appointment.view",
    "activeclinic.reception.view",
  ],
  clinician: [
    "activeclinic.access",
    "activeclinic.facility.view",
    "activeclinic.patient.search",
    "activeclinic.appointment.view",
    "activeclinic.encounter.view",
    "activeclinic.consultation.record",
  ],
  nurse: [
    "activeclinic.access",
    "activeclinic.facility.view",
    "activeclinic.patient.search",
    "activeclinic.appointment.view",
    "activeclinic.reception.view",
    "activeclinic.encounter.view",
    "activeclinic.triage.record",
  ],
  pharmacist: [
    "activeclinic.access",
    "activeclinic.facility.view",
    "activeclinic.patient.search",
    "activeclinic.pharmacy.view",
    "activeclinic.pharmacy.dispense",
    "activeclinic.inventory.view",
  ],
  lab_technician: [
    "activeclinic.access",
    "activeclinic.facility.view",
    "activeclinic.patient.search",
    "activeclinic.lab.view",
    "activeclinic.lab.result",
  ],
  radiology_staff: [
    "activeclinic.access",
    "activeclinic.facility.view",
    "activeclinic.patient.search",
    "activeclinic.radiology.view",
    "activeclinic.radiology.result",
  ],
  cashier: [
    "activeclinic.access",
    "activeclinic.facility.view",
    "activeclinic.billing.view",
    "activeclinic.payment.collect",
    "activeclinic.cashier.open_session",
  ],
  billing_officer: [
    "activeclinic.access",
    "activeclinic.facility.view",
    "activeclinic.patient.search",
    "activeclinic.billing.view",
    "activeclinic.billing.charge",
  ],
  finance_supervisor: [
    "activeclinic.access",
    "activeclinic.facility.view",
    "activeclinic.patient.search",
    "activeclinic.billing.view",
    "activeclinic.payment.refund",
    "activeclinic.cashier.open_session",
  ],
  staff_minimal: [
    "activeclinic.access",
    "activeclinic.organization.view",
    "activeclinic.facility.view",
  ],
  multi_nurse_reception: [
    "activeclinic.access",
    "activeclinic.facility.view",
    "activeclinic.patient.search",
    "activeclinic.appointment.view",
    "activeclinic.reception.view",
    "activeclinic.encounter.view",
    "activeclinic.triage.record",
  ],
});

function tileKeys(tiles) {
  return tiles.map((t) => t.key).sort();
}

describe("activeclinic-dashboard-capabilities", () => {
  it("clinic manager sees operational modules + departments, not facilities admin or cashier", () => {
    const tiles = buildAuthorizedDashboardTiles(ROLE_PERMS.clinic_manager, {
      activeDepartmentTypes: ALL_DEPARTMENTS,
    });
    const keys = new Set(tileKeys(tiles));
    assert.ok(keys.has("patients"));
    assert.ok(keys.has("appointments"));
    assert.ok(keys.has("reception"));
    assert.ok(keys.has("booking_requests"));
    assert.ok(keys.has("clinical"));
    assert.ok(keys.has("pharmacy"));
    assert.ok(keys.has("diagnostics"));
    assert.ok(keys.has("billing"));
    assert.ok(keys.has("staff"));
    assert.ok(keys.has("departments"));
    assert.ok(keys.has("settings"));
    assert.ok(!keys.has("facilities"));
    assert.ok(!keys.has("access"));
    assert.ok(!keys.has("cashier"));
  });

  it("organization admin administration tiles include website and organization profile", () => {
    const keys = new Set(
      tileKeys(
        buildAuthorizedDashboardTiles(
          [
            "activeclinic.access",
            "activeclinic.organization.view",
            "activeclinic.organization.manage",
            "activeclinic.staff.view",
            "activeclinic.staff.assign_access",
            "activeclinic.facility.create",
            "website.view",
            "website.edit",
          ],
          { activeDepartmentTypes: ALL_DEPARTMENTS }
        )
      )
    );
    assert.ok(keys.has("organization"));
    assert.ok(keys.has("website"));
    assert.ok(keys.has("staff"));
    assert.ok(keys.has("access"));
    assert.ok(keys.has("facilities"));
    assert.ok(keys.has("settings"));
  });

  it("receptionist sees reception workflows only — no pharmacy/diagnostics/finance", () => {
    const keys = new Set(
      tileKeys(
        buildAuthorizedDashboardTiles(ROLE_PERMS.receptionist, {
          activeDepartmentTypes: ALL_DEPARTMENTS,
        })
      )
    );
    assert.ok(keys.has("patients"));
    assert.ok(keys.has("appointments"));
    assert.ok(keys.has("reception"));
    assert.ok(!keys.has("pharmacy"));
    assert.ok(!keys.has("diagnostics"));
    assert.ok(!keys.has("billing"));
    assert.ok(!keys.has("cashier"));
    assert.ok(!keys.has("clinical"));
    assert.ok(!keys.has("staff"));
    assert.ok(!keys.has("website"));
    assert.ok(!keys.has("organization"));
  });

  it("clinician sees clinical/patients — not admin or finance", () => {
    const keys = new Set(
      tileKeys(
        buildAuthorizedDashboardTiles(ROLE_PERMS.clinician, {
          activeDepartmentTypes: ALL_DEPARTMENTS,
        })
      )
    );
    assert.ok(keys.has("patients"));
    assert.ok(keys.has("clinical"));
    assert.ok(keys.has("appointments"));
    assert.ok(!keys.has("staff"));
    assert.ok(!keys.has("billing"));
    assert.ok(!keys.has("pharmacy"));
    assert.ok(!keys.has("access"));
  });

  it("nurse sees triage/clinical and reception when permitted", () => {
    const keys = new Set(
      tileKeys(
        buildAuthorizedDashboardTiles(ROLE_PERMS.nurse, {
          activeDepartmentTypes: ALL_DEPARTMENTS,
        })
      )
    );
    assert.ok(keys.has("clinical"));
    assert.ok(keys.has("reception"));
    assert.ok(keys.has("patients"));
    assert.ok(!keys.has("pharmacy"));
    assert.ok(!keys.has("billing"));
  });

  it("pharmacist sees pharmacy — not clinical admin/finance", () => {
    const keys = new Set(
      tileKeys(
        buildAuthorizedDashboardTiles(ROLE_PERMS.pharmacist, {
          activeDepartmentTypes: ALL_DEPARTMENTS,
        })
      )
    );
    assert.ok(keys.has("pharmacy"));
    assert.ok(keys.has("patients"));
    assert.ok(!keys.has("clinical"));
    assert.ok(!keys.has("billing"));
    assert.ok(!keys.has("staff"));
  });

  it("laboratory sees diagnostics via lab.view — not radiology-only assumption reverse", () => {
    const lab = new Set(
      tileKeys(
        buildAuthorizedDashboardTiles(ROLE_PERMS.lab_technician, {
          activeDepartmentTypes: ALL_DEPARTMENTS,
        })
      )
    );
    const rad = new Set(
      tileKeys(
        buildAuthorizedDashboardTiles(ROLE_PERMS.radiology_staff, {
          activeDepartmentTypes: ALL_DEPARTMENTS,
        })
      )
    );
    assert.ok(lab.has("diagnostics"));
    assert.ok(rad.has("diagnostics"));
    assert.ok(!lab.has("pharmacy"));
    assert.ok(!rad.has("billing"));
    // Neither role gets the other's modality permission in ROLE_PERMS bags.
    assert.ok(!ROLE_PERMS.lab_technician.includes("activeclinic.radiology.view"));
    assert.ok(!ROLE_PERMS.radiology_staff.includes("activeclinic.lab.view"));
  });

  it("cashier sees cashier/billing — not clinical pharmacy", () => {
    const keys = new Set(
      tileKeys(
        buildAuthorizedDashboardTiles(ROLE_PERMS.cashier, {
          activeDepartmentTypes: ALL_DEPARTMENTS,
        })
      )
    );
    assert.ok(keys.has("cashier"));
    assert.ok(keys.has("billing"));
    assert.ok(!keys.has("patients"));
    assert.ok(!keys.has("clinical"));
    assert.ok(!keys.has("pharmacy"));
  });

  it("billing/finance see finance tiles according to permissions", () => {
    const billing = new Set(
      tileKeys(
        buildAuthorizedDashboardTiles(ROLE_PERMS.billing_officer, {
          activeDepartmentTypes: ALL_DEPARTMENTS,
        })
      )
    );
    const finance = new Set(
      tileKeys(
        buildAuthorizedDashboardTiles(ROLE_PERMS.finance_supervisor, {
          activeDepartmentTypes: ALL_DEPARTMENTS,
        })
      )
    );
    assert.ok(billing.has("billing"));
    assert.ok(!billing.has("cashier"));
    assert.ok(finance.has("billing"));
    assert.ok(finance.has("cashier"));
  });

  it("multi-role nurse+receptionist receives union of tiles", () => {
    const keys = new Set(
      tileKeys(
        buildAuthorizedDashboardTiles(ROLE_PERMS.multi_nurse_reception, {
          activeDepartmentTypes: ALL_DEPARTMENTS,
        })
      )
    );
    assert.ok(keys.has("reception"));
    assert.ok(keys.has("clinical"));
    assert.ok(keys.has("patients"));
    assert.ok(keys.has("appointments"));
  });

  it("disabled pharmacy department hides pharmacy tile even with permission", () => {
    const withoutPharmacy = new Set(["reception", "opd", "billing"]);
    const keys = new Set(
      tileKeys(
        buildAuthorizedDashboardTiles(ROLE_PERMS.clinic_manager, {
          activeDepartmentTypes: withoutPharmacy,
        })
      )
    );
    assert.ok(!keys.has("pharmacy"));
    assert.ok(keys.has("reception"));
    assert.ok(keys.has("billing"));
    assert.ok(keys.has("patients")); // no department gate
  });

  it("no facility context hides department-gated modules", () => {
    const keys = new Set(
      tileKeys(
        buildAuthorizedDashboardTiles(ROLE_PERMS.pharmacist, {
          activeDepartmentTypes: null,
        })
      )
    );
    assert.ok(!keys.has("pharmacy"));
    assert.ok(keys.has("patients"));
    assert.ok(keys.has("settings"));
  });

  it("unauthorized tile is not emitted; missing access still allows settings only when access present", () => {
    const none = buildAuthorizedDashboardTiles([], {
      activeDepartmentTypes: ALL_DEPARTMENTS,
    });
    assert.deepEqual(none, []);

    const minimal = buildAuthorizedDashboardTiles(ROLE_PERMS.staff_minimal, {
      activeDepartmentTypes: ALL_DEPARTMENTS,
    });
    assert.deepEqual(tileKeys(minimal), ["settings"]);
  });

  it("groups omit empty sections and quickActions stay capability-ordered", () => {
    const tiles = buildAuthorizedDashboardTiles(ROLE_PERMS.receptionist, {
      activeDepartmentTypes: ALL_DEPARTMENTS,
    });
    const { sections } = groupDashboardSections(tiles);
    assert.ok(sections.every((s) => s.items.length > 0));
    assert.ok(!sections.some((s) => s.key === "pharmacy"));
    const actions = toQuickActions(tiles);
    assert.ok(actions.some((a) => a.label === "Reception"));
    assert.ok(actions.some((a) => a.label === "Settings"));
  });

  it("dashboard loader omits unauthorized metrics and does not query staff without permission", async () => {
    const calls = [];
    const db = {
      query: async (sql) => {
        calls.push(String(sql || ""));
        return { rows: [] };
      },
    };
    const dash = await loadActiveClinicDashboardHome(db, {
      auth: {
        organization: { id: "00000000-0000-4000-8000-000000000001", displayName: "Org" },
        healthcareOrganization: { publicName: "HCO" },
        staffMember: { displayName: "Reception", jobTitle: "Receptionist" },
        permissions: [
          "activeclinic.access",
          "activeclinic.patient.search",
          "activeclinic.appointment.view",
          "activeclinic.reception.view",
        ],
        isNetworkAdmin: false,
        roleAssignments: [{ roleDisplayName: "Receptionist" }],
      },
      shell: {
        selectedFacility: { id: "f1", displayName: "Main" },
        activeDepartmentTypes: ALL_DEPARTMENTS,
        availableFacilities: [{ id: "f1", displayName: "Main" }],
        permissions: [
          "activeclinic.access",
          "activeclinic.patient.search",
          "activeclinic.appointment.view",
          "activeclinic.reception.view",
        ],
      },
    });
    assert.equal(dash.ok, true);
    assert.equal(dash.summaries.facilities, null);
    assert.equal(dash.summaries.staff, null);
    assert.equal(dash.metrics.length, 0);
    assert.equal(dash.clinicSetup, null);
    assert.equal(dash.organizationConsole, null);
    assert.ok(dash.quickActions.some((a) => a.key === "reception"));
    assert.ok(!dash.quickActions.some((a) => a.key === "pharmacy"));
    assert.ok(!dash.quickActions.some((a) => a.key === "billing"));
    // No staff.view / facility.view → loader must not hit those list queries.
    assert.equal(calls.length, 0);
  });

  it("template renders only authorized section tiles without BlessBoard leakage", async () => {
    const dash = await loadActiveClinicDashboardHome(
      { query: async () => ({ rows: [] }) },
      {
        auth: {
          organization: { id: "o1", displayName: "Org" },
          healthcareOrganization: { publicName: "Demo Clinic" },
          staffMember: { displayName: "Pharma", jobTitle: "Pharmacist" },
          permissions: ROLE_PERMS.pharmacist,
          roleAssignments: [{ roleDisplayName: "Pharmacist" }],
        },
        shell: {
          selectedFacility: { id: "f1", displayName: "Main" },
          activeDepartmentTypes: ALL_DEPARTMENTS,
          permissions: ROLE_PERMS.pharmacist,
        },
      }
    );
    const shell = {
      product: { displayName: "ActiveClinic", productLine: "ActiveClinic HMS" },
      assetVersion: "test",
      staff: { displayName: "Pharma" },
      healthcareOrganization: { publicName: "Demo Clinic" },
      organization: { key: "demo" },
      selectedFacility: { id: "f1", displayName: "Main" },
      availableFacilities: [],
      eligibleOrganizations: [],
      canSwitchOrganization: false,
      canSwitchFacility: false,
      isNetworkAdmin: false,
      roleSummary: "Pharmacist",
      permissions: ROLE_PERMS.pharmacist,
      permissionSet: Object.fromEntries(ROLE_PERMS.pharmacist.map((p) => [p, true])),
      navigation: buildActiveClinicNavigation(ROLE_PERMS.pharmacist, "home", {
        activeDepartmentTypes: ALL_DEPARTMENTS,
      }),
      breadcrumbs: [{ label: "Home" }],
      pageHeader: { title: "Home", description: null, actions: [] },
      flash: null,
      csrf: { token: "csrf", field: "_csrf" },
      accountMenu: {
        staffDisplayName: "Pharma",
        roleLabel: "Pharmacist",
        organizationLabel: "Demo Clinic",
        facilityLabel: "Main",
        changePasswordHref: "/account/change-password",
        logoutAction: "/logout",
      },
      activeNav: "home",
      pageData: { dashboard: dash },
    };
    const html = renderActiveClinicAppPage("app/home-content.ejs", shell);
    assert.match(html, /data-ac-dashboard-tile="pharmacy"/);
    assert.match(html, /data-ac-dashboard-tile="patients"/);
    assert.doesNotMatch(html, /data-ac-dashboard-tile="billing"/);
    assert.doesNotMatch(html, /data-ac-dashboard-tile="clinical"/);
    assert.doesNotMatch(html, /BlessBoard|Sacred Modernity/i);
    assert.doesNotMatch(html, /platform administrator|Platform admin/i);
    assert.doesNotMatch(html, /data-ac-dashboard-card="clinic-setup"/);
    assert.doesNotMatch(html, /Clinic setup/);
  });
});
