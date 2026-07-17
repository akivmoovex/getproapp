"use strict";

/**
 * Ephemeral diagnostic integration: provision → resolve → compare.
 * Does not alter HTTP routing behavior.
 */

const { describe, it, before, after } = require("node:test");
const assert = require("node:assert/strict");

const {
  resetFoundationDatabase,
  createFoundationPool,
} = require("./helpers/foundationDb");
const { migrate } = require("../db/scripts/lib/migrator");
const { provisionPlatformTenant, STATUS } = require("../src/platform/services/provisionPlatformTenant");
const { resolveHostname, RESULT_TYPES } = require("../src/platform/services/resolveHostname");
const {
  createCompareLegacyHostContext,
  COMPARISON_CATEGORIES,
} = require("../src/platform/http/compareLegacyHostContext");
const { MODE_DIAGNOSTIC } = require("../src/platform/config/platformHostContextMode");

async function runMw(mw, req) {
  await new Promise((resolve, reject) => {
    mw(req, { locals: {} }, (err) => (err ? reject(err) : resolve()));
  });
}

describe("platform diagnostic integration", () => {
  let databaseUrl;
  let pool;
  let skipSuite = false;
  let skipReason = "";

  before(async () => {
    try {
      databaseUrl = await resetFoundationDatabase();
      pool = createFoundationPool(databaseUrl);
      await migrate({ connectionString: databaseUrl });
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

  it("provisions BlessBoard diagnostic org and resolves match / mismatch / legacy_only / platform_only", async () => {
    requireDb();

    const provisioned = await provisionPlatformTenant(pool, {
      organizationKey: "demo-church",
      displayName: "Demo Church",
      dataEnvironment: "testing",
      productKey: "blessboard",
      productTenantKey: "demo-church",
      hostname: "demo.blessboard.test",
      domainType: "canonical",
      deploymentCode: "blessboard-org-v5",
      isPrimary: true,
    });
    assert.equal(provisioned.ok, true);
    assert.ok(
      provisioned.status === STATUS.PROVISIONED || provisioned.status === STATUS.ALREADY_PROVISIONED
    );

    const resolved = await resolveHostname(pool, "demo.blessboard.test", {
      expectedDeploymentCode: "blessboard-org-v5",
    });
    assert.equal(resolved.type, RESULT_TYPES.RESOLVED_TENANT);
    assert.equal(resolved.organization.key, "demo-church");
    assert.equal(resolved.deployment.code, "blessboard-org-v5");

    const compare = createCompareLegacyHostContext({
      getMode: () => MODE_DIAGNOSTIC,
      log: () => {},
    });

    const matchReq = {
      path: "/page",
      platformHostContext: {
        enabled: true,
        mode: "diagnostic",
        expectedDeploymentCode: "blessboard-org-v5",
        deploymentComparisonAvailable: true,
        hostname: resolved.hostname,
        resultType: resolved.type,
        resolution: resolved,
      },
      isChurchHost: true,
      churchContext: {
        kind: "branch",
        orgSlug: "demo-church",
        organization: { slug: "demo-church" },
      },
    };
    await runMw(compare, matchReq);
    assert.equal(matchReq.platformHostComparison.category, COMPARISON_CATEGORIES.MATCH);

    const mismatch = await resolveHostname(pool, "demo.blessboard.test", {
      expectedDeploymentCode: "blessboard-com-v4",
    });
    assert.equal(mismatch.type, RESULT_TYPES.DEPLOYMENT_MISMATCH);

    const legacyOnlyReq = {
      path: "/page",
      platformHostContext: {
        enabled: true,
        mode: "diagnostic",
        expectedDeploymentCode: null,
        deploymentComparisonAvailable: false,
        hostname: "legacy-only.blessboard.test",
        resultType: RESULT_TYPES.UNKNOWN_DOMAIN,
        resolution: {
          type: RESULT_TYPES.UNKNOWN_DOMAIN,
          hostname: "legacy-only.blessboard.test",
          domain: null,
          deployment: null,
          product: null,
          organization: null,
          organizationProduct: null,
        },
      },
      isChurchHost: true,
      churchContext: {
        kind: "branch",
        orgSlug: "legacy-only-church",
        organization: { slug: "legacy-only-church" },
      },
    };
    await runMw(compare, legacyOnlyReq);
    assert.equal(legacyOnlyReq.platformHostComparison.category, COMPARISON_CATEGORIES.LEGACY_ONLY);

    const platformOnlyReq = {
      path: "/page",
      platformHostContext: {
        enabled: true,
        mode: "diagnostic",
        expectedDeploymentCode: "blessboard-org-v5",
        deploymentComparisonAvailable: true,
        hostname: resolved.hostname,
        resultType: resolved.type,
        resolution: resolved,
      },
      isChurchHost: false,
      churchContext: null,
      tenant: null,
    };
    await runMw(compare, platformOnlyReq);
    assert.equal(platformOnlyReq.platformHostComparison.category, COMPARISON_CATEGORIES.PLATFORM_ONLY);
  });
});
