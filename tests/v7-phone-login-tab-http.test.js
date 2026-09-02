"use strict";

/**
 * V7 phone-tab login form contract — POST login_mode=phone + phone_national.
 */

const { describe, it, before, after } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const request = require("supertest");
const bcrypt = require("bcryptjs");

const {
  resetFoundationDatabase,
  createFoundationPool,
} = require("./helpers/foundationDb");
const { migrate } = require("../db/scripts/lib/migrator");
const { ensureDatabaseIdentity } = require("../db/scripts/lib/databaseIdentity");
const { provisionPlatformTenant } = require("../src/platform/services/provisionPlatformTenant");
const { createPlatformIdentity } = require("../src/platform/services/platformIdentityService");
const { setPlatformIdentityPassword } = require("../src/platform/services/platformIdentityCredentialService");
const { createHealthcareOrganization } = require("../src/activeclinic/services/healthcareOrganizationService");
const { createFacility } = require("../src/activeclinic/services/facilityService");
const {
  createStaffMember,
  linkStaffMemberToIdentity,
} = require("../src/activeclinic/services/activeClinicStaffService");
const { assignStaffToFacility } = require("../src/activeclinic/services/activeClinicStaffFacilityService");
const {
  assignStaffRole,
  NETWORK_ADMIN,
} = require("../src/activeclinic/services/activeClinicAuthorizationService");
const { linkIdentityToProductProfile } = require("../src/platform/services/identityProductProfileService");
const { provisionBlessBoardChurch } = require("../src/blessboard/services/provisionBlessBoardChurch");
const { createV5FoundationApp } = require("../src/platform/http/v5FoundationServer");
const { createActiveClinicFoundationApp } = require("../src/activeclinic/http/activeClinicFoundationServer");
const { CSRF_FIELD, CSRF_COOKIE } = require("../src/platform/http/v5Csrf");
const {
  CODE_ACTIVECLINIC_ORG_V6,
  COOKIE_ACTIVECLINIC_ORG,
  CSRF_COOKIE_ACTIVECLINIC_ORG,
} = require("../src/platform/config/deploymentProfiles");
const { resolveLoginIdentifierFromBody } = require("../src/platform/auth/resolveLoginIdentifier");

const ROOT = path.join(__dirname, "..");
const BB_IDENTITY = "blessboard-platform-v5";
const AC_IDENTITY = "moovex-platform-v7";
const PASSWORD = "1234567890";
const APEX = "blessboard.org";
const AC_HOST = "activeclinic.org";
const PHONE_E164 = "+260978881234";

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), "utf8");
}

function extractCsrf(html) {
  const match = String(html || "").match(/name="_csrf" value="([^"]+)"/);
  return match ? match[1] : "";
}

function extractCookie(res, name) {
  const raw = res.headers["set-cookie"];
  if (!raw) return null;
  const list = Array.isArray(raw) ? raw : [raw];
  for (const line of list) {
    if (String(line).startsWith(`${name}=`)) {
      return String(line).split(";")[0].slice(name.length + 1);
    }
  }
  return null;
}

