"use strict";

/**
 * ActiveClinic V7 Phase C — clinic first-login setup on /app.
 * Isolated local foundation databases only.
 */

const { describe, it, before, after, beforeEach } = require("node:test");
const assert = require("node:assert/strict");
const request = require("supertest");

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
  updateHealthcareOrganization,
} = require("../src/activeclinic/services/healthcareOrganizationService");
const { createFacility } = require("../src/activeclinic/services/facilityService");
const { createStaffMember } = require("../src/activeclinic/services/activeClinicStaffService");
const {
  assignStaffToFacility,
} = require("../src/activeclinic/services/activeClinicStaffFacilityService");
const {
  assignStaffRole,
  ORGANIZATION_ADMIN,
  NETWORK_ADMIN,
  CLINIC_MANAGER,
  RECEPTIONIST,
  CLINICIAN,
  NURSE,
  PHARMACIST,
  LAB_TECHNICIAN,
  RADIOLOGY_STAFF,
  CASHIER,
} = require("../src/activeclinic/services/activeClinicAuthorizationService");
const { ensureDefaultDepartments } = require("../src/activeclinic/services/activeClinicDepartmentService");
const {
  SETUP_CLASSIFICATION,
  calculateOrganizationSetupState,
  canSeeClinicSetupPanel,
  presentClinicSetupForViewer,
  loadOrganizationClinicSetup,
  hasPublicHoursConfigured,
} = require("../src/activeclinic/services/loadActiveClinicSettingsScreens");
const {
  loadActiveClinicDashboardHome,
} = require("../src/activeclinic/services/loadActiveClinicDashboardHome");
const {
  createActiveClinicFoundationApp,
} = require("../src/activeclinic/http/activeClinicFoundationServer");
const {
  createPlatformIdentitySession,
} = require("../src/platform/session/createDeploymentSession");
const {
  CODE_ACTIVECLINIC_ORG_V6,
  COOKIE_ACTIVECLINIC_ORG,
  resetDeploymentProfileWarningsForTests,
} = require("../src/platform/config/deploymentProfiles");

const PASSWORD = "activeclinic-pass-12";
const MINIMAL_AC = Object.freeze({
  NODE_ENV: "test",
  PLATFORM_DEPLOYMENT_CODE: CODE_ACTIVECLINIC_ORG_V6,
  DATABASE_URL: "postgres://unused/local",
  SESSION_SECRET: "a".repeat(40),
});

const PROFILE = Object.freeze({
  publicName: "Sunrise Clinic",
  legalName: "Sunrise Clinic Ltd",
  countryCode: "ZM",
  timezone: "Africa/Lusaka",
  organizationType: "private_healthcare",
});

const OPERATIONAL_PRIMARY = Object.freeze({
  id: "11111111-1111-4111-8111-111111111111",
  operational: true,
  phoneDisplay: "+260955000000",
  facilityKey: "hq",
  displayName: "HQ",
  href: "/app/facilities/hq",
  publicHoursJson: null,
});

const ADMIN_PERMS = Object.freeze([
  "activeclinic.access",
  "activeclinic.organization.view",
  "activeclinic.organization.manage",
  "activeclinic.facility.view",
  "activeclinic.facility.create",
  "activeclinic.facility.update",
  "activeclinic.departments.manage",
  "activeclinic.staff.view",
  "activeclinic.staff.invite",
  "activeclinic.staff.assign_access",
  "website.edit",
]);

const ROLE_PERMS = Object.freeze({
  clinic_manager: ["activeclinic.access", "activeclinic.departments.manage", "activeclinic.facility.view"],
  receptionist: ["activeclinic.access", "activeclinic.facility.view", "activeclinic.reception.view"],
  clinician: ["activeclinic.access", "activeclinic.encounter.view"],
  nurse: ["activeclinic.access", "activeclinic.triage.record"],
  pharmacist: ["activeclinic.access", "activeclinic.pharmacy.view", "activeclinic.facility.view"],
  laboratory: ["activeclinic.access", "activeclinic.lab.view"],
  radiology: ["activeclinic.access", "activeclinic.radiology.view"],
  cashier: ["activeclinic.access", "activeclinic.billing.cashier"],
});

let pool;
let databaseUrl;
let skipReason = null;
let phoneSeq = 880000000;

function nextPhone() {
  phoneSeq += 1;
  return `+2609${String(phoneSeq).slice(-8)}`;
}

