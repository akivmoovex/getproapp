"use strict";

/**
 * ActiveClinic V6 — staff create/invite/edit (AC-V6-S05).
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
} = require("../src/activeclinic/services/healthcareOrganizationService");
const {
  createFacility,
} = require("../src/activeclinic/services/facilityService");
const {
  createStaffMember,
  getStaffMemberByIdAndOrganization,
} = require("../src/activeclinic/services/activeClinicStaffService");
const {
  assignStaffToFacility,
  listFacilitiesForStaff,
} = require("../src/activeclinic/services/activeClinicStaffFacilityService");
const {
  assignStaffRole,
  NETWORK_ADMIN,
  FACILITY_ADMIN,
  STAFF_ROLE,
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
  CSRF_COOKIE_ACTIVECLINIC_ORG,
  resetDeploymentProfileWarningsForTests,
} = require("../src/platform/config/deploymentProfiles");
const { CSRF_FIELD, issueCsrfToken } = require("../src/platform/http/v5Csrf");

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
let phoneSeq = 840000000;

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
    publicName: "Juflona Invite",
    organizationType: "private_healthcare",
    countryCode: "ZM",
    timezone: "Africa/Lusaka",
  });
  assert.equal(hco.ok, true, JSON.stringify(hco));
  const facility = await createFacility(pool, {
    organizationId: org.records.organization.id,
    healthcareOrganizationId: hco.healthcareOrganization.id,
    facilityKey: `${keyPrefix}-main`,
    displayName: "Main Hospital",
    facilityType: "hospital",
    status: "active",
    isPrimary: true,
    countryCode: "ZM",
    timezone: "Africa/Lusaka",
    phone: nextPhone(),
    city: "Lusaka",
  });
  assert.equal(facility.ok, true, JSON.stringify(facility));
  const facility2 = await createFacility(pool, {
    organizationId: org.records.organization.id,
    healthcareOrganizationId: hco.healthcareOrganization.id,
    facilityKey: `${keyPrefix}-clinic`,
    displayName: "Clinic East",
    facilityType: "clinic",
    status: "active",
    isPrimary: false,
    countryCode: "ZM",
    timezone: "Africa/Lusaka",
    phone: nextPhone(),
    city: "Ndola",
  });
  assert.equal(facility2.ok, true, JSON.stringify(facility2));
  return {
    orgId: org.records.organization.id,
    hcoId: hco.healthcareOrganization.id,
    facilityId: facility.facility.id,
    facility2Id: facility2.facility.id,
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
    firstName: opts.firstName || "Staff",
    lastName: opts.lastName || "Member",
    employmentType: "permanent",
    phone,
    status: "active",
    platformIdentityId: identity.identity.id,
    jobTitle: opts.jobTitle || "Administrator",
  });
  assert.equal(staff.ok, true, JSON.stringify(staff));
  const facilityIds = opts.facilityIds || [ac.facilityId];
  for (const facilityId of facilityIds) {
    await assignStaffToFacility(pool, {
      organizationId: ac.orgId,
      staffMemberId: staff.staffMember.id,
      facilityId,
      isPrimary: facilityId === facilityIds[0],
    });
  }
  await assignStaffRole(pool, {
    organizationId: ac.orgId,
    staffMemberId: staff.staffMember.id,
    roleKey: opts.roleKey || STAFF_ROLE,
    scopeType: opts.scopeType || "organisation",
    facilityId: opts.scopeType === "facility" ? facilityIds[0] : null,
  });
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

describe("ActiveClinic staff create/invite/edit parity (AC-V6-S05)", () => {
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

  it("network admin creates and invites staff with facility and role", async () => {
    requireDb();
    const stamp = Date.now().toString(36);
    const ac = await seedAcTenant(stamp, "sinv");
    const admin = await seedStaff(ac, {
      roleKey: NETWORK_ADMIN,
      facilityIds: [ac.facilityId, ac.facility2Id],
      firstName: "Invite",
      lastName: "Admin",
    });
    const { cookie } = await sessionCookie(admin.identity.id, ac.orgId);
    const app = makeApp();
    const csrf = issueCsrfToken(MINIMAL_AC);

    const createPage = await request(app)
      .get("/app/staff/new")
      .set("Cookie", cookie);
    assert.equal(createPage.status, 200);
    assert.match(createPage.text, /data-ac-page-section="staff-create"/);
    assert.match(createPage.text, /name="facility_ids"/);
    assert.match(createPage.text, /name="role_keys"/);

    const noCsrf = await request(app)
      .post("/app/staff")
      .set("Cookie", cookie)
      .type("form")
      .send({
        first_name: "New",
        last_name: "Nurse",
        phone: nextPhone(),
        employment_type: "permanent",
        facility_ids: [ac.facilityId],
        primary_facility_id: ac.facilityId,
        role_keys: [STAFF_ROLE],
        role_scope: "facility",
        role_facility_id: ac.facilityId,
        issue_invitation: "1",
      });
    assert.equal(noCsrf.status, 403);

    const phone = nextPhone();
    const created = await request(app)
      .post("/app/staff")
      .set("Cookie", `${cookie}; ${CSRF_COOKIE_ACTIVECLINIC_ORG}=${csrf}`)
      .type("form")
      .send({
        [CSRF_FIELD]: csrf,
        first_name: "New",
        last_name: "Nurse",
        phone,
        employment_type: "permanent",
        job_title: "Nurse",
        facility_ids: [ac.facilityId],
        primary_facility_id: ac.facilityId,
        role_keys: [STAFF_ROLE],
        role_scope: "facility",
        role_facility_id: ac.facilityId,
        issue_invitation: "1",
      });
    assert.equal(created.status, 200);
    assert.match(created.text, /data-ac-page-section="staff-invite-result"/);
    assert.match(created.text, /data-ac-invite-url|activation/i);
    assert.match(created.text, /link_generated|Link generated/i);
    assert.doesNotMatch(created.text, /password_hash|failed_sign_in/i);
    assert.match(created.text, /data-ac-copy-invite/);
    assert.match(created.text, /Share on WhatsApp|wa\.me/);

    const list = await request(app).get("/app/staff").set("Cookie", cookie);
    assert.match(list.text, /New Nurse/);
    assert.match(list.text, /Invite staff/);
  });

  it("facility admin cannot assign network admin role and is facility-scoped", async () => {
    requireDb();
    const stamp = Date.now().toString(36);
    const ac = await seedAcTenant(stamp, "sfac");
    const facAdmin = await seedStaff(ac, {
      roleKey: FACILITY_ADMIN,
      scopeType: "facility",
      facilityIds: [ac.facilityId],
      firstName: "Fac",
      lastName: "Boss",
    });
    const { cookie } = await sessionCookie(facAdmin.identity.id, ac.orgId);
    const app = makeApp();

    const createPage = await request(app)
      .get("/app/staff/new")
      .set("Cookie", cookie);
    assert.equal(createPage.status, 200);
    assert.doesNotMatch(createPage.text, /activeclinic_network_admin/);
    assert.match(createPage.text, /Main Hospital/);
    assert.doesNotMatch(createPage.text, /Clinic East/);
  });

  it("edits staff profile and facility assignments with CSRF", async () => {
    requireDb();
    const stamp = Date.now().toString(36);
    const ac = await seedAcTenant(stamp, "sedit");
    const admin = await seedStaff(ac, {
      roleKey: NETWORK_ADMIN,
      facilityIds: [ac.facilityId, ac.facility2Id],
    });
    const target = await seedStaff(ac, {
      roleKey: STAFF_ROLE,
      scopeType: "facility",
      facilityIds: [ac.facilityId],
      firstName: "Edit",
      lastName: "Me",
      phone: nextPhone(),
    });
    const { cookie } = await sessionCookie(admin.identity.id, ac.orgId);
    const app = makeApp();
    const csrf = issueCsrfToken(MINIMAL_AC);

    const editPage = await request(app)
      .get(`/app/staff/${target.staff.id}/edit`)
      .set("Cookie", cookie);
    assert.equal(editPage.status, 200);
    assert.match(editPage.text, /data-ac-page-section="staff-edit"/);
    assert.match(editPage.text, /Edit Me/);

    const updated = await request(app)
      .post(`/app/staff/${target.staff.id}`)
      .set("Cookie", `${cookie}; ${CSRF_COOKIE_ACTIVECLINIC_ORG}=${csrf}`)
      .type("form")
      .send({
        [CSRF_FIELD]: csrf,
        first_name: "Edited",
        last_name: "Person",
        phone: target.phone,
        employment_type: "contract",
        job_title: "Senior nurse",
        facility_ids: [ac.facilityId, ac.facility2Id],
        primary_facility_id: ac.facility2Id,
      });
    assert.equal(updated.status, 303);
    assert.match(updated.headers.location, new RegExp(target.staff.id));

    const got = await getStaffMemberByIdAndOrganization(pool, {
      id: target.staff.id,
      organizationId: ac.orgId,
    });
    assert.equal(got.staffMember.displayName, "Edited Person");
    assert.equal(got.staffMember.employmentType, "contract");

    const fac = await listFacilitiesForStaff(pool, {
      staffMemberId: target.staff.id,
      organizationId: ac.orgId,
    });
    const active = (fac.assignments || []).filter((a) => a.status === "active");
    assert.equal(active.length, 2);
    assert.ok(active.some((a) => a.isPrimary && String(a.facilityId) === String(ac.facility2Id)));

    const detail = await request(app)
      .get(`/app/staff/${target.staff.id}`)
      .set("Cookie", cookie);
    assert.match(detail.text, /Edited Person/);
    assert.match(detail.text, /Edit staff|href=".*\/edit"/);
  });

  it("denies create/edit without permissions", async () => {
    requireDb();
    const stamp = Date.now().toString(36);
    const ac = await seedAcTenant(stamp, "sdeny");
    const basic = await seedStaff(ac, {
      roleKey: STAFF_ROLE,
      scopeType: "facility",
      facilityIds: [ac.facilityId],
    });
    const { cookie } = await sessionCookie(basic.identity.id, ac.orgId);
    const app = makeApp();

    const createGet = await request(app).get("/app/staff/new").set("Cookie", cookie);
    assert.equal(createGet.status, 403);

    const editGet = await request(app)
      .get(`/app/staff/${basic.staff.id}/edit`)
      .set("Cookie", cookie);
    assert.equal(editGet.status, 403);
  });
});
