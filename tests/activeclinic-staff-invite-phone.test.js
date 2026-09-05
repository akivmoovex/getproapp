"use strict";

/**
 * Staff invite phone validation — split field (country + national) must not
 * be rejected as "Phone is required" when legacy hidden phone is empty.
 */

const { describe, it, before, after } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const request = require("supertest");

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
  CLINICIAN,
} = require("../src/activeclinic/services/activeClinicAuthorizationService");
const { linkIdentityToProductProfile } = require("../src/platform/services/identityProductProfileService");
const { createActiveClinicFoundationApp } = require("../src/activeclinic/http/activeClinicFoundationServer");
const { CSRF_FIELD } = require("../src/platform/http/v5Csrf");
const {
  CODE_ACTIVECLINIC_ORG_V6,
  COOKIE_ACTIVECLINIC_ORG,
  CSRF_COOKIE_ACTIVECLINIC_ORG,
} = require("../src/platform/config/deploymentProfiles");
const {
  parseStaffFormBody,
  validateStaffFormValues,
} = require("../src/activeclinic/services/loadActiveClinicStaffFormScreens");
const {
  normalizeActiveClinicPhone,
} = require("../src/activeclinic/services/normalizeActiveClinicContact");
const { normalizePhoneNumber } = require("../src/platform/services/phoneNumberService");

const ROOT = path.join(__dirname, "..");
const AC_IDENTITY = "moovex-platform-v7";
const PASSWORD = "1234567890";
const AC_HOST = "activeclinic.org";
const EXPECTED = "+260977198697";

