"use strict";

/**
 * ActiveClinic login under unified moovex-platform-testing
 * (application_code=platform, product from hostname).
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
  createActiveClinicFoundationApp,
} = require("../src/activeclinic/http/activeClinicFoundationServer");
const {
  createMoovexPlatformRuntimeApp,
  buildDefaultProductApps,
} = require("../src/platform/http/moovexPlatformRuntimeServer");
const {
  createPlatformIdentitySession,
} = require("../src/platform/session/createDeploymentSession");
const { hashSessionToken } = require("../src/platform/session/sessionToken");
const {
  getV5SessionCookieName,
} = require("../src/platform/session/v5SessionCookie");
const {
  getCsrfCookieName,
  CSRF_FIELD,
} = require("../src/platform/http/v5Csrf");
const {
  resolvePlatformRequestContext,
} = require("../src/platform/http/platformRequestContext");
const {
  CODE_ACTIVECLINIC_ORG_V6,
  CODE_MOOVEX_PLATFORM_TESTING,
  COOKIE_ACTIVECLINIC_ORG,
  CSRF_COOKIE_ACTIVECLINIC_ORG,
  resetDeploymentProfileWarningsForTests,
} = require("../src/platform/config/deploymentProfiles");

const IDENTITY_KEY = "moovex-platform-v7";
const PASSWORD = "activeclinic-pass-12";
const AC_HOST = "activeclinic.pronline.org";
const BB_HOST = "blessboard.pronline.org";
const GP_HOST = "getproapp.pronline.org";
const NETRAZ_HOST = "netraz.pronline.org";
const PLATFORM_HOST = "pronline.org";
const UNIFIED_SID = "moovex_platform_testing_sid";
const UNIFIED_CSRF = "moovex_platform_testing_csrf";

const UNIFIED_ENV = Object.freeze({
  NODE_ENV: "test",
  DEPLOYMENT_ENV: "testing",
  PLATFORM_DEPLOYMENT_CODE: CODE_MOOVEX_PLATFORM_TESTING,
  DATABASE_IDENTITY_EXPECTED: IDENTITY_KEY,
  DATABASE_IDENTITY_ENV: "testing",
  SESSION_SECRET: "test-session-secret-at-least-32-chars!!",
});

const LEGACY_ENV = Object.freeze({
  NODE_ENV: "test",
  PLATFORM_DEPLOYMENT_CODE: CODE_ACTIVECLINIC_ORG_V6,
  DATABASE_URL: "postgres://unused/local",
  SESSION_SECRET: "a".repeat(40),
});

let pool;
let skipReason = null;
let app;
let phoneSeq = 830000000;

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

function cookieHeader(parts) {
  return Object.entries(parts)
    .filter(([, v]) => v != null && v !== "")
    .map(([k, v]) => `${k}=${v}`)
    .join("; ");
}

function setCookieNames(res) {
  return [].concat(res.headers["set-cookie"] || []).map((line) => String(line).split("=")[0]);
}

async function seedAcTenant(stamp, keyPrefix, deploymentCode) {
  const org = await provisionPlatformTenant(pool, {
    skipDomain: true,
    dataEnvironment: "testing",
    organizationKey: `${keyPrefix}_${stamp}`,
    displayName: `AC ${keyPrefix}`,
    productKey: "activeclinic",
    productTenantKey: `${keyPrefix}-${stamp}`,
    deploymentCode,
  });
  assert.equal(org.ok, true, JSON.stringify(org));
  const hco = await createHealthcareOrganization(pool, {
    organizationId: org.records.organization.id,
    legalName: "Legal Hospital",
    publicName: `Public ${keyPrefix}`,
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
    firstName: opts.firstName || "Unified",
    lastName: opts.lastName || "User",
    employmentType: "permanent",
    phone,
    status: "active",
    platformIdentityId: identity.identity.id,
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
    roleKey: opts.roleKey || NETWORK_ADMIN,
    scopeType: opts.scopeType || "organisation",
    facilityId: opts.scopeType === "facility" ? opts.facilityIds[0] : null,
  });
  return { identity: identity.identity, staff: staff.staffMember, phone };
}

async function postLogin(host, identifier, password, targetApp) {
  const getLogin = await request(targetApp).get("/login").set("Host", host);
  const csrfName = getCsrfCookieName(UNIFIED_ENV);
  const csrfCookie = extractCookie(getLogin, csrfName);
  const match = getLogin.text.match(/name="_csrf" value="([^"]+)"/);
  const res = await request(targetApp)
    .post("/login")
    .set("Host", host)
    .set("Cookie", csrfCookie ? `${csrfName}=${csrfCookie}` : "")
    .set("Accept", "text/html")
    .type("form")
    .send({
      [CSRF_FIELD]: match ? match[1] : "",
      identifier,
      password,
    });
  return { getLogin, post: res, csrfCookie };
}

describe("ActiveClinic unified V7 login (moovex-platform-testing)", () => {
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
      const productApps = buildDefaultProductApps({
        env: UNIFIED_ENV,
        getPool: () => pool,
      });
      app = createMoovexPlatformRuntimeApp({
        env: UNIFIED_ENV,
        getPool: () => pool,
        productApps,
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

  it("Stage 4: unified deployment resolves products by host without leakage", () => {
    const cases = [
      [AC_HOST, "activeclinic"],
      [BB_HOST, "blessboard"],
      [GP_HOST, "getpro"],
      [NETRAZ_HOST, "ngo"],
    ];
    for (const [hostname, product] of cases) {
      const r = resolvePlatformRequestContext({
        env: UNIFIED_ENV,
        hostname,
      });
      assert.equal(r.ok, true, `${hostname} ${r.code || ""}`);
      assert.equal(r.platform.productKey, product);
      assert.equal(r.platform.deploymentCode, CODE_MOOVEX_PLATFORM_TESTING);
      assert.equal(r.deployment.productCode, "platform");
      assert.equal(r.platform.sessionCookieName, UNIFIED_SID);
    }
    const hub = resolvePlatformRequestContext({
      env: UNIFIED_ENV,
      hostname: PLATFORM_HOST,
    });
    assert.equal(hub.ok, true);
    assert.equal(hub.platform.siteType, "platform");
    assert.notEqual(hub.platform.productKey, "activeclinic");
  });

  it("Test 1+6: unified AC host + eligible identity logs in and /app is 200", async () => {
    requireDb();
    const stamp = Date.now().toString(36);
    const ac = await seedAcTenant(stamp, "u1", CODE_MOOVEX_PLATFORM_TESTING);
    const staff = await seedStaff(ac, {});
    const { getLogin, post } = await postLogin(AC_HOST, staff.phone, PASSWORD, app);
    assert.equal(getLogin.status, 200);
    assert.match(getLogin.text, /data-ac-page="login"/);
    assert.equal(post.status, 303, post.text && post.text.slice(0, 400));
    assert.equal(post.headers.location, "/app");
    const sid = extractCookie(post, UNIFIED_SID);
    assert.ok(sid, "unified session cookie issued");
    assert.equal(extractCookie(post, COOKIE_ACTIVECLINIC_ORG), null);
    const home = await request(app)
      .get("/app")
      .set("Host", AC_HOST)
      .set("Cookie", `${UNIFIED_SID}=${sid}`);
    assert.equal(home.status, 200);
    assert.match(home.text, /data-ac-shell="staff-app"/);
  });

  it("Test 2: unified AC host + identity without ActiveClinic access is denied", async () => {
    requireDb();
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
    const { post } = await postLogin(AC_HOST, phone, PASSWORD, app);
    assert.equal(post.status, 401);
    assert.match(post.text, /Access is not available|incorrect/i);
    assert.equal(extractCookie(post, UNIFIED_SID), null);
  });

  it("Test 3: BlessBoard host does not receive ActiveClinic login/session logic", async () => {
    requireDb();
    const stamp = `${Date.now().toString(36)}b`;
    const ac = await seedAcTenant(stamp, "bbiso", CODE_MOOVEX_PLATFORM_TESTING);
    const staff = await seedStaff(ac, {});
    const { post } = await postLogin(AC_HOST, staff.phone, PASSWORD, app);
    assert.equal(post.status, 303);
    const sid = extractCookie(post, UNIFIED_SID);
    assert.ok(sid);

    const bbLogin = await request(app).get("/login").set("Host", BB_HOST);
    assert.ok([200, 303, 400, 401, 404].includes(bbLogin.status), `bb /login ${bbLogin.status}`);
    assert.doesNotMatch(String(bbLogin.text || ""), /data-ac-page="login"/);
    assert.doesNotMatch(String(bbLogin.text || ""), /data-ac-shell="staff-app"/);

    const bbWithAcSession = await request(app)
      .get("/login")
      .set("Host", BB_HOST)
      .set("Cookie", `${UNIFIED_SID}=${sid}`);
    assert.doesNotMatch(bbWithAcSession.text, /data-ac-shell="staff-app"/);
    assert.doesNotMatch(bbWithAcSession.text, /data-ac-page="home"/);

    const bbApp = await request(app)
      .get("/app")
      .set("Host", BB_HOST)
      .set("Cookie", `${UNIFIED_SID}=${sid}`);
    assert.doesNotMatch(String(bbApp.text || ""), /data-ac-shell="staff-app"/);
    assert.doesNotMatch(String(bbApp.text || ""), /data-ac-page="home"/);
  });

  it("Test 4: unknown host and production AC host are denied on testing runtime", async () => {
    requireDb();
    const unknown = await request(app).get("/login").set("Host", "random.example.com");
    assert.equal(unknown.status, 404);
    assert.equal(unknown.body.code, "UNKNOWN_PLATFORM_HOST");

    const prodHost = await request(app).get("/login").set("Host", "activeclinic.org");
    assert.equal(prodHost.status, 421);
    assert.equal(prodHost.body.code, "PLATFORM_ENVIRONMENT_HOST_MISMATCH");

    const hubLogin = await request(app).get("/login").set("Host", PLATFORM_HOST);
    assert.equal(hubLogin.status, 404);
    assert.equal(hubLogin.body.code, "platform_qa_hub_only");

    const hubHome = await request(app).get("/").set("Host", PLATFORM_HOST);
    assert.equal(hubHome.status, 200);
    assert.doesNotMatch(hubHome.text, /data-ac-page="login"/);
  });

  it("Test 5: legacy activeclinic-org-v6 login still works", async () => {
    requireDb();
    const stamp = `${Date.now().toString(36)}L`;
    const ac = await seedAcTenant(stamp, "leg", CODE_ACTIVECLINIC_ORG_V6);
    const staff = await seedStaff(ac, {});
    const legacyApp = createActiveClinicFoundationApp({
      getPool: () => pool,
      env: LEGACY_ENV,
      log: () => {},
    });
    const getLogin = await request(legacyApp).get("/login").set("Host", "activeclinic.org");
    assert.equal(getLogin.status, 200);
    const csrf = extractCookie(getLogin, CSRF_COOKIE_ACTIVECLINIC_ORG);
    const match = getLogin.text.match(/name="_csrf" value="([^"]+)"/);
    const post = await request(legacyApp)
      .post("/login")
      .set("Host", "activeclinic.org")
      .set("Cookie", `${CSRF_COOKIE_ACTIVECLINIC_ORG}=${csrf}`)
      .type("form")
      .send({
        [CSRF_FIELD]: match[1],
        identifier: staff.phone,
        password: PASSWORD,
      });
    assert.equal(post.status, 303);
    assert.equal(post.headers.location, "/app");
    const sid = extractCookie(post, COOKIE_ACTIVECLINIC_ORG);
    assert.ok(sid);
    assert.equal(extractCookie(post, UNIFIED_SID), null);
    const home = await request(legacyApp)
      .get("/app")
      .set("Host", "activeclinic.org")
      .set("Cookie", `${COOKIE_ACTIVECLINIC_ORG}=${sid}`);
    assert.equal(home.status, 200);
  });

  it("Test 7+HTTP: login → org switch → logout on unified cookie", async () => {
    requireDb();
    const stamp = `${Date.now().toString(36)}o`;
    const ac1 = await seedAcTenant(stamp, "org1", CODE_MOOVEX_PLATFORM_TESTING);
    const ac2 = await seedAcTenant(`${stamp}b`, "org2", CODE_MOOVEX_PLATFORM_TESTING);
    const staff1 = await seedStaff(ac1, { firstName: "Multi", lastName: "Org" });
    const phone = staff1.phone;

    const sequence = {};
    const getLogin = await request(app).get("/login").set("Host", AC_HOST);
    sequence.GET_login = getLogin.status;
    assert.equal(getLogin.status, 200);
    const csrf1 = extractCookie(getLogin, UNIFIED_CSRF);
    const field1 = getLogin.text.match(/name="_csrf" value="([^"]+)"/);
    const postLoginRes = await request(app)
      .post("/login")
      .set("Host", AC_HOST)
      .set("Cookie", `${UNIFIED_CSRF}=${csrf1}`)
      .type("form")
      .send({ [CSRF_FIELD]: field1[1], identifier: phone, password: PASSWORD });
    sequence.POST_login = postLoginRes.status;
    assert.ok([302, 303].includes(postLoginRes.status));
    const sid1 = extractCookie(postLoginRes, UNIFIED_SID);
    assert.ok(sid1);

    const staff2 = await createStaffMember(pool, {
      organizationId: ac2.orgId,
      healthcareOrganizationId: ac2.hcoId,
      firstName: "Multi",
      lastName: "Org",
      employmentType: "permanent",
      phone,
      status: "active",
      platformIdentityId: staff1.identity.id,
    });
    assert.equal(staff2.ok, true, JSON.stringify(staff2));
    await assignStaffToFacility(pool, {
      organizationId: ac2.orgId,
      staffMemberId: staff2.staffMember.id,
      facilityId: ac2.facilityId,
      isPrimary: true,
    });
    await assignStaffRole(pool, {
      organizationId: ac2.orgId,
      staffMemberId: staff2.staffMember.id,
      roleKey: NETWORK_ADMIN,
      scopeType: "organisation",
    });

    const home1 = await request(app)
      .get("/app")
      .set("Host", AC_HOST)
      .set("Cookie", cookieHeader({ [UNIFIED_SID]: sid1 }));
    sequence.GET_app_1 = home1.status;
    assert.equal(home1.status, 200);
    const csrfApp = extractCookie(home1, UNIFIED_CSRF);
    const fieldApp = home1.text.match(/name="_csrf" value="([^"]+)"/);

    const switched = await request(app)
      .post("/app/select-organization")
      .set("Host", AC_HOST)
      .set("Cookie", cookieHeader({
        [UNIFIED_SID]: sid1,
        [UNIFIED_CSRF]: csrfApp || csrf1,
      }))
      .type("form")
      .send({
        organization_id: ac2.orgId,
        [CSRF_FIELD]: (fieldApp && fieldApp[1]) || csrfApp || csrf1,
      });
    sequence.POST_select_organization = switched.status;
    assert.equal(switched.status, 303);
    assert.notEqual(switched.status, 403);
    const sid2 = extractCookie(switched, UNIFIED_SID);
    assert.ok(sid2);
    assert.ok(setCookieNames(switched).includes(UNIFIED_SID));
    assert.ok(!setCookieNames(switched).includes(COOKIE_ACTIVECLINIC_ORG));

    const home2 = await request(app)
      .get("/app")
      .set("Host", AC_HOST)
      .set("Cookie", cookieHeader({ [UNIFIED_SID]: sid2 }));
    sequence.GET_app_2 = home2.status;
    assert.equal(home2.status, 200);

    const logout = await request(app)
      .get("/logout")
      .set("Host", AC_HOST)
      .set("Cookie", cookieHeader({ [UNIFIED_SID]: sid2 }));
    sequence.GET_logout = logout.status;
    assert.equal(logout.status, 303);
    assert.equal(logout.headers.location, "/login");
    assert.notEqual(logout.status, 403);

    const loginAgain = await request(app).get("/login").set("Host", AC_HOST);
    sequence.GET_login_after = loginAgain.status;
    assert.equal(loginAgain.status, 200);
    assert.deepEqual(sequence, {
      GET_login: 200,
      POST_login: 303,
      GET_app_1: 200,
      POST_select_organization: 303,
      GET_app_2: 200,
      GET_logout: 303,
      GET_login_after: 200,
    });
  });

  it("Test 8: unified login → facility switch → logout", async () => {
    requireDb();
    const stamp = `${Date.now().toString(36)}f`;
    const ac = await seedAcTenant(stamp, "fac", CODE_MOOVEX_PLATFORM_TESTING);
    const staff = await seedStaff(ac, {
      facilityIds: [ac.facilityId, ac.facility2Id],
    });
    const created = await createPlatformIdentitySession(pool, {
      deploymentCode: CODE_MOOVEX_PLATFORM_TESTING,
      platformIdentityId: staff.identity.id,
      organizationId: ac.orgId,
    });
    assert.equal(created.ok, true, JSON.stringify(created));
    const csrf = extractCookie(
      await request(app)
        .get("/app")
        .set("Host", AC_HOST)
        .set("Cookie", `${UNIFIED_SID}=${created.rawToken}`),
      UNIFIED_CSRF
    );
    const home = await request(app)
      .get("/app")
      .set("Host", AC_HOST)
      .set("Cookie", cookieHeader({
        [UNIFIED_SID]: created.rawToken,
        [UNIFIED_CSRF]: csrf,
      }));
    assert.equal(home.status, 200);
    const field = home.text.match(/name="_csrf" value="([^"]+)"/);
    const switched = await request(app)
      .post("/app/select-facility")
      .set("Host", AC_HOST)
      .set("Cookie", cookieHeader({
        [UNIFIED_SID]: created.rawToken,
        [UNIFIED_CSRF]: extractCookie(home, UNIFIED_CSRF) || csrf,
      }))
      .type("form")
      .send({
        facility_id: ac.facility2Id,
        [CSRF_FIELD]: (field && field[1]) || csrf,
      });
    assert.ok([302, 303].includes(switched.status));
    assert.notEqual(switched.status, 403);
    const logout = await request(app)
      .get("/logout")
      .set("Host", AC_HOST)
      .set("Cookie", cookieHeader({ [UNIFIED_SID]: created.rawToken }));
    assert.equal(logout.status, 303);
    assert.equal(logout.headers.location, "/login");
  });

  it("Test 9: stale organisation still logs out 303 /login, never 403", async () => {
    requireDb();
    const stamp = `${Date.now().toString(36)}s`;
    const ac = await seedAcTenant(stamp, "stale", CODE_MOOVEX_PLATFORM_TESTING);
    const other = await seedAcTenant(`${stamp}x`, "other", CODE_MOOVEX_PLATFORM_TESTING);
    const staff = await seedStaff(ac, {});
    const created = await createPlatformIdentitySession(pool, {
      deploymentCode: CODE_MOOVEX_PLATFORM_TESTING,
      platformIdentityId: staff.identity.id,
      organizationId: ac.orgId,
    });
    assert.equal(created.ok, true, JSON.stringify(created));
    await pool.query(
      `UPDATE platform.deployment_sessions
          SET organization_id = $1
        WHERE session_token_hash = $2`,
      [other.orgId, hashSessionToken(created.rawToken)]
    );
    const gated = await request(app)
      .get("/app")
      .set("Host", AC_HOST)
      .set("Cookie", `${UNIFIED_SID}=${created.rawToken}`);
    assert.ok([303, 403].includes(gated.status));
    const logout = await request(app)
      .get("/logout")
      .set("Host", AC_HOST)
      .set("Cookie", `${UNIFIED_SID}=${created.rawToken}`);
    assert.equal(logout.status, 303);
    assert.equal(logout.headers.location, "/login");
    assert.notEqual(logout.status, 403);
  });

  it("Test 10: login, session, switch, and logout share moovex_platform_testing_sid", () => {
    const env = UNIFIED_ENV;
    const loginName = getV5SessionCookieName(env);
    const sessionName = getV5SessionCookieName(env, {});
    const switchName = getV5SessionCookieName(env, {
      platform: { sessionCookieName: UNIFIED_SID },
    });
    const logoutName = getV5SessionCookieName(env, {
      platform: { sessionCookieName: UNIFIED_SID },
    });
    assert.equal(loginName, UNIFIED_SID);
    assert.equal(sessionName, UNIFIED_SID);
    assert.equal(switchName, UNIFIED_SID);
    assert.equal(logoutName, UNIFIED_SID);
    assert.equal(getCsrfCookieName(env), UNIFIED_CSRF);
    assert.equal(
      getCsrfCookieName(env, { platform: { csrfCookieName: UNIFIED_CSRF } }),
      UNIFIED_CSRF
    );
    assert.notEqual(loginName, COOKIE_ACTIVECLINIC_ORG);
  });
});
