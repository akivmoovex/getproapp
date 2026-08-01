"use strict";

/**
 * Website-mode transitions (1↔2+ active branches) — preservation + notices.
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
const {
  ensureChurchSettingsInitialized,
  updateChurchSettings,
} = require("../src/blessboard/services/blessBoardSettingsService");
const {
  provisionEmptyPublicPages,
  updatePublicPage,
  createPageSection,
} = require("../src/blessboard/services/publicContentAdminService");
const {
  createBlessBoardBranch,
} = require("../src/blessboard/services/createBlessBoardBranch");
const {
  activateBlessBoardBranch,
} = require("../src/blessboard/services/activateBlessBoardBranch");
const {
  deactivateBlessBoardBranch,
} = require("../src/blessboard/services/deactivateBlessBoardBranch");
const {
  resolveWebsiteMode,
  WEBSITE_MODE,
} = require("../src/blessboard/services/resolveWebsiteMode");
const {
  TRANSITION,
  NOTICE,
  detectWebsiteModeTransition,
  appendWebsiteModeNoticeQuery,
  parseWebsiteModeNoticeCode,
  websiteModeNoticeMessage,
} = require("../src/blessboard/services/websiteModeTransition");
const { createV5FoundationApp } = require("../src/platform/http/v5FoundationServer");
const { DEFAULT_V5_COOKIE } = require("../src/platform/session/v5SessionCookie");
const {
  createBlessBoardUser,
} = require("../src/blessboard/services/createBlessBoardUser");
const {
  assignBlessBoardRole,
} = require("../src/blessboard/services/assignBlessBoardRole");
const { createV5Session } = require("../src/platform/session/createV5Session");
const {
  setOrganizationEntitlementOverride,
  FEATURE_KEYS,
} = require("../src/platform/services/entitlementService");

const IDENTITY_KEY = "blessboard-platform-v5";
const HOST = "wm-trans.blessboard.org";
const PASSWORD = "TransitionTestPass1!";

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

describe("blessboard website mode transition (pure)", () => {
  it("1 → 2 active: to_multi_site with setup notice; no copy/merge flags", () => {
    const t = detectWebsiteModeTransition({
      previousActiveCount: 1,
      nextActiveCount: 2,
    });
    assert.equal(t.crossed, true);
    assert.equal(t.kind, TRANSITION.TO_MULTI_SITE);
    assert.equal(t.fromMode, WEBSITE_MODE.SINGLE_SITE);
    assert.equal(t.toMode, WEBSITE_MODE.MULTI_SITE);
    assert.equal(t.noticeCode, NOTICE.BRANCH_WEBSITES_AVAILABLE);
    assert.equal(t.policy.copyHqContentToBranch, false);
    assert.equal(t.policy.mergeBranchContentIntoHq, false);
    assert.equal(t.policy.deleteBranchScopedContent, false);
    assert.equal(t.policy.autoPublishBranchWebsite, false);
    assert.equal(t.policy.preserveBranchScopedContent, true);
  });

  it("2 → 1 active: to_single_site; content preserved policy", () => {
    const t = detectWebsiteModeTransition({
      previousActiveCount: 2,
      nextActiveCount: 1,
    });
    assert.equal(t.crossed, true);
    assert.equal(t.kind, TRANSITION.TO_SINGLE_SITE);
    assert.equal(t.fromMode, WEBSITE_MODE.MULTI_SITE);
    assert.equal(t.toMode, WEBSITE_MODE.SINGLE_SITE);
    assert.equal(t.noticeCode, NOTICE.SINGLE_SITE_RESTORED);
    assert.equal(t.policy.deleteBranchScopedContent, false);
    assert.equal(t.policy.mergeBranchContentIntoHq, false);
  });

  it("same-side changes do not cross", () => {
    assert.equal(
      detectWebsiteModeTransition({ previousActiveCount: 2, nextActiveCount: 3 }).crossed,
      false
    );
    assert.equal(
      detectWebsiteModeTransition({ previousActiveCount: 1, nextActiveCount: 1 }).crossed,
      false
    );
    assert.equal(
      detectWebsiteModeTransition({ previousActiveCount: 0, nextActiveCount: 1 }).crossed,
      false
    );
  });

  it("appends notice query only when crossed", () => {
    const crossed = detectWebsiteModeTransition({
      previousActiveCount: 1,
      nextActiveCount: 2,
    });
    assert.equal(
      appendWebsiteModeNoticeQuery("/hq/branches?created=east", crossed),
      `/hq/branches?created=east&website_mode_notice=${NOTICE.BRANCH_WEBSITES_AVAILABLE}`
    );
    const none = detectWebsiteModeTransition({
      previousActiveCount: 2,
      nextActiveCount: 3,
    });
    assert.equal(
      appendWebsiteModeNoticeQuery("/hq/branches?created=west", none),
      "/hq/branches?created=west"
    );
    assert.equal(
      parseWebsiteModeNoticeCode(NOTICE.BRANCH_WEBSITES_AVAILABLE),
      NOTICE.BRANCH_WEBSITES_AVAILABLE
    );
    assert.match(
      websiteModeNoticeMessage(NOTICE.BRANCH_WEBSITES_AVAILABLE),
      /Independent branch websites/
    );
  });
});

describe("blessboard website mode transition (integration)", () => {
  let pool;
  let skipSuite = false;
  let skipReason = "";
  let app;
  let org;
  let church;
  let hq;
  let hqCookie;
  let hqSectionId;
  let eastBranch;
  let eastSectionId;

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

      const prov = await provisionPlatformTenant(pool, {
        organizationKey: "wm-trans",
        displayName: "WM Trans Org",
        legalName: null,
        dataEnvironment: "testing",
        productKey: "blessboard",
        productTenantKey: "wm-trans",
        hostname: HOST,
        domainType: "canonical",
        deploymentCode: "blessboard-org-staging",
        isPrimary: true,
      });
      assert.equal(prov.ok, true, prov.message);
      org = prov.records.organization;

      const ch = await provisionBlessBoardChurch(pool, {
        organizationKey: "wm-trans",
        churchKey: "wm-trans",
        displayName: "WM Trans Church",
        dataEnvironment: "testing",
        hqBranchKey: "hq",
        hqBranchDisplayName: "HQ",
      });
      assert.equal(ch.ok, true, ch.message);
      church = ch.records.church;
      hq = ch.records.hqBranch;

      const ov = await setOrganizationEntitlementOverride(pool, {
        organizationId: org.id,
        featureKey: FEATURE_KEYS.MAX_BRANCHES,
        featureKind: "limit",
        limitValue: 5,
        reason: "website_mode_transition_test",
        createdByUserId: null,
      });
      assert.equal(ov.ok, true, ov.reason);

      await ensureChurchSettingsInitialized(pool, church.id);
      await updateChurchSettings(pool, church.id, {
        publicName: "WM Trans Church",
        websiteStatus: "published",
      });

      const pages = await provisionEmptyPublicPages(pool, { churchId: church.id });
      for (const page of pages.pages) {
        await updatePublicPage(pool, page.id, { status: "published" });
      }
      const home = pages.pages.find((p) => p.pageKey === "home");
      const hqSection = await createPageSection(pool, {
        pageId: home.id,
        sectionKey: "hq-hero-preserved",
        sectionType: "hero",
        heading: "HQ UNIQUE HEADING PRESERVE",
        bodyText: "Church-wide body that must survive transitions",
        status: "published",
      });
      assert.equal(hqSection.ok, true, hqSection.reason);
      hqSectionId = hqSection.section.id;

      // Pre-seed one branch-scoped page while still single_site (content may exist before multi).
      const eastInsert = await pool.query(
        `INSERT INTO blessboard.branches
           (church_id, branch_key, display_name, branch_type, status, is_primary, timezone, country_code)
         VALUES ($1, 'campus-east', 'Campus East', 'branch', 'inactive', false, 'UTC', 'US')
         RETURNING id, branch_key, display_name, status`,
        [church.id]
      );
      eastBranch = eastInsert.rows[0];

      const eastPages = await provisionEmptyPublicPages(pool, {
        churchId: church.id,
        branchId: eastBranch.id,
      });
      const eastHome = eastPages.pages.find((p) => p.pageKey === "home");
      await updatePublicPage(pool, eastHome.id, { status: "draft" });
      const eastSection = await createPageSection(pool, {
        pageId: eastHome.id,
        sectionKey: "east-hero-preserved",
        sectionType: "hero",
        heading: "EAST UNIQUE HEADING PRESERVE",
        bodyText: "Branch-only body that must survive deactivation",
        status: "draft",
      });
      assert.equal(eastSection.ok, true, eastSection.reason);
      eastSectionId = eastSection.section.id;

      const user = await createBlessBoardUser(pool, {
        email: "hq-wm-trans@example.com",
        displayName: "HQ Trans Admin",
        password: PASSWORD,
      });
      assert.equal(user.ok, true, user.message);
      assert.equal(
        (
          await assignBlessBoardRole(pool, {
            email: "hq-wm-trans@example.com",
            organizationKey: "wm-trans",
            roleKey: "church_hq_admin",
            churchKey: "wm-trans",
          })
        ).ok,
        true
      );
      const session = await createV5Session(pool, {
        deploymentCode: "blessboard-org-staging",
        userId: user.user.id,
        organizationId: org.id,
      });
      assert.equal(session.ok, true, session.message || session.code);
      hqCookie = `${DEFAULT_V5_COOKIE}=${session.rawToken}`;

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
    if (pool) await pool.end();
  });

  function requireDb() {
    if (skipSuite) assert.fail(`Local PostgreSQL unavailable: ${skipReason}`);
  }

  async function readSection(sectionId) {
    const res = await pool.query(
      `SELECT id, page_id, section_key, heading, body_text, status
         FROM blessboard.page_sections
        WHERE id = $1`,
      [sectionId]
    );
    return res.rows[0] || null;
  }

  async function countBranchPages(branchId) {
    const res = await pool.query(
      `SELECT COUNT(*)::int AS n
         FROM blessboard.public_pages
        WHERE church_id = $1 AND branch_id = $2`,
      [church.id, branchId]
    );
    return Number(res.rows[0].n || 0);
  }

  async function countChurchWidePages() {
    const res = await pool.query(
      `SELECT COUNT(*)::int AS n
         FROM blessboard.public_pages
        WHERE church_id = $1 AND branch_id IS NULL`,
      [church.id]
    );
    return Number(res.rows[0].n || 0);
  }

  it("starts single_site with one active branch", async () => {
    requireDb();
    const mode = await resolveWebsiteMode(pool, { churchId: church.id });
    assert.equal(mode.ok, true);
    assert.equal(mode.websiteMode, WEBSITE_MODE.SINGLE_SITE);
    assert.equal(mode.activeBranchCount, 1);
  });

  it("1→2 via activate: multi_site, no CMS copy, HQ + branch content preserved", async () => {
    requireDb();
    const hqBefore = await readSection(hqSectionId);
    const eastBefore = await readSection(eastSectionId);
    assert.ok(hqBefore);
    assert.ok(eastBefore);
    const churchWideBefore = await countChurchWidePages();
    const eastPagesBefore = await countBranchPages(eastBranch.id);

    const activated = await activateBlessBoardBranch(pool, {
      churchId: church.id,
      organizationId: org.id,
      branchId: eastBranch.id,
    });
    assert.equal(activated.ok, true, activated.reason);
    assert.equal(activated.alreadyActive, false);
    assert.equal(activated.cmsContentCopied, false);
    assert.equal(activated.websiteModeTransition.kind, TRANSITION.TO_MULTI_SITE);
    assert.equal(
      activated.websiteModeTransition.noticeCode,
      NOTICE.BRANCH_WEBSITES_AVAILABLE
    );

    const mode = await resolveWebsiteMode(pool, { churchId: church.id });
    assert.equal(mode.websiteMode, WEBSITE_MODE.MULTI_SITE);
    assert.equal(mode.activeBranchCount, 2);

    const hqAfter = await readSection(hqSectionId);
    const eastAfter = await readSection(eastSectionId);
    assert.equal(hqAfter.heading, "HQ UNIQUE HEADING PRESERVE");
    assert.equal(hqAfter.body_text, hqBefore.body_text);
    assert.equal(eastAfter.heading, "EAST UNIQUE HEADING PRESERVE");
    assert.equal(eastAfter.body_text, eastBefore.body_text);
    assert.equal(await countChurchWidePages(), churchWideBefore);
    assert.equal(await countBranchPages(eastBranch.id), eastPagesBefore);

    // Creating a third campus snapshots HQ into a branch-owned draft (post-commit).
    const created = await createBlessBoardBranch(pool, {
      churchId: church.id,
      organizationId: org.id,
      branchKey: "campus-west",
      displayName: "Campus West",
      email: "west@example.com",
      phone: "+15555550100",
      timezone: "UTC",
      countryCode: "US",
    });
    assert.equal(created.ok, true, created.message || created.reason);
    assert.equal(created.cmsContentCopied, true);
    assert.equal(created.websiteModeTransition.crossed, false);
    assert.ok(await countBranchPages(created.branch.id) > 0);
    assert.equal(await countChurchWidePages(), churchWideBefore);
    assert.equal((await readSection(hqSectionId)).heading, "HQ UNIQUE HEADING PRESERVE");
    // HQ content must remain untouched after branch snapshot.
    assert.equal((await readSection(eastSectionId)).heading, "EAST UNIQUE HEADING PRESERVE");
  });

  it("HQ notice renders after multi_site transition query", async () => {
    requireDb();
    const res = await request(app)
      .get(
        `/hq/branches?website_mode_notice=${encodeURIComponent(
          NOTICE.BRANCH_WEBSITES_AVAILABLE
        )}`
      )
      .set("Host", HOST)
      .set("Cookie", hqCookie);
    assert.equal(res.status, 200);
    assert.match(res.text, /data-bb-website-mode-notice="branch_websites_available"/);
    assert.match(res.text, /Independent branch websites are now available/);
  });

  it("2→1 via deactivate: single_site, branch content preserved, no HQ merge", async () => {
    requireDb();
    const west = await pool.query(
      `SELECT id FROM blessboard.branches
        WHERE church_id = $1 AND branch_key = 'campus-west'`,
      [church.id]
    );
    assert.ok(west.rows[0]);

    const hqBefore = await readSection(hqSectionId);
    const eastBefore = await readSection(eastSectionId);
    const churchWideBefore = await countChurchWidePages();
    const eastPagesBefore = await countBranchPages(eastBranch.id);

    // Seed a west draft then deactivate west (and later east) carefully.
    const westPages = await provisionEmptyPublicPages(pool, {
      churchId: church.id,
      branchId: west.rows[0].id,
    });
    const westHome = westPages.pages.find((p) => p.pageKey === "home");
    await updatePublicPage(pool, westHome.id, { status: "draft" });
    const westSection = await createPageSection(pool, {
      pageId: westHome.id,
      sectionKey: "west-hero",
      sectionType: "hero",
      heading: "WEST UNIQUE HEADING PRESERVE",
      bodyText: "West body",
      status: "draft",
    });
    assert.equal(westSection.ok, true, westSection.reason);
    const westSectionId = westSection.section.id;

    const deactivatedWest = await deactivateBlessBoardBranch(pool, {
      churchId: church.id,
      organizationId: org.id,
      branchId: west.rows[0].id,
    });
    assert.equal(deactivatedWest.ok, true, deactivatedWest.reason);
    assert.equal(deactivatedWest.contentPreserved, true);
    assert.equal(deactivatedWest.websiteModeTransition.crossed, false);
    assert.equal(
      (await resolveWebsiteMode(pool, { churchId: church.id })).websiteMode,
      WEBSITE_MODE.MULTI_SITE
    );

    const deactivatedEast = await deactivateBlessBoardBranch(pool, {
      churchId: church.id,
      organizationId: org.id,
      branchId: eastBranch.id,
    });
    assert.equal(deactivatedEast.ok, true, deactivatedEast.reason);
    assert.equal(deactivatedEast.contentPreserved, true);
    assert.equal(deactivatedEast.websiteModeTransition.kind, TRANSITION.TO_SINGLE_SITE);
    assert.equal(
      deactivatedEast.websiteModeTransition.noticeCode,
      NOTICE.SINGLE_SITE_RESTORED
    );

    const mode = await resolveWebsiteMode(pool, { churchId: church.id });
    assert.equal(mode.websiteMode, WEBSITE_MODE.SINGLE_SITE);
    assert.equal(mode.activeBranchCount, 1);

    assert.equal((await readSection(hqSectionId)).heading, hqBefore.heading);
    assert.equal((await readSection(eastSectionId)).heading, eastBefore.heading);
    assert.equal((await readSection(westSectionId)).heading, "WEST UNIQUE HEADING PRESERVE");
    assert.equal(await countChurchWidePages(), churchWideBefore);
    assert.equal(await countBranchPages(eastBranch.id), eastPagesBefore);
    assert.ok((await countBranchPages(west.rows[0].id)) >= 1);

    // Remaining active branch public URLs redirect to church-wide (no content merge).
    const redirect = await request(app)
      .get(`/branches/${hq.key}/about`)
      .set("Host", HOST);
    assert.equal(redirect.status, 301);
    assert.equal(redirect.headers.location, "/about");
  });

  it("HQ notice renders for single_site_restored", async () => {
    requireDb();
    const res = await request(app)
      .get(
        `/hq/branches?website_mode_notice=${encodeURIComponent(
          NOTICE.SINGLE_SITE_RESTORED
        )}`
      )
      .set("Host", HOST)
      .set("Cookie", hqCookie);
    assert.equal(res.status, 200);
    assert.match(res.text, /data-bb-website-mode-notice="single_site_restored"/);
    assert.match(res.text, /single church-wide site/);
  });

  it("refuses to deactivate HQ/primary without deleting anything", async () => {
    requireDb();
    const before = await readSection(hqSectionId);
    const denied = await deactivateBlessBoardBranch(pool, {
      churchId: church.id,
      organizationId: org.id,
      branchId: hq.id,
    });
    assert.equal(denied.ok, false);
    assert.equal(denied.status, "forbidden");
    assert.equal((await readSection(hqSectionId)).heading, before.heading);
  });
});
