"use strict";

/**
 * ActiveClinic — logout after organisation/facility/context switch.
 * Logout is session termination and must never return 403.
 */

const { describe, it, before, after, beforeEach } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
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
  STAFF_ROLE,
} = require("../src/activeclinic/services/activeClinicAuthorizationService");
const {
  createActiveClinicFoundationApp,
} = require("../src/activeclinic/http/activeClinicFoundationServer");
const {
  createPlatformIdentitySession,
} = require("../src/platform/session/createDeploymentSession");
const { hashSessionToken } = require("../src/platform/session/sessionToken");
const {
  getV5SessionCookieName,
} = require("../src/platform/session/v5SessionCookie");
const { getCsrfCookieName, CSRF_FIELD, issueCsrfToken } = require("../src/platform/http/v5Csrf");
const {
  CODE_ACTIVECLINIC_ORG_V6,
  CODE_MOOVEX_PLATFORM_TESTING,
  COOKIE_ACTIVECLINIC_ORG,
  CSRF_COOKIE_ACTIVECLINIC_ORG,
  resetDeploymentProfileWarningsForTests,
} = require("../src/platform/config/deploymentProfiles");

const PASSWORD = "activeclinic-pass-12";
const HOST = "activeclinic.org";
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
  const raw = [].concat(res.headers["set-cookie"] || []);
  return raw.map((line) => String(line).split("=")[0]);
}

