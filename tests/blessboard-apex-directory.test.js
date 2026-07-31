"use strict";

/**
 * Regression: V5 apex GET /directory against platform/blessboard schema.
 * Reproduces hosted testing data_environment=testing shape that previously
 * vanished under the legacy production|pilot|demo-only SQL filter.
 */

const assert = require("node:assert/strict");
const { describe, it, before, after } = require("node:test");
const crypto = require("node:crypto");
const request = require("supertest");

const {
  resetFoundationDatabase,
  createFoundationPool,
} = require("./helpers/foundationDb");
const { migrate } = require("../db/scripts/lib/migrator");
const { ensureDatabaseIdentity } = require("../db/scripts/lib/databaseIdentity");
const { createV5FoundationApp } = require("../src/platform/http/v5FoundationServer");
const {
  baseV5TestEnv,
  V5_IDENTITY_KEY,
  V5_DEPLOYMENT_CODE,
} = require("./helpers/blessboardV5Fixtures");
const { provisionPlatformTenant } = require("../src/platform/services/provisionPlatformTenant");
const { provisionBlessBoardChurch } = require("../src/blessboard/services/provisionBlessBoardChurch");
const {
  ensureChurchSettingsInitialized,
  updateChurchSettings,
  ensureBranchSettingsInitialized,
  updateBranchSettings,
} = require("../src/blessboard/services/blessBoardSettingsService");
const directoryRepo = require("../src/blessboard/repositories/publicChurchDirectoryRepository");

const APEX = "blessboard.org";

function uniq(prefix) {
  return `${prefix}-${crypto.randomBytes(3).toString("hex")}`;
}

