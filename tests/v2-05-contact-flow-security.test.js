"use strict";

/**
 * V2.05 Contact Flow Security Tests
 *
 * Rigorous tenant isolation and RBAC boundary tests for:
 *   - AC clinic contact inquiries (tenant-scoped via /app/operations/contact-inquiries)
 *   - AC platform contact inquiries (apex-scoped via /admin/activeclinic/contact-inquiries)
 *   - BB branch/HQ contact submissions (tenant-scoped via /branch-admin|/hq/contact-submissions)
 *   - GUI: senderName type=text validation
 */

const { describe, it, before, after } = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("fs");
const path = require("path");
const request = require("supertest");

const {
  resetFoundationDatabase,
  createFoundationPool,
} = require("./helpers/foundationDb");
const { migrate } = require("../db/scripts/lib/migrator");
const { ensureDatabaseIdentity } = require("../db/scripts/lib/databaseIdentity");
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
  createStaffMember,
} = require("../src/activeclinic/services/activeClinicStaffService");
const {
  assignStaffToFacility,
} = require("../src/activeclinic/services/activeClinicStaffFacilityService");
const {
  assignStaffRole,
  RECEPTIONIST,
  ORGANIZATION_ADMIN,
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
const { createV5FoundationApp } = require("../src/platform/http/v5FoundationServer");
const { DEFAULT_V5_COOKIE } = require("../src/platform/session/v5SessionCookie");
const { createV5Session } = require("../src/platform/session/createV5Session");
const { ENV_KEY } = require("../src/blessboard/config/instantFreeProvisioningEnabled");
const {
  provisionBlessBoardChurch,
} = require("../src/blessboard/services/provisionBlessBoardChurch");
const {
  createBlessBoardUser,
} = require("../src/blessboard/services/createBlessBoardUser");
const {
  assignBlessBoardRole,
} = require("../src/blessboard/services/assignBlessBoardRole");
const {
  createBlessBoardBranch,
} = require("../src/blessboard/services/createBlessBoardBranch");
const {
  createPublicContactSubmission,
} = require("../src/blessboard/repositories/publicContactSubmissionsRepository");
const {
  assignOrganizationPlan,
} = require("../src/platform/services/entitlementService");

const IDENTITY_KEY = "v205-contact-flow-security";
const PASSWORD = "ContactFlow-Security-99!";
const AC_HOST = "activeclinic.org";
const BB_APEX = "blessboard.org";

const MINIMAL_AC = Object.freeze({
  NODE_ENV: "test",
  PLATFORM_DEPLOYMENT_CODE: CODE_ACTIVECLINIC_ORG_V6,
  SESSION_SECRET: "a".repeat(48),
});

const MINIMAL_BB = Object.freeze({
  NODE_ENV: "test",
  DEPLOYMENT_ENV: "testing",
  PLATFORM_DEPLOYMENT_CODE: "blessboard-org-staging",
  SESSION_SECRET: "test-session-secret-at-least-32-chars!!",
  SESSION_COOKIE_NAME: DEFAULT_V5_COOKIE,
  BLESSBOARD_TENANT_ROUTING_MODE: "authoritative",
  BLESSBOARD_AUTHORITATIVE_HOST_ALLOWLIST: "*",
  [ENV_KEY]: "1",
});

let pool;
let skipReason = null;
let phoneSeq = 970000000;
let acApp = null;
let bbApp = null;

function requireDb() {
  if (skipReason) assert.fail(`Local PostgreSQL unavailable: ${skipReason}`);
}

function uniq(prefix) {
  return `${prefix}${crypto.randomBytes(3).toString("hex")}`.slice(0, 24);
}

function nextPhone() {
  phoneSeq += 1;
  return `+2609${String(phoneSeq).slice(-8)}`;
}

function getAcApp() {
  if (!acApp) {
    acApp = createActiveClinicFoundationApp({
      getPool: () => pool,
      env: MINIMAL_AC,
    });
  }
  return acApp;
}

function getBbApp() {
  if (!bbApp) {
    bbApp = createV5FoundationApp({
      env: MINIMAL_BB,
      getPool: () => pool,
    });
  }
  return bbApp;
}

async function createAcClinic(stamp) {
  const orgKey = `ac${stamp}`.slice(0, 24);
  const tenant = await provisionPlatformTenant(pool, {
    skipDomain: true,
    dataEnvironment: "testing",
    organizationKey: orgKey,
    displayName: `AC Clinic ${stamp}`,
    productKey: "activeclinic",
    productTenantKey: `ac${stamp}`,
    deploymentCode: CODE_ACTIVECLINIC_ORG_V6,
  });
  assert.equal(tenant.ok, true, JSON.stringify(tenant));

  const hco = await createHealthcareOrganization(pool, {
    organizationId: tenant.records.organization.id,
    legalName: `${stamp} Legal`,
    publicName: `${stamp} Clinic`,
    organizationType: "private_healthcare",
    countryCode: "ZM",
    timezone: "Africa/Lusaka",
  });
  assert.equal(hco.ok, true, JSON.stringify(hco));

  const facility = await createFacility(pool, {
    organizationId: tenant.records.organization.id,
    healthcareOrganizationId: hco.healthcareOrganization.id,
    facilityKey: `f${stamp}`,
    displayName: "Main Facility",
    facilityType: "clinic",
    status: "active",
    isPrimary: true,
    countryCode: "ZM",
    timezone: "Africa/Lusaka",
    phone: nextPhone(),
  });
  assert.equal(facility.ok, true, JSON.stringify(facility));

  const phone = nextPhone();
  const identity = await createPlatformIdentity(pool, {
    primaryEmail: `admin${stamp}@test.local`,
    primaryPhone: phone,
    phoneNormalized: phone,
    phoneVerifiedAt: new Date().toISOString(),
  });
  await setPlatformIdentityPassword(pool, {
    identityId: identity.identity.id,
    password: PASSWORD,
  });

  const staff = await createStaffMember(pool, {
    organizationId: tenant.records.organization.id,
    healthcareOrganizationId: hco.healthcareOrganization.id,
    firstName: "Admin",
    lastName: stamp,
    employmentType: "permanent",
    status: "active",
    phone,
    platformIdentityId: identity.identity.id,
    jobTitle: "Admin",
  });
  assert.equal(staff.ok, true, JSON.stringify(staff));

  await assignStaffToFacility(pool, {
    organizationId: tenant.records.organization.id,
    staffMemberId: staff.staffMember.id,
    facilityId: facility.facility.id,
    isPrimary: true,
  });

  await assignStaffRole(pool, {
    organizationId: tenant.records.organization.id,
    staffMemberId: staff.staffMember.id,
    roleKey: ORGANIZATION_ADMIN,
    scopeType: "organisation",
    assignmentOrigin: "system",
    deploymentCode: CODE_ACTIVECLINIC_ORG_V6,
  });

  const session = await createPlatformIdentitySession(pool, {
    deploymentCode: CODE_ACTIVECLINIC_ORG_V6,
    platformIdentityId: identity.identity.id,
    organizationId: tenant.records.organization.id,
    contextJson: { selectedFacilityId: facility.facility.id },
  });
  assert.equal(session.ok, true, JSON.stringify(session));

  return {
    organizationId: tenant.records.organization.id,
    hcoId: hco.healthcareOrganization.id,
    facilityId: facility.facility.id,
    staffMemberId: staff.staffMember.id,
    identityId: identity.identity.id,
    cookie: `${COOKIE_ACTIVECLINIC_ORG}=${session.rawToken}`,
  };
}

async function createAcClinicWithFacilityStaff(stamp) {
  const base = await createAcClinic(stamp);

  const facility2 = await createFacility(pool, {
    organizationId: base.organizationId,
    healthcareOrganizationId: base.hcoId,
    facilityKey: `f2${stamp}`,
    displayName: "Second Facility",
    facilityType: "clinic",
    status: "active",
    isPrimary: false,
    countryCode: "ZM",
    timezone: "Africa/Lusaka",
    phone: nextPhone(),
  });
  assert.equal(facility2.ok, true);

  const phone = nextPhone();
  const identity2 = await createPlatformIdentity(pool, {
    primaryEmail: `recept${stamp}@test.local`,
    primaryPhone: phone,
    phoneNormalized: phone,
    phoneVerifiedAt: new Date().toISOString(),
  });
  await setPlatformIdentityPassword(pool, {
    identityId: identity2.identity.id,
    password: PASSWORD,
  });

  const staff2 = await createStaffMember(pool, {
    organizationId: base.organizationId,
    healthcareOrganizationId: base.hcoId,
    firstName: "Receptionist",
    lastName: stamp,
    employmentType: "permanent",
    status: "active",
    phone,
    platformIdentityId: identity2.identity.id,
    jobTitle: "Receptionist",
  });
  assert.equal(staff2.ok, true);

  await assignStaffToFacility(pool, {
    organizationId: base.organizationId,
    staffMemberId: staff2.staffMember.id,
    facilityId: base.facilityId,
    isPrimary: true,
  });

  await assignStaffRole(pool, {
    organizationId: base.organizationId,
    staffMemberId: staff2.staffMember.id,
    roleKey: RECEPTIONIST,
    scopeType: "facility",
    facilityId: base.facilityId,
    assignmentOrigin: "system",
    deploymentCode: CODE_ACTIVECLINIC_ORG_V6,
  });

  const session2 = await createPlatformIdentitySession(pool, {
    deploymentCode: CODE_ACTIVECLINIC_ORG_V6,
    platformIdentityId: identity2.identity.id,
    organizationId: base.organizationId,
    contextJson: { selectedFacilityId: base.facilityId },
  });
  assert.equal(session2.ok, true);

  return {
    ...base,
    facility2Id: facility2.facility.id,
    receptionistCookie: `${COOKIE_ACTIVECLINIC_ORG}=${session2.rawToken}`,
  };
}

async function insertAcPublicInquiry(organizationId, hcoId, facilityId, senderName) {
  const r = await pool.query(
    `INSERT INTO activeclinic.public_contact_inquiries (
       organization_id, healthcare_organization_id, facility_id,
       sender_name, sender_email_normalized, sender_email_display, message, status
     ) VALUES ($1, $2, $3, $4, $5, $5, 'Test inquiry message', 'received')
     RETURNING id`,
    [organizationId, hcoId, facilityId, senderName, `${senderName.replace(/\s/g, "").toLowerCase()}@test.local`]
  );
  return r.rows[0].id;
}

async function insertAcPlatformInquiry(senderName) {
  const r = await pool.query(
    `INSERT INTO activeclinic.platform_contact_inquiries (
       sender_name, sender_email_normalized, sender_email_display, message, status
     ) VALUES ($1, $2, $2, 'Platform inquiry message', 'received')
     RETURNING id`,
    [senderName, `${senderName.replace(/\s/g, "").toLowerCase()}@platform.local`]
  );
  return r.rows[0].id;
}

async function createBbChurch(stamp) {
  const orgKey = `bb${stamp}`.replace(/[^a-z0-9]/gi, "").slice(0, 24);
  const host = `${orgKey}.blessboard.org`;

  const tenant = await provisionPlatformTenant(pool, {
    organizationKey: orgKey,
    displayName: `BB Church ${stamp}`,
    legalName: null,
    dataEnvironment: "testing",
    productKey: "blessboard",
    productTenantKey: orgKey,
    hostname: host,
    domainType: "canonical",
    deploymentCode: "blessboard-org-staging",
    isPrimary: true,
  });
  assert.equal(tenant.ok, true, JSON.stringify(tenant));

  const church = await provisionBlessBoardChurch(pool, {
    organizationKey: orgKey,
    churchKey: orgKey,
    displayName: `BB Church ${stamp}`,
    dataEnvironment: "testing",
    hqBranchKey: "hq",
    hqBranchDisplayName: "HQ",
  });
  assert.equal(church.ok, true, JSON.stringify(church));

  const organizationId = (
    await pool.query(`SELECT id FROM platform.organizations WHERE organization_key=$1`, [orgKey])
  ).rows[0].id;

  await assignOrganizationPlan(pool, { organizationId, planKey: "growth" });

  const hqAdmin = await createBlessBoardUser(pool, {
    email: `hq${stamp}@example.org`,
    password: PASSWORD,
    displayName: "HQ Admin",
  });
  assert.equal(hqAdmin.ok, true, JSON.stringify(hqAdmin));

  const hqRole = await assignBlessBoardRole(pool, {
    email: hqAdmin.user.email,
    organizationKey: orgKey,
    roleKey: "church_hq_admin",
    churchKey: orgKey,
  });
  assert.equal(hqRole.ok, true, JSON.stringify(hqRole));

  const hqSession = await createV5Session(pool, {
    deploymentCode: "blessboard-org-staging",
    userId: hqAdmin.user.id,
    organizationId,
    churchId: church.records.church.id,
    branchId: church.records.hqBranch.id,
  });
  assert.equal(hqSession.ok, true, JSON.stringify(hqSession));

  return {
    organizationId,
    orgKey,
    host,
    churchId: church.records.church.id,
    hqBranchId: church.records.hqBranch.id,
    hqUserId: hqAdmin.user.id,
    hqCookie: `${DEFAULT_V5_COOKIE}=${hqSession.rawToken}`,
  };
}

async function createBbChurchWithBranchAdmin(stamp) {
  const base = await createBbChurch(stamp);

  const branch2 = await createBlessBoardBranch(pool, {
    churchId: base.churchId,
    organizationId: base.organizationId,
    displayName: "Branch Two",
    branchKey: "branchtwo",
    productKey: "blessboard",
  });
  assert.equal(branch2.ok, true, JSON.stringify(branch2));

  const branchAdmin = await createBlessBoardUser(pool, {
    email: `ba${stamp}@example.org`,
    password: PASSWORD,
    displayName: "Branch Admin",
  });
  assert.equal(branchAdmin.ok, true);

  const baRole = await assignBlessBoardRole(pool, {
    email: branchAdmin.user.email,
    organizationKey: base.orgKey,
    roleKey: "branch_admin",
    churchKey: base.orgKey,
    branchKey: "hq",
  });
  assert.equal(baRole.ok, true);

  const baSession = await createV5Session(pool, {
    deploymentCode: "blessboard-org-staging",
    userId: branchAdmin.user.id,
    organizationId: base.organizationId,
    churchId: base.churchId,
    branchId: base.hqBranchId,
  });
  assert.equal(baSession.ok, true);

  return {
    ...base,
    branch2Id: branch2.branch.id,
    branchAdminUserId: branchAdmin.user.id,
    branchAdminCookie: `${DEFAULT_V5_COOKIE}=${baSession.rawToken}`,
  };
}

async function createPlatformAdmin(stamp) {
  const orgKey = `pa${stamp}`.replace(/[^a-z0-9]/gi, "").slice(0, 24);
  const tenant = await provisionPlatformTenant(pool, {
    skipDomain: true,
    dataEnvironment: "testing",
    organizationKey: orgKey,
    displayName: `PA Org ${stamp}`,
    productKey: "blessboard",
    productTenantKey: orgKey,
    deploymentCode: "blessboard-org-staging",
  });
  assert.equal(tenant.ok, true);

  const church = await provisionBlessBoardChurch(pool, {
    organizationKey: orgKey,
    churchKey: orgKey,
    displayName: `PA Church ${stamp}`,
    dataEnvironment: "testing",
    hqBranchKey: "hq",
    hqBranchDisplayName: "HQ",
  });
  assert.equal(church.ok, true);

  const organizationId = (
    await pool.query(`SELECT id FROM platform.organizations WHERE organization_key=$1`, [orgKey])
  ).rows[0].id;

  const paUser = await createBlessBoardUser(pool, {
    email: `pa${stamp}@example.org`,
    password: PASSWORD,
    displayName: "Platform Admin",
  });
  assert.equal(paUser.ok, true);

  const paRole = await assignBlessBoardRole(pool, {
    email: paUser.user.email,
    organizationKey: orgKey,
    roleKey: "platform_admin",
  });
  assert.equal(paRole.ok, true);

  const session = await createV5Session(pool, {
    deploymentCode: "blessboard-org-staging",
    userId: paUser.user.id,
    organizationId,
    churchId: church.records.church.id,
    branchId: church.records.hqBranch.id,
  });
  assert.equal(session.ok, true);

  return {
    organizationId,
    userId: paUser.user.id,
    cookie: `${DEFAULT_V5_COOKIE}=${session.rawToken}`,
  };
}

describe("V2.05 Contact Flow Security", () => {
  before(async () => {
    try {
      const databaseUrl = await resetFoundationDatabase();
      pool = createFoundationPool(databaseUrl);
      await migrate({ connectionString: databaseUrl });
      await ensureDatabaseIdentity(pool, {
        connectionString: databaseUrl,
        identityKey: IDENTITY_KEY,
        environmentCode: "testing",
      });
    } catch (err) {
      skipReason = err && err.message ? String(err.message) : String(err);
    }
  });

  after(async () => {
    if (pool) await pool.end().catch(() => {});
  });

  // ============ AC Clinic Inbox Tests ============

  it("AC-1: clinic A admin sees clinic A inquiries", async () => {
    requireDb();
    const clinicA = await createAcClinic(uniq("ac1"));
    await insertAcPublicInquiry(clinicA.organizationId, clinicA.hcoId, clinicA.facilityId, "AC1Sender");
    const res = await request(getAcApp()).get("/app/operations/contact-inquiries").set("Host", AC_HOST).set("Cookie", clinicA.cookie).redirects(0);
    assert.equal(res.status, 200);
    assert.ok(res.text.includes("AC1Sender"), "Should see own clinic inquiry");
  });

  it("AC-2: clinic A cannot see clinic B inquiry (list)", async () => {
    requireDb();
    const clinicA = await createAcClinic(uniq("ac2a"));
    const clinicB = await createAcClinic(uniq("ac2b"));
    await insertAcPublicInquiry(clinicB.organizationId, clinicB.hcoId, clinicB.facilityId, "ClinicBSecret");
    const res = await request(getAcApp()).get("/app/operations/contact-inquiries").set("Host", AC_HOST).set("Cookie", clinicA.cookie).redirects(0);
    assert.equal(res.status, 200);
    assert.ok(!res.text.includes("ClinicBSecret"), "Clinic A should NOT see Clinic B inquiry");
  });

  it("AC-3: facility-scoped user cannot see unauthorized facility inquiry", async () => {
    requireDb();
    const clinic = await createAcClinicWithFacilityStaff(uniq("ac3"));
    await insertAcPublicInquiry(clinic.organizationId, clinic.hcoId, clinic.facility2Id, "Facility2Secret");
    const res = await request(getAcApp()).get("/app/operations/contact-inquiries").set("Host", AC_HOST).set("Cookie", clinic.receptionistCookie).redirects(0);
    assert.equal(res.status, 200);
    assert.ok(!res.text.includes("Facility2Secret"), "Facility-scoped user should NOT see other facility");
  });

  // ============ AC Platform Admin Tests ============

  it("AC-4: platform admin can see AC platform inquiries at /admin/activeclinic/contact-inquiries", async () => {
    requireDb();
    const pa = await createPlatformAdmin(uniq("ac4"));
    await insertAcPlatformInquiry("AC4PlatformSender");
    const res = await request(getBbApp()).get("/admin/activeclinic/contact-inquiries").set("Host", BB_APEX).set("Cookie", pa.cookie).redirects(0);
    assert.equal(res.status, 200);
  });

  it("AC-5: platform admin cannot read /app/operations/contact-inquiries", async () => {
    requireDb();
    const phone = nextPhone();
    const identity = await createPlatformIdentity(pool, {
      primaryEmail: `paac${uniq("ac5")}@test.local`,
      primaryPhone: phone,
      phoneNormalized: phone,
      phoneVerifiedAt: new Date().toISOString(),
    });
    await setPlatformIdentityPassword(pool, { identityId: identity.identity.id, password: PASSWORD });
    const session = await createPlatformIdentitySession(pool, {
      deploymentCode: CODE_ACTIVECLINIC_ORG_V6,
      platformIdentityId: identity.identity.id,
      organizationId: null,
    });
    const res = await request(getAcApp()).get("/app/operations/contact-inquiries").set("Host", AC_HOST).set("Cookie", `${COOKIE_ACTIVECLINIC_ORG}=${session.rawToken}`).redirects(0);
    assert.ok([301, 302, 303, 401, 403, 404].includes(res.status), `Expected deny, got ${res.status}`);
  });

  // ============ BB Branch Admin Tests ============

  it("BB-6: branch A admin sees branch A only (/branch-admin/contact-submissions)", async () => {
    requireDb();
    const church = await createBbChurchWithBranchAdmin(uniq("bb6"));
    await createPublicContactSubmission(pool, { organization_id: church.organizationId, church_id: church.churchId, branch_id: church.hqBranchId, full_name: "BB6HQSender", email: "bb6hq@test.local", phone: null, message: "HQ branch message" });
    await createPublicContactSubmission(pool, { organization_id: church.organizationId, church_id: church.churchId, branch_id: church.branch2Id, full_name: "BB6Branch2Sender", email: "bb6b2@test.local", phone: null, message: "Branch 2 message" });
    const res = await request(getBbApp()).get("/branch-admin/contact-submissions").set("Host", church.host).set("Cookie", church.branchAdminCookie).redirects(0);
    assert.equal(res.status, 200);
    assert.ok(res.text.includes("BB6HQSender"), "Branch admin should see own branch");
    assert.ok(!res.text.includes("BB6Branch2Sender"), "Branch admin should NOT see other branch");
  });

  it("BB-7: branch A cannot read branch B submission detail", async () => {
    requireDb();
    const church = await createBbChurchWithBranchAdmin(uniq("bb7"));
    const submission = await createPublicContactSubmission(pool, { organization_id: church.organizationId, church_id: church.churchId, branch_id: church.branch2Id, full_name: "BB7Secret", email: "bb7@test.local", phone: null, message: "Secret" });
    const res = await request(getBbApp()).get(`/branch-admin/contact-submissions/${submission.id}`).set("Host", church.host).set("Cookie", church.branchAdminCookie).redirects(0);
    assert.ok([403, 404].includes(res.status), `Expected 403/404, got ${res.status}`);
  });

  // ============ BB HQ Admin Tests ============

  it("BB-8: HQ sees own-org branches only (/hq/contact-submissions)", async () => {
    requireDb();
    const church = await createBbChurchWithBranchAdmin(uniq("bb8"));
    await createPublicContactSubmission(pool, { organization_id: church.organizationId, church_id: church.churchId, branch_id: church.hqBranchId, full_name: "BB8HQSender", email: "bb8hq@test.local", phone: null, message: "HQ" });
    await createPublicContactSubmission(pool, { organization_id: church.organizationId, church_id: church.churchId, branch_id: church.branch2Id, full_name: "BB8Branch2Sender", email: "bb8b2@test.local", phone: null, message: "B2" });
    const res = await request(getBbApp()).get("/hq/contact-submissions").set("Host", church.host).set("Cookie", church.hqCookie).redirects(0);
    assert.equal(res.status, 200);
    assert.ok(res.text.includes("BB8HQSender"), "HQ should see HQ branch");
    assert.ok(res.text.includes("BB8Branch2Sender"), "HQ should see all org branches");
  });

  it("BB-9: HQ cannot see other org submissions", async () => {
    requireDb();
    const churchA = await createBbChurch(uniq("bb9a"));
    const churchB = await createBbChurch(uniq("bb9b"));
    await createPublicContactSubmission(pool, { organization_id: churchB.organizationId, church_id: churchB.churchId, branch_id: churchB.hqBranchId, full_name: "BB9Secret", email: "bb9@test.local", phone: null, message: "Secret" });
    const res = await request(getBbApp()).get("/hq/contact-submissions").set("Host", churchB.host).set("Cookie", churchA.hqCookie).redirects(0);
    assert.ok([301, 302, 303, 401, 403, 404].includes(res.status), `Expected deny, got ${res.status}`);
  });

  // ============ BB Platform Admin Tests ============

  it("BB-10: platform admin can access /admin (200) and tenant contact routes stay denied", async () => {
    requireDb();
    const pa = await createPlatformAdmin(uniq("bb10"));
    const adminRes = await request(getBbApp()).get("/admin").set("Host", BB_APEX).set("Cookie", pa.cookie).redirects(0);
    assert.equal(adminRes.status, 200);
    const hqRes = await request(getBbApp()).get("/hq/contact-submissions").set("Host", BB_APEX).set("Cookie", pa.cookie).redirects(0);
    assert.ok([301, 302, 303, 401, 403, 404, 503].includes(hqRes.status), `PA apex /hq expected deny, got ${hqRes.status}`);
  });

  it("BB-11: platform admin cannot read BB tenant inquiry routes", async () => {
    requireDb();
    const pa = await createPlatformAdmin(uniq("bb11"));
    const church = await createBbChurch(uniq("bb11c"));
    await createPublicContactSubmission(pool, { organization_id: church.organizationId, church_id: church.churchId, branch_id: church.hqBranchId, full_name: "BB11Secret", email: "bb11@test.local", phone: null, message: "Secret" });
    const res = await request(getBbApp()).get("/hq/contact-submissions").set("Host", church.host).set("Cookie", pa.cookie).redirects(0);
    assert.ok([301, 302, 303, 401, 403, 404].includes(res.status), `PA on tenant expected deny, got ${res.status}`);
  });

  // ============ GUI Tests ============

  it("GUI-12: senderName type=text in views/activeclinic/public/contact.ejs", () => {
    const contactEjsPath = path.join(__dirname, "..", "views", "activeclinic", "public", "contact.ejs");
    const content = fs.readFileSync(contactEjsPath, "utf8");
    const senderNameMatch = content.match(/<input[^>]*id="senderName"[^>]*>/i);
    assert.ok(senderNameMatch, "senderName input not found");
    assert.ok(senderNameMatch[0].includes('type="text"'), `senderName must have type=text`);
    assert.ok(senderNameMatch[0].includes('name="senderName"'), "senderName must have name=senderName");
  });
});
