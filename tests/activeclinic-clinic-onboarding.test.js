"use strict";

/**
 * ActiveClinic public clinic registration → PA review → approve → admin login.
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
const { provisionBlessBoardChurch } = require("../src/blessboard/services/provisionBlessBoardChurch");
const { createBlessBoardUser } = require("../src/blessboard/services/createBlessBoardUser");
const { assignBlessBoardRole } = require("../src/blessboard/services/assignBlessBoardRole");
const {
  approveAndProvisionClinicRegistration,
  rejectClinicRegistration,
} = require("../src/activeclinic/services/approveClinicRegistrationService");
const {
  createMoovexPlatformRuntimeApp,
  buildDefaultProductApps,
} = require("../src/platform/http/moovexPlatformRuntimeServer");
const {
  getCsrfCookieName,
  CSRF_FIELD,
} = require("../src/platform/http/v5Csrf");
const {
  CODE_MOOVEX_PLATFORM_TESTING,
  resetDeploymentProfileWarningsForTests,
} = require("../src/platform/config/deploymentProfiles");

const IDENTITY_KEY = "moovex-platform-v7";
const ADMIN_PASSWORD = "clinic-admin-pass-12";
const PA_PASSWORD = "correct-horse-battery-staple";
const AC_HOST = "activeclinic.pronline.org";
const BB_HOST = "blessboard.pronline.org";
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

let pool;
let skipReason = null;
let app;
let phoneSeq = 870000000;

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

describe("ActiveClinic public clinic onboarding", () => {
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
      await provisionPlatformTenant(pool, {
        skipDomain: true,
        dataEnvironment: "testing",
        organizationKey: "ac-onboard-pa",
        displayName: "Onboard PA Org",
        productKey: "blessboard",
        productTenantKey: "ac-onboard-pa",
        deploymentCode: CODE_MOOVEX_PLATFORM_TESTING,
      });
      await provisionBlessBoardChurch(pool, {
        organizationKey: "ac-onboard-pa",
        churchKey: "ac-onboard-pa",
        displayName: "Onboard PA Church",
        legalName: null,
        dataEnvironment: "testing",
        hqBranchKey: "hq",
        hqBranchDisplayName: "Headquarters",
      });
      const paCreated = await createBlessBoardUser(pool, {
        email: "platform-admin@onboard.example",
        displayName: "Platform Administrator",
        password: PA_PASSWORD,
      });
      assert.equal(paCreated.ok, true, JSON.stringify(paCreated));
      const paRole = await assignBlessBoardRole(pool, {
        email: "platform-admin@onboard.example",
        organizationKey: "ac-onboard-pa",
        roleKey: "platform_admin",
      });
      assert.equal(paRole.ok, true, JSON.stringify(paRole));

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

  async function submitClinic(payload) {
    const getForm = await request(app).get("/register-clinic").set("Host", AC_HOST);
    assert.equal(getForm.status, 200);
    const csrf = extractCookie(getForm, UNIFIED_CSRF);
    assert.ok(csrf);
    const match = String(getForm.text || "").match(/name="_csrf" value="([^"]+)"/);
    const confirm = await request(app)
      .post("/register-clinic")
      .set("Host", AC_HOST)
      .set("Cookie", cookieHeader({ [UNIFIED_CSRF]: csrf }))
      .redirects(0)
      .type("form")
      .send({
        [CSRF_FIELD]: match ? match[1] : "",
        action: "confirm",
        ...payload,
      });
    return { getForm, confirm, csrf };
  }

  async function loginAc(identifier, password) {
    const getLogin = await request(app).get("/login").set("Host", AC_HOST);
    const csrf = extractCookie(getLogin, UNIFIED_CSRF);
    const match = String(getLogin.text || "").match(/name="_csrf" value="([^"]+)"/);
    const post = await request(app)
      .post("/login")
      .set("Host", AC_HOST)
      .set("Cookie", csrf ? `${UNIFIED_CSRF}=${csrf}` : "")
      .set("Accept", "text/html")
      .type("form")
      .send({
        [CSRF_FIELD]: match ? match[1] : "",
        identifier,
        password,
      });
    return { getLogin, post, sid: extractCookie(post, UNIFIED_SID) };
  }

  async function loginPa() {
    const getLogin = await request(app).get("/login").set("Host", BB_HOST);
    const csrf = extractCookie(getLogin, UNIFIED_CSRF);
    const match = String(getLogin.text || "").match(/name="_csrf" value="([^"]+)"/);
    const post = await request(app)
      .post("/login")
      .set("Host", BB_HOST)
      .set("Cookie", csrf ? `${UNIFIED_CSRF}=${csrf}` : "")
      .type("form")
      .send({
        [CSRF_FIELD]: match ? match[1] : "",
        email: "platform-admin@onboard.example",
        password: PA_PASSWORD,
      });
    return { post, sid: extractCookie(post, UNIFIED_SID) };
  }

  it("GET /register-clinic and /login expose the public onboarding path", async () => {
    requireDb();
    const page = await request(app).get("/register-clinic").set("Host", AC_HOST);
    assert.equal(page.status, 200);
    assert.match(page.text, /Register your clinic/);
    assert.match(page.text, /name="clinicName"/);
    assert.match(page.text, /name="clinicType"/);
    assert.doesNotMatch(page.text, /name="password"/);
    const login = await request(app).get("/login").set("Host", AC_HOST);
    assert.equal(login.status, 200);
    assert.match(login.text, /Email address or phone number|Phone number or email|Email or phone number/);
    assert.match(login.text, /href="\/register-clinic"/);
  });

  it("rejects validation errors without inserting", async () => {
    requireDb();
    const before = await pool.query(
      `SELECT count(*)::int AS n FROM activeclinic.clinic_registration_applications`
    );
    const { confirm } = await submitClinic({
      clinicName: "A",
      contactName: "B",
      contactEmail: "not-an-email",
      contactPhone: "1",
      password: "short",
      passwordConfirm: "nope",
      acceptTerms: "on",
    });
    assert.equal(confirm.status, 400);
    const after = await pool.query(
      `SELECT count(*)::int AS n FROM activeclinic.clinic_registration_applications`
    );
    assert.equal(after.rows[0].n, before.rows[0].n);
  });

    it("submits auto-provisioned application, shows in PA approved queue, and logs in by email and phone", async () => {
    requireDb();
    const stamp = Date.now().toString(36);
    const email = `admin-${stamp}@clinic.example`;
    const phone = nextPhone();
    const payload = {
      clinicName: `Onboard Clinic ${stamp}`,
      contactName: "Clinic Admin",
      contactEmail: email,
      contactPhone: phone,
      province: "Lusaka",
      city: "Lusaka",
      address: "1 Cairo Road",
      countryCode: "ZM",
      notes: "Onboarding verification",
      password: ADMIN_PASSWORD,
      passwordConfirm: ADMIN_PASSWORD,
      acceptTerms: "on",
    };
    const { confirm } = await submitClinic(payload);
    assert.equal(confirm.status, 303);
    assert.match(confirm.headers.location, /\/register-clinic\/success\?ref=AC-/);

    const row = await pool.query(
      `SELECT * FROM activeclinic.clinic_registration_applications
        WHERE contact_email_normalized = $1`,
      [email]
    );
    assert.equal(row.rows.length, 1);
    assert.equal(row.rows[0].status, "active");
    assert.equal(row.rows[0].administrator_password_hash, null);
    assert.equal(row.rows[0].address, payload.address);
    assert.ok(row.rows[0].organization_id);
    const applicationId = row.rows[0].id;

    const pa = await loginPa();
    assert.equal(pa.post.status, 303);
    const queue = await request(app)
      .get("/admin/clinic-registrations?status=active")
      .set("Host", BB_HOST)
      .set("Cookie", cookieHeader({ [UNIFIED_SID]: pa.sid }));
    assert.equal(queue.status, 200);
    assert.match(queue.text, new RegExp(payload.clinicName));
    assert.doesNotMatch(queue.text, /administrator_password_hash|\$2[aby]\$/i);

    const detail = await request(app)
      .get(`/admin/clinic-registrations/${applicationId}`)
      .set("Host", BB_HOST)
      .set("Cookie", cookieHeader({ [UNIFIED_SID]: pa.sid }));
    assert.equal(detail.status, 200);
    assert.match(detail.text, /1 Cairo Road/);
    assert.match(detail.text, /Clinic Admin/);

    const approved = await approveAndProvisionClinicRegistration(pool, {
      applicationId,
      actorIdentityId: null,
      dataEnvironment: "testing",
      deploymentCode: CODE_MOOVEX_PLATFORM_TESTING,
    });
    assert.equal(approved.ok, true, JSON.stringify(approved));
    assert.ok(approved.organizationId);
    assert.equal(approved.alreadyProvisioned, true);
    const orgRow = await pool.query(
      `SELECT hco.id AS hco_id, f.id AS facility_id, a.clinic_admin_staff_id
         FROM activeclinic.clinic_registration_applications a
         JOIN activeclinic.healthcare_organizations hco ON hco.organization_id = a.organization_id
         JOIN activeclinic.facilities f ON f.organization_id = a.organization_id AND f.is_primary = true
        WHERE a.id = $1`,
      [applicationId]
    );
    assert.equal(orgRow.rows.length, 1);
    assert.ok(orgRow.rows[0].hco_id);
    assert.ok(orgRow.rows[0].facility_id);
    assert.ok(orgRow.rows[0].clinic_admin_staff_id);

    const again = await approveAndProvisionClinicRegistration(pool, {
      applicationId,
      dataEnvironment: "testing",
      deploymentCode: CODE_MOOVEX_PLATFORM_TESTING,
    });
    assert.equal(again.ok, true);
    assert.equal(again.alreadyProvisioned || again.code === "already_provisioned" || again.organizationId === approved.organizationId, true);

    const cleared = await pool.query(
      `SELECT administrator_password_hash, status, provisioning_status, organization_id
         FROM activeclinic.clinic_registration_applications WHERE id = $1`,
      [applicationId]
    );
    assert.equal(cleared.rows[0].administrator_password_hash, null);
    assert.equal(cleared.rows[0].status, "active");

    const depts = await pool.query(
      `SELECT count(*)::int AS n FROM activeclinic.departments WHERE facility_id = $1`,
      [orgRow.rows[0].facility_id]
    );
    assert.ok(depts.rows[0].n >= 1);

    const emailLogin = await loginAc(email, ADMIN_PASSWORD);
    assert.equal(emailLogin.post.status, 303, emailLogin.post.text && emailLogin.post.text.slice(0, 400));
    const cookie = cookieHeader({ [UNIFIED_SID]: emailLogin.sid });
    const appPage = await request(app).get("/app").set("Host", AC_HOST).set("Cookie", cookie);
    assert.equal(appPage.status, 200);
    assert.match(appPage.text, /data-ac-shell="staff-app"/);

    const staffPage = await request(app).get("/app/staff").set("Host", AC_HOST).set("Cookie", cookie);
    assert.equal(staffPage.status, 200);
    const facilitiesPage = await request(app).get("/app/facilities").set("Host", AC_HOST).set("Cookie", cookie);
    assert.equal(facilitiesPage.status, 200);
    const settingsPage = await request(app).get("/app/settings").set("Host", AC_HOST).set("Cookie", cookie);
    assert.equal(settingsPage.status, 200);
    const deptPage = await request(app)
      .get("/app/settings/clinic-setup/departments")
      .set("Host", AC_HOST)
      .set("Cookie", cookie);
    assert.equal(deptPage.status, 200);
    const accessPage = await request(app).get("/app/settings/access").set("Host", AC_HOST).set("Cookie", cookie);
    assert.ok([200, 303, 403].includes(accessPage.status), `access ${accessPage.status}`);

    const slug = await pool.query(
      `SELECT organization_key FROM platform.organizations WHERE id = $1`,
      [approved.organizationId]
    );
    const clinicKey = slug.rows[0].organization_key;
    const website = await request(app)
      .get(`/clinics/${clinicKey}/website/preview`)
      .set("Host", AC_HOST)
      .set("Cookie", cookie)
      .redirects(0);
    assert.ok([200, 303].includes(website.status), `website preview ${website.status}`);

    const phoneLogin = await loginAc(phone, ADMIN_PASSWORD);
    assert.equal(phoneLogin.post.status, 303);
    const bad = await loginAc(email, "wrong-password-xx");
    assert.equal(bad.post.status, 401);
  });

  it("duplicate email or phone is blocked and credentials are already cleared after auto-provision", async () => {
    requireDb();
    const stamp = Date.now().toString(36);
    const email = `dup-${stamp}@clinic.example`;
    const phone = nextPhone();
    const payload = {
      clinicName: `Dup Clinic ${stamp}`,
      contactName: "Dup Admin",
      contactEmail: email,
      contactPhone: phone,
      password: ADMIN_PASSWORD,
      passwordConfirm: ADMIN_PASSWORD,
      acceptTerms: "on",
    };
    const first = await submitClinic(payload);
    assert.equal(first.confirm.status, 303);
    const second = await submitClinic({
      ...payload,
      clinicName: `Dup Clinic B ${stamp}`,
      contactEmail: `other-${stamp}@clinic.example`,
    });
    assert.equal(second.confirm.status, 400);
    assert.match(second.confirm.text, /email or phone/i);

    const row = await pool.query(
      `SELECT id FROM activeclinic.clinic_registration_applications WHERE contact_email_normalized = $1`,
      [email]
    );
    const rejected = await rejectClinicRegistration(pool, {
      applicationId: row.rows[0].id,
      rejectionReason: "Unable to verify clinic details",
    });
    assert.equal(rejected.ok, false);
    const after = await pool.query(
      `SELECT status, administrator_password_hash FROM activeclinic.clinic_registration_applications WHERE id = $1`,
      [row.rows[0].id]
    );
    assert.equal(after.rows[0].status, "active");
    assert.equal(after.rows[0].administrator_password_hash, null);
  });

  it("approved clinic admin cannot see another clinic's staff", async () => {
    requireDb();
    const stamp = Date.now().toString(36);
    const a = {
      clinicName: `Iso A ${stamp}`,
      contactName: "Admin A",
      contactEmail: `a-${stamp}@clinic.example`,
      contactPhone: nextPhone(),
      password: ADMIN_PASSWORD,
      passwordConfirm: ADMIN_PASSWORD,
      acceptTerms: "on",
    };
    const b = {
      clinicName: `Iso B ${stamp}`,
      contactName: "Admin B",
      contactEmail: `b-${stamp}@clinic.example`,
      contactPhone: nextPhone(),
      password: ADMIN_PASSWORD,
      passwordConfirm: ADMIN_PASSWORD,
      acceptTerms: "on",
    };
    const subA = await submitClinic(a);
    const subB = await submitClinic(b);
    assert.equal(subA.confirm.status, 303);
    assert.equal(subB.confirm.status, 303);
    const rows = await pool.query(
      `SELECT id, contact_email_normalized FROM activeclinic.clinic_registration_applications
        WHERE contact_email_normalized IN ($1, $2)`,
      [a.contactEmail, b.contactEmail]
    );
    for (const r of rows.rows) {
      const result = await approveAndProvisionClinicRegistration(pool, {
        applicationId: r.id,
        dataEnvironment: "testing",
        deploymentCode: CODE_MOOVEX_PLATFORM_TESTING,
      });
      assert.equal(result.ok, true, JSON.stringify(result));
    }
    const login = await loginAc(a.contactEmail, ADMIN_PASSWORD);
    assert.equal(login.post.status, 303);
    const staff = await request(app)
      .get("/app/staff")
      .set("Host", AC_HOST)
      .set("Cookie", cookieHeader({ [UNIFIED_SID]: login.sid }));
    assert.equal(staff.status, 200);
    assert.doesNotMatch(staff.text, /Admin B/);
    assert.match(staff.text, /Admin A/);
  });
});
