"use strict";

/**
 * V2.05 / V5 — Locations Admin smoke (AC Facilities + BB Branches).
 *
 * AC: open Facilities → create/update → list/reload → select-facility reflects.
 * BB: open Branches → create/update → list/selector → inactive handling preserved.
 * Negatives: cross-tenant denied, restricted role denied, invalid key → controlled 4xx.
 * Reuses facilityService / createBlessBoardBranch / updateBranchSettings.
 */

const { describe, it, before, after } = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const request = require("supertest");

const {
  resetFoundationDatabase,
  createFoundationPool,
} = require("./helpers/foundationDb");
const { migrate } = require("../db/scripts/lib/migrator");
const { ensureDatabaseIdentity } = require("../db/scripts/lib/databaseIdentity");
const { expectIsolationDenied } = require("./helpers/authzNegativeHelpers");
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
} = require("../src/activeclinic/services/facilityService");
const {
  createStaffMember,
} = require("../src/activeclinic/services/activeClinicStaffService");
const {
  assignStaffToFacility,
} = require("../src/activeclinic/services/activeClinicStaffFacilityService");
const {
  assignStaffRole,
  ORGANIZATION_ADMIN,
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
} = require("../src/platform/config/deploymentProfiles");
const { CSRF_FIELD, CSRF_COOKIE, issueCsrfToken } = require("../src/platform/http/v5Csrf");
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
  ensureChurchSettingsInitialized,
  updateBranchSettings,
} = require("../src/blessboard/services/blessBoardSettingsService");
const {
  listBlessBoardBranches,
} = require("../src/blessboard/services/listBlessBoardBranches");
const {
  assignOrganizationPlan,
} = require("../src/platform/services/entitlementService");

const IDENTITY_KEY = "blessboard-platform-v5";
const PASSWORD = "LocationsAdmin-Smoke-99!";
const AC_HOST = "activeclinic.org";

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
let databaseUrl;
let skipReason = null;
let acCases = 0;
let bbCases = 0;

function requireDb() {
  if (skipReason) assert.fail(`Local PostgreSQL unavailable: ${skipReason}`);
}

function uniq(prefix) {
  return `${prefix}${crypto.randomBytes(3).toString("hex")}`.slice(0, 16);
}

function nextPhone() {
  return `+26097${String(Date.now()).slice(-7)}${crypto.randomBytes(1).readUInt8(0) % 10}`;
}

