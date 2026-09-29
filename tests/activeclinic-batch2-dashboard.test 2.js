"use strict";

/**
 * ActiveClinic V2.03 Batch 2 — AC-B2-01 Staff Dashboard.
 */

const { describe, it, before, after } = require("node:test");
const assert = require("node:assert/strict");
const request = require("supertest");
const fs = require("node:fs");
const path = require("node:path");

const {
  resetFoundationDatabase,
  createFoundationPool,
} = require("./helpers/foundationDb");
const { migrate } = require("../db/scripts/lib/migrator");
const { provisionPlatformTenant } = require("../src/platform/services/provisionPlatformTenant");
const {
  createPlatformIdentity,
} = require("../src/platform/services/platformIdentityService");
const {
  setPlatformIdentityPassword,
} = require("../src/platform/services/platformIdentityCredentialService");
const {
  createHealthcareOrganization,
} = require("../src/activeclinic/services/healthcareOrganizationService");
const {
  createFacility,
} = require("../src/activeclinic/services/facilityService");
const {
  ensureDefaultDepartments,
} = require("../src/activeclinic/services/activeClinicDepartmentService");
const {
  createStaffMember,
} = require("../src/activeclinic/services/activeClinicStaffService");
const {
  assignStaffToFacility,
} = require("../src/activeclinic/services/activeClinicStaffFacilityService");
const {
  assignStaffRole,
  NETWORK_ADMIN,
  RECEPTIONIST,
  CLINICIAN,
} = require("../src/activeclinic/services/activeClinicAuthorizationService");
const {
  createActiveClinicFoundationApp,
} = require("../src/activeclinic/http/activeClinicFoundationServer");
const {
  createPlatformIdentitySession,
} = require("../src/platform/session/createDeploymentSession");
const {
  CODE_ACTIVECLINIC_ORG_V6,
  COOKIE_ACTIVECLINIC_ORG,
} = require("../src/platform/config/deploymentProfiles");
const {
  loadActiveClinicDashboardHome,
} = require("../src/activeclinic/services/loadActiveClinicDashboardHome");
const {
  renderActiveClinicAppPage,
} = require("../src/activeclinic/http/renderActiveClinicShell");
const {
  buildActiveClinicNavigation,
} = require("../src/activeclinic/services/activeClinicNavigation");

const PASSWORD = "activeclinic-pass-12";
const MINIMAL_AC = Object.freeze({
  NODE_ENV: "test",
  PLATFORM_DEPLOYMENT_CODE: CODE_ACTIVECLINIC_ORG_V6,
  DATABASE_URL: "postgres://unused/local",
  SESSION_SECRET: "a".repeat(40),
});

let pool;
let databaseUrl;
let skipReason = null;
let phoneSeq = 830000000;

function nextPhone() {
  phoneSeq += 1;
  return `+2609${String(phoneSeq).slice(-8)}`;
}

function requireDb() {
  if (skipReason) {
    const err = new Error(`skip: ${skipReason}`);
    err.code = "ERR_TEST_SKIP";
    throw err;
  }
}

async function provisionOrg(input) {
  const result = await provisionPlatformTenant(pool, {
    skipDomain: true,
    dataEnvironment: "testing",
    ...input,
  });
  assert.equal(result.ok, true, JSON.stringify(result));
  return result;
}

async function seedAcTenant(stamp, keyPrefix) {
  const org = await provisionOrg({
    organizationKey: `${keyPrefix}_${stamp}`,
    displayName: `AC ${keyPrefix}`,
    productKey: "activeclinic",
    productTenantKey: `${keyPrefix}-${stamp}`,
    deploymentCode: CODE_ACTIVECLINIC_ORG_V6,
  });
  const hco = await createHealthcareOrganization(pool, {
    organizationId: org.records.organization.id,
    legalName: "Legal Hospital",
    publicName: "Batch2 Dash Clinic",
    organizationType: "private_healthcare",
    countryCode: "ZM",
    timezone: "Africa/Lusaka",
  });
  assert.equal(hco.ok, true, JSON.stringify(hco));
  const facility = await createFacility(pool, {
    organizationId: org.records.organization.id,
    healthcareOrganizationId: hco.healthcareOrganization.id,
    facilityKey: "main",
    displayName: "Main Facility",
    facilityType: "hospital",
    status: "active",
    isPrimary: true,
    countryCode: "ZM",
    timezone: "Africa/Lusaka",
    phone: nextPhone(),
    city: "Lusaka",
  });
  assert.equal(facility.ok, true, JSON.stringify(facility));
  await ensureDefaultDepartments(pool, {
    organizationId: org.records.organization.id,
    healthcareOrganizationId: hco.healthcareOrganization.id,
    facilityId: facility.facility.id,
  });
  return {
    orgId: org.records.organization.id,
    hcoId: hco.healthcareOrganization.id,
    facilityId: facility.facility.id,
  };
}

