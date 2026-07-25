"use strict";

/**
 * Phase3 Website Version Compare + Restore.
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
const publicContentRepo = require("../src/blessboard/repositories/publicContentRepository");
const versionRepo = require("../src/blessboard/repositories/websitePublicationVersionRepository");
const versionSvc = require("../src/blessboard/services/websitePublicationVersionService");

const IDENTITY_KEY = "blessboard-platform-v5";
const PASSWORD = "TestPassword99!";
const HOST_A = "wvc-a.blessboard.org";
const HOST_B = "wvc-b.blessboard.org";

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

describe("phase3 website version compare restore", () => {
  let pool;
  let skipSuite = false;
  let skipReason = "";
  let app;
  let orgA;
  let orgB;
  let churchA;
  let users = {};
  let versionOlder;
  let versionCurrent;

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
          displayName: `WVC ${key}`,
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
          displayName: `WVC Church ${key}`,
          dataEnvironment: "testing",
          hqBranchKey: "hq",
          hqBranchDisplayName: "HQ",
        });
        assert.equal(ch.ok, true, ch.message);
        store.org = prov.records.organization;
        store.church = ch.records.church;
        await ensureChurchSettingsInitialized(pool, store.church.id);
        await updateChurchSettings(pool, store.church.id, {
          publicName: `WVC Church ${key}`,
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
      await provision("wvc-a", HOST_A, a);
      await provision("wvc-b", HOST_B, b);
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
        "wvc-hq-a@example.test",
        "HQ A",
        {
          email: "wvc-hq-a@example.test",
          organizationKey: "wvc-a",
          roleKey: "church_hq_admin",
          churchKey: "wvc-a",
        },
        orgA.id
      );
      users.branchA = await makeUser(
        "wvc-br-a@example.test",
        "Branch A",
        {
          email: "wvc-br-a@example.test",
          organizationKey: "wvc-a",
          roleKey: "branch_admin",
          churchKey: "wvc-a",
          branchKey: "hq",
        },
        orgA.id
      );
      users.hqB = await makeUser(
        "wvc-hq-b@example.test",
        "HQ B",
        {
          email: "wvc-hq-b@example.test",
          organizationKey: "wvc-b",
          roleKey: "church_hq_admin",
          churchKey: "wvc-b",
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

      const about = await publicContentRepo.findPageByScope(pool, {
        churchId: churchA.id,
        branchId: null,
        pageKey: "about",
      });
      assert.ok(about);
      await publicContentRepo.updatePage(pool, about.id, {
        title: 'About <script>alert("x")</script>',
        status: "draft",
      });
      let hero = await publicContentRepo.findSectionByPageAndKey(pool, about.id, "hero");
      if (!hero) {
        hero = await publicContentRepo.insertSection(pool, {
          pageId: about.id,
          sectionKey: "hero",
          sectionType: "text",
          heading: "Original heading",
          bodyText: "Original body",
          sortOrder: 1,
          status: "draft",
        });
      } else {
        await publicContentRepo.updateSection(pool, hero.id, {
          heading: "Original heading",
          bodyText: "Original body",
          sortOrder: 1,
          status: "draft",
        });
      }
      await publicContentRepo.insertSection(pool, {
        pageId: about.id,
        sectionKey: "extra-removed-later",
        sectionType: "text",
        heading: "Will be removed",
        bodyText: "gone",
        sortOrder: 2,
        status: "draft",
      });

      const second = await publishChurchWebsite(pool, {
        churchId: churchA.id,
        actorUserId: users.hqA.user.id,
        confirmPublish: true,
        deferServiceTimes: true,
        env: baseEnv(),
      });
      assert.equal(second.ok, true, second.reason);

      await publicContentRepo.updatePage(pool, about.id, {
        title: "About updated",
        status: "draft",
      });
      const hero2 = await publicContentRepo.findSectionByPageAndKey(pool, about.id, "hero");
      await publicContentRepo.updateSection(pool, hero2.id, {
        heading: "Changed heading",
        bodyText: "Changed body",
        sortOrder: 5,
        status: "archived",
        mediaUrl: "https://cdn.example.test/new.jpg",
      });
      const removable = await publicContentRepo.findSectionByPageAndKey(
        pool,
        about.id,
        "extra-removed-later"
      );
      if (removable) {
        await publicContentRepo.updateSection(pool, removable.id, {
          status: "archived",
        });
      }
      await publicContentRepo.insertSection(pool, {
        pageId: about.id,
        sectionKey: "brand-new",
        sectionType: "text",
        heading: "Brand new section",
        bodyText: "Added later",
        sortOrder: 1,
        status: "draft",
      });

      const third = await publishChurchWebsite(pool, {
        churchId: churchA.id,
        actorUserId: users.hqA.user.id,
        confirmPublish: true,
        deferServiceTimes: true,
        env: baseEnv(),
      });
      assert.equal(third.ok, true, third.reason);

      const list = await versionRepo.listVersions(pool, { organizationId: orgA.id });
      versionCurrent = list.items.find((v) => v.status === "published");
      versionOlder = list.items
        .filter((v) => v.status === "superseded")
        .sort((x, y) => x.versionNumber - y.versionNumber)[0];
      assert.ok(versionCurrent);
      assert.ok(versionOlder);

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

  it("HQ admin can compare two organization versions", async () => {
    skipIfNeeded();
    const { res } = await authedGet(
      HOST_A,
      `/hq/website/version-history/compare?baseVersionId=${versionOlder.id}&compareVersionId=${versionCurrent.id}`,
      users.hqA.rawToken
    );
    assert.equal(res.status, 200);
    assert.match(res.text, /Compare Website Versions/);
    assert.match(res.text, /data-bb-phase3-compare-website-versions="1"/);
    assert.match(res.text, /Version A/);
    assert.match(res.text, /Version B/);
  });

  it("cross-organization version comparison returns 404", async () => {
    skipIfNeeded();
    const { res } = await authedGet(
      HOST_B,
      `/hq/website/version-history/compare?baseVersionId=${versionOlder.id}&compareVersionId=${versionCurrent.id}`,
      users.hqB.rawToken
    );
    assert.equal(res.status, 404);
  });

  it("version pair from different organizations is rejected", async () => {
    skipIfNeeded();
    const pair = await versionRepo.loadVersionPair(
      pool,
      orgB.id,
      versionOlder.id,
      versionCurrent.id
    );
    assert.equal(pair.a, null);
    assert.equal(pair.b, null);
  });

  it("text changes and section diffs are represented", async () => {
    skipIfNeeded();
    const result = await versionSvc.compareVersions(pool, {
      organizationId: orgA.id,
      baseVersionId: versionOlder.id,
      compareVersionId: versionCurrent.id,
    });
    assert.equal(result.ok, true);
    const types = new Set(result.diff.changes.map((c) => c.diffType));
    assert.ok(types.has("modified") || types.has("added") || types.has("removed"));
    const textHits = result.diff.changes.filter((c) => c.category === "text");
    assert.ok(textHits.length >= 1);
    const hasAdded = result.diff.changes.some((c) => c.diffType === "added");
    const hasMoved = result.diff.changes.some((c) => c.diffType === "moved");
    const hasHidden = result.diff.changes.some((c) => c.diffType === "hidden");
    assert.ok(hasAdded || hasMoved || hasHidden || types.has("removed"));
  });

  it("user content is escaped on compare page", async () => {
    skipIfNeeded();
    const { res } = await authedGet(
      HOST_A,
      `/hq/website/version-history/compare?baseVersionId=${versionOlder.id}&compareVersionId=${versionCurrent.id}&page=about`,
      users.hqA.rawToken
    );
    assert.equal(res.status, 200);
    assert.doesNotMatch(res.text, /<script>alert\("x"\)<\/script>/);
  });

  it("historical preview is read-only and org-scoped", async () => {
    skipIfNeeded();
    const { res } = await authedGet(
      HOST_A,
      `/hq/website/version-history/${versionOlder.id}/preview`,
      users.hqA.rawToken
    );
    assert.equal(res.status, 200);
    assert.match(res.text, /Historical Version Preview/);
    assert.match(res.text, /Read-only/);
    assert.equal(res.headers["x-robots-tag"], "noindex, nofollow");
    assert.doesNotMatch(res.text, /prayer/i);
    assert.doesNotMatch(res.text, /password/i);

    const cross = await authedGet(
      HOST_B,
      `/hq/website/version-history/${versionOlder.id}/preview`,
      users.hqB.rawToken
    );
    assert.equal(cross.res.status, 404);
  });

  it("restore page loads", async () => {
    skipIfNeeded();
    const { res } = await authedGet(
      HOST_A,
      `/hq/website/version-history/${versionOlder.id}/restore`,
      users.hqA.rawToken
    );
    assert.equal(res.status, 200);
    assert.match(res.text, /Restore Website Version/);
    assert.match(res.text, /restoration_reason/);
    assert.match(res.text, /confirm_restore/);
  });

  it("restore requires CSRF", async () => {
    skipIfNeeded();
    const res = await request(app)
      .post(`/hq/website/version-history/${versionOlder.id}/restore`)
      .set("Host", HOST_A)
      .set("Cookie", sidCookie(users.hqA.rawToken))
      .type("form")
      .send({
        restoration_reason: "Need older content",
        confirm_restore: "1",
        restore_all: "1",
      });
    assert.equal(res.status, 403);
  });

  it("restore requires reason and creates draft only", async () => {
    skipIfNeeded();
    const { res: formRes, csrf, csrfCookie } = await authedGet(
      HOST_A,
      `/hq/website/version-history/${versionOlder.id}/restore`,
      users.hqA.rawToken
    );
    assert.equal(formRes.status, 200);
    assert.ok(csrf);

    const missingReason = await request(app)
      .post(`/hq/website/version-history/${versionOlder.id}/restore`)
      .set("Host", HOST_A)
      .set("Cookie", `${sidCookie(users.hqA.rawToken)}; ${CSRF_COOKIE}=${csrfCookie}`)
      .type("form")
      .send({
        [CSRF_FIELD]: csrf,
        confirm_restore: "1",
        restore_all: "1",
        restoration_reason: "",
      });
    assert.equal(missingReason.status, 303);
    assert.match(String(missingReason.headers.location || ""), /error=/);

    const beforeLive = await versionRepo.getCurrentPublishedVersion(pool, orgA.id);
    const snapshotBefore = JSON.stringify(versionOlder.snapshot);

    const { res: formRes2, csrf: csrf2, csrfCookie: csrfCookie2 } = await authedGet(
      HOST_A,
      `/hq/website/version-history/${versionOlder.id}/restore`,
      users.hqA.rawToken
    );
    assert.equal(formRes2.status, 200);

    const ok = await request(app)
      .post(`/hq/website/version-history/${versionOlder.id}/restore`)
      .set("Host", HOST_A)
      .set("Cookie", `${sidCookie(users.hqA.rawToken)}; ${CSRF_COOKIE}=${csrfCookie2}`)
      .type("form")
      .send({
        [CSRF_FIELD]: csrf2,
        confirm_restore: "1",
        pages: ["about", "home"],
        restoration_reason: "Rollback about page copy for Sunday service",
        restore_theme: "1",
      });
    assert.equal(ok.status, 200);
    assert.match(ok.text, /restored draft has been created/i);
    assert.match(ok.text, /data-bb-phase3-restore-success="1"/);

    const afterLive = await versionRepo.getCurrentPublishedVersion(pool, orgA.id);
    assert.equal(afterLive.id, beforeLive.id);
    assert.equal(afterLive.status, "published");

    const drafts = await versionRepo.listVersions(pool, {
      organizationId: orgA.id,
      status: "draft",
    });
    assert.ok(drafts.items.some((d) => d.sourceType === "content_restoration"));

    const historical = await versionRepo.getVersionByOrgAndId(
      pool,
      orgA.id,
      versionOlder.id
    );
    assert.equal(JSON.stringify(historical.snapshot), snapshotBefore);
  });

  it("restore supports selected pages", async () => {
    skipIfNeeded();
    const prepared = await versionSvc.prepareVersionRestore(pool, {
      organizationId: orgA.id,
      versionId: versionOlder.id,
    });
    assert.equal(prepared.ok, true);
    assert.ok(prepared.pageOptions.length >= 1);

    const result = await versionSvc.createRestoredDraft(pool, {
      organizationId: orgA.id,
      churchId: churchA.id,
      versionId: versionOlder.id,
      actorUserId: users.hqA.user.id,
      restorationReason: "Restore only home page",
      selectedPageKeys: ["home"],
      confirmed: true,
      restoreTheme: true,
    });
    assert.equal(result.ok, true, result.reason + (result.detail ? `:${result.detail}` : ""));
    assert.deepEqual(result.restoredPageKeys, ["home"]);
  });

  it("unauthorized users are blocked", async () => {
    skipIfNeeded();
    const anon = await request(app)
      .get(
        `/hq/website/version-history/compare?baseVersionId=${versionOlder.id}&compareVersionId=${versionCurrent.id}`
      )
      .set("Host", HOST_A)
      .set("Accept", "text/html");
    assert.ok(anon.status === 303 || anon.status === 401);

    const branch = await request(app)
      .get(`/hq/website/version-history/${versionOlder.id}/restore`)
      .set("Host", HOST_A)
      .set("Cookie", sidCookie(users.branchA.rawToken));
    assert.equal(branch.status, 403);
  });
});
