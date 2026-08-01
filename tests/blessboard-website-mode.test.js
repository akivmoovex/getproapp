"use strict";

/**
 * Website mode foundation — single_site vs multi_site from active branch count.
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
  STATUS,
  WEBSITE_MODE,
  deriveWebsiteMode,
  branchMayHaveIndependentPublicWebsite,
  resolveWebsiteMode,
} = require("../src/blessboard/services/resolveWebsiteMode");
const { listBlessBoardBranches } = require("../src/blessboard/services/listBlessBoardBranches");

const IDENTITY_KEY = "blessboard-platform-v5";

describe("blessboard website mode resolver (pure)", () => {
  it("0 active branches → single_site", () => {
    const mode = deriveWebsiteMode([]);
    assert.equal(mode.ok, true);
    assert.equal(mode.activeBranchCount, 0);
    assert.equal(mode.websiteMode, WEBSITE_MODE.SINGLE_SITE);
    assert.equal(mode.primaryActiveBranch, null);
    assert.equal(mode.churchWideContentBranchId, null);
    assert.equal(branchMayHaveIndependentPublicWebsite(mode, "hq"), false);
  });

  it("1 active branch → single_site; no independent branch website", () => {
    const mode = deriveWebsiteMode([
      {
        id: "11111111-1111-1111-1111-111111111111",
        key: "hq",
        displayName: "HQ",
        branchType: "hq",
        isPrimary: true,
      },
    ]);
    assert.equal(mode.activeBranchCount, 1);
    assert.equal(mode.websiteMode, WEBSITE_MODE.SINGLE_SITE);
    assert.equal(mode.primaryActiveBranch.key, "hq");
    assert.equal(mode.primaryActiveBranch.id, "11111111-1111-1111-1111-111111111111");
    assert.equal(mode.churchWideContentBranchId, null);
    assert.equal(branchMayHaveIndependentPublicWebsite(mode, "hq"), false);
    assert.equal(
      branchMayHaveIndependentPublicWebsite(mode, {
        id: "11111111-1111-1111-1111-111111111111",
      }),
      false
    );
  });

  it("2+ active branches → multi_site; only listed actives may have independent sites", () => {
    const hq = {
      id: "11111111-1111-1111-1111-111111111111",
      key: "hq",
      displayName: "HQ",
      branchType: "hq",
      isPrimary: true,
    };
    const east = {
      id: "22222222-2222-2222-2222-222222222222",
      key: "campus-east",
      displayName: "East",
      branchType: "branch",
      isPrimary: false,
    };
    const mode = deriveWebsiteMode([hq, east]);
    assert.equal(mode.activeBranchCount, 2);
    assert.equal(mode.websiteMode, WEBSITE_MODE.MULTI_SITE);
    assert.equal(mode.primaryActiveBranch.key, "hq");
    assert.equal(mode.churchWideContentBranchId, null);

    assert.equal(branchMayHaveIndependentPublicWebsite(mode, "hq"), true);
    assert.equal(branchMayHaveIndependentPublicWebsite(mode, "campus-east"), true);
    assert.equal(branchMayHaveIndependentPublicWebsite(mode, east), true);
    assert.equal(branchMayHaveIndependentPublicWebsite(mode, "campus-old"), false);
    assert.equal(branchMayHaveIndependentPublicWebsite(mode, null), false);
  });

  it("picks isPrimary for primaryActiveBranch when not first in list", () => {
    const mode = deriveWebsiteMode([
      {
        id: "22222222-2222-2222-2222-222222222222",
        key: "campus-east",
        displayName: "East",
        isPrimary: false,
      },
      {
        id: "11111111-1111-1111-1111-111111111111",
        key: "hq",
        displayName: "HQ",
        isPrimary: true,
      },
    ]);
    assert.equal(mode.primaryActiveBranch.key, "hq");
  });

  it("ignores malformed rows without id/key", () => {
    const mode = deriveWebsiteMode([
      { displayName: "orphan" },
      {
        id: "11111111-1111-1111-1111-111111111111",
        key: "hq",
        isPrimary: true,
      },
    ]);
    assert.equal(mode.activeBranchCount, 1);
    assert.equal(mode.websiteMode, WEBSITE_MODE.SINGLE_SITE);
  });
});

describe("blessboard website mode resolver (db)", () => {
  let pool;
  let skipSuite = false;
  let skipReason = "";
  let churchA;
  let hqBranchA;
  let campusEastId;

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

      const orgA = await provisionPlatformTenant(pool, {
        organizationKey: "wm-a",
        displayName: "WM Org A",
        legalName: null,
        dataEnvironment: "testing",
        productKey: "blessboard",
        productTenantKey: "wm-a",
        hostname: "wm-a.blessboard.org",
        domainType: "canonical",
        deploymentCode: "blessboard-org-staging",
        isPrimary: true,
      });
      assert.equal(orgA.ok, true, orgA.message);

      const chA = await provisionBlessBoardChurch(pool, {
        organizationKey: "wm-a",
        churchKey: "wm-a",
        displayName: "Website Mode Church A",
        dataEnvironment: "testing",
        hqBranchKey: "hq",
        hqBranchDisplayName: "HQ A",
      });
      assert.equal(chA.ok, true, chA.message);
      churchA = chA.records.church;
      hqBranchA = chA.records.hqBranch;
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

  it("provisioned church with one active branch is single_site", async () => {
    requireDb();
    const mode = await resolveWebsiteMode(pool, {
      churchId: churchA.id,
      branchKey: "hq",
    });
    assert.equal(mode.ok, true);
    assert.equal(mode.status, STATUS.OK);
    assert.equal(mode.activeBranchCount, 1);
    assert.equal(mode.websiteMode, WEBSITE_MODE.SINGLE_SITE);
    assert.equal(mode.primaryActiveBranch.id, String(hqBranchA.id));
    assert.equal(mode.primaryActiveBranch.key, "hq");
    assert.equal(mode.churchWideContentBranchId, null);
    assert.equal(mode.requestedBranchMayHaveIndependentPublicWebsite, false);
  });

  it("inactive branches do not change website mode", async () => {
    requireDb();
    await pool.query(
      `INSERT INTO blessboard.branches
         (church_id, branch_key, display_name, branch_type, status, is_primary, timezone, country_code)
       VALUES ($1, 'campus-old', 'Campus Old', 'branch', 'inactive', false, 'UTC', 'US')`,
      [churchA.id]
    );

    const mode = await resolveWebsiteMode(pool, { churchId: churchA.id });
    assert.equal(mode.ok, true);
    assert.equal(mode.activeBranchCount, 1);
    assert.equal(mode.websiteMode, WEBSITE_MODE.SINGLE_SITE);
    assert.equal(
      branchMayHaveIndependentPublicWebsite(mode, "campus-old"),
      false
    );
  });

  it("two active branches → multi_site; requested active branch may be independent", async () => {
    requireDb();
    const inserted = await pool.query(
      `INSERT INTO blessboard.branches
         (church_id, branch_key, display_name, branch_type, status, is_primary, timezone, country_code)
       VALUES ($1, 'campus-east', 'Campus East', 'branch', 'active', false, 'UTC', 'US')
       RETURNING id`,
      [churchA.id]
    );
    campusEastId = inserted.rows[0].id;

    const mode = await resolveWebsiteMode(pool, {
      churchId: churchA.id,
      branchKey: "campus-east",
    });
    assert.equal(mode.ok, true);
    assert.equal(mode.activeBranchCount, 2);
    assert.equal(mode.websiteMode, WEBSITE_MODE.MULTI_SITE);
    assert.equal(mode.requestedBranchMayHaveIndependentPublicWebsite, true);
    assert.equal(mode.churchWideContentBranchId, null);

    const inactiveReq = await resolveWebsiteMode(pool, {
      churchId: churchA.id,
      branchKey: "campus-old",
    });
    assert.equal(inactiveReq.websiteMode, WEBSITE_MODE.MULTI_SITE);
    assert.equal(inactiveReq.requestedBranchMayHaveIndependentPublicWebsite, false);
  });

  it("reuses prefetched activeBranches without a second list query shape", async () => {
    requireDb();
    const listed = await listBlessBoardBranches(pool, churchA.id);
    assert.equal(listed.ok, true);
    // listBlessBoardBranches strips ids — resolver needs id-bearing rows for primary.
    // Prefer resolveWebsiteMode's own list, or pass id-bearing DTOs:
    const fromDb = await resolveWebsiteMode(pool, { churchId: churchA.id });
    const reused = await resolveWebsiteMode(pool, {
      churchId: churchA.id,
      activeBranches: fromDb.activeBranches,
      branchId: String(campusEastId),
    });
    assert.equal(reused.ok, true);
    assert.equal(reused.activeBranchCount, fromDb.activeBranchCount);
    assert.equal(reused.websiteMode, WEBSITE_MODE.MULTI_SITE);
    assert.equal(reused.requestedBranchMayHaveIndependentPublicWebsite, true);
    // Compatibility: listBlessBoardBranches still omits ids from its DTO.
    assert.equal(Object.prototype.hasOwnProperty.call(listed.branches[0], "id"), false);
  });

  it("rejects missing churchId", async () => {
    requireDb();
    const mode = await resolveWebsiteMode(pool, {});
    assert.equal(mode.ok, false);
    assert.equal(mode.status, STATUS.INVALID_INPUT);
    assert.equal(mode.websiteMode, WEBSITE_MODE.SINGLE_SITE);
  });
});
