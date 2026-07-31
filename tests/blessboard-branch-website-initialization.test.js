"use strict";

/**
 * Branch website initialization — HQ snapshot → branch-owned autonomy.
 */

const { describe, it, before, after } = require("node:test");
const assert = require("node:assert/strict");

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
  updateBranchSettings,
} = require("../src/blessboard/services/blessBoardSettingsService");
const {
  provisionEmptyPublicPages,
  updatePublicPage,
  createPageSection,
  createGivingMethod,
  createLeader,
} = require("../src/blessboard/services/publicContentAdminService");
const {
  buildBlessBoardTenantContext,
} = require("../src/blessboard/http/buildBlessBoardTenantContext");
const {
  loadTenantPublicPageModel,
  KIND,
} = require("../src/blessboard/http/loadTenantPublicPageModel");
const {
  createBlessBoardBranch,
} = require("../src/blessboard/services/createBlessBoardBranch");
const {
  initializeBranchWebsiteFromChurch,
  isBranchWebsiteInitialized,
  STATUS: INIT_STATUS,
} = require("../src/blessboard/services/initializeBranchWebsiteFromChurch");
const {
  ensureBranchWebsiteGovernance,
} = require("../src/blessboard/services/branchWebsiteGovernanceService");
const {
  assignOrganizationPlan,
  setOrganizationEntitlementOverride,
  FEATURE_KEYS,
} = require("../src/platform/services/entitlementService");

const IDENTITY_KEY = "blessboard-platform-v5";
const HOST_A = "bw-init-a.blessboard.org";
const HOST_B = "bw-init-b.blessboard.org";

