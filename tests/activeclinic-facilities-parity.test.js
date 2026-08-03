"use strict";

/**
 * ActiveClinic V6 — facilities management UI (AC-V6-S03).
 * Stitch facility screens are STITCH_GAP / VISUAL_BLOCKED; tests cover functional parity.
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
  getFacilityByOrganizationAndKey,
  requireActiveFacility,
} = require("../src/activeclinic/services/facilityService");
const {
  createStaffMember,
} = require("../src/activeclinic/services/activeClinicStaffService");
const {
  assignStaffToFacility,
  listFacilitiesForStaff,
} = require("../src/activeclinic/services/activeClinicStaffFacilityService");
const {
  assignStaffRole,
  NETWORK_ADMIN,
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
  loadActiveClinicFacilitiesListScreen,
  facilityTypeLabel,
  facilityStatusLabel,
} = require("../src/activeclinic/services/loadActiveClinicFacilityScreens");

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

async function seedAcTenant(stamp, keyPrefix, opts) {
  const withSecond = !(opts && opts.singleFacility);
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
    publicName: "Juflona Facilities",
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
  let facility2 = null;
  if (withSecond) {
    facility2 = await createFacility(pool, {
      organizationId: org.records.organization.id,
      healthcareOrganizationId: hco.healthcareOrganization.id,
      facilityKey: `${keyPrefix}-clinic-a`,
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
  }
  return {
    orgId: org.records.organization.id,
    orgKey: org.records.organization.key,
    hcoId: hco.healthcareOrganization.id,
    facilityId: facility.facility.id,
    facility2Id: facility2 ? facility2.facility.id : null,
    facilityKey: facility.facility.facilityKey,
    facility2Key: facility2 ? facility2.facility.facilityKey : null,
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
    firstName: opts.firstName || "Fac",
    lastName: opts.lastName || "User",
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
  return {
    cookie: `${COOKIE_ACTIVECLINIC_ORG}=${session.rawToken}`,
    session,
  };
}

function csrfPair(env) {
  const token = issueCsrfToken(env || MINIMAL_AC);
  return {
    token,
    cookie: `${CSRF_COOKIE_ACTIVECLINIC_ORG}=${token}`,
  };
}

function makeApp() {
  return createActiveClinicFoundationApp({
    getPool: () => pool,
    env: MINIMAL_AC,
    log: () => {},
  });
}

async function countAudit(actionKey, entityId) {
  const r = await pool.query(
    `SELECT COUNT(*)::int AS n FROM platform.audit_events
      WHERE action_key = $1 AND entity_id = $2::uuid`,
    [actionKey, entityId]
  );
  return r.rows[0].n;
}

describe("ActiveClinic facilities management parity (AC-V6-S03)", () => {
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

  it("exposes plain-language facility type and status labels", () => {
    assert.equal(facilityTypeLabel("health_centre"), "Health centre");
    assert.equal(facilityStatusLabel("archived"), "Archived");
  });

  it("authorized network admin lists tenant facilities with markers and no clinical data", async () => {
    requireDb();
    const stamp = Date.now().toString(36);
    const ac = await seedAcTenant(stamp, "flist");
    const admin = await seedStaff(ac, {
      roleKey: NETWORK_ADMIN,
      facilityIds: [ac.facilityId, ac.facility2Id],
    });
    const { cookie } = await sessionCookie(admin.identity.id, ac.orgId);
    const app = makeApp();

    const list = await request(app).get("/app/facilities").set("Cookie", cookie);
    assert.equal(list.status, 200);
    assert.match(list.text, /data-ac-page-section="facilities-list"/);
    assert.match(list.text, /data-ac-visual="stitch-gap"/);
    assert.match(list.text, /data-ac-table="facilities"/);
    assert.match(list.text, /data-ac-mobile-list="facilities"/);
    assert.match(list.text, /Main Hospital/);
    assert.match(list.text, /Clinic A/);
    assert.match(list.text, /data-ac-facility-primary="1"/);
    assert.match(list.text, /Hospital|Clinic/);
    assert.match(list.text, /activeclinic\/ac-app\.css/);
    // Patients + Appointments nav are Stitch P02/P03; still forbid clinical/finance fabrication.
    assert.doesNotMatch(
      list.text,
      /revenue|ward|pharmacy stock|patient census|patients today|appointments today/i
    );
    assert.doesNotMatch(list.text, /BlessBoard|church\.css/i);
    assert.match(list.text, /<h1[\s>]/i);
    assert.equal((list.text.match(/<h1[\s>]/gi) || []).length, 1);

    const filtered = await request(app)
      .get("/app/facilities?type=clinic")
      .set("Cookie", cookie);
    assert.equal(filtered.status, 200);
    assert.match(filtered.text, /Clinic A/);
    assert.doesNotMatch(filtered.text, /Main Hospital/);

    const search = await request(app)
      .get("/app/facilities?q=kitwe")
      .set("Cookie", cookie);
    assert.equal(search.status, 200);
    assert.match(search.text, /Clinic A/);

    const emptyFilter = await request(app)
      .get("/app/facilities?q=zzzz-no-match")
      .set("Cookie", cookie);
    assert.match(emptyFilter.text, /data-ac-empty="facilities-filtered"/);

    const unauthorized = await request(app).get("/app/facilities");
    assert.ok([302, 303].includes(unauthorized.status));
  });

  it("assignment-scoped staff only sees assigned facilities; cross-tenant key denied", async () => {
    requireDb();
    const stamp = Date.now().toString(36);
    const ac = await seedAcTenant(stamp, "fscop");
    const other = await seedAcTenant(`${stamp}x`, "fscop2");
    const staff = await seedStaff(ac, {
      roleKey: STAFF_ROLE,
      facilityIds: [ac.facilityId],
      scopeType: "facility",
    });
    const { cookie } = await sessionCookie(staff.identity.id, ac.orgId);
    const app = makeApp();

    const list = await request(app).get("/app/facilities").set("Cookie", cookie);
    assert.equal(list.status, 200);
    assert.match(list.text, /Main Hospital/);
    assert.doesNotMatch(list.text, /Clinic A/);
    assert.doesNotMatch(list.text, /Add facility/);

    const detail = await request(app)
      .get(`/app/facilities/${ac.facilityKey}`)
      .set("Cookie", cookie);
    assert.equal(detail.status, 200);
    assert.match(detail.text, /data-ac-page-section="facility-detail"/);
    assert.doesNotMatch(detail.text, /Edit facility|Archive facility|Set as primary/);

    const deniedOther = await request(app)
      .get(`/app/facilities/${ac.facility2Key}`)
      .set("Cookie", cookie);
    assert.equal(deniedOther.status, 404);

    const cross = await request(app)
      .get(`/app/facilities/${other.facilityKey}`)
      .set("Cookie", cookie);
    assert.equal(cross.status, 404);
    assert.ok(!cross.text.includes(other.orgKey));
  });

  it("loader reports restricted empty when org has facilities but none are authorized", async () => {
    requireDb();
    const stamp = Date.now().toString(36);
    const ac = await seedAcTenant(stamp, "frempty");
    const staff = await seedStaff(ac, {
      roleKey: STAFF_ROLE,
      facilityIds: [ac.facilityId],
      scopeType: "facility",
    });
    await pool.query(
      `UPDATE activeclinic.staff_facility_assignments
          SET status = 'inactive'
        WHERE staff_member_id = $1`,
      [staff.staff.id]
    );
    const screen = await loadActiveClinicFacilitiesListScreen(pool, {
      auth: {
        organization: { id: ac.orgId },
        staffMember: staff.staff,
        permissions: ["activeclinic.facility.view"],
        isNetworkAdmin: false,
        selectedFacility: null,
      },
      query: {},
    });
    assert.equal(screen.emptyMode, "restricted");
    assert.equal(screen.facilities.length, 0);
  });

  it("creates, edits, sets primary, and archives with CSRF and audit events", async () => {
    requireDb();
    const stamp = Date.now().toString(36);
    const ac = await seedAcTenant(stamp, "fcrud", { singleFacility: true });
    const admin = await seedStaff(ac, {
      roleKey: NETWORK_ADMIN,
      facilityIds: [ac.facilityId],
    });
    const { cookie } = await sessionCookie(admin.identity.id, ac.orgId);
    const app = makeApp();
    const csrf = csrfPair();

    const createPage = await request(app)
      .get("/app/facilities/new")
      .set("Cookie", cookie);
    assert.equal(createPage.status, 200);
    assert.match(createPage.text, /data-ac-page-section="facility-create"/);
    assert.match(createPage.text, /name="display_name"/);
    assert.match(createPage.text, /name="facility_key"/);

    const noCsrf = await request(app)
      .post("/app/facilities")
      .set("Cookie", cookie)
      .type("form")
      .send({
        display_name: "East Wing",
        facility_key: "east-wing",
        facility_type: "clinic",
        status: "active",
        country_code: "ZM",
        phone: nextPhone(),
        timezone: "Africa/Lusaka",
      });
    assert.equal(noCsrf.status, 403);

    const badKey = await request(app)
      .post("/app/facilities")
      .set("Cookie", `${cookie}; ${csrf.cookie}`)
      .type("form")
      .send({
        [CSRF_FIELD]: csrf.token,
        display_name: "Reserved",
        facility_key: "new",
        facility_type: "clinic",
        status: "planned",
        country_code: "ZM",
        phone: nextPhone(),
        timezone: "Africa/Lusaka",
      });
    assert.equal(badKey.status, 400);
    assert.match(badKey.text, /invalid or reserved|facility key/i);

    const badPhone = await request(app)
      .post("/app/facilities")
      .set("Cookie", `${cookie}; ${csrf.cookie}`)
      .type("form")
      .send({
        [CSRF_FIELD]: csrf.token,
        display_name: "Bad Phone",
        facility_key: "bad-phone",
        facility_type: "clinic",
        status: "planned",
        country_code: "ZM",
        phone: "not-a-phone",
        timezone: "Africa/Lusaka",
      });
    assert.equal(badPhone.status, 400);

    const created = await request(app)
      .post("/app/facilities")
      .set("Cookie", `${cookie}; ${csrf.cookie}`)
      .type("form")
      .send({
        [CSRF_FIELD]: csrf.token,
        display_name: "East Wing Clinic",
        facility_key: "east-wing",
        facility_type: "clinic",
        status: "active",
        country_code: "ZM",
        city: "Ndola",
        phone: nextPhone(),
        email: "east@example.com",
        timezone: "Africa/Lusaka",
      });
    assert.equal(created.status, 303);
    assert.match(created.headers.location, /\/app\/facilities\/east-wing$/);

    const got = await getFacilityByOrganizationAndKey(pool, {
      organizationId: ac.orgId,
      facilityKey: "east-wing",
    });
    assert.equal(got.ok, true);
    assert.ok((await countAudit("activeclinic.facility.create", got.facility.id)) >= 1);

    const dup = await request(app)
      .post("/app/facilities")
      .set("Cookie", `${cookie}; ${csrf.cookie}`)
      .type("form")
      .send({
        [CSRF_FIELD]: csrf.token,
        display_name: "East Wing Dup",
        facility_key: "east-wing",
        facility_type: "clinic",
        status: "planned",
        country_code: "ZM",
        phone: nextPhone(),
        timezone: "Africa/Lusaka",
      });
    assert.equal(dup.status, 400);
    assert.match(dup.text, /already in use/i);

    const editPage = await request(app)
      .get("/app/facilities/east-wing/edit")
      .set("Cookie", cookie);
    assert.equal(editPage.status, 200);
    assert.match(editPage.text, /data-ac-page-section="facility-edit"/);
    assert.match(editPage.text, /cannot be changed after creation/);

    const updated = await request(app)
      .post("/app/facilities/east-wing")
      .set("Cookie", `${cookie}; ${csrf.cookie}`)
      .type("form")
      .send({
        [CSRF_FIELD]: csrf.token,
        display_name: "East Wing Updated",
        facility_key: "should-not-change",
        facility_type: "clinic",
        status: "active",
        country_code: "ZM",
        city: "Ndola",
        phone: got.facility.phoneDisplay,
        email: "east-updated@example.com",
        timezone: "Africa/Lusaka",
      });
    assert.equal(updated.status, 303);
    const afterUpdate = await getFacilityByOrganizationAndKey(pool, {
      organizationId: ac.orgId,
      facilityKey: "east-wing",
    });
    assert.equal(afterUpdate.ok, true);
    assert.equal(afterUpdate.facility.facilityKey, "east-wing");
    assert.equal(afterUpdate.facility.displayName, "East Wing Updated");
    assert.ok((await countAudit("activeclinic.facility.update", afterUpdate.facility.id)) >= 1);

    const detail = await request(app)
      .get("/app/facilities/east-wing")
      .set("Cookie", cookie);
    assert.match(detail.text, /Set as primary/);
    assert.match(detail.text, /data-ac-archive-confirm="1"/);

    const setPrimary = await request(app)
      .post("/app/facilities/east-wing/set-primary")
      .set("Cookie", `${cookie}; ${csrf.cookie}`)
      .type("form")
      .send({ [CSRF_FIELD]: csrf.token });
    assert.equal(setPrimary.status, 303);
    assert.match(setPrimary.headers.location, /primary=set/);
    const primaryNow = await getFacilityByOrganizationAndKey(pool, {
      organizationId: ac.orgId,
      facilityKey: "east-wing",
    });
    assert.equal(primaryNow.facility.isPrimary, true);
    const oldPrimary = await getFacilityByOrganizationAndKey(pool, {
      organizationId: ac.orgId,
      facilityKey: ac.facilityKey,
    });
    assert.equal(oldPrimary.facility.isPrimary, false);
    assert.ok((await countAudit("activeclinic.facility.set_primary", primaryNow.facility.id)) >= 1);

    const archiveNoConfirm = await request(app)
      .post("/app/facilities/east-wing/archive")
      .set("Cookie", `${cookie}; ${csrf.cookie}`)
      .type("form")
      .send({ [CSRF_FIELD]: csrf.token });
    assert.equal(archiveNoConfirm.status, 303);
    assert.match(archiveNoConfirm.headers.location, /east-wing/);

    const archived = await request(app)
      .post("/app/facilities/east-wing/archive")
      .set("Cookie", `${cookie}; ${csrf.cookie}`)
      .type("form")
      .send({
        [CSRF_FIELD]: csrf.token,
        confirm_archive: "1",
      });
    assert.equal(archived.status, 303);
    assert.match(archived.headers.location, /archived=1/);

    const afterArchive = await getFacilityByOrganizationAndKey(pool, {
      organizationId: ac.orgId,
      facilityKey: "east-wing",
    });
    assert.equal(afterArchive.facility.status, "archived");
    const operational = await requireActiveFacility(pool, {
      organizationId: ac.orgId,
      facilityKey: "east-wing",
    });
    assert.equal(operational.ok, false);
    assert.ok((await countAudit("activeclinic.facility.archive", afterArchive.facility.id)) >= 1);

    // Staff assignment history for main facility remains.
    const assignments = await listFacilitiesForStaff(pool, {
      staffMemberId: admin.staff.id,
      organizationId: ac.orgId,
    });
    assert.equal(assignments.ok, true);
    assert.ok(
      (assignments.assignments || []).some(
        (a) => String(a.facilityId) === String(ac.facilityId)
      )
    );
  });

  it("denies create/update/archive without permissions and across tenants", async () => {
    requireDb();
    const stamp = Date.now().toString(36);
    const ac = await seedAcTenant(stamp, "fdeny");
    const other = await seedAcTenant(`${stamp}y`, "fdeny2");
    const staff = await seedStaff(ac, {
      roleKey: STAFF_ROLE,
      facilityIds: [ac.facilityId],
      scopeType: "facility",
    });
    const { cookie } = await sessionCookie(staff.identity.id, ac.orgId);
    const app = makeApp();
    const csrf = csrfPair();

    const createGet = await request(app)
      .get("/app/facilities/new")
      .set("Cookie", cookie);
    assert.equal(createGet.status, 403);

    const createPost = await request(app)
      .post("/app/facilities")
      .set("Cookie", `${cookie}; ${csrf.cookie}`)
      .type("form")
      .send({
        [CSRF_FIELD]: csrf.token,
        display_name: "Nope",
        facility_key: "nope",
        facility_type: "clinic",
        status: "planned",
        country_code: "ZM",
        phone: nextPhone(),
        timezone: "Africa/Lusaka",
      });
    assert.equal(createPost.status, 403);

    const editGet = await request(app)
      .get(`/app/facilities/${ac.facilityKey}/edit`)
      .set("Cookie", cookie);
    assert.equal(editGet.status, 403);

    const archive = await request(app)
      .post(`/app/facilities/${ac.facilityKey}/archive`)
      .set("Cookie", `${cookie}; ${csrf.cookie}`)
      .type("form")
      .send({ [CSRF_FIELD]: csrf.token, confirm_archive: "1" });
    assert.equal(archive.status, 403);

    const admin = await seedStaff(ac, {
      firstName: "Net",
      lastName: "Admin",
      roleKey: NETWORK_ADMIN,
      facilityIds: [ac.facilityId, ac.facility2Id],
      phone: nextPhone(),
    });
    const adminSession = await sessionCookie(admin.identity.id, ac.orgId);
    const crossArchive = await request(app)
      .post(`/app/facilities/${other.facilityKey}/archive`)
      .set("Cookie", `${adminSession.cookie}; ${csrf.cookie}`)
      .type("form")
      .send({ [CSRF_FIELD]: csrf.token, confirm_archive: "1" });
    assert.equal(crossArchive.status, 303);
    const otherStill = await getFacilityByOrganizationAndKey(pool, {
      organizationId: other.orgId,
      facilityKey: other.facilityKey,
    });
    assert.equal(otherStill.facility.status, "active");
  });

  it("loader filters are organization-scoped and allowlisted", async () => {
    requireDb();
    const stamp = Date.now().toString(36);
    const ac = await seedAcTenant(stamp, "fload");
    const admin = await seedStaff(ac, {
      roleKey: NETWORK_ADMIN,
      facilityIds: [ac.facilityId, ac.facility2Id],
    });
    const auth = {
      organization: { id: ac.orgId },
      staffMember: admin.staff,
      permissions: [
        "activeclinic.facility.view",
        "activeclinic.facility.create",
      ],
      isNetworkAdmin: true,
      selectedFacility: null,
    };
    const statusOnly = await loadActiveClinicFacilitiesListScreen(pool, {
      auth,
      query: { status: "active", type: "hospital", primary: "1" },
    });
    assert.equal(statusOnly.ok, true);
    assert.equal(statusOnly.facilities.length, 1);
    assert.equal(statusOnly.facilities[0].facilityKey, ac.facilityKey);
    assert.equal(statusOnly.filters.status, "active");

    const ignoreBad = await loadActiveClinicFacilitiesListScreen(pool, {
      auth,
      query: { status: "nope;drop", type: "not-a-type" },
    });
    assert.equal(ignoreBad.filters.status, "");
    assert.equal(ignoreBad.filters.type, "");
  });
});