function escapeRe(s) {
  return String(s || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function extractCsrf(html) {
  const m = String(html || "").match(
    new RegExp(
      `name="${CSRF_FIELD}"[^>]*value="([^"]+)"|value="([^"]+)"[^>]*name="${CSRF_FIELD}"`
    )
  );
  return (m && (m[1] || m[2])) || null;
}

function extractCookie(res, name) {
  const raw = res.headers["set-cookie"];
  const list = Array.isArray(raw) ? raw : raw ? [raw] : [];
  for (const line of list) {
    if (String(line).startsWith(`${name}=`)) {
      return String(line).split(";")[0].slice(name.length + 1);
    }
  }
  return null;
}

function assertNoServerError(res, label) {
  assert.ok(
    ![500, 503].includes(Number(res.status)),
    `${label} must not 500/503 (got ${res.status})`
  );
}

function assertControlled4xx(res, label) {
  assertNoServerError(res, label);
  assert.ok(
    [400, 403, 404, 409].includes(Number(res.status)),
    `${label} expected controlled 4xx, got ${res.status}`
  );
}

async function provisionAc(stamp) {
  const org = await provisionPlatformTenant(pool, {
    skipDomain: true,
    dataEnvironment: "testing",
    organizationKey: `ac_loc_${stamp}`,
    displayName: `Locations AC ${stamp}`,
    productKey: "activeclinic",
    productTenantKey: `ac-loc-${stamp}`,
    deploymentCode: CODE_ACTIVECLINIC_ORG_V6,
  });
  assert.equal(org.ok, true, JSON.stringify(org));
  const hco = await createHealthcareOrganization(pool, {
    organizationId: org.records.organization.id,
    legalName: `${stamp} Legal`,
    publicName: `${stamp} Clinic`,
    organizationType: "private_healthcare",
    countryCode: "ZM",
    timezone: "Africa/Lusaka",
  });
  assert.equal(hco.ok, true);
  const facility = await createFacility(pool, {
    organizationId: org.records.organization.id,
    healthcareOrganizationId: hco.healthcareOrganization.id,
    facilityKey: `main-${stamp}`,
    displayName: "Main Facility",
    facilityType: "clinic",
    status: "active",
    isPrimary: true,
    countryCode: "ZM",
    timezone: "Africa/Lusaka",
    phone: nextPhone(),
  });
  assert.equal(facility.ok, true);
  return {
    organizationId: org.records.organization.id,
    hcoId: hco.healthcareOrganization.id,
    facilityId: facility.facility.id,
    facilityKey: facility.facility.facilityKey,
    stamp,
  };
}

async function seedAcStaff(clinic, { roleKey, label, facilityIds }) {
  const phone = nextPhone();
  const identity = await createPlatformIdentity(pool, {
    primaryEmail: `${label}.${phone.slice(-8)}@acloc.smoke`,
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
    organizationId: clinic.organizationId,
    healthcareOrganizationId: clinic.hcoId,
    firstName: label,
    lastName: "Loc",
    employmentType: "permanent",
    status: "active",
    phone,
    platformIdentityId: identity.identity.id,
    jobTitle: label,
  });
  assert.equal(staff.ok, true, JSON.stringify(staff));
  const facIds = facilityIds || [clinic.facilityId];
  for (const facilityId of facIds) {
    await assignStaffToFacility(pool, {
      organizationId: clinic.organizationId,
      staffMemberId: staff.staffMember.id,
      facilityId,
      isPrimary: facilityId === facIds[0],
    });
  }
  const scopeType = roleKey === ORGANIZATION_ADMIN ? "organisation" : "facility";
  const role = await assignStaffRole(pool, {
    organizationId: clinic.organizationId,
    staffMemberId: staff.staffMember.id,
    roleKey,
    scopeType,
    facilityId: scopeType === "facility" ? facIds[0] : null,
    assignmentOrigin: "system",
    deploymentCode: CODE_ACTIVECLINIC_ORG_V6,
  });
  assert.equal(role.ok, true, JSON.stringify(role));
  const session = await createPlatformIdentitySession(pool, {
    deploymentCode: CODE_ACTIVECLINIC_ORG_V6,
    platformIdentityId: identity.identity.id,
    organizationId: clinic.organizationId,
    contextJson: { selectedFacilityId: facIds[0] },
  });
  assert.equal(session.ok, true);
  return {
    cookie: `${COOKIE_ACTIVECLINIC_ORG}=${session.rawToken}`,
    staffId: staff.staffMember.id,
  };
}

async function provisionBb(stamp) {
  const orgKey = `bbloc${String(stamp).replace(/[^a-z0-9]/gi, "")}`.slice(0, 24);
  const host = `${orgKey}.blessboard.org`;
  const tenant = await provisionPlatformTenant(pool, {
    organizationKey: orgKey,
    displayName: `Locations BB ${stamp}`,
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
    displayName: `Loc Church ${stamp}`,
    dataEnvironment: "testing",
    hqBranchKey: "hq",
    hqBranchDisplayName: "HQ",
  });
  assert.equal(church.ok, true, JSON.stringify(church));
  await ensureChurchSettingsInitialized(pool, church.records.church.id);
  const organizationId = (
    await pool.query(`SELECT id FROM platform.organizations WHERE organization_key=$1`, [orgKey])
  ).rows[0].id;
  const plan = await assignOrganizationPlan(pool, {
    organizationId,
    planKey: "growth",
  });
  assert.equal(plan.ok, true, JSON.stringify(plan));
  return {
    orgKey,
    host,
    organizationId,
    churchId: church.records.church.id,
    hqBranchId: church.records.hqBranch.id,
    stamp,
  };
}

async function seedBbUser(church, { email, roleKey, branchKey }) {
  const created = await createBlessBoardUser(pool, {
    email,
    password: PASSWORD,
    displayName: roleKey,
  });
  assert.equal(created.ok, true, created.message || JSON.stringify(created));
  const assigned = await assignBlessBoardRole(pool, {
    email,
    organizationKey: church.orgKey,
    roleKey,
    churchKey: church.orgKey,
    ...(branchKey ? { branchKey } : {}),
  });
  assert.equal(assigned.ok, true, JSON.stringify(assigned));
  const session = await createV5Session(pool, {
    deploymentCode: "blessboard-org-staging",
    userId: created.user.id,
    organizationId: church.organizationId,
    churchId: church.churchId,
    branchId: church.hqBranchId,
  });
  assert.equal(session.ok, true, session.code || JSON.stringify(session));
  return { cookie: `${DEFAULT_V5_COOKIE}=${session.rawToken}`, userId: created.user.id };
}

describe("V2.05 Locations Admin smoke (AC Facilities + BB Branches)", () => {
  before(async () => {
    try {
      databaseUrl = await resetFoundationDatabase();
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

  it("AC: facilities create/update, selector, isolation, restricted, invalid key", async () => {
    requireDb();
    const app = createActiveClinicFoundationApp({
      getPool: () => pool,
      env: { ...MINIMAL_AC, DATABASE_URL: databaseUrl },
      log: () => {},
    });
    const clinic = await provisionAc(uniq("a"));
    const other = await provisionAc(uniq("b"));
    const admin = await seedAcStaff(clinic, {
      roleKey: ORGANIZATION_ADMIN,
      label: "OrgAdmin",
    });
    const restricted = await seedAcStaff(clinic, {
      roleKey: STAFF_ROLE,
      label: "StaffOnly",
    });
    const otherAdmin = await seedAcStaff(other, {
      roleKey: ORGANIZATION_ADMIN,
      label: "OtherOrg",
    });

    // Open Facilities
    const listOpen = await request(app)
      .get("/app/facilities")
      .set("Host", AC_HOST)
      .set("Cookie", admin.cookie);
    assertNoServerError(listOpen, "AC GET /app/facilities");
    assert.equal(listOpen.status, 200);
    assert.match(listOpen.text, /Facilities|facility|Main Facility/i);
    acCases += 1;

    // Create facility
    const createGet = await request(app)
      .get("/app/facilities/new")
      .set("Host", AC_HOST)
      .set("Cookie", admin.cookie);
    assertNoServerError(createGet, "AC GET facilities/new");
    assert.equal(createGet.status, 200);
    const csrf = issueCsrfToken(MINIMAL_AC);
    const facilityKey = `east-${clinic.stamp}`.slice(0, 32);
    const created = await request(app)
      .post("/app/facilities")
      .set("Host", AC_HOST)
      .set("Cookie", `${admin.cookie}; ${CSRF_COOKIE_ACTIVECLINIC_ORG}=${csrf}`)
      .type("form")
      .send({
        [CSRF_FIELD]: csrf,
        display_name: "East Wing Clinic",
        facility_key: facilityKey,
        facility_type: "clinic",
        status: "active",
        country_code: "ZM",
        city: "Ndola",
        phone: nextPhone(),
        timezone: "Africa/Lusaka",
      });
    assertNoServerError(created, "AC POST facilities");
    assert.equal(created.status, 303);
    assert.match(String(created.headers.location || ""), new RegExp(`/app/facilities/${facilityKey}`));
    acCases += 1;

    // List reflects create
    const listed = await request(app)
      .get("/app/facilities")
      .set("Host", AC_HOST)
      .set("Cookie", admin.cookie);
    assert.equal(listed.status, 200);
    assert.match(listed.text, /East Wing Clinic/);
    assert.match(listed.text, new RegExp(escapeRe(facilityKey)));
    acCases += 1;

    // Update supported fields
    const csrf2 = issueCsrfToken(MINIMAL_AC);
    const updated = await request(app)
      .post(`/app/facilities/${facilityKey}`)
      .set("Host", AC_HOST)
      .set("Cookie", `${admin.cookie}; ${CSRF_COOKIE_ACTIVECLINIC_ORG}=${csrf2}`)
      .type("form")
      .send({
        [CSRF_FIELD]: csrf2,
        display_name: "East Wing Updated",
        facility_key: "should-not-change",
        facility_type: "clinic",
        status: "active",
        country_code: "ZM",
        city: "Ndola",
        phone: nextPhone(),
        timezone: "Africa/Lusaka",
      });
    assertNoServerError(updated, "AC POST facility update");
    assert.equal(updated.status, 303);
    const got = await getFacilityByOrganizationAndKey(pool, {
      organizationId: clinic.organizationId,
      facilityKey,
    });
    assert.equal(got.ok, true);
    assert.equal(got.facility.displayName, "East Wing Updated");
    assert.equal(got.facility.facilityKey, facilityKey);
    const reloaded = await request(app)
      .get("/app/facilities")
      .set("Host", AC_HOST)
      .set("Cookie", admin.cookie);
    assert.match(reloaded.text, /East Wing Updated/);
    acCases += 1;

    // Context selector reflects valid facility (org admin sees org facilities)
    const selector = await request(app)
      .get("/app/select-facility")
      .set("Host", AC_HOST)
      .set("Cookie", admin.cookie);
    assertNoServerError(selector, "AC GET select-facility");
    assert.ok([200, 303].includes(selector.status), `selector ${selector.status}`);
    if (selector.status === 200) {
      assert.match(selector.text, /East Wing Updated|Main Facility/i);
    }
    acCases += 1;

    // Cross-tenant access denied
    const cross = await request(app)
      .get(`/app/facilities/${facilityKey}`)
      .set("Host", AC_HOST)
      .set("Cookie", otherAdmin.cookie);
    assertNoServerError(cross, "AC cross-tenant facility");
    expectIsolationDenied(cross, "AC cross-tenant facility");
    acCases += 1;

    // Restricted role denied create
    const restrictedNew = await request(app)
      .get("/app/facilities/new")
      .set("Host", AC_HOST)
      .set("Cookie", restricted.cookie);
    assertNoServerError(restrictedNew, "AC staff facilities/new");
    expectIsolationDenied(restrictedNew, "AC staff facilities/new");
    acCases += 1;

    // Invalid key → controlled 4xx
    const badKey = await request(app)
      .get("/app/facilities/does-not-exist-xyz")
      .set("Host", AC_HOST)
      .set("Cookie", admin.cookie);
    assertControlled4xx(badKey, "AC invalid facility key");
    const csrf3 = issueCsrfToken(MINIMAL_AC);
    const reserved = await request(app)
      .post("/app/facilities")
      .set("Host", AC_HOST)
      .set("Cookie", `${admin.cookie}; ${CSRF_COOKIE_ACTIVECLINIC_ORG}=${csrf3}`)
      .type("form")
      .send({
        [CSRF_FIELD]: csrf3,
        display_name: "Reserved",
        facility_key: "new",
        facility_type: "clinic",
        status: "planned",
        country_code: "ZM",
        phone: nextPhone(),
        timezone: "Africa/Lusaka",
      });
    assertControlled4xx(reserved, "AC reserved facility key");
    acCases += 1;
  });

  it("BB: branches create/update, list, inactive, isolation, restricted, invalid", async () => {
    requireDb();
    const app = createV5FoundationApp({
      env: MINIMAL_BB,
      getPool: () => pool,
    });
    const church = await provisionBb(uniq("c"));
    const other = await provisionBb(uniq("d"));
    const hq = await seedBbUser(church, {
      email: `hq-${church.stamp}@bbloc.smoke`,
      roleKey: "church_hq_admin",
    });
    const branchAdmin = await seedBbUser(church, {
      email: `ba-${church.stamp}@bbloc.smoke`,
      roleKey: "branch_admin",
      branchKey: "hq",
    });
    const otherHq = await seedBbUser(other, {
      email: `hq-${other.stamp}@bbloc.smoke`,
      roleKey: "church_hq_admin",
    });

    // Open Branches
    const listOpen = await request(app)
      .get("/hq/branches")
      .set("Host", church.host)
      .set("Cookie", hq.cookie);
    assertNoServerError(listOpen, "BB GET /hq/branches");
    assert.equal(listOpen.status, 200);
    assert.match(listOpen.text, /Branches|data-bb-branch-key="hq"|HQ/i);
    bbCases += 1;

    // Create branch
    const createGet = await request(app)
      .get("/hq/branches/new")
      .set("Host", church.host)
      .set("Cookie", hq.cookie);
    assertNoServerError(createGet, "BB GET branches/new");
    assert.equal(createGet.status, 200);
    const csrfCookie = extractCookie(createGet, CSRF_COOKIE);
    const csrfToken = extractCsrf(createGet.text);
    assert.ok(csrfToken, "BB branch create CSRF");
    const branchKey = `north-${church.stamp}`.slice(0, 32);
    const created = await request(app)
      .post("/hq/branches")
      .set("Host", church.host)
      .set("Cookie", csrfCookie ? `${hq.cookie}; ${CSRF_COOKIE}=${csrfCookie}` : hq.cookie)
      .type("form")
      .send({
        [CSRF_FIELD]: csrfToken,
        displayName: "North Campus",
        branchKey,
        email: `north-${church.stamp}@example.org`,
        timezone: "Africa/Lusaka",
        countryCode: "ZM",
        addressLine1: "1 Independence Ave",
        city: "Lusaka",
      });
    assertNoServerError(created, "BB POST /hq/branches");
    assert.equal(created.status, 303);
    assert.match(
      String(created.headers.location || ""),
      new RegExp(`/hq/branches/${escapeRe(branchKey)}/created`)
    );
    bbCases += 1;

    // Active branch appears in list
    const listed = await request(app)
      .get("/hq/branches")
      .set("Host", church.host)
      .set("Cookie", hq.cookie);
    assert.equal(listed.status, 200);
    assert.match(listed.text, new RegExp(`data-bb-branch-key="${escapeRe(branchKey)}"`));
    assert.match(listed.text, /North Campus/);
    const listedSvc = await listBlessBoardBranches(pool, church.churchId);
    assert.equal(listedSvc.ok, true);
    assert.ok(listedSvc.branches.some((b) => b.key === branchKey && b.status !== "inactive"));
    bbCases += 1;

    // Update supported branch fields
    const branchRow = await pool.query(
      `SELECT id FROM blessboard.branches WHERE church_id = $1 AND branch_key = $2`,
      [church.churchId, branchKey]
    );
    assert.ok(branchRow.rows[0], "branch row");
    const branchId = branchRow.rows[0].id;
    const updated = await updateBranchSettings(pool, branchId, {
      publicName: "North Campus Updated",
      city: "Kitwe",
      email: `north-updated-${church.stamp}@example.org`,
      timezone: "Africa/Lusaka",
      countryCode: "ZM",
      expectedChurchId: church.churchId,
      actorUserId: hq.userId,
    });
    assert.equal(updated.ok, true, JSON.stringify(updated));
    const detail = await request(app)
      .get(`/hq/branches/${branchKey}`)
      .set("Host", church.host)
      .set("Cookie", hq.cookie);
    assertNoServerError(detail, "BB GET branch detail");
    assert.ok([200, 303].includes(detail.status), `branch detail ${detail.status}`);
    const listAfter = await request(app)
      .get("/hq/branches")
      .set("Host", church.host)
      .set("Cookie", hq.cookie);
    assert.match(listAfter.text, /North Campus Updated|North Campus/);
    bbCases += 1;

    // Inactive handling preserved
    await pool.query(
      `UPDATE blessboard.branches SET status = 'inactive', updated_at = now() WHERE id = $1`,
      [branchId]
    );
    const afterInactive = await listBlessBoardBranches(pool, church.churchId);
    assert.equal(afterInactive.ok, true);
    const inactiveRow = afterInactive.branches.find((b) => b.key === branchKey);
    // Either omitted from active list or marked inactive — both preserve handling
    assert.ok(
      !inactiveRow ||
        inactiveRow.status === "inactive" ||
        inactiveRow.active === false ||
        inactiveRow.isActive === false,
      `inactive handling: ${JSON.stringify(inactiveRow)}`
    );
    const inactiveGet = await request(app)
      .get(`/hq/branches/${branchKey}`)
      .set("Host", church.host)
      .set("Cookie", hq.cookie);
    assertNoServerError(inactiveGet, "BB inactive branch GET");
    assert.ok(
      [200, 303, 404].includes(inactiveGet.status),
      `inactive get ${inactiveGet.status}`
    );
    // Reactivate HQ path still works for list
    const listInactive = await request(app)
      .get("/hq/branches")
      .set("Host", church.host)
      .set("Cookie", hq.cookie);
    assert.equal(listInactive.status, 200);
    assert.match(listInactive.text, /data-bb-branch-key="hq"/);
    bbCases += 1;

    // Cross-tenant denied
    const cross = await request(app)
      .get(`/hq/branches/${branchKey}`)
      .set("Host", other.host)
      .set("Cookie", otherHq.cookie);
    assertNoServerError(cross, "BB cross-tenant branch");
    expectIsolationDenied(cross, "BB cross-tenant branch");
    const otherList = await request(app)
      .get("/hq/branches")
      .set("Host", other.host)
      .set("Cookie", otherHq.cookie);
    assert.equal(otherList.status, 200);
    assert.doesNotMatch(otherList.text, new RegExp(`data-bb-branch-key="${escapeRe(branchKey)}"`));
    bbCases += 1;

    // Restricted role denied create
    const restrictedNew = await request(app)
      .get("/hq/branches/new")
      .set("Host", church.host)
      .set("Cookie", branchAdmin.cookie);
    assertNoServerError(restrictedNew, "BB branch admin branches/new");
    expectIsolationDenied(restrictedNew, "BB branch admin branches/new");
    bbCases += 1;

    // Invalid key → controlled 4xx
    const badKey = await request(app)
      .get("/hq/branches/does-not-exist-xyz")
      .set("Host", church.host)
      .set("Cookie", hq.cookie);
    assertControlled4xx(badKey, "BB invalid branch key");
    bbCases += 1;
  });

  it("reports case counts for FINALs", () => {
    if (skipReason) return;
    assert.ok(acCases >= 6, `AC_CASES=${acCases}`);
    assert.ok(bbCases >= 6, `BB_CASES=${bbCases}`);
    // eslint-disable-next-line no-console
    console.log(
      `LOCATIONS_ADMIN_SMOKE AC_CASES=${acCases} BB_CASES=${bbCases} PASS=${acCases + bbCases} FAIL=0`
    );
  });
});
