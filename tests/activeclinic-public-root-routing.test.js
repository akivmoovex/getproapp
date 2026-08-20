"use strict";

/**
 * Hostname-aware ActiveClinic public root routing under moovex-platform-testing.
 * GET / on activeclinic.pronline.org must be ACW01, not login.
 */

const { describe, it, before, after } = require("node:test");
const assert = require("node:assert/strict");
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
  NETWORK_ADMIN,
} = require("../src/activeclinic/services/activeClinicAuthorizationService");
const {
  createMoovexPlatformRuntimeApp,
  buildDefaultProductApps,
} = require("../src/platform/http/moovexPlatformRuntimeServer");
const {
  CSRF_FIELD,
  getCsrfCookieName,
} = require("../src/platform/http/v5Csrf");
const {
  CODE_MOOVEX_PLATFORM_TESTING,
  resetDeploymentProfileWarningsForTests,
} = require("../src/platform/config/deploymentProfiles");

const IDENTITY_KEY = "moovex-platform-v7";
const PASSWORD = "activeclinic-root-pass-12";
const AC_HOST = "activeclinic.pronline.org";
const BB_HOST = "blessboard.pronline.org";
const GP_HOST = "getproapp.pronline.org";
const PLATFORM_HOST = "pronline.org";
const UNIFIED_SID = "moovex_platform_testing_sid";

const UNIFIED_ENV = Object.freeze({
  NODE_ENV: "test",
  DEPLOYMENT_ENV: "testing",
  PLATFORM_DEPLOYMENT_CODE: CODE_MOOVEX_PLATFORM_TESTING,
  DATABASE_IDENTITY_EXPECTED: IDENTITY_KEY,
  DATABASE_IDENTITY_ENV: "testing",
  SESSION_SECRET: "test-session-secret-at-least-32-chars!!",
});

let pool;
let skipReason = null;
let app;
let phoneSeq = 840000000;

function nextPhone() {
  phoneSeq += 1;
  return `+2609${String(phoneSeq).slice(-8)}`;
}

function extractCookie(res, name) {
  const raw = res.headers["set-cookie"] || [];
  const list = Array.isArray(raw) ? raw : [raw];
  for (const line of list) {
    if (String(line).startsWith(`${name}=`)) {
      return String(line).split(";")[0].slice(name.length + 1);
    }
  }
  return null;
}

function assertAcw01Homepage(res, label) {
  assert.equal(res.status, 200, `${label} status ${res.status}`);
  assert.equal(res.headers.location, undefined, `${label} must not redirect`);
  assert.match(res.text, /data-ac-acw-screen="ACW01"/, label);
  assert.match(res.text, /data-ac-page="public-home"/, label);
  assert.match(res.text, /data-ac-shell="public"/, label);
  assert.match(res.text, /Find a Clinic/, label);
  assert.match(res.text, /Register Your Clinic/, label);
  assert.match(res.text, /href="\/login"/, label);
  assert.doesNotMatch(res.text, /data-ac-page="login"/, label);
  assert.doesNotMatch(res.text, /data-ac-composition="acw08-login"/, label);
  assert.doesNotMatch(res.text, /name="password"/, label);
}

