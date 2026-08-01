"use strict";

/**
 * Phase3 Website Publishing History.
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
const versionRepo = require("../src/blessboard/repositories/websitePublicationVersionRepository");
const versionSvc = require("../src/blessboard/services/websitePublicationVersionService");

const IDENTITY_KEY = "blessboard-platform-v5";
const PASSWORD = "TestPassword99!";
const HOST_A = "wph-a.blessboard.org";
const HOST_B = "wph-b.blessboard.org";

function baseEnv(overrides) {
  return {
    NODE_ENV: "test",
    PLATFORM_DEPLOYMENT_CODE: "blessboard-org-staging",
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

describe("phase3 website publishing history", () => {
  let pool;
  let skipSuite = false;
  let skipReason = "";
  let app;
  let orgA;
  let orgB;
  let churchA;
  let users = {};
  let versions = [];

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
          displayName: `WPH ${key}`,
          legalName: null,
          dataEnvironment: "testing",
          productKey: "blessboard",
          productTenantKey: key,
          hostname: host,
          domainType: "canonical",
          deploymentCode: "blessboard-org-staging",
          isPrimary: true,
        });
        assert.equal(prov.ok, true, prov.message);
        const ch = await provisionBlessBoardChurch(pool, {
          organizationKey: key,
          churchKey: key,
          displayName: `WPH Church ${key}`,
          dataEnvironment: "testing",
          hqBranchKey: "hq",
          hqBranchDisplayName: "HQ",
        });
        assert.equal(ch.ok, true, ch.message);
        store.org = prov.records.organization;
        store.church = ch.records.church;
        await ensureChurchSettingsInitialized(pool, store.church.id);
        await updateChurchSettings(pool, store.church.id, {
          publicName: `WPH Church ${key}`,
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
      await provision("wph-a", HOST_A, a);
      await provision("wph-b", HOST_B, b);
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
          deploymentCode: "blessboard-org-staging",
          userId: created.user.id,
          organizationId: orgId,
        });
        assert.equal(session.ok, true, session.message || session.code);
        return { user: created.user, rawToken: session.rawToken };
      }

      users.hqA = await makeUser(
        "wph-hq-a@example.test",
        "HQ A",
        {
          email: "wph-hq-a@example.test",
          organizationKey: "wph-a",
          roleKey: "church_hq_admin",
          churchKey: "wph-a",
        },
        orgA.id
      );
      users.branchA = await makeUser(
        "wph-br-a@example.test",
        "Branch A",
        {
          email: "wph-br-a@example.test",
          organizationKey: "wph-a",
          roleKey: "branch_admin",
          churchKey: "wph-a",
          branchKey: "hq",
        },
        orgA.id
      );
      users.hqB = await makeUser(
        "wph-hq-b@example.test",
        "HQ B",
        {
          email: "wph-hq-b@example.test",
          organizationKey: "wph-b",
          roleKey: "church_hq_admin",
          churchKey: "wph-b",
        },
        orgB.id
      );

      const first = await publishChurchWebsite(pool, {
        churchId: churchA.id,
        actorUserId: users.hqA.user.id,
        confirmPublish: true,
        deferServiceTimes: true,
        env: baseEnv(),
      });
      assert.equal(first.ok, true, first.reason || JSON.stringify(first.gaps || []));

      // Seed a second publication record without relying on rapid republish idempotency.
      await versionRepo.supersedePublishedVersions(pool, orgA.id);
      await versionRepo.insertPublishedVersion(pool, {
        organizationId: orgA.id,
        churchId: churchA.id,
        versionNumber: 2,
        themeKey: "default",
        sourceType: "hq_edit",
        publishedBy: users.hqA.user.id,
        snapshot: { pages: [], pageKeys: ["home"] },
        changeSummary: { pagesChanged: ["home"], publicationNote: "Second publish fixture" },
      });

      const list = await versionRepo.listVersions(pool, { organizationId: orgA.id });
      versions = list.items.filter((v) => v.publishedAt);
      assert.ok(versions.length >= 2);

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

  it("publishing history lists real publication events", async () => {
    skipIfNeeded();
    const result = await versionSvc.listPublishingHistory(pool, {
      organizationId: orgA.id,
    });
    assert.equal(result.ok, true);
    assert.ok(result.items.length >= 2);
    assert.ok(result.items.every((e) => e.eventType && e.version && e.version.publishedAt));
  });

  it("HQ can open publishing history with current marked", async () => {
    skipIfNeeded();
    const res = await request(app)
      .get("/hq/website/publishing-history")
      .set("Host", HOST_A)
      .set("Cookie", sidCookie(users.hqA.rawToken));
    assert.equal(res.status, 200);
    assert.match(res.text, /Website Publishing History/);
    assert.match(res.text, /data-bb-phase3-website-publishing-history="1"/);
    assert.match(res.text, /Current live: v/);
    assert.match(res.text, /bb-hq-phase3-pubhist__row--current|Current/);
    assert.match(res.text, /data-bb-phase3-pubhist-mobile="1"/);
  });

  it("compare-with-previous links are organization-scoped", async () => {
    skipIfNeeded();
    const result = await versionSvc.listPublishingHistory(pool, {
      organizationId: orgA.id,
    });
    const withPrev = result.items.find((e) => e.previousVersion);
    assert.ok(withPrev);
    const res = await request(app)
      .get("/hq/website/publishing-history")
      .set("Host", HOST_A)
      .set("Cookie", sidCookie(users.hqA.rawToken));
    assert.equal(res.status, 200);
    assert.match(
      res.text,
      new RegExp(
        `/hq/website/version-history/compare\\?baseVersionId=${withPrev.previousVersion.id}&amp;compareVersionId=${withPrev.version.id}`
      )
    );

    const cross = await versionRepo.getVersionByOrgAndId(
      pool,
      orgB.id,
      withPrev.version.id
    );
    assert.equal(cross, null);
  });

  it("unauthorized users are blocked", async () => {
    skipIfNeeded();
    const anon = await request(app)
      .get("/hq/website/publishing-history")
      .set("Host", HOST_A)
      .set("Accept", "text/html");
    assert.ok(anon.status === 303 || anon.status === 401);

    const branch = await request(app)
      .get("/hq/website/publishing-history")
      .set("Host", HOST_A)
      .set("Cookie", sidCookie(users.branchA.rawToken));
    assert.equal(branch.status, 403);
  });

  it("empty state message is available when no publications", async () => {
    skipIfNeeded();
    const empty = await versionSvc.listPublishingHistory(pool, {
      organizationId: orgB.id,
    });
    assert.equal(empty.ok, true);
    assert.equal(empty.items.length, 0);

    const res = await request(app)
      .get("/hq/website/publishing-history")
      .set("Host", HOST_B)
      .set("Cookie", sidCookie(users.hqB.rawToken));
    assert.equal(res.status, 200);
    assert.match(res.text, /No website publications have been recorded yet/);
  });
});
