"use strict";

/**
 * Phase3 Website Version History.
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
const { assignOrganizationPlan } = require("../src/platform/services/entitlementService");
const { DEFAULT_V5_COOKIE } = require("../src/platform/session/v5SessionCookie");
const { CSRF_COOKIE, CSRF_FIELD } = require("../src/platform/http/v5Csrf");
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
const HOST_A = "wvh-a.blessboard.org";
const HOST_B = "wvh-b.blessboard.org";

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
    new RegExp(
      `name="${CSRF_FIELD}"[^>]*value="([^"]+)"|value="([^"]+)"[^>]*name="${CSRF_FIELD}"`
    )
  );
  return (m && (m[1] || m[2])) || null;
}

function sidCookie(rawToken) {
  return `${DEFAULT_V5_COOKIE}=${rawToken}`;
}

describe("phase3 website version history", () => {
  let pool;
  let skipSuite = false;
  let skipReason = "";
  let app;
  let orgA;
  let orgB;
  let churchA;
  let users = {};

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
          displayName: `WVH ${key}`,
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
          displayName: `WVH Church ${key}`,
          dataEnvironment: "testing",
          hqBranchKey: "hq",
          hqBranchDisplayName: "HQ",
        });
        assert.equal(ch.ok, true, ch.message);
        store.org = prov.records.organization;
        store.church = ch.records.church;
        await ensureChurchSettingsInitialized(pool, store.church.id);
        await updateChurchSettings(pool, store.church.id, {
          publicName: `WVH Church ${key}`,
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
      await provision("wvh-a", HOST_A, a);
      await provision("wvh-b", HOST_B, b);
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
        "wvh-hq-a@example.test",
        "HQ A",
        {
          email: "wvh-hq-a@example.test",
          organizationKey: "wvh-a",
          roleKey: "church_hq_admin",
          churchKey: "wvh-a",
        },
        orgA.id
      );
      users.branchA = await makeUser(
        "wvh-br-a@example.test",
        "Branch A",
        {
          email: "wvh-br-a@example.test",
          organizationKey: "wvh-a",
          roleKey: "branch_admin",
          churchKey: "wvh-a",
          branchKey: "hq",
        },
        orgA.id
      );
      users.hqB = await makeUser(
        "wvh-hq-b@example.test",
        "HQ B",
        {
          email: "wvh-hq-b@example.test",
          organizationKey: "wvh-b",
          roleKey: "church_hq_admin",
          churchKey: "wvh-b",
        },
        orgB.id
      );

      const planAssign = await assignOrganizationPlan(pool, {
        organizationId: orgA.id,
        planKey: "professional",
        status: "active",
      });
      assert.equal(planAssign.ok, true, planAssign.reason);

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

  async function authedGet(host, path, rawToken) {
    const res = await request(app)
      .get(path)
      .set("Host", host)
      .set("Cookie", sidCookie(rawToken));
    return {
      res,
      csrf: extractCsrfToken(res.text),
      csrfCookie: extractCookie(res, CSRF_COOKIE),
    };
  }

  it("empty history state renders safely", async () => {
    skipIfNeeded();
    const { res } = await authedGet(
      HOST_A,
      "/hq/website/version-history",
      users.hqA.rawToken
    );
    assert.equal(res.status, 200);
    assert.match(res.text, /Website Version History/);
    assert.match(res.text, /data-bb-phase3-website-version-history="1"/);
    assert.match(res.text, /No publication versions are recorded yet/);
  });

  it("unauthorized users are blocked", async () => {
    skipIfNeeded();
    const anon = await request(app)
      .get("/hq/website/version-history")
      .set("Host", HOST_A)
      .set("Accept", "text/html");
    assert.ok(anon.status === 303 || anon.status === 401);

    const branch = await request(app)
      .get("/hq/website/version-history")
      .set("Host", HOST_A)
      .set("Cookie", sidCookie(users.branchA.rawToken));
    assert.equal(branch.status, 403);
  });

  it("publication creates a version and supersedes previous", async () => {
    skipIfNeeded();

    const first = await publishChurchWebsite(pool, {
      churchId: churchA.id,
      actorUserId: users.hqA.user.id,
      confirmPublish: true,
      deferServiceTimes: true,
      env: baseEnv(),
    });
    assert.equal(first.ok, true, first.reason || JSON.stringify(first.gaps || []));
    assert.ok(first.publicationVersionNumber >= 1);

    const current1 = await versionRepo.getCurrentPublishedVersion(pool, orgA.id);
    assert.ok(current1);
    assert.equal(current1.status, "published");
    assert.equal(current1.versionNumber, first.publicationVersionNumber);
    assert.ok(current1.snapshot);
    assert.ok(Array.isArray(current1.snapshot.pages) || Array.isArray(current1.snapshot.pageKeys));
    // Snapshot must not include private management blobs
    assert.equal(current1.snapshot.sessions, undefined);
    assert.equal(current1.snapshot.csrf, undefined);
    assert.equal(current1.snapshot.prayerRequests, undefined);

    // Force a draft delta so the second publish is not treated as a rapid no-op.
    const publicContentRepo = require("../src/blessboard/repositories/publicContentRepository");
    const home = await publicContentRepo.findPageByScope(pool, {
      churchId: churchA.id,
      branchId: null,
      pageKey: "home",
    });
    if (home && home.id) {
      await publicContentRepo.updatePage(pool, home.id, {
        title: `Home ${Date.now()}`,
        status: "draft",
      });
    }

    const second = await publishChurchWebsite(pool, {
      churchId: churchA.id,
      actorUserId: users.hqA.user.id,
      confirmPublish: true,
      deferServiceTimes: true,
      env: baseEnv(),
    });
    assert.equal(second.ok, true, second.reason);
    assert.ok(second.publicationVersionNumber > first.publicationVersionNumber);

    const current2 = await versionRepo.getCurrentPublishedVersion(pool, orgA.id);
    assert.equal(current2.versionNumber, second.publicationVersionNumber);

    const list = await versionRepo.listVersions(pool, { organizationId: orgA.id });
    const superseded = list.items.filter((v) => v.status === "superseded");
    assert.ok(superseded.length >= 1);
    assert.equal(list.items.filter((v) => v.status === "published").length, 1);
  });

  it("HQ administrator can open version history with current marked", async () => {
    skipIfNeeded();
    const { res } = await authedGet(
      HOST_A,
      "/hq/website/version-history",
      users.hqA.rawToken
    );
    assert.equal(res.status, 200);
    assert.match(res.text, /Current live: v/);
    assert.match(res.text, /bb-hq-phase3-wvh__row--current|Current/);
    assert.match(res.text, /data-bb-phase3-wvh-desktop="1"/);
    assert.match(res.text, /data-bb-phase3-wvh-mobile="1"/);
  });

  it("filters work where implemented", async () => {
    skipIfNeeded();
    const { res } = await authedGet(
      HOST_A,
      "/hq/website/version-history?status=published",
      users.hqA.rawToken
    );
    assert.equal(res.status, 200);
    assert.match(res.text, /Published/);
    // Superseded rows are excluded by the status filter.
    assert.doesNotMatch(res.text, /bb-hq-chip--muted">Superseded/);
  });

  it("Organization A cannot access Organization B versions", async () => {
    skipIfNeeded();
    const aList = await versionRepo.listVersions(pool, { organizationId: orgA.id });
    assert.ok(aList.items.length > 0);
    const versionId = aList.items[0].id;

    const cross = await versionRepo.getVersionByOrgAndId(pool, orgB.id, versionId);
    assert.equal(cross, null);

    const { res } = await authedGet(
      HOST_B,
      "/hq/website/version-history",
      users.hqB.rawToken
    );
    assert.equal(res.status, 200);
    assert.doesNotMatch(res.text, new RegExp(`v${aList.items[0].versionNumber}`));
  });

  it("failed publication does not create a false published version", async () => {
    skipIfNeeded();
    const before = await versionRepo.listVersions(pool, { organizationId: orgA.id });
    const failed = await publishChurchWebsite(pool, {
      churchId: churchA.id,
      actorUserId: users.hqA.user.id,
      confirmPublish: false,
      deferServiceTimes: true,
      env: baseEnv(),
    });
    assert.equal(failed.ok, false);
    const after = await versionRepo.listVersions(pool, { organizationId: orgA.id });
    assert.equal(after.total, before.total);
  });

  it("source submission link is organization-scoped", async () => {
    skipIfNeeded();
    const detail = await versionSvc.loadVersionDetail(pool, {
      organizationId: orgA.id,
      versionId: "00000000-0000-4000-8000-000000000099",
    });
    assert.equal(detail.ok, false);
    assert.equal(detail.status, versionSvc.STATUS.NOT_FOUND);
  });
});
