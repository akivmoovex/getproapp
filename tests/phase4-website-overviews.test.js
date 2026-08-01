"use strict";

/**
 * Phase4 Stage 1 website overviews (Foundation / Growth / Branch).
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
const { renderV5Ejs } = require("../src/blessboard/http/v5EjsTemplateCache");
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
const {
  normalizePlanKey,
  loadFoundationWebsiteOverview,
  loadGrowthWebsiteOverview,
  loadBranchWebsiteOverview,
} = require("../src/blessboard/services/websiteOverviewService");
const submissionRepo = require("../src/blessboard/repositories/websiteChangeSubmissionRepository");
const versionRepo = require("../src/blessboard/repositories/websitePublicationVersionRepository");

const PASSWORD = "correct-horse-battery-staple";
const HOST_A = "p4wo-a.blessboard.org";
const HOST_B = "p4wo-b.blessboard.org";

const FORBIDDEN_TECHNICAL_TERMS = [
  "Version snapshot",
  "Rollback",
  "Superseded",
  "Diff",
  "Commit",
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

function minimalHqShellLocals(extra) {
  return {
    pageTitle: "Website",
    churchDisplayName: "P4WO Test Church",
    activeNav: "content",
    notice: null,
    ...(extra || {}),
  };
}

function minimalBranchShellLocals(extra) {
  return {
    pageTitle: "Branch Website",
    churchDisplayName: "P4WO Test Church",
    activeNav: "website",
    csrfToken: "test-csrf-token",
    ...(extra || {}),
  };
}

describe("phase4 website overviews", () => {
  let pool;
  let skipSuite = false;
  let skipReason = "";
  let app;
  let orgA;
  let orgB;
  let churchA;
  let churchB;
  let branchA;
  let branchNorth;
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

      async function provisionOrg(key, host, store) {
        const prov = await provisionPlatformTenant(pool, {
          organizationKey: key,
          displayName: `P4WO ${key}`,
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
          displayName: `P4WO Church ${key}`,
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
          publicName: `P4WO Church ${key}`,
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
      await provisionOrg("p4wo-a", HOST_A, a);
      await provisionOrg("p4wo-b", HOST_B, b);
      orgA = a.org;
      orgB = b.org;
      churchA = a.church;
      churchB = b.church;
      branchA = a.branch;

      const northIns = await pool.query(
        `INSERT INTO blessboard.branches (
           church_id, branch_key, display_name, branch_type, status, is_primary
         ) VALUES ($1, 'north', 'North Campus', 'branch', 'active', false)
         RETURNING id`,
        [churchA.id]
      );
      branchNorth = { id: northIns.rows[0].id };
      await pool.query(
        `INSERT INTO blessboard.branch_settings (branch_id, public_name)
         VALUES ($1, 'North Campus')
         ON CONFLICT (branch_id) DO NOTHING`,
        [branchNorth.id]
      );

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
        "p4wo-hq-a@example.test",
        "HQ A",
        {
          email: "p4wo-hq-a@example.test",
          organizationKey: "p4wo-a",
          roleKey: "church_hq_admin",
          churchKey: "p4wo-a",
        },
        orgA.id
      );
      users.hqB = await makeUser(
        "p4wo-hq-b@example.test",
        "HQ B",
        {
          email: "p4wo-hq-b@example.test",
          organizationKey: "p4wo-b",
          roleKey: "church_hq_admin",
          churchKey: "p4wo-b",
        },
        orgB.id
      );
      users.branchA = await makeUser(
        "p4wo-br-a@example.test",
        "Branch HQ A",
        {
          email: "p4wo-br-a@example.test",
          organizationKey: "p4wo-a",
          roleKey: "branch_admin",
          churchKey: "p4wo-a",
          branchKey: "hq",
        },
        orgA.id
      );
      users.branchNorth = await makeUser(
        "p4wo-br-n@example.test",
        "Branch North",
        {
          email: "p4wo-br-n@example.test",
          organizationKey: "p4wo-a",
          roleKey: "branch_admin",
          churchKey: "p4wo-a",
          branchKey: "north",
        },
        orgA.id
      );
      users.branchB = await makeUser(
        "p4wo-br-b@example.test",
        "Branch B",
        {
          email: "p4wo-br-b@example.test",
          organizationKey: "p4wo-b",
          roleKey: "branch_admin",
          churchKey: "p4wo-b",
          branchKey: "hq",
        },
        orgB.id
      );

      await submissionRepo.insertSubmission(pool, {
        organizationId: orgA.id,
        branchId: branchA.id,
        title: "Org A Pending Review",
        pageKey: "home",
        changeType: "Content",
        currentContent: {},
        proposedContent: { heading: "A" },
        status: "pending_review",
        submittedBy: users.branchA.user.id,
      });

      await submissionRepo.insertSubmission(pool, {
        organizationId: orgA.id,
        branchId: branchNorth.id,
        title: "North Campus Draft Item",
        pageKey: "home",
        changeType: "Content",
        currentContent: {},
        proposedContent: { heading: "North" },
        status: "draft",
        submittedBy: users.branchNorth.user.id,
      });

      await submissionRepo.insertSubmission(pool, {
        organizationId: orgB.id,
        branchId: b.branch.id,
        title: "Org B Secret Submission",
        pageKey: "home",
        changeType: "Content",
        currentContent: {},
        proposedContent: { heading: "B" },
        status: "pending_review",
        submittedBy: users.branchB.user.id,
      });

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

  it("foundation HQ overview renders Phase4 screen with checklist and status", async () => {
    skipIfNeeded();
    const res = await authedGet(HOST_A, "/hq/website", users.hqA.rawToken);
    assert.equal(res.status, 200);
    assert.match(res.text, /data-bb-phase4-foundation-website-overview="1"/);
    assert.match(
      res.text,
      /data-bb-stitch-screen="Phase4 - Foundation Website Overview"/
    );
    assert.match(res.text, /data-bb-phase4-setup-checklist="1"/);
    assert.match(res.text, /data-bb-phase4-website-status="1"/);
    assert.match(res.text, /Church setup/);
    assert.match(res.text, /Website status/);
  });

  it("foundation overview excludes growth workflow panels and forbidden technical terms", async () => {
    skipIfNeeded();
    const res = await authedGet(HOST_A, "/hq/website", users.hqA.rawToken);
    assert.equal(res.status, 200);
    assert.doesNotMatch(res.text, /data-bb-phase4-recent-submissions="1"/);
    assert.doesNotMatch(res.text, /data-bb-phase4-count="waiting"/);
    assert.doesNotMatch(res.text, /Recent branch submissions/);
    assertNoForbiddenTechnicalTerms(res.text, "foundation overview");
  });

  it("foundation overview includes navigation links and responsive marker", async () => {
    skipIfNeeded();
    const res = await authedGet(HOST_A, "/hq/website", users.hqA.rawToken);
    assert.equal(res.status, 200);
    assert.match(res.text, /data-bb-viewport="responsive"/);
    assert.match(res.text, /href="\/hq\/content"/);
    assert.match(res.text, /Preview Website|Preview Changes/);
    assert.match(res.text, /\/hq\/website\/publish\/review/);
  });

  it("foundation overview excludes fabricated engagement metrics", async () => {
    skipIfNeeded();
    const res = await authedGet(HOST_A, "/hq/website", users.hqA.rawToken);
    assert.equal(res.status, 200);
    assert.doesNotMatch(res.text, /Open Rate/i);
    assert.doesNotMatch(res.text, /Click Rate/i);
    assert.doesNotMatch(res.text, /\d+%\s*Complete/i);
  });

  it("foundation undoLastPublish is ineligible with zero or one published versions", async () => {
    skipIfNeeded();
    const none = await loadFoundationWebsiteOverview(pool, {
      organizationId: orgB.id,
      churchId: churchB.id,
      organizationKey: "p4wo-b",
      env: baseEnv(),
    });
    assert.equal(none.ok, true);
    assert.equal(none.undoLastPublish.eligible, false);
    assert.equal(none.undoLastPublish.enabled, false);

    await versionRepo.insertPublishedVersion(pool, {
      organizationId: orgB.id,
      churchId: churchB.id,
      versionNumber: 1,
      themeKey: "default",
      publishedBy: users.hqB.user.id,
      snapshot: { pages: [] },
      changeSummary: { pagesChanged: ["home"] },
    });

    const one = await loadFoundationWebsiteOverview(pool, {
      organizationId: orgB.id,
      churchId: churchB.id,
      organizationKey: "p4wo-b",
      env: baseEnv(),
    });
    assert.equal(one.ok, true);
    assert.equal(one.undoLastPublish.eligible, false);
    assert.equal(one.undoLastPublish.enabled, false);
  });

  it("foundation undoLastPublish is eligible when two published versions exist", async () => {
    skipIfNeeded();
    await versionRepo.supersedePublishedVersions(pool, orgA.id);
    await versionRepo.insertPublishedVersion(pool, {
      organizationId: orgA.id,
      churchId: churchA.id,
      versionNumber: 101,
      themeKey: "default",
      publishedBy: users.hqA.user.id,
      snapshot: { pages: [] },
      changeSummary: { pagesChanged: ["home"] },
    });
    await versionRepo.supersedePublishedVersions(pool, orgA.id);
    await versionRepo.insertPublishedVersion(pool, {
      organizationId: orgA.id,
      churchId: churchA.id,
      versionNumber: 102,
      themeKey: "default",
      publishedBy: users.hqA.user.id,
      snapshot: { pages: [] },
      changeSummary: { pagesChanged: ["home", "about"] },
    });

    const overview = await loadFoundationWebsiteOverview(pool, {
      organizationId: orgA.id,
      churchId: churchA.id,
      organizationKey: "p4wo-a",
      env: baseEnv(),
    });
    assert.equal(overview.ok, true);
    assert.equal(overview.undoLastPublish.eligible, true);
    assert.equal(overview.undoLastPublish.enabled, true);
    assert.ok(overview.undoLastPublish.href);
    assert.match(overview.undoLastPublish.href, /\/hq\/website\/version-history\/.+\/restore/);
  });

  it("default HTTP plan renders foundation overview not growth workflow", async () => {
    skipIfNeeded();
    const res = await authedGet(HOST_A, "/hq/website", users.hqA.rawToken);
    assert.equal(res.status, 200);
    assert.match(res.text, /data-bb-phase4-foundation-website-overview="1"/);
    assert.doesNotMatch(res.text, /data-bb-phase4-growth-website-workflow-overview="1"/);
  });

  it("normalizePlanKey and loadGrowthWebsiteOverview expose friendly growth shape", async () => {
    skipIfNeeded();
    assert.equal(normalizePlanKey("growth"), "growth");
    assert.equal(normalizePlanKey("pro"), "growth");
    assert.equal(normalizePlanKey("foundation"), "foundation");

    const overview = await loadGrowthWebsiteOverview(pool, {
      organizationId: orgA.id,
      churchId: churchA.id,
      organizationKey: "p4wo-a",
      env: baseEnv(),
    });
    assert.equal(overview.ok, true);
    assert.equal(overview.planKey, "growth");
    assert.equal(overview.stitchScreen, "Phase4 - Growth Website Workflow Overview");
    assert.ok(overview.counts);
    assert.equal(typeof overview.counts.waitingForReview, "number");
    assert.ok(Array.isArray(overview.recentSubmissions));
    assert.ok(overview.recentSubmissions.length <= 5);
    assert.ok(Array.isArray(overview.recentWebsiteChanges));
    assert.ok(overview.recentWebsiteChanges.length <= 5);
    assert.equal("versionHistory" in overview, false);
    assert.equal("Version History" in overview, false);
  });

  it("growth recent submissions are organization-scoped", async () => {
    skipIfNeeded();
    const overviewA = await loadGrowthWebsiteOverview(pool, {
      organizationId: orgA.id,
      churchId: churchA.id,
      organizationKey: "p4wo-a",
      env: baseEnv(),
    });
    const overviewB = await loadGrowthWebsiteOverview(pool, {
      organizationId: orgB.id,
      churchId: churchB.id,
      organizationKey: "p4wo-b",
      env: baseEnv(),
    });
    assert.equal(overviewA.ok, true);
    assert.equal(overviewB.ok, true);

    const titlesA = (overviewA.recentSubmissions || []).map((s) => s.title);
    const titlesB = (overviewB.recentSubmissions || []).map((s) => s.title);
    assert.ok(titlesA.some((t) => /Org A Pending Review/.test(t)));
    assert.ok(!titlesA.some((t) => /Org B Secret Submission/.test(t)));
    assert.ok(titlesB.some((t) => /Org B Secret Submission/.test(t)));
    assert.ok(!titlesB.some((t) => /Org A Pending Review/.test(t)));
  });

  it("growth overview EJS renders Recent Website Changes with responsive marker", async () => {
    skipIfNeeded();
    const overview = await loadGrowthWebsiteOverview(pool, {
      organizationId: orgA.id,
      churchId: churchA.id,
      organizationKey: "p4wo-a",
      env: baseEnv(),
    });
    assert.equal(overview.ok, true);

    const html = renderV5Ejs(
      "hq/phase4-growth-website-workflow-overview.ejs",
      minimalHqShellLocals({ overview })
    );
    assert.match(html, /data-bb-viewport="responsive"/);
    assert.match(html, /Recent Website Changes/);
    assert.match(html, /data-bb-phase4-recent-website-changes="1"/);
    assertNoForbiddenTechnicalTerms(html, "growth overview");
  });

  it("branch admin overview renders Phase4 branch screen", async () => {
    skipIfNeeded();
    const res = await authedGet(
      HOST_A,
      "/branch-admin/website/overview",
      users.branchA.rawToken
    );
    assert.equal(res.status, 200);
    assert.match(res.text, /data-bb-phase4-branch-website-overview="1"/);
    assert.match(
      res.text,
      /data-bb-stitch-screen="Phase4 - Branch Website Overview"/
    );
    assert.match(res.text, /data-bb-viewport="responsive"/);
    assert.match(res.text, /Branch Website/);
  });

  it("branch overview shows only assigned branch submissions", async () => {
    skipIfNeeded();
    const hqRes = await authedGet(
      HOST_A,
      "/branch-admin/website/overview",
      users.branchA.rawToken
    );
    assert.equal(hqRes.status, 200);
    assert.doesNotMatch(hqRes.text, /North Campus Draft Item/);

    const northRes = await authedGet(
      HOST_A,
      "/branch-admin/website/overview",
      users.branchNorth.rawToken
    );
    assert.equal(northRes.status, 200);
    assert.match(northRes.text, /North Campus Draft Item/);
  });

  it("branch overview hides HQ approve and publish controls", async () => {
    skipIfNeeded();
    const svc = await loadBranchWebsiteOverview(pool, {
      organizationId: orgA.id,
      churchId: churchA.id,
      branchId: branchA.id,
      organizationKey: "p4wo-a",
      branchDisplayName: "HQ",
      env: baseEnv(),
    });
    assert.equal(svc.ok, true);
    assert.equal(svc.canApprove, false);
    assert.equal(svc.canPublish, false);

    const res = await authedGet(
      HOST_A,
      "/branch-admin/website/overview",
      users.branchA.rawToken
    );
    assert.equal(res.status, 200);
    assert.doesNotMatch(res.text, />Approve</);
    assert.doesNotMatch(res.text, />Publish</);
  });

  it("branch admin from org B cannot access org A website overview", async () => {
    skipIfNeeded();
    const res = await authedGet(
      HOST_A,
      "/branch-admin/website/overview",
      users.branchB.rawToken
    );
    assert.ok(res.status === 403 || res.status === 404);
  });

  it("empty states render for quiet org and branch contexts", async () => {
    skipIfNeeded();

    const foundationEmptyHtml = renderV5Ejs(
      "hq/phase4-foundation-website-overview.ejs",
      minimalHqShellLocals({
        overview: {
          isEmptyWebsite: true,
          checklist: [],
          undoLastPublish: { eligible: false, enabled: false },
          editPath: "/hq/content",
          previewPath: "/hq/content/preview/home",
          title: "Church Website",
        },
      })
    );
    assert.match(foundationEmptyHtml, /data-bb-phase4-empty="new-website"/);
    assert.match(foundationEmptyHtml, /Your church website is ready to set up/);

    const growthEmptyHtml = renderV5Ejs(
      "hq/phase4-growth-website-workflow-overview.ejs",
      minimalHqShellLocals({
        overview: {
          counts: {
            draftChanges: 0,
            waitingForReview: 0,
            changesRequested: 0,
            readyToPublish: 0,
          },
          recentSubmissions: [],
          recentWebsiteChanges: [],
          draftPanel: { hasDraft: false },
          needsAttention: [],
          editPath: "/hq/content",
          previewPath: "/hq/content/preview/home",
        },
      })
    );
    assert.match(growthEmptyHtml, /data-bb-phase4-empty="draft"/);
    assert.match(growthEmptyHtml, /data-bb-phase4-empty="submissions"/);
    assert.match(growthEmptyHtml, /data-bb-phase4-empty="publications"/);

    const southIns = await pool.query(
      `INSERT INTO blessboard.branches (
         church_id, branch_key, display_name, branch_type, status, is_primary
       ) VALUES ($1, 'south', 'South Campus', 'branch', 'active', false)
       RETURNING id`,
      [churchB.id]
    );
    const branchSvc = await loadBranchWebsiteOverview(pool, {
      organizationId: orgB.id,
      churchId: churchB.id,
      branchId: southIns.rows[0].id,
      organizationKey: "p4wo-b",
      env: baseEnv(),
    });
    assert.equal(branchSvc.ok, true);
    assert.equal(branchSvc.draft, null);
    assert.equal((branchSvc.history || []).length, 0);

    const branchEmptyHtml = renderV5Ejs(
      "branch-admin/phase4-branch-website-overview.ejs",
      minimalBranchShellLocals({ overview: branchSvc })
    );
    assert.match(branchEmptyHtml, /data-bb-phase4-empty="branch-draft"/);
    assert.match(branchEmptyHtml, /No submissions yet/);
  });

  it("user-generated submission titles are HTML-escaped in growth overview", async () => {
    skipIfNeeded();
    const xssTitle = '<script>alert("xss")</script> Branch Title';
    await submissionRepo.insertSubmission(pool, {
      organizationId: orgA.id,
      branchId: branchA.id,
      title: xssTitle,
      pageKey: "home",
      changeType: "Content",
      currentContent: {},
      proposedContent: { heading: "X" },
      status: "pending_review",
      submittedBy: users.branchA.user.id,
    });

    const overview = await loadGrowthWebsiteOverview(pool, {
      organizationId: orgA.id,
      churchId: churchA.id,
      organizationKey: "p4wo-a",
      env: baseEnv(),
    });
    assert.equal(overview.ok, true);
    const hit = (overview.recentSubmissions || []).find((s) => s.title === xssTitle);
    assert.ok(hit);

    const html = renderV5Ejs(
      "hq/phase4-growth-website-workflow-overview.ejs",
      minimalHqShellLocals({ overview })
    );
    assert.doesNotMatch(html, /<script>alert\("xss"\)<\/script>/);
    assert.match(
      html,
      /&lt;script&gt;alert\(&#34;xss&#34;\)&lt;\/script&gt; Branch Title/
    );
  });
});
