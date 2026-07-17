"use strict";

/**
 * Read-only BlessBoard catalogue context lookup tests.
 */

const { describe, it, before, after } = require("node:test");
const assert = require("node:assert/strict");

const {
  resetFoundationDatabase,
  createFoundationPool,
} = require("./helpers/foundationDb");
const { migrate } = require("../db/scripts/lib/migrator");
const { provisionPlatformTenant } = require("../src/platform/services/provisionPlatformTenant");
const { provisionBlessBoardChurch } = require("../src/blessboard/services/provisionBlessBoardChurch");
const {
  getBlessBoardCatalogueContext,
  STATUS,
} = require("../src/blessboard/services/getBlessBoardCatalogueContext");

describe("blessboard catalogue lookup", () => {
  let databaseUrl;
  let pool;
  let skipSuite = false;
  let skipReason = "";
  let organizationId;
  let churchId;

  before(async () => {
    try {
      databaseUrl = await resetFoundationDatabase();
      pool = createFoundationPool(databaseUrl);
      await migrate({ connectionString: databaseUrl });

      const platform = await provisionPlatformTenant(pool, {
        organizationKey: "lookup-church",
        displayName: "Lookup Church",
        legalName: null,
        dataEnvironment: "testing",
        productKey: "blessboard",
        productTenantKey: "lookup-church",
        hostname: "lookup.blessboard.test",
        domainType: "canonical",
        deploymentCode: "blessboard-org-v5",
        isPrimary: true,
      });
      assert.equal(platform.ok, true);
      organizationId = platform.records.organization.id;

      const church = await provisionBlessBoardChurch(pool, {
        organizationKey: "lookup-church",
        churchKey: "lookup-church",
        displayName: "Lookup Church",
        legalName: null,
        dataEnvironment: "testing",
        hqBranchKey: "hq",
        hqBranchDisplayName: "Headquarters",
        timezone: "Africa/Lusaka",
        countryCode: "ZM",
      });
      assert.equal(church.ok, true);
      churchId = church.records.church.id;
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

  it("returns church and HQ branch for organization id", async () => {
    requireDb();
    const result = await getBlessBoardCatalogueContext(pool, organizationId);
    assert.equal(result.ok, true);
    assert.equal(result.status, STATUS.OK);
    assert.equal(result.context.church.key, "lookup-church");
    assert.equal(result.context.hqBranch.key, "hq");
    assert.equal(result.context.hqBranch.isPrimary, true);
    assert.equal(result.context.primaryBranch.key, "hq");
  });

  it("missing church returns typed missing result", async () => {
    requireDb();
    const platform = await provisionPlatformTenant(pool, {
      organizationKey: "no-church-org",
      displayName: "No Church",
      legalName: null,
      dataEnvironment: "testing",
      productKey: "blessboard",
      productTenantKey: "no-church-org",
      hostname: "no-church.blessboard.test",
      domainType: "canonical",
      deploymentCode: "blessboard-org-v5",
      isPrimary: true,
    });
    const result = await getBlessBoardCatalogueContext(pool, platform.records.organization.id);
    assert.equal(result.ok, false);
    assert.equal(result.status, STATUS.CHURCH_MISSING);
    assert.equal(result.context.church, null);
  });

  it("inactive church returns typed inactive result", async () => {
    requireDb();
    await pool.query(`UPDATE blessboard.churches SET status = 'inactive' WHERE id = $1`, [churchId]);
    const result = await getBlessBoardCatalogueContext(pool, organizationId);
    assert.equal(result.ok, false);
    assert.equal(result.status, STATUS.CHURCH_INACTIVE);
    await pool.query(`UPDATE blessboard.churches SET status = 'active' WHERE id = $1`, [churchId]);
  });

  it("missing HQ branch is handled explicitly", async () => {
    requireDb();
    const platform = await provisionPlatformTenant(pool, {
      organizationKey: "no-hq-org",
      displayName: "No HQ",
      legalName: null,
      dataEnvironment: "testing",
      productKey: "blessboard",
      productTenantKey: "no-hq-org",
      hostname: "no-hq.blessboard.test",
      domainType: "canonical",
      deploymentCode: "blessboard-org-v5",
      isPrimary: true,
    });
    await pool.query(
      `INSERT INTO blessboard.churches
         (organization_id, church_key, display_name, status, data_environment)
       VALUES ($1, 'no-hq-church', 'No HQ', 'active', 'testing')`,
      [platform.records.organization.id]
    );
    const result = await getBlessBoardCatalogueContext(pool, platform.records.organization.id);
    assert.equal(result.ok, false);
    assert.equal(result.status, STATUS.HQ_BRANCH_MISSING);
  });

  it("lookup performs no writes", async () => {
    requireDb();
    const before = await pool.query(
      `SELECT
         (SELECT COUNT(*)::int FROM blessboard.churches) AS churches,
         (SELECT COUNT(*)::int FROM blessboard.branches) AS branches,
         (SELECT COUNT(*)::int FROM platform.organizations) AS organizations`
    );
    await getBlessBoardCatalogueContext(pool, organizationId);
    await getBlessBoardCatalogueContext(pool, "00000000-0000-4000-8000-000000000001");
    const after = await pool.query(
      `SELECT
         (SELECT COUNT(*)::int FROM blessboard.churches) AS churches,
         (SELECT COUNT(*)::int FROM blessboard.branches) AS branches,
         (SELECT COUNT(*)::int FROM platform.organizations) AS organizations`
    );
    assert.deepEqual(after.rows[0], before.rows[0]);
  });
});
