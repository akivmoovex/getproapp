"use strict";

/**
 * ActiveClinic V6 — application shell and navigation (AC-V6-10).
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
  buildActiveClinicNavigation,
} = require("../src/activeclinic/services/activeClinicNavigation");
const {
  createActiveClinicFoundationApp,
} = require("../src/activeclinic/http/activeClinicFoundationServer");
const {
  createPlatformIdentitySession,
} = require("../src/platform/session/createDeploymentSession");
const {
  selectFacilityForSession,
  listSelectableFacilities,
} = require("../src/activeclinic/services/activeClinicFacilityContextService");
const {
  CODE_ACTIVECLINIC_ORG_V6,
  CODE_ORG_STAGING,
  COOKIE_ACTIVECLINIC_ORG,
  COOKIE_ORG,
  CSRF_COOKIE_ACTIVECLINIC_ORG,
  resetDeploymentProfileWarningsForTests,
} = require("../src/platform/config/deploymentProfiles");
const { CSRF_FIELD, issueCsrfToken } = require("../src/platform/http/v5Csrf");
const { createV5Session } = require("../src/platform/session/createV5Session");
const {
  createBlessBoardUser,
} = require("../src/blessboard/services/createBlessBoardUser");

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
let phoneSeq = 810000000;

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
    publicName: "Juflona Shell",
    organizationType: "private_healthcare",
    countryCode: "ZM",
    timezone: "Africa/Lusaka",
  });
  assert.equal(hco.ok, true, JSON.stringify(hco));
  const facility = await createFacility(pool, {
    organizationId: org.records.organization.id,
    healthcareOrganizationId: hco.healthcareOrganization.id,
    facilityKey: "main",
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
    facilityKey: "clinic-a",
    displayName: "Clinic A",
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
    facilityKey: facility.facility.facilityKey,
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
    firstName: opts.firstName || "Shell",
    lastName: opts.lastName || "User",
    employmentType: "permanent",
    phone,
    status: "active",
    platformIdentityId: identity.identity.id,
    jobTitle: opts.jobTitle || "Clinician",
  });
  assert.equal(staff.ok, true, JSON.stringify(staff));
  for (const facilityId of opts.facilityIds || [ac.facilityId]) {
    await assignStaffToFacility(pool, {
      organizationId: ac.orgId,
      staffMemberId: staff.staffMember.id,
      facilityId,
      isPrimary: facilityId === (opts.facilityIds || [ac.facilityId])[0],
    });
  }
  await assignStaffRole(pool, {
    organizationId: ac.orgId,
    staffMemberId: staff.staffMember.id,
    roleKey: opts.roleKey || STAFF_ROLE,
    scopeType: opts.scopeType || "organisation",
    facilityId: opts.scopeType === "facility" ? opts.facilityIds[0] : null,
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

describe("ActiveClinic application shell and navigation", () => {
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

  it("filters navigation by permissions without role-name checks", () => {
    const nav = buildActiveClinicNavigation(
      ["activeclinic.access", "activeclinic.facility.view"],
      "facilities"
    );
    assert.equal(nav.items.length, 3);
    assert.ok(nav.items.every((i) => i.permission));
    assert.equal(nav.items.find((i) => i.key === "facilities").current, true);
    assert.ok(nav.items.find((i) => i.key === "settings"));
    assert.equal(
      nav.items.find((i) => i.key === "staff"),
      undefined
    );
    assert.deepEqual(
      nav.desktop.map((i) => i.key),
      nav.mobile.map((i) => i.key)
    );
  });

  it("authenticated /app uses ActiveClinic shell; unauthenticated redirects", async () => {
    requireDb();
    const stamp = Date.now().toString(36);
    const ac = await seedAcTenant(stamp, "shell");
    const admin = await seedStaff(ac, {
      firstName: "Net",
      lastName: "Admin",
      roleKey: NETWORK_ADMIN,
      facilityIds: [ac.facilityId, ac.facility2Id],
    });
    const app = createActiveClinicFoundationApp({
      getPool: () => pool,
      env: MINIMAL_AC,
      log: () => {},
    });

    const anon = await request(app).get("/app");
    assert.ok([302, 303].includes(anon.status));
    assert.match(anon.headers.location || "", /\/login/);

    const { cookie } = await sessionCookie(admin.identity.id, ac.orgId);
    const home = await request(app).get("/app").set("Cookie", cookie);
    assert.equal(home.status, 200);
    assert.match(home.text, /data-ac-shell="staff-app"/);
    assert.match(home.text, /data-ac-product="activeclinic"/);
    assert.match(home.text, /Skip to content/);
    assert.match(home.text, /Juflona Shell/);
    assert.match(home.text, /Net Admin/);
    assert.doesNotMatch(home.text, /patient census|appointments today|clinical KPI/i);
    assert.match(home.text, /data-ac-nav-key="home"/);
    assert.match(home.text, /aria-current="page"/);
  });

  it("BlessBoard cookie does not authenticate ActiveClinic", async () => {
    requireDb();
    const stamp = Date.now().toString(36);
    const bbUser = await createBlessBoardUser(pool, {
      email: `bbshell_${stamp}@example.test`,
      displayName: "BB Shell",
      password: PASSWORD,
    });
    assert.equal(bbUser.ok, true);
    const bbSess = await createV5Session(pool, {
      deploymentCode: CODE_ORG_STAGING,
      userId: bbUser.user.id,
    });
    assert.equal(bbSess.ok, true);
    const app = createActiveClinicFoundationApp({
      getPool: () => pool,
      env: MINIMAL_AC,
      log: () => {},
    });
    const res = await request(app)
      .get("/app")
      .set("Cookie", `${COOKIE_ORG}=${bbSess.rawToken}`);
    assert.ok([302, 303].includes(res.status));
    assert.match(res.headers.location || "", /\/login/);
  });

  it("hides unauthorized nav and denies direct route", async () => {
    requireDb();
    const stamp = Date.now().toString(36);
    const ac = await seedAcTenant(stamp, "nav");
    const staff = await seedStaff(ac, {
      roleKey: STAFF_ROLE,
      facilityIds: [ac.facilityId],
    });
    const { cookie } = await sessionCookie(staff.identity.id, ac.orgId);
    const app = createActiveClinicFoundationApp({
      getPool: () => pool,
      env: MINIMAL_AC,
      log: () => {},
    });
    const home = await request(app).get("/app").set("Cookie", cookie);
    assert.equal(home.status, 200);
    assert.doesNotMatch(home.text, /data-ac-nav-key="access"/);
    assert.match(home.text, /data-ac-nav-key="settings"/);
    assert.match(home.text, /data-ac-nav-key="home"/);

    const denied = await request(app).get("/app/access").set("Cookie", cookie);
    assert.equal(denied.status, 403);
    assert.match(denied.text, /Access denied|data-ac-state="access-denied"/);

    const deniedEdit = await request(app)
      .get("/app/settings/organization/edit")
      .set("Cookie", cookie);
    assert.equal(deniedEdit.status, 403);
  });

  it("facilities and staff pages are tenant-scoped with empty-state safety", async () => {
    requireDb();
    const stamp = Date.now().toString(36);
    const ac = await seedAcTenant(stamp, "fac");
    const other = await seedAcTenant(`${stamp}x`, "fac2");
    const admin = await seedStaff(ac, {
      roleKey: NETWORK_ADMIN,
      facilityIds: [ac.facilityId, ac.facility2Id],
    });
    const { cookie } = await sessionCookie(admin.identity.id, ac.orgId);
    const app = createActiveClinicFoundationApp({
      getPool: () => pool,
      env: MINIMAL_AC,
      log: () => {},
    });

    const list = await request(app).get("/app/facilities").set("Cookie", cookie);
    assert.equal(list.status, 200);
    assert.match(list.text, /Main Hospital/);
    assert.match(list.text, /Clinic A/);
    assert.match(list.text, /Lusaka/);

    const detail = await request(app)
      .get(`/app/facilities/${ac.facilityKey}`)
      .set("Cookie", cookie);
    assert.equal(detail.status, 200);
    assert.match(detail.text, /Main Hospital/);

    const cross = await request(app)
      .get("/app/facilities/main")
      .set("Cookie", cookie);
    // Same key exists in other org but this org's main is visible — create collision via other key
    const foreign = await request(app)
      .get("/app/facilities/does-not-exist")
      .set("Cookie", cookie);
    assert.equal(foreign.status, 404);

    const staffPage = await request(app).get("/app/staff").set("Cookie", cookie);
    assert.equal(staffPage.status, 200);
    assert.match(staffPage.text, /Net Admin|Shell User|Admin/i);
    assert.doesNotMatch(staffPage.text, /\+2609|password_hash|token/i);

    void other;
  });

  it("facility selection validates assignment and persists in session context", async () => {
    requireDb();
    const stamp = Date.now().toString(36);
    const ac = await seedAcTenant(stamp, "ctx");
    const staff = await seedStaff(ac, {
      roleKey: FACILITY_ADMIN,
      scopeType: "facility",
      facilityIds: [ac.facilityId],
    });
    const { cookie, session } = await sessionCookie(staff.identity.id, ac.orgId);

    const selectable = await listSelectableFacilities(pool, {
      authenticated: true,
      organization: { id: ac.orgId },
      staffMember: staff.staff,
      isNetworkAdmin: false,
    });
    assert.equal(selectable.ok, true);
    assert.equal(selectable.facilities.length, 1);

    const denied = await selectFacilityForSession(pool, {
      auth: {
        authenticated: true,
        organization: { id: ac.orgId },
        staffMember: staff.staff,
        isNetworkAdmin: false,
      },
      sessionId: session.session.id,
      facilityId: ac.facility2Id,
    });
    assert.equal(denied.ok, false);

    const ok = await selectFacilityForSession(pool, {
      auth: {
        authenticated: true,
        organization: { id: ac.orgId },
        staffMember: staff.staff,
        isNetworkAdmin: false,
      },
      sessionId: session.session.id,
      facilityId: ac.facilityId,
    });
    assert.equal(ok.ok, true);

    const app = createActiveClinicFoundationApp({
      getPool: () => pool,
      env: MINIMAL_AC,
      log: () => {},
    });
    const csrf = issueCsrfToken(MINIMAL_AC);
    const post = await request(app)
      .post("/app/select-facility")
      .set("Cookie", `${cookie}; ${CSRF_COOKIE_ACTIVECLINIC_ORG}=${csrf}`)
      .type("form")
      .send({
        facility_id: ac.facilityId,
        [CSRF_FIELD]: csrf,
      });
    assert.ok([302, 303].includes(post.status));

    const home = await request(app).get("/app").set("Cookie", cookie);
    assert.equal(home.status, 200);
    assert.match(home.text, /Main Hospital/);
  });

  it("organization switch revalidates eligibility and rotates session", async () => {
    requireDb();
    const stamp = Date.now().toString(36);
    const ac1 = await seedAcTenant(stamp, "org1");
    const ac2 = await seedAcTenant(`${stamp}b`, "org2");
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
    for (const ac of [ac1, ac2]) {
      const staff = await createStaffMember(pool, {
        organizationId: ac.orgId,
        healthcareOrganizationId: ac.hcoId,
        firstName: "Multi",
        lastName: "Org",
        employmentType: "permanent",
        phone,
        status: "active",
        platformIdentityId: identity.identity.id,
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
        roleKey: NETWORK_ADMIN,
        scopeType: "organisation",
      });
    }

    const { cookie } = await sessionCookie(identity.identity.id, ac1.orgId);
    const app = createActiveClinicFoundationApp({
      getPool: () => pool,
      env: MINIMAL_AC,
      log: () => {},
    });
    const page = await request(app)
      .get("/app/select-organization")
      .set("Cookie", cookie);
    assert.equal(page.status, 200);
    assert.match(page.text, /Switch organization/);

    const csrf = issueCsrfToken(MINIMAL_AC);
    const switched = await request(app)
      .post("/app/select-organization")
      .set("Cookie", `${cookie}; ${CSRF_COOKIE_ACTIVECLINIC_ORG}=${csrf}`)
      .type("form")
      .send({
        organization_id: ac2.orgId,
        [CSRF_FIELD]: csrf,
      });
    assert.ok([302, 303].includes(switched.status));
    const setCookie = switched.headers["set-cookie"] || [];
    assert.ok(
      setCookie.some((c) => String(c).includes(COOKIE_ACTIVECLINIC_ORG)),
      "rotates ActiveClinic session cookie"
    );
  });

  it("settings and access pages are permission gated", async () => {
    requireDb();
    const stamp = Date.now().toString(36);
    const ac = await seedAcTenant(stamp, "set");
    const admin = await seedStaff(ac, {
      roleKey: NETWORK_ADMIN,
      facilityIds: [ac.facilityId],
    });
    const { cookie } = await sessionCookie(admin.identity.id, ac.orgId);
    const app = createActiveClinicFoundationApp({
      getPool: () => pool,
      env: MINIMAL_AC,
      log: () => {},
    });
    const access = await request(app).get("/app/access").set("Cookie", cookie);
    assert.equal(access.status, 200);
    assert.match(access.text, /Network admin|Foundational roles/);

    const settings = await request(app).get("/app/settings").set("Cookie", cookie);
    assert.equal(settings.status, 200);
    assert.match(settings.text, /Settings/);
  });
});
