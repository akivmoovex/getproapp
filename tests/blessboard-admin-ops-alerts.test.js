"use strict";

/**
 * Prompt 19 — internal platform-admin registration operations alerts (derived).
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
const { createV5Session } = require("../src/platform/session/createV5Session");
const { createBlessBoardUser } = require("../src/blessboard/services/createBlessBoardUser");
const { assignBlessBoardRole } = require("../src/blessboard/services/assignBlessBoardRole");
const {
  provisionRegisteredBlessBoardChurch,
} = require("../src/blessboard/services/provisionRegisteredBlessBoardChurch");
const appRepo = require("../src/blessboard/repositories/platformChurchRegistrationRepository");
const {
  listPlatformAdminOpsAlerts,
  EVENT_TYPES,
  isSafeAdminHref,
  assertNoSensitiveLeak,
} = require("../src/platform/services/platformAdminOpsAlerts");
const { recordAuditEvent } = require("../src/platform/services/auditEventService");
const { addGrowthTrialDurationUtc } = require("../src/platform/time/addGrowthTrialDurationUtc");
const { addCalendarDaysUtc } = require("../src/platform/time/addCalendarDaysUtc");

const IDENTITY_KEY = "blessboard-platform-v5";
const PASSWORD = "TestPassword99!";
const APEX = "blessboard.org";

function uniq(prefix) {
  return `${prefix}-${crypto.randomBytes(3).toString("hex")}`;
}

describe("platform-admin registration ops alerts (Prompt 19)", () => {
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

      users.platform = await makeUser(`${uniq("ops-pa")}@example.org`, "Ops Platform Admin");
      users.hq = await makeUser(`${uniq("ops-hq")}@example.org`, "Ops HQ Admin");

      const foundationKey = uniq("opsfound");
      const foundationApp = await appRepo.createApplication(pool, {
        church_name: `Ops Foundation ${foundationKey}`,
        country: "Kenya",
        city: "Nairobi",
        contact_name: "Ops Found Admin",
        contact_email: `${foundationKey}@example.org`,
        contact_phone: `+2547${String(Date.now()).slice(-7)}`,
        contact_phone_normalized: `+2547${String(Date.now()).slice(-7)}`,
        role_in_church: "Administrator",
        selected_plan: "foundation",
        consent_terms: true,
        risk_decision: "allow",
        risk_reason_codes: [],
      });
      const foundationProv = await provisionRegisteredBlessBoardChurch(pool, {
        applicationId: foundationApp.id,
        administratorPassword: PASSWORD,
        requestedOrganizationKey: foundationKey,
        actorContext: {
          type: "test",
          source: "prompt19",
          dataEnvironment: "testing",
          deploymentCode: "blessboard-org-v5",
        },
      });
      assert.equal(foundationProv.ok, true, foundationProv.status);
      fixtures.foundationAppId = foundationApp.id;
      fixtures.foundationOrgId = foundationProv.records.organizationId;
      fixtures.foundationOrgKey = foundationProv.records.organizationKey;

      assert.equal(
        (
          await assignBlessBoardRole(pool, {
            email: users.platform.email,
            organizationKey: fixtures.foundationOrgKey,
            roleKey: "platform_admin",
          })
        ).ok,
        true
      );
      assert.equal(
        (
          await assignBlessBoardRole(pool, {
            email: users.hq.email,
            organizationKey: fixtures.foundationOrgKey,
            churchKey: fixtures.foundationOrgKey,
            roleKey: "church_hq_admin",
          })
        ).ok,
        true
      );

      const growthKey = uniq("opsgrow");
      const growthApp = await appRepo.createApplication(pool, {
        church_name: `Ops Growth ${growthKey}`,
        country: "Kenya",
        city: "Kisumu",
        contact_name: "Ops Growth Admin",
        contact_email: `${growthKey}@example.org`,
        contact_phone: `+2547${String(Date.now() + 3).slice(-7)}`,
        contact_phone_normalized: `+2547${String(Date.now() + 3).slice(-7)}`,
        role_in_church: "Administrator",
        selected_plan: "growth",
        consent_terms: true,
      });
      const growthProv = await provisionRegisteredBlessBoardChurch(pool, {
        applicationId: growthApp.id,
        administratorPassword: PASSWORD,
        requestedOrganizationKey: growthKey,
        actorContext: {
          type: "test",
          source: "prompt19",
          dataEnvironment: "testing",
          deploymentCode: "blessboard-org-v5",
        },
      });
      assert.equal(growthProv.ok, true, growthProv.status);
      fixtures.growthOrgId = growthProv.records.organizationId;
      fixtures.growthOrgKey = growthProv.records.organizationKey;
      const growthSubRow = await pool.query(
        `SELECT id FROM platform.organization_subscriptions
          WHERE organization_id = $1
          ORDER BY starts_at DESC
          LIMIT 1`,
        [fixtures.growthOrgId]
      );
      fixtures.growthSubId = growthSubRow.rows[0].id;

      // Force trial ending soon (within 7 days).
      const soon = addCalendarDaysUtc(new Date(), 3);
      await pool.query(
        `UPDATE platform.organization_subscriptions
            SET ends_at = $2::timestamptz
          WHERE id = $1`,
        [fixtures.growthSubId, soon.toISOString()]
      );

      // Grace org: separate Growth past_due.
      const graceKey = uniq("opsgrace");
      const graceApp = await appRepo.createApplication(pool, {
        church_name: `Ops Grace ${graceKey}`,
        country: "Zambia",
        city: "Lusaka",
        contact_name: "Ops Grace Admin",
        contact_email: `${graceKey}@example.org`,
        contact_phone: `+26097${String(Date.now()).slice(-7)}`,
        contact_phone_normalized: `+26097${String(Date.now()).slice(-7)}`,
        role_in_church: "Administrator",
        selected_plan: "growth",
        consent_terms: true,
      });
      const graceProv = await provisionRegisteredBlessBoardChurch(pool, {
        applicationId: graceApp.id,
        administratorPassword: PASSWORD,
        requestedOrganizationKey: graceKey,
        actorContext: {
          type: "test",
          source: "prompt19",
          dataEnvironment: "testing",
          deploymentCode: "blessboard-org-v5",
        },
      });
      assert.equal(graceProv.ok, true, graceProv.status);
      fixtures.graceOrgId = graceProv.records.organizationId;
      fixtures.graceOrgKey = graceProv.records.organizationKey;
      const graceSubRow = await pool.query(
        `SELECT id FROM platform.organization_subscriptions
          WHERE organization_id = $1
          ORDER BY starts_at DESC
          LIMIT 1`,
        [fixtures.graceOrgId]
      );
      const graceEnd = addCalendarDaysUtc(new Date(), 5);
      await pool.query(
        `UPDATE platform.organization_subscriptions
            SET status = 'past_due', ends_at = $2::timestamptz
          WHERE id = $1`,
        [graceSubRow.rows[0].id, graceEnd.toISOString()]
      );

      // Downgrade audit event.
      const down = await recordAuditEvent(pool, {
        deploymentCode: "blessboard-org-v5",
        organizationId: fixtures.foundationOrgId,
        outcome: "success",
        actionKey: "subscription.trial_downgraded_to_foundation",
        entityType: "organization_subscription",
        entityId: fixtures.foundationOrgId,
        metadata: { category: "registration", source: "test", actor_type: "system" },
      });
      assert.equal(down.ok, true, down.reason);

      // Repeated trial-expiry failures.
      for (let i = 0; i < 2; i += 1) {
        const fail = await recordAuditEvent(pool, {
          deploymentCode: "blessboard-org-v5",
          organizationId: fixtures.growthOrgId,
          outcome: "failure",
          actionKey: "subscription.trial_expiry_failed",
          entityType: "organization_subscription",
          entityId: fixtures.growthSubId,
          metadata: { category: "registration", source: "test", actor_type: "system" },
        });
        assert.equal(fail.ok, true, fail.reason);
      }

      // Network contact request.
      fixtures.networkApp = await appRepo.createApplication(pool, {
        church_name: `Ops Network ${uniq("net")}`,
        country: "Kenya",
        city: "Mombasa",
        contact_name: "Network Contact",
        contact_email: `${uniq("net")}@example.org`,
        contact_phone: `+2547${String(Date.now() + 9).slice(-7)}`,
        contact_phone_normalized: `+2547${String(Date.now() + 9).slice(-7)}`,
        selected_plan: "network",
        support_requested: true,
        follow_up_status: "new",
        consent_terms: true,
      });

      // Registration requires review.
      fixtures.reviewApp = await appRepo.createApplication(pool, {
        church_name: `Ops Review ${uniq("rev")}`,
        country: "Kenya",
        city: "Nakuru",
        contact_name: "Review Contact",
        contact_email: `${uniq("rev")}@example.org`,
        contact_phone: `+2547${String(Date.now() + 11).slice(-7)}`,
        contact_phone_normalized: `+2547${String(Date.now() + 11).slice(-7)}`,
        selected_plan: "foundation",
        application_status: "duplicate_review",
        risk_decision: "review_required",
        risk_reason_codes: ["similar_organization"],
        risk_decided_at: new Date().toISOString(),
        consent_terms: true,
      });

      // Provisioning failed.
      fixtures.failedApp = await appRepo.createApplication(pool, {
        church_name: `Ops Failed ${uniq("fail")}`,
        country: "Kenya",
        city: "Eldoret",
        contact_name: "Failed Contact",
        contact_email: `${uniq("fail")}@example.org`,
        contact_phone: `+2547${String(Date.now() + 13).slice(-7)}`,
        contact_phone_normalized: `+2547${String(Date.now() + 13).slice(-7)}`,
        selected_plan: "foundation",
        consent_terms: true,
      });
      await appRepo.updateApplicationProvisioningState(pool, fixtures.failedApp.id, {
        applicationStatus: "submitted",
        provisioningStatus: "provisioning_failed",
        provisioningFailedAt: new Date().toISOString(),
        provisioningErrorCode: "provisioning_failed",
        provisioningErrorDetail: "password=secret postgresql://x",
      });

      app = createV5FoundationApp({
        env: {
          NODE_ENV: "test",
          BLESSBOARD_TENANT_ROUTING_MODE: "off",
          PLATFORM_DEPLOYMENT_CODE: "blessboard-org-v5",
          SESSION_SECRET: "test-session-secret-at-least-32-chars!!",
          SESSION_COOKIE_NAME: DEFAULT_V5_COOKIE,
        },
        getPool: () => pool,
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
      organizationId: fixtures.foundationOrgId,
      churchId: null,
      branchId: null,
    });
    assert.equal(created.ok, true, created.code);
    return `${DEFAULT_V5_COOKIE}=${created.rawToken}`;
  }

  it("exposes one operational alert per event type from fixtures", async () => {
    requireDb();
    const listed = await listPlatformAdminOpsAlerts(pool, { page: 1, limit: 50 });
    assert.equal(listed.ok, true);
    const types = new Set(listed.alerts.map((a) => a.eventType));
    for (const eventType of Object.values(EVENT_TYPES)) {
      assert.ok(types.has(eventType), `missing alert for ${eventType}`);
    }
    for (const alert of listed.alerts) {
      assert.ok(isSafeAdminHref(alert.href), alert.href);
      assert.doesNotMatch(alert.summary, /password|postgresql:\/\/|@example\.org|\+254|\+260/i);
      assert.doesNotMatch(alert.title, /password|token|csrf/i);
      assert.equal(assertNoSensitiveLeak(`password=${PASSWORD}`), "[redacted]");
    }
  });

  it("repeated listing is idempotent (stable alert keys)", async () => {
    requireDb();
    const a = await listPlatformAdminOpsAlerts(pool, { page: 1, limit: 50 });
    const b = await listPlatformAdminOpsAlerts(pool, { page: 1, limit: 50 });
    assert.deepEqual(
      a.alerts.map((x) => x.alertKey).sort(),
      b.alerts.map((x) => x.alertKey).sort()
    );
  });

  it("alert links resolve on authorized platform-admin routes", async () => {
    requireDb();
    const cookie = await cookieFor(users.platform);
    const listed = await listPlatformAdminOpsAlerts(pool, { page: 1, limit: 50 });
    const sample = listed.alerts.slice(0, 5);
    for (const alert of sample) {
      const res = await request(app).get(alert.href).set("Host", APEX).set("Cookie", cookie);
      assert.ok([200, 303].includes(res.status), `${alert.href} → ${res.status}`);
      if (res.status === 200) {
        assert.match(res.text, /bb-pa-|Platform admin|Registration|Organization/i);
      }
    }
  });

  it("tenant church admin cannot view platform ops alerts", async () => {
    requireDb();
    const cookie = await cookieFor(users.hq);
    const res = await request(app).get("/admin").set("Host", APEX).set("Cookie", cookie);
    assert.ok([303, 401, 403].includes(res.status));
    assert.doesNotMatch(String(res.headers.location || res.text || ""), /data-bb-pa-ops-alerts="1"/);
  });

  it("empty derived list works; dashboard omits secrets when alerts exist", async () => {
    requireDb();
    // Fresh empty DB path: service with no matching rows still returns ok + empty.
    const emptyPool = {
      query: async (sql) => {
        if (/COUNT\(\*\)/i.test(String(sql)) && /trial_expiry_failed/i.test(String(sql))) {
          return { rows: [] };
        }
        return { rows: [] };
      },
    };
    const empty = await listPlatformAdminOpsAlerts(emptyPool, { page: 1, limit: 20 });
    assert.equal(empty.ok, true);
    assert.equal(empty.total, 0);
    assert.deepEqual(empty.alerts, []);

    const cookie = await cookieFor(users.platform);
    const res = await request(app).get("/admin").set("Host", APEX).set("Cookie", cookie);
    assert.equal(res.status, 200);
    assert.match(res.text, /data-bb-pa-ops-alerts="1"/);
    // With fixtures we have alerts; still must not leak secrets from failed detail.
    assert.doesNotMatch(res.text, /password=secret|postgresql:\/\//i);
    assert.match(res.text, /data-bb-pa-ops-alert-type="/);
  });

  it("alerts remain bounded and paginated", async () => {
    requireDb();
    const page1 = await listPlatformAdminOpsAlerts(pool, { page: 1, limit: 10 });
    assert.equal(page1.ok, true);
    assert.ok(page1.alerts.length <= 10);
    assert.ok(page1.limit <= 50);
    if (page1.total > 10) {
      assert.ok(page1.totalPages >= 2);
      const page2 = await listPlatformAdminOpsAlerts(pool, { page: 2, limit: 10 });
      assert.equal(page2.ok, true);
      const overlap = page1.alerts.filter((a) =>
        page2.alerts.some((b) => b.alertKey === a.alertKey)
      );
      assert.equal(overlap.length, 0);
    }

    const cookie = await cookieFor(users.platform);
    const res = await request(app)
      .get("/admin?alerts_page=1&alerts_limit=10")
      .set("Host", APEX)
      .set("Cookie", cookie);
    assert.equal(res.status, 200);
    assert.match(res.text, /data-bb-pa-ops-alerts-list="1"|data-bb-pa-ops-alerts-empty="1"/);
  });

  it("unused growth trial window helper remains available for fixtures", () => {
    const start = new Date("2026-01-15T00:00:00.000Z");
    const end = addGrowthTrialDurationUtc(start);
    assert.equal(end.toISOString(), "2026-02-15T00:00:00.000Z");
  });
});
