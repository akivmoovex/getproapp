"use strict";

/**
 * V2.05 / V5 — Admin Console settings persistence (AC + BB).
 *
 * Low-risk settings only:
 * - AC: organization public_name via /app/settings/organization
 * - BB: church denomination via /hq/settings
 *
 * Flow: open → update → save → reload persists → related model → second
 * tenant unchanged → unauthorized denied → missing CSRF rejected.
 * Does not touch password/email identity.
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
const { createFacility } = require("../src/activeclinic/services/facilityService");
const {
  createStaffMember,
} = require("../src/activeclinic/services/activeClinicStaffService");
const {
  assignStaffToFacility,
} = require("../src/activeclinic/services/activeClinicStaffFacilityService");
const {
  assignStaffRole,
  ORGANIZATION_ADMIN,
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
} = require("../src/blessboard/services/blessBoardSettingsService");

const IDENTITY_KEY = "blessboard-platform-v5";
const PASSWORD = "SettingsPersist-Smoke-99!";
const AC_HOST = "activeclinic.org";
const AC_SETTING = "public_name";
const BB_SETTING = "denomination";

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
let pass = 0;
let fail = 0;

function requireDb() {
  if (skipReason) assert.fail(`Local PostgreSQL unavailable: ${skipReason}`);
}

function uniq(prefix) {
  return `${prefix}${crypto.randomBytes(3).toString("hex")}`.slice(0, 20);
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

async function provisionAc(stamp, publicName) {
  const org = await provisionPlatformTenant(pool, {
    skipDomain: true,
    dataEnvironment: "testing",
    organizationKey: `ac_sp_${stamp}`,
    displayName: publicName || `Settings AC ${stamp}`,
    productKey: "activeclinic",
    productTenantKey: `ac-sp-${stamp}`,
    deploymentCode: CODE_ACTIVECLINIC_ORG_V6,
  });
  assert.equal(org.ok, true, JSON.stringify(org));
  const hco = await createHealthcareOrganization(pool, {
    organizationId: org.records.organization.id,
    legalName: `${stamp} Legal`,
    publicName: publicName || `${stamp} Clinic`,
    organizationType: "private_healthcare",
    countryCode: "ZM",
    timezone: "Africa/Lusaka",
  });
  assert.equal(hco.ok, true, JSON.stringify(hco));
  const facility = await createFacility(pool, {
    organizationId: org.records.organization.id,
    healthcareOrganizationId: hco.healthcareOrganization.id,
    facilityKey: `f-${stamp}`,
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
    publicName: hco.healthcareOrganization.publicName || publicName,
    stamp,
  };
}

async function seedAcStaff(clinic, { roleKey, label }) {
  const phone = nextPhone();
  const identity = await createPlatformIdentity(pool, {
    primaryEmail: `${label}.${phone.slice(-8)}@acsettings.smoke`,
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
    lastName: "Settings",
    employmentType: "permanent",
    status: "active",
    phone,
    platformIdentityId: identity.identity.id,
    jobTitle: label,
  });
  assert.equal(staff.ok, true, JSON.stringify(staff));
  await assignStaffToFacility(pool, {
    organizationId: clinic.organizationId,
    staffMemberId: staff.staffMember.id,
    facilityId: clinic.facilityId,
    isPrimary: true,
  });
  const scopeType = roleKey === ORGANIZATION_ADMIN ? "organisation" : "facility";
  const role = await assignStaffRole(pool, {
    organizationId: clinic.organizationId,
    staffMemberId: staff.staffMember.id,
    roleKey,
    scopeType,
    facilityId: scopeType === "facility" ? clinic.facilityId : null,
    assignmentOrigin: "system",
    deploymentCode: CODE_ACTIVECLINIC_ORG_V6,
  });
  assert.equal(role.ok, true, JSON.stringify(role));
  const session = await createPlatformIdentitySession(pool, {
    deploymentCode: CODE_ACTIVECLINIC_ORG_V6,
    platformIdentityId: identity.identity.id,
    organizationId: clinic.organizationId,
    contextJson: { selectedFacilityId: clinic.facilityId },
  });
  assert.equal(session.ok, true);
  return { cookie: `${COOKIE_ACTIVECLINIC_ORG}=${session.rawToken}` };
}

async function provisionBb(stamp) {
  const orgKey = `bbsp${String(stamp).replace(/[^a-z0-9]/gi, "")}`.slice(0, 24);
  const host = `${orgKey}.blessboard.org`;
  const tenant = await provisionPlatformTenant(pool, {
    organizationKey: orgKey,
    displayName: `Settings BB ${stamp}`,
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
    displayName: `Settings Church ${stamp}`,
    dataEnvironment: "testing",
    hqBranchKey: "hq",
    hqBranchDisplayName: "HQ",
  });
  assert.equal(church.ok, true, JSON.stringify(church));
  await ensureChurchSettingsInitialized(pool, church.records.church.id);
  const organizationId = (
    await pool.query(`SELECT id FROM platform.organizations WHERE organization_key=$1`, [orgKey])
  ).rows[0].id;
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

describe("V2.05 Admin Console settings persistence (AC + BB)", () => {
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

  it(`AC setting ${AC_SETTING}: save, reload, isolation, CSRF, unauthorized`, async () => {
    requireDb();
    const app = createActiveClinicFoundationApp({
      getPool: () => pool,
      env: { ...MINIMAL_AC, DATABASE_URL: databaseUrl },
      log: () => {},
    });
    const clinic = await provisionAc(uniq("a"), "Original AC Clinic");
    const other = await provisionAc(uniq("b"), "Other AC Clinic Untouched");
    const admin = await seedAcStaff(clinic, {
      roleKey: ORGANIZATION_ADMIN,
      label: "OrgAdmin",
    });
    const receptionist = await seedAcStaff(clinic, {
      roleKey: RECEPTIONIST,
      label: "Recept",
    });
    const otherAdmin = await seedAcStaff(other, {
      roleKey: ORGANIZATION_ADMIN,
      label: "OtherAdmin",
    });

    // Open Settings → organization
    const settingsHub = await request(app)
      .get("/app/settings")
      .set("Host", AC_HOST)
      .set("Cookie", admin.cookie);
    assertNoServerError(settingsHub, "AC GET /app/settings");
    assert.ok([200, 303].includes(settingsHub.status), `settings hub ${settingsHub.status}`);
    pass += 1;

    const edit = await request(app)
      .get("/app/settings/organization/edit")
      .set("Host", AC_HOST)
      .set("Cookie", admin.cookie);
    assertNoServerError(edit, "AC GET organization/edit");
    assert.equal(edit.status, 200);
    assert.match(edit.text, /name="public_name"/);
    pass += 1;

    // Missing CSRF rejected
    const noCsrf = await request(app)
      .post("/app/settings/organization")
      .set("Host", AC_HOST)
      .set("Cookie", admin.cookie)
      .type("form")
      .send({
        public_name: "Should Not Save",
        legal_name: "Legal",
        organization_type: "private_healthcare",
        country_code: "ZM",
        timezone: "Africa/Lusaka",
      });
    assertNoServerError(noCsrf, "AC missing CSRF");
    assert.equal(noCsrf.status, 403);
    pass += 1;

    // Update supported setting and save
    const csrf = issueCsrfToken(MINIMAL_AC);
    const newPublicName = `Persisted AC Clinic ${clinic.stamp}`;
    const saved = await request(app)
      .post("/app/settings/organization")
      .set("Host", AC_HOST)
      .set("Cookie", `${admin.cookie}; ${CSRF_COOKIE_ACTIVECLINIC_ORG}=${csrf}`)
      .type("form")
      .send({
        [CSRF_FIELD]: csrf,
        public_name: newPublicName,
        legal_name: `${clinic.stamp} Legal`,
        organization_type: "private_healthcare",
        country_code: "ZM",
        timezone: "Africa/Lusaka",
      });
    assertNoServerError(saved, "AC POST organization");
    assert.equal(saved.status, 303);
    assert.match(String(saved.headers.location || ""), /\/app\/settings\/organization/);
    pass += 1;

    // Reload — value persists
    const reloaded = await request(app)
      .get("/app/settings/organization")
      .set("Host", AC_HOST)
      .set("Cookie", admin.cookie);
    assertNoServerError(reloaded, "AC reload organization");
    assert.equal(reloaded.status, 200);
    assert.match(reloaded.text, new RegExp(escapeRe(newPublicName)));
    pass += 1;

    // Related model reflects
    const row = await pool.query(
      `SELECT public_name FROM activeclinic.healthcare_organizations WHERE id = $1`,
      [clinic.hcoId]
    );
    assert.equal(row.rows[0].public_name, newPublicName);
    pass += 1;

    // Second tenant unchanged
    const otherRow = await pool.query(
      `SELECT public_name FROM activeclinic.healthcare_organizations WHERE id = $1`,
      [other.hcoId]
    );
    assert.equal(otherRow.rows[0].public_name, "Other AC Clinic Untouched");
    const otherPage = await request(app)
      .get("/app/settings/organization")
      .set("Host", AC_HOST)
      .set("Cookie", otherAdmin.cookie);
    assert.equal(otherPage.status, 200);
    assert.doesNotMatch(otherPage.text, new RegExp(escapeRe(newPublicName)));
    pass += 1;

    // Unauthorized role denied
    const deniedEdit = await request(app)
      .get("/app/settings/organization/edit")
      .set("Host", AC_HOST)
      .set("Cookie", receptionist.cookie);
    assertNoServerError(deniedEdit, "AC receptionist edit");
    expectIsolationDenied(deniedEdit, "AC receptionist edit");
    const csrf2 = issueCsrfToken(MINIMAL_AC);
    const deniedPost = await request(app)
      .post("/app/settings/organization")
      .set("Host", AC_HOST)
      .set("Cookie", `${receptionist.cookie}; ${CSRF_COOKIE_ACTIVECLINIC_ORG}=${csrf2}`)
      .type("form")
      .send({
        [CSRF_FIELD]: csrf2,
        public_name: "Receptionist Hijack",
        legal_name: "Hijack",
        organization_type: "private_healthcare",
        country_code: "ZM",
        timezone: "Africa/Lusaka",
      });
    assertNoServerError(deniedPost, "AC receptionist POST");
    expectIsolationDenied(deniedPost, "AC receptionist POST");
    const still = await pool.query(
      `SELECT public_name FROM activeclinic.healthcare_organizations WHERE id = $1`,
      [clinic.hcoId]
    );
    assert.equal(still.rows[0].public_name, newPublicName);
    pass += 1;
  });

  it(`BB setting ${BB_SETTING}: save, reload, isolation, CSRF, unauthorized`, async () => {
    requireDb();
    const app = createV5FoundationApp({
      env: MINIMAL_BB,
      getPool: () => pool,
    });
    const church = await provisionBb(uniq("c"));
    const other = await provisionBb(uniq("d"));
    const hq = await seedBbUser(church, {
      email: `hq-${church.stamp}@bbsettings.smoke`,
      roleKey: "church_hq_admin",
    });
    const branchAdmin = await seedBbUser(church, {
      email: `ba-${church.stamp}@bbsettings.smoke`,
      roleKey: "branch_admin",
      branchKey: "hq",
    });
    const otherHq = await seedBbUser(other, {
      email: `hq-${other.stamp}@bbsettings.smoke`,
      roleKey: "church_hq_admin",
    });

    // Open Settings
    const page = await request(app)
      .get("/hq/settings")
      .set("Host", church.host)
      .set("Cookie", hq.cookie);
    assertNoServerError(page, "BB GET /hq/settings");
    assert.equal(page.status, 200);
    assert.match(page.text, /name="denomination"|Organization|Church settings/i);
    pass += 1;

    // Missing CSRF rejected
    const noCsrf = await request(app)
      .post("/hq/settings")
      .set("Host", church.host)
      .set("Cookie", hq.cookie)
      .type("form")
      .send({
        action: "church",
        publicName: `Settings Church ${church.stamp}`,
        denomination: "Should Not Save",
        websiteStatus: "draft",
      });
    assertNoServerError(noCsrf, "BB missing CSRF");
    assert.equal(noCsrf.status, 403);
    pass += 1;

    // Update denomination (low-risk) and save — keep other church fields stable
    const csrfCookie = extractCookie(page, CSRF_COOKIE);
    const csrfToken = extractCsrf(page.text);
    assert.ok(csrfToken, "BB settings CSRF");
    const newDenomination = `Persisted Denom ${church.stamp}`;
    const publicName = `Settings Church ${church.stamp}`;
    const saved = await request(app)
      .post("/hq/settings")
      .set("Host", church.host)
      .set("Cookie", csrfCookie ? `${hq.cookie}; ${CSRF_COOKIE}=${csrfCookie}` : hq.cookie)
      .type("form")
      .send({
        [CSRF_FIELD]: csrfToken,
        action: "church",
        publicName,
        denomination: newDenomination,
        defaultTimezone: "Africa/Lusaka",
        defaultCountryCode: "ZM",
        websiteStatus: "draft",
      });
    assertNoServerError(saved, "BB POST /hq/settings");
    assert.equal(saved.status, 303);
    assert.equal(String(saved.headers.location || ""), "/hq/settings?saved=1");
    pass += 1;

    // Reload — value persists
    const reloaded = await request(app)
      .get("/hq/settings")
      .set("Host", church.host)
      .set("Cookie", hq.cookie);
    assertNoServerError(reloaded, "BB reload settings");
    assert.equal(reloaded.status, 200);
    assert.match(reloaded.text, new RegExp(escapeRe(newDenomination)));
    pass += 1;

    // Related model reflects (church_settings)
    const row = await pool.query(
      `SELECT denomination, public_name FROM blessboard.church_settings WHERE church_id = $1`,
      [church.churchId]
    );
    assert.equal(row.rows[0].denomination, newDenomination);
    assert.equal(row.rows[0].public_name, publicName);
    pass += 1;

    // Second tenant unchanged
    const otherRow = await pool.query(
      `SELECT denomination FROM blessboard.church_settings WHERE church_id = $1`,
      [other.churchId]
    );
    assert.notEqual(otherRow.rows[0].denomination, newDenomination);
    const otherPage = await request(app)
      .get("/hq/settings")
      .set("Host", other.host)
      .set("Cookie", otherHq.cookie);
    assert.equal(otherPage.status, 200);
    assert.doesNotMatch(otherPage.text, new RegExp(escapeRe(newDenomination)));
    pass += 1;

    // Unauthorized role denied (branch admin cannot manage org settings)
    const deniedGet = await request(app)
      .get("/hq/settings")
      .set("Host", church.host)
      .set("Cookie", branchAdmin.cookie);
    assertNoServerError(deniedGet, "BB branch admin GET settings");
    expectIsolationDenied(deniedGet, "BB branch admin GET settings");
    const csrf2 = extractCsrf(reloaded.text) || csrfToken;
    const deniedPost = await request(app)
      .post("/hq/settings")
      .set("Host", church.host)
      .set("Cookie", `${branchAdmin.cookie}; ${CSRF_COOKIE}=${csrf2}`)
      .type("form")
      .send({
        [CSRF_FIELD]: csrf2,
        action: "church",
        publicName,
        denomination: "Branch Hijack",
        websiteStatus: "draft",
      });
    assertNoServerError(deniedPost, "BB branch admin POST");
    expectIsolationDenied(deniedPost, "BB branch admin POST");
    const still = await pool.query(
      `SELECT denomination FROM blessboard.church_settings WHERE church_id = $1`,
      [church.churchId]
    );
    assert.equal(still.rows[0].denomination, newDenomination);
    pass += 1;
  });

  it("reports FINALs", () => {
    if (skipReason) return;
    assert.ok(pass >= 10, `PASS=${pass}`);
    // eslint-disable-next-line no-console
    console.log(
      `ADMIN_CONSOLE_SETTINGS_PERSISTENCE AC_SETTING=${AC_SETTING} BB_SETTING=${BB_SETTING} PASS=${pass} FAIL=${fail}`
    );
  });
});