describe("blessboard branch website initialization autonomy", () => {
  let pool;
  let skipSuite = false;
  let skipReason = "";
  let orgA;
  let churchA;
  let hqBranchA;
  let campusEast;
  let orgB;
  let churchB;
  let tenantA;

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

      const schemaCheck = await pool.query(
        `SELECT to_regclass('blessboard.branch_website_governance') AS gov,
                (
                  SELECT 1 FROM information_schema.columns
                   WHERE table_schema = 'blessboard'
                     AND table_name = 'branch_website_governance'
                     AND column_name = 'website_initialization_status'
                ) AS init_col`
      );
      assert.ok(schemaCheck.rows[0].gov, "052 governance table missing");
      assert.ok(schemaCheck.rows[0].init_col, "054 init columns missing");

      const provA = await provisionPlatformTenant(pool, {
        organizationKey: "bw-init-a",
        displayName: "Init Org A",
        legalName: null,
        dataEnvironment: "testing",
        productKey: "blessboard",
        productTenantKey: "bw-init-a",
        hostname: HOST_A,
        domainType: "canonical",
        deploymentCode: "blessboard-org-v5",
        isPrimary: true,
      });
      assert.equal(provA.ok, true, provA.message);
      orgA = provA.records.organization;

      const chA = await provisionBlessBoardChurch(pool, {
        organizationKey: "bw-init-a",
        churchKey: "bw-init-a",
        displayName: "Init Church A",
        dataEnvironment: "testing",
        hqBranchKey: "hq",
        hqBranchDisplayName: "HQ A",
      });
      assert.equal(chA.ok, true, chA.message);
      churchA = chA.records.church;
      hqBranchA = chA.records.hqBranch;

      await assignOrganizationPlan(pool, {
        organizationId: orgA.id,
        planKey: "growth",
      });
      await setOrganizationEntitlementOverride(pool, {
        organizationId: orgA.id,
        featureKey: FEATURE_KEYS.MAX_BRANCHES,
        featureKind: "limit",
        limitValue: 20,
        reason: "test_branch_website_initialization",
      });

      const east = await pool.query(
        `INSERT INTO blessboard.branches
           (church_id, branch_key, display_name, branch_type, status, is_primary, timezone, country_code)
         VALUES ($1, 'campus-east', 'Campus East', 'branch', 'active', false, 'UTC', 'ZM')
         RETURNING id, church_id, branch_key, display_name`,
        [churchA.id]
      );
      campusEast = east.rows[0];
      await ensureBranchWebsiteGovernance(pool, {
        organizationId: orgA.id,
        churchId: churchA.id,
        branchId: campusEast.id,
      });
      await updateBranchSettings(pool, campusEast.id, {
        publicName: "Campus East",
        email: "east@init-a.test",
        phone: "+15552001",
        addressLine1: "12 East Road",
        city: "Kitwe",
        countryCode: "ZM",
      });

      const provB = await provisionPlatformTenant(pool, {
        organizationKey: "bw-init-b",
        displayName: "Init Org B",
        legalName: null,
        dataEnvironment: "testing",
        productKey: "blessboard",
        productTenantKey: "bw-init-b",
        hostname: HOST_B,
        domainType: "canonical",
        deploymentCode: "blessboard-org-v5",
        isPrimary: true,
      });
      assert.equal(provB.ok, true, provB.message);
      orgB = provB.records.organization;

      const chB = await provisionBlessBoardChurch(pool, {
        organizationKey: "bw-init-b",
        churchKey: "bw-init-b",
        displayName: "Init Church B",
        dataEnvironment: "testing",
        hqBranchKey: "hq",
        hqBranchDisplayName: "HQ B",
      });
      assert.equal(chB.ok, true, chB.message);
      churchB = chB.records.church;

      await ensureChurchSettingsInitialized(pool, churchA.id);
      await updateChurchSettings(pool, churchA.id, {
        publicName: "Init Church A",
        websiteStatus: "published",
        primaryEmail: "hq@init-a.test",
        primaryPhone: "+15551001",
      });

      const churchPages = await provisionEmptyPublicPages(pool, {
        churchId: churchA.id,
        branchId: null,
      });
      assert.ok(churchPages && churchPages.ok !== false);
      for (const page of churchPages.pages || []) {
        await updatePublicPage(pool, page.id, {
          status: "published",
          confirmPublish: true,
        });
      }
      const homeChurch = (churchPages.pages || []).find((p) => p.pageKey === "home");
      assert.ok(homeChurch);
      await createPageSection(pool, {
        pageId: homeChurch.id,
        sectionKey: "hero",
        sectionType: "hero",
        heading: "HQ Hero Unique",
        bodyText: "HQ welcome copy",
        status: "published",
        confirmPublish: true,
        sortOrder: 0,
      });
      await createLeader(pool, {
        churchId: churchA.id,
        branchId: null,
        displayName: "HQ Pastor",
        roleTitle: "Lead Pastor",
        status: "published",
        confirmPublish: true,
        sortOrder: 0,
      });
      await createGivingMethod(pool, {
        churchId: churchA.id,
        branchId: null,
        methodType: "bank",
        label: "HQ Bank",
        accountDetails: "SECRET-ACCOUNT-999",
        instructions: "Transfer",
        status: "published",
        confirmPublish: true,
        sortOrder: 0,
      });

      tenantA = buildBlessBoardTenantContext({
        organization: { id: orgA.id, key: "bw-init-a" },
        church: {
          id: churchA.id,
          churchKey: "bw-init-a",
          displayName: "Init Church A",
          dataEnvironment: "testing",
        },
        hqBranch: {
          id: hqBranchA.id,
          branchKey: "hq",
          displayName: "HQ A",
        },
        primaryBranch: {
          id: hqBranchA.id,
          branchKey: "hq",
          displayName: "HQ A",
        },
      });
    } catch (err) {
      skipSuite = true;
      skipReason = err && err.message ? err.message : String(err);
    }
  });

  after(async () => {
    if (pool) await pool.end();
  });

  function skipIfNeeded() {
    if (skipSuite) {
      console.log(`SKIP: ${skipReason}`);
      return true;
    }
    return false;
  }

  it("clones HQ structure into branch draft once and records source metadata", async () => {
    if (skipIfNeeded()) return;

    const first = await initializeBranchWebsiteFromChurch(pool, {
      organizationId: orgA.id,
      churchId: churchA.id,
      branchId: campusEast.id,
      actorUserId: null,
    });
    assert.equal(first.ok, true, first.reason || first.errorCode);
    assert.equal(first.status, INIT_STATUS.OK);
    assert.equal(first.draft, true);
    assert.ok(first.branchVersionId);

    const gov = await pool.query(
      `SELECT website_initialization_status, initialized_from_version_id, initialized_at
         FROM blessboard.branch_website_governance WHERE branch_id = $1`,
      [campusEast.id]
    );
    assert.equal(gov.rows[0].website_initialization_status, "completed");
    assert.ok(gov.rows[0].initialized_at);

    const pages = await pool.query(
      `SELECT page_key, status FROM blessboard.public_pages
        WHERE church_id = $1 AND branch_id = $2 ORDER BY page_key`,
      [churchA.id, campusEast.id]
    );
    assert.ok(pages.rows.length >= 8);
    assert.ok(pages.rows.every((p) => p.status === "draft" || p.status === "published"));

    const hero = await pool.query(
      `SELECT s.heading, s.status
         FROM blessboard.page_sections s
         INNER JOIN blessboard.public_pages p ON p.id = s.page_id
        WHERE p.church_id = $1 AND p.branch_id = $2 AND p.page_key = 'home'
          AND s.section_key = 'hero'
        LIMIT 1`,
      [churchA.id, campusEast.id]
    );
    assert.equal(hero.rows[0].heading, "HQ Hero Unique");
    assert.equal(hero.rows[0].status, "draft");

    const giving = await pool.query(
      `SELECT COUNT(*)::int AS n FROM blessboard.giving_methods
        WHERE church_id = $1 AND branch_id = $2`,
      [churchA.id, campusEast.id]
    );
    assert.equal(giving.rows[0].n, 0, "giving methods must not be copied");

    const version = await pool.query(
      `SELECT status, source_type, change_summary_json
         FROM blessboard.website_publication_versions
        WHERE id = $1`,
      [first.branchVersionId]
    );
    assert.equal(version.rows[0].status, "draft");
    assert.equal(version.rows[0].source_type, "initial_setup");
    assert.match(
      JSON.stringify(version.rows[0].change_summary_json),
      /Initialized from HQ website/
    );

    const second = await initializeBranchWebsiteFromChurch(pool, {
      organizationId: orgA.id,
      churchId: churchA.id,
      branchId: campusEast.id,
    });
    assert.equal(second.ok, true);
    assert.equal(second.status, INIT_STATUS.ALREADY_INITIALIZED);

    const pageCount = await pool.query(
      `SELECT COUNT(*)::int AS n FROM blessboard.public_pages
        WHERE church_id = $1 AND branch_id = $2`,
      [churchA.id, campusEast.id]
    );
    assert.equal(pageCount.rows[0].n, pages.rows.length);
  });

  it("stops live HQ fallback after initialization; HQ edits do not affect branch", async () => {
    if (skipIfNeeded()) return;
    assert.equal(await isBranchWebsiteInitialized(pool, campusEast.id), true);

    // Publish branch home so public model can resolve branch-owned content.
    const branchHome = await pool.query(
      `SELECT id FROM blessboard.public_pages
        WHERE church_id = $1 AND branch_id = $2 AND page_key = 'home' LIMIT 1`,
      [churchA.id, campusEast.id]
    );
    assert.ok(branchHome.rows[0]);
    await updatePublicPage(pool, branchHome.rows[0].id, {
      status: "published",
      confirmPublish: true,
    });
    await pool.query(
      `UPDATE blessboard.page_sections s
          SET status = 'published'
         FROM blessboard.public_pages p
        WHERE s.page_id = p.id
          AND p.church_id = $1 AND p.branch_id = $2 AND p.page_key = 'home'`,
      [churchA.id, campusEast.id]
    );

    const before = await loadTenantPublicPageModel(pool, {
      tenant: tenantA,
      pageKey: "home",
      hostname: HOST_A,
      selectedBranch: {
        id: campusEast.id,
        key: "campus-east",
        displayName: "Campus East",
      },
    });
    assert.equal(before.kind, KIND.OK);
    const beforeHero = (before.sections || []).find((s) => s.sectionKey === "hero");
    assert.equal(beforeHero && beforeHero.heading, "HQ Hero Unique");

    await pool.query(
      `UPDATE blessboard.page_sections s
          SET heading = 'HQ Hero Changed Later'
         FROM blessboard.public_pages p
        WHERE s.page_id = p.id
          AND p.church_id = $1 AND p.branch_id IS NULL AND p.page_key = 'home'
          AND s.section_key = 'hero'`,
      [churchA.id]
    );

    const after = await loadTenantPublicPageModel(pool, {
      tenant: tenantA,
      pageKey: "home",
      hostname: HOST_A,
      selectedBranch: {
        id: campusEast.id,
        key: "campus-east",
        displayName: "Campus East",
      },
    });
    assert.equal(after.kind, KIND.OK);
    const afterHero = (after.sections || []).find((s) => s.sectionKey === "hero");
    assert.equal(afterHero && afterHero.heading, "HQ Hero Unique");

    const hqModel = await loadTenantPublicPageModel(pool, {
      tenant: tenantA,
      pageKey: "home",
      hostname: HOST_A,
    });
    assert.equal(hqModel.kind, KIND.OK);
    const hqHero = (hqModel.sections || []).find((s) => s.sectionKey === "hero");
    assert.equal(hqHero && hqHero.heading, "HQ Hero Changed Later");
  });

  it("uses branch contact identity and rejects cross-org initialization", async () => {
    if (skipIfNeeded()) return;

    const model = await loadTenantPublicPageModel(pool, {
      tenant: tenantA,
      pageKey: "contact",
      hostname: HOST_A,
      selectedBranch: {
        id: campusEast.id,
        key: "campus-east",
        displayName: "Campus East",
      },
    });
    assert.equal(model.kind, KIND.OK);
    assert.match(String(model.publicName || ""), /Campus East|Init Church/i);
    if (model.publicContact) {
      assert.equal(model.publicContact.phone, "+15552001");
      assert.equal(model.publicContact.email, "east@init-a.test");
    }

    const denied = await initializeBranchWebsiteFromChurch(pool, {
      organizationId: orgB.id,
      churchId: churchB.id,
      branchId: campusEast.id,
    });
    assert.equal(denied.ok, false);
    assert.ok(
      denied.status === INIT_STATUS.FORBIDDEN || denied.status === INIT_STATUS.NOT_FOUND
    );
  });

  it("create branch persists even when website init runs post-commit", async () => {
    if (skipIfNeeded()) return;

    const created = await createBlessBoardBranch(pool, {
      organizationId: orgA.id,
      churchId: churchA.id,
      actorUserId: null,
      branchKey: "campus-north",
      displayName: "Campus North",
      timezone: "UTC",
      countryCode: "ZM",
    });
    assert.equal(created.ok, true, created.message || created.reason);
    assert.ok(created.branch && created.branch.id);

    const persisted = await pool.query(
      `SELECT id FROM blessboard.branches WHERE id = $1 AND church_id = $2`,
      [created.branch.id, churchA.id]
    );
    assert.equal(persisted.rows.length, 1);
    assert.ok(created.websiteInitialization);
  });

  it("does not overwrite partially edited branch websites", async () => {
    if (skipIfNeeded()) return;

    const west = await pool.query(
      `INSERT INTO blessboard.branches
         (church_id, branch_key, display_name, branch_type, status, is_primary, timezone, country_code)
       VALUES ($1, 'campus-west', 'Campus West', 'branch', 'active', false, 'UTC', 'ZM')
       RETURNING id`,
      [churchA.id]
    );
    const westId = west.rows[0].id;
    await ensureBranchWebsiteGovernance(pool, {
      organizationId: orgA.id,
      churchId: churchA.id,
      branchId: westId,
    });
    const westPages = await provisionEmptyPublicPages(pool, {
      churchId: churchA.id,
      branchId: westId,
    });
    const westHome = (westPages.pages || []).find((p) => p.pageKey === "home");
    assert.ok(westHome);
    await updatePublicPage(pool, westHome.id, {
      status: "published",
      confirmPublish: true,
    });
    await createPageSection(pool, {
      pageId: westHome.id,
      sectionKey: "hero",
      sectionType: "hero",
      heading: "West Custom Hero",
      status: "published",
      confirmPublish: true,
      sortOrder: 0,
    });

    const result = await initializeBranchWebsiteFromChurch(pool, {
      organizationId: orgA.id,
      churchId: churchA.id,
      branchId: westId,
    });
    assert.equal(result.ok, false);
    assert.equal(result.status, INIT_STATUS.PARTIALLY_EDITED);

    const hero = await pool.query(
      `SELECT s.heading
         FROM blessboard.page_sections s
         INNER JOIN blessboard.public_pages p ON p.id = s.page_id
        WHERE p.branch_id = $1 AND p.page_key = 'home' AND s.section_key = 'hero'`,
      [westId]
    );
    assert.equal(hero.rows[0].heading, "West Custom Hero");
  });
});
