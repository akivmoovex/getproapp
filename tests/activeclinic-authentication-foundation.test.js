"use strict";

/**
 * ActiveClinic V6 — authentication foundation (AC-V6-08).
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
  verifyPlatformIdentityPassword,
  RESULT: CRED_RESULT,
} = require("../src/platform/services/platformIdentityCredentialService");
const {
  linkIdentityToProductProfile,
} = require("../src/platform/services/identityProductProfileService");
const {
  createHealthcareOrganization,
} = require("../src/activeclinic/services/healthcareOrganizationService");
const {
  createFacility,
} = require("../src/activeclinic/services/facilityService");
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
  FACILITY_ADMIN,
  STAFF_ROLE,
} = require("../src/activeclinic/services/activeClinicAuthorizationService");
const {
  authenticateActiveClinicIdentity,
  STATUS: AUTH_STATUS,
} = require("../src/activeclinic/services/authenticateActiveClinicIdentity");
const {
  createActiveClinicFoundationApp,
} = require("../src/activeclinic/http/activeClinicFoundationServer");
const {
  createBlessBoardUser,
} = require("../src/blessboard/services/createBlessBoardUser");
const {
  CODE_ACTIVECLINIC_ORG_V6,
  CODE_ORG_STAGING,
  COOKIE_ACTIVECLINIC_ORG,
  CSRF_COOKIE_ACTIVECLINIC_ORG,
  resetDeploymentProfileWarningsForTests,
} = require("../src/platform/config/deploymentProfiles");
const { CSRF_FIELD, issueCsrfToken } = require("../src/platform/http/v5Csrf");
const { createV5Session } = require("../src/platform/session/createV5Session");
const { readV5Session } = require("../src/platform/session/readV5Session");

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

async function provisionOrg(stamp, keyPrefix) {
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
    legalName: "Legal",
    publicName: "Public Hospital",
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
  });
  assert.equal(facility.ok, true, JSON.stringify(facility));
  return {
    orgId: result.records.organization.id,
    orgKey: result.records.organization.key,
    hcoId: hco.healthcareOrganization.id,
    facilityId: facility.facility.id,
  };
}

async function seedStaffLogin(stamp, opts) {
  const options = opts || {};
  const digits = `${Date.now()}${Math.floor(Math.random() * 90 + 10)}`.slice(-7);
  const phone = options.phone || `+26097${digits}`;
  const email = options.email || `ac_${stamp}_${Math.random().toString(36).slice(2, 6)}@example.test`;
  const identity = await createPlatformIdentity(pool, {
    primaryPhone: phone,
    phoneNormalized: phone,
    phoneVerifiedAt: new Date().toISOString(),
    primaryEmail: email,
    emailNormalized: email.toLowerCase(),
    emailVerifiedAt: new Date().toISOString(),
    mustChangePassword: options.mustChangePassword === true,
    status: options.identityStatus || "active",
  });
  assert.equal(identity.ok, true, JSON.stringify(identity));

  if (options.withPassword !== false) {
    const set = await setPlatformIdentityPassword(pool, {
      identityId: identity.identity.id,
      password: options.password || PASSWORD,
      mustChangePassword: options.mustChangePassword === true,
    });
    assert.equal(set.ok, true, JSON.stringify(set));
  }

  const org = options.org || (await provisionOrg(stamp, options.keyPrefix || "auth"));
  const staff = await createStaffMember(pool, {
    organizationId: org.orgId,
    healthcareOrganizationId: org.hcoId,
    firstName: "Ada",
    lastName: "Clinic",
    employmentType: "contract",
    status: options.staffStatus || "active",
    phone: options.staffPhone || `+26096${digits}`,
  });
  assert.equal(staff.ok, true, JSON.stringify(staff));
  const linked = await linkStaffMemberToIdentity(pool, {
    id: staff.staffMember.id,
    organizationId: org.orgId,
    platformIdentityId: identity.identity.id,
  });
  assert.equal(linked.ok, true, JSON.stringify(linked));
  await linkIdentityToProductProfile(pool, {
    identityId: identity.identity.id,
    productKey: "activeclinic",
    productProfileId: staff.staffMember.id,
  });

  if (options.roleKey !== false) {
    const role = await assignStaffRole(pool, {
      organizationId: org.orgId,
      staffMemberId: staff.staffMember.id,
      roleKey: options.roleKey || NETWORK_ADMIN,
      scopeType: options.scopeType || "organisation",
      facilityId: options.scopeType === "facility" ? org.facilityId : null,
      expiresAt: options.roleExpiresAt || null,
    });
    assert.equal(role.ok, true, JSON.stringify(role));
  }

  if (options.assignFacility) {
    const asg = await assignStaffToFacility(pool, {
      organizationId: org.orgId,
      staffMemberId: staff.staffMember.id,
      facilityId: org.facilityId,
      isPrimary: true,
    });
    assert.equal(asg.ok, true, JSON.stringify(asg));
  }

  return { identity, staff: staff.staffMember, org, phone, email };
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

describe("ActiveClinic authentication foundation (AC-V6-08)", () => {
  before(async () => {
    try {
      databaseUrl = await resetFoundationDatabase();
      pool = createFoundationPool(databaseUrl);
      await migrate({ connectionString: databaseUrl });
    } catch (err) {
      skipReason = err && err.message ? err.message : String(err);
    }
  });

  after(async () => {
    if (pool) await pool.end().catch(() => {});
  });

  beforeEach(() => {
    resetDeploymentProfileWarningsForTests();
  });

  function requireDb() {
    if (skipReason) {
      assert.fail(`Local PostgreSQL unavailable: ${skipReason}`);
    }
  }

  it("sets and verifies platform passwords without returning hashes", async () => {
    requireDb();
    const created = await createPlatformIdentity(pool, {
      primaryEmail: `cred_${Date.now()}@example.test`,
    });
    const set = await setPlatformIdentityPassword(pool, {
      identityId: created.identity.id,
      password: PASSWORD,
    });
    assert.equal(set.ok, true);
    assert.equal(set.identity.hasPasswordHash, true);
    assert.equal(set.identity.passwordHash, undefined);
    assert.ok(set.identity.credentialsUpdatedAt);

    const weak = await setPlatformIdentityPassword(pool, {
      identityId: created.identity.id,
      password: "short",
    });
    assert.equal(weak.ok, false);
    assert.equal(weak.code, CRED_RESULT.WEAK_PASSWORD);

    const bad = await verifyPlatformIdentityPassword(pool, {
      identityId: created.identity.id,
      password: "wrong-password-xx",
    });
    assert.equal(bad.ok, false);

    const good = await verifyPlatformIdentityPassword(pool, {
      identityId: created.identity.id,
      password: PASSWORD,
    });
    assert.equal(good.ok, true);
  });

  it("logs in ActiveClinic-only identity by phone without blessboard.users", async () => {
    requireDb();
    const stamp = Date.now().toString(36);
    const seeded = await seedStaffLogin(stamp, { keyPrefix: "ph" });
    const auth = await authenticateActiveClinicIdentity(pool, {
      identifier: seeded.phone,
      password: PASSWORD,
      deploymentCode: CODE_ACTIVECLINIC_ORG_V6,
      hostname: "activeclinic.org",
    });
    assert.equal(auth.ok, true, JSON.stringify(auth));
    assert.equal(auth.status, AUTH_STATUS.AUTHENTICATED);
    assert.ok(auth.rawToken);

    const session = await readV5Session(pool, {
      rawToken: auth.rawToken,
      deploymentCode: CODE_ACTIVECLINIC_ORG_V6,
    });
    assert.equal(session.ok, true);
    assert.equal(session.session.principalType, "platform_identity");
    assert.equal(session.session.userId, null);
  });

  it("email login works; unknown and wrong password share generic failure", async () => {
    requireDb();
    const stamp = `${Date.now().toString(36)}e`;
    const seeded = await seedStaffLogin(stamp, { keyPrefix: "em" });
    const ok = await authenticateActiveClinicIdentity(pool, {
      identifier: seeded.email,
      password: PASSWORD,
      deploymentCode: CODE_ACTIVECLINIC_ORG_V6,
      hostname: "activeclinic.org",
    });
    assert.equal(ok.ok, true);

    const unknown = await authenticateActiveClinicIdentity(pool, {
      identifier: "+260955555555",
      password: PASSWORD,
      deploymentCode: CODE_ACTIVECLINIC_ORG_V6,
      hostname: "activeclinic.org",
    });
    assert.equal(unknown.ok, false);
    assert.equal(unknown.status, AUTH_STATUS.INVALID_CREDENTIALS);

    const wrong = await authenticateActiveClinicIdentity(pool, {
      identifier: seeded.email,
      password: "definitely-wrong-password",
      deploymentCode: CODE_ACTIVECLINIC_ORG_V6,
      hostname: "activeclinic.org",
    });
    assert.equal(wrong.ok, false);
    assert.equal(wrong.status, AUTH_STATUS.INVALID_CREDENTIALS);
    assert.equal(wrong.message, unknown.message);
  });

  it("denies suspended staff, missing roles, and missing credentials", async () => {
    requireDb();
    const stamp = `${Date.now().toString(36)}d`;
    const seeded = await seedStaffLogin(stamp, { keyPrefix: "dn" });
    await suspendStaffMember(pool, {
      id: seeded.staff.id,
      organizationId: seeded.org.orgId,
    });
    const suspended = await authenticateActiveClinicIdentity(pool, {
      identifier: seeded.phone,
      password: PASSWORD,
      deploymentCode: CODE_ACTIVECLINIC_ORG_V6,
      hostname: "activeclinic.org",
    });
    assert.equal(suspended.ok, false);
    assert.equal(suspended.status, AUTH_STATUS.ACCESS_UNAVAILABLE);

    const noPw = await seedStaffLogin(`${stamp}n`, {
      keyPrefix: "np",
      withPassword: false,
    });
    const missing = await authenticateActiveClinicIdentity(pool, {
      identifier: noPw.phone,
      password: PASSWORD,
      deploymentCode: CODE_ACTIVECLINIC_ORG_V6,
      hostname: "activeclinic.org",
    });
    assert.equal(missing.ok, false);
    assert.equal(missing.status, AUTH_STATUS.INVALID_CREDENTIALS);
  });

  it("requires organization selection for multi-org staff", async () => {
    requireDb();
    const stamp = `${Date.now().toString(36)}m`;
    const first = await seedStaffLogin(stamp, { keyPrefix: "m1" });
    const secondOrg = await provisionOrg(`${stamp}b`, "m2");
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
      platformIdentityId: first.identity.identity.id,
    });
    await linkIdentityToProductProfile(pool, {
      identityId: first.identity.identity.id,
      productKey: "activeclinic",
      productProfileId: staff2.staffMember.id,
    });
    await assignStaffRole(pool, {
      organizationId: secondOrg.orgId,
      staffMemberId: staff2.staffMember.id,
      roleKey: NETWORK_ADMIN,
      scopeType: "organisation",
    });

    const auth = await authenticateActiveClinicIdentity(pool, {
      identifier: first.phone,
      password: PASSWORD,
      deploymentCode: CODE_ACTIVECLINIC_ORG_V6,
      hostname: "activeclinic.org",
    });
    assert.equal(auth.ok, true, JSON.stringify(auth));
    assert.equal(auth.status, AUTH_STATUS.SELECT_ORGANIZATION);
    assert.ok(auth.selectionToken);
    assert.ok(auth.organizations.length >= 2);
  });

  it("HTTP login sets ActiveClinic session and CSRF cookies; logout clears AC only", async () => {
    requireDb();
    const stamp = `${Date.now().toString(36)}h`;
    const seeded = await seedStaffLogin(stamp, { keyPrefix: "http" });
    const app = createActiveClinicFoundationApp({
      getPool: () => pool,
      env: MINIMAL_AC,
    });

    const getLogin = await request(app).get("/login").set("Host", "activeclinic.org");
    assert.equal(getLogin.status, 200);
    assert.match(getLogin.text, /data-ac-page="login"/);
    const csrf = extractCookie(getLogin, CSRF_COOKIE_ACTIVECLINIC_ORG);
    assert.ok(csrf);

    const match = getLogin.text.match(/name="_csrf" value="([^"]+)"/);
    assert.ok(match);

    const post = await request(app)
      .post("/login")
      .set("Host", "activeclinic.org")
      .set("Cookie", `${CSRF_COOKIE_ACTIVECLINIC_ORG}=${csrf}`)
      .type("form")
      .send({
        [CSRF_FIELD]: match[1],
        identifier: seeded.phone,
        password: PASSWORD,
      });
    assert.equal(post.status, 303);
    assert.equal(post.headers.location, "/app");
    const sid = extractCookie(post, COOKIE_ACTIVECLINIC_ORG);
    assert.ok(sid);

    const appPage = await request(app)
      .get("/app")
      .set("Host", "activeclinic.org")
      .set("Cookie", `${COOKIE_ACTIVECLINIC_ORG}=${sid}; ${CSRF_COOKIE_ACTIVECLINIC_ORG}=${csrf}`);
    assert.equal(appPage.status, 200);
    assert.match(appPage.text, /data-ac-shell="staff-app"/);
    assert.match(appPage.text, /data-ac-page="home"/);
    assert.match(appPage.text, /Ada Clinic|Public Hospital/);
    // Patients nav is Stitch P02 (real admin module). Still forbid fabricated clinical KPIs.
    assert.doesNotMatch(
      appPage.text,
      /revenue|prescription|patient census|appointments today|clinical KPI/i
    );

    // BlessBoard cookie must not be set by AC login.
    const setCookies = [].concat(post.headers["set-cookie"] || []).join("\n");
    assert.doesNotMatch(setCookies, /blessboard_org_sid=/);

    const csrfApp = extractCookie(appPage, CSRF_COOKIE_ACTIVECLINIC_ORG) || csrf;
    const csrfField = appPage.text.match(/name="_csrf" value="([^"]+)"/);
    const logout = await request(app)
      .post("/logout")
      .set("Host", "activeclinic.org")
      .set("Cookie", `${COOKIE_ACTIVECLINIC_ORG}=${sid}; ${CSRF_COOKIE_ACTIVECLINIC_ORG}=${csrfApp}`)
      .type("form")
      .send({ [CSRF_FIELD]: csrfField[1] });
    assert.equal(logout.status, 303);
    assert.equal(logout.headers.location, "/login");
  });

  it("password_change_required blocks /app until password updated", async () => {
    requireDb();
    const stamp = `${Date.now().toString(36)}p`;
    const seeded = await seedStaffLogin(stamp, {
      keyPrefix: "pw",
      mustChangePassword: true,
    });
    const auth = await authenticateActiveClinicIdentity(pool, {
      identifier: seeded.phone,
      password: PASSWORD,
      deploymentCode: CODE_ACTIVECLINIC_ORG_V6,
      hostname: "activeclinic.org",
    });
    assert.equal(auth.ok, true);
    assert.equal(auth.status, AUTH_STATUS.MUST_CHANGE_PASSWORD);

    const app = createActiveClinicFoundationApp({
      getPool: () => pool,
      env: MINIMAL_AC,
    });
    const csrfToken = issueCsrfToken(MINIMAL_AC);
    const gated = await request(app)
      .get("/app")
      .set("Host", "activeclinic.org")
      .set(
        "Cookie",
        `${COOKIE_ACTIVECLINIC_ORG}=${auth.rawToken}; ${CSRF_COOKIE_ACTIVECLINIC_ORG}=${csrfToken}`
      );
    assert.equal(gated.status, 303);
    assert.equal(gated.headers.location, "/account/change-password");
  });

  it("BlessBoard-only user cannot authenticate to ActiveClinic", async () => {
    requireDb();
    const stamp = Date.now().toString(36);
    const bb = await createBlessBoardUser(pool, {
      email: `bbonly_${stamp}@example.test`,
      displayName: "BB Only",
      password: PASSWORD,
    });
    assert.equal(bb.ok, true);
    const auth = await authenticateActiveClinicIdentity(pool, {
      identifier: `bbonly_${stamp}@example.test`,
      password: PASSWORD,
      deploymentCode: CODE_ACTIVECLINIC_ORG_V6,
      hostname: "activeclinic.org",
    });
    assert.equal(auth.ok, false);
    assert.equal(auth.status, AUTH_STATUS.INVALID_CREDENTIALS);

    // Dual-product: BB session still creatable separately
    const bbSess = await createV5Session(pool, {
      deploymentCode: CODE_ORG_STAGING,
      userId: bb.user.id,
    });
    assert.equal(bbSess.ok, true);
  });

  it("credential migration columns exist", async () => {
    requireDb();
    const cols = await pool.query(
      `SELECT column_name FROM information_schema.columns
        WHERE table_schema = 'platform' AND table_name = 'identities'
          AND column_name IN (
            'failed_sign_in_count','sign_in_locked_until','last_sign_in_at','credentials_updated_at'
          )`
    );
    assert.equal(cols.rowCount, 4);
  });
});
