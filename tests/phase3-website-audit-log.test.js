"use strict";

/**
 * Phase3 Website Audit Log.
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
const { createV5Session } = require("../src/platform/session/createV5Session");
const { createV5FoundationApp } = require("../src/platform/http/v5FoundationServer");
const { DEFAULT_V5_COOKIE } = require("../src/platform/session/v5SessionCookie");
const {
  ensureChurchSettingsInitialized,
  updateChurchSettings,
} = require("../src/blessboard/services/blessBoardSettingsService");
const {
  repairWebsiteFoundation,
} = require("../src/blessboard/services/websiteFoundationRepairService");
const {
  acknowledgeWebsitePreview,
  publishChurchWebsite,
} = require("../src/blessboard/services/churchWebsitePublishService");
const auditSvc = require("../src/blessboard/services/websiteAuditService");

const IDENTITY_KEY = "blessboard-platform-v5";
const PASSWORD = "TestPassword99!";
const HOST_A = "wal-a.blessboard.org";
const HOST_B = "wal-b.blessboard.org";

function baseEnv(overrides) {
  return {
    NODE_ENV: "test",
    PLATFORM_DEPLOYMENT_CODE: "blessboard-org-v5",
    SESSION_SECRET: "test-session-secret-at-least-32-chars!!",
    SESSION_COOKIE_NAME: DEFAULT_V5_COOKIE,
    BLESSBOARD_TENANT_ROUTING_MODE: "authoritative",
    BLESSBOARD_AUTHORITATIVE_HOST_ALLOWLIST: "*",
    ...overrides,
  };
}

function sidCookie(rawToken) {
  return `${DEFAULT_V5_COOKIE}=${rawToken}`;
}

describe("phase3 website audit log", () => {
  let pool;
  let skipSuite = false;
  let skipReason = "";
  let app;
  let orgA;
  let orgB;
  let churchA;
  let users = {};
  let sampleEventId;

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

      async function provision(key, host, store) {
        const prov = await provisionPlatformTenant(pool, {
          organizationKey: key,
          displayName: `WAL ${key}`,
          legalName: null,
          dataEnvironment: "testing",
          productKey: "blessboard",
          productTenantKey: key,
          hostname: host,
          domainType: "canonical",
          deploymentCode: "blessboard-org-v5",
          isPrimary: true,
        });
        assert.equal(prov.ok, true, prov.message);
        const ch = await provisionBlessBoardChurch(pool, {
          organizationKey: key,
          churchKey: key,
          displayName: `WAL Church ${key}`,
          dataEnvironment: "testing",
          hqBranchKey: "hq",
          hqBranchDisplayName: "HQ",
        });
        assert.equal(ch.ok, true, ch.message);
        store.org = prov.records.organization;
        store.church = ch.records.church;
        await ensureChurchSettingsInitialized(pool, store.church.id);
        await updateChurchSettings(pool, store.church.id, {
          publicName: `WAL Church ${key}`,
          websiteStatus: "draft",
          primaryEmail: `${key}@example.test`,
        });
        await repairWebsiteFoundation(pool, { churchId: store.church.id });
        await acknowledgeWebsitePreview(pool, {
          churchId: store.church.id,
          actorUserId: null,
        });
      }

      const a = {};
      const b = {};
      await provision("wal-a", HOST_A, a);
      await provision("wal-b", HOST_B, b);
      orgA = a.org;
      orgB = b.org;
      churchA = a.church;

      async function makeUser(email, displayName, role, orgId) {
        const created = await createBlessBoardUser(pool, {
          email,
          displayName,
          password: PASSWORD,
        });
        assert.equal(created.ok, true, created.message);
        assert.equal((await assignBlessBoardRole(pool, role)).ok, true);
        const session = await createV5Session(pool, {
          deploymentCode: "blessboard-org-v5",
          userId: created.user.id,
          organizationId: orgId,
        });
        assert.equal(session.ok, true, session.message || session.code);
        return { user: created.user, rawToken: session.rawToken };
      }

      users.hqA = await makeUser(
        "wal-hq-a@example.test",
        "HQ A",
        {
          email: "wal-hq-a@example.test",
          organizationKey: "wal-a",
          roleKey: "church_hq_admin",
          churchKey: "wal-a",
        },
        orgA.id
      );
      users.branchA = await makeUser(
        "wal-br-a@example.test",
        "Branch A",
        {
          email: "wal-br-a@example.test",
          organizationKey: "wal-a",
          roleKey: "branch_admin",
          churchKey: "wal-a",
          branchKey: "hq",
        },
        orgA.id
      );
      users.hqB = await makeUser(
        "wal-hq-b@example.test",
        "HQ B",
        {
          email: "wal-hq-b@example.test",
          organizationKey: "wal-b",
          roleKey: "church_hq_admin",
          churchKey: "wal-b",
        },
        orgB.id
      );

      const published = await publishChurchWebsite(pool, {
        churchId: churchA.id,
        actorUserId: users.hqA.user.id,
        confirmPublish: true,
        deferServiceTimes: true,
        env: baseEnv(),
      });
      assert.equal(published.ok, true, published.reason);

      const listed = await auditSvc.listWebsiteAuditEvents(pool, {
        organizationId: orgA.id,
      });
      assert.ok(listed.ok);
      assert.ok(listed.items.length >= 1);
      sampleEventId = listed.items[0].id;

      app = createV5FoundationApp({
        getPool: () => pool,
        env: baseEnv(),
        apexHosts: new Set(["blessboard.org", "www.blessboard.org"]),
      });
    } catch (err) {
      skipSuite = true;
      skipReason = err && err.message ? err.message : String(err);
    }
  });

  after(async () => {
    if (pool) await pool.end().catch(() => {});
  });

  function skipIfNeeded() {
    if (skipSuite) assert.fail(`Local PostgreSQL unavailable: ${skipReason}`);
  }

  it("HQ can view audit log", async () => {
    skipIfNeeded();
    const res = await request(app)
      .get("/hq/website/audit-log")
      .set("Host", HOST_A)
      .set("Cookie", sidCookie(users.hqA.rawToken));
    assert.equal(res.status, 200);
    assert.match(res.text, /Website Audit Log/);
    assert.match(res.text, /data-bb-phase3-website-audit-log="1"/);
    assert.match(res.text, /Website published/);
  });

  it("unauthorized users are blocked", async () => {
    skipIfNeeded();
    const anon = await request(app)
      .get("/hq/website/audit-log")
      .set("Host", HOST_A)
      .set("Accept", "text/html");
    assert.ok(anon.status === 303 || anon.status === 401);
    const branch = await request(app)
      .get("/hq/website/audit-log")
      .set("Host", HOST_A)
      .set("Cookie", sidCookie(users.branchA.rawToken));
    assert.equal(branch.status, 403);
  });

  it("cross-organization audit access blocked", async () => {
    skipIfNeeded();
    const res = await request(app)
      .get(`/hq/website/audit-log/${sampleEventId}`)
      .set("Host", HOST_B)
      .set("Cookie", sidCookie(users.hqB.rawToken));
    assert.equal(res.status, 404);
  });

  it("filters and human-readable details work", async () => {
    skipIfNeeded();
    const filtered = await request(app)
      .get("/hq/website/audit-log?action=website_published")
      .set("Host", HOST_A)
      .set("Cookie", sidCookie(users.hqA.rawToken));
    assert.equal(filtered.status, 200);
    assert.match(filtered.text, /Website published/);

    const detail = await request(app)
      .get(`/hq/website/audit-log/${sampleEventId}`)
      .set("Host", HOST_A)
      .set("Cookie", sidCookie(users.hqA.rawToken));
    assert.equal(detail.status, 200);
    assert.match(detail.text, /data-bb-phase3-website-audit-detail="1"/);
    assert.doesNotMatch(detail.text, /"password"/);
    assert.doesNotMatch(detail.text, /csrf_token/);
  });

  it("sensitive fields are excluded from recorded audit payloads", async () => {
    skipIfNeeded();
    const event = await auditSvc.recordWebsiteAuditEvent(pool, {
      organizationId: orgA.id,
      actorUserId: users.hqA.user.id,
      actionType: "draft_saved",
      pageKey: "home",
      before: { heading: "Old", password: "secret", csrf_token: "x" },
      after: { heading: "New", prayer_request: "private" },
      metadata: { token: "nope", field_keys: ["heading"] },
    });
    assert.equal(event.before.password, undefined);
    assert.equal(event.before.csrf_token, undefined);
    assert.equal(event.after.prayer_request, undefined);
    assert.equal(event.metadata.token, undefined);
    assert.ok(event.after.heading === "New" || event.before.heading === "Old");
  });

  it("user content is escaped on audit pages", async () => {
    skipIfNeeded();
    await auditSvc.recordWebsiteAuditEvent(pool, {
      organizationId: orgA.id,
      actorUserId: users.hqA.user.id,
      actionType: "draft_saved",
      pageKey: "about",
      after: { heading: '<script>alert("x")</script>' },
    });
    const res = await request(app)
      .get("/hq/website/audit-log?page=about")
      .set("Host", HOST_A)
      .set("Cookie", sidCookie(users.hqA.rawToken));
    assert.equal(res.status, 200);
    assert.doesNotMatch(res.text, /<script>alert\("x"\)<\/script>/);
  });
});
