"use strict";

/**
 * ACW08 shared ActiveClinic authentication — existing identity/session flow,
 * Stitch-mapped login/selector/loading surfaces.
 */

const { describe, it, before, after } = require("node:test");
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
const { createFacility } = require("../src/activeclinic/services/facilityService");
const {
  createStaffMember,
  linkStaffMemberToIdentity,
  suspendStaffMember,
} = require("../src/activeclinic/services/activeClinicStaffService");
const {
  assignStaffToFacility,
} = require("../src/activeclinic/services/activeClinicStaffFacilityService");
const {
  assignStaffRole,
  NETWORK_ADMIN,
} = require("../src/activeclinic/services/activeClinicAuthorizationService");
const {
  linkIdentityToProductProfile,
} = require("../src/platform/services/identityProductProfileService");
const {
  authenticateActiveClinicIdentity,
  STATUS: AUTH_STATUS,
} = require("../src/activeclinic/services/authenticateActiveClinicIdentity");
const {
  createActiveClinicFoundationApp,
} = require("../src/activeclinic/http/activeClinicFoundationServer");
const { createBlessBoardUser } = require("../src/blessboard/services/createBlessBoardUser");
const identityRepo = require("../src/platform/repositories/platformIdentityRepository");
const {
  CODE_ACTIVECLINIC_ORG_V6,
  COOKIE_ACTIVECLINIC_ORG,
  CSRF_COOKIE_ACTIVECLINIC_ORG,
  resetDeploymentProfileWarningsForTests,
} = require("../src/platform/config/deploymentProfiles");
const { CSRF_FIELD } = require("../src/platform/http/v5Csrf");
const { SELECTION_COOKIE } = require("../src/activeclinic/http/activeClinicAuthRoutes");
const { renderLoginPage } = require("../src/activeclinic/http/renderActiveClinicAuth");

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

async function provisionOrg(stamp, keyPrefix, publicName) {
  const result = await provisionPlatformTenant(pool, {
    skipDomain: true,
    dataEnvironment: "testing",
    organizationKey: `${keyPrefix}_${stamp}`,
    displayName: `AC Auth ${keyPrefix}`,
    productKey: "activeclinic",
    productTenantKey: `${keyPrefix}-${stamp}`,
    deploymentCode: CODE_ACTIVECLINIC_ORG_V6,
  });
  assert.equal(result.ok, true, JSON.stringify(result));
  const hco = await createHealthcareOrganization(pool, {
    organizationId: result.records.organization.id,
    legalName: `${publicName || keyPrefix} Legal`,
    publicName: publicName || `Public ${keyPrefix}`,
    organizationType: "private_healthcare",
    countryCode: "ZM",
    timezone: "Africa/Lusaka",
  });
  assert.equal(hco.ok, true, JSON.stringify(hco));
  const facility = await createFacility(pool, {
    organizationId: result.records.organization.id,
    healthcareOrganizationId: hco.healthcareOrganization.id,
    facilityKey: "main",
    displayName: "Main",
    facilityType: "hospital",
    status: "active",
    isPrimary: true,
    countryCode: "ZM",
    timezone: "Africa/Lusaka",
    phone: "+260970000099",
    city: "Lusaka",
    province: "Lusaka Province",
  });
  assert.equal(facility.ok, true, JSON.stringify(facility));
  return {
    orgId: result.records.organization.id,
    orgKey: result.records.organization.key,
    hcoId: hco.healthcareOrganization.id,
    facilityId: facility.facility.id,
    publicName: publicName || `Public ${keyPrefix}`,
  };
}

