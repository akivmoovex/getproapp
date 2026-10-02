"use strict";

/**
 * MF05 clinic onboarding chrome on the existing /app/onboarding engine.
 * Completion is derived from live clinic configuration.
 */

const { describe, it, before, after } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
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
} = require("../src/activeclinic/services/healthcareOrganizationService");
const { createFacility } = require("../src/activeclinic/services/facilityService");
const { createStaffMember } = require("../src/activeclinic/services/activeClinicStaffService");
const {
  assignStaffToFacility,
} = require("../src/activeclinic/services/activeClinicStaffFacilityService");
const {
  assignStaffRole,
  ORGANIZATION_ADMIN,
  RECEPTIONIST,
} = require("../src/activeclinic/services/activeClinicAuthorizationService");
const { ensureDefaultDepartments } = require("../src/activeclinic/services/activeClinicDepartmentService");
const {
  SETUP_CLASSIFICATION,
  calculateOrganizationSetupState,
  loadOrganizationClinicSetup,
} = require("../src/activeclinic/services/loadActiveClinicSettingsScreens");
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

const ROOT = path.join(__dirname, "..");
let pool;
let skipReason = null;
let phoneSeq = 890000000;

function nextPhone() {
  phoneSeq += 1;
  return `+2609${String(phoneSeq).slice(-8)}`;
}

function itemByKey(setup, key) {
  const items = (setup && setup.items) || [];
  return items.find((item) => item.key === key) || null;
}

function requireDb() {
  if (skipReason) assert.fail(`Local PostgreSQL unavailable: ${skipReason}`);
}

