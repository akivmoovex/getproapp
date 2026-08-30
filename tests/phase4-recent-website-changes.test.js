"use strict";

/**
 * Phase4 Stage 3A — Growth Recent Website Changes + Previous Preview.
 */

const { describe, it, before, after } = require("node:test");
const assert = require("node:assert/strict");
const request = require("supertest");

const {
  resetFoundationDatabase,
  createFoundationPool,
} = require("./helpers/foundationDb");
const {
  V5_IDENTITY_KEY: IDENTITY_KEY,
  DEFAULT_V5_COOKIE,
  baseV5TestEnv,
} = require("./helpers/blessboardV5Fixtures");
const { migrate } = require("../db/scripts/lib/migrator");
const { ensureDatabaseIdentity } = require("../db/scripts/lib/databaseIdentity");
const { provisionPlatformTenant } = require("../src/platform/services/provisionPlatformTenant");
const { provisionBlessBoardChurch } = require("../src/blessboard/services/provisionBlessBoardChurch");
const { createBlessBoardUser } = require("../src/blessboard/services/createBlessBoardUser");
const { assignBlessBoardRole } = require("../src/blessboard/services/assignBlessBoardRole");
const { createV5Session } = require("../src/platform/session/createV5Session");
const { createV5FoundationApp } = require("../src/platform/http/v5FoundationServer");
const { assignOrganizationPlan } = require("../src/platform/services/entitlementService");
const {
  ensureChurchSettingsInitialized,
  updateChurchSettings,
} = require("../src/blessboard/services/blessBoardSettingsService");
const {
  repairWebsiteFoundation,
} = require("../src/blessboard/services/websiteFoundationRepairService");
const {
  acknowledgeWebsitePreview,
} = require("../src/blessboard/services/churchWebsitePublishService");
const {
  loadGrowthWebsiteOverview,
} = require("../src/blessboard/services/websiteOverviewService");
const {
  loadGrowthRecentWebsiteChanges,
  loadGrowthPreviousWebsitePreview,
  GROWTH_PREVIOUS_LIMIT,
} = require("../src/blessboard/services/websitePublicationVersionService");
const versionRepo = require("../src/blessboard/repositories/websitePublicationVersionRepository");

const PASSWORD = "TestPassword99!";
const HOST_A = "p4rc-a.blessboard.org";
const HOST_B = "p4rc-b.blessboard.org";
const ORG_KEY_A = "p4rc-a";

const FORBIDDEN_TECHNICAL_TERMS = [
  "Version snapshot",
  "Rollback",
  "Superseded",
  "Diff",
  "Commit",
  "Publication artifact",
  "Immutable version",
];

function baseEnv(overrides) {
  return baseV5TestEnv(overrides);
}

function sidCookie(rawToken) {
  return `${DEFAULT_V5_COOKIE}=${rawToken}`;
}