async function seedStaff(ac, opts) {
  const phone = opts.phone || nextPhone();
  const identity = await createPlatformIdentity(pool, {
    primaryPhone: phone,
    phoneNormalized: phone,
    phoneVerifiedAt: new Date().toISOString(),
  });
  assert.equal(identity.ok, true);
  await setPlatformIdentityPassword(pool, {
    identityId: identity.identity.id,
    password: PASSWORD,
  });
  const staff = await createStaffMember(pool, {
    organizationId: ac.orgId,
    healthcareOrganizationId: ac.hcoId,
    firstName: opts.firstName || "Dash",
    lastName: opts.lastName || "User",
    employmentType: "permanent",
    phone,
    status: "active",
    platformIdentityId: identity.identity.id,
    jobTitle: opts.jobTitle || "Staff",
  });
  assert.equal(staff.ok, true, JSON.stringify(staff));
  await assignStaffToFacility(pool, {
    organizationId: ac.orgId,
    staffMemberId: staff.staffMember.id,
    facilityId: ac.facilityId,
    isPrimary: true,
  });
  await assignStaffRole(pool, {
    organizationId: ac.orgId,
    staffMemberId: staff.staffMember.id,
    roleKey: opts.roleKey || NETWORK_ADMIN,
    scopeType: opts.scopeType || "organisation",
    facilityId: opts.scopeType === "facility" ? ac.facilityId : null,
  });
  return { identity: identity.identity, staff: staff.staffMember };
}

async function sessionCookie(identityId, orgId, facilityId) {
  const session = await createPlatformIdentitySession(pool, {
    deploymentCode: CODE_ACTIVECLINIC_ORG_V6,
    platformIdentityId: identityId,
    organizationId: orgId,
    contextJson: facilityId ? { selectedFacilityId: facilityId } : {},
  });
  assert.equal(session.ok, true, JSON.stringify(session));
  return `${COOKIE_ACTIVECLINIC_ORG}=${session.rawToken}`;
}

