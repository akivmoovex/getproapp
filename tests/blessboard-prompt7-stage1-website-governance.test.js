"use strict";

/**
 * Prompt 7 Stage 1 — branch website governance + scope settings foundation.
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
} = require("../src/blessboard/services/blessBoardSettingsService");
const {
  provisionEmptyPublicPages,
  updatePublicPage,
  createPageSection,
} = require("../src/blessboard/services/publicContentAdminService");
const {
  buildBlessBoardTenantContext,
} = require("../src/blessboard/http/buildBlessBoardTenantContext");
const {
  loadTenantPublicPageModel,
  KIND,
} = require("../src/blessboard/http/loadTenantPublicPageModel");
const approvalRepo = require("../src/blessboard/repositories/websiteApprovalSettingsRepository");
const {
  getBranchWebsiteGovernance,
  upsertBranchWebsiteGovernance,
  ensureBranchWebsiteGovernance,
  STATUS: GOV_STATUS,
} = require("../src/blessboard/services/branchWebsiteGovernanceService");
const {
  resolveWebsiteScopeField,
  setWebsiteScopeOverride,
  resetWebsiteScopeField,
  listWebsiteScopeFieldStates,
  INHERITANCE_STATE,
  STATUS: SCOPE_STATUS,
} = require("../src/blessboard/services/websiteScopeSettingsService");

const IDENTITY_KEY = "blessboard-platform-v5";
const HOST_A = "stage1-a.blessboard.org";
const HOST_B = "stage1-b.blessboard.org";

describe("blessboard prompt7 stage1 website governance foundation", () => {
  let pool;
  let skipSuite = false;
  let skipReason = "";
  let orgA;
  let churchA;
  let hqBranchA;
  let campusEast;
  let orgB;
  let churchB;
  let hqBranchB;
  let tenantA;
  let backfillReport;

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

      const identity = await pool.query(
        `SELECT identity_key, environment_code FROM platform.database_identity LIMIT 1`
      );
      assert.equal(identity.rows[0].identity_key, IDENTITY_KEY);
      assert.equal(identity.rows[0].environment_code, "testing");

      const schemaCheck = await pool.query(
        `SELECT to_regclass('blessboard.branch_website_governance') AS gov,
                to_regclass('blessboard.website_scope_settings') AS scope`
      );
      assert.ok(schemaCheck.rows[0].gov, "052 branch_website_governance missing");
      assert.ok(schemaCheck.rows[0].scope, "052 website_scope_settings missing");

      const provA = await provisionPlatformTenant(pool, {
        organizationKey: "stage1-a",
        displayName: "Stage1 Org A",
        legalName: null,
        dataEnvironment: "testing",
        productKey: "blessboard",
        productTenantKey: "stage1-a",
        hostname: HOST_A,
        domainType: "canonical",
        deploymentCode: "blessboard-org-v5",
        isPrimary: true,
      });
      assert.equal(provA.ok, true, provA.message);
      orgA = provA.records.organization;

      const chA = await provisionBlessBoardChurch(pool, {
        organizationKey: "stage1-a",
        churchKey: "stage1-a",
        displayName: "Stage1 Church A",
        dataEnvironment: "testing",
        hqBranchKey: "hq",
        hqBranchDisplayName: "Stage1 HQ",
      });
      assert.equal(chA.ok, true, chA.message);
      churchA = chA.records.church;
      hqBranchA = chA.records.hqBranch;

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

      const provB = await provisionPlatformTenant(pool, {
        organizationKey: "stage1-b",
        displayName: "Stage1 Org B",
        legalName: null,
        dataEnvironment: "testing",
        productKey: "blessboard",
        productTenantKey: "stage1-b",
        hostname: HOST_B,
        domainType: "canonical",
        deploymentCode: "blessboard-org-v5",
        isPrimary: true,
      });
      assert.equal(provB.ok, true, provB.message);
      orgB = provB.records.organization;

      const chB = await provisionBlessBoardChurch(pool, {
        organizationKey: "stage1-b",
        churchKey: "stage1-b",
        displayName: "Stage1 Church B",
        dataEnvironment: "testing",
        hqBranchKey: "hq",
        hqBranchDisplayName: "Stage1 B HQ",
      });
      assert.equal(chB.ok, true, chB.message);
      churchB = chB.records.church;
      hqBranchB = chB.records.hqBranch;

      await ensureChurchSettingsInitialized(pool, churchA.id);
      await updateChurchSettings(pool, churchA.id, {
        publicName: "Stage1 Church A",
        websiteStatus: "published",
        primaryEmail: "church@stage1-a.test",
        primaryPhone: "+15551001",
      });
      await ensureChurchSettingsInitialized(pool, churchB.id);
      await updateChurchSettings(pool, churchB.id, {
        publicName: "Stage1 Church B",
        websiteStatus: "published",
      });

      tenantA = buildBlessBoardTenantContext({
        organization: { id: orgA.id, key: "stage1-a" },
        church: {
          id: churchA.id,
          churchKey: "stage1-a",
          displayName: "Stage1 Church A",
          dataEnvironment: "testing",
        },
        hqBranch: {
          id: hqBranchA.id,
          branchKey: hqBranchA.branch_key || "hq",
          displayName: hqBranchA.display_name || "Stage1 HQ",
        },
        primaryBranch: {
          id: hqBranchA.id,
          branchKey: hqBranchA.branch_key || "hq",
          displayName: hqBranchA.display_name || "Stage1 HQ",
        },
      });

      // Ensure HQ also has governance (created after migrate backfill via provision).
      await ensureBranchWebsiteGovernance(pool, {
        organizationId: orgA.id,
        churchId: churchA.id,
        branchId: hqBranchA.id,
      });
      await ensureBranchWebsiteGovernance(pool, {
        organizationId: orgB.id,
        churchId: churchB.id,
        branchId: hqBranchB.id,
      });

      const branchCount = await pool.query(`SELECT COUNT(*)::int AS n FROM blessboard.branches`);
      const govCount = await pool.query(
        `SELECT COUNT(*)::int AS n FROM blessboard.branch_website_governance`
      );
      const scopeCount = await pool.query(
        `SELECT COUNT(*)::int AS n FROM blessboard.website_scope_settings WHERE is_active = true`
      );
      const pagesChurch = await pool.query(
        `SELECT COUNT(*)::int AS n FROM blessboard.public_pages WHERE branch_id IS NULL`
      );
      const pagesBranch = await pool.query(
        `SELECT COUNT(*)::int AS n FROM blessboard.public_pages WHERE branch_id IS NOT NULL`
      );
      backfillReport = {
        identityKey: IDENTITY_KEY,
        environmentCode: "testing",
        branches: branchCount.rows[0].n,
        governanceRows: govCount.rows[0].n,
        activeScopeOverrides: scopeCount.rows[0].n,
        churchWidePages: pagesChurch.rows[0].n,
        branchPages: pagesBranch.rows[0].n,
      };
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

  it("migration backfill: governance covers all branches; no scope overrides invented", () => {
    requireDb();
    assert.ok(backfillReport.branches >= 3);
    assert.equal(backfillReport.governanceRows, backfillReport.branches);
    assert.equal(backfillReport.activeScopeOverrides, 0);
    assert.ok(backfillReport.churchWidePages >= 0);
  });

  it("org allow_branch_giving_methods defaults false; effective local giving requires both flags", async () => {
    requireDb();
    const orgDefaults = await approvalRepo.getSettings(pool, orgA.id);
    assert.equal(orgDefaults.allowBranchGivingMethods, false);
    assert.equal(orgDefaults.allowBranchUrgentUpdates, false);

    let gov = await getBranchWebsiteGovernance(pool, {
      organizationId: orgA.id,
      churchId: churchA.id,
      branchId: campusEast.id,
    });
    assert.equal(gov.ok, true);
    assert.equal(gov.effective.allowLocalGivingMethods, false);
    assert.equal(gov.governance.branchPublishMode, "hq_approval");

    await approvalRepo.upsertSettings(pool, {
      ...orgDefaults,
      organizationId: orgA.id,
      allowBranchGivingMethods: true,
      updatedBy: null,
    });
    await upsertBranchWebsiteGovernance(pool, {
      organizationId: orgA.id,
      churchId: churchA.id,
      branchId: campusEast.id,
      allowLocalGivingMethods: true,
      branchPublishMode: "hq_approval",
    });
    gov = await getBranchWebsiteGovernance(pool, {
      organizationId: orgA.id,
      churchId: churchA.id,
      branchId: campusEast.id,
    });
    assert.equal(gov.effective.allowLocalGivingMethods, true);
  });

  it("cross-organization branch governance returns forbidden", async () => {
    requireDb();
    const res = await getBranchWebsiteGovernance(pool, {
      organizationId: orgA.id,
      churchId: churchA.id,
      branchId: hqBranchB.id,
    });
    assert.equal(res.ok, false);
    assert.equal(res.status, GOV_STATUS.FORBIDDEN);
  });

  it("cross-organization scope override returns forbidden", async () => {
    requireDb();
    const res = await setWebsiteScopeOverride(pool, {
      organizationId: orgA.id,
      churchId: churchA.id,
      branchId: hqBranchB.id,
      settingKey: "seo",
      valueJson: { title: "leak" },
    });
    assert.equal(res.ok, false);
    assert.equal(res.status, SCOPE_STATUS.FORBIDDEN);
  });

  it("cross-branch override does not mutate sibling branch", async () => {
    requireDb();
    const east = await setWebsiteScopeOverride(pool, {
      organizationId: orgA.id,
      churchId: churchA.id,
      branchId: campusEast.id,
      settingKey: "hero_content",
      valueJson: { heading: "East hero" },
    });
    assert.equal(east.ok, true);

    const hqState = await resolveWebsiteScopeField(pool, {
      organizationId: orgA.id,
      churchId: churchA.id,
      branchId: hqBranchA.id,
      settingKey: "hero_content",
      churchDefault: { heading: "Church hero" },
    });
    assert.equal(hqState.ok, true);
    assert.equal(hqState.state, INHERITANCE_STATE.INHERIT);
    assert.deepEqual(hqState.value, { heading: "Church hero" });

    const eastState = await resolveWebsiteScopeField(pool, {
      organizationId: orgA.id,
      churchId: churchA.id,
      branchId: campusEast.id,
      settingKey: "hero_content",
      churchDefault: { heading: "Church hero" },
    });
    assert.equal(eastState.state, INHERITANCE_STATE.OVERRIDE);
    assert.equal(eastState.value.heading, "East hero");
  });

  it("reset deactivates override and resumes church default without copying", async () => {
    requireDb();
    await setWebsiteScopeOverride(pool, {
      organizationId: orgA.id,
      churchId: churchA.id,
      branchId: campusEast.id,
      settingKey: "contact_details",
      valueJson: { email: "east@stage1-a.test" },
    });
    const reset = await resetWebsiteScopeField(pool, {
      organizationId: orgA.id,
      churchId: churchA.id,
      branchId: campusEast.id,
      settingKey: "contact_details",
    });
    assert.equal(reset.ok, true);
    assert.ok(reset.deactivated >= 1);

    const resolved = await resolveWebsiteScopeField(pool, {
      organizationId: orgA.id,
      churchId: churchA.id,
      branchId: campusEast.id,
      settingKey: "contact_details",
      churchDefault: { email: "church@stage1-a.test" },
    });
    assert.equal(resolved.state, INHERITANCE_STATE.INHERIT);
    assert.equal(resolved.value.email, "church@stage1-a.test");

    const active = await pool.query(
      `SELECT COUNT(*)::int AS n FROM blessboard.website_scope_settings
        WHERE branch_id = $1 AND setting_key = 'contact_details' AND is_active = true`,
      [campusEast.id]
    );
    assert.equal(active.rows[0].n, 0);
  });

  it("locked setting keys reject override and reset", async () => {
    requireDb();
    await upsertBranchWebsiteGovernance(pool, {
      organizationId: orgA.id,
      churchId: churchA.id,
      branchId: campusEast.id,
      allowLocalGivingMethods: true,
      lockedSettingKeys: ["seo"],
    });
    const locked = await setWebsiteScopeOverride(pool, {
      organizationId: orgA.id,
      churchId: churchA.id,
      branchId: campusEast.id,
      settingKey: "seo",
      valueJson: { title: "nope" },
    });
    assert.equal(locked.ok, false);
    assert.equal(locked.status, SCOPE_STATUS.LOCKED);

    const states = await listWebsiteScopeFieldStates(pool, {
      organizationId: orgA.id,
      churchId: churchA.id,
      branchId: campusEast.id,
      settingKeys: ["seo", "hero_content"],
    });
    assert.equal(states.ok, true);
    const seo = states.fields.find((f) => f.settingKey === "seo");
    assert.equal(seo.locked, true);
  });

  it("church-wide public model does not mirror primary branch page content", async () => {
    requireDb();
    const churchPages = await provisionEmptyPublicPages(pool, { churchId: churchA.id });
    const homeChurch = churchPages.pages.find((p) => p.pageKey === "home");
    await updatePublicPage(pool, homeChurch.id, { status: "published" });
    await createPageSection(pool, {
      pageId: homeChurch.id,
      sectionKey: "church-home-hero",
      sectionType: "hero",
      heading: "Whole Church Hero",
      bodyText: "Organization-wide welcome",
      status: "published",
    });

    const branchPages = await provisionEmptyPublicPages(pool, {
      churchId: churchA.id,
      branchId: hqBranchA.id,
    });
    const homeHq = branchPages.pages.find((p) => p.pageKey === "home");
    await updatePublicPage(pool, homeHq.id, { status: "published" });
    await createPageSection(pool, {
      pageId: homeHq.id,
      sectionKey: "hq-home-hero",
      sectionType: "hero",
      heading: "Primary Branch Hero",
      bodyText: "Should not appear on church-wide URL",
      status: "published",
    });

    const model = await loadTenantPublicPageModel(pool, {
      tenant: tenantA,
      pageKey: "home",
      hostname: HOST_A,
      pathPrefix: "",
      routingMode: "tenant",
    });
    assert.equal(model.kind, KIND.OK);
    assert.equal(model.websiteScope.scopeType, "church");
    assert.equal(model.websiteScope.contentBranchId, null);
    const headings = (model.sections || []).map((s) => s.heading).join(" ");
    assert.match(headings, /Whole Church Hero/);
    assert.doesNotMatch(headings, /Primary Branch Hero/);
  });

  it("explicit branch URL still resolves branch-scoped content", async () => {
    requireDb();
    const model = await loadTenantPublicPageModel(pool, {
      tenant: tenantA,
      pageKey: "home",
      hostname: HOST_A,
      pathPrefix: `/branches/${hqBranchA.branch_key}`,
      routingMode: "tenant",
      selectedBranch: {
        id: hqBranchA.id,
        key: hqBranchA.branch_key,
        displayName: hqBranchA.display_name,
        isPrimary: true,
      },
    });
    assert.equal(model.kind, KIND.OK);
    assert.equal(model.websiteScope.scopeType, "branch");
    assert.equal(model.websiteScope.contentBranchId, String(hqBranchA.id));
    const headings = (model.sections || []).map((s) => s.heading).join(" ");
    assert.match(headings, /Primary Branch Hero/);
  });
});
