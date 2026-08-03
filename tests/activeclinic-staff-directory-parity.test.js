"use strict";

/**
 * ActiveClinic V6 — staff directory + detail (AC-V6-S04).
 * Stitch staff screens are STITCH_GAP / VISUAL_BLOCKED.
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
} = require("../src/activeclinic/services/activeClinicStaffService");
const {
  assignStaffToFacility,
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
const {
  staffStatusLabel,
  employmentTypeLabel,
  staffInitials,
  loadActiveClinicStaffListScreen,
} = require("../src/activeclinic/services/loadActiveClinicStaffScreens");

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
    publicName: "Juflona Staff",
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
    displayName: "Clinic B",
    facilityType: "clinic",
    status: "active",
    isPrimary: false,
    countryCode: "ZM",
    timezone: "Africa/Lusaka",
    phone: nextPhone(),
    city: "Kitwe",
  });
  assert.equal(facility2.ok, true, JSON.stringify(facility2));
  return {
    orgId: org.records.organization.id,
    orgKey: org.records.organization.key,
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
    preferredName: opts.preferredName || null,
    employmentType: opts.employmentType || "permanent",
    phone,
    status: opts.status || "active",
    platformIdentityId: identity.identity.id,
    jobTitle: opts.jobTitle || "Clinician",
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
  return {
    cookie: `${COOKIE_ACTIVECLINIC_ORG}=${session.rawToken}`,
    session,
  };
}

function makeApp() {
  return createActiveClinicFoundationApp({
    getPool: () => pool,
    env: MINIMAL_AC,
    log: () => {},
  });
}

describe("ActiveClinic staff directory parity (AC-V6-S04)", () => {
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

  it("exposes plain-language staff labels and initials", () => {
    assert.equal(staffStatusLabel("invited"), "Invited");
    assert.equal(employmentTypeLabel("permanent"), "Permanent");
    assert.equal(
      staffInitials({ firstName: "Ada", lastName: "Clinic", displayName: "Ada Clinic" }),
      "AC"
    );
  });

  it("network admin lists tenant staff with markers and no secrets", async () => {
    requireDb();
    const stamp = Date.now().toString(36);
    const ac = await seedAcTenant(stamp, "slist");
    const admin = await seedStaff(ac, {
      firstName: "Net",
      lastName: "Admin",
      roleKey: NETWORK_ADMIN,
      jobTitle: "Network administrator",
      facilityIds: [ac.facilityId, ac.facility2Id],
    });
    const nurse = await seedStaff(ac, {
      firstName: "Nia",
      lastName: "Nurse",
      roleKey: STAFF_ROLE,
      scopeType: "facility",
      jobTitle: "Nurse",
      employmentType: "contract",
      facilityIds: [ac.facility2Id],
      phone: nextPhone(),
    });
    const { cookie } = await sessionCookie(admin.identity.id, ac.orgId);
    const app = makeApp();

    const list = await request(app).get("/app/staff").set("Cookie", cookie);
    assert.equal(list.status, 200);
    assert.match(list.text, /data-ac-page-section="staff-list"/);
    assert.match(list.text, /data-ac-visual="stitch-gap"/);
    assert.match(list.text, /data-ac-table="staff"/);
    assert.match(list.text, /data-ac-mobile-list="staff"/);
    assert.match(list.text, /Net Admin/);
    assert.match(list.text, /Nia Nurse/);
    assert.match(list.text, /data-ac-staff-avatar/);
    assert.doesNotMatch(list.text, /password_hash|activationUrl|token|failed_sign_in/i);
    // Patients + Appointments nav are Stitch P02/P03; staff directory still omits HR secrets and BlessBoard chrome.
    assert.doesNotMatch(
      list.text,
      /salary|BlessBoard|church\.css|patient census|patients today|appointments today/i
    );
    assert.equal((list.text.match(/<h1[\s>]/gi) || []).length, 1);

    const filtered = await request(app)
      .get("/app/staff?employment=contract")
      .set("Cookie", cookie);
    assert.match(filtered.text, /Nia Nurse/);
    assert.match(filtered.text, /data-ac-result-count="1"/);
    const rowMatches = filtered.text.match(/data-ac-staff-row="/g) || [];
    const cardMatches = filtered.text.match(/data-ac-staff-card="/g) || [];
    assert.equal(rowMatches.length, 1);
    assert.equal(cardMatches.length, 1);

    const search = await request(app)
      .get("/app/staff?q=nia")
      .set("Cookie", cookie);
    assert.match(search.text, /Nia Nurse/);

    const empty = await request(app)
      .get("/app/staff?q=zzzz-no-match")
      .set("Cookie", cookie);
    assert.match(empty.text, /data-ac-empty="staff-filtered"/);

    const detail = await request(app)
      .get(`/app/staff/${nurse.staff.id}`)
      .set("Cookie", cookie);
    assert.equal(detail.status, 200);
    assert.match(detail.text, /data-ac-page-section="staff-detail"/);
    assert.match(detail.text, /data-ac-staff-contact/);
    assert.match(detail.text, /data-ac-staff-facilities/);
    assert.match(detail.text, /data-ac-staff-access/);
    assert.match(detail.text, /data-ac-staff-account/);
    assert.match(detail.text, /Clinic B/);
    assert.doesNotMatch(detail.text, /activeclinic_staff|password_hash|platform\.identities/i);
    assert.match(detail.text, /Staff|Facility administrator|Network administrator/);

    const unauthorized = await request(app).get("/app/staff");
    assert.ok([302, 303].includes(unauthorized.status));
  });

  it("facility admin only sees staff overlapping assigned facilities", async () => {
    requireDb();
    const stamp = Date.now().toString(36);
    const ac = await seedAcTenant(stamp, "sscope");
    const other = await seedAcTenant(`${stamp}x`, "sscope2");
    const facAdmin = await seedStaff(ac, {
      firstName: "Fac",
      lastName: "Admin",
      roleKey: FACILITY_ADMIN,
      scopeType: "facility",
      facilityIds: [ac.facilityId],
      jobTitle: "Facility administrator",
    });
    const shared = await seedStaff(ac, {
      firstName: "Shared",
      lastName: "Worker",
      roleKey: STAFF_ROLE,
      scopeType: "facility",
      facilityIds: [ac.facilityId],
      phone: nextPhone(),
    });
    const otherFacOnly = await seedStaff(ac, {
      firstName: "Other",
      lastName: "Clinic",
      roleKey: STAFF_ROLE,
      scopeType: "facility",
      facilityIds: [ac.facility2Id],
      phone: nextPhone(),
    });
    const { cookie } = await sessionCookie(facAdmin.identity.id, ac.orgId);
    const app = makeApp();

    const list = await request(app).get("/app/staff").set("Cookie", cookie);
    assert.equal(list.status, 200);
    assert.match(list.text, /Shared Worker/);
    assert.doesNotMatch(list.text, /Other Clinic/);

    const denied = await request(app)
      .get(`/app/staff/${otherFacOnly.staff.id}`)
      .set("Cookie", cookie);
    assert.equal(denied.status, 404);

    const ok = await request(app)
      .get(`/app/staff/${shared.staff.id}`)
      .set("Cookie", cookie);
    assert.equal(ok.status, 200);

    const cross = await request(app)
      .get(`/app/staff/${other.orgId}`)
      .set("Cookie", cookie);
    assert.equal(cross.status, 404);

    // Ordinary staff without staff.view is denied
    const basic = await seedStaff(ac, {
      firstName: "Basic",
      lastName: "Staff",
      roleKey: STAFF_ROLE,
      scopeType: "facility",
      facilityIds: [ac.facilityId],
      phone: nextPhone(),
    });
    const basicSession = await sessionCookie(basic.identity.id, ac.orgId);
    const deniedView = await request(app)
      .get("/app/staff")
      .set("Cookie", basicSession.cookie);
    assert.equal(deniedView.status, 403);
  });

  it("lifecycle action buttons are permission filtered and CSRF protected", async () => {
    requireDb();
    const stamp = Date.now().toString(36);
    const ac = await seedAcTenant(stamp, "sact");
    const admin = await seedStaff(ac, {
      roleKey: NETWORK_ADMIN,
      facilityIds: [ac.facilityId],
      firstName: "Ops",
      lastName: "Admin",
    });
    const target = await seedStaff(ac, {
      roleKey: STAFF_ROLE,
      scopeType: "facility",
      facilityIds: [ac.facilityId],
      firstName: "Target",
      lastName: "User",
      phone: nextPhone(),
    });
    const { cookie } = await sessionCookie(admin.identity.id, ac.orgId);
    const app = makeApp();
    const csrf = issueCsrfToken(MINIMAL_AC);

    const detail = await request(app)
      .get(`/app/staff/${target.staff.id}`)
      .set("Cookie", cookie);
    assert.match(detail.text, /Revoke ActiveClinic sessions|Require password change|Suspend staff/);
    assert.doesNotMatch(detail.text, /activationUrl|resetUrl/);

    const noCsrf = await request(app)
      .post(`/app/staff/${target.staff.id}/revoke-sessions`)
      .set("Cookie", cookie)
      .type("form")
      .send({});
    assert.equal(noCsrf.status, 403);

    const revoke = await request(app)
      .post(`/app/staff/${target.staff.id}/revoke-sessions`)
      .set("Cookie", `${cookie}; ${CSRF_COOKIE_ACTIVECLINIC_ORG}=${csrf}`)
      .type("form")
      .send({ [CSRF_FIELD]: csrf });
    assert.equal(revoke.status, 303);
    assert.match(revoke.headers.location, new RegExp(`/app/staff/${target.staff.id}`));
  });

  it("loader filters are allowlisted and facility-scoped for non-network admins", async () => {
    requireDb();
    const stamp = Date.now().toString(36);
    const ac = await seedAcTenant(stamp, "sload");
    const admin = await seedStaff(ac, {
      roleKey: NETWORK_ADMIN,
      facilityIds: [ac.facilityId, ac.facility2Id],
    });
    await seedStaff(ac, {
      firstName: "Filter",
      lastName: "Me",
      roleKey: STAFF_ROLE,
      scopeType: "facility",
      status: "inactive",
      facilityIds: [ac.facilityId],
      phone: nextPhone(),
    });
    const auth = {
      organization: { id: ac.orgId },
      staffMember: admin.staff,
      permissions: ["activeclinic.staff.view", "activeclinic.staff.invite"],
      roleAssignments: [
        { roleKey: NETWORK_ADMIN, scopeType: "organisation", status: "active" },
      ],
      selectedFacility: null,
    };
    const screen = await loadActiveClinicStaffListScreen(pool, {
      auth,
      query: { status: "inactive", employment: "not-real" },
    });
    assert.equal(screen.ok, true);
    assert.ok(screen.staff.every((s) => s.status === "inactive"));
    assert.equal(screen.filters.employment, "");
  });
});
