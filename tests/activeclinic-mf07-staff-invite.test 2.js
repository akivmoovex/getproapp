"use strict";

/**
 * MF07 staff invitation chrome on the existing invite/create flow.
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
  CLINICIAN,
} = require("../src/activeclinic/services/activeClinicAuthorizationService");
const { ensureDefaultDepartments } = require("../src/activeclinic/services/activeClinicDepartmentService");
const {
  loadOrganizationClinicSetup,
} = require("../src/activeclinic/services/loadActiveClinicSettingsScreens");
const {
  liveEmailTransportDecision,
} = require("../src/activeclinic/services/activeClinicEmailDelivery");
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
let phoneSeq = 910000000;

function nextPhone() {
  phoneSeq += 1;
  return `+2609${String(phoneSeq).slice(-8)}`;
}

function requireDb() {
  if (skipReason) assert.fail(`Local PostgreSQL unavailable: ${skipReason}`);
}

describe("ActiveClinic MF07 staff invitation chrome", () => {
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

  it("invite templates keep share-link copy and omit fake send-email CTA", () => {
    const form = fs.readFileSync(path.join(ROOT, "views/activeclinic/app/staff-form-content.ejs"), "utf8");
    const result = fs.readFileSync(
      path.join(ROOT, "views/activeclinic/app/staff-invite-result-content.ejs"),
      "utf8"
    );
    assert.match(form, /data-ac-mf-family="MF07"/);
    assert.match(form, /Create invitation/);
    assert.doesNotMatch(form, /Send Invitation/);
    assert.match(result, /Invitation created/);
    assert.match(result, /Copy invitation link/);
    assert.doesNotMatch(result, /Invitation sent by email/);
    const transport = liveEmailTransportDecision(MINIMAL_AC);
    assert.equal(transport.allowed, false);
  });

  it("authorized GET /app/staff/invite renders the real role catalogue; clinician is denied", async () => {
    requireDb();
    const stamp = Date.now().toString(36);
    const org = await provisionPlatformTenant(pool, {
      skipDomain: true,
      dataEnvironment: "testing",
      organizationKey: `mf07_${stamp}`,
      displayName: "MF07 Clinic",
      productKey: "activeclinic",
      productTenantKey: `mf07-${stamp}`,
      deploymentCode: CODE_ACTIVECLINIC_ORG_V6,
    });
    const hco = await createHealthcareOrganization(pool, {
      organizationId: org.records.organization.id,
      legalName: "MF07 Legal",
      publicName: "MF07 Clinic",
      organizationType: "private_healthcare",
      countryCode: "ZM",
      timezone: "Africa/Lusaka",
    });
    const facility = await createFacility(pool, {
      organizationId: org.records.organization.id,
      healthcareOrganizationId: hco.healthcareOrganization.id,
      facilityKey: `mf07-hq-${stamp}`,
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

    async function makeStaff(roleKey, scopeType) {
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
        firstName: roleKey,
        lastName: "User",
        employmentType: "permanent",
        phone,
        status: "active",
        platformIdentityId: identity.identity.id,
        jobTitle: roleKey,
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
        roleKey,
        scopeType,
        facilityId: scopeType === "facility" ? facility.facility.id : null,
      });
      return identity.identity.id;
    }

    const adminId = await makeStaff(ORGANIZATION_ADMIN, "organisation");
    const clinicianId = await makeStaff(CLINICIAN, "facility");
    const app = createActiveClinicFoundationApp({
      getPool: () => pool,
      env: MINIMAL_AC,
      log: () => {},
    });

    async function cookieFor(identityId) {
      const session = await createPlatformIdentitySession(pool, {
        deploymentCode: CODE_ACTIVECLINIC_ORG_V6,
        platformIdentityId: identityId,
        organizationId: org.records.organization.id,
      });
      return `${COOKIE_ACTIVECLINIC_ORG}=${session.rawToken}`;
    }

    const allowed = await request(app).get("/app/staff/invite").set("Cookie", await cookieFor(adminId));
    assert.equal(allowed.status, 200);
    assert.match(allowed.text, /data-ac-mf-family="MF07"/);
    assert.match(allowed.text, /name="first_name"/);
    assert.match(allowed.text, /name="role_keys"/);
    assert.match(allowed.text, /name="invite_mode"/);
    assert.match(allowed.text, /Create invitation/);
    assert.doesNotMatch(allowed.text, /Send Invitation|Cardiology|WhatsApp API/);

    const denied = await request(app).get("/app/staff/invite").set("Cookie", await cookieFor(clinicianId));
    assert.equal(denied.status, 403);

    const home = await request(app).get("/app").set("Cookie", await cookieFor(adminId));
    assert.equal(home.status, 200);

    const onboard = await request(app).get("/app/onboarding").set("Cookie", await cookieFor(adminId));
    assert.equal(onboard.status, 200);
    assert.match(onboard.text, /\/app\/staff\/invite/);
    const setup = await loadOrganizationClinicSetup(pool, {
      organizationId: org.records.organization.id,
    });
    const staffStep = (setup.items || []).find((item) => item.key === "additional_staff");
    assert.ok(staffStep);
    assert.equal(staffStep.complete, true);
    assert.equal(staffStep.destinationUrl, "/app/staff/invite");
  });
});
