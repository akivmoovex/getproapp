"use strict";

/**
 * Registration phone normalization + uniqueness (migration 028).
 */

const assert = require("node:assert/strict");
const { describe, it, before, after } = require("node:test");
const request = require("supertest");

const {
  resetFoundationDatabase,
  createFoundationPool,
} = require("./helpers/foundationDb");
const { migrate } = require("../db/scripts/lib/migrator");
const { ensureDatabaseIdentity } = require("../db/scripts/lib/databaseIdentity");
const { createV5FoundationApp } = require("../src/platform/http/v5FoundationServer");
const { CSRF_FIELD, CSRF_COOKIE } = require("../src/platform/http/v5Csrf");
const {
  normalizeRegistrationPhone,
  DUPLICATE_PHONE_MESSAGE,
  PHONE_UNIQUENESS_APPLICATION_STATUSES,
  PHONE_UNIQUENESS_PROVISIONING_STATUSES,
} = require("../src/blessboard/services/normalizeRegistrationPhone");
const {
  validatePlatformChurchRegistration,
} = require("../src/blessboard/services/platformChurchRegistrationValidation");
const repo = require("../src/blessboard/repositories/platformChurchRegistrationRepository");

const IDENTITY_KEY = "blessboard-platform-v5";

function extractCookie(res, name) {
  const raw = res.headers["set-cookie"];
  const list = Array.isArray(raw) ? raw : raw ? [raw] : [];
  for (const line of list) {
    if (String(line).startsWith(`${name}=`)) {
      return String(line).split(";")[0].slice(name.length + 1);
    }
  }
  return null;
}

function extractCsrfToken(html) {
  const m = String(html || "").match(
    new RegExp(`name="${CSRF_FIELD}"[^>]*value="([^"]+)"|value="([^"]+)"[^>]*name="${CSRF_FIELD}"`)
  );
  return (m && (m[1] || m[2])) || null;
}

describe("normalizeRegistrationPhone", () => {
  it("maps equivalent formats to the same E.164 value", () => {
    const a = normalizeRegistrationPhone("+260 97 123 4567", "Zambia");
    const b = normalizeRegistrationPhone("+260-971-234-567", "ZM");
    const c = normalizeRegistrationPhone("0971234567", "Zambia");
    const d = normalizeRegistrationPhone("00 260 971234567", "Unknownland");
    assert.equal(a.ok, true);
    assert.equal(b.ok, true);
    assert.equal(c.ok, true);
    assert.equal(d.ok, true);
    assert.equal(a.normalized, "+260971234567");
    assert.equal(b.normalized, a.normalized);
    assert.equal(c.normalized, a.normalized);
    assert.equal(d.normalized, a.normalized);
    assert.equal(a.display.includes("97"), true);
  });

  it("rejects ambiguous national numbers without a resolvable country", () => {
    const r = normalizeRegistrationPhone("0971234567", "Atlantis");
    assert.equal(r.ok, false);
    assert.equal(r.field, "phone");
    assert.match(r.error, /country code|international/i);
  });

  it("rejects clearly invalid values", () => {
    assert.equal(normalizeRegistrationPhone("", "Zambia").ok, false);
    assert.equal(normalizeRegistrationPhone("123", "Zambia").ok, false);
    assert.equal(normalizeRegistrationPhone("+0123", "Zambia").ok, false);
    assert.equal(normalizeRegistrationPhone("12+34567890", "Zambia").ok, false);
  });
});

