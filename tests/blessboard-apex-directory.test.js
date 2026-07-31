"use strict";

/**
 * Regression: V5 apex GET /directory against platform/blessboard schema.
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

  /** @type {Record<string, { orgKey: string, churchId: string, displayName: string }>} */
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
        dataEnvironment = "production",
        websiteStatus = "published",
        orgStatus = "active",
        churchStatus = "active",
        city = null,
        countryCode = null,
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

        await ensureChurchSettingsInitialized(pool, churchId);
        await updateChurchSettings(pool, churchId, {
          publicName: displayName,
          websiteStatus,
        });

        if (city || countryCode) {
          await ensureBranchSettingsInitialized(pool, branchId);
          const branchUp = await updateBranchSettings(pool, branchId, {
            publicName: `${displayName} HQ`,
            city: city || undefined,
            countryCode: countryCode || undefined,
          });
          assert.equal(branchUp.ok, true, branchUp.message || "updateBranchSettings");
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

        return { orgKey, churchId, displayName, organizationId: prov.records.organization.id };
      }

      fixtures.listed = await provisionListed({
        key: "dir-listed",
        displayName: "Directory Listed Chapel",
        dataEnvironment: "production",
        websiteStatus: "published",
        city: "Lusaka",
        countryCode: "ZM",
      });
      fixtures.unpublished = await provisionListed({
        key: "dir-draft",
        displayName: "Directory Draft Chapel",
        dataEnvironment: "production",
        websiteStatus: "draft",
      });
      fixtures.suspended = await provisionListed({
        key: "dir-susp",
        displayName: "Directory Suspended Chapel",
        dataEnvironment: "production",
        websiteStatus: "published",
        churchStatus: "suspended",
      });
      fixtures.inactiveOrg = await provisionListed({
        key: "dir-inact",
        displayName: "Directory Inactive Org Chapel",
        dataEnvironment: "production",
        websiteStatus: "published",
        orgStatus: "inactive",
      });
      fixtures.testingOnly = await provisionListed({
        key: "dir-test",
        displayName: "Directory Testing Only Chapel",
        dataEnvironment: "testing",
        websiteStatus: "published",
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

  function makeApp(envExtra = {}, depsExtra = {}) {
    return createV5FoundationApp({
      env: baseV5TestEnv({
        BLESSBOARD_TENANT_ROUTING_MODE: "off",
        DEPLOYMENT_ENV: "testing",
        ...envExtra,
      }),
      getPool: () => pool,
      ...depsExtra,
    });
  }

  it("GET /directory returns 200 on apex without unavailable fallback", async () => {
    requireDb();
    const app = makeApp();
    const res = await request(app).get("/directory").set("Host", APEX);
    assert.equal(res.status, 200);
    assert.doesNotMatch(res.text, /Directory temporarily unavailable/);
    assert.match(res.text, /data-bb-apex-page="directory"/);
    assert.match(res.text, /Directory Listed Chapel/);
    assert.match(res.text, /href="\/c\/dir-listed-/);
  });

  it("hides unpublished, suspended church, inactive org, and testing-only records", async () => {
    requireDb();
    const app = makeApp();
    const res = await request(app).get("/directory").set("Host", APEX);
    assert.equal(res.status, 200);
    assert.doesNotMatch(res.text, /Directory Draft Chapel/);
    assert.doesNotMatch(res.text, /Directory Suspended Chapel/);
    assert.doesNotMatch(res.text, /Directory Inactive Org Chapel/);
    assert.doesNotMatch(res.text, /Directory Testing Only Chapel/);
  });

  it("search filter matches known church and empty query shows empty state", async () => {
    requireDb();
    const app = makeApp();
    const hit = await request(app)
      .get(`/directory?q=${encodeURIComponent("Directory Listed")}`)
      .set("Host", APEX);
    assert.equal(hit.status, 200);
    assert.match(hit.text, /Directory Listed Chapel/);
    assert.doesNotMatch(hit.text, /Directory temporarily unavailable/);

    const miss = await request(app)
      .get("/directory?q=zzzz-no-such-church-xyz")
      .set("Host", APEX);
    assert.equal(miss.status, 200);
    assert.match(miss.text, /data-bb-directory-state="empty"/);
    assert.match(miss.text, /No churches found/);
    assert.doesNotMatch(miss.text, /Directory temporarily unavailable/);
    assert.doesNotMatch(miss.text, /church_organizations|relation \"|pg_|\bSELECT\b/i);
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
    assert.match(res.text, /data-bb-directory-state="unavailable"/);
    assert.doesNotMatch(res.text, /simulated directory failure|XX000|church_organizations|stack|password/i);
  });

  it("works on BlessBoard apex host; tenant host does not serve apex directory", async () => {
    requireDb();
    const app = makeApp({ BLESSBOARD_TENANT_ROUTING_MODE: "off" });
    const apex = await request(app).get("/directory").set("Host", APEX);
    assert.equal(apex.status, 200);
    assert.match(apex.text, /data-bb-shell="apex"/);

    const tenant = await request(app)
      .get("/directory")
      .set("Host", `${fixtures.listed.orgKey}.example.test`);
    assert.equal(tenant.status, 404);

    const features = await request(app).get("/features").set("Host", APEX);
    assert.equal(features.status, 200);
    assert.match(features.text, /data-bb-apex-page="features"/);
  });
});
