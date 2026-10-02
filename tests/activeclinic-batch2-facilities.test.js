"use strict";

/**
 * ActiveClinic V2.03 Batch 2 — AC-B2-10 Departments & Facilities.
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
  CLINIC_MANAGER,
  FACILITY_ADMIN,
  RECEPTIONIST,
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
  resetDeploymentProfileWarningsForTests,
} = require("../src/platform/config/deploymentProfiles");
const {
  STITCH_GAPS,
} = require("../src/activeclinic/services/loadActiveClinicDepartmentsSettingsScreen");

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
let phoneSeq = 870000000;

function nextPhone() {
  phoneSeq += 1;
  return `+2609${String(phoneSeq).slice(-8)}`;
}

function requireDb() {
  if (skipReason) assert.fail(`Local PostgreSQL unavailable: ${skipReason}`);
}

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), "utf8");
}

async function seedTenant(stamp, keyPrefix) {
  const org = await provisionPlatformTenant(pool, {
    skipDomain: true,
    dataEnvironment: "testing",
    organizationKey: `${keyPrefix}_${stamp}`,
    displayName: `AC ${keyPrefix}`,
    productKey: "activeclinic",
    productTenantKey: `${keyPrefix}-${stamp}`,
    deploymentCode: CODE_ACTIVECLINIC_ORG_V6,
  });
  assert.equal(org.ok, true, JSON.stringify(org));
  const hco = await createHealthcareOrganization(pool, {
    organizationId: org.records.organization.id,
    legalName: "Legal Facilities",
    publicName: "Facilities Clinic",
    organizationType: "private_healthcare",
    countryCode: "ZM",
    timezone: "Africa/Lusaka",
  });
  assert.equal(hco.ok, true);
  const facility = await createFacility(pool, {
    organizationId: org.records.organization.id,
    healthcareOrganizationId: hco.healthcareOrganization.id,
    facilityKey: "main",
    displayName: "Main Campus",
    facilityType: "clinic",
    status: "active",
    isPrimary: true,
    countryCode: "ZM",
    timezone: "Africa/Lusaka",
    phone: nextPhone(),
    city: "Lusaka",
  });
  assert.equal(facility.ok, true);
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

async function seedRole(ac, opts) {
  const phone = nextPhone();
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
    firstName: opts.firstName || "Ops",
    lastName: opts.lastName || "Admin",
    employmentType: "permanent",
    status: "active",
    phone,
    platformIdentityId: identity.identity.id,
    jobTitle: opts.jobTitle || "Admin",
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
    roleKey: opts.roleKey,
    scopeType: "facility",
    facilityId: ac.facilityId,
  });
  return { identityId: identity.identity.id, staffId: staff.staffMember.id };
}

async function sessionCookie(identityId, orgId, facilityId) {
  const session = await createPlatformIdentitySession(pool, {
    deploymentCode: CODE_ACTIVECLINIC_ORG_V6,
    platformIdentityId: identityId,
    organizationId: orgId,
    contextJson: { selectedFacilityId: facilityId },
  });
  assert.equal(session.ok, true, JSON.stringify(session));
  return `${COOKIE_ACTIVECLINIC_ORG}=${session.rawToken}`;
}

describe("ActiveClinic V2.03 Batch 2 facilities & departments (AC-B2-10)", () => {
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

  it("ships B2-10 stitch markers, gp-ops chrome, drawers, and documented gaps", () => {
    const dept = read("views/activeclinic/app/settings-departments-content.ejs");
    assert.match(dept, /data-ac-stitch="AC-B2-10"/);
    assert.match(dept, /fb88329aa6af454a8e7b6675c6070b78/);
    assert.match(dept, /4c70614fd2534fa3a5baee0f61f1f964/);
    assert.match(dept, /ac-facility-switcher|data-ac-facility-switcher/);
    assert.match(dept, /gp-ops-filter-bar|gp-ops-status-badge/);
    assert.match(dept, /ac-dept-cards|ac-ops-queue__mobile/);
    assert.match(dept, /ac-form-drawer|ac-dept-add-drawer/);
    assert.match(dept, /data-ac-gap="department-lead"/);
    assert.match(dept, /data-ac-stitch-gaps/);
    assert.doesNotMatch(dept, /Exam \/ Consultation Rooms|38 Exam|DPT-CLN-01/);

    const facil = read("views/activeclinic/app/facilities-list-content.ejs");
    assert.match(facil, /data-ac-stitch="AC-B2-10"/);
    assert.match(facil, /gp-ops-filter-bar/);
    assert.match(facil, /ac-ops-queue__mobile|data-ac-cards="facilities"/);
    assert.match(facil, /Departments/);

    const css = read("public/activeclinic/ac-app.css");
    assert.match(css, /AC-B2-10 Departments/);
    assert.match(css, /@media \(max-width: 390px\)[\s\S]*\.ac-facilities-workspace--b2/);

    assert.ok(Array.isArray(STITCH_GAPS) && STITCH_GAPS.length >= 3);
    assert.ok(STITCH_GAPS.some((g) => g.key === "department_lead"));
    assert.ok(STITCH_GAPS.some((g) => g.key === "department_room_counts"));
  });

  it("clinic_manager and facility_admin can open workspace; receptionist denied departments", async () => {
    requireDb();
    const stamp = Date.now().toString(36);
    const ac = await seedTenant(stamp, "b210");
    const manager = await seedRole(ac, {
      firstName: "Clinic",
      lastName: "Manager",
      roleKey: CLINIC_MANAGER,
    });
    const admin = await seedRole(ac, {
      firstName: "Facility",
      lastName: "Admin",
      roleKey: FACILITY_ADMIN,
    });
    const denied = await seedRole(ac, {
      firstName: "Front",
      lastName: "Desk",
      roleKey: RECEPTIONIST,
    });

    const app = createActiveClinicFoundationApp({
      getPool: () => pool,
      env: MINIMAL_AC,
      log: () => {},
    });
    const mgrCookie = await sessionCookie(manager.identityId, ac.orgId, ac.facilityId);
    const adminCookie = await sessionCookie(admin.identityId, ac.orgId, ac.facilityId);
    const deniedCookie = await sessionCookie(denied.identityId, ac.orgId, ac.facilityId);

    const deptMgr = await request(app)
      .get("/app/settings/clinic-setup/departments")
      .set("Cookie", mgrCookie);
    assert.equal(deptMgr.status, 200);
    assert.match(deptMgr.text, /data-ac-stitch="AC-B2-10"/);
    assert.match(deptMgr.text, /fb88329aa6af454a8e7b6675c6070b78/);
    assert.match(deptMgr.text, /data-ac-facility-switcher|ac-facility-switcher/);
    assert.match(deptMgr.text, /data-ac-dept-metrics|Configured departments/);
    assert.match(deptMgr.text, /gp-ops-filter-bar|data-gp-ops="filter-bar"/);
    assert.match(deptMgr.text, /Add department|ac-dept-add-drawer/);
    assert.match(deptMgr.text, /data-ac-gap="department-lead"/);
    assert.match(deptMgr.text, /ac-dept-cards|ac-ops-queue__mobile/);
    assert.doesNotMatch(deptMgr.text, /38 Exam|Operating Units/);

    const deptAdmin = await request(app)
      .get(`/app/settings/clinic-setup/departments?facility=${ac.facilityId}`)
      .set("Cookie", adminCookie);
    assert.equal(deptAdmin.status, 200);
    assert.match(deptAdmin.text, /data-ac-stitch="AC-B2-10"/);
    assert.match(deptAdmin.text, /is-active/);

    const facilMgr = await request(app).get("/app/facilities").set("Cookie", mgrCookie);
    assert.equal(facilMgr.status, 200);
    assert.match(facilMgr.text, /data-ac-stitch="AC-B2-10"/);
    assert.match(facilMgr.text, /data-ac-facility-metrics|Facilities/);
    assert.match(facilMgr.text, /Main Campus/);

    const facilAdmin = await request(app).get("/app/facilities").set("Cookie", adminCookie);
    assert.equal(facilAdmin.status, 200);
    assert.match(facilAdmin.text, /Departments/);

    assert.equal(
      (
        await request(app)
          .get("/app/settings/clinic-setup/departments")
          .set("Cookie", deniedCookie)
      ).status,
      403
    );

    // Receptionist may still view facilities (facility.view) but not manage departments.
    const facilDenied = await request(app)
      .get("/app/facilities")
      .set("Cookie", deniedCookie);
    assert.ok([200, 403].includes(facilDenied.status));
    if (facilDenied.status === 200) {
      assert.doesNotMatch(facilDenied.text, /ac-dept-add-drawer/);
    }
  });
});
