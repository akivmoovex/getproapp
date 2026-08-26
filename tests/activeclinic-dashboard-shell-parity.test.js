"use strict";

/**
 * AC-V6-S02 — Dashboard + shared shell Stitch parity.
 */

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const request = require("supertest");

const {
  createActiveClinicFoundationApp,
} = require("../src/activeclinic/http/activeClinicFoundationServer");
const {
  loadActiveClinicDashboardHome,
} = require("../src/activeclinic/services/loadActiveClinicDashboardHome");
const {
  renderActiveClinicAppPage,
} = require("../src/activeclinic/http/renderActiveClinicShell");
const {
  renderAccessStatePage,
} = require("../src/activeclinic/http/renderActiveClinicAccessState");
const {
  buildActiveClinicNavigation,
} = require("../src/activeclinic/services/activeClinicNavigation");
const {
  CODE_ACTIVECLINIC_ORG_V6,
} = require("../src/platform/config/deploymentProfiles");

const MINIMAL_AC = {
  NODE_ENV: "test",
  PLATFORM_DEPLOYMENT_CODE: CODE_ACTIVECLINIC_ORG_V6,
  PLATFORM_PRIMARY_PRODUCT: "activeclinic",
};

function sampleShell(overrides) {
  return {
    product: { displayName: "ActiveClinic", productLine: "ActiveClinic HMS" },
    assetVersion: "s02-1",
    staff: { displayName: "Ada Clinic", jobTitle: "Administrator" },
    healthcareOrganization: { publicName: "Public Hospital" },
    organization: { key: "public-hospital" },
    selectedFacility: {
      id: "f1",
      facilityKey: "main",
      displayName: "Main Campus",
    },
    availableFacilities: [{ id: "f1", facilityKey: "main", displayName: "Main Campus" }],
    eligibleOrganizations: [],
    canSwitchOrganization: false,
    canSwitchFacility: false,
    isNetworkAdmin: true,
    roleSummary: "Network administrator",
    permissions: [
      "activeclinic.access",
      "activeclinic.facility.view",
      "activeclinic.staff.view",
      "activeclinic.staff.assign_access",
      "activeclinic.organization.manage",
    ],
    permissionSet: {
      "activeclinic.access": true,
      "activeclinic.facility.view": true,
      "activeclinic.staff.view": true,
      "activeclinic.staff.assign_access": true,
      "activeclinic.organization.manage": true,
    },
    navigation: buildActiveClinicNavigation(
      [
        "activeclinic.access",
        "activeclinic.facility.view",
        "activeclinic.staff.view",
        "activeclinic.staff.assign_access",
        "activeclinic.organization.manage",
      ],
      "home"
    ),
    breadcrumbs: [{ label: "Home" }],
    pageHeader: {
      title: "Home",
      description: "Infrastructure workspace",
      actions: [],
    },
    flash: null,
    csrf: { token: "csrf", field: "_csrf" },
    accountMenu: {
      staffDisplayName: "Ada Clinic",
      roleLabel: "Network administrator",
      organizationLabel: "Public Hospital",
      facilityLabel: "Main Campus",
      changePasswordHref: "/account/change-password",
      logoutAction: "/logout",
    },
    activeNav: "home",
    pageData: {},
    ...overrides,
  };
}

