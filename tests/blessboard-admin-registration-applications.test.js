"use strict";

/**
 * Phase 5 — platform-admin registration applications list/detail/follow-up.
 */

const assert = require("node:assert/strict");
const { describe, it, before, after } = require("node:test");
const request = require("supertest");
const crypto = require("crypto");

const {
  resetFoundationDatabase,
  createFoundationPool,
} = require("./helpers/foundationDb");
const { migrate } = require("../db/scripts/lib/migrator");
const { ensureDatabaseIdentity } = require("../db/scripts/lib/databaseIdentity");
const { createV5FoundationApp } = require("../src/platform/http/v5FoundationServer");
const { DEFAULT_V5_COOKIE } = require("../src/platform/session/v5SessionCookie");
const { CSRF_FIELD, CSRF_COOKIE } = require("../src/platform/http/v5Csrf");
const { createV5Session } = require("../src/platform/session/createV5Session");
const { createBlessBoardUser } = require("../src/blessboard/services/createBlessBoardUser");
const { assignBlessBoardRole } = require("../src/blessboard/services/assignBlessBoardRole");
const { provisionRegisteredBlessBoardChurch } = require("../src/blessboard/services/provisionRegisteredBlessBoardChurch");
const appRepo = require("../src/blessboard/repositories/platformChurchRegistrationRepository");
const {
  sanitizeProvisioningErrorDetail,
} = require("../src/blessboard/services/registrationApplicationsAdminService");

const IDENTITY_KEY = "blessboard-platform-v5";
const PASSWORD = "TestPassword99!";

function uniq(prefix) {
  return `${prefix}-${crypto.randomBytes(3).toString("hex")}`;
}

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