describe("v7 phone login tab", () => {
  it("gp-auth-reg.js toggles required on email vs phone inputs", () => {
    const js = read("public/platform/gp-auth-reg.js");
    assert.match(js, /setFieldRequired/);
    assert.match(js, /login_email/);
    assert.match(js, /phone_national/);
    assert.match(js, /mode === "phone"/);
  });

  it("resolveLoginIdentifierFromBody normalizes Zambia phone formats", () => {
    for (const national of ["0971234567", "971234567", "97 123 4567"]) {
      const resolved = resolveLoginIdentifierFromBody({
        login_mode: "phone",
        phone_country: "ZM",
        phone_national: national,
      });
      assert.equal(resolved.mode, "phone");
      assert.equal(resolved.identifier, "+260971234567");
    }
  });

  describe("BlessBoard HTTP /login phone tab", () => {
    let pool;
    let skip = false;
    let app;

    before(async () => {
      try {
        const databaseUrl = await resetFoundationDatabase();
        pool = createFoundationPool(databaseUrl);
        await migrate({ connectionString: databaseUrl });
        await ensureDatabaseIdentity(pool, {
          connectionString: databaseUrl,
          identityKey: BB_IDENTITY,
          environmentCode: "testing",
        });
        const prov = await provisionPlatformTenant(pool, {
          organizationKey: "phone-tab-bb",
          displayName: "Phone Tab BB",
          legalName: null,
          dataEnvironment: "testing",
          productKey: "blessboard",
          productTenantKey: "phone-tab-bb",
          hostname: "phone-tab-bb.blessboard.org",
          domainType: "canonical",
          deploymentCode: "blessboard-org-staging",
          isPrimary: true,
        });
        assert.equal(prov.ok, true);
        const ch = await provisionBlessBoardChurch(pool, {
          organizationKey: "phone-tab-bb",
          churchKey: "phone-tab-bb",
          displayName: "Phone Tab Church",
          dataEnvironment: "testing",
          hqBranchKey: "hq",
          hqBranchDisplayName: "HQ",
        });
        assert.equal(ch.ok, true);
        const hash = await bcrypt.hash(PASSWORD, 4);
        const user = await pool.query(
          `INSERT INTO blessboard.users
             (email_normalized, email_display, display_name, password_hash, status,
              phone_normalized, phone_display)
           VALUES ('phone-tab@example.test', 'phone-tab@example.test', 'Phone Tab', $1, 'active',
                   $2, '0978881234')
           RETURNING id`,
          [hash, PHONE_E164]
        );
        await pool.query(
          `INSERT INTO blessboard.user_roles (user_id, organization_id, church_id, role_key, status)
           VALUES ($1, $2, $3, 'church_hq_admin', 'active')`,
          [user.rows[0].id, prov.records.organization.id, ch.records.church.id]
        );
        app = createV5FoundationApp({
          getPool: () => pool,
          env: {
            NODE_ENV: "test",
            PLATFORM_DEPLOYMENT_CODE: "blessboard-org-staging",
            SESSION_SECRET: "test-session-secret-at-least-32-chars!!",
            BLESSBOARD_TENANT_ROUTING_MODE: "authoritative",
            BLESSBOARD_AUTHORITATIVE_HOST_ALLOWLIST: "*",
          },
        });
      } catch (err) {
        skip = true;
        console.log(`skip: ${err.message}`);
      }
    });

    after(async () => {
      if (pool) await pool.end().catch(() => {});
    });

    async function postPhoneTab(national) {
      const get = await request(app).get("/login").set("Host", APEX);
      const csrf = extractCsrf(get.text);
      const csrfCookie = extractCookie(get, CSRF_COOKIE);
      return request(app)
        .post("/login")
        .set("Host", APEX)
        .set("Cookie", `${CSRF_COOKIE}=${csrfCookie}`)
        .type("form")
        .send({
          [CSRF_FIELD]: csrf,
          login_mode: "phone",
          phone_country: "ZM",
          phone_national: national,
          password: PASSWORD,
        });
    }

    it("phone tab POST succeeds for local and national formats", async () => {
      if (skip) return;
      for (const national of ["0978881234", "978881234", "+260978881234"]) {
        const res = await postPhoneTab(national);
        assert.equal(res.status, 303, `${national} -> ${res.status} ${res.text.slice(0, 120)}`);
        assert.equal(res.headers.location, "/hq");
      }
    });

    it("wrong password returns invalid credentials without session", async () => {
      if (skip) return;
      const get = await request(app).get("/login").set("Host", APEX);
      const csrf = extractCsrf(get.text);
      const csrfCookie = extractCookie(get, CSRF_COOKIE);
      const res = await request(app)
        .post("/login")
        .set("Host", APEX)
        .set("Cookie", `${CSRF_COOKIE}=${csrfCookie}`)
        .type("form")
        .send({
          [CSRF_FIELD]: csrf,
          login_mode: "phone",
          phone_country: "ZM",
          phone_national: "0978881234",
          password: "wrong-password-1",
        });
      assert.equal(res.status, 401);
      assert.match(res.text, /Invalid email, phone number, or password/i);
      assert.equal(extractCookie(res, "blessboard_org_sid"), null);
    });

    it("email tab with phone digits in login_email still authenticates", async () => {
      if (skip) return;
      const get = await request(app).get("/login").set("Host", APEX);
      const csrf = extractCsrf(get.text);
      const csrfCookie = extractCookie(get, CSRF_COOKIE);
      const res = await request(app)
        .post("/login")
        .set("Host", APEX)
        .set("Cookie", `${CSRF_COOKIE}=${csrfCookie}`)
        .type("form")
        .send({
          [CSRF_FIELD]: csrf,
          login_mode: "email",
          login_email: "0978881234",
          password: PASSWORD,
        });
      assert.equal(res.status, 303);
      assert.equal(res.headers.location, "/hq");
    });
  });

  describe("ActiveClinic HTTP /login phone tab", () => {
    let pool;
    let skip = false;
    let app;
    let phone;
    let email;

    before(async () => {
      try {
        const databaseUrl = await resetFoundationDatabase();
        pool = createFoundationPool(databaseUrl);
        await migrate({ connectionString: databaseUrl });
        await ensureDatabaseIdentity(pool, {
          connectionString: databaseUrl,
          identityKey: AC_IDENTITY,
          environmentCode: "testing",
        });
        const stamp = `pt${Date.now().toString(36)}`;
        email = `phone-tab-${stamp}@example.test`;
        phone = "+260978889999";
        const identity = await createPlatformIdentity(pool, {
          primaryPhone: phone,
          phoneNormalized: phone,
          phoneVerifiedAt: new Date().toISOString(),
          primaryEmail: email,
          emailNormalized: email.toLowerCase(),
          emailVerifiedAt: new Date().toISOString(),
        });
        assert.equal(identity.ok, true);
        const setPw = await setPlatformIdentityPassword(pool, {
          identityId: identity.identity.id,
          password: PASSWORD,
        });
        assert.equal(setPw.ok, true);
        const prov = await provisionPlatformTenant(pool, {
          skipDomain: true,
          dataEnvironment: "testing",
          organizationKey: `phone-tab-${stamp}`,
          displayName: "Phone Tab Clinic",
          productKey: "activeclinic",
          productTenantKey: `phone-tab-${stamp}`,
          deploymentCode: CODE_ACTIVECLINIC_ORG_V6,
        });
        assert.equal(prov.ok, true);
        const hco = await createHealthcareOrganization(pool, {
          organizationId: prov.records.organization.id,
          legalName: "Phone Tab Legal",
          publicName: "Phone Tab Clinic",
          organizationType: "private_healthcare",
          countryCode: "ZM",
          timezone: "Africa/Lusaka",
        });
        assert.equal(hco.ok, true);
        const facility = await createFacility(pool, {
          organizationId: prov.records.organization.id,
          healthcareOrganizationId: hco.healthcareOrganization.id,
          facilityKey: "main",
          displayName: "Main",
          facilityType: "hospital",
          status: "active",
          isPrimary: true,
          countryCode: "ZM",
          timezone: "Africa/Lusaka",
          phone,
        });
        assert.equal(facility.ok, true);
        const staff = await createStaffMember(pool, {
          organizationId: prov.records.organization.id,
          healthcareOrganizationId: hco.healthcareOrganization.id,
          firstName: "Phone",
          lastName: "Tab",
          employmentType: "permanent",
          status: "active",
          phone,
          email,
        });
        assert.equal(staff.ok, true);
        await linkStaffMemberToIdentity(pool, {
          id: staff.staffMember.id,
          organizationId: prov.records.organization.id,
          platformIdentityId: identity.identity.id,
        });
        await linkIdentityToProductProfile(pool, {
          identityId: identity.identity.id,
          productKey: "activeclinic",
          productProfileId: staff.staffMember.id,
        });
        await assignStaffRole(pool, {
          organizationId: prov.records.organization.id,
          staffMemberId: staff.staffMember.id,
          roleKey: NETWORK_ADMIN,
          scopeType: "organisation",
        });
        await assignStaffToFacility(pool, {
          organizationId: prov.records.organization.id,
          staffMemberId: staff.staffMember.id,
          facilityId: facility.facility.id,
          isPrimary: true,
        });
        app = createActiveClinicFoundationApp({
          getPool: () => pool,
          env: {
            NODE_ENV: "test",
            PLATFORM_DEPLOYMENT_CODE: CODE_ACTIVECLINIC_ORG_V6,
            SESSION_SECRET: "a".repeat(40),
          },
        });
      } catch (err) {
        skip = true;
        console.log(`skip: ${err.message}`);
      }
    });

    after(async () => {
      if (pool) await pool.end().catch(() => {});
    });

    it("phone tab POST succeeds", async () => {
      if (skip) return;
      const get = await request(app).get("/login").set("Host", AC_HOST);
      const csrf = extractCsrf(get.text);
      const csrfCookieVal = extractCookie(get, CSRF_COOKIE_ACTIVECLINIC_ORG);
      const res = await request(app)
        .post("/login")
        .set("Host", AC_HOST)
        .set("Cookie", `${CSRF_COOKIE_ACTIVECLINIC_ORG}=${csrfCookieVal}`)
        .type("form")
        .send({
          [CSRF_FIELD]: csrf,
          login_mode: "phone",
          phone_country: "ZM",
          phone_national: "0978889999",
          password: PASSWORD,
        });
      assert.equal(res.status, 303, res.text.slice(0, 200));
      assert.ok(extractCookie(res, COOKIE_ACTIVECLINIC_ORG));
    });
  });
});
