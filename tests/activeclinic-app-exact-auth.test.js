"use strict";

/**
 * Exact GET /app must not treat a valid staff session as anonymous.
 * Do not follow /app/onboarding as proof that /app itself authenticated.
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
  ensureDefaultDepartments,
} = require("../src/activeclinic/services/activeClinicDepartmentService");
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
  createPlatformIdentitySession,
} = require("../src/platform/session/createDeploymentSession");
const { CSRF_FIELD, getCsrfCookieName } = require("../src/platform/http/v5Csrf");
const {
  CODE_MOOVEX_PLATFORM_TESTING,
  resetDeploymentProfileWarningsForTests,
} = require("../src/platform/config/deploymentProfiles");

const IDENTITY_KEY = "moovex-platform-v7";
const PASSWORD = "activeclinic-pass-12";
const AC_HOST = "activeclinic.pronline.org";
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

function locationPath(location) {
  return String(location || "")
    .replace(/^https?:\/\/[^/]+/i, "")
    .split("?")[0];
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

function isLoginRedirect(res) {
  return (
    res.status >= 300 &&
    res.status < 400 &&
    /\/login$/i.test(locationPath(res.location))
  );
}

async function seedAcTenant(stamp, keyPrefix) {
  const org = await provisionPlatformTenant(pool, {
    skipDomain: true,
    dataEnvironment: "testing",
    organizationKey: `${keyPrefix}_${stamp}`,
    displayName: `AC ${keyPrefix}`,
    productKey: "activeclinic",
    productTenantKey: `${keyPrefix}-${stamp}`,
    deploymentCode: CODE_MOOVEX_PLATFORM_TESTING,
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
  await ensureDefaultDepartments(pool, {
    organizationId: org.records.organization.id,
    healthcareOrganizationId: hco.healthcareOrganization.id,
    facilityId: facility.facility.id,
  });
  return {
    orgId: org.records.organization.id,
    hcoId: hco.healthcareOrganization.id,
    facilityId: facility.facility.id,
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
    firstName: opts.firstName || "Exact",
    lastName: opts.lastName || "App",
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
  return { identity: identity.identity, staff: staff.staffMember, phone };
}

async function postLogin(identifier) {
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
      identifier,
      password: PASSWORD,
    });
  return post;
}

describe("ActiveClinic exact GET /app auth", () => {
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

  it("anonymous GET /app redirects to /login", async () => {
    requireDb();
    const res = await request(app)
      .get("/app")
      .set("Host", AC_HOST)
      .set("Accept", "text/html");
    assert.equal(res.status, 303);
    assert.equal(locationPath(res.headers.location), "/login");
    assert.equal(res.headers["x-ac-auth-guard"], "requireActiveClinicAuth");
    assert.equal(res.headers["x-ac-auth-decision"], "redirect_login");
    assert.equal(res.headers["x-ac-cookie-present"], "0");
  });

  it("staff POST /login then exact GET /app is not /login; onboarding still works", async () => {
    requireDb();
    const stamp = Date.now().toString(36);
    const ac = await seedAcTenant(stamp, "exact1");
    const staff = await seedStaff(ac, {});
    const post = await postLogin(staff.phone);
    assert.equal(post.status, 303);
    const dest = locationPath(post.headers.location);
    assert.ok(dest === "/app" || dest === "/app/" || dest === "/app/onboarding", dest);
    const sid = extractCookie(post, UNIFIED_SID);
    assert.ok(sid);
    const cookie = `${UNIFIED_SID}=${sid}`;

    const home = await request(app)
      .get("/app")
      .set("Host", AC_HOST)
      .set("Accept", "text/html")
      .set("Cookie", cookie);
    assert.equal(isLoginRedirect(home), false, `GET /app -> ${home.status} ${home.headers.location || ""}`);
    assert.ok(
      home.status === 200 ||
        (home.status === 303 && String(home.headers.location || "").startsWith("/app")),
      `unexpected staff /app ${home.status} ${home.headers.location || ""}`
    );
    if (home.status === 200) {
      assert.match(home.text, /data-ac-shell="staff-app"/);
    }

    const slash = await request(app)
      .get("/app/")
      .set("Host", AC_HOST)
      .set("Accept", "text/html")
      .set("Cookie", cookie);
    assert.equal(isLoginRedirect(slash), false, `GET /app/ -> ${slash.status} ${slash.headers.location || ""}`);

    const onboarding = await request(app)
      .get("/app/onboarding")
      .set("Host", AC_HOST)
      .set("Accept", "text/html")
      .set("Cookie", cookie);
    assert.ok([200, 303].includes(onboarding.status), String(onboarding.status));
    assert.equal(isLoginRedirect(onboarding), false);
  });

  it("patient session is denied staff GET /app", async () => {
    requireDb();
    const stamp = `${Date.now().toString(36)}p`;
    const ac = await seedAcTenant(stamp, "pat");
    const phone = nextPhone();
    const identity = await createPlatformIdentity(pool, {
      primaryPhone: phone,
      phoneNormalized: phone,
      phoneVerifiedAt: new Date().toISOString(),
    });
    assert.equal(identity.ok, true);
    const session = await createPlatformIdentitySession(pool, {
      deploymentCode: CODE_MOOVEX_PLATFORM_TESTING,
      platformIdentityId: identity.identity.id,
      organizationId: ac.orgId,
      contextJson: {
        principalKind: "patient",
        clinicKey: "pat-clinic",
        healthcareOrganizationId: ac.hcoId,
        portalOnly: true,
      },
    });
    assert.equal(session.ok, true, JSON.stringify(session));
    const denied = await request(app)
      .get("/app")
      .set("Host", AC_HOST)
      .set("Accept", "text/html")
      .set("Cookie", `${UNIFIED_SID}=${session.rawToken}`);
    assert.notEqual(denied.status, 200);
    assert.ok([302, 303, 401, 403].includes(denied.status));
    if (denied.status === 303) {
      assert.equal(locationPath(denied.headers.location), "/login");
    }
    assert.doesNotMatch(String(denied.text || ""), /data-ac-shell="staff-app"/);
  });

  it("stale foreign organization on the session is not staff home 200", async () => {
    requireDb();
    const stamp = `${Date.now().toString(36)}w`;
    const ac = await seedAcTenant(stamp, "own");
    const other = await seedAcTenant(`${stamp}x`, "oth");
    const staff = await seedStaff(ac, {});
    const session = await createPlatformIdentitySession(pool, {
      deploymentCode: CODE_MOOVEX_PLATFORM_TESTING,
      platformIdentityId: staff.identity.id,
      organizationId: ac.orgId,
    });
    assert.equal(session.ok, true);
    await pool.query(
      `UPDATE platform.deployment_sessions SET organization_id = $1 WHERE id = $2`,
      [other.orgId, session.session.id]
    );
    const gated = await request(app)
      .get("/app")
      .set("Host", AC_HOST)
      .set("Accept", "text/html")
      .set("Cookie", `${UNIFIED_SID}=${session.rawToken}`);
    assert.ok([303, 403].includes(gated.status));
    assert.notEqual(gated.status, 200);
  });

  it("multi-clinic staff exact /app is not /login", async () => {
    requireDb();
    const stamp = `${Date.now().toString(36)}m`;
    const ac1 = await seedAcTenant(stamp, "m1");
    const ac2 = await seedAcTenant(`${stamp}b`, "m2");
    const staff1 = await seedStaff(ac1, { firstName: "Multi" });
    const staff2 = await createStaffMember(pool, {
      organizationId: ac2.orgId,
      healthcareOrganizationId: ac2.hcoId,
      firstName: "Multi",
      lastName: "Org",
      employmentType: "permanent",
      phone: staff1.phone,
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
    const post = await postLogin(staff1.phone);
    assert.ok([302, 303].includes(post.status));
    const loc = locationPath(post.headers.location);
    if (/select-organization/i.test(loc)) {
      assert.notEqual(loc, "/login");
      return;
    }
    const sid = extractCookie(post, UNIFIED_SID);
    assert.ok(sid);
    const home = await request(app)
      .get("/app")
      .set("Host", AC_HOST)
      .set("Accept", "text/html")
      .set("Cookie", `${UNIFIED_SID}=${sid}`);
    assert.equal(isLoginRedirect(home), false, `multi-clinic GET /app -> ${home.status} ${home.headers.location || ""}`);
  });
});