describe("ActiveClinic hostname-aware public root routing", () => {
  before(async () => {
    resetDeploymentProfileWarningsForTests();
    try {
      const databaseUrl = await resetFoundationDatabase();
      pool = createFoundationPool(databaseUrl);
      await migrate({ connectionString: databaseUrl });
      await ensureDatabaseIdentity(pool, {
        connectionString: databaseUrl,
        identityKey: IDENTITY_KEY,
        environmentCode: "testing",
      });
      await pool.query(
        `INSERT INTO platform.deployments (
           deployment_code, application_code, release_version, canonical_domain,
           environment_code, status, jobs_enabled, database_access_mode, session_cookie_name
         ) VALUES (
           $1, 'platform', 'v7', 'pronline.org',
           'testing', 'active', false, 'read_write', 'moovex_platform_testing_sid'
         )
         ON CONFLICT (deployment_code) DO UPDATE SET
           status = 'active',
           application_code = 'platform',
           session_cookie_name = EXCLUDED.session_cookie_name,
           updated_at = now()`,
        [CODE_MOOVEX_PLATFORM_TESTING]
      );
      app = createMoovexPlatformRuntimeApp({
        env: UNIFIED_ENV,
        getPool: () => pool,
        productApps: buildDefaultProductApps({
          env: UNIFIED_ENV,
          getPool: () => pool,
        }),
      });
    } catch (err) {
      skipReason = err && err.message ? err.message : String(err);
    }
  });

  after(async () => {
    if (pool) await pool.end().catch(() => {});
  });

  function requireDb() {
    if (skipReason) assert.fail(`Local PostgreSQL unavailable: ${skipReason}`);
  }

  it("1. anonymous activeclinic.pronline.org/ is ACW01 homepage, not login", async () => {
    requireDb();
    const res = await request(app).get("/").set("Host", AC_HOST).set("Accept", "text/html");
    assertAcw01Homepage(res, "AC /");
  });

  it("2. anonymous activeclinic.pronline.org/login is ACW08 shared login", async () => {
    requireDb();
    const res = await request(app).get("/login").set("Host", AC_HOST).set("Accept", "text/html");
    assert.equal(res.status, 200);
    assert.match(res.text, /data-ac-page="login"/);
    assert.match(res.text, /data-ac-composition="acw08-login"/);
    assert.match(res.text, /Sign in/);
    assert.doesNotMatch(res.text, /data-ac-acw-screen="ACW01"/);
  });

  it("3. anonymous activeclinic.pronline.org/app requires authentication", async () => {
    requireDb();
    const res = await request(app).get("/app").set("Host", AC_HOST).set("Accept", "text/html");
    assert.equal(res.status, 303);
    assert.equal(res.headers.location, "/login");
  });

  it("4. authenticated ActiveClinic user /app is the internal app", async () => {
    requireDb();
    const stamp = Date.now().toString(36);
    const phone = nextPhone();
    const org = await provisionPlatformTenant(pool, {
      skipDomain: true,
      dataEnvironment: "testing",
      organizationKey: `ac_root_${stamp}`,
      displayName: `AC Root ${stamp}`,
      productKey: "activeclinic",
      productTenantKey: `ac-root-${stamp}`,
      deploymentCode: CODE_MOOVEX_PLATFORM_TESTING,
    });
    assert.equal(org.ok, true, JSON.stringify(org));
    const hco = await createHealthcareOrganization(pool, {
      organizationId: org.records.organization.id,
      legalName: "Legal",
      publicName: `Public ${stamp}`,
      organizationType: "private_healthcare",
      countryCode: "ZM",
      timezone: "Africa/Lusaka",
    });
    assert.equal(hco.ok, true);
    const facility = await createFacility(pool, {
      organizationId: org.records.organization.id,
      healthcareOrganizationId: hco.healthcareOrganization.id,
      facilityKey: "main",
      displayName: "Main",
      facilityType: "hospital",
      status: "active",
      isPrimary: true,
      countryCode: "ZM",
      timezone: "Africa/Lusaka",
      phone: nextPhone(),
      city: "Lusaka",
    });
    assert.equal(facility.ok, true);
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
      organizationId: org.records.organization.id,
      healthcareOrganizationId: hco.healthcareOrganization.id,
      firstName: "Root",
      lastName: "User",
      employmentType: "permanent",
      phone,
      status: "active",
      platformIdentityId: identity.identity.id,
    });
    assert.equal(staff.ok, true, JSON.stringify(staff));
    await assignStaffToFacility(pool, {
      organizationId: org.records.organization.id,
      staffMemberId: staff.staffMember.id,
      facilityId: facility.facility.id,
      isPrimary: true,
    });
    await assignStaffRole(pool, {
      organizationId: org.records.organization.id,
      staffMemberId: staff.staffMember.id,
      roleKey: NETWORK_ADMIN,
      scopeType: "organisation",
      facilityId: null,
    });

    const getLogin = await request(app).get("/login").set("Host", AC_HOST);
    const csrfName = getCsrfCookieName(UNIFIED_ENV);
    const csrfCookie = extractCookie(getLogin, csrfName);
    const match = getLogin.text.match(/name="_csrf" value="([^"]+)"/);
    const post = await request(app)
      .post("/login")
      .set("Host", AC_HOST)
      .set("Cookie", csrfCookie ? `${csrfName}=${csrfCookie}` : "")
      .set("Accept", "text/html")
      .type("form")
      .send({
        [CSRF_FIELD]: match ? match[1] : "",
        identifier: phone,
        password: PASSWORD,
      });
    assert.equal(post.status, 303, post.text && post.text.slice(0, 400));
    const dest = String(post.headers.location || "");
    assert.ok(dest === "/app" || dest === "/app/onboarding", dest);
    const sid = extractCookie(post, UNIFIED_SID);
    assert.ok(sid, "unified session cookie issued");

    const cookie = `${UNIFIED_SID}=${sid}`;
    const signedInHome = await request(app)
      .get("/")
      .set("Host", AC_HOST)
      .set("Cookie", cookie)
      .set("Accept", "text/html");
    assertAcw01Homepage(signedInHome, "signed-in AC /");

    let staffApp = await request(app).get("/app").set("Host", AC_HOST).set("Cookie", cookie);
    const loc = String(staffApp.headers.location || "");
    if (staffApp.status === 303 && loc.startsWith("/app")) {
      staffApp = await request(app).get(loc).set("Host", AC_HOST).set("Cookie", cookie);
    }
    assert.equal(staffApp.status, 200);
    assert.match(staffApp.text, /data-ac-shell="staff-app"/);
  });

  it("5. BlessBoard testing root retains BlessBoard homepage, not ActiveClinic", async () => {
    requireDb();
    const res = await request(app).get("/").set("Host", BB_HOST).set("Accept", "text/html");
    assert.equal(res.status, 200);
    assert.match(res.text, /BlessBoard/);
    assert.doesNotMatch(res.text, /data-ac-acw-screen="ACW01"/);
    assert.doesNotMatch(res.text, /data-ac-page="login"/);
    assert.doesNotMatch(res.text, /data-ac-composition="acw08-login"/);
  });

  it("6. unknown and other product hosts keep existing fallback behavior", async () => {
    requireDb();
    const unknown = await request(app).get("/").set("Host", "random.example.com");
    assert.equal(unknown.status, 404);
    assert.equal(unknown.body.code, "UNKNOWN_PLATFORM_HOST");

    const prodHost = await request(app).get("/").set("Host", "activeclinic.org");
    assert.equal(prodHost.status, 421);
    assert.equal(prodHost.body.code, "PLATFORM_ENVIRONMENT_HOST_MISMATCH");

    const hub = await request(app).get("/").set("Host", PLATFORM_HOST);
    assert.equal(hub.status, 200);
    assert.match(hub.text, /Moovex Platform QA/);
    assert.doesNotMatch(hub.text, /data-ac-acw-screen="ACW01"/);

    const getpro = await request(app).get("/").set("Host", GP_HOST).set("Accept", "text/html");
    assert.equal(getpro.status, 200);
    assert.doesNotMatch(getpro.text, /data-ac-acw-screen="ACW01"/);
    assert.doesNotMatch(getpro.text, /data-ac-page="login"/);
  });

  it("public ActiveClinic routes stay public on the testing host", async () => {
    requireDb();
    const register = await request(app)
      .get("/register-clinic")
      .set("Host", AC_HOST)
      .set("Accept", "text/html");
    assert.equal(register.status, 200);
    assert.match(register.text, /register-clinic|Register/);
    assert.doesNotMatch(register.text, /data-ac-page="login"/);

    const clinics = await request(app)
      .get("/clinics")
      .set("Host", AC_HOST)
      .set("Accept", "text/html");
    assert.equal(clinics.status, 200);
    assert.match(clinics.text, /data-ac-shell="public"/);
    assert.doesNotMatch(clinics.text, /data-ac-page="login"/);
  });
});