describe("activeclinic-dashboard-shell-parity (AC-V6-S02)", () => {
  it("shell layout exposes desktop sidebar, mobile drawer, and account menus", () => {
    const shell = sampleShell({
      pageData: {
        dashboard: {
          mode: "ready",
          welcome: {
            staffDisplayName: "Ada Clinic",
            organizationName: "Public Hospital",
            facilityName: "Main Campus",
            roleSummary: "Network administrator",
            scopeLabel: "Working in Main Campus",
          },
          summaries: {
            facilities: { label: "Active facilities", value: 2, href: "/app/facilities" },
            staff: { label: "Active staff", value: 3, href: "/app/staff" },
            invitations: { label: "Pending invitations", value: 1, href: "/app/staff" },
          },
          clinicSetup: {
            presentation: "incomplete",
            requiredComplete: 1,
            requiredTotal: 3,
            incomplete: [
              {
                key: "primary_facility",
                label: "Configure primary facility",
                destinationUrl: "/app/facilities",
                classification: "REQUIRED_FOR_OPERATIONS",
              },
            ],
            recommendedIncomplete: [],
          },
          setupTasks: [
            { key: "primary_facility", label: "Primary facility configured", done: true, href: "/app/facilities" },
          ],
          quickActions: [{ label: "View facilities", href: "/app/facilities", primary: false }],
          notices: [
            {
              tone: "info",
              message:
                "Clinical modules are not enabled yet. This home view shows infrastructure readiness only.",
            },
          ],
        },
      },
    });
    const html = renderActiveClinicAppPage("app/home-content.ejs", shell);
    assert.match(html, /data-ac-shell="staff-app"/);
    assert.match(html, /data-ac-shell-version="s02"/);
    assert.match(html, /data-ac-nav="desktop-sidebar"/);
    assert.match(html, /data-ac-nav-drawer="1"/);
    assert.match(html, /data-ac-composition="mobile-drawer"/);
    assert.match(html, /data-ac-account-menu="1"/);
    assert.match(html, /data-ac-dashboard="ready"/);
    assert.match(html, /data-ac-dashboard-card="welcome"/);
    assert.match(html, /Active facilities/);
    assert.match(html, /Clinic setup/);
    assert.match(html, /1 of 3 required items complete/);
    assert.match(html, /action="\/logout"/);
    assert.match(html, /data-ac-nav-source="registry"/);
    assert.doesNotMatch(html, /BlessBoard|Sacred Modernity/i);
    assert.doesNotMatch(
      html,
      /Patients Waiting|Appts\. Today|Pharmacy Alerts|Pending Invoices|Register Patient|Book Appointment/i
    );
    assert.doesNotMatch(html, /activeclinic\.facility\.view/);
  });

  it("navigation registry filters by permission and shares desktop/mobile items", () => {
    const nav = buildActiveClinicNavigation(
      ["activeclinic.access", "activeclinic.facility.view"],
      "home"
    );
    assert.equal(nav.items.length, 2);
    assert.deepEqual(
      nav.desktop.map((i) => i.key),
      nav.mobile.map((i) => i.key)
    );
    assert.ok(nav.items.find((i) => i.key === "settings"));
    assert.ok(!nav.items.find((i) => i.key === "facilities"));
    assert.ok(!nav.items.find((i) => i.key === "staff"));
    assert.ok(!nav.items.find((i) => /patient|pharmacy|billing|diagnostics/i.test(i.label)));
  });

  it("dashboard loader omits unauthorized summaries and builds setup tasks", async () => {
    const dash = await loadActiveClinicDashboardHome(
      { query: async () => ({ rows: [] }) },
      {
        auth: {
          organization: { id: "not-a-uuid", displayName: "Org" },
          healthcareOrganization: { publicName: "HCO" },
          staffMember: { displayName: "Ada", jobTitle: "Admin" },
          permissions: ["activeclinic.access", "activeclinic.facility.view"],
          isNetworkAdmin: true,
          roleAssignments: [{ roleDisplayName: "Network administrator" }],
        },
        shell: {
          selectedFacility: null,
          isNetworkAdmin: true,
          availableFacilities: [],
          canSwitchFacility: false,
        },
      }
    );
    assert.equal(dash.ok, true);
    assert.equal(dash.summaries.facilities, null);
    assert.equal(dash.summaries.staff, null);
    assert.ok(Array.isArray(dash.unsupportedStitchKpisOmitted));
    assert.ok(dash.unsupportedStitchKpisOmitted.length >= 3);
    assert.equal(dash.notices.length, 0);
    assert.ok(dash.quickActions.some((a) => a.label === "Settings"));
    assert.ok(!dash.quickActions.some((a) => a.label === "Facilities"));
  });

  it("access restricted and session-expired states render without clinical copy", () => {
    const denied = renderAccessStatePage({
      pageId: "access-denied",
      pageTitle: "Access Restricted",
      heading: "Access Restricted",
      message: "You do not have permission to view this page.",
      primaryHref: "/app",
      primaryLabel: "Return to home",
      showLogout: true,
      csrfToken: "x",
    });
    assert.match(denied, /data-ac-page="access-denied"/);
    assert.match(denied, /Access Restricted/);
    assert.match(denied, /Sign out/);
    assert.doesNotMatch(denied, /Clinical Services|patient/i);

    const expired = renderAccessStatePage({
      pageId: "session-expired",
      pageTitle: "Session ended",
      heading: "Session ended",
      message: "Your ActiveClinic session is no longer valid.",
      primaryHref: "/login?expired=1",
      primaryLabel: "Sign in",
    });
    assert.match(expired, /data-ac-page="session-expired"/);
    assert.match(expired, /Sign in/);
  });

  it("GET /login still public; /app requires auth", async () => {
    const app = createActiveClinicFoundationApp({
      getPool: () => ({ query: async () => ({ rows: [] }) }),
      env: MINIMAL_AC,
    });
    const login = await request(app).get("/login").set("Host", "activeclinic.org");
    assert.equal(login.status, 200);
    const anon = await request(app).get("/app").set("Host", "activeclinic.org");
    assert.equal(anon.status, 303);
    assert.match(anon.headers.location || "", /\/login/);
    assert.match(String(anon.headers["cache-control"] || ""), /no-store/i);
    assert.match(String(anon.headers.vary || ""), /Cookie/i);
  });
});
