"use strict";

/**
 * ActiveClinic demo + Julflona clinic seed (idempotency, safety, public routes).
 */

const { describe, it, before, after, beforeEach } = require("node:test");
const assert = require("node:assert/strict");
const request = require("supertest");

const {
  resetFoundationDatabase,
  createFoundationPool,
} = require("./helpers/foundationDb");
const { migrate } = require("../db/scripts/lib/migrator");
const {
  seedActiveClinicDemoClinics,
  auditDemoClinics,
  DEMO_CLINIC_KEY,
  JULFLONA_CLINIC_KEY,
  RESULT,
} = require("../src/activeclinic/services/activeClinicDemoClinicSeedService");
const {
  DEMO_BANNER,
  SAMPLE_PROFILE_DISCLAIMER,
} = require("../src/activeclinic/services/activeClinicDemoClinicSpec");
const {
  createActiveClinicFoundationApp,
} = require("../src/activeclinic/http/activeClinicFoundationServer");
const {
  CODE_ACTIVECLINIC_ORG_V6,
  COOKIE_ACTIVECLINIC_ORG,
  CSRF_COOKIE_ACTIVECLINIC_ORG,
  resetDeploymentProfileWarningsForTests,
} = require("../src/platform/config/deploymentProfiles");
const { CSRF_FIELD } = require("../src/platform/http/v5Csrf");
const {
  setPlatformIdentityPassword,
} = require("../src/platform/services/platformIdentityCredentialService");
const identityRepo = require("../src/platform/repositories/platformIdentityRepository");

let pool;
let databaseUrl;
let skipReason = null;

function extractCookie(res, name) {
  const cookies = [].concat(res.headers["set-cookie"] || []);
  for (const line of cookies) {
    if (String(line).startsWith(`${name}=`)) {
      return String(line).split(";")[0].slice(name.length + 1);
    }
  }
  return null;
}

