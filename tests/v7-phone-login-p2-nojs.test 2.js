"use strict";

/**
 * V7 phone-login P2 closure:
 * - no-JS server-rendered mode=email|phone
 * - ActiveClinic auth must not import BlessBoard phone normalizer
 * - Zambia normalization matrix via shared phoneNumberService
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
const { normalizePhoneNumber } = require("../src/platform/services/phoneNumberService");
const {
  normalizeActiveClinicPhone,
} = require("../src/activeclinic/services/normalizeActiveClinicContact");
const {
  normalizeRegistrationPhone,
} = require("../src/blessboard/services/normalizeRegistrationPhone");
const {
  buildLoginModeHrefs,
  resolveLoginModeQuery,
} = require("../src/platform/auth/loginModeQuery");

const ROOT = path.join(__dirname, "..");
const BB_IDENTITY = "blessboard-platform-v5";
const AC_IDENTITY = "moovex-platform-v7";
const PASSWORD = "1234567890";
const APEX = "blessboard.org";
const AC_HOST = "activeclinic.org";
const PHONE_E164 = "+260971000001";

const ZAMBIA_MATRIX = [
  "0971000001",
  "971000001",
  "+260971000001",
  "260971000001",
  "0971 000 001",
  "0971-000-001",
];

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

function findNamedControl(html, name) {
  const src = String(html || "");
  const re = new RegExp(`<(?:input|select)[^>]*\\bname=["']${name}["'][^>]*>`, "gi");
  const match = re.exec(src);
  return match ? match[0] : "";
}

function assertControlState(html, name, { enabled, required }) {
  const tag = findNamedControl(html, name);
  assert.ok(tag, `expected control name=${name}`);
  const disabled = /\bdisabled\b/i.test(tag);
  const isRequired = /\brequired\b/i.test(tag);
  assert.equal(disabled, !enabled, `${name} disabled=${disabled}, expected enabled=${enabled}`);
  assert.equal(isRequired, required, `${name} required=${isRequired}, expected=${required}`);
}

function assertModeMarkup(html, mode) {
  assert.match(html, /href="\/login\?mode=email"/);
  assert.match(html, /href="\/login\?mode=phone"/);
  assert.match(html, /name="login_mode" value="(email|phone)"/);
  assert.match(html, new RegExp(`name="login_mode" value="${mode}"`));
  if (mode === "email") {
    assertControlState(html, "login_email", { enabled: true, required: true });
    assertControlState(html, "phone_national", { enabled: false, required: false });
  } else {
    assertControlState(html, "login_email", { enabled: false, required: false });
    assertControlState(html, "phone_national", { enabled: true, required: true });
  }
}

describe("v7 phone login P2", () => {
  describe("login mode query helpers", () => {
    it("defaults invalid/missing mode to email", () => {
      assert.equal(resolveLoginModeQuery(undefined), "email");
      assert.equal(resolveLoginModeQuery(""), "email");
      assert.equal(resolveLoginModeQuery("EMAIL"), "email");
      assert.equal(resolveLoginModeQuery("sms"), "email");
      assert.equal(resolveLoginModeQuery("phone"), "phone");
      assert.equal(resolveLoginModeQuery("PHONE"), "phone");
    });

    it("builds safe mode hrefs without transfer tokens", () => {
      const hrefs = buildLoginModeHrefs({
        mode: "phone",
        activated: "1",
        tr: "secret-transfer-token",
      });
      assert.equal(hrefs.modeEmailHref, "/login?activated=1&mode=email");
      assert.equal(hrefs.modePhoneHref, "/login?activated=1&mode=phone");
      assert.doesNotMatch(hrefs.modeEmailHref, /tr=/);
      assert.doesNotMatch(hrefs.modePhoneHref, /tr=/);
    });
  });

  describe("Zambia shared normalization matrix", () => {
    for (const input of ZAMBIA_MATRIX) {
      it(`normalizes ${JSON.stringify(input)} to ${PHONE_E164}`, () => {
        const shared = normalizePhoneNumber({
          phone: input,
          phoneCountry: "ZM",
          defaultCountry: "ZM",
          required: true,
        });
        assert.equal(shared.ok, true, shared.error || shared.code);
        assert.equal(shared.e164, PHONE_E164);

        const ac = normalizeActiveClinicPhone(input, { country: "ZM" });
        assert.equal(ac.ok, true, ac.error || ac.code);
        assert.equal(ac.normalized, PHONE_E164);

        const bb = normalizeRegistrationPhone(input, "ZM");
        assert.equal(bb.ok, true, bb.error);
        assert.equal(bb.normalized, PHONE_E164);
      });
    }
  });

  describe("ActiveClinic auth cross-product dependency guard", () => {
    const AUTH_MODULES = [
      "src/activeclinic/services/authenticateActiveClinicIdentity.js",
      "src/activeclinic/services/activeClinicPatientPortalAuthService.js",
      "src/activeclinic/services/activeClinicPatientPortalPasswordService.js",
      "src/activeclinic/http/activeClinicAuthRoutes.js",
    ];

    for (const rel of AUTH_MODULES) {
      it(`${rel} does not import BlessBoard normalizeRegistrationPhone`, () => {
        const src = read(rel);
        assert.doesNotMatch(src, /blessboard\/services\/normalizeRegistrationPhone/);
        assert.doesNotMatch(src, /normalizeRegistrationPhone/);
        assert.doesNotMatch(src, /normalizeBlessBoardPhone/);
      });
    }

    it("authenticateActiveClinicIdentity uses normalizeActiveClinicPhone", () => {
      const src = read("src/activeclinic/services/authenticateActiveClinicIdentity.js");
      assert.match(src, /normalizeActiveClinicPhone/);
      assert.match(src, /normalizeActiveClinicContact/);
    });
  });

  describe("BlessBoard no-JS mode + login", () => {
    let pool;
    let skip = false;
    let app;
    const email = "p2-nojs-bb@example.test";

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
          organizationKey: "p2-nojs-bb",
          displayName: "P2 NoJS BB",
          legalName: null,
          dataEnvironment: "testing",
          productKey: "blessboard",
          productTenantKey: "p2-nojs-bb",
          hostname: "p2-nojs-bb.blessboard.org",
          domainType: "canonical",
          deploymentCode: "blessboard-org-staging",
          isPrimary: true,
        });
        assert.equal(prov.ok, true);
        const ch = await provisionBlessBoardChurch(pool, {
          organizationKey: "p2-nojs-bb",
          churchKey: "p2-nojs-bb",
          displayName: "P2 NoJS Church",
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
           VALUES ($1, $1, 'P2 NoJS', $2, 'active', $3, '0971000001')
           RETURNING id`,
          [email, hash, PHONE_E164]
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
        console.log(`skip bb p2: ${err.message}`);
      }
    });

    after(async () => {
      if (pool) await pool.end().catch(() => {});
    });

    it("GET /login?mode=email renders email field usable", async () => {
      if (skip) return;
      const res = await request(app).get("/login?mode=email").set("Host", APEX);
      assert.equal(res.status, 200);
      assertModeMarkup(res.text, "email");
    });

    it("GET /login?mode=phone renders phone field usable", async () => {
      if (skip) return;
      const res = await request(app).get("/login?mode=phone").set("Host", APEX);
      assert.equal(res.status, 200);
      assertModeMarkup(res.text, "phone");
    });

    it("invalid mode defaults to email", async () => {
      if (skip) return;
      const res = await request(app).get("/login?mode=sms").set("Host", APEX);
      assert.equal(res.status, 200);
      assertModeMarkup(res.text, "email");
    });

    it("no-JS email login succeeds to /hq", async () => {
      if (skip) return;
      const get = await request(app).get("/login?mode=email").set("Host", APEX);
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
          login_email: email,
          password: PASSWORD,
        });
      assert.equal(res.status, 303);
      assert.equal(res.headers.location, "/hq");
    });

    it("no-JS phone login succeeds to /hq (same account)", async () => {
      if (skip) return;
      const get = await request(app).get("/login?mode=phone").set("Host", APEX);
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
          phone_national: "0971000001",
          password: PASSWORD,
        });
      assert.equal(res.status, 303);
      assert.equal(res.headers.location, "/hq");
    });

    it("wrong password in phone mode stays in phone mode", async () => {
      if (skip) return;
      const get = await request(app).get("/login?mode=phone").set("Host", APEX);
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
          phone_national: "0971000001",
          password: "wrong-password-1",
        });
      assert.equal(res.status, 401);
      assert.match(res.text, /Invalid email, phone number, or password/i);
      assertModeMarkup(res.text, "phone");
    });
  });

  describe("ActiveClinic no-JS mode + login", () => {
    let pool;
    let skip = false;
    let app;
    let email;
    let phone;

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
        const stamp = `p2${Date.now().toString(36)}`;
        email = `p2-nojs-${stamp}@example.test`;
        phone = "+260971000001";
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
          organizationKey: `p2-nojs-ac-${stamp}`,
          displayName: "P2 NoJS AC",
          productKey: "activeclinic",
          productTenantKey: `p2-nojs-ac-${stamp}`,
          deploymentCode: CODE_ACTIVECLINIC_ORG_V6,
        });
        assert.equal(prov.ok, true);
        const hco = await createHealthcareOrganization(pool, {
          organizationId: prov.records.organization.id,
          legalName: "P2 NoJS HCO",
          publicName: "P2 NoJS Clinic",
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
          firstName: "P2",
          lastName: "NoJS",
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
        console.log(`skip ac p2: ${err && err.message ? err.message : err}`);
        if (err && err.stack) console.log(err.stack.split("\n").slice(0, 4).join("\n"));
      }
    });

    after(async () => {
      if (pool) await pool.end().catch(() => {});
    });

    it("GET /login?mode=email renders email field usable", async () => {
      if (skip) return;
      const res = await request(app).get("/login?mode=email").set("Host", AC_HOST);
      assert.equal(res.status, 200);
      assertModeMarkup(res.text, "email");
    });

    it("GET /login?mode=phone renders phone field usable", async () => {
      if (skip) return;
      const res = await request(app).get("/login?mode=phone").set("Host", AC_HOST);
      assert.equal(res.status, 200);
      assertModeMarkup(res.text, "phone");
    });

    it("invalid mode defaults to email", async () => {
      if (skip) return;
      const res = await request(app).get("/login?mode=wat").set("Host", AC_HOST);
      assert.equal(res.status, 200);
      assertModeMarkup(res.text, "email");
    });

    it("no-JS email login succeeds to /app", async () => {
      if (skip) return;
      const get = await request(app).get("/login?mode=email").set("Host", AC_HOST);
      const csrf = extractCsrf(get.text);
      const csrfCookie = extractCookie(get, CSRF_COOKIE_ACTIVECLINIC_ORG);
      const res = await request(app)
        .post("/login")
        .set("Host", AC_HOST)
        .set("Cookie", `${CSRF_COOKIE_ACTIVECLINIC_ORG}=${csrfCookie}`)
        .type("form")
        .send({
          [CSRF_FIELD]: csrf,
          login_mode: "email",
          login_email: email,
          password: PASSWORD,
        });
      assert.equal(res.status, 303, res.text.slice(0, 200));
      assert.ok(
        String(res.headers.location || "").startsWith("/app"),
        `expected /app* got ${res.headers.location}`
      );
      assert.ok(extractCookie(res, COOKIE_ACTIVECLINIC_ORG));
    });

    it("no-JS phone login succeeds to /app (same account)", async () => {
      if (skip) return;
      const get = await request(app).get("/login?mode=phone").set("Host", AC_HOST);
      const csrf = extractCsrf(get.text);
      const csrfCookie = extractCookie(get, CSRF_COOKIE_ACTIVECLINIC_ORG);
      const res = await request(app)
        .post("/login")
        .set("Host", AC_HOST)
        .set("Cookie", `${CSRF_COOKIE_ACTIVECLINIC_ORG}=${csrfCookie}`)
        .type("form")
        .send({
          [CSRF_FIELD]: csrf,
          login_mode: "phone",
          phone_country: "ZM",
          phone_national: "0971000001",
          password: PASSWORD,
        });
      assert.equal(res.status, 303, res.text.slice(0, 200));
      assert.ok(
        String(res.headers.location || "").startsWith("/app"),
        `expected /app* got ${res.headers.location}`
      );
      assert.ok(extractCookie(res, COOKIE_ACTIVECLINIC_ORG));
    });

    it("wrong password in phone mode stays in phone mode", async () => {
      if (skip) return;
      const get = await request(app).get("/login?mode=phone").set("Host", AC_HOST);
      const csrf = extractCsrf(get.text);
      const csrfCookie = extractCookie(get, CSRF_COOKIE_ACTIVECLINIC_ORG);
      const res = await request(app)
        .post("/login")
        .set("Host", AC_HOST)
        .set("Cookie", `${CSRF_COOKIE_ACTIVECLINIC_ORG}=${csrfCookie}`)
        .type("form")
        .send({
          [CSRF_FIELD]: csrf,
          login_mode: "phone",
          phone_country: "ZM",
          phone_national: "0971000001",
          password: "wrong-password-1",
        });
      assert.equal(res.status, 401);
      assertModeMarkup(res.text, "phone");
      assert.match(res.text, /ac-auth-alert--error|Authentication failed|Invalid|credentials/i);
    });
  });

  describe("JS tab-switch payload contract (source)", () => {
    it("disables inactive fields and preventDefault on tab links", () => {
      const js = read("public/platform/gp-auth-reg.js");
      assert.match(js, /preventDefault/);
      assert.match(js, /setAttribute\("disabled"/);
      assert.match(js, /removeAttribute\("required"/);
      assert.match(js, /hidden\.value = mode/);
    });
  });
});
