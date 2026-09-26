"use strict";

/**
 * ActiveClinic V2.03 Batch 2 — responsive staff application shell.
 */

const { describe, it, before, after, beforeEach } = require("node:test");
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
  STAFF_ROLE,
  RECEPTIONIST,
} = require("../src/activeclinic/services/activeClinicAuthorizationService");
const {
  buildActiveClinicNavigation,
  buildCheckInShellAction,
  matchActiveNavKey,
  CHECK_IN_HREF,
} = require("../src/activeclinic/services/activeClinicNavigation");
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

let pool;
let databaseUrl;
let skipReason = null;
let phoneSeq = 820000000;

function nextPhone() {
  phoneSeq += 1;
  return `+2609${String(phoneSeq).slice(-8)}`;
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
    publicName: "Batch2 Shell Clinic",
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
    firstName: opts.firstName || "Batch",
    lastName: opts.lastName || "Two",
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
    roleKey: opts.roleKey || STAFF_ROLE,
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

describe("ActiveClinic V2.03 Batch 2 staff shell", () => {
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

  it("navigation helpers expose check-in CTA and mobile bottom tabs from real routes", () => {
    assert.equal(buildCheckInShellAction([]), null);
    assert.equal(buildCheckInShellAction(["activeclinic.access"]), null);
    const checkIn = buildCheckInShellAction([
      "activeclinic.reception.check_in",
    ]);
    assert.equal(checkIn.href, CHECK_IN_HREF);
    assert.equal(checkIn.label, "Check-in Patient");

    const restricted = buildActiveClinicNavigation(
      ["activeclinic.access"],
      "home"
    );
    assert.equal(restricted.checkInAction, null);
    assert.equal(restricted.globalSearchEnabled, false);
    assert.deepEqual(
      restricted.mobileBottom.map((t) => t.key),
      ["home"]
    );
    assert.equal(restricted.mobileBottom[0].href, "/app");

    const authorized = buildActiveClinicNavigation(
      [
        "activeclinic.access",
        "activeclinic.patient.search",
        "activeclinic.appointment.view",
        "activeclinic.encounter.view",
        "activeclinic.reception.check_in",
      ],
      "patients"
    );
    assert.ok(authorized.checkInAction);
    assert.equal(authorized.globalSearchEnabled, true);
    assert.deepEqual(
      authorized.mobileBottom.map((t) => t.key),
      ["home", "patients", "appointments", "clinical"]
    );
    assert.ok(authorized.mobileBottom.find((t) => t.key === "patients").current);
    assert.equal(matchActiveNavKey("/app/services"), "services");
    assert.equal(matchActiveNavKey("/app/practitioners"), "practitioners");
  });

  it("CSS freezes Batch 2 shell dimensions and primary token", () => {
    const css = fs.readFileSync(
      path.join(__dirname, "../public/activeclinic/ac-app.css"),
      "utf8"
    );
    assert.match(css, /--ac-staff-sidebar-w:\s*256px/);
    assert.match(css, /--ac-staff-topbar-h:\s*56px/);
    assert.match(css, /--ac-staff-bottom-nav-h:\s*64px/);
    assert.match(css, /--ac-touch-min:\s*44px/);
    assert.match(css, /--ac-primary:\s*#2563eb/i);
    assert.match(css, /\.ac-staff-bottom-nav/);
  });

  it("authorized role renders desktop shell chrome, search, check-in, and facility context", async () => {
    requireDb();
    const stamp = Date.now().toString(36);
    const ac = await seedAcTenant(stamp, "b2auth");
    const admin = await seedStaff(ac, {
      firstName: "Auth",
      lastName: "Admin",
      roleKey: NETWORK_ADMIN,
    });
    const app = createActiveClinicFoundationApp({
      getPool: () => pool,
      env: MINIMAL_AC,
      log: () => {},
    });
    const cookie = await sessionCookie(admin.identity.id, ac.orgId, ac.facilityId);
    const home = await request(app).get("/app").set("Cookie", cookie);
    assert.equal(home.status, 200);
    assert.match(home.text, /data-ac-shell="staff-app"/);
    assert.match(home.text, /data-ac-shell-version="b2"/);
    assert.match(home.text, /data-ac-shell-batch="2"/);
    assert.match(home.text, /data-ac-composition="desktop-shell"/);
    assert.match(home.text, /data-ac-composition="desktop-topbar"/);
    assert.match(home.text, /data-ac-nav="desktop-sidebar"/);
    assert.match(home.text, /gp-ops-shared\.css/);
    assert.match(home.text, /data-ac-shell-search="1"/);
    assert.match(home.text, /action="\/app\/patients"/);
    assert.match(home.text, /data-ac-shell-notifications="1"/);
    // Network admin has patient.search + reception.view but not reception.check_in.
    assert.doesNotMatch(home.text, /data-ac-shell-checkin="1"/);
    assert.match(home.text, /Batch2 Shell Clinic/);
    assert.match(home.text, /Main Facility|data-ac-facility-context/);
    assert.match(home.text, /data-ac-nav-key="home"/);
    assert.match(home.text, /aria-current="page"/);
    assert.match(home.text, /data-ac-nav="mobile-bottom"/);
    assert.match(home.text, /data-ac-mobile-tab="more"/);
    assert.doesNotMatch(home.text, /href="#overview"|href="#queue"|href="#appts"/);
  });

  it("restricted role hides check-in and unauthorized modules; bottom tabs stay real routes", async () => {
    requireDb();
    const stamp = Date.now().toString(36);
    const ac = await seedAcTenant(stamp, "b2rest");
    const staff = await seedStaff(ac, {
      firstName: "Restricted",
      lastName: "Staff",
      roleKey: STAFF_ROLE,
    });
    const app = createActiveClinicFoundationApp({
      getPool: () => pool,
      env: MINIMAL_AC,
      log: () => {},
    });
    const cookie = await sessionCookie(staff.identity.id, ac.orgId, ac.facilityId);
    const home = await request(app).get("/app").set("Cookie", cookie);
    assert.equal(home.status, 200);
    assert.doesNotMatch(home.text, /data-ac-shell-checkin="1"/);
    assert.doesNotMatch(home.text, /data-ac-shell-search="1"/);
    assert.doesNotMatch(home.text, /data-ac-nav-key="access"/);
    assert.doesNotMatch(home.text, /data-ac-nav-key="billing"/);
    assert.match(home.text, /data-ac-nav-key="home"/);
    assert.match(home.text, /data-ac-nav-key="settings"/);
    assert.match(home.text, /data-ac-mobile-tab="more"/);

    const deniedCheckIn = await request(app)
      .get("/app/reception/check-in")
      .set("Cookie", cookie);
    assert.equal(deniedCheckIn.status, 403);
  });

  it("receptionist keeps check-in CTA and patient search presentation", async () => {
    requireDb();
    const stamp = Date.now().toString(36);
    const ac = await seedAcTenant(stamp, "b2rec");
    const reception = await seedStaff(ac, {
      firstName: "Front",
      lastName: "Desk",
      roleKey: RECEPTIONIST,
      scopeType: "facility",
    });
    const app = createActiveClinicFoundationApp({
      getPool: () => pool,
      env: MINIMAL_AC,
      log: () => {},
    });
    const cookie = await sessionCookie(reception.identity.id, ac.orgId, ac.facilityId);
    const home = await request(app).get("/app").set("Cookie", cookie);
    assert.equal(home.status, 200);
    assert.match(home.text, /data-ac-shell-checkin="1"/);
    assert.match(home.text, /href="\/app\/reception\/check-in"/);
    assert.match(home.text, /Check-in Patient/);
    assert.match(home.text, /data-ac-shell-search="1"/);
    assert.match(home.text, /data-ac-nav-key="patients"/);
    assert.match(home.text, /data-ac-nav-key="reception"/);
    assert.doesNotMatch(home.text, /data-ac-nav-key="pharmacy"/);
  });
});