describe("ActiveClinic demo clinics seed", () => {
  before(async () => {
    try {
      databaseUrl = await resetFoundationDatabase();
      pool = createFoundationPool(databaseUrl);
      await migrate({ connectionString: databaseUrl });
      await pool.query(
        `INSERT INTO platform.database_identity
           (id, database_instance_id, environment_code, database_name, host_fingerprint, identity_key)
         VALUES
           (1, $1, 'testing', 'getpro_test', 'localhost', 'blessboard-platform-v5')
         ON CONFLICT (id) DO UPDATE SET
           environment_code = EXCLUDED.environment_code,
           identity_key = EXCLUDED.identity_key,
           updated_at = now()`,
        ["11111111-1111-4111-8111-111111111111"]
      );
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

  function appWithEnv() {
    return createActiveClinicFoundationApp({
      getPool: () => pool,
      env: {
        NODE_ENV: "test",
        PLATFORM_DEPLOYMENT_CODE: CODE_ACTIVECLINIC_ORG_V6,
        SESSION_SECRET: "a".repeat(48),
        DATABASE_URL: databaseUrl,
      },
    });
  }

  it("discovers demo tenants by stable key, not display name alone", async () => {
    requireDb();
    const before = await auditDemoClinics(pool);
    assert.equal(before.clinics.every((c) => c.found === false), true);

    const first = await seedActiveClinicDemoClinics(pool, {
      dryRun: false,
      julflonaRequestedPassword: "12345678",
      resetDemoPassword: true,
    });
    assert.equal(first.ok, true, JSON.stringify(first));
    assert.equal(first.passwordPolicyBlocked, true);
    assert.ok(first.temporaryPasswordHandoff);
    assert.ok(first.temporaryPasswordHandoff.length >= 10);

    const audit = await auditDemoClinics(pool);
    const demo = audit.clinics.find((c) => c.organizationKey === DEMO_CLINIC_KEY);
    const jul = audit.clinics.find((c) => c.organizationKey === JULFLONA_CLINIC_KEY);
    assert.equal(demo.found, true);
    assert.equal(jul.found, true);
    assert.equal(demo.organizationKey, DEMO_CLINIC_KEY);
    assert.equal(jul.organizationKey, JULFLONA_CLINIC_KEY);
    assert.equal(demo.websitePublished, true);
    assert.equal(jul.websitePublished, true);
    assert.ok(demo.servicesCount >= 7);
    assert.ok(jul.doctorsCount >= 3);
    assert.equal(jul.admin.email, "julflona@gmail.com");
    assert.doesNotMatch(JSON.stringify(audit), /\$2[aby]\$/);
  });

  it("second seed is idempotent and does not duplicate orgs/services/doctors", async () => {
    requireDb();
    const second = await seedActiveClinicDemoClinics(pool, {
      dryRun: false,
      julflonaRequestedPassword: "12345678",
    });
    assert.equal(second.ok, true);
    assert.equal(second.totals.created, 0);

    const orgs = await pool.query(
      `SELECT COUNT(*)::int AS n FROM platform.organizations
        WHERE organization_key IN ($1, $2)`,
      [DEMO_CLINIC_KEY, JULFLONA_CLINIC_KEY]
    );
    assert.equal(orgs.rows[0].n, 2);

    const services = await pool.query(
      `SELECT o.organization_key, COUNT(*)::int AS n
         FROM activeclinic.appointment_service_types s
         JOIN platform.organizations o ON o.id = s.organization_id
        WHERE o.organization_key IN ($1, $2)
        GROUP BY o.organization_key`,
      [DEMO_CLINIC_KEY, JULFLONA_CLINIC_KEY]
    );
    for (const row of services.rows) {
      assert.equal(row.n, 7);
    }

    const doctors = await pool.query(
      `SELECT o.organization_key, COUNT(*)::int AS n
         FROM activeclinic.staff_members s
         JOIN platform.organizations o ON o.id = s.organization_id
        WHERE o.organization_key IN ($1, $2)
          AND s.public_profile_enabled = true
        GROUP BY o.organization_key`,
      [DEMO_CLINIC_KEY, JULFLONA_CLINIC_KEY]
    );
    for (const row of doctors.rows) {
      assert.equal(row.n, 3);
    }
  });

  it("refuses production database identity environment", async () => {
    requireDb();
    await pool.query(
      `UPDATE platform.database_identity SET environment_code = 'production'`
    );
    const blocked = await seedActiveClinicDemoClinics(pool, { dryRun: true });
    assert.equal(blocked.ok, false);
    assert.equal(blocked.code, RESULT.ABORT_ENVIRONMENT);
    await pool.query(
      `UPDATE platform.database_identity SET environment_code = 'testing'`
    );
  });

  it("public routes render demo banner and directory includes both clinics", async () => {
    requireDb();
    const app = appWithEnv();
    const directory = await request(app).get("/clinics");
    assert.equal(directory.status, 200);
    assert.match(directory.text, /activeclinic-demo/);
    assert.match(directory.text, /julflona-clinic/);

    const home = await request(app).get(`/clinics/${JULFLONA_CLINIC_KEY}`);
    assert.equal(home.status, 200);
    assert.match(home.text, /data-ac-demo-banner="1"/);
    assert.match(home.text, new RegExp(DEMO_BANNER));

    const doctor = await request(app).get(
      `/clinics/${JULFLONA_CLINIC_KEY}/doctors/dr-julflona-banda`
    );
    assert.equal(doctor.status, 200);
    assert.match(doctor.text, new RegExp(SAMPLE_PROFILE_DISCLAIMER));

    const unknown = await request(app).get("/clinics/no-such-clinic-key");
    assert.equal(unknown.status, 404);
  });

  it("Julflona admin can log in; platform-admin denied; logout clears session", async () => {
    requireDb();
    const app = appWithEnv();
    const identity = (
      await identityRepo.findIdentitiesByNormalizedContact(pool, {
        emailNormalized: "julflona@gmail.com",
      })
    )[0];
    assert.ok(identity);
    await setPlatformIdentityPassword(pool, {
      identityId: identity.id,
      password: "JulflonaTmp-2026A",
      mustChangePassword: false,
    });

    const getLogin = await request(app).get("/login");
    assert.equal(getLogin.status, 200);
    const csrf = extractCookie(getLogin, CSRF_COOKIE_ACTIVECLINIC_ORG);
    const csrfField = (getLogin.text.match(
      new RegExp(`name="${CSRF_FIELD}"[^>]*value="([^"]+)"`)
    ) || [])[1];
    const login = await request(app)
      .post("/login")
      .set("Cookie", `${CSRF_COOKIE_ACTIVECLINIC_ORG}=${csrf}`)
      .type("form")
      .send({
        identifier: "julflona@gmail.com",
        password: "JulflonaTmp-2026A",
        [CSRF_FIELD]: csrfField,
      });
    assert.equal(login.status, 303);
    assert.equal(login.headers.location, "/app");
    const sid = extractCookie(login, COOKIE_ACTIVECLINIC_ORG);
    assert.ok(sid);

    const appPage = await request(app)
      .get("/app")
      .set("Cookie", `${COOKIE_ACTIVECLINIC_ORG}=${sid}; ${CSRF_COOKIE_ACTIVECLINIC_ORG}=${csrf}`);
    assert.equal(appPage.status, 200);
    assert.match(appPage.text, /Julflona Clinic/);
    assert.doesNotMatch(appPage.text, /ActiveClinic Demo Centre/);

    const platformAdmin = await request(app)
      .get("/platform-admin")
      .set("Cookie", `${COOKIE_ACTIVECLINIC_ORG}=${sid}`);
    assert.ok([403, 404].includes(platformAdmin.status));

    const logout = await request(app)
      .post("/logout")
      .set("Cookie", `${COOKIE_ACTIVECLINIC_ORG}=${sid}; ${CSRF_COOKIE_ACTIVECLINIC_ORG}=${csrf}`)
      .type("form")
      .send({ [CSRF_FIELD]: csrfField });
    assert.equal(logout.status, 303);
    assert.equal(logout.headers.location, "/login");

    await setPlatformIdentityPassword(pool, {
      identityId: identity.id,
      password: "JulflonaTmp-2026A",
      mustChangePassword: true,
    });
  });
});
