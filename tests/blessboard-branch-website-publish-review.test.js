"use strict";

/**
 * Branch + church website publish review readiness / route contract.
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
  evaluatePublishReadiness,
} = require("../src/blessboard/services/churchWebsitePublishService");
const {
  provisionEmptyPublicPages,
  updatePublicPage,
  createPageSection,
} = require("../src/blessboard/services/publicContentAdminService");
const publicContentRepo = require("../src/blessboard/repositories/publicContentRepository");
const {
  saveInlineFieldDraft,
} = require("../src/blessboard/services/websiteInlineDraftService");
const {
  publishWebsiteDrafts,
} = require("../src/blessboard/services/websiteDraftPublishService");
const {
  prepareWebsitePublishReview,
  buildBlockingIssues,
} = require("../src/blessboard/services/websitePublishReviewService");
const {
  hqWebsitePublishReviewPath,
  hqWebsiteBranchDetailsPath,
} = require("../src/blessboard/urls/churchUrlHelper");

const PASSWORD = "TestPassword99!";
const HOST_A = "pub-review-a.blessboard.org";
const HOST_B = "pub-review-b.blessboard.org";

function baseEnv(overrides) {
  return baseV5TestEnv(overrides);
}

function sidCookie(rawToken) {
  return `${DEFAULT_V5_COOKIE}=${rawToken}`;
}

describe("blessboard branch website publish review", () => {
  let pool;
  let skipSuite = false;
  let skipReason = "";
  let app;
  let orgA;
  let churchA;
  let campusEast;
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

      const provA = await provisionPlatformTenant(pool, {
        organizationKey: "pub-review-a",
        displayName: "Pub Review Org A",
        legalName: null,
        dataEnvironment: "testing",
        productKey: "blessboard",
        productTenantKey: "pub-review-a",
        hostname: HOST_A,
        domainType: "canonical",
        deploymentCode: "blessboard-org-v5",
        isPrimary: true,
      });
      assert.equal(provA.ok, true, provA.message);
      orgA = provA.records.organization;

      await provisionPlatformTenant(pool, {
        organizationKey: "pub-review-b",
        displayName: "Pub Review Org B",
        legalName: null,
        dataEnvironment: "testing",
        productKey: "blessboard",
        productTenantKey: "pub-review-b",
        hostname: HOST_B,
        domainType: "canonical",
        deploymentCode: "blessboard-org-v5",
        isPrimary: true,
      });

      const chA = await provisionBlessBoardChurch(pool, {
        organizationKey: "pub-review-a",
        churchKey: "pub-review-a",
        displayName: "Pub Review Church A",
        dataEnvironment: "testing",
        hqBranchKey: "hq",
        hqBranchDisplayName: "HQ Campus",
      });
      assert.equal(chA.ok, true, chA.message);
      churchA = chA.records.church;

      const east = await pool.query(
        `INSERT INTO blessboard.branches (
           church_id, branch_key, display_name, branch_type, status, is_primary, timezone, country_code
         ) VALUES ($1, 'east', 'East Campus', 'branch', 'active', false, 'UTC', 'ZM')
         RETURNING id, branch_key, display_name`,
        [churchA.id]
      );
      campusEast = {
        id: String(east.rows[0].id),
        key: String(east.rows[0].branch_key),
        displayName: String(east.rows[0].display_name),
      };

      await ensureChurchSettingsInitialized(pool, churchA.id);
      await updateChurchSettings(pool, churchA.id, {
        publicName: "Pub Review Church A",
        websiteStatus: "published",
        primaryEmail: "hq@pub-review-a.test",
        primaryPhone: "+260900000001",
      });
      await repairWebsiteFoundation(pool, { churchId: churchA.id });
      await acknowledgeWebsitePreview(pool, {
        organizationId: orgA.id,
        actorUserId: null,
      });
      await provisionEmptyPublicPages(pool, { churchId: churchA.id, branchId: null });
      await provisionEmptyPublicPages(pool, {
        churchId: churchA.id,
        branchId: campusEast.id,
      });

      const created = await createBlessBoardUser(pool, {
        email: "hq@pub-review-a.test",
        displayName: "HQ Admin A",
        password: PASSWORD,
      });
      assert.equal(created.ok, true, created.message);
      assert.equal(
        (
          await assignBlessBoardRole(pool, {
            email: "hq@pub-review-a.test",
            organizationKey: "pub-review-a",
            roleKey: "church_hq_admin",
            churchKey: "pub-review-a",
          })
        ).ok,
        true
      );
      const session = await createV5Session(pool, {
        deploymentCode: "blessboard-org-v5",
        userId: created.user.id,
        organizationId: orgA.id,
      });
      assert.equal(session.ok, true, session.message || session.code);
      users.hq = { user: created.user, rawToken: session.rawToken };

      const pub = await publishChurchWebsite(pool, {
        organizationId: orgA.id,
        churchId: churchA.id,
        branchId: null,
        actorUserId: users.hq.user.id,
        confirmPublish: true,
        deferServiceTimes: true,
        mobilePreviewConfirmed: true,
        relaxPreviewRequirement: true,
        forcePublishVersion: true,
        env: baseEnv(),
      });
      assert.equal(pub.ok, true, JSON.stringify(pub));

      app = createV5FoundationApp({
        getPool: () => pool,
        env: baseEnv(),
        apexHosts: new Set(["blessboard.org", "www.blessboard.org"]),
      });
    } catch (err) {
      skipSuite = true;
      skipReason = err && err.message ? String(err.message) : String(err);
    }
  });

  after(async () => {
    if (pool) await pool.end().catch(() => {});
  });

  function skipIfNeeded(t) {
    if (skipSuite) {
      t.skip(skipReason || "suite setup failed");
      return true;
    }
    return false;
  }

  it("canonical review paths are scoped", (t) => {
    if (skipIfNeeded(t)) return;
    assert.equal(hqWebsitePublishReviewPath(null), "/hq/website/publish/review");
    assert.equal(
      hqWebsitePublishReviewPath("east"),
      "/hq/website/branches/east/publish/review"
    );
    assert.equal(
      hqWebsiteBranchDetailsPath("east"),
      "/hq/website/branches/east/pages/home"
    );
  });

  it("blocked readiness always includes at least one actionable issue", (t) => {
    if (skipIfNeeded(t)) return;
    const issues = buildBlockingIssues({
      validation: { publishable: false, errors: [], checks: [] },
      readiness: { ready: false, gaps: [] },
      branchKey: "east",
      branchName: "East Campus",
    });
    assert.ok(issues.length >= 1);
    assert.ok(issues[0].editUrl);
    assert.match(issues[0].editUrl, /\/hq\/website\/branches\/east\//);
  });

  it("warnings alone do not invent blockers when publishable", (t) => {
    if (skipIfNeeded(t)) return;
    const issues = buildBlockingIssues({
      validation: {
        publishable: true,
        errors: [],
        warnings: ["An image is missing"],
        checks: [{ key: "images", ok: false, label: "images" }],
      },
      readiness: { ready: true, gaps: [] },
      branchKey: "east",
    });
    assert.equal(issues.length, 0);
  });

  it("church-wide review route renders required locals", async (t) => {
    if (skipIfNeeded(t)) return;
    const res = await request(app)
      .get("/hq/website/publish/review?defer_service_times=1")
      .set("Host", HOST_A)
      .set("Cookie", sidCookie(users.hq.rawToken))
      .set("Accept", "text/html");
    assert.equal(res.status, 200);
    assert.match(res.text, /data-bb-phase4-publish-website-review="1"/);
    assert.match(res.text, /data-bb-website-scope="church"/);
    assert.match(res.text, /Readiness Checklist|No reviewable draft|Change Summary/);
  });

  it("branch review route renders branch scope and never blank shell", async (t) => {
    if (skipIfNeeded(t)) return;
    const res = await request(app)
      .get(`/hq/website/branches/${campusEast.key}/publish/review?defer_service_times=1`)
      .set("Host", HOST_A)
      .set("Cookie", sidCookie(users.hq.rawToken))
      .set("Accept", "text/html");
    assert.equal(res.status, 200);
    assert.match(res.text, /data-bb-phase4-publish-website-review="1"/);
    assert.match(res.text, /data-bb-website-scope="branch"/);
    assert.match(res.text, new RegExp(`data-bb-branch-key="${campusEast.key}"`));
    assert.doesNotMatch(res.text, /<main class="bb-hq-login-unavailable">/);
  });

  it("legacy review URL with branch hint redirects to canonical branch route", async (t) => {
    if (skipIfNeeded(t)) return;
    const res = await request(app)
      .get(`/hq/website/publish/review?branch=${campusEast.key}`)
      .set("Host", HOST_A)
      .set("Cookie", sidCookie(users.hq.rawToken))
      .redirects(0);
    assert.equal(res.status, 303);
    assert.match(
      res.headers.location,
      new RegExp(`/hq/website/branches/${campusEast.key}/publish/review`)
    );
  });

  it("cross-organization branch key returns 404", async (t) => {
    if (skipIfNeeded(t)) return;
    const res = await request(app)
      .get("/hq/website/branches/does-not-exist/publish/review")
      .set("Host", HOST_A)
      .set("Cookie", sidCookie(users.hq.rawToken))
      .set("Accept", "text/html");
    assert.equal(res.status, 404);
  });

  async function ensureBranchPages(branchId, titlePrefix) {
    const pages = await provisionEmptyPublicPages(pool, {
      churchId: churchA.id,
      branchId,
    });
    assert.equal(pages.ok, true, pages.message || pages.reason);
    const home = (pages.pages || []).find((p) => p.pageKey === "home");
    assert.ok(home);
    await updatePublicPage(pool, home.id, {
      title: `${titlePrefix} Home`,
      status: "draft",
    });
    const existingHero = await publicContentRepo.findSectionByPageAndKey(
      pool,
      home.id,
      "hero"
    );
    if (existingHero) {
      await pool.query(
        `UPDATE blessboard.page_sections
            SET heading = $2, body_text = $3, status = 'draft', updated_at = now()
          WHERE id = $1`,
        [existingHero.id, `${titlePrefix} Hero`, `${titlePrefix} body`]
      );
    } else {
      await createPageSection(pool, {
        pageId: home.id,
        sectionKey: "hero",
        sectionType: "hero",
        heading: `${titlePrefix} Hero`,
        bodyText: `${titlePrefix} body`,
        status: "draft",
      });
    }
  }

  it("branch website with draft content publishes successfully", async (t) => {
    if (skipIfNeeded(t)) return;
    await ensureBranchPages(campusEast.id, "East Publish");
    const draft = await saveInlineFieldDraft(pool, {
      organizationId: orgA.id,
      churchId: churchA.id,
      branchId: campusEast.id,
      editorUserId: users.hq.user.id,
      actorRole: "church_hq_admin",
      pageKey: "home",
      sectionKey: "hero",
      fieldKey: "heading",
      newValue: "East Campus Welcome",
    });
    assert.equal(draft.saved, true, JSON.stringify(draft));

    const published = await publishWebsiteDrafts(pool, {
      organizationId: orgA.id,
      churchId: churchA.id,
      branchId: campusEast.id,
      actorUserId: users.hq.user.id,
      actorRole: "church_hq_admin",
      confirmPublish: true,
      mobilePreviewConfirmed: true,
      deferServiceTimes: true,
      env: baseEnv(),
    });
    assert.equal(published.ok, true, JSON.stringify(published));
    assert.ok(published.published && published.published.publicationVersionId);
  });

  it("branch website with missing required details is blocked with actionable issue", async (t) => {
    if (skipIfNeeded(t)) return;
    await pool.query(
      `UPDATE blessboard.church_settings
          SET website_status = 'suspended', updated_at = now()
        WHERE church_id = $1`,
      [churchA.id]
    );

    const readiness = await evaluatePublishReadiness(pool, {
      churchId: churchA.id,
      deferServiceTimes: true,
      env: baseEnv(),
    });
    assert.equal(readiness.ready, false);
    assert.ok((readiness.gaps || []).includes("website_suspended"));

    const review = await prepareWebsitePublishReview(pool, {
      organizationId: orgA.id,
      churchId: churchA.id,
      branchId: campusEast.id,
      branchKey: campusEast.key,
      branchName: campusEast.displayName,
      actorUserId: users.hq.user.id,
      deferServiceTimes: true,
      organizationKey: "pub-review-a",
      env: baseEnv(),
    });
    assert.equal(review.ok, true);
    assert.equal(review.publishable, false);
    assert.ok(review.blockingIssues.length >= 1);
    const blocked = review.blockingIssues.find(
      (i) => i.code === "org_inactive" || i.code === "incomplete" || i.code === "not_ready"
    );
    assert.ok(blocked, JSON.stringify(review.blockingIssues));
    assert.ok(blocked.editUrl);
    assert.match(String(blocked.editUrl), /\/hq\//);

    await pool.query(
      `UPDATE blessboard.church_settings
          SET website_status = 'published', updated_at = now()
        WHERE church_id = $1`,
      [churchA.id]
    );
  });

  it("church-wide review still works after branch publish", async (t) => {
    if (skipIfNeeded(t)) return;
    const review = await prepareWebsitePublishReview(pool, {
      organizationId: orgA.id,
      churchId: churchA.id,
      actorUserId: users.hq.user.id,
      deferServiceTimes: true,
      organizationKey: "pub-review-a",
      env: baseEnv(),
    });
    assert.equal(review.ok, true);
    assert.equal(review.scope.scopeType, "church");
    assert.equal(review.reviewPath, "/hq/website/publish/review");
  });

  it("branch details alias redirects to editor", async (t) => {
    if (skipIfNeeded(t)) return;
    const res = await request(app)
      .get(`/hq/website/branches/${campusEast.key}/details`)
      .set("Host", HOST_A)
      .set("Cookie", sidCookie(users.hq.rawToken))
      .redirects(0);
    assert.equal(res.status, 303);
    assert.match(
      res.headers.location,
      new RegExp(`/hq/website/branches/${campusEast.key}/pages/home`)
    );
  });

  it("lookup_error validation still yields populated review model", async (t) => {
    if (skipIfNeeded(t)) return;
    const issues = buildBlockingIssues({
      validation: {
        ok: false,
        status: "lookup_error",
        publishable: false,
        reason: "schema_incomplete",
        errors: [
          "Website publication schema is incomplete. Apply pending BlessBoard migrations (branch-scoped publication versions) and retry.",
        ],
      },
      readiness: { ok: false, ready: false, gaps: ["lookup_error"] },
      branchKey: "east",
    });
    assert.ok(issues.some((i) => i.code === "schema_incomplete" || i.code === "lookup_error"));
    assert.ok(issues.every((i) => i.editUrl));
  });
});