function assertNoForbiddenTechnicalTerms(html, label) {
  for (const term of FORBIDDEN_TECHNICAL_TERMS) {
    assert.doesNotMatch(
      html,
      new RegExp(term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i"),
      `${label || "page"} should not contain "${term}"`
    );
  }
}

describe("phase4 recent website changes", () => {
  let pool;
  let skipSuite = false;
  let skipReason = "";
  let app;
  let orgA;
  let orgB;
  let churchA;
  let churchB;
  let branchB;
  let users = {};
  let publicationIds = {};

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

      async function provisionOrg(key, host, store) {
        const prov = await provisionPlatformTenant(pool, {
          organizationKey: key,
          displayName: `P4RC ${key}`,
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
          displayName: `P4RC Church ${key}`,
          dataEnvironment: "testing",
          hqBranchKey: "hq",
          hqBranchDisplayName: "HQ",
        });
        assert.equal(ch.ok, true, ch.message);
        store.org = prov.records.organization;
        store.church = ch.records.church;
        store.branch = ch.records.hqBranch;
        await ensureChurchSettingsInitialized(pool, store.church.id);
        await updateChurchSettings(pool, store.church.id, {
          publicName: `P4RC Church ${key}`,
          websiteStatus: "draft",
          primaryEmail: `${key}@example.test`,
        });
        await repairWebsiteFoundation(pool, { churchId: store.church.id });
        await acknowledgeWebsitePreview(pool, {
          organizationId: store.org.id,
          actorUserId: null,
        });
      }

      const a = {};
      const b = {};
      await provisionOrg("p4rc-a", HOST_A, a);
      await provisionOrg("p4rc-b", HOST_B, b);
      orgA = a.org;
      orgB = b.org;
      churchA = a.church;
      churchB = b.church;
      branchB = b.branch;

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
        "p4rc-hq-a@example.test",
        "HQ Admin A",
        {
          email: "p4rc-hq-a@example.test",
          organizationKey: "p4rc-a",
          roleKey: "church_hq_admin",
          churchKey: "p4rc-a",
        },
        orgA.id
      );
      users.hqB = await makeUser(
        "p4rc-hq-b@example.test",
        "HQ Admin B",
        {
          email: "p4rc-hq-b@example.test",
          organizationKey: "p4rc-b",
          roleKey: "church_hq_admin",
          churchKey: "p4rc-b",
        },
        orgB.id
      );
      users.branchA = await makeUser(
        "p4rc-br-a@example.test",
        "Branch A",
        {
          email: "p4rc-br-a@example.test",
          organizationKey: "p4rc-a",
          roleKey: "branch_admin",
          churchKey: "p4rc-a",
          branchKey: "hq",
        },
        orgA.id
      );
      users.branchB = await makeUser(
        "p4rc-br-b@example.test",
        "Branch B",
        {
          email: "p4rc-br-b@example.test",
          organizationKey: "p4rc-b",
          roleKey: "branch_admin",
          churchKey: "p4rc-b",
          branchKey: "hq",
        },
        orgB.id
      );

      const growthAssign = await assignOrganizationPlan(pool, {
        organizationId: orgA.id,
        planKey: "growth",
        status: "active",
      });
      assert.equal(growthAssign.ok, true, growthAssign.reason);

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
    return request(app)
      .get(path)
      .set("Host", host)
      .set("Cookie", sidCookie(rawToken));
  }

  async function clearOrgPublications(organizationId) {
    await pool.query(
      `DELETE FROM blessboard.website_publication_versions WHERE organization_id = $1`,
      [organizationId]
    );
  }

  async function insertPublication(opts) {
    const versionNumber =
      opts.versionNumber ||
      (await versionRepo.getNextVersionNumber(pool, opts.organizationId));
    if (opts.supersedeFirst) {
      await versionRepo.supersedePublishedVersions(pool, opts.organizationId);
    }
    return versionRepo.insertPublishedVersion(pool, {
      organizationId: opts.organizationId,
      churchId: opts.churchId,
      versionNumber,
      themeKey: opts.themeKey || "default",
      sourceType: opts.sourceType || "hq_edit",
      publishedBy: opts.publishedBy || users.hqA.user.id,
      publishedAt: opts.publishedAt || new Date().toISOString(),
      snapshot: opts.snapshot || { pages: [] },
      changeSummary: opts.changeSummary || { pagesChanged: ["home"] },
    });
  }

  async function seedPublicationTimeline(organizationId, churchId, count, notePrefix) {
    const versions = [];
    for (let i = 0; i < count; i += 1) {
      const publishedAt = new Date(Date.UTC(2026, 0, 10 + i, 15, i, 0)).toISOString();
      if (i > 0) {
        await versionRepo.supersedePublishedVersions(pool, organizationId);
      }
      const v = await insertPublication({
        organizationId,
        churchId,
        publishedBy: users.hqA.user.id,
        publishedAt,
        changeSummary: {
          publicationNote: `${notePrefix || "Timeline"} update ${count - i}`,
          pagesChanged: ["home"],
        },
        snapshot: {
          pages: [
            {
              pageKey: "home",
              title: "Home",
              sections: [{ sectionKey: "hero", heading: `${notePrefix || "Timeline"} ${count - i}` }],
            },
          ],
        },
      });
      versions.push(v);
    }
    return versions;
  }

  async function publicPageCounts(churchId) {
    const res = await pool.query(
      `SELECT status, COUNT(*)::int AS n
         FROM blessboard.public_pages
        WHERE church_id = $1
        GROUP BY status
        ORDER BY status`,
      [churchId]
    );
    return res.rows;
  }

  it("foundation org B receives Growth locked screen on recent-changes", async () => {
    skipIfNeeded();
    const list = await authedGet(
      HOST_B,
      "/hq/website/recent-changes",
      users.hqB.rawToken
    );
    assert.equal(list.status, 200);
    assert.match(list.text, /data-bb-phase4-growth-website-feature-locked="1"|Growth Website Feature Locked|Growth Only/i);

    const preview = await authedGet(
      HOST_B,
      `/hq/website/recent-changes/${orgB.id}/preview`,
      users.hqB.rawToken
    );
    assert.ok(preview.status === 404 || preview.status === 200);
  });

  it("unauthorized users are blocked from recent-changes and preview", async () => {
    skipIfNeeded();
    const anon = await request(app)
      .get("/hq/website/recent-changes")
      .set("Host", HOST_A)
      .set("Accept", "text/html");
    assert.ok(anon.status === 303 || anon.status === 401);

    const branch = await request(app)
      .get("/hq/website/recent-changes")
      .set("Host", HOST_A)
      .set("Cookie", sidCookie(users.branchA.rawToken));
    assert.equal(branch.status, 403);

    const branchPreview = await request(app)
      .get(`/hq/website/recent-changes/${orgA.id}/preview`)
      .set("Host", HOST_A)
      .set("Cookie", sidCookie(users.branchA.rawToken));
    assert.equal(branchPreview.status, 403);
  });

  it("growth HQ opens recent-changes with stitch markers and responsive viewport", async () => {
    skipIfNeeded();
    await clearOrgPublications(orgA.id);
    await insertPublication({
      organizationId: orgA.id,
      churchId: churchA.id,
      changeSummary: { publicationNote: "Initial growth listing" },
    });

    const res = await authedGet(
      HOST_A,
      "/hq/website/recent-changes",
      users.hqA.rawToken
    );
    assert.equal(res.status, 200);
    assert.match(res.text, /data-bb-phase4-recent-website-changes-page="1"/);
    assert.match(res.text, /data-bb-stitch-screen="Phase4 - Recent Website Changes"/);
    assert.match(res.text, /data-bb-viewport="responsive"/);
    assert.match(res.text, /Recent Website Changes/);
  });

  it("empty previous state when only the current publication exists", async () => {
    skipIfNeeded();
    await clearOrgPublications(orgA.id);
    await insertPublication({
      organizationId: orgA.id,
      churchId: churchA.id,
      changeSummary: { publicationNote: "Only current website" },
    });

    const svc = await loadGrowthRecentWebsiteChanges(pool, {
      organizationId: orgA.id,
      churchId: churchA.id,
      organizationKey: ORG_KEY_A,
      env: baseEnv(),
    });
    assert.equal(svc.ok, true);
    assert.equal(svc.previousWebsites.length, 0);

    const res = await authedGet(
      HOST_A,
      "/hq/website/recent-changes",
      users.hqA.rawToken
    );
    assert.equal(res.status, 200);
    assert.match(res.text, /data-bb-phase4-recent-empty="1"/);
    assert.match(res.text, /No previous website changes are available yet/);
  });

  it("lists Current Website label, at most five previous entries, newest first", async () => {
    skipIfNeeded();
    await clearOrgPublications(orgA.id);
    const versions = await seedPublicationTimeline(orgA.id, churchA.id, 7, "Ordered");
    publicationIds.current = versions[versions.length - 1].id;
    publicationIds.previousNewest = versions[versions.length - 2].id;
    publicationIds.previousOldestShown = versions[1].id;

    const svc = await loadGrowthRecentWebsiteChanges(pool, {
      organizationId: orgA.id,
      churchId: churchA.id,
      organizationKey: ORG_KEY_A,
      env: baseEnv(),
    });
    assert.equal(svc.ok, true);
    assert.equal(svc.currentWebsite.label, "Current Website");
    assert.equal(svc.previousWebsites.length, GROWTH_PREVIOUS_LIMIT);
    assert.equal(svc.previousWebsites[0].changeSummary, "Ordered update 2");
    assert.equal(
      svc.previousWebsites[svc.previousWebsites.length - 1].changeSummary,
      "Ordered update 6"
    );

    const res = await authedGet(
      HOST_A,
      "/hq/website/recent-changes",
      users.hqA.rawToken
    );
    assert.equal(res.status, 200);
    assert.match(res.text, /Current Website/);
    const previousCards = res.text.match(/data-bb-phase4-recent-previous="1"/g) || [];
    assert.equal(previousCards.length, GROWTH_PREVIOUS_LIMIT);
    const firstPrevious = res.text.indexOf("Ordered update 2");
    const lastPrevious = res.text.indexOf("Ordered update 6");
    assert.ok(firstPrevious >= 0 && lastPrevious >= 0);
    assert.ok(firstPrevious < lastPrevious);
  });

  it("card titles avoid version numbers and forbidden primary technical labels", async () => {
    skipIfNeeded();
    const res = await authedGet(
      HOST_A,
      "/hq/website/recent-changes",
      users.hqA.rawToken
    );
    assert.equal(res.status, 200);

    const cardTitles = [...res.text.matchAll(/<h[23][^>]*>([^<]+)<\/h[23]>/g)].map(
      (m) => m[1]
    );
    for (const title of cardTitles) {
      assert.doesNotMatch(title, /\/v\d+/i, `card title should not look like /vN: ${title}`);
      assert.doesNotMatch(title, /Version \d+/i, `card title should not be Version N: ${title}`);
    }

    assert.doesNotMatch(res.text, />Superseded</i);
    assert.doesNotMatch(res.text, />Rollback</i);
    assert.doesNotMatch(res.text, />Diff</i);
    assert.doesNotMatch(
      res.text,
      new RegExp(publicationIds.current, "i"),
      "current publication id should not appear as a primary heading"
    );
  });

  it("shows human HQ source labels, publisher name, date, and empty-summary fallback", async () => {
    skipIfNeeded();
    await clearOrgPublications(orgA.id);
    await insertPublication({
      organizationId: orgA.id,
      churchId: churchA.id,
      sourceType: "hq_edit",
      changeSummary: { publicationNote: "HQ headline refresh" },
    });
    await versionRepo.supersedePublishedVersions(pool, orgA.id);
    const emptySummary = await insertPublication({
      organizationId: orgA.id,
      churchId: churchA.id,
      sourceType: "hq_edit",
      changeSummary: {},
    });
    publicationIds.emptySummary = emptySummary.id;
    await versionRepo.supersedePublishedVersions(pool, orgA.id);
    await insertPublication({
      organizationId: orgA.id,
      churchId: churchA.id,
      sourceType: "hq_edit",
      changeSummary: { publicationNote: "Latest HQ publish" },
    });

    const res = await authedGet(
      HOST_A,
      "/hq/website/recent-changes",
      users.hqA.rawToken
    );
    assert.equal(res.status, 200);
    assert.match(res.text, /HQ Update/);
    assert.match(res.text, /HQ Admin A/);
    assert.match(res.text, /Published on/i);
    assert.match(res.text, /Website changes were published\./);
  });

  it("forbidden technical terms are absent on the recent-changes list page", async () => {
    skipIfNeeded();
    const res = await authedGet(
      HOST_A,
      "/hq/website/recent-changes",
      users.hqA.rawToken
    );
    assert.equal(res.status, 200);
    assertNoForbiddenTechnicalTerms(res.text, "recent-changes list");
  });

  it("previous preview is read-only with stitch banner and robots noindex", async () => {
    skipIfNeeded();
    const list = await loadGrowthRecentWebsiteChanges(pool, {
      organizationId: orgA.id,
      churchId: churchA.id,
      organizationKey: ORG_KEY_A,
      env: baseEnv(),
    });
    assert.equal(list.ok, true);
    assert.ok(list.previousWebsites.length > 0, "expected at least one previous publication");
    const previousId = list.previousWebsites[0].id;

    const res = await authedGet(
      HOST_A,
      `/hq/website/recent-changes/${previousId}/preview`,
      users.hqA.rawToken
    );
    assert.equal(res.status, 200);
    assert.match(res.text, /data-bb-phase4-previous-website-preview="1"/);
    assert.match(res.text, /data-bb-stitch-screen="Phase4 - Previous Website Preview"/);
    assert.match(res.text, /Previous Website Preview/);
    assert.match(res.text, /This is a saved website from an earlier publication\./);
    assert.match(res.text, /Read-only saved website/);
    assert.doesNotMatch(res.text, /href="\/hq\/content"/);
    assert.doesNotMatch(res.text, />Save Changes</);
    assert.doesNotMatch(res.text, />Publish Website</);

    const robotsHeader = String(res.headers["x-robots-tag"] || "");
    const robotsMeta = /<meta name="robots" content="noindex, nofollow"/i.test(res.text);
    assert.ok(
      /noindex/i.test(robotsHeader) || robotsMeta,
      "preview should set X-Robots-Tag or robots noindex meta"
    );
  });

  it("preview renders immutable snapshot content not present on the live site", async () => {
    skipIfNeeded();
    await clearOrgPublications(orgA.id);
    const snapshotHeading = "P4RC Snapshot Only Heading 7f3a";
    const historical = await insertPublication({
      organizationId: orgA.id,
      churchId: churchA.id,
      changeSummary: { publicationNote: "Historical snapshot page" },
      snapshot: {
        pages: [
          {
            pageKey: "home",
            title: "Home",
            sections: [{ sectionKey: "hero", heading: snapshotHeading, bodyText: "Snapshot body copy" }],
          },
        ],
      },
    });
    await versionRepo.supersedePublishedVersions(pool, orgA.id);
    await insertPublication({
      organizationId: orgA.id,
      churchId: churchA.id,
      changeSummary: { publicationNote: "Current live website" },
      snapshot: { pages: [] },
    });
    publicationIds.snapshotHistorical = historical.id;

    const preview = await authedGet(
      HOST_A,
      `/hq/website/recent-changes/${historical.id}/preview`,
      users.hqA.rawToken
    );
    assert.equal(preview.status, 200);
    assert.match(preview.text, new RegExp(snapshotHeading));
    assert.match(preview.text, /Snapshot body copy/);

    const live = await request(app)
      .get(`/c/${ORG_KEY_A}`)
      .set("Host", HOST_A);
    assert.ok(live.status === 200 || live.status === 404);
    if (live.status === 200) {
      assert.doesNotMatch(live.text, new RegExp(snapshotHeading));
    }
  });

  it("preview GET does not mutate draft or live public_pages rows", async () => {
    skipIfNeeded();
    const before = await publicPageCounts(churchA.id);
    const previewId =
      publicationIds.snapshotHistorical || publicationIds.previousNewest || publicationIds.emptySummary;
    assert.ok(previewId, "expected a previewable publication id");

    const res = await authedGet(
      HOST_A,
      `/hq/website/recent-changes/${previewId}/preview`,
      users.hqA.rawToken
    );
    assert.equal(res.status, 200);

    const after = await publicPageCounts(churchA.id);
    assert.deepEqual(after, before);
  });

  it("cross-org preview requests return 404", async () => {
    skipIfNeeded();
    const orgBVersion = await insertPublication({
      organizationId: orgB.id,
      churchId: churchB.id,
      publishedBy: users.hqB.user.id,
      changeSummary: { publicationNote: "Org B only publication" },
    });

    const wrongHost = await authedGet(
      HOST_A,
      `/hq/website/recent-changes/${orgBVersion.id}/preview`,
      users.hqA.rawToken
    );
    assert.equal(wrongHost.status, 404);

    const wrongPublication = await authedGet(
      HOST_B,
      `/hq/website/recent-changes/${publicationIds.current}/preview`,
      users.hqB.rawToken
    );
    assert.equal(wrongPublication.status, 404);

    await clearOrgPublications(orgB.id);
  });

  it("preview of the current publication redirects with 303", async () => {
    skipIfNeeded();
    const current = await versionRepo.loadCurrentWebsitePublication(pool, orgA.id);
    assert.ok(current && current.id, "expected current publication");

    const res = await authedGet(
      HOST_A,
      `/hq/website/recent-changes/${current.id}/preview`,
      users.hqA.rawToken
    );
    assert.equal(res.status, 303);
    assert.ok(
      /\/hq\/website\/recent-changes|\/c\/p4rc-a/.test(String(res.headers.location || "")),
      "expected redirect to recent-changes or live site"
    );

    const svc = await loadGrowthPreviousWebsitePreview(pool, {
      organizationId: orgA.id,
      churchId: churchA.id,
      publicationId: current.id,
      organizationKey: ORG_KEY_A,
      env: baseEnv(),
    });
    assert.equal(svc.ok, false);
    assert.equal(svc.reason, "is_current");
  });

  it("escapes user-authored publication notes in recent-changes HTML", async () => {
    skipIfNeeded();
    const xssNote = '<script>alert("p4rc")</script>';
    await clearOrgPublications(orgA.id);
    await insertPublication({
      organizationId: orgA.id,
      churchId: churchA.id,
      changeSummary: { publicationNote: xssNote },
    });

    const res = await authedGet(
      HOST_A,
      "/hq/website/recent-changes",
      users.hqA.rawToken
    );
    assert.equal(res.status, 200);
    assert.doesNotMatch(res.text, /<script>alert\("p4rc"\)<\/script>/);
    assert.match(res.text, /&lt;script&gt;alert\(&#34;p4rc&#34;\)&lt;\/script&gt;/);
  });

  it("growth website overview exposes recent-changes path and link when plan is growth", async () => {
    skipIfNeeded();
    const overview = await loadGrowthWebsiteOverview(pool, {
      organizationId: orgA.id,
      churchId: churchA.id,
      organizationKey: ORG_KEY_A,
      env: baseEnv(),
    });
    assert.equal(overview.ok, true);
    assert.equal(overview.planKey, "growth");
    assert.equal(overview.recentChangesPath, "/hq/website/recent-changes");

    const res = await authedGet(HOST_A, "/hq/website", users.hqA.rawToken);
    assert.equal(res.status, 200);
    assert.match(res.text, /data-bb-website-management="1"/);
    assert.match(res.text, /href="\/hq\/website\/recent-changes"/);
    assert.match(res.text, /Recent Website Changes/);
  });

  it("loadGrowthPreviousWebsitePreview returns friendly preview payload for historical publication", async () => {
    skipIfNeeded();
    let list = await loadGrowthRecentWebsiteChanges(pool, {
      organizationId: orgA.id,
      churchId: churchA.id,
      organizationKey: ORG_KEY_A,
      env: baseEnv(),
    });
    assert.equal(list.ok, true);
    if (!list.previousWebsites.length) {
      await clearOrgPublications(orgA.id);
      const historical = await insertPublication({
        organizationId: orgA.id,
        churchId: churchA.id,
        changeSummary: { publicationNote: "Service preview seed" },
        snapshot: {
          pages: [
            {
              pageKey: "home",
              title: "Home",
              sections: [{ sectionKey: "hero", heading: "Service preview seed" }],
            },
          ],
        },
      });
      await versionRepo.supersedePublishedVersions(pool, orgA.id);
      await insertPublication({
        organizationId: orgA.id,
        churchId: churchA.id,
        changeSummary: { publicationNote: "Service preview current" },
      });
      list = await loadGrowthRecentWebsiteChanges(pool, {
        organizationId: orgA.id,
        churchId: churchA.id,
        organizationKey: ORG_KEY_A,
        env: baseEnv(),
      });
      assert.equal(list.ok, true);
      assert.ok(list.previousWebsites.some((item) => item.id === historical.id));
    }
    assert.ok(list.previousWebsites.length > 0, "expected a historical publication");
    const previewId = list.previousWebsites[0].id;

    const result = await loadGrowthPreviousWebsitePreview(pool, {
      organizationId: orgA.id,
      churchId: churchA.id,
      publicationId: previewId,
      organizationKey: ORG_KEY_A,
      env: baseEnv(),
    });
    assert.equal(result.ok, true);
    assert.equal(result.stitchScreen, "Phase4 - Previous Website Preview");
    assert.equal(result.readOnly, true);
    assert.equal(result.noIndex, true);
    assert.equal(result.draftMutated, false);
    assert.equal(result.liveMutated, false);
    assert.ok(Array.isArray(result.pages));
  });
});
