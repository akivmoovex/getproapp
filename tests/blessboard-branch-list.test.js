"use strict";

/**
 * BlessBoard V5 branch list service — active-only DTOs, church ownership, no UUID leakage.
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
  listBlessBoardBranches,
  resolveBlessBoardBranchForChurch,
  STATUS,
} = require("../src/blessboard/services/listBlessBoardBranches");

const IDENTITY_KEY = "blessboard-platform-v5";

describe("blessboard branch-list", () => {
  let pool;
  let skipSuite = false;
  let skipReason = "";
  let churchA;
  let churchB;
  let campusAId;

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
        organizationKey: "bl-a",
        displayName: "BL Org A",
        legalName: null,
        dataEnvironment: "testing",
        productKey: "blessboard",
        productTenantKey: "bl-a",
        hostname: "bl-a.blessboard.org",
        domainType: "canonical",
        deploymentCode: "blessboard-org-v5",
        isPrimary: true,
      });
      assert.equal(orgA.ok, true, orgA.message);

      const orgB = await provisionPlatformTenant(pool, {
        organizationKey: "bl-b",
        displayName: "BL Org B",
        legalName: null,
        dataEnvironment: "testing",
        productKey: "blessboard",
        productTenantKey: "bl-b",
        hostname: "bl-b.blessboard.org",
        domainType: "canonical",
        deploymentCode: "blessboard-org-v5",
        isPrimary: true,
      });
      assert.equal(orgB.ok, true, orgB.message);

      const chA = await provisionBlessBoardChurch(pool, {
        organizationKey: "bl-a",
        churchKey: "bl-a",
        displayName: "Branch List Church A",
        dataEnvironment: "testing",
        hqBranchKey: "hq",
        hqBranchDisplayName: "HQ A",
      });
      assert.equal(chA.ok, true, chA.message);
      churchA = chA.records.church;

      const chB = await provisionBlessBoardChurch(pool, {
        organizationKey: "bl-b",
        churchKey: "bl-b",
        displayName: "Branch List Church B",
        dataEnvironment: "testing",
        hqBranchKey: "hq",
        hqBranchDisplayName: "HQ B",
      });
      assert.equal(chB.ok, true, chB.message);
      churchB = chB.records.church;

      const campus = await pool.query(
        `INSERT INTO blessboard.branches
           (church_id, branch_key, display_name, branch_type, status, is_primary, timezone, country_code)
         VALUES ($1, 'campus-north', 'Campus North', 'branch', 'active', false, 'UTC', 'US')
         RETURNING id`,
        [churchA.id]
      );
      campusAId = campus.rows[0].id;

      await pool.query(
        `INSERT INTO blessboard.branches
           (church_id, branch_key, display_name, branch_type, status, is_primary, timezone, country_code)
         VALUES ($1, 'campus-old', 'Campus Old', 'branch', 'inactive', false, 'UTC', 'US')`,
        [churchA.id]
      );
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

  it("lists active branches only with compact DTOs and real count", async () => {
    requireDb();
    const listed = await listBlessBoardBranches(pool, churchA.id);
    assert.equal(listed.ok, true, listed.message);
    assert.equal(listed.activeCount, 2);
    assert.equal(listed.branches.length, 2);
    assert.ok(listed.branches.some((b) => b.key === "hq"));
    assert.ok(listed.branches.some((b) => b.key === "campus-north"));
    assert.ok(!listed.branches.some((b) => b.key === "campus-old"));

    for (const branch of listed.branches) {
      assert.equal(Object.prototype.hasOwnProperty.call(branch, "id"), false);
      assert.equal(Object.prototype.hasOwnProperty.call(branch, "churchId"), false);
      assert.ok(branch.key);
      assert.ok(branch.displayName);
    }

    const serialized = JSON.stringify(listed.branches);
    assert.doesNotMatch(serialized, new RegExp(churchA.id, "i"));
    assert.doesNotMatch(serialized, new RegExp(campusAId, "i"));
  });

  it("resolves owned active branch keys and rejects foreign or inactive keys", async () => {
    requireDb();
    const owned = await resolveBlessBoardBranchForChurch(pool, churchA.id, "campus-north");
    assert.equal(owned.ok, true, owned.message);
    assert.equal(owned.branch.key, "campus-north");
    assert.equal(owned.branch.id, campusAId);

    const inactive = await resolveBlessBoardBranchForChurch(pool, churchA.id, "campus-old");
    assert.equal(inactive.ok, false);
    assert.equal(inactive.status, STATUS.INACTIVE);

    const foreign = await resolveBlessBoardBranchForChurch(pool, churchB.id, "campus-north");
    assert.equal(foreign.ok, false);
    assert.equal(foreign.status, STATUS.NOT_FOUND);

    const missing = await resolveBlessBoardBranchForChurch(pool, churchA.id, "does-not-exist");
    assert.equal(missing.ok, false);
    assert.equal(missing.status, STATUS.NOT_FOUND);
  });
});