async function seedAcTenant(stamp, keyPrefix) {
  const org = await provisionPlatformTenant(pool, {
    skipDomain: true,
    dataEnvironment: "testing",
    organizationKey: `${keyPrefix}_${stamp}`,
    displayName: `AC ${keyPrefix}`,
    productKey: "activeclinic",
    productTenantKey: `${keyPrefix}-${stamp}`,
    deploymentCode: CODE_ACTIVECLINIC_ORG_V6,
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
    firstName: opts.firstName || "Logout",
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

async function sessionCookie(identityId, orgId) {
  const session = await createPlatformIdentitySession(pool, {
    deploymentCode: CODE_ACTIVECLINIC_ORG_V6,
    platformIdentityId: identityId,
    organizationId: orgId,
  });
  assert.equal(session.ok, true, JSON.stringify(session));
  return { cookie: `${COOKIE_ACTIVECLINIC_ORG}=${session.rawToken}`, session };
}

function makeApp() {
  return createActiveClinicFoundationApp({
    getPool: () => pool,
    env: MINIMAL_AC,
    log: () => {},
  });
}

async function assertSessionRevoked(rawToken) {
  const row = await pool.query(
    `SELECT revoked_at FROM platform.deployment_sessions WHERE session_token_hash = $1`,
    [hashSessionToken(rawToken)]
  );
  assert.ok(row.rows[0], "session row exists");
  assert.ok(row.rows[0].revoked_at, "session revoked");
}

describe("ActiveClinic logout after switch", () => {
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

  it("Test 1: login then logout destroys session, clears cookie, redirects, no 403", async () => {
    requireDb();
    const stamp = Date.now().toString(36);
    const ac = await seedAcTenant(stamp, "lo1");
    const admin = await seedStaff(ac, { roleKey: NETWORK_ADMIN });
    const { cookie, session } = await sessionCookie(admin.identity.id, ac.orgId);
    const app = makeApp();
    const csrf = issueCsrfToken(MINIMAL_AC);
    const home = await request(app)
      .get("/app")
      .set("Host", HOST)
      .set("Cookie", `${cookie}; ${CSRF_COOKIE_ACTIVECLINIC_ORG}=${csrf}`);
    assert.equal(home.status, 200);
    const csrfApp = extractCookie(home, CSRF_COOKIE_ACTIVECLINIC_ORG) || csrf;
    const field = home.text.match(/name="_csrf" value="([^"]+)"/);
    assert.ok(field);
    const logout = await request(app)
      .post("/logout")
      .set("Host", HOST)
      .set("Cookie", `${cookie}; ${CSRF_COOKIE_ACTIVECLINIC_ORG}=${csrfApp}`)
      .type("form")
      .send({ [CSRF_FIELD]: field[1] });
    assert.equal(logout.status, 303);
    assert.equal(logout.headers.location, "/login");
    assert.notEqual(logout.status, 403);
    const names = setCookieNames(logout);
    assert.ok(names.includes(COOKIE_ACTIVECLINIC_ORG), "clears login session cookie");
    await assertSessionRevoked(session.rawToken);
    const login = await request(app).get("/login").set("Host", HOST);
    assert.equal(login.status, 200);
  });

  it("Test 2: switch organisation then logout succeeds with no 403", async () => {
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

    const { session } = await sessionCookie(identity.identity.id, ac1.orgId);
    const app = makeApp();
    const csrf = issueCsrfToken(MINIMAL_AC);
    const switched = await request(app)
      .post("/app/select-organization")
      .set("Host", HOST)
      .set("Cookie", cookieHeader({
        [COOKIE_ACTIVECLINIC_ORG]: session.rawToken,
        [CSRF_COOKIE_ACTIVECLINIC_ORG]: csrf,
      }))
      .type("form")
      .send({
        organization_id: ac2.orgId,
        [CSRF_FIELD]: csrf,
      });
    assert.ok([302, 303].includes(switched.status), `switch status ${switched.status}`);
    assert.notEqual(switched.status, 403);
    const newSid = extractCookie(switched, COOKIE_ACTIVECLINIC_ORG);
    assert.ok(newSid, "switch writes session cookie via canonical resolver");
    assert.ok(setCookieNames(switched).includes(COOKIE_ACTIVECLINIC_ORG));

    const home = await request(app)
      .get("/app")
      .set("Host", HOST)
      .set("Cookie", cookieHeader({
        [COOKIE_ACTIVECLINIC_ORG]: newSid,
        [CSRF_COOKIE_ACTIVECLINIC_ORG]: extractCookie(switched, CSRF_COOKIE_ACTIVECLINIC_ORG) || csrf,
      }));
    assert.equal(home.status, 200);

    const logout = await request(app)
      .get("/logout")
      .set("Host", HOST)
      .set("Cookie", cookieHeader({ [COOKIE_ACTIVECLINIC_ORG]: newSid }));
    assert.equal(logout.status, 303);
    assert.equal(logout.headers.location, "/login");
    assert.notEqual(logout.status, 403);
    await assertSessionRevoked(newSid);
  });

  it("Test 3: switch facility then logout succeeds", async () => {
    requireDb();
    const stamp = Date.now().toString(36);
    const ac = await seedAcTenant(stamp, "fac");
    const admin = await seedStaff(ac, {
      roleKey: NETWORK_ADMIN,
      facilityIds: [ac.facilityId, ac.facility2Id],
    });
    const { cookie, session } = await sessionCookie(admin.identity.id, ac.orgId);
    const app = makeApp();
    const csrf = issueCsrfToken(MINIMAL_AC);
    const switched = await request(app)
      .post("/app/select-facility")
      .set("Host", HOST)
      .set("Cookie", `${cookie}; ${CSRF_COOKIE_ACTIVECLINIC_ORG}=${csrf}`)
      .type("form")
      .send({
        facility_id: ac.facility2Id,
        [CSRF_FIELD]: csrf,
      });
    assert.ok([302, 303].includes(switched.status));
    assert.notEqual(switched.status, 403);
    const logout = await request(app)
      .post("/logout")
      .set("Host", HOST)
      .set("Cookie", `${cookie}; ${CSRF_COOKIE_ACTIVECLINIC_ORG}=${csrf}`)
      .type("form")
      .send({ [CSRF_FIELD]: csrf });
    assert.equal(logout.status, 303);
    assert.equal(logout.headers.location, "/login");
    await assertSessionRevoked(session.rawToken);
  });

  it("Test 4: stale organisation context still allows logout", async () => {
    requireDb();
    const stamp = Date.now().toString(36);
    const ac = await seedAcTenant(stamp, "stale");
    const other = await seedAcTenant(`${stamp}x`, "other");
    const admin = await seedStaff(ac, { roleKey: NETWORK_ADMIN });
    const { cookie, session } = await sessionCookie(admin.identity.id, ac.orgId);
    await pool.query(
      `UPDATE platform.deployment_sessions
          SET organization_id = $1
        WHERE id = $2`,
      [other.orgId, session.session.id]
    );
    const app = makeApp();
    const gated = await request(app).get("/app").set("Host", HOST).set("Cookie", cookie);
    assert.ok([303, 403].includes(gated.status));
    const logout = await request(app).get("/logout").set("Host", HOST).set("Cookie", cookie);
    assert.equal(logout.status, 303);
    assert.equal(logout.headers.location, "/login");
    assert.notEqual(logout.status, 403);
  });

  it("Test 5: missing permission after login still allows logout", async () => {
    requireDb();
    const stamp = Date.now().toString(36);
    const ac = await seedAcTenant(stamp, "perm");
    const staff = await seedStaff(ac, { roleKey: STAFF_ROLE });
    const { cookie } = await sessionCookie(staff.identity.id, ac.orgId);
    const app = makeApp();
    const denied = await request(app).get("/app/access").set("Host", HOST).set("Cookie", cookie);
    assert.equal(denied.status, 403);
    assert.match(denied.text, /Sign out|unavailable|restricted|do not have access/i);
    const logout = await request(app).get("/logout").set("Host", HOST).set("Cookie", cookie);
    assert.equal(logout.status, 303);
    assert.equal(logout.headers.location, "/login");
  });

  it("Test 6: expired or missing session /logout is idempotent, no Forbidden", async () => {
    const app = makeApp();
    const getMissing = await request(app).get("/logout").set("Host", HOST);
    assert.equal(getMissing.status, 303);
    assert.equal(getMissing.headers.location, "/login");
    assert.doesNotMatch(getMissing.text || "", /Forbidden/i);

    const postMissing = await request(app)
      .post("/logout")
      .set("Host", HOST)
      .type("form")
      .send({});
    assert.equal(postMissing.status, 303);
    assert.equal(postMissing.headers.location, "/login");
    assert.notEqual(postMissing.status, 403);

    const login = await request(app).get("/login").set("Host", HOST);
    assert.equal(login.status, 200);
  });

  it("Test 7: login, session lookup, and logout use the same cookie name", () => {
    const env = MINIMAL_AC;
    const loginName = getV5SessionCookieName(env);
    const sessionName = getV5SessionCookieName(env, {});
    const switchName = getV5SessionCookieName(env, {
      platform: { sessionCookieName: COOKIE_ACTIVECLINIC_ORG },
    });
    const logoutName = getV5SessionCookieName(env, {
      platform: { sessionCookieName: COOKIE_ACTIVECLINIC_ORG },
    });
    assert.equal(loginName, COOKIE_ACTIVECLINIC_ORG);
    assert.equal(sessionName, COOKIE_ACTIVECLINIC_ORG);
    assert.equal(switchName, COOKIE_ACTIVECLINIC_ORG);
    assert.equal(logoutName, COOKIE_ACTIVECLINIC_ORG);
    assert.equal(getCsrfCookieName(env), CSRF_COOKIE_ACTIVECLINIC_ORG);
    assert.equal(
      getCsrfCookieName(env, { platform: { csrfCookieName: CSRF_COOKIE_ACTIVECLINIC_ORG } }),
      CSRF_COOKIE_ACTIVECLINIC_ORG
    );

    const unifiedEnv = {
      NODE_ENV: "test",
      PLATFORM_DEPLOYMENT_CODE: CODE_MOOVEX_PLATFORM_TESTING,
      SESSION_SECRET: "a".repeat(40),
    };
    const unifiedSid = "moovex_platform_testing_sid";
    const unifiedCsrf = "moovex_platform_testing_csrf";
    assert.equal(getV5SessionCookieName(unifiedEnv), unifiedSid);
    assert.equal(
      getV5SessionCookieName(unifiedEnv, { platform: { sessionCookieName: unifiedSid } }),
      unifiedSid
    );
    assert.equal(getCsrfCookieName(unifiedEnv), unifiedCsrf);
    assert.equal(
      getCsrfCookieName(unifiedEnv, { platform: { csrfCookieName: unifiedCsrf } }),
      unifiedCsrf
    );
  });

  it("Test 8: BlessBoard shared POST /logout CSRF gate is unchanged", () => {
    const bb = fs.readFileSync(
      path.join(__dirname, "../src/platform/http/v5FoundationServer.js"),
      "utf8"
    );
    assert.match(bb, /app\.post\("\/logout"/);
    assert.match(bb, /validateCsrf\(req,\s*submitted,\s*env\)/);
    assert.doesNotMatch(bb, /terminateV5BrowserSession/);

    const ac = fs.readFileSync(
      path.join(__dirname, "../src/activeclinic/http/activeClinicAuthRoutes.js"),
      "utf8"
    );
    assert.match(ac, /app\.get\("\/logout"/);
    assert.match(ac, /app\.post\("\/logout"/);
    assert.match(ac, /terminateV5BrowserSession/);
    assert.doesNotMatch(ac, /status\(403\)\.send\("Forbidden"\)/);
  });
});