function itemByKey(setup, key) {
  return (setup.items || []).find((item) => item.key === key) || null;
}

function fullSetupInput(overrides) {
  return {
    healthcareOrganization: { ...PROFILE },
    primaryFacility: { ...OPERATIONAL_PRIMARY },
    hasActiveAdministrator: true,
    primaryDepartments: [{ status: "active", departmentType: "reception" }],
    staffCounts: { active: 1, invited: 0 },
    website: { provisioned: true, published: false, latestSubmissionStatus: null, clinicKey: "sunrise" },
    clinicKey: "sunrise",
    ...overrides,
  };
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

async function seedClinic(stamp, keyPrefix, opts) {
  const org = await provisionOrg({
    organizationKey: `${keyPrefix}_${stamp}`,
    displayName: `AC ${keyPrefix}`,
    productKey: "activeclinic",
    productTenantKey: `${keyPrefix}-${stamp}`,
    deploymentCode: CODE_ACTIVECLINIC_ORG_V6,
  });
  const hco = await createHealthcareOrganization(pool, {
    organizationId: org.records.organization.id,
    legalName: (opts && opts.legalName) || "Legal Clinic Setup",
    publicName: (opts && opts.publicName) || "Setup Clinic",
    organizationType: "private_healthcare",
    countryCode: "ZM",
    timezone: "Africa/Lusaka",
  });
  assert.equal(hco.ok, true, JSON.stringify(hco));
  let facility = null;
  if (!opts || opts.withFacility !== false) {
    const created = await createFacility(pool, {
      organizationId: org.records.organization.id,
      healthcareOrganizationId: hco.healthcareOrganization.id,
      facilityKey: `${keyPrefix}-hq`,
      displayName: "HQ Facility",
      facilityType: "clinic",
      status: "active",
      isPrimary: true,
      countryCode: "ZM",
      timezone: "Africa/Lusaka",
      phone: nextPhone(),
      city: "Lusaka",
    });
    assert.equal(created.ok, true, JSON.stringify(created));
    facility = created.facility;
    if (!opts || opts.withDepartments !== false) {
      await ensureDefaultDepartments(pool, {
        organizationId: org.records.organization.id,
        healthcareOrganizationId: hco.healthcareOrganization.id,
        facilityId: facility.id,
      });
    }
  }
  return {
    orgId: org.records.organization.id,
    orgKey: (org.records.organization && org.records.organization.key) || `${keyPrefix}_${stamp}`,
    hcoId: hco.healthcareOrganization.id,
    hco: hco.healthcareOrganization,
    facility,
  };
}

async function seedStaff(clinic, opts) {
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
    organizationId: clinic.orgId,
    healthcareOrganizationId: clinic.hcoId,
    firstName: opts.firstName || "Clinic",
    lastName: opts.lastName || "Admin",
    employmentType: "permanent",
    phone,
    status: "active",
    platformIdentityId: identity.identity.id,
    jobTitle: opts.jobTitle || "Administrator",
  });
  assert.equal(staff.ok, true, JSON.stringify(staff));
  const orgWide =
    opts.roleKey === ORGANIZATION_ADMIN ||
    opts.roleKey === NETWORK_ADMIN ||
    opts.scopeType === "organisation";
  if (clinic.facility && !orgWide) {
    await assignStaffToFacility(pool, {
      organizationId: clinic.orgId,
      staffMemberId: staff.staffMember.id,
      facilityId: clinic.facility.id,
      isPrimary: true,
    });
  } else if (clinic.facility && orgWide) {
    await assignStaffToFacility(pool, {
      organizationId: clinic.orgId,
      staffMemberId: staff.staffMember.id,
      facilityId: clinic.facility.id,
      isPrimary: true,
    });
  }
  const assigned = await assignStaffRole(pool, {
    organizationId: clinic.orgId,
    staffMemberId: staff.staffMember.id,
    roleKey: opts.roleKey,
    scopeType: orgWide ? "organisation" : "facility",
    facilityId: orgWide ? null : clinic.facility.id,
  });
  assert.equal(assigned.ok, true, JSON.stringify(assigned));
  return { identity: identity.identity, staff: staff.staffMember, phone };
}