async function seedStaff(stamp, opts) {
  const options = opts || {};
  const digits = `${Date.now()}${Math.floor(Math.random() * 90 + 10)}`.slice(-7);
  const phone = options.phone || `+26097${digits}`;
  const email =
    options.email || `acw08_${stamp}_${Math.random().toString(36).slice(2, 6)}@example.test`;
  const identity = await createPlatformIdentity(pool, {
    primaryPhone: phone,
    phoneNormalized: phone,
    phoneVerifiedAt: new Date().toISOString(),
    primaryEmail: email,
    emailNormalized: email.toLowerCase(),
    emailVerifiedAt: new Date().toISOString(),
  });
  assert.equal(identity.ok, true, JSON.stringify(identity));
  const set = await setPlatformIdentityPassword(pool, {
    identityId: identity.identity.id,
    password: PASSWORD,
  });
  assert.equal(set.ok, true, JSON.stringify(set));

  const org = options.org || (await provisionOrg(stamp, options.keyPrefix || "acw08", options.publicName));
  const staff = await createStaffMember(pool, {
    organizationId: org.orgId,
    healthcareOrganizationId: org.hcoId,
    firstName: options.firstName || "Ada",
    lastName: options.lastName || "Clinic",
    employmentType: "contract",
    status: options.staffStatus || "active",
    phone: `+26096${digits}`,
  });
  assert.equal(staff.ok, true, JSON.stringify(staff));
  await linkStaffMemberToIdentity(pool, {
    id: staff.staffMember.id,
    organizationId: org.orgId,
    platformIdentityId: identity.identity.id,
  });
  await linkIdentityToProductProfile(pool, {
    identityId: identity.identity.id,
    productKey: "activeclinic",
    productProfileId: staff.staffMember.id,
  });
  await assignStaffRole(pool, {
    organizationId: org.orgId,
    staffMemberId: staff.staffMember.id,
    roleKey: NETWORK_ADMIN,
    scopeType: "organisation",
  });
  await assignStaffToFacility(pool, {
    organizationId: org.orgId,
    staffMemberId: staff.staffMember.id,
    facilityId: org.facilityId,
    isPrimary: true,
  });
  return { identity: identity.identity, staff: staff.staffMember, org, phone, email };
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

describe("ActiveClinic ACW08 shared authentication", () => {
  before(async () => {
    try {
      databaseUrl = await resetFoundationDatabase();
      pool = createFoundationPool(databaseUrl);
      await migrate({ connectionString: databaseUrl });
      resetDeploymentProfileWarningsForTests();
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

  function app() {
    return createActiveClinicFoundationApp({
      getPool: () => pool,
      env: MINIMAL_AC,
    });
  }

  async function getLogin() {
    const res = await request(app()).get("/login").set("Host", "activeclinic.org");
    const csrf = extractCookie(res, CSRF_COOKIE_ACTIVECLINIC_ORG);
    const match = String(res.text || "").match(/name="_csrf" value="([^"]+)"/);
    return { res, csrf, field: match ? match[1] : "" };
  }

  async function postLogin(identifier, password, extra) {
    const login = await getLogin();
    const post = await request(app())
      .post("/login")
      .set("Host", "activeclinic.org")
      .set("Cookie", `${CSRF_COOKIE_ACTIVECLINIC_ORG}=${login.csrf}`)
      .type("form")
      .send({
        [CSRF_FIELD]: login.field,
        identifier,
        password,
        ...(extra || {}),
      });
    return { login, post };
  }

  it("pre-auth login is ActiveClinic-only with phone-or-email and signing-in overlay", async () => {
    const html = renderLoginPage({ csrfToken: "csrf-acw08" });
    assert.match(html, /data-ac-composition="acw08-login"/);
    assert.match(html, /Phone number or email/);
    assert.match(html, /ActiveClinic/);
    assert.match(html, /data-ac-signing-in/);
    assert.match(html, /Signing you in/);
    assert.doesNotMatch(html, /Juflona|Demo Clinic|Google/);
    const page = await request(app()).get("/login").set("Host", "activeclinic.org");
    assert.equal(page.status, 200);
    assert.doesNotMatch(page.text, /Juflona|Demo Clinic/);
    const css = await request(app()).get("/activeclinic/ac-auth.css");
    assert.match(css.text, /overflow-x:\s*clip/);
    assert.match(css.text, /max-width:\s*390px/);
  });

  it("wrong password stays on login error and does not issue a session", async () => {
    requireDb();
    const stamp = Date.now().toString(36);
    const seeded = await seedStaff(stamp, { keyPrefix: "wp" });
    const { post } = await postLogin(seeded.phone, "definitely-wrong-password");
    assert.equal(post.status, 401);
    assert.match(post.text, /could not sign you in with those details/i);
    assert.match(post.text, /data-ac-auth-screen="login-error"/);
    assert.equal(extractCookie(post, COOKIE_ACTIVECLINIC_ORG), null);
  });

  it("phone and email login both enter a single eligible clinic", async () => {
    requireDb();
    const stamp = Date.now().toString(36);
    const seeded = await seedStaff(stamp, { keyPrefix: "pe", publicName: "Ndola Care ACW08" });
    const byPhone = await postLogin(seeded.phone, PASSWORD);
    assert.equal(byPhone.post.status, 303);
    assert.ok(["/app", "/app/onboarding"].includes(String(byPhone.post.headers.location)));
    assert.ok(extractCookie(byPhone.post, COOKIE_ACTIVECLINIC_ORG));

    const byEmail = await postLogin(seeded.email, PASSWORD);
    assert.equal(byEmail.post.status, 303);
    assert.ok(extractCookie(byEmail.post, COOKIE_ACTIVECLINIC_ORG));
  });

  it("multiple clinics redirect to the ACW08 selector with real clinic cards", async () => {
    requireDb();
    const stamp = Date.now().toString(36);
    const first = await seedStaff(stamp, { keyPrefix: "m1", publicName: "First Clinic ACW08" });
    const secondOrg = await provisionOrg(`${stamp}b`, "m2", "Second Clinic ACW08");
    const staff2 = await createStaffMember(pool, {
      organizationId: secondOrg.orgId,
      healthcareOrganizationId: secondOrg.hcoId,
      firstName: "Ada",
      lastName: "Two",
      employmentType: "contract",
      status: "active",
      phone: `+26095${`${Date.now()}`.slice(-7)}`,
    });
    await linkStaffMemberToIdentity(pool, {
      id: staff2.staffMember.id,
      organizationId: secondOrg.orgId,
      platformIdentityId: first.identity.id,
    });
    await linkIdentityToProductProfile(pool, {
      identityId: first.identity.id,
      productKey: "activeclinic",
      productProfileId: staff2.staffMember.id,
    });
    await assignStaffRole(pool, {
      organizationId: secondOrg.orgId,
      staffMemberId: staff2.staffMember.id,
      roleKey: NETWORK_ADMIN,
      scopeType: "organisation",
    });
    await assignStaffToFacility(pool, {
      organizationId: secondOrg.orgId,
      staffMemberId: staff2.staffMember.id,
      facilityId: secondOrg.facilityId,
      isPrimary: true,
    });

    const { post } = await postLogin(first.phone, PASSWORD);
    assert.equal(post.status, 303);
    assert.equal(post.headers.location, "/login/select-organization");
    const xfer = extractCookie(post, SELECTION_COOKIE);
    assert.ok(xfer);
    const selector = await request(app())
      .get("/login/select-organization")
      .set("Host", "activeclinic.org")
      .set("Cookie", `${SELECTION_COOKIE}=${xfer}`);
    assert.equal(selector.status, 200);
    assert.match(selector.text, /Choose a clinic|Select a Workspace/);
    assert.match(selector.text, /First Clinic ACW08/);
    assert.match(selector.text, /Second Clinic ACW08/);
    assert.match(selector.text, /data-ac-clinic-filter/);
    assert.match(selector.text, /Lusaka/);
    assert.doesNotMatch(selector.text, /Juflona|Demo Clinic/);
  });

  it("disabled membership and no clinic access use the safe state, not a password error", async () => {
    requireDb();
    const stamp = Date.now().toString(36);
    const seeded = await seedStaff(stamp, { keyPrefix: "dis" });
    await suspendStaffMember(pool, {
      id: seeded.staff.id,
      organizationId: seeded.org.orgId,
    });
    const disabled = await postLogin(seeded.phone, PASSWORD);
    assert.equal(disabled.post.status, 403);
    assert.match(disabled.post.text, /No clinic access/);
    assert.doesNotMatch(disabled.post.text, /could not sign you in with those details/i);
    assert.equal(extractCookie(disabled.post, COOKIE_ACTIVECLINIC_ORG), null);

    const phone = `+26097${`${Date.now()}`.slice(-8)}`;
    const email = `none_${stamp}@example.test`;
    const identity = await createPlatformIdentity(pool, {
      primaryPhone: phone,
      phoneNormalized: phone,
      phoneVerifiedAt: new Date().toISOString(),
      primaryEmail: email,
      emailNormalized: email,
      emailVerifiedAt: new Date().toISOString(),
    });
    await setPlatformIdentityPassword(pool, {
      identityId: identity.identity.id,
      password: PASSWORD,
    });
    const none = await postLogin(phone, PASSWORD);
    assert.equal(none.post.status, 403);
    assert.match(none.post.text, /No clinic access/);
  });

  it("platform admin without a clinic is not treated as a bad password", async () => {
    requireDb();
    const stamp = Date.now().toString(36);
    const org = await provisionOrg(stamp, "pa", "PA Holder Clinic");
    const phone = `+26097${`${Date.now()}`.slice(-8)}`;
    const email = `pa_${stamp}@example.test`;
    const identity = await createPlatformIdentity(pool, {
      primaryPhone: phone,
      phoneNormalized: phone,
      phoneVerifiedAt: new Date().toISOString(),
      primaryEmail: email,
      emailNormalized: email,
      emailVerifiedAt: new Date().toISOString(),
    });
    await setPlatformIdentityPassword(pool, {
      identityId: identity.identity.id,
      password: PASSWORD,
    });
    const bb = await createBlessBoardUser(pool, {
      email,
      displayName: "Platform Administrator",
      password: PASSWORD,
    });
    assert.equal(bb.ok, true, JSON.stringify(bb));
    await identityRepo.setBlessBoardUserPlatformIdentity(pool, {
      userId: bb.user.id,
      identityId: identity.identity.id,
    });
    await pool.query(
      `INSERT INTO blessboard.user_roles (user_id, organization_id, role_key, status)
       VALUES ($1, $2, 'platform_admin', 'active')`,
      [bb.user.id, org.orgId]
    );

    const auth = await authenticateActiveClinicIdentity(pool, {
      identifier: email,
      password: PASSWORD,
      deploymentCode: CODE_ACTIVECLINIC_ORG_V6,
      hostname: "activeclinic.org",
    });
    assert.equal(auth.status, AUTH_STATUS.PLATFORM_ADMIN);
    const { post } = await postLogin(email, PASSWORD);
    assert.equal(post.status, 200);
    assert.match(post.text, /Platform administration/);
    assert.doesNotMatch(post.text, /could not sign you in with those details/i);
    assert.equal(extractCookie(post, COOKIE_ACTIVECLINIC_ORG), null);
  });

  it("logout and re-login after account switch keep using the same /login", async () => {
    requireDb();
    const stamp = Date.now().toString(36);
    const first = await seedStaff(stamp, { keyPrefix: "lo1" });
    const second = await seedStaff(`${stamp}b`, { keyPrefix: "lo2" });
    const one = await postLogin(first.phone, PASSWORD);
    assert.equal(one.post.status, 303);
    const sid = extractCookie(one.post, COOKIE_ACTIVECLINIC_ORG);
    const csrf = extractCookie(one.post, CSRF_COOKIE_ACTIVECLINIC_ORG);
    const home = await request(app())
      .get("/app")
      .set("Host", "activeclinic.org")
      .set("Cookie", `${COOKIE_ACTIVECLINIC_ORG}=${sid}; ${CSRF_COOKIE_ACTIVECLINIC_ORG}=${csrf}`);
    const homeCsrf = extractCookie(home, CSRF_COOKIE_ACTIVECLINIC_ORG) || csrf;
    const logout = await request(app())
      .get("/logout")
      .set("Host", "activeclinic.org")
      .set("Cookie", `${COOKIE_ACTIVECLINIC_ORG}=${sid}; ${CSRF_COOKIE_ACTIVECLINIC_ORG}=${homeCsrf}`);
    assert.equal(logout.status, 303);
    assert.equal(logout.headers.location, "/login");

    const again = await postLogin(second.email, PASSWORD);
    assert.equal(again.post.status, 303);
    assert.ok(extractCookie(again.post, COOKIE_ACTIVECLINIC_ORG));
  });
});