describe("ActiveClinic V2.03 Batch 2 AC-B2-01 dashboard", () => {
  before(async () => {
    try {
      databaseUrl = await resetFoundationDatabase();
      pool = createFoundationPool(databaseUrl);
      await migrate({ connectionString: databaseUrl });
    } catch (err) {
      skipReason = err && err.message ? String(err.message) : String(err);
    }
  });

  after(async () => {
    if (pool) await pool.end().catch(() => {});
  });

  it("CSS includes B2 dashboard composition rules for desktop and 390px", () => {
    const css = fs.readFileSync(
      path.join(__dirname, "../public/activeclinic/ac-app.css"),
      "utf8"
    );
    assert.match(css, /\.ac-dashboard--b2/);
    assert.match(css, /\.ac-dashboard-hero__greeting/);
    assert.match(css, /\.ac-dashboard-kpi/);
    assert.match(css, /\.ac-dashboard-layout/);
    assert.match(css, /@media \(max-width: 390px\)[\s\S]*\.ac-dashboard--b2/);
  });

  it("template exposes Stitch markers, KPI/workflow regions, and internal unsupported registry", () => {
    const html = renderActiveClinicAppPage("app/home-content.ejs", {
      product: { displayName: "ActiveClinic" },
      assetVersion: "b2-dash",
      staff: { displayName: "Ada Clinic" },
      healthcareOrganization: { publicName: "Public Hospital" },
      organization: { key: "public-hospital" },
      selectedFacility: { id: "f1", displayName: "Main Campus" },
      availableFacilities: [],
      eligibleOrganizations: [],
      canSwitchOrganization: false,
      canSwitchFacility: false,
      isNetworkAdmin: true,
      roleSummary: "Network administrator",
      permissions: ["activeclinic.access"],
      permissionSet: { "activeclinic.access": true },
      navigation: buildActiveClinicNavigation(["activeclinic.access"], "home"),
      breadcrumbs: [{ label: "Home" }],
      pageHeader: { title: "Good morning, Ada Clinic", description: "Today", actions: [] },
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
      pageData: {
        dashboard: {
          mode: "ready",
          stitch: {
            code: "AC-B2-01",
            desktop: "ed2ef3ac64d44c398f177d1b58ffc430",
            mobile: "2cb0ef951e1e40418cc7272d1392b26d",
          },
          greeting: "Good morning, Ada Clinic",
          dateLine: "Saturday, Sep 26, 2026",
          operationalStatus: { tone: "success", label: "Clinic Operational" },
          welcome: {
            staffDisplayName: "Ada Clinic",
            organizationName: "Public Hospital",
            facilityName: "Main Campus",
            roleSummary: "Network administrator",
          },
          kpiCards: [
            {
              key: "appts_today",
              label: "Today's Appts",
              value: 3,
              hint: "1 completed",
              href: "/app/appointments",
              icon: "event",
            },
            {
              key: "waiting_room",
              label: "Waiting Room",
              value: 2,
              hint: "2 active in queue",
              href: "/app/reception",
              icon: "desk",
            },
          ],
          queuePreview: [
            { id: "q1", label: "Queue #1", status: "waiting", href: "/app/reception/queue/q1" },
          ],
          upcomingPreview: [
            {
              id: "a1",
              startsAt: "2026-09-26T10:00:00.000Z",
              status: "scheduled",
              href: "/app/appointments/a1",
            },
          ],
          openEncounterPreview: [],
          recentActivity: [
            {
              key: "queue_preview",
              title: "2 patient(s) in waiting room",
              href: "/app/reception",
              tone: "info",
              badgeLabel: "Queue",
            },
          ],
          sections: [
            {
              key: "front_desk",
              title: "Front desk",
              items: [
                {
                  key: "patients",
                  label: "Patients",
                  description: "Find patients",
                  href: "/app/patients",
                },
              ],
            },
          ],
          quickActions: [
            { key: "patients", label: "Patients", href: "/app/patients", primary: true },
          ],
          unsupportedStitchPanels: [
            {
              key: "lab_sign_off",
              label: "Lab Sign-Off",
              reason: "No dashboard aggregation",
              href: null,
            },
          ],
          notices: [],
        },
      },
    });

    assert.match(html, /data-ac-stitch="AC-B2-01"/);
    assert.match(html, /data-ac-stitch-desktop="ed2ef3ac64d44c398f177d1b58ffc430"/);
    assert.match(html, /data-ac-stitch-mobile="2cb0ef951e1e40418cc7272d1392b26d"/);
    assert.match(html, /ac-dashboard--b2/);
    assert.match(html, /data-ac-dashboard-greeting="1"/);
    assert.match(html, /Good morning, Ada Clinic/);
    assert.match(html, /Clinic Operational/);
    assert.match(html, /data-ac-dashboard-card="kpi"/);
    assert.match(html, /data-ac-dashboard-metric="appts_today"/);
    assert.match(html, /Today&#39;s Appts|Today's Appts/);
    assert.match(html, /data-ac-dashboard-card="today-workflow"/);
    assert.match(html, /data-ac-dashboard-panel="queue"/);
    assert.match(html, /data-ac-dashboard-panel="upcoming"/);
    assert.match(html, /data-ac-dashboard-card="recent-activity"/);
    assert.match(html, /data-ac-dashboard-card="quick-actions"/);
    assert.match(html, /data-ac-unsupported-registry="1"/);
    assert.match(html, /data-ac-unsupported="lab_sign_off"/);
    assert.doesNotMatch(html, /Not on dashboard/);
    assert.doesNotMatch(html, /Punctuality Index|Avg wait: 11/);
  });

  it("loader omits fabricated Stitch KPIs and gates operational cards by permission", async () => {
    const restricted = await loadActiveClinicDashboardHome(
      { query: async () => ({ rows: [] }) },
      {
        auth: {
          organization: { id: "00000000-0000-4000-8000-000000000001", displayName: "Org" },
          healthcareOrganization: {
            id: "00000000-0000-4000-8000-000000000002",
            publicName: "HCO",
          },
          staffMember: { id: "s1", displayName: "Restricted", jobTitle: "Staff" },
          platformIdentity: { id: "p1" },
          permissions: ["activeclinic.access"],
          isNetworkAdmin: false,
          roleAssignments: [{ roleDisplayName: "Staff" }],
        },
        shell: {
          selectedFacility: { id: "f1", displayName: "Main" },
          isNetworkAdmin: false,
          availableFacilities: [{ id: "f1", displayName: "Main" }],
          canSwitchFacility: false,
          permissions: ["activeclinic.access"],
        },
      }
    );
    assert.equal(restricted.ok, true);
    assert.ok(restricted.greeting);
    assert.equal(restricted.stitch.code, "AC-B2-01");
    assert.equal(restricted.kpiCards.length, 0);
    assert.ok(restricted.unsupportedStitchKpisOmitted.includes("Billing revenue / collected today"));
    assert.ok(
      restricted.unsupportedStitchPanels.some((p) => p.key === "lab_sign_off")
    );

    const withApptPerm = await loadActiveClinicDashboardHome(
      {
        query: async () => ({ rows: [] }),
      },
      {
        auth: {
          organization: { id: "00000000-0000-4000-8000-000000000001", displayName: "Org" },
          healthcareOrganization: {
            id: "00000000-0000-4000-8000-000000000002",
            publicName: "HCO",
          },
          staffMember: { id: "s1", displayName: "Front Desk", jobTitle: "Reception" },
          platformIdentity: { id: "p1" },
          permissions: [
            "activeclinic.access",
            "activeclinic.appointment.view",
            "activeclinic.reception.view",
          ],
          isNetworkAdmin: false,
          roleAssignments: [{ roleDisplayName: "Receptionist" }],
        },
        shell: {
          selectedFacility: { id: "f1", displayName: "Main" },
          isNetworkAdmin: false,
          availableFacilities: [{ id: "f1", displayName: "Main" }],
          canSwitchFacility: false,
          permissions: [
            "activeclinic.access",
            "activeclinic.appointment.view",
            "activeclinic.reception.view",
          ],
        },
      }
    );
    const keys = withApptPerm.kpiCards.map((c) => c.key);
    assert.ok(keys.includes("appts_today") || keys.includes("waiting_room"));
    assert.ok(!keys.includes("billing_revenue"));
  });

  it("network admin home exposes B2 markers and admin metrics without fabricated clinical KPIs", async () => {
    requireDb();
    const stamp = Date.now().toString(36);
    const ac = await seedAcTenant(stamp, "b2dasha");
    const admin = await seedStaff(ac, {
      firstName: "Net",
      lastName: "Admin",
      roleKey: NETWORK_ADMIN,
      jobTitle: "Network administrator",
    });
    const app = createActiveClinicFoundationApp({
      getPool: () => pool,
      env: MINIMAL_AC,
      log: () => {},
    });
    const cookie = await sessionCookie(admin.identity.id, ac.orgId, ac.facilityId);
    const home = await request(app).get("/app").set("Cookie", cookie);
    assert.equal(home.status, 200);
    assert.match(home.text, /data-ac-stitch="AC-B2-01"/);
    assert.match(home.text, /ac-dashboard--b2/);
    assert.match(home.text, /data-ac-dashboard-greeting="1"/);
    assert.match(home.text, /Good (morning|afternoon|evening),/);
    assert.match(home.text, /data-ac-dashboard-card="kpi"|data-ac-dashboard-metric=/);
    assert.match(home.text, /Active facilities|Active staff|Today&#39;s Appts|Today's Appts|Waiting Room/);
    assert.match(home.text, /data-ac-unsupported-registry="1"/);
    assert.doesNotMatch(home.text, /Punctuality Index|Avg wait: 11|Collected Today/i);
    assert.match(home.text, /data-ac-dashboard-tile=/);
  });

  it("receptionist and clinician homes diverge on operational tiles and modules", async () => {
    requireDb();
    const stamp = Date.now().toString(36);
    const ac = await seedAcTenant(stamp, "b2dashr");
    const reception = await seedStaff(ac, {
      firstName: "Front",
      lastName: "Desk",
      roleKey: RECEPTIONIST,
      scopeType: "facility",
      jobTitle: "Receptionist",
    });
    const clinician = await seedStaff(ac, {
      firstName: "Care",
      lastName: "Lead",
      roleKey: CLINICIAN,
      scopeType: "facility",
      jobTitle: "Clinician",
    });
    const app = createActiveClinicFoundationApp({
      getPool: () => pool,
      env: MINIMAL_AC,
      log: () => {},
    });

    const recCookie = await sessionCookie(
      reception.identity.id,
      ac.orgId,
      ac.facilityId
    );
    const clinCookie = await sessionCookie(
      clinician.identity.id,
      ac.orgId,
      ac.facilityId
    );

    const recHome = await request(app).get("/app").set("Cookie", recCookie);
    const clinHome = await request(app).get("/app").set("Cookie", clinCookie);
    assert.equal(recHome.status, 200);
    assert.equal(clinHome.status, 200);

    assert.match(recHome.text, /data-ac-stitch="AC-B2-01"/);
    assert.match(clinHome.text, /data-ac-stitch="AC-B2-01"/);

    assert.match(recHome.text, /data-ac-dashboard-metric="waiting_room"|Waiting Room|data-ac-dashboard-tile="reception"/);
    assert.doesNotMatch(recHome.text, /data-ac-dashboard-metric="clinical_tasks"/);
    assert.doesNotMatch(recHome.text, /data-ac-dashboard-tile="billing"/);

    assert.match(
      clinHome.text,
      /data-ac-dashboard-metric="clinical_tasks"|data-ac-dashboard-tile="clinical"|Open encounters|Clinical/
    );
    assert.doesNotMatch(clinHome.text, /data-ac-dashboard-card="clinic-setup"/);
    assert.doesNotMatch(clinHome.text, /Active facilities/);
  });
});
