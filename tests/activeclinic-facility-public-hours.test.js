"use strict";

/**
 * ActiveClinic public facility hours editor (V7 Phase D).
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
  updateFacility,
  RESULT: FAC_RESULT,
} = require("../src/activeclinic/services/facilityService");
const { createStaffMember } = require("../src/activeclinic/services/activeClinicStaffService");
const { assignStaffToFacility } = require("../src/activeclinic/services/activeClinicStaffFacilityService");
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
  parsePublicHoursFromForm,
  normalizeStoredPublicHours,
  WEEKDAY_KEYS,
} = require("../src/activeclinic/services/facilityPublicHours");
const {
  loadOrganizationClinicSetup,
  SETUP_CLASSIFICATION,
  hasPublicHoursConfigured,
} = require("../src/activeclinic/services/loadActiveClinicSettingsScreens");

const PASSWORD = "activeclinic-pass-12";
const MINIMAL_AC = Object.freeze({
  NODE_ENV: "test",
  PLATFORM_DEPLOYMENT_CODE: CODE_ACTIVECLINIC_ORG_V6,
  DATABASE_URL: "postgres://unused/local",
  SESSION_SECRET: "a".repeat(40),
});

let pool;
let skipReason = null;
let phoneSeq = 810000000;

function nextPhone() {
  phoneSeq += 1;
  return `+2609${String(phoneSeq).slice(-8)}`;
}

function hoursFields(spec) {
  const body = {};
  for (const key of WEEKDAY_KEYS) {
    const day = spec[key] || { closed: true };
    if (day.closed) {
      body[`hours_${key}_closed`] = "1";
    } else {
      body[`hours_${key}_start`] = day.start;
      body[`hours_${key}_end`] = day.end;
    }
  }
  return body;
}

function itemByKey(state, key) {
  return (state.items || []).find((item) => item.key === key) || null;
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

async function seedClinic(stamp) {
  const org = await provisionOrg({
    organizationKey: `hours_${stamp}`,
    displayName: `Hours Clinic ${stamp}`,
    productKey: "activeclinic",
    productTenantKey: `hours-${stamp}`,
    deploymentCode: CODE_ACTIVECLINIC_ORG_V6,
  });
  const hco = await createHealthcareOrganization(pool, {
    organizationId: org.records.organization.id,
    legalName: "Hours Legal",
    publicName: "Hours Public",
    organizationType: "private_healthcare",
    countryCode: "ZM",
    timezone: "Africa/Lusaka",
  });
  assert.equal(hco.ok, true, JSON.stringify(hco));
  const primary = await createFacility(pool, {
    organizationId: org.records.organization.id,
    healthcareOrganizationId: hco.healthcareOrganization.id,
    facilityKey: "hq",
    displayName: "HQ",
    facilityType: "clinic",
    status: "active",
    isPrimary: true,
    countryCode: "ZM",
    timezone: "Africa/Lusaka",
    phone: nextPhone(),
    city: "Lusaka",
  });
  assert.equal(primary.ok, true, JSON.stringify(primary));
  const secondary = await createFacility(pool, {
    organizationId: org.records.organization.id,
    healthcareOrganizationId: hco.healthcareOrganization.id,
    facilityKey: "branch",
    displayName: "Branch",
    facilityType: "clinic",
    status: "active",
    isPrimary: false,
    countryCode: "ZM",
    timezone: "Africa/Lusaka",
    phone: nextPhone(),
    city: "Kitwe",
  });
  assert.equal(secondary.ok, true, JSON.stringify(secondary));
  return {
    orgId: org.records.organization.id,
    orgKey: org.records.organization.key || org.records.organization.organization_key,
    hcoId: hco.healthcareOrganization.id,
    primary: primary.facility,
    secondary: secondary.facility,
  };
}

async function seedStaff(clinic, opts) {
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
    organizationId: clinic.orgId,
    healthcareOrganizationId: clinic.hcoId,
    firstName: opts.firstName || "Hours",
    lastName: opts.lastName || "Admin",
    employmentType: "permanent",
    phone,
    status: "active",
    platformIdentityId: identity.identity.id,
  });
  assert.equal(staff.ok, true, JSON.stringify(staff));
  await assignStaffToFacility(pool, {
    organizationId: clinic.orgId,
    staffMemberId: staff.staffMember.id,
    facilityId: clinic.primary.id,
    isPrimary: true,
  });
  await assignStaffRole(pool, {
    organizationId: clinic.orgId,
    staffMemberId: staff.staffMember.id,
    roleKey: opts.roleKey,
    scopeType: "organisation",
  });
  return identity.identity;
}

async function sessionCookie(identityId, orgId) {
  const session = await createPlatformIdentitySession(pool, {
    deploymentCode: CODE_ACTIVECLINIC_ORG_V6,
    platformIdentityId: identityId,
    organizationId: orgId,
  });
  assert.equal(session.ok, true, JSON.stringify(session));
  return `${COOKIE_ACTIVECLINIC_ORG}=${session.rawToken}`;
}

function csrfPair() {
  const token = issueCsrfToken(MINIMAL_AC);
  return { token, cookie: `${CSRF_COOKIE_ACTIVECLINIC_ORG}=${token}` };
}

function makeApp() {
  return createActiveClinicFoundationApp({
    getPool: () => pool,
    env: MINIMAL_AC,
    log: () => {},
  });
}

describe("ActiveClinic facility public hours", () => {
  before(async () => {
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

  beforeEach(() => {
    resetDeploymentProfileWarningsForTests();
  });

  function requireDb() {
    if (skipReason) assert.fail(`Local PostgreSQL unavailable: ${skipReason}`);
  }

  it("normalizes the existing public_hours_json week contract", () => {
    const parsed = normalizeStoredPublicHours({
      monday: "08:00-17:00",
      Sun: "Closed",
    });
    assert.equal(parsed.ok, true);
    assert.equal(parsed.json.Mon, "08:00–17:00");
    assert.equal(parsed.json.Sun, "Closed");
    const invalid = parsePublicHoursFromForm({
      hours_Mon_start: "08:00",
      hours_Mon_end: "07:00",
      hours_Tue_closed: "1",
      hours_Wed_closed: "1",
      hours_Thu_closed: "1",
      hours_Fri_closed: "1",
      hours_Sat_closed: "1",
      hours_Sun_closed: "1",
    });
    assert.equal(invalid.ok, false);
    assert.equal(invalid.code, "invalid_public_hours");
  });

  it("authorized admin can edit public hours on the existing facility screen", async () => {
    requireDb();
    const stamp = Date.now().toString(36);
    const clinic = await seedClinic(stamp);
    const admin = await seedStaff(clinic, { roleKey: NETWORK_ADMIN });
    const cookie = await sessionCookie(admin.id, clinic.orgId);
    const csrf = csrfPair();
    const app = makeApp();

    const edit = await request(app)
      .get("/app/facilities/hq/edit")
      .set("Cookie", cookie);
    assert.equal(edit.status, 200);
    assert.match(edit.text, /data-ac-public-hours-editor="1"/);

    let state = await loadOrganizationClinicSetup(pool, {
      organizationId: clinic.orgId,
      clinicKey: clinic.orgKey,
    });
    const operationsBeforeHours = state.operationsComplete;
    assert.equal(itemByKey(state, "public_hours").complete, false);
    assert.equal(itemByKey(state, "public_hours").classification, SETUP_CLASSIFICATION.RECOMMENDED);
    assert.equal(itemByKey(state, "public_hours").destinationUrl, "/app/facilities/hq/edit");

    const saved = await request(app)
      .post("/app/facilities/hq")
      .set("Cookie", `${cookie}; ${csrf.cookie}`)
      .type("form")
      .send({
        [CSRF_FIELD]: csrf.token,
        display_name: clinic.primary.displayName,
        facility_key: "hq",
        facility_type: "clinic",
        status: "active",
        country_code: "ZM",
        city: "Lusaka",
        phone: clinic.primary.phoneDisplay,
        timezone: "Africa/Lusaka",
        ...hoursFields({
          Mon: { start: "08:00", end: "17:00" },
          Tue: { start: "08:00", end: "17:00" },
          Wed: { start: "08:00", end: "17:00" },
          Thu: { start: "08:00", end: "17:00" },
          Fri: { start: "08:00", end: "16:00" },
          Sat: { start: "09:00", end: "12:00" },
          Sun: { closed: true },
        }),
      });
    assert.equal(saved.status, 303);

    const got = await getFacilityByOrganizationAndKey(pool, {
      organizationId: clinic.orgId,
      facilityKey: "hq",
    });
    assert.equal(got.ok, true);
    assert.equal(got.facility.publicHoursJson.Mon, "08:00–17:00");
    assert.equal(got.facility.publicHoursJson.Sun, "Closed");
    assert.equal(hasPublicHoursConfigured(got.facility.publicHoursJson), true);
    for (const value of Object.values(got.facility.publicHoursJson)) {
      assert.equal(typeof value, "string");
    }

    state = await loadOrganizationClinicSetup(pool, {
      organizationId: clinic.orgId,
      clinicKey: clinic.orgKey,
    });
    assert.equal(itemByKey(state, "public_hours").complete, true);
    assert.equal(itemByKey(state, "public_hours").classification, SETUP_CLASSIFICATION.RECOMMENDED);
    assert.equal(state.operationsComplete, operationsBeforeHours);

    const detail = await request(app).get("/app/facilities/hq").set("Cookie", cookie);
    assert.match(detail.text, /data-ac-facility-public-hours="1"/);
    assert.match(detail.text, /08:00–17:00/);
  });

  it("unauthorized role cannot edit public hours", async () => {
    requireDb();
    const stamp = Date.now().toString(36);
    const clinic = await seedClinic(`${stamp}u`);
    const staff = await seedStaff(clinic, { roleKey: STAFF_ROLE, firstName: "No", lastName: "Edit" });
    const cookie = await sessionCookie(staff.id, clinic.orgId);
    const csrf = csrfPair();
    const app = makeApp();
    const edit = await request(app)
      .get("/app/facilities/hq/edit")
      .set("Cookie", cookie);
    assert.ok(edit.status === 403 || edit.status === 404);
    const posted = await request(app)
      .post("/app/facilities/hq")
      .set("Cookie", `${cookie}; ${csrf.cookie}`)
      .type("form")
      .send({
        [CSRF_FIELD]: csrf.token,
        display_name: "Should not save",
        facility_key: "hq",
        facility_type: "clinic",
        status: "active",
        country_code: "ZM",
        phone: clinic.primary.phoneDisplay,
        timezone: "Africa/Lusaka",
        ...hoursFields({ Mon: { start: "08:00", end: "17:00" } }),
      });
    assert.ok(posted.status === 403 || posted.status === 404);
  });

  it("rejects invalid times and does not change timezone", async () => {
    requireDb();
    const stamp = Date.now().toString(36);
    const clinic = await seedClinic(`${stamp}i`);
    const invalid = await updateFacility(pool, {
      id: clinic.primary.id,
      organizationId: clinic.orgId,
      patch: { publicHoursJson: { Mon: "25:00-26:00" } },
    });
    assert.equal(invalid.ok, false);
    assert.equal(invalid.code, FAC_RESULT.INVALID_HOURS);

    const admin = await seedStaff(clinic, { roleKey: NETWORK_ADMIN });
    const cookie = await sessionCookie(admin.id, clinic.orgId);
    const csrf = csrfPair();
    const app = makeApp();
    const posted = await request(app)
      .post("/app/facilities/hq")
      .set("Cookie", `${cookie}; ${csrf.cookie}`)
      .type("form")
      .send({
        [CSRF_FIELD]: csrf.token,
        display_name: clinic.primary.displayName,
        facility_key: "hq",
        facility_type: "clinic",
        status: "active",
        country_code: "ZM",
        phone: clinic.primary.phoneDisplay,
        timezone: "Africa/Lusaka",
        ...hoursFields({
          Mon: { start: "18:00", end: "08:00" },
          Tue: { closed: true },
          Wed: { closed: true },
          Thu: { closed: true },
          Fri: { closed: true },
          Sat: { closed: true },
          Sun: { closed: true },
        }),
      });
    assert.equal(posted.status, 400);
    assert.match(posted.text, /data-ac-public-hours-error="1"/);
    const got = await getFacilityByOrganizationAndKey(pool, {
      organizationId: clinic.orgId,
      facilityKey: "hq",
    });
    assert.equal(got.facility.publicHoursJson, null);
    assert.equal(got.facility.timezone, "Africa/Lusaka");
  });

  it("secondary facility hours do not complete primary public-hours setup", async () => {
    requireDb();
    const stamp = Date.now().toString(36);
    const clinic = await seedClinic(`${stamp}s`);
    await updateFacility(pool, {
      id: clinic.secondary.id,
      organizationId: clinic.orgId,
      patch: {
        publicHoursJson: {
          Mon: "08:00–17:00",
          Tue: "Closed",
          Wed: "Closed",
          Thu: "Closed",
          Fri: "Closed",
          Sat: "Closed",
          Sun: "Closed",
        },
      },
    });
    const state = await loadOrganizationClinicSetup(pool, {
      organizationId: clinic.orgId,
      clinicKey: clinic.orgKey,
    });
    assert.equal(itemByKey(state, "public_hours").complete, false);
    assert.equal(itemByKey(state, "public_hours").classification, SETUP_CLASSIFICATION.RECOMMENDED);
  });

  it("rejects hours updates for another organization's facility", async () => {
    requireDb();
    const stamp = Date.now().toString(36);
    const clinicA = await seedClinic(`${stamp}a`);
    const clinicB = await seedClinic(`${stamp}b`);
    const hours = {
      Mon: "08:00–17:00",
      Tue: "Closed",
      Wed: "Closed",
      Thu: "Closed",
      Fri: "Closed",
      Sat: "Closed",
      Sun: "Closed",
    };
    const cross = await updateFacility(pool, {
      id: clinicA.primary.id,
      organizationId: clinicB.orgId,
      patch: { publicHoursJson: hours },
    });
    assert.equal(cross.ok, false);
    assert.equal(cross.code, FAC_RESULT.NOT_FOUND);
    const unchanged = await getFacilityByOrganizationAndKey(pool, {
      organizationId: clinicA.orgId,
      facilityKey: "hq",
    });
    assert.equal(unchanged.ok, true);
    assert.equal(unchanged.facility.publicHoursJson, null);
  });
});