describe("platform-admin registration applications (Phase 5)", () => {
  let pool;
  let skipSuite = false;
  let skipReason = "";
  let app;
  let users = {};
  let fixtures = {};

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

      async function makeUser(email, displayName) {
        const created = await createBlessBoardUser(pool, {
          email,
          displayName,
          password: PASSWORD,
        });
        assert.equal(created.ok, true, created.message);
        return created.user;
      }

      users.platform = await makeUser("reg-pa@example.org", "Reg Platform Admin");
      users.platform2 = await makeUser("reg-pa2@example.org", "Second Platform Admin");
      users.hq = await makeUser("reg-hq@example.org", "Reg HQ Admin");
      users.member = await makeUser("reg-member@example.org", "Reg Member");

      // Provision a disposable Free church via orchestrator for write tests.
      const key = uniq("regadmin");
      const application = await appRepo.createApplication(pool, {
        church_name: `Reg Admin Church ${key}`,
        country: "Kenya",
        city: "Nairobi",
        contact_name: "Reg Admin Contact",
        contact_email: `${key}@example.org`,
        contact_phone: "+254700111222",
        role_in_church: "Administrator",
        selected_plan: "foundation",
        consent_terms: true,
      });
      const provisioned = await provisionRegisteredBlessBoardChurch(pool, {
        applicationId: application.id,
        administratorPassword: PASSWORD,
        requestedOrganizationKey: key,
        requestId: "reg-admin-fixture",
        actorContext: {
          type: "test",
          source: "phase5",
          dataEnvironment: "testing",
          deploymentCode: "blessboard-org-v5",
        },
      });
      assert.equal(provisioned.ok, true, provisioned.message);
      fixtures.provisionedAppId = application.id;
      fixtures.organizationId = provisioned.records.organizationId;
      fixtures.organizationKey = provisioned.records.organizationKey;

      // Unprovisioned submitted application (read-only fixture).
      fixtures.submittedApp = await appRepo.createApplication(pool, {
        church_name: "Submitted Enquiry Church",
        country: "Zambia",
        city: "Lusaka",
        contact_name: "Enquiry Person",
        contact_email: `${uniq("enq")}@example.org`,
        contact_phone: "+260971111111",
        role_in_church: "Pastor",
        selected_plan: "growth",
        consent_terms: true,
      });

      // Duplicate-review fixture
      fixtures.dupApp = await appRepo.createApplication(pool, {
        church_name: "Duplicate Review Church",
        country: "Kenya",
        city: "Mombasa",
        contact_name: "Dup Person",
        contact_email: `${uniq("dup")}@example.org`,
        contact_phone: "+254700333444",
        selected_plan: "foundation",
        consent_terms: true,
      });
      await appRepo.updateApplicationProvisioningState(pool, fixtures.dupApp.id, {
        applicationStatus: "duplicate_review",
        provisioningStatus: "not_started",
      });

      // Provisioning-failed fixture
      fixtures.failedApp = await appRepo.createApplication(pool, {
        church_name: "Failed Provision Church",
        country: "Kenya",
        city: "Kisumu",
        contact_name: "Fail Person",
        contact_email: `${uniq("fail")}@example.org`,
        contact_phone: "+254700555666",
        selected_plan: "foundation",
        consent_terms: true,
      });
      await appRepo.updateApplicationProvisioningState(pool, fixtures.failedApp.id, {
        applicationStatus: "submitted",
        provisioningStatus: "provisioning_failed",
        provisioningFailedAt: new Date().toISOString(),
        provisioningErrorCode: "provisioning_failed",
        provisioningErrorDetail: "SELECT * FROM secrets; password=hunter2 postgresql://x",
      });

      assert.equal(
        (
          await assignBlessBoardRole(pool, {
            email: "reg-pa@example.org",
            organizationKey: fixtures.organizationKey,
            roleKey: "platform_admin",
          })
        ).ok,
        true
      );
      assert.equal(
        (
          await assignBlessBoardRole(pool, {
            email: "reg-pa2@example.org",
            organizationKey: fixtures.organizationKey,
            roleKey: "platform_admin",
          })
        ).ok,
        true
      );
      assert.equal(
        (
          await assignBlessBoardRole(pool, {
            email: "reg-hq@example.org",
            organizationKey: fixtures.organizationKey,
            roleKey: "church_hq_admin",
            churchKey: fixtures.organizationKey,
          })
        ).ok,
        true
      );

      app = createV5FoundationApp({
        getPool: () => pool,
        env: {
          NODE_ENV: "test",
          PLATFORM_DEPLOYMENT_CODE: "blessboard-org-v5",
          SESSION_SECRET: "test-session-secret-at-least-32-chars!!",
          SESSION_COOKIE_NAME: DEFAULT_V5_COOKIE,
          BLESSBOARD_TENANT_ROUTING_MODE: "off",
        },
      });
    } catch (err) {
      skipSuite = true;
      skipReason = err && err.message ? err.message : String(err);
    }
  });

  after(async () => {
    if (pool) await pool.end().catch(() => {});
  });

  function requireDb() {
    if (skipSuite) assert.fail(`Local PostgreSQL unavailable: ${skipReason}`);
  }

  async function cookieFor(user) {
    const created = await createV5Session(pool, {
      deploymentCode: "blessboard-org-v5",
      userId: user.id,
      organizationId: fixtures.organizationId,
      churchId: null,
      branchId: null,
    });
    assert.equal(created.ok, true, created.code);
    return `${DEFAULT_V5_COOKIE}=${created.rawToken}`;
  }

  it("sanitizes provisioning error details", () => {
    const s = sanitizeProvisioningErrorDetail(
      "SELECT password FROM x; postgresql://user:pass@host/db stack trace"
    );
    assert.doesNotMatch(s, /postgresql:\/\//i);
    assert.doesNotMatch(s, /password=hunter/i);
    assert.match(s, /redacted/i);
  });

  it("logged-out visitor is redirected from list", async () => {
    requireDb();
    const res = await request(app)
      .get("/admin/registration-applications")
      .set("Host", "blessboard.org")
      .set("Accept", "text/html");
    assert.equal(res.status, 303);
    assert.match(res.headers.location || "", /\/login/);
  });

  it("church HQ admin is rejected", async () => {
    requireDb();
    const cookie = await cookieFor(users.hq);
    const res = await request(app)
      .get("/admin/registration-applications")
      .set("Host", "blessboard.org")
      .set("Cookie", cookie);
    assert.equal(res.status, 403);
  });

  it("member without platform_admin is rejected", async () => {
    requireDb();
    const cookie = await cookieFor(users.member);
    const res = await request(app)
      .get("/admin/registration-applications")
      .set("Host", "blessboard.org")
      .set("Cookie", cookie);
    assert.equal(res.status, 403);
  });

  it("platform admin list returns 200 with fixtures and nav", async () => {
    requireDb();
    const cookie = await cookieFor(users.platform);
    const res = await request(app)
      .get("/admin/registration-applications")
      .set("Host", "blessboard.org")
      .set("Cookie", cookie);
    assert.equal(res.status, 200);
    assert.match(res.headers["cache-control"] || "", /no-store/);
    assert.match(res.text, /data-bb-pa-registration-applications="1"/);
    assert.match(res.text, /Submitted Enquiry Church/);
    assert.match(res.text, /Duplicate Review Church/);
    assert.match(res.text, /Failed Provision Church/);
    assert.match(res.text, new RegExp(fixtures.organizationKey));
    assert.match(res.text, /href="\/admin\/registration-applications"/);
    assert.doesNotMatch(res.text, /href="\/admin\/churches"/);
    assert.doesNotMatch(res.text, /password_hash|hunter2|postgresql:\/\//i);
    assert.doesNotMatch(res.text, /SELECT \* FROM secrets/i);
  });

  it("filters and search work; invalid filters are safe", async () => {
    requireDb();
    const cookie = await cookieFor(users.platform);
    const filtered = await request(app)
      .get("/admin/registration-applications?application_status=duplicate_review")
      .set("Host", "blessboard.org")
      .set("Cookie", cookie);
    assert.equal(filtered.status, 200);
    assert.match(filtered.text, /Duplicate Review Church/);
    assert.doesNotMatch(filtered.text, /Submitted Enquiry Church/);

    const search = await request(app)
      .get(`/admin/registration-applications?q=${encodeURIComponent(fixtures.organizationKey)}`)
      .set("Host", "blessboard.org")
      .set("Cookie", cookie);
    assert.equal(search.status, 200);
    assert.match(search.text, new RegExp(fixtures.organizationKey));

    const bad = await request(app)
      .get("/admin/registration-applications?from=not-a-date")
      .set("Host", "blessboard.org")
      .set("Cookie", cookie);
    assert.equal(bad.status, 400);

    const empty = await request(app)
      .get("/admin/registration-applications?q=zzznomatchzzz")
      .set("Host", "blessboard.org")
      .set("Cookie", cookie);
    assert.equal(empty.status, 200);
    assert.match(empty.text, /No matching applications/i);
    assert.match(empty.text, /data-bb-pa-reg-state="no-results"/);
    assert.match(empty.text, /data-bb-pa-reg-clear-filters="1"/);
  });

  it("detail returns 200; missing id 404; failure sanitized", async () => {
    requireDb();
    const cookie = await cookieFor(users.platform);
    const detail = await request(app)
      .get(`/admin/registration-applications/${fixtures.provisionedAppId}`)
      .set("Host", "blessboard.org")
      .set("Cookie", cookie);
    assert.equal(detail.status, 200);
    assert.match(detail.headers["cache-control"] || "", /no-store/);
    assert.match(detail.text, /data-bb-pa-registration-application-detail="1"/);
    assert.match(detail.text, new RegExp(fixtures.organizationKey));
    assert.match(detail.text, /href="\/admin\/organizations\//);
    assert.match(detail.text, /Follow-up/);

    const failed = await request(app)
      .get(`/admin/registration-applications/${fixtures.failedApp.id}`)
      .set("Host", "blessboard.org")
      .set("Cookie", cookie);
    assert.equal(failed.status, 200);
    assert.match(failed.text, /data-bb-pa-provisioning-failed="1"/);
    assert.doesNotMatch(failed.text, /postgresql:\/\/|hunter2|SELECT \*/i);

    const missing = await request(app)
      .get("/admin/registration-applications/00000000-0000-4000-8000-000000000099")
      .set("Host", "blessboard.org")
      .set("Cookie", cookie);
    assert.equal(missing.status, 404);
  });

  it("organization detail shows registration backlink", async () => {
    requireDb();
    const cookie = await cookieFor(users.platform);
    const res = await request(app)
      .get(`/admin/organizations/${fixtures.organizationKey}`)
      .set("Host", "blessboard.org")
      .set("Cookie", cookie);
    assert.equal(res.status, 200);
    assert.match(res.text, /data-bb-pa-registration-backlink="1"/);
    assert.match(
      res.text,
      new RegExp(`/admin/registration-applications/${fixtures.provisionedAppId}`)
    );
  });

  it("follow-up update requires CSRF and does not change provisioning", async () => {
    requireDb();
    const cookie = await cookieFor(users.platform);
    const page = await request(app)
      .get(`/admin/registration-applications/${fixtures.provisionedAppId}`)
      .set("Host", "blessboard.org")
      .set("Cookie", cookie);
    const csrf = extractCsrfToken(page.text);
    const csrfCookie = extractCookie(page, CSRF_COOKIE);

    const noCsrf = await request(app)
      .post(`/admin/registration-applications/${fixtures.provisionedAppId}/follow-up-status`)
      .set("Host", "blessboard.org")
      .set("Cookie", cookie)
      .type("form")
      .send({ follow_up_status: "call_pending" });
    assert.equal(noCsrf.status, 303);
    assert.match(noCsrf.headers.location || "", /error=csrf/);

    const ok = await request(app)
      .post(`/admin/registration-applications/${fixtures.provisionedAppId}/follow-up-status`)
      .set("Host", "blessboard.org")
      .set("Cookie", `${cookie}; ${CSRF_COOKIE}=${csrfCookie}`)
      .type("form")
      .send({
        follow_up_status: "call_pending",
        [CSRF_FIELD]: csrf,
      });
    assert.equal(ok.status, 303);
    assert.match(ok.headers.location || "", /notice=follow_up_saved/);

    const appRow = await appRepo.findApplicationById(pool, fixtures.provisionedAppId);
    assert.equal(appRow.provisioning_status, "provisioned");
    assert.equal(appRow.application_status, "closed");

    const onboarding = await pool.query(
      `SELECT follow_up_status, organization_id FROM blessboard.organization_onboarding
        WHERE organization_id = $1`,
      [fixtures.organizationId]
    );
    assert.equal(onboarding.rows[0].follow_up_status, "call_pending");

    const org = await pool.query(`SELECT status FROM platform.organizations WHERE id = $1`, [
      fixtures.organizationId,
    ]);
    assert.equal(org.rows[0].status, "active");
  });

  it("follow-up on unprovisioned application is rejected", async () => {
    requireDb();
    const cookie = await cookieFor(users.platform);
    const page = await request(app)
      .get(`/admin/registration-applications/${fixtures.submittedApp.id}`)
      .set("Host", "blessboard.org")
      .set("Cookie", cookie);
    const csrf = extractCsrfToken(page.text);
    const csrfCookie = extractCookie(page, CSRF_COOKIE);
    const res = await request(app)
      .post(`/admin/registration-applications/${fixtures.submittedApp.id}/follow-up-status`)
      .set("Host", "blessboard.org")
      .set("Cookie", `${cookie}; ${CSRF_COOKIE}=${csrfCookie}`)
      .type("form")
      .send({
        follow_up_status: "contacted",
        [CSRF_FIELD]: csrf,
      });
    assert.equal(res.status, 303);
    assert.match(res.headers.location || "", /error=not_provisioned/);
  });

  it("support assignment validates platform admin and allows unassign", async () => {
    requireDb();
    const cookie = await cookieFor(users.platform);
    const page = await request(app)
      .get(`/admin/registration-applications/${fixtures.provisionedAppId}`)
      .set("Host", "blessboard.org")
      .set("Cookie", cookie);
    const csrf = extractCsrfToken(page.text);
    const csrfCookie = extractCookie(page, CSRF_COOKIE);

    const bad = await request(app)
      .post(`/admin/registration-applications/${fixtures.provisionedAppId}/assign-support`)
      .set("Host", "blessboard.org")
      .set("Cookie", `${cookie}; ${CSRF_COOKIE}=${csrfCookie}`)
      .type("form")
      .send({
        support_user_id: users.hq.id,
        [CSRF_FIELD]: csrf,
      });
    assert.equal(bad.status, 303);
    assert.match(bad.headers.location || "", /error=not_platform_admin/);

    const page2 = await request(app)
      .get(`/admin/registration-applications/${fixtures.provisionedAppId}`)
      .set("Host", "blessboard.org")
      .set("Cookie", cookie);
    const csrf2 = extractCsrfToken(page2.text);
    const csrfCookie2 = extractCookie(page2, CSRF_COOKIE);

    const ok = await request(app)
      .post(`/admin/registration-applications/${fixtures.provisionedAppId}/assign-support`)
      .set("Host", "blessboard.org")
      .set("Cookie", `${cookie}; ${CSRF_COOKIE}=${csrfCookie2}`)
      .type("form")
      .send({
        support_user_id: users.platform2.id,
        [CSRF_FIELD]: csrf2,
      });
    assert.equal(ok.status, 303);
    assert.match(ok.headers.location || "", /notice=support_assigned/);

    const page3 = await request(app)
      .get(`/admin/registration-applications/${fixtures.provisionedAppId}`)
      .set("Host", "blessboard.org")
      .set("Cookie", cookie);
    const csrf3 = extractCsrfToken(page3.text);
    const csrfCookie3 = extractCookie(page3, CSRF_COOKIE);
    const unassign = await request(app)
      .post(`/admin/registration-applications/${fixtures.provisionedAppId}/assign-support`)
      .set("Host", "blessboard.org")
      .set("Cookie", `${cookie}; ${CSRF_COOKIE}=${csrfCookie3}`)
      .type("form")
      .send({
        support_user_id: "",
        [CSRF_FIELD]: csrf3,
      });
    assert.equal(unassign.status, 303);
    assert.match(unassign.headers.location || "", /notice=support_assigned/);
  });

  it("contact history is append-only with allowlists and session actor", async () => {
    requireDb();
    const cookie = await cookieFor(users.platform);
    const before = await pool.query(
      `SELECT COUNT(*)::int AS n FROM blessboard.organization_support_contacts
        WHERE organization_id = $1`,
      [fixtures.organizationId]
    );

    async function addNote(note, method, outcome) {
      const page = await request(app)
        .get(`/admin/registration-applications/${fixtures.provisionedAppId}`)
        .set("Host", "blessboard.org")
        .set("Cookie", cookie);
      const csrf = extractCsrfToken(page.text);
      const csrfCookie = extractCookie(page, CSRF_COOKIE);
      return request(app)
        .post(`/admin/registration-applications/${fixtures.provisionedAppId}/contact`)
        .set("Host", "blessboard.org")
        .set("Cookie", `${cookie}; ${CSRF_COOKIE}=${csrfCookie}`)
        .type("form")
        .send({
          contact_method: method,
          outcome,
          note,
          follow_up_status: "contacted",
          [CSRF_FIELD]: csrf,
        });
    }

    const first = await addNote("First disposable onboarding call note.", "phone", "reached");
    assert.equal(first.status, 303);
    assert.match(first.headers.location || "", /notice=contact_saved/);

    const second = await addNote("Second disposable onboarding call note.", "email", "left_message");
    assert.equal(second.status, 303);

    const invalidMethod = await addNote("Should fail method.", "carrier_pigeon", "reached");
    assert.equal(invalidMethod.status, 303);
    assert.match(invalidMethod.headers.location || "", /error=invalid/);

    const longNote = "x".repeat(2001);
    const invalidLen = await addNote(longNote, "phone", "reached");
    assert.equal(invalidLen.status, 303);
    assert.match(invalidLen.headers.location || "", /error=invalid/);

    const after = await pool.query(
      `SELECT id, note, created_by_user_id, contact_method, outcome
         FROM blessboard.organization_support_contacts
        WHERE organization_id = $1
        ORDER BY created_at ASC`,
      [fixtures.organizationId]
    );
    assert.equal(after.rows.length, before.rows[0].n + 2);
    assert.equal(String(after.rows[after.rows.length - 1].created_by_user_id), String(users.platform.id));
    assert.ok(after.rows.some((r) => r.note.includes("First disposable")));
    assert.ok(after.rows.some((r) => r.note.includes("Second disposable")));

    const audits = await pool.query(
      `SELECT action_key, metadata_json
         FROM platform.audit_events
        WHERE organization_id = $1
          AND action_key = 'registration.support_contact_added'
        ORDER BY created_at DESC
        LIMIT 5`,
      [fixtures.organizationId]
    );
    assert.ok(audits.rows.length >= 1);
    for (const row of audits.rows) {
      const meta = row.metadata_json || {};
      assert.equal(meta.note, undefined);
      assert.doesNotMatch(JSON.stringify(meta), /First disposable/);
    }

    const onboarding = await pool.query(
      `SELECT first_contacted_at, last_contacted_at, follow_up_status
         FROM blessboard.organization_onboarding WHERE organization_id = $1`,
      [fixtures.organizationId]
    );
    assert.ok(onboarding.rows[0].first_contacted_at);
    assert.ok(onboarding.rows[0].last_contacted_at);
    assert.equal(onboarding.rows[0].follow_up_status, "contacted");
  });

  it("organizations remains canonical and no churches route", async () => {
    requireDb();
    const cookie = await cookieFor(users.platform);
    const orgs = await request(app)
      .get("/admin/organizations")
      .set("Host", "blessboard.org")
      .set("Cookie", cookie);
    assert.equal(orgs.status, 200);
    assert.match(orgs.text, /href="\/admin\/organizations"/);

    const churches = await request(app)
      .get("/admin/churches")
      .set("Host", "blessboard.org")
      .set("Cookie", cookie);
    assert.ok([404, 503].includes(churches.status));
  });
});