async function sessionCookie(identityId, orgId) {
  const session = await createPlatformIdentitySession(pool, {
    deploymentCode: CODE_ACTIVECLINIC_ORG_V6,
    platformIdentityId: identityId,
    organizationId: orgId,
  });
  assert.equal(session.ok, true, JSON.stringify(session));
  return { cookie: `${COOKIE_ACTIVECLINIC_ORG}=${session.rawToken}` };
}

function makeApp() {
  return createActiveClinicFoundationApp({
    getPool: () => pool,
    env: MINIMAL_AC,
    log: () => {},
  });
}

describe("ActiveClinic clinic first-login setup (Phase C)", () => {
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

  beforeEach(() => {
    resetDeploymentProfileWarningsForTests();
  });

  function requireDb() {
    if (skipReason) assert.fail(`Local PostgreSQL unavailable: ${skipReason}`);
  }

  it("calculates required vs recommended items from existing configuration fields", () => {
    const incomplete = calculateOrganizationSetupState(fullSetupInput({
      healthcareOrganization: { ...PROFILE, legalName: "" },
      primaryFacility: null,
      hasActiveAdministrator: false,
      primaryDepartments: [],
    }));
    assert.equal(incomplete.complete, false);
    assert.equal(incomplete.label, "Setup incomplete");
    assert.equal(itemByKey(incomplete, "clinic_profile").complete, false);
    assert.equal(itemByKey(incomplete, "primary_facility").complete, false);
    assert.equal(itemByKey(incomplete, "administrator").complete, false);
    assert.equal(itemByKey(incomplete, "departments").complete, false);
    assert.equal(itemByKey(incomplete, "departments").classification, SETUP_CLASSIFICATION.REQUIRED_FOR_OPERATIONS);
    assert.equal(itemByKey(incomplete, "public_hours"), null);
    assert.equal(itemByKey(incomplete, "additional_staff").classification, SETUP_CLASSIFICATION.RECOMMENDED);
    assert.equal(itemByKey(incomplete, "website").classification, SETUP_CLASSIFICATION.RECOMMENDED);
    assert.equal(incomplete.operationsComplete, false);

    const ready = calculateOrganizationSetupState(fullSetupInput({
      website: {
        provisioned: true,
        published: false,
        latestSubmissionStatus: "submitted",
        clinicKey: "sunrise",
      },
    }));
    assert.equal(ready.complete, true);
    assert.equal(ready.label, "Profile complete");
    assert.equal(ready.operationsComplete, true);
    assert.equal(itemByKey(ready, "website").complete, true);
    assert.equal(itemByKey(ready, "website").currentState, "submitted");
    assert.equal(itemByKey(ready, "additional_staff").complete, false);
    assert.equal(itemByKey(ready, "public_hours").complete, false);
    assert.equal(itemByKey(ready, "public_hours").classification, SETUP_CLASSIFICATION.RECOMMENDED);
  });

  it("treats website publication as recommended and never an operational blocker", () => {
    const awaitingPa = calculateOrganizationSetupState(fullSetupInput({
      website: {
        provisioned: true,
        published: false,
        latestSubmissionStatus: "submitted",
        clinicKey: "sunrise",
      },
    }));
    assert.equal(awaitingPa.operationsComplete, true);
    assert.equal(itemByKey(awaitingPa, "website").complete, true);
    assert.equal(itemByKey(awaitingPa, "website").currentState, "submitted");

    const draft = calculateOrganizationSetupState(fullSetupInput());
    assert.equal(draft.operationsComplete, true);
    assert.equal(itemByKey(draft, "website").complete, false);
    assert.equal(itemByKey(draft, "website").currentState, "draft");
    assert.equal(
      itemByKey(draft, "website").destinationUrl,
      "/clinics/sunrise?website_edit=1&website_mode=draft"
    );

    const published = calculateOrganizationSetupState(fullSetupInput({
      website: { provisioned: true, published: true, latestSubmissionStatus: "approved", clinicKey: "sunrise" },
    }));
    assert.equal(itemByKey(published, "website").currentState, "published");
    assert.equal(itemByKey(published, "website").complete, true);
    assert.equal(published.operationsComplete, true);
  });

  it("department and hours checks use the primary facility only", () => {
    const noHours = calculateOrganizationSetupState(fullSetupInput({
      primaryFacility: { ...OPERATIONAL_PRIMARY, publicHoursJson: { monday: "08:00-17:00" } },
    }));
    assert.equal(hasPublicHoursConfigured({ monday: "08:00-17:00" }), true);
    assert.equal(itemByKey(noHours, "public_hours").complete, true);
    assert.equal(itemByKey(noHours, "public_hours").facilityContext.facilityKey, "hq");
    assert.equal(itemByKey(noHours, "departments").facilityContext.facilityKey, "hq");
  });

  it("hides setup actions from operational roles and keeps admin links permission-filtered", () => {
    const setup = calculateOrganizationSetupState(fullSetupInput());
    assert.equal(canSeeClinicSetupPanel(ADMIN_PERMS), true);
    assert.equal(canSeeClinicSetupPanel(ROLE_PERMS.receptionist), false);
    assert.equal(canSeeClinicSetupPanel(ROLE_PERMS.clinician), false);
    assert.equal(canSeeClinicSetupPanel(ROLE_PERMS.nurse), false);
    assert.equal(canSeeClinicSetupPanel(ROLE_PERMS.pharmacist), false);
    assert.equal(canSeeClinicSetupPanel(ROLE_PERMS.laboratory), false);
    assert.equal(canSeeClinicSetupPanel(ROLE_PERMS.radiology), false);
    assert.equal(canSeeClinicSetupPanel(ROLE_PERMS.cashier), false);
    assert.equal(canSeeClinicSetupPanel(ROLE_PERMS.clinic_manager), true);

    const adminView = presentClinicSetupForViewer(setup, ADMIN_PERMS);
    assert.ok(adminView.visible.some((item) => item.key === "clinic_profile"));
    assert.ok(adminView.visible.some((item) => item.key === "website"));
    assert.equal(adminView.presentation, "recommended");

    const managerView = presentClinicSetupForViewer(setup, ROLE_PERMS.clinic_manager);
    assert.deepEqual(managerView.visible.map((item) => item.key), ["departments"]);
    assert.equal(managerView.presentation, "hidden");

    const receptionistView = presentClinicSetupForViewer(setup, ROLE_PERMS.receptionist);
    assert.equal(receptionistView.presentation, "hidden");
    assert.equal(receptionistView.visible.length, 0);
  });

  it("newly provisioned clinic admin sees Clinic setup on /app from live configuration", async () => {
    requireDb();
    const stamp = Date.now().toString(36);
    const clinic = await seedClinic(stamp, "cset");
    const admin = await seedStaff(clinic, { roleKey: ORGANIZATION_ADMIN });
    const app = makeApp();
    const { cookie } = await sessionCookie(admin.identity.id, clinic.orgId);

    const home = await request(app).get("/app").set("Cookie", cookie);
    assert.equal(home.status, 200);
    assert.match(home.text, /data-ac-dashboard-card="clinic-setup"/);
    assert.match(home.text, /Clinic setup/);
    assert.match(home.text, /Required setup is complete/);
    assert.match(home.text, /data-ac-setup-item="website"/);
    assert.match(home.text, /data-ac-setup-item="additional_staff"/);
    assert.match(home.text, /\/app\/staff\/invite/);
    assert.match(home.text, /website_edit=1/);
    assert.doesNotMatch(home.text, /pending_review|Request information|clinic_registration/i);
    assert.match(home.text, /data-ac-dashboard-card="administration"|data-ac-dashboard-card="primary-work"/);

    const loaded = await loadOrganizationClinicSetup(pool, {
      organizationId: clinic.orgId,
      clinicKey: clinic.orgKey,
    });
    assert.equal(loaded.operationsComplete, true);
    assert.equal(itemByKey(loaded, "clinic_profile").complete, true);
    assert.equal(itemByKey(loaded, "primary_facility").complete, true);
    assert.equal(itemByKey(loaded, "departments").complete, true);
    assert.equal(itemByKey(loaded, "administrator").complete, true);
    assert.equal(itemByKey(loaded, "website").classification, SETUP_CLASSIFICATION.RECOMMENDED);
    assert.equal(loaded.complete, true);
  });

  it("profile, primary facility, and department changes update setup state", async () => {
    requireDb();
    const stamp = Date.now().toString(36);
    const clinic = await seedClinic(stamp, "cchg", { withDepartments: false });
    await seedStaff(clinic, { roleKey: ORGANIZATION_ADMIN });

    let state = await loadOrganizationClinicSetup(pool, {
      organizationId: clinic.orgId,
      clinicKey: clinic.orgKey,
    });
    assert.equal(itemByKey(state, "departments").complete, false);
    assert.equal(state.operationsComplete, false);

    await ensureDefaultDepartments(pool, {
      organizationId: clinic.orgId,
      healthcareOrganizationId: clinic.hcoId,
      facilityId: clinic.facility.id,
    });
    state = await loadOrganizationClinicSetup(pool, {
      organizationId: clinic.orgId,
      clinicKey: clinic.orgKey,
    });
    assert.equal(itemByKey(state, "departments").complete, true);

    await pool.query(
      `UPDATE activeclinic.healthcare_organizations
          SET timezone = 'Not/AValidZone'
        WHERE id = $1`,
      [clinic.hcoId]
    );
    state = await loadOrganizationClinicSetup(pool, {
      organizationId: clinic.orgId,
      clinicKey: clinic.orgKey,
    });
    assert.equal(itemByKey(state, "clinic_profile").complete, false);

    await updateHealthcareOrganization(pool, {
      id: clinic.hcoId,
      organizationId: clinic.orgId,
      patch: { timezone: "Africa/Lusaka" },
    });

    await pool.query(
      `UPDATE activeclinic.facilities SET is_primary = false WHERE id = $1`,
      [clinic.facility.id]
    );
    state = await loadOrganizationClinicSetup(pool, {
      organizationId: clinic.orgId,
      clinicKey: clinic.orgKey,
    });
    assert.equal(itemByKey(state, "primary_facility").complete, false);
  });

  it("public hours remain recommended and additional staff follows the existing extra-staff rule", async () => {
    requireDb();
    const stamp = Date.now().toString(36);
    const clinic = await seedClinic(stamp, "chrs");
    await seedStaff(clinic, { roleKey: ORGANIZATION_ADMIN, firstName: "One" });

    let state = await loadOrganizationClinicSetup(pool, {
      organizationId: clinic.orgId,
      clinicKey: clinic.orgKey,
    });
    assert.equal(itemByKey(state, "public_hours").classification, SETUP_CLASSIFICATION.RECOMMENDED);
    assert.equal(itemByKey(state, "public_hours").complete, false);
    assert.equal(itemByKey(state, "additional_staff").complete, false);
    assert.equal(state.operationsComplete, true);

    await pool.query(
      `UPDATE activeclinic.facilities
          SET public_hours_json = $2::jsonb
        WHERE id = $1`,
      [clinic.facility.id, JSON.stringify({ monday: "08:00-17:00" })]
    );
    await seedStaff(clinic, {
      roleKey: RECEPTIONIST,
      firstName: "Rec",
      lastName: "Desk",
      jobTitle: "Receptionist",
    });
    state = await loadOrganizationClinicSetup(pool, {
      organizationId: clinic.orgId,
      clinicKey: clinic.orgKey,
    });
    assert.equal(itemByKey(state, "public_hours").complete, true);
    assert.equal(itemByKey(state, "additional_staff").complete, true);
  });

  it("a secondary incomplete facility does not make organization setup incomplete", async () => {
    requireDb();
    const stamp = Date.now().toString(36);
    const clinic = await seedClinic(stamp, "cmult");
    await seedStaff(clinic, { roleKey: ORGANIZATION_ADMIN });

    const extra = await createFacility(pool, {
      organizationId: clinic.orgId,
      healthcareOrganizationId: clinic.hcoId,
      facilityKey: `cmult-branch-${stamp}`.slice(0, 64),
      displayName: "Incomplete Branch",
      facilityType: "clinic",
      status: "active",
      isPrimary: false,
      countryCode: "ZM",
      timezone: "Africa/Lusaka",
      phone: nextPhone(),
      city: "Ndola",
    });
    assert.equal(extra.ok, true, JSON.stringify(extra));
    const inactive = await createFacility(pool, {
      organizationId: clinic.orgId,
      healthcareOrganizationId: clinic.hcoId,
      facilityKey: `cmult-old-${stamp}`.slice(0, 64),
      displayName: "Inactive Wing",
      facilityType: "clinic",
      status: "inactive",
      isPrimary: false,
      countryCode: "ZM",
      timezone: "Africa/Lusaka",
      phone: nextPhone(),
      city: "Kitwe",
    });
    assert.equal(inactive.ok, true, JSON.stringify(inactive));

    const state = await loadOrganizationClinicSetup(pool, {
      organizationId: clinic.orgId,
      clinicKey: clinic.orgKey,
    });
    assert.equal(itemByKey(state, "primary_facility").complete, true);
    assert.equal(itemByKey(state, "departments").complete, true);
    assert.equal(itemByKey(state, "departments").facilityContext.facilityKey, clinic.facility.facilityKey);
    assert.equal(state.operationsComplete, true);
  });

  it("unauthorized operational roles do not see admin setup actions on /app", async () => {
    requireDb();
    const stamp = Date.now().toString(36);
    const clinic = await seedClinic(stamp, "crole");
    await seedStaff(clinic, { roleKey: ORGANIZATION_ADMIN, firstName: "Boss" });
    const app = makeApp();

    const roles = [
      { roleKey: RECEPTIONIST, firstName: "R" },
      { roleKey: CLINICIAN, firstName: "C" },
      { roleKey: NURSE, firstName: "N" },
      { roleKey: PHARMACIST, firstName: "P" },
      { roleKey: LAB_TECHNICIAN, firstName: "L" },
      { roleKey: RADIOLOGY_STAFF, firstName: "X" },
      { roleKey: CASHIER, firstName: "K" },
    ];
    for (const role of roles) {
      const member = await seedStaff(clinic, {
        roleKey: role.roleKey,
        firstName: role.firstName,
        lastName: "Ops",
        jobTitle: role.roleKey,
      });
      const { cookie } = await sessionCookie(member.identity.id, clinic.orgId);
      const home = await request(app).get("/app").set("Cookie", cookie);
      assert.equal(home.status, 200, role.roleKey);
      assert.doesNotMatch(home.text, /data-ac-dashboard-card="clinic-setup"/, role.roleKey);
      assert.doesNotMatch(home.text, /\/app\/staff\/invite/, role.roleKey);
      assert.match(home.text, /data-ac-dashboard-tile=/, role.roleKey);
    }

    const manager = await seedStaff(clinic, {
      roleKey: CLINIC_MANAGER,
      firstName: "Mgr",
      lastName: "Lead",
      jobTitle: "Clinic manager",
    });
    const { cookie: managerCookie } = await sessionCookie(manager.identity.id, clinic.orgId);
    const managerHome = await request(app).get("/app").set("Cookie", managerCookie);
    assert.equal(managerHome.status, 200);
    assert.doesNotMatch(managerHome.text, /\/app\/settings\/organization/);
    assert.doesNotMatch(managerHome.text, /website_edit=1/);
  });

  it("completed required setup no longer dominates the dashboard", async () => {
    requireDb();
    const stamp = Date.now().toString(36);
    const clinic = await seedClinic(stamp, "cdone");
    const admin = await seedStaff(clinic, { roleKey: ORGANIZATION_ADMIN });
    await seedStaff(clinic, {
      roleKey: RECEPTIONIST,
      firstName: "Extra",
      lastName: "Staff",
      jobTitle: "Receptionist",
    });
    await pool.query(
      `UPDATE activeclinic.facilities
          SET public_hours_json = $2::jsonb
        WHERE id = $1`,
      [clinic.facility.id, JSON.stringify({ monday: "08:00-17:00" })]
    );
    await pool.query(
      `UPDATE activeclinic.healthcare_organizations
          SET website_published = true
        WHERE id = $1`,
      [clinic.hcoId]
    );

    const dash = await loadActiveClinicDashboardHome(pool, {
      auth: {
        organization: { id: clinic.orgId, key: clinic.orgKey, displayName: "Done Clinic" },
        healthcareOrganization: clinic.hco,
        staffMember: admin.staff,
        permissions: ADMIN_PERMS,
        isNetworkAdmin: true,
        roleAssignments: [{ roleDisplayName: "Organization administrator" }],
      },
      shell: {
        selectedFacility: {
          id: clinic.facility.id,
          displayName: clinic.facility.displayName,
        },
        permissions: ADMIN_PERMS,
        availableFacilities: [clinic.facility],
      },
    });
    assert.ok(
      dash.clinicSetup.presentation === "complete" ||
        dash.clinicSetup.presentation === "recommended"
    );
    assert.notEqual(dash.clinicSetup.presentation, "incomplete");
    assert.ok(dash.authorizedTiles.length > 0);
    assert.ok(dash.sections.some((section) => section.key === "administration"));
  });
});