describe("blessboard registration phone uniqueness", () => {
  let pool;
  let skipSuite = false;
  let skipReason = "";
  let app;

  before(async () => {
    try {
      const databaseUrl = await resetFoundationDatabase();
      pool = createFoundationPool(databaseUrl);
      await migrate({ connectionString: databaseUrl });
      await ensureDatabaseIdentity(pool, {
        connectionString: databaseUrl,
        identityKey: IDENTITY_KEY,
        environmentCode: "testing",
      });
      app = createV5FoundationApp({
        getPool: () => pool,
        enableDiagnosticHostContext: false,
        env: {
          NODE_ENV: "test",
          PLATFORM_DEPLOYMENT_CODE: "blessboard-org-staging",
          SESSION_SECRET: "test-session-secret-at-least-32-chars!!",
          BLESSBOARD_INSTANT_FREE_PROVISIONING_ENABLED: "0",
        },
      });
    } catch (err) {
      skipSuite = true;
      skipReason = err && err.message ? err.message : String(err);
    }
  });

  after(async () => {
    if (pool) await pool.end();
  });

  function requireDb() {
    if (skipSuite) assert.fail(`Local PostgreSQL unavailable: ${skipReason}`);
  }

  async function loginCsrf() {
    const get = await request(app).get("/register-church").set("Host", "blessboard.org");
    const csrf = extractCookie(get, CSRF_COOKIE);
    const token = extractCsrfToken(get.text);
    assert.ok(csrf && token);
    return { csrf, token };
  }

  it("migration adds normalized column and active unique index", async () => {
    requireDb();
    const col = await pool.query(
      `SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'blessboard'
          AND table_name = 'platform_church_registration_applications'
          AND column_name = 'contact_phone_normalized'`
    );
    assert.equal(col.rowCount, 1);
    const idx = await pool.query(
      `SELECT 1 FROM pg_indexes
        WHERE schemaname = 'blessboard'
          AND indexname = 'platform_church_reg_apps_phone_normalized_active_uidx'`
    );
    assert.equal(idx.rowCount, 1);
    assert.ok(PHONE_UNIQUENESS_APPLICATION_STATUSES.includes("submitted"));
    assert.ok(PHONE_UNIQUENESS_PROVISIONING_STATUSES.includes("provisioned"));
  });

  it("unique normalized phone succeeds and stores display + normalized", async () => {
    requireDb();
    const validation = validatePlatformChurchRegistration({
      church_name: "Phone Unique Church",
      branch_name: "Main Campus",
      country: "Zambia",
      city: "Lusaka",
      contact_name: "Pastor A",
      role_in_church: "Pastor",
      email: "phone-unique@example.org",
      phone: "097 111 2222",
      selected_plan: "foundation",
      consent_contact: "on",
    });
    assert.equal(validation.ok, true);
    assert.equal(validation.data.contact_phone_normalized, "+260971112222");
    assert.equal(validation.data.contact_phone, "097 111 2222");

    const created = await repo.createApplicationIdempotent(pool, {
      ...validation.data,
      source_ip: null,
      user_agent: null,
    });
    assert.equal(created.duplicate, false);
    assert.equal(created.application.contact_phone_normalized, "+260971112222");
  });

  it("whitespace/punctuation variants collide for pending applications", async () => {
    requireDb();
    const first = await repo.createApplicationIdempotent(pool, {
      church_name: "Collide A",
      branch_name: "Main Campus",
      country: "Zambia",
      city: "Lusaka",
      contact_name: "A",
      contact_email: "collide-a@example.org",
      contact_phone: "+260971000001",
      contact_phone_normalized: "+260971000001",
      role_in_church: "Pastor",
      selected_plan: "growth",
      consent_terms: true,
    });
    assert.equal(first.duplicate, false);

    await assert.rejects(
      () =>
        repo.createApplicationIdempotent(pool, {
          church_name: "Collide B",
          branch_name: "Main Campus",
          country: "Zambia",
          city: "Ndola",
          contact_name: "B",
          contact_email: "collide-b@example.org",
          contact_phone: "+260 97 100 0001",
          contact_phone_normalized: "+260971000001",
          role_in_church: "Admin",
          selected_plan: "network",
          consent_terms: true,
        }),
      (err) =>
        err &&
        err.code === "duplicate_registration_phone" &&
        err.field === "phone" &&
        String(err.message).includes("already linked")
    );
  });

  it("browser retry with same email+church reuses without duplicate-phone error", async () => {
    requireDb();
    const fields = {
      church_name: "Retry Church",
      branch_name: "Main Campus",
      country: "Kenya",
      city: "Nairobi",
      contact_name: "Retry",
      contact_email: "retry-phone@example.org",
      contact_phone: "+254712000111",
      contact_phone_normalized: "+254712000111",
      role_in_church: "Pastor",
      selected_plan: "foundation",
      consent_terms: true,
    };
    const a = await repo.createApplicationIdempotent(pool, fields);
    const b = await repo.createApplicationIdempotent(pool, fields);
    assert.equal(a.duplicate, false);
    assert.equal(b.duplicate, true);
    assert.equal(a.application.id, b.application.id);
  });

  it("provisioned application blocks the same normalized phone", async () => {
    requireDb();
    const created = await repo.createApplicationIdempotent(pool, {
      church_name: "Provisioned Phone Church",
      branch_name: "Main Campus",
      country: "Ghana",
      city: "Accra",
      contact_name: "Prov",
      contact_email: "prov-phone@example.org",
      contact_phone: "+233241000222",
      contact_phone_normalized: "+233241000222",
      role_in_church: "Pastor",
      selected_plan: "growth",
      consent_terms: true,
    });
    // Occupying in-flight provisioning (same uniqueness set as provisioned; avoids org FK fixture).
    await pool.query(
      `UPDATE blessboard.platform_church_registration_applications
          SET provisioning_status = 'provisioning',
              provisioning_started_at = now(),
              updated_at = now()
        WHERE id = $1`,
      [created.application.id]
    );

    await assert.rejects(
      () =>
        repo.createApplicationIdempotent(pool, {
          church_name: "Other Church",
          branch_name: "Main Campus",
          country: "Ghana",
          city: "Kumasi",
          contact_name: "Other",
          contact_email: "other-phone@example.org",
          contact_phone: "+233241000222",
          contact_phone_normalized: "+233241000222",
          role_in_church: "Admin",
          selected_plan: "network",
          consent_terms: true,
        }),
      (err) => err && err.code === "duplicate_registration_phone"
    );
  });

  it("rejected/cancelled phones may be reused; closed enquiry may be reused", async () => {
    requireDb();
    const rejected = await repo.createApplicationIdempotent(pool, {
      church_name: "Rejected Phone",
      branch_name: "Main Campus",
      country: "United States",
      city: "Austin",
      contact_name: "R",
      contact_email: "rej-phone@example.org",
      contact_phone: "+15125550101",
      contact_phone_normalized: "+15125550101",
      role_in_church: "Pastor",
      selected_plan: "foundation",
      consent_terms: true,
    });
    await pool.query(
      `UPDATE blessboard.platform_church_registration_applications
          SET application_status = 'rejected', updated_at = now()
        WHERE id = $1`,
      [rejected.application.id]
    );

    const reused = await repo.createApplicationIdempotent(pool, {
      church_name: "Reuse After Reject",
      branch_name: "Main Campus",
      country: "United States",
      city: "Dallas",
      contact_name: "R2",
      contact_email: "rej-phone-2@example.org",
      contact_phone: "+1 512 555 0101",
      contact_phone_normalized: "+15125550101",
      role_in_church: "Admin",
      selected_plan: "growth",
      consent_terms: true,
    });
    assert.equal(reused.duplicate, false);

    const closed = await repo.createApplicationIdempotent(pool, {
      church_name: "Closed Enquiry",
      branch_name: "Main Campus",
      country: "Canada",
      city: "Toronto",
      contact_name: "C",
      contact_email: "closed-phone@example.org",
      contact_phone: "+14165550102",
      contact_phone_normalized: "+14165550102",
      role_in_church: "Pastor",
      selected_plan: "network",
      consent_terms: true,
    });
    await pool.query(
      `UPDATE blessboard.platform_church_registration_applications
          SET application_status = 'closed',
              provisioning_status = 'not_started',
              updated_at = now()
        WHERE id = $1`,
      [closed.application.id]
    );
    const closedReuse = await repo.createApplicationIdempotent(pool, {
      church_name: "Closed Reuse",
      branch_name: "Main Campus",
      country: "Canada",
      city: "Ottawa",
      contact_name: "C2",
      contact_email: "closed-phone-2@example.org",
      contact_phone: "+14165550102",
      contact_phone_normalized: "+14165550102",
      role_in_church: "Admin",
      selected_plan: "foundation",
      consent_terms: true,
    });
    assert.equal(closedReuse.duplicate, false);
  });

  it("unique index race maps to DuplicateRegistrationPhoneError", async () => {
    requireDb();
    await repo.createApplicationIdempotent(pool, {
      church_name: "Race Church 1",
      branch_name: "Main Campus",
      country: "Nigeria",
      city: "Lagos",
      contact_name: "N1",
      contact_email: "race1@example.org",
      contact_phone: "+234801000333",
      contact_phone_normalized: "+234801000333",
      role_in_church: "Pastor",
      selected_plan: "growth",
      consent_terms: true,
    });
    await assert.rejects(
      () =>
        repo.createApplicationIdempotent(pool, {
          church_name: "Race Church 2",
          branch_name: "Main Campus",
          country: "Nigeria",
          city: "Abuja",
          contact_name: "N2",
          contact_email: "race2@example.org",
          contact_phone: "+234801000333",
          contact_phone_normalized: "+234801000333",
          role_in_church: "Admin",
          selected_plan: "network",
          consent_terms: true,
        }),
      (err) => err && err.code === "duplicate_registration_phone"
    );

    try {
      await pool.query(
        `INSERT INTO blessboard.platform_church_registration_applications (
           status, application_status, provisioning_status,
           church_name, branch_name, country, city, contact_name, contact_email, contact_phone,
           contact_phone_normalized, consent_terms
         ) VALUES (
           'pending', 'submitted', 'not_started',
           'Race Direct', 'Main Campus', 'Nigeria', 'Ibadan', 'N3', 'race3@example.org', '+234801000333',
           '+234801000333', true
         )`
      );
      assert.fail("expected unique violation");
    } catch (err) {
      assert.equal(String(err.code), "23505");
      assert.equal(repo.isUniquePhoneViolation(err), true);
      const mapped = new repo.DuplicateRegistrationPhoneError();
      assert.equal(mapped.field, "phone");
      assert.equal(mapped.message, DUPLICATE_PHONE_MESSAGE);
    }
  });

  it("HTTP enquiry flows remain functional for foundation/growth/network", async () => {
    requireDb();
    for (const plan of ["foundation", "growth", "network"]) {
      const { csrf, token } = await loginCsrf();
      const res = await request(app)
        .post(`/register-church?plan=${plan}`)
        .set("Host", "blessboard.org")
        .set("Cookie", `${CSRF_COOKIE}=${csrf}`)
        .type("form")
        .send({
          church_name: `HTTP ${plan} Church`,
          branch_name: "Main Campus",
          country: "Zambia",
          city: "Lusaka",
          contact_name: "HTTP User",
          role_in_church: "Pastor",
          phone: `+260977${String(Math.floor(Math.random() * 1e6)).padStart(6, "0")}`,
          email: `http-${plan}-${Date.now()}@example.org`,
          selected_plan: plan,
          consent_contact: "on",
          [CSRF_FIELD]: token,
        });
      assert.equal(res.status, 303, plan);
      if (plan === "network") {
        assert.equal(res.headers.location, "/register-church?submitted=1&plan=network", plan);
      } else {
        assert.equal(res.headers.location, "/register-church?submitted=1", plan);
      }
    }
  });

  it("HTTP duplicate phone returns friendly field error without SQL leakage", async () => {
    requireDb();
    const phone = "+260966112233";
    const { csrf, token } = await loginCsrf();
    const first = await request(app)
      .post("/register-church")
      .set("Host", "blessboard.org")
      .set("Cookie", `${CSRF_COOKIE}=${csrf}`)
      .type("form")
      .send({
        church_name: "HTTP Dup First",
        branch_name: "Main Campus",
        country: "Zambia",
        city: "Lusaka",
        contact_name: "First",
        role_in_church: "Pastor",
        phone,
        email: "http-dup-1@example.org",
        selected_plan: "growth",
        consent_contact: "on",
        [CSRF_FIELD]: token,
      });
    assert.equal(first.status, 303);

    const again = await loginCsrf();
    const second = await request(app)
      .post("/register-church")
      .set("Host", "blessboard.org")
      .set("Cookie", `${CSRF_COOKIE}=${again.csrf}`)
      .type("form")
      .send({
        church_name: "HTTP Dup Second",
        branch_name: "Main Campus",
        country: "Zambia",
        city: "Kitwe",
        contact_name: "Second",
        role_in_church: "Admin",
        phone: "+260 96 611 2233",
        email: "http-dup-2@example.org",
        selected_plan: "network",
        consent_contact: "on",
        [CSRF_FIELD]: again.token,
      });
    assert.equal(second.status, 400);
    assert.match(second.text, /already linked to a BlessBoard church registration/i);
    assert.doesNotMatch(second.text, /23505|contact_phone_normalized|platform_church_reg_apps/i);
  });

  it("reports historical unnormalized rows without failing migrate", async () => {
    requireDb();
    await pool.query(
      `INSERT INTO blessboard.platform_church_registration_applications (
         status, application_status, provisioning_status,
         church_name, branch_name, country, city, contact_name, contact_email, contact_phone,
         contact_phone_normalized, consent_terms
       ) VALUES (
         'pending', 'rejected', 'not_started',
         'Legacy Local Phone', 'Main Campus', 'Zambia', 'Lusaka', 'Legacy', 'legacy-local@example.org', '0979998888',
         NULL, true
       )`
    );
    const r = await pool.query(
      `SELECT COUNT(*)::int AS c
         FROM blessboard.platform_church_registration_applications
        WHERE contact_phone_normalized IS NULL`
    );
    assert.ok(r.rows[0].c >= 1);
  });
});