describe("blessboard apex public directory", () => {
  let pool;
  let databaseUrl;
  let skipSuite = false;
  let skipReason = "";
  let prevDeploymentEnv;

  /** @type {Record<string, any>} */
  const fixtures = {};

  before(async () => {
    prevDeploymentEnv = process.env.DEPLOYMENT_ENV;
    process.env.DEPLOYMENT_ENV = "testing";
    try {
      databaseUrl = await resetFoundationDatabase();
      pool = createFoundationPool(databaseUrl);
      await migrate({ connectionString: databaseUrl });
      await ensureDatabaseIdentity(pool, {
        connectionString: databaseUrl,
        identityKey: V5_IDENTITY_KEY,
        environmentCode: "testing",
      });

      async function provisionListed({
        key,
        displayName,
        dataEnvironment = "testing",
        websiteStatus = "published",
        orgStatus = "active",
        churchStatus = "active",
        skipSettings = false,
        extraBranches = 0,
        city = null,
        countryCode = null,
        deactivateBranches = false,
      }) {
        const orgKey = uniq(key);
        const prov = await provisionPlatformTenant(pool, {
          organizationKey: orgKey,
          displayName,
          legalName: null,
          dataEnvironment,
          productKey: "blessboard",
          productTenantKey: orgKey,
          hostname: `${orgKey}.example.test`,
          domainType: "canonical",
          deploymentCode: V5_DEPLOYMENT_CODE,
          isPrimary: true,
        });
        assert.equal(prov.ok, true, prov.message || "provisionPlatformTenant");
        const ch = await provisionBlessBoardChurch(pool, {
          organizationKey: orgKey,
          churchKey: orgKey,
          displayName,
          dataEnvironment,
          hqBranchKey: "hq",
          hqBranchDisplayName: `${displayName} HQ`,
        });
        assert.equal(ch.ok, true, ch.message || "provisionBlessBoardChurch");
        const churchId = ch.records.church.id;
        const branchId = ch.records.hqBranch.id;

        if (!skipSettings) {
          await ensureChurchSettingsInitialized(pool, churchId);
          const up = await updateChurchSettings(pool, churchId, {
            publicName: displayName,
            websiteStatus,
          });
          assert.equal(up.ok, true, up.message || "updateChurchSettings");
        }

        if (city || countryCode) {
          await ensureBranchSettingsInitialized(pool, branchId);
          const branchUp = await updateBranchSettings(pool, branchId, {
            publicName: `${displayName} HQ`,
            city: city || undefined,
            countryCode: countryCode || undefined,
          });
          assert.equal(branchUp.ok, true, branchUp.message || "updateBranchSettings");
        }

        for (let i = 0; i < extraBranches; i += 1) {
          await pool.query(
            `INSERT INTO blessboard.branches
               (church_id, branch_key, display_name, branch_type, status, is_primary)
             VALUES ($1, $2, $3, 'branch', 'active', false)`,
            [churchId, `campus-${i + 1}`, `${displayName} Campus ${i + 1}`]
          );
        }

        if (deactivateBranches) {
          await pool.query(`UPDATE blessboard.branches SET status = 'inactive' WHERE church_id = $1`, [
            churchId,
          ]);
        }

        if (orgStatus !== "active") {
          await pool.query(`UPDATE platform.organizations SET status = $2 WHERE id = $1`, [
            prov.records.organization.id,
            orgStatus,
          ]);
        }
        if (churchStatus !== "active") {
          await pool.query(`UPDATE blessboard.churches SET status = $2 WHERE id = $1`, [
            churchId,
            churchStatus,
          ]);
        }

        return {
          orgKey,
          churchId,
          branchId,
          displayName,
          organizationId: prov.records.organization.id,
          dataEnvironment,
        };
      }

      // Real hosted shape: Foundation/testing tenants with data_environment=testing.
      fixtures.foundationTesting = await provisionListed({
        key: "dir-found",
        displayName: "Directory Foundation Chapel",
        dataEnvironment: "testing",
        websiteStatus: "published",
        city: "Lusaka",
        countryCode: "ZM",
      });
      fixtures.growthTesting = await provisionListed({
        key: "dir-growth",
        displayName: "Directory Growth Chapel",
        dataEnvironment: "testing",
        websiteStatus: "published",
      });
      // Optional settings row absent — not an explicit unpublish.
      fixtures.noSettings = await provisionListed({
        key: "dir-noset",
        displayName: "Directory No Settings Chapel",
        dataEnvironment: "testing",
        skipSettings: true,
      });
      fixtures.production = await provisionListed({
        key: "dir-prod",
        displayName: "Directory Production Chapel",
        dataEnvironment: "production",
        websiteStatus: "published",
      });
      fixtures.unpublished = await provisionListed({
        key: "dir-draft",
        displayName: "Directory Draft Chapel",
        dataEnvironment: "testing",
        websiteStatus: "draft",
      });
      fixtures.suspendedChurch = await provisionListed({
        key: "dir-susp",
        displayName: "Directory Suspended Chapel",
        dataEnvironment: "testing",
        websiteStatus: "published",
        churchStatus: "suspended",
      });
      fixtures.inactiveOrg = await provisionListed({
        key: "dir-inact",
        displayName: "Directory Inactive Org Chapel",
        dataEnvironment: "testing",
        websiteStatus: "published",
        orgStatus: "inactive",
      });
      fixtures.inactiveChurch = await provisionListed({
        key: "dir-inch",
        displayName: "Directory Inactive Church Chapel",
        dataEnvironment: "testing",
        websiteStatus: "published",
        churchStatus: "inactive",
      });
      fixtures.noActiveBranch = await provisionListed({
        key: "dir-nobr",
        displayName: "Directory No Branch Chapel",
        dataEnvironment: "testing",
        websiteStatus: "published",
        deactivateBranches: true,
      });
      fixtures.multiBranch = await provisionListed({
        key: "dir-multi",
        displayName: "Directory Multi Branch Chapel",
        dataEnvironment: "testing",
        websiteStatus: "published",
        extraBranches: 2,
      });
    } catch (err) {
      skipSuite = true;
      skipReason = err && err.message ? err.message : String(err);
    }
  });

  after(async () => {
    if (prevDeploymentEnv === undefined) delete process.env.DEPLOYMENT_ENV;
    else process.env.DEPLOYMENT_ENV = prevDeploymentEnv;
    if (pool) await pool.end().catch(() => {});
  });

  function requireDb() {
    if (skipSuite) assert.fail(`Local PostgreSQL unavailable: ${skipReason}`);
  }

  function makeApp(envExtra = {}) {
    return createV5FoundationApp({
      env: baseV5TestEnv({
        BLESSBOARD_TENANT_ROUTING_MODE: "off",
        DEPLOYMENT_ENV: "testing",
        ...envExtra,
      }),
      getPool: () => pool,
    });
  }

  it("existing provisioned Foundation and Growth testing churches appear", async () => {
    requireDb();
    const app = makeApp();
    const res = await request(app).get("/directory").set("Host", APEX);
    assert.equal(res.status, 200);
    assert.doesNotMatch(res.text, /Directory temporarily unavailable/);
    assert.match(res.text, /Directory Foundation Chapel/);
    assert.match(res.text, /Directory Growth Chapel/);
    assert.match(res.text, new RegExp(`href="/c/${fixtures.foundationTesting.orgKey}"`));
    assert.match(res.text, new RegExp(`href="/c/${fixtures.growthTesting.orgKey}"`));
  });

  it("church without church_settings row appears; explicit draft does not", async () => {
    requireDb();
    const app = makeApp();
    const res = await request(app).get("/directory").set("Host", APEX);
    assert.equal(res.status, 200);
    assert.match(res.text, /Directory No Settings Chapel/);
    assert.doesNotMatch(res.text, /Directory Draft Chapel/);
  });

  it("hides inactive org, inactive/suspended church, and churches without active branches", async () => {
    requireDb();
    const app = makeApp();
    const res = await request(app).get("/directory").set("Host", APEX);
    assert.equal(res.status, 200);
    assert.doesNotMatch(res.text, /Directory Inactive Org Chapel/);
    assert.doesNotMatch(res.text, /Directory Inactive Church Chapel/);
    assert.doesNotMatch(res.text, /Directory Suspended Chapel/);
    assert.doesNotMatch(res.text, /Directory No Branch Chapel/);
  });

  it("testing records appear on testing deployment and stay hidden on production deployment", async () => {
    requireDb();
    process.env.DEPLOYMENT_ENV = "testing";
    const onTesting = await directoryRepo.searchPublicOrganizations(pool, {});
    const testingKeys = onTesting.items.map((i) => i.slug);
    assert.ok(testingKeys.includes(fixtures.foundationTesting.orgKey));
    assert.ok(testingKeys.includes(fixtures.growthTesting.orgKey));

    process.env.DEPLOYMENT_ENV = "production";
    try {
      const onProduction = await directoryRepo.searchPublicOrganizations(pool, {});
      const prodKeys = onProduction.items.map((i) => i.slug);
      assert.ok(!prodKeys.includes(fixtures.foundationTesting.orgKey));
      assert.ok(!prodKeys.includes(fixtures.growthTesting.orgKey));
      assert.ok(prodKeys.includes(fixtures.production.orgKey));
    } finally {
      process.env.DEPLOYMENT_ENV = "testing";
    }

    const appProd = makeApp({ DEPLOYMENT_ENV: "production" });
    // App env alone does not flip process.env; force process gate used by SQL helper.
    process.env.DEPLOYMENT_ENV = "production";
    try {
      const res = await request(appProd).get("/directory").set("Host", APEX);
      assert.equal(res.status, 200);
      assert.match(res.text, /Directory Production Chapel/);
      assert.doesNotMatch(res.text, /Directory Foundation Chapel/);
      assert.doesNotMatch(res.text, /Directory Growth Chapel/);
    } finally {
      process.env.DEPLOYMENT_ENV = "testing";
    }
  });

  it("search finds eligible church; empty search uses normal empty state", async () => {
    requireDb();
    const app = makeApp();
    const hit = await request(app)
      .get(`/directory?q=${encodeURIComponent("Directory Foundation")}`)
      .set("Host", APEX);
    assert.equal(hit.status, 200);
    assert.match(hit.text, /Directory Foundation Chapel/);
    assert.doesNotMatch(hit.text, /Directory temporarily unavailable/);

    const miss = await request(app)
      .get("/directory?q=zzzz-no-such-church-xyz")
      .set("Host", APEX);
    assert.equal(miss.status, 200);
    assert.match(miss.text, /data-bb-directory-state="empty"/);
    assert.match(miss.text, /No churches found/);
    assert.doesNotMatch(miss.text, /Directory temporarily unavailable/);
  });

  it("multi-branch church appears once with /c/:organizationKey visit link", async () => {
    requireDb();
    process.env.DEPLOYMENT_ENV = "testing";
    const listed = await directoryRepo.searchPublicOrganizations(pool, {
      q: fixtures.multiBranch.displayName,
    });
    const matches = listed.items.filter((i) => i.slug === fixtures.multiBranch.orgKey);
    assert.equal(matches.length, 1);
    assert.ok(matches[0].active_branch_count >= 3);

    const app = makeApp();
    const res = await request(app).get("/directory").set("Host", APEX);
    assert.equal(res.status, 200);
    const occurrences = res.text.split(`href="/c/${fixtures.multiBranch.orgKey}"`).length - 1;
    assert.equal(occurrences, 1);
    assert.match(res.text, /Directory Multi Branch Chapel/);
  });

  it("simulated repository error shows safe unavailable message without internals", async () => {
    requireDb();
    const app = createV5FoundationApp({
      env: baseV5TestEnv({
        BLESSBOARD_TENANT_ROUTING_MODE: "off",
        DEPLOYMENT_ENV: "testing",
      }),
      getPool: () => pool,
      apexMarketingDeps: {
        getPool: () => ({
          query: async () => {
            const err = new Error("simulated directory failure");
            err.code = "XX000";
            throw err;
          },
        }),
      },
    });
    const res = await request(app).get("/directory").set("Host", APEX);
    assert.equal(res.status, 200);
    assert.match(res.text, /Directory temporarily unavailable/);
    assert.doesNotMatch(res.text, /simulated directory failure|XX000|church_organizations|stack|password/i);
  });

  it("works on BlessBoard apex host; tenant host does not serve apex directory", async () => {
    requireDb();
    const app = makeApp();
    const apex = await request(app).get("/directory").set("Host", APEX);
    assert.equal(apex.status, 200);
    assert.match(apex.text, /data-bb-shell="apex"/);

    const tenant = await request(app)
      .get("/directory")
      .set("Host", `${fixtures.foundationTesting.orgKey}.example.test`);
    assert.equal(tenant.status, 404);
  });
});