describe("ActiveClinic MF05 onboarding chrome", () => {
  before(async () => {
    resetDeploymentProfileWarningsForTests();
    try {
      const databaseUrl = await resetFoundationDatabase();
      pool = createFoundationPool(databaseUrl);
      await migrate({ connectionString: databaseUrl });
    } catch (err) {
      skipReason = err && err.message ? String(err.message) : String(err);
    }
  });

  after(async () => {
    if (pool) await pool.end().catch(() => {});
  });

  it("template and CSS expose MF05 progress semantics without Stitch-only tasks", () => {
    const tpl = fs.readFileSync(
      path.join(ROOT, "views/activeclinic/app/onboarding-content.ejs"),
      "utf8"
    );
    const css = fs.readFileSync(path.join(ROOT, "public/activeclinic/ac-app.css"), "utf8");
    assert.match(tpl, /data-ac-mf-family="MF05"/);
    assert.match(tpl, /Welcome to ActiveClinic|Your clinic workspace is ready/);
    assert.match(tpl, /role="progressbar"/);
    assert.match(tpl, /unpublished/);
    assert.doesNotMatch(tpl, /HIPAA|Theme customization|Add services/);
    assert.match(css, /\.ac-onboarding-mf/);
    assert.match(css, /@media \(max-width: 390px\)/);
    assert.doesNotMatch(css, /body\.church-body--apex \.ac-onboarding-mf/);
  });

  it("fresh provisioned clinic treats auto-created resources as complete and website as recommended", () => {
    const state = calculateOrganizationSetupState({
      healthcareOrganization: {
        publicName: "Lakeside",
        legalName: "Lakeside Ltd",
        countryCode: "ZM",
        timezone: "Africa/Lusaka",
        organizationType: "private_healthcare",
      },
      primaryFacility: {
        id: "11111111-1111-4111-8111-111111111111",
        operational: true,
        phoneDisplay: "+260955000000",
        facilityKey: "hq",
        href: "/app/facilities/hq",
        publicHoursJson: null,
      },
      hasActiveAdministrator: true,
      primaryDepartments: [{ status: "active", departmentType: "reception" }],
      staffCounts: { active: 1, invited: 0 },
      website: {
        provisioned: true,
        published: false,
        latestSubmissionStatus: null,
        clinicKey: "lakeside",
      },
    });
    assert.equal(state.operationsComplete, true);
    assert.equal(itemByKey(state, "clinic_profile").label, "Review clinic details");
    assert.equal(itemByKey(state, "departments").complete, true);
    assert.equal(itemByKey(state, "departments").label, "Review departments");
    assert.equal(itemByKey(state, "additional_staff").complete, false);
    assert.equal(itemByKey(state, "additional_staff").classification, SETUP_CLASSIFICATION.RECOMMENDED);
    assert.equal(itemByKey(state, "website").complete, false);
    assert.equal(itemByKey(state, "website").label, "Customize your website");
    assert.equal(itemByKey(state, "website").destinationUrl, "/app/settings/website");
    assert.equal(itemByKey(state, "website").classification, SETUP_CLASSIFICATION.RECOMMENDED);
    assert.equal(itemByKey(state, "public_hours").classification, SETUP_CLASSIFICATION.RECOMMENDED);
    assert.ok(!state.items.some((item) => item.key === "services" || item.key === "theme"));
  });

  it("GET /app/onboarding stays available after required setup and reflects live department/staff state", async () => {
    requireDb();
    const stamp = Date.now().toString(36);
    const org = await provisionPlatformTenant(pool, {
      skipDomain: true,
      dataEnvironment: "testing",
      organizationKey: `mf05_${stamp}`,
      displayName: "MF05 Clinic",
      productKey: "activeclinic",
      productTenantKey: `mf05-${stamp}`,
      deploymentCode: CODE_ACTIVECLINIC_ORG_V6,
    });
    assert.equal(org.ok, true, JSON.stringify(org));
    const hco = await createHealthcareOrganization(pool, {
      organizationId: org.records.organization.id,
      legalName: "MF05 Legal",
      publicName: "MF05 Clinic",
      organizationType: "private_healthcare",
      countryCode: "ZM",
      timezone: "Africa/Lusaka",
    });
    const facility = await createFacility(pool, {
      organizationId: org.records.organization.id,
      healthcareOrganizationId: hco.healthcareOrganization.id,
      facilityKey: `mf05-hq-${stamp}`,
      displayName: "HQ",
      facilityType: "clinic",
      status: "active",
      isPrimary: true,
      countryCode: "ZM",
      timezone: "Africa/Lusaka",
      phone: nextPhone(),
      city: "Lusaka",
    });
    await ensureDefaultDepartments(pool, {
      organizationId: org.records.organization.id,
      healthcareOrganizationId: hco.healthcareOrganization.id,
      facilityId: facility.facility.id,
    });
    const phone = nextPhone();
    const identity = await createPlatformIdentity(pool, {
      primaryPhone: phone,
      phoneNormalized: phone,
      phoneVerifiedAt: new Date().toISOString(),
    });
    await setPlatformIdentityPassword(pool, {
      identityId: identity.identity.id,
      password: PASSWORD,
    });
    const staff = await createStaffMember(pool, {
      organizationId: org.records.organization.id,
      healthcareOrganizationId: hco.healthcareOrganization.id,
      firstName: "Ada",
      lastName: "Admin",
      employmentType: "permanent",
      phone,
      status: "active",
      platformIdentityId: identity.identity.id,
      jobTitle: "Administrator",
    });
    await assignStaffToFacility(pool, {
      organizationId: org.records.organization.id,
      staffMemberId: staff.staffMember.id,
      facilityId: facility.facility.id,
      isPrimary: true,
    });
    await assignStaffRole(pool, {
      organizationId: org.records.organization.id,
      staffMemberId: staff.staffMember.id,
      roleKey: ORGANIZATION_ADMIN,
      scopeType: "organisation",
    });

    const app = createActiveClinicFoundationApp({
      getPool: () => pool,
      env: MINIMAL_AC,
      log: () => {},
    });
    const session = await createPlatformIdentitySession(pool, {
      deploymentCode: CODE_ACTIVECLINIC_ORG_V6,
      platformIdentityId: identity.identity.id,
      organizationId: org.records.organization.id,
    });
    const cookie = `${COOKIE_ACTIVECLINIC_ORG}=${session.rawToken}`;

    const home = await request(app).get("/app").set("Cookie", cookie);
    assert.equal(home.status, 200);
    assert.match(home.text, /Open setup checklist|\/app\/onboarding/);

    const page = await request(app).get("/app/onboarding").set("Cookie", cookie);
    assert.equal(page.status, 200);
    assert.match(page.text, /data-ac-mf-family="MF05"/);
    assert.match(page.text, /Welcome to ActiveClinic/);
    assert.match(page.text, /data-ac-onboarding-step="departments"/);
    assert.match(page.text, /Review departments/);
    assert.match(page.text, /data-ac-onboarding-complete="1"/);
    assert.match(page.text, /Customize your website/);
    assert.match(page.text, /href="\/app\/settings\/website"/);
    assert.match(page.text, /Invite staff/);
    assert.doesNotMatch(page.text, /HIPAA|Add services|Theme customization|License ID/);
    assert.doesNotMatch(page.text, /Create departments|Set up clinic website/);

    let state = await loadOrganizationClinicSetup(pool, {
      organizationId: org.records.organization.id,
    });
    assert.equal(itemByKey(state, "additional_staff").complete, false);
    assert.equal(itemByKey(state, "public_hours").complete, false);

    await pool.query(
      `UPDATE activeclinic.facilities SET public_hours_json = $2::jsonb WHERE id = $1`,
      [facility.facility.id, JSON.stringify({ monday: "08:00-17:00" })]
    );
    const extraPhone = nextPhone();
    const extraId = await createPlatformIdentity(pool, {
      primaryPhone: extraPhone,
      phoneNormalized: extraPhone,
      phoneVerifiedAt: new Date().toISOString(),
    });
    const extraStaff = await createStaffMember(pool, {
      organizationId: org.records.organization.id,
      healthcareOrganizationId: hco.healthcareOrganization.id,
      firstName: "Rec",
      lastName: "Desk",
      employmentType: "permanent",
      phone: extraPhone,
      status: "active",
      platformIdentityId: extraId.identity.id,
      jobTitle: "Receptionist",
    });
    await assignStaffToFacility(pool, {
      organizationId: org.records.organization.id,
      staffMemberId: extraStaff.staffMember.id,
      facilityId: facility.facility.id,
      isPrimary: true,
    });
    await assignStaffRole(pool, {
      organizationId: org.records.organization.id,
      staffMemberId: extraStaff.staffMember.id,
      roleKey: RECEPTIONIST,
      scopeType: "facility",
      facilityId: facility.facility.id,
    });

    state = await loadOrganizationClinicSetup(pool, {
      organizationId: org.records.organization.id,
    });
    assert.equal(itemByKey(state, "public_hours").complete, true);
    assert.equal(itemByKey(state, "additional_staff").complete, true);

    const after = await request(app).get("/app/onboarding").set("Cookie", cookie);
    assert.equal(after.status, 200);
    assert.match(after.text, /data-ac-onboarding-step="public_hours"[^>]*data-ac-onboarding-complete="1"/);
    assert.match(after.text, /data-ac-onboarding-step="additional_staff"[^>]*data-ac-onboarding-complete="1"/);
  });
});