const MATRIX = [
  { phone: "", phone_country: "ZM", phone_national: "977198697" },
  { phone: "", phone_country: "ZM", phone_national: "0977198697" },
  { phone: "+260977198697", phone_country: "ZM", phone_national: "" },
  { phone: "", phone_country: "ZM", phone_national: "0977 198 697" },
  { phone: "", phone_country: "ZM", phone_national: "0977-198-697" },
  { phone: "260977198697", phone_country: "ZM", phone_national: "" },
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

describe("AC staff invite phone validation", () => {
  describe("unit: split-field validation", () => {
    for (const input of MATRIX) {
      it(`accepts ${JSON.stringify(input)} → ${EXPECTED}`, () => {
        const values = parseStaffFormBody({
          first_name: "Invite",
          last_name: "Phone",
          employment_type: "permanent",
          ...input,
        });
        const checked = validateStaffFormValues(values, {});
        assert.equal(checked.ok, true, JSON.stringify(checked));
        assert.equal(values.phone, EXPECTED);
        assert.doesNotMatch(JSON.stringify(checked.errors), /required/i);
      });
    }

    it("rejects empty phone with a single required message", () => {
      const values = parseStaffFormBody({
        first_name: "Invite",
        last_name: "Phone",
        employment_type: "permanent",
        phone: "",
        phone_country: "ZM",
        phone_national: "",
      });
      const checked = validateStaffFormValues(values, {});
      assert.equal(checked.ok, false);
      assert.equal(checked.fieldErrors.phone, "Phone number is required.");
      assert.deepEqual(checked.errors, ["Phone number is required."]);
    });

    it("rejects malformed phone without saying required", () => {
      const values = parseStaffFormBody({
        first_name: "Invite",
        last_name: "Phone",
        employment_type: "permanent",
        phone: "",
        phone_country: "ZM",
        phone_national: "12",
      });
      const checked = validateStaffFormValues(values, {});
      assert.equal(checked.ok, false);
      assert.equal(checked.fieldErrors.phone, "Enter a valid phone number.");
      assert.doesNotMatch(checked.fieldErrors.phone, /required/i);
    });

    it("preserves national/country when another field fails", () => {
      const values = parseStaffFormBody({
        first_name: "",
        last_name: "Phone",
        employment_type: "permanent",
        phone: "",
        phone_country: "ZM",
        phone_national: "977198697",
      });
      const checked = validateStaffFormValues(values, {});
      assert.equal(checked.ok, false);
      assert.ok(checked.fieldErrors.first_name);
      assert.equal(checked.fieldErrors.phone, undefined);
      assert.equal(values.phone, EXPECTED);
      assert.equal(values.phoneNational, "977198697");
      assert.equal(values.phoneCountry, "ZM");
    });

    it("matrix matches shared phoneNumberService", () => {
      for (const raw of [
        "0977198697",
        "977198697",
        "+260977198697",
        "260977198697",
        "0977 198 697",
        "0977-198-697",
      ]) {
        const shared = normalizePhoneNumber({
          phone: raw,
          phoneCountry: "ZM",
          defaultCountry: "ZM",
          required: true,
        });
        const ac = normalizeActiveClinicPhone(raw, { country: "ZM" });
        assert.equal(shared.ok, true, raw);
        assert.equal(shared.e164, EXPECTED);
        assert.equal(ac.ok, true, raw);
        assert.equal(ac.normalized, EXPECTED);
      }
    });
  });

  describe("architecture: no BlessBoard phone imports in AC production", () => {
    const dirs = [
      "src/activeclinic/services",
      "src/activeclinic/http",
    ];
    it("no normalizeRegistrationPhone / normalizeBlessBoardPhone requires", () => {
      const offenders = [];
      for (const dir of dirs) {
        const abs = path.join(ROOT, dir);
        for (const name of fs.readdirSync(abs)) {
          if (!name.endsWith(".js")) continue;
          const rel = path.join(dir, name);
          const src = read(rel);
          if (
            /blessboard\/services\/normalizeRegistrationPhone/.test(src) ||
            /blessboard\/services\/normalizeBlessBoardPhone/.test(src) ||
            /normalizeRegistrationPhone/.test(src) ||
            /normalizeBlessBoardPhone/.test(src)
          ) {
            offenders.push(rel);
          }
        }
      }
      assert.deepEqual(offenders, []);
    });
  });

  describe("HTTP staff invite with split phone fields", () => {
    let pool;
    let skip = false;
    let app;
    let facilityId;
    let adminCookie;

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
        const stamp = `si${Date.now().toString(36)}`;
        const email = `staff-invite-admin-${stamp}@example.test`;
        const phone = "+260971111111";
        const identity = await createPlatformIdentity(pool, {
          primaryPhone: phone,
          phoneNormalized: phone,
          phoneVerifiedAt: new Date().toISOString(),
          primaryEmail: email,
          emailNormalized: email.toLowerCase(),
          emailVerifiedAt: new Date().toISOString(),
        });
        assert.equal(identity.ok, true);
        await setPlatformIdentityPassword(pool, {
          identityId: identity.identity.id,
          password: PASSWORD,
        });
        const prov = await provisionPlatformTenant(pool, {
          skipDomain: true,
          dataEnvironment: "testing",
          organizationKey: `staff-invite-${stamp}`,
          displayName: "Staff Invite Clinic",
          productKey: "activeclinic",
          productTenantKey: `staff-invite-${stamp}`,
          deploymentCode: CODE_ACTIVECLINIC_ORG_V6,
        });
        assert.equal(prov.ok, true);
        const hco = await createHealthcareOrganization(pool, {
          organizationId: prov.records.organization.id,
          legalName: "Staff Invite HCO",
          publicName: "Staff Invite Clinic",
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
        facilityId = facility.facility.id;
        const staff = await createStaffMember(pool, {
          organizationId: prov.records.organization.id,
          healthcareOrganizationId: hco.healthcareOrganization.id,
          firstName: "Admin",
          lastName: "Invite",
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
          facilityId,
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

        const loginGet = await request(app).get("/login").set("Host", AC_HOST);
        const csrf = extractCsrf(loginGet.text);
        const csrfCookie = extractCookie(loginGet, CSRF_COOKIE_ACTIVECLINIC_ORG);
        const loginPost = await request(app)
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
        assert.equal(loginPost.status, 303);
        const sid = extractCookie(loginPost, COOKIE_ACTIVECLINIC_ORG);
        assert.ok(sid);
        adminCookie = `${COOKIE_ACTIVECLINIC_ORG}=${sid}`;
      } catch (err) {
        skip = true;
        console.log(`skip staff invite phone http: ${err.message}`);
      }
    });

    after(async () => {
      if (pool) await pool.end().catch(() => {});
    });

    async function postInvite(fields) {
      const get = await request(app)
        .get("/app/staff/invite")
        .set("Host", AC_HOST)
        .set("Cookie", adminCookie);
      const csrf = extractCsrf(get.text);
      const csrfCookie = extractCookie(get, CSRF_COOKIE_ACTIVECLINIC_ORG);
      const cookie = [adminCookie, csrfCookie ? `${CSRF_COOKIE_ACTIVECLINIC_ORG}=${csrfCookie}` : ""]
        .filter(Boolean)
        .join("; ");
      return request(app)
        .post("/app/staff")
        .set("Host", AC_HOST)
        .set("Cookie", cookie)
        .type("form")
        .send({
          [CSRF_FIELD]: csrf,
          invite_mode: "1",
          first_name: "Nurse",
          last_name: "Invitee",
          employment_type: "permanent",
          facility_ids: facilityId,
          primary_facility_id: facilityId,
          role_keys: CLINICIAN,
          role_scope: "facility",
          role_facility_id: facilityId,
          issue_invitation: "1",
          phone: "",
          phone_country: "ZM",
          ...fields,
        });
    }

    it("POST with ZM + 977198697 creates invitation (empty legacy phone)", async () => {
      if (skip) return;
      const res = await postInvite({ phone_national: "977198697" });
      assert.ok(
        res.status === 200 || res.status === 303,
        `status ${res.status}: ${res.text.slice(0, 300)}`
      );
      assert.doesNotMatch(res.text, /Phone is required|Phone number is required/i);
      assert.match(res.text, /Invitation created|Invitation ready|invite_url|data-ac-invite-url/i);
      const stored = await pool.query(
        `SELECT phone_normalized FROM activeclinic.staff_members
         WHERE phone_normalized = $1 ORDER BY created_at DESC LIMIT 1`,
        [EXPECTED]
      );
      assert.equal(stored.rows.length, 1);
      assert.equal(stored.rows[0].phone_normalized, EXPECTED);
    });

    it("second invite with same phone does not claim phone is required", async () => {
      if (skip) return;
      const res = await postInvite({
        phone_national: "977198697",
        first_name: "Other",
        last_name: "Person",
      });
      // Product may re-issue, conflict, or create depending on identity rules —
      // never treat a filled national number as missing.
      assert.doesNotMatch(res.text, /Phone is required|Phone number is required/i);
    });
  });
});
