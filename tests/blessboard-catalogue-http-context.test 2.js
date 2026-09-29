"use strict";

/**
 * Diagnostic BlessBoard catalogue HTTP middleware tests (mocks + ephemeral DB where needed).
 */

const { describe, it, before, after } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");

const {
  createLoadBlessBoardCatalogueContext,
  RESULT_TYPES,
  evaluateApplicability,
} = require("../src/blessboard/http/loadBlessBoardCatalogueContext");
const {
  getBlessBoardCatalogueContext,
  STATUS,
} = require("../src/blessboard/services/getBlessBoardCatalogueContext");
const {
  comparePlatformAndLegacy,
  COMPARISON_CATEGORIES,
  COMPARISON_BASIS,
} = require("../src/platform/http/compareLegacyHostContext");
const {
  resetFoundationDatabase,
  createFoundationPool,
} = require("./helpers/foundationDb");
const { migrate } = require("../db/scripts/lib/migrator");
const { provisionPlatformTenant } = require("../src/platform/services/provisionPlatformTenant");
const { provisionBlessBoardChurch } = require("../src/blessboard/services/provisionBlessBoardChurch");

const ORG_ID = "11111111-1111-4111-8111-111111111111";
const CHURCH_ID = "22222222-2222-4222-8222-222222222222";
const HQ_ID = "33333333-3333-4333-8333-333333333333";
const PRIMARY_ID = "44444444-4444-4444-8444-444444444444";

function platformCtx(partial) {
  return {
    enabled: partial.enabled !== undefined ? partial.enabled : true,
    mode: "diagnostic",
    hostname: partial.hostname || "demo.blessboard.test",
    resultType: partial.resultType,
    resolution: partial.resolution !== undefined ? partial.resolution : null,
  };
}

function blessboardResolution(overrides) {
  return {
    type: "resolved_tenant",
    product: { key: "blessboard", ...(overrides.product || {}) },
    organization: {
      id: ORG_ID,
      key: "demo-church",
      dataEnvironment: "testing",
      ...(overrides.organization || {}),
    },
    deployment: { code: "blessboard-org-staging" },
    ...(overrides.extra || {}),
  };
}

function makeReq(overrides) {
  return {
    path: overrides.path || "/page",
    url: overrides.url || "/page",
    platformHostContext: overrides.platformHostContext,
    cookies: { sid: "keep" },
    session: { userId: 1 },
    ...overrides.extra,
  };
}

function makeRes() {
  const state = { statusCode: 200, redirected: false, headers: {}, body: null };
  return {
    state,
    status(code) {
      state.statusCode = code;
      return this;
    },
    redirect(url) {
      state.redirected = true;
      state.redirectUrl = url;
      return this;
    },
    setHeader(k, v) {
      state.headers[k] = v;
    },
  };
}

async function runMiddleware(mw, req, res) {
  let nextCalls = 0;
  await new Promise((resolve, reject) => {
    const maybePromise = mw(req, res, (err) => {
      nextCalls += 1;
      if (err) reject(err);
      else resolve();
    });
    if (maybePromise && typeof maybePromise.then === "function") {
      maybePromise.catch(reject);
    }
  });
  return { nextCalls };
}

describe("blessboard catalogue http context — applicability", () => {
  it("disabled platform host context performs no catalogue lookup", async () => {
    let calls = 0;
    const mw = createLoadBlessBoardCatalogueContext({
      getPool: () => {
        throw new Error("pool must not be created");
      },
      getCatalogueContext: async () => {
        calls += 1;
        throw new Error("lookup must not run");
      },
    });
    const req = makeReq({
      platformHostContext: { enabled: false, mode: "off" },
    });
    const res = makeRes();
    const { nextCalls } = await runMiddleware(mw, req, res);
    assert.equal(nextCalls, 1);
    assert.equal(calls, 0);
    assert.equal(req.blessBoardCatalogueContext.enabled, false);
    assert.equal(req.blessBoardCatalogueContext.reason, "platform_context_disabled");
    assert.equal(req.blessBoardCatalogueContext.resultType, RESULT_TYPES.PLATFORM_CONTEXT_DISABLED);
    assert.equal(res.state.statusCode, 200);
    assert.equal(res.state.redirected, false);
  });

  it("resolved_apex performs no catalogue lookup", async () => {
    let calls = 0;
    const mw = createLoadBlessBoardCatalogueContext({
      getPool: () => ({ query: async () => ({ rows: [] }) }),
      getCatalogueContext: async () => {
        calls += 1;
        return { ok: true, status: STATUS.OK, context: null };
      },
    });
    const req = makeReq({
      platformHostContext: platformCtx({
        resultType: "resolved_apex",
        resolution: { type: "resolved_apex", product: { key: "blessboard" }, organization: null },
      }),
    });
    const res = makeRes();
    await runMiddleware(mw, req, res);
    assert.equal(calls, 0);
    assert.equal(req.blessBoardCatalogueContext.applicable, false);
    assert.equal(req.blessBoardCatalogueContext.resultType, RESULT_TYPES.PLATFORM_NOT_RESOLVED);
  });

  it("unknown_domain performs no catalogue lookup", async () => {
    let calls = 0;
    const mw = createLoadBlessBoardCatalogueContext({
      getPool: () => ({ query: async () => ({ rows: [] }) }),
      getCatalogueContext: async () => {
        calls += 1;
      },
    });
    const req = makeReq({
      platformHostContext: platformCtx({ resultType: "unknown_domain", resolution: null }),
    });
    await runMiddleware(mw, req, makeRes());
    assert.equal(calls, 0);
    assert.equal(req.blessBoardCatalogueContext.applicable, false);
  });

  it("getpro tenant performs no BlessBoard lookup", async () => {
    let calls = 0;
    const mw = createLoadBlessBoardCatalogueContext({
      getPool: () => ({ query: async () => ({ rows: [] }) }),
      getCatalogueContext: async () => {
        calls += 1;
      },
    });
    const req = makeReq({
      platformHostContext: platformCtx({
        resultType: "resolved_tenant",
        resolution: {
          type: "resolved_tenant",
          product: { key: "getpro" },
          organization: { id: ORG_ID, key: "acme" },
        },
      }),
    });
    await runMiddleware(mw, req, makeRes());
    assert.equal(calls, 0);
    assert.equal(req.blessBoardCatalogueContext.reason, "not_blessboard_tenant");
    assert.equal(req.blessBoardCatalogueContext.resultType, RESULT_TYPES.NOT_APPLICABLE);
  });

  it("ngo tenant performs no BlessBoard lookup", async () => {
    assert.deepEqual(
      evaluateApplicability(
        platformCtx({
          resultType: "resolved_tenant",
          resolution: {
            type: "resolved_tenant",
            product: { key: "ngo" },
            organization: { id: ORG_ID, key: "ngo-org" },
          },
        })
      ),
      { applicable: false, reason: "not_blessboard_tenant", organizationId: null }
    );
  });

  it("resolved BlessBoard tenant performs one catalogue lookup", async () => {
    let calls = 0;
    const mw = createLoadBlessBoardCatalogueContext({
      getPool: () => ({ query: async () => ({ rows: [] }) }),
      getCatalogueContext: async (_db, organizationId) => {
        calls += 1;
        assert.equal(organizationId, ORG_ID);
        return {
          ok: true,
          status: STATUS.OK,
          context: {
            church: {
              id: CHURCH_ID,
              key: "demo-church",
              displayName: "Demo Church",
              status: "active",
              dataEnvironment: "testing",
            },
            hqBranch: {
              id: HQ_ID,
              key: "hq",
              displayName: "Headquarters",
              status: "active",
            },
            primaryBranch: {
              id: HQ_ID,
              key: "hq",
              displayName: "Headquarters",
              status: "active",
              branchType: "hq",
            },
          },
        };
      },
    });
    const req = makeReq({
      platformHostContext: platformCtx({
        resultType: "resolved_tenant",
        resolution: blessboardResolution({}),
      }),
    });
    await runMiddleware(mw, req, makeRes());
    assert.equal(calls, 1);
    assert.equal(req.blessBoardCatalogueContext.resultType, RESULT_TYPES.RESOLVED);
  });

  it("missing organization ID performs no lookup", async () => {
    let calls = 0;
    const mw = createLoadBlessBoardCatalogueContext({
      getPool: () => ({ query: async () => ({ rows: [] }) }),
      getCatalogueContext: async () => {
        calls += 1;
      },
    });
    const req = makeReq({
      platformHostContext: platformCtx({
        resultType: "resolved_tenant",
        resolution: blessboardResolution({ organization: { id: null, key: "demo-church" } }),
      }),
    });
    await runMiddleware(mw, req, makeRes());
    assert.equal(calls, 0);
    assert.equal(req.blessBoardCatalogueContext.reason, "missing_organization_id");
  });
});

describe("blessboard catalogue http context — resolved shape", () => {
  it("active church + HQ + primary returns resolved without raw rows", async () => {
    const mw = createLoadBlessBoardCatalogueContext({
      getPool: () => ({ query: async () => ({ rows: [] }) }),
      getCatalogueContext: async () => ({
        ok: true,
        status: STATUS.OK,
        context: {
          church: {
            id: CHURCH_ID,
            key: "demo-church",
            displayName: "Demo Church",
            status: "active",
            dataEnvironment: "testing",
            organization_id: "RAW_SHOULD_NOT_LEAK",
          },
          hqBranch: {
            id: HQ_ID,
            key: "hq",
            displayName: "Headquarters",
            status: "active",
          },
          primaryBranch: {
            id: HQ_ID,
            key: "hq",
            displayName: "Headquarters",
            status: "active",
            branchType: "hq",
          },
        },
      }),
    });
    const req = makeReq({
      platformHostContext: platformCtx({
        resultType: "resolved_tenant",
        resolution: blessboardResolution({}),
      }),
    });
    await runMiddleware(mw, req, makeRes());
    const ctx = req.blessBoardCatalogueContext;
    assert.equal(ctx.enabled, true);
    assert.equal(ctx.applicable, true);
    assert.equal(ctx.resultType, RESULT_TYPES.RESOLVED);
    assert.equal(ctx.organizationId, ORG_ID);
    assert.equal(ctx.church.id, CHURCH_ID);
    assert.equal(ctx.church.churchKey, "demo-church");
    assert.equal(ctx.hqBranch.branchKey, "hq");
    assert.equal(ctx.primaryBranch.branchKey, "hq");
    assert.equal(ctx.hqBranch.id, ctx.primaryBranch.id);
    assert.equal(ctx.church.organization_id, undefined);
    assert.equal(JSON.stringify(ctx).includes("RAW_SHOULD_NOT_LEAK"), false);
  });

  it("separate HQ and primary rows are returned correctly", async () => {
    const mw = createLoadBlessBoardCatalogueContext({
      getPool: () => ({ query: async () => ({ rows: [] }) }),
      getCatalogueContext: async () => ({
        ok: true,
        status: STATUS.OK,
        context: {
          church: {
            id: CHURCH_ID,
            key: "demo-church",
            displayName: "Demo",
            status: "active",
            dataEnvironment: "testing",
          },
          hqBranch: { id: HQ_ID, key: "hq", displayName: "HQ", status: "active" },
          primaryBranch: {
            id: PRIMARY_ID,
            key: "east",
            displayName: "East",
            status: "active",
            branchType: "branch",
          },
        },
      }),
    });
    const req = makeReq({
      platformHostContext: platformCtx({
        resultType: "resolved_tenant",
        resolution: blessboardResolution({}),
      }),
    });
    await runMiddleware(mw, req, makeRes());
    assert.equal(req.blessBoardCatalogueContext.hqBranch.id, HQ_ID);
    assert.equal(req.blessBoardCatalogueContext.primaryBranch.id, PRIMARY_ID);
    assert.notEqual(
      req.blessBoardCatalogueContext.hqBranch.id,
      req.blessBoardCatalogueContext.primaryBranch.id
    );
  });
});

describe("blessboard catalogue http context — typed failures", () => {
  const failureCases = [
    [STATUS.CHURCH_MISSING, RESULT_TYPES.CHURCH_MISSING],
    [STATUS.CHURCH_INACTIVE, RESULT_TYPES.CHURCH_INACTIVE],
    [STATUS.HQ_BRANCH_MISSING, RESULT_TYPES.HQ_BRANCH_MISSING],
    [STATUS.HQ_BRANCH_INACTIVE, RESULT_TYPES.HQ_BRANCH_INACTIVE],
    [STATUS.PRIMARY_BRANCH_MISSING, RESULT_TYPES.PRIMARY_BRANCH_MISSING],
    [STATUS.PRIMARY_BRANCH_INACTIVE, RESULT_TYPES.PRIMARY_BRANCH_INACTIVE],
  ];

  for (const [serviceStatus, resultType] of failureCases) {
    it(`${resultType} remains non-fatal`, async () => {
      const mw = createLoadBlessBoardCatalogueContext({
        getPool: () => ({ query: async () => ({ rows: [] }) }),
        getCatalogueContext: async () => ({
          ok: false,
          status: serviceStatus,
          context: {
            church:
              serviceStatus === STATUS.CHURCH_MISSING
                ? null
                : {
                    id: CHURCH_ID,
                    key: "demo-church",
                    displayName: "Demo",
                    status: serviceStatus === STATUS.CHURCH_INACTIVE ? "inactive" : "active",
                    dataEnvironment: "testing",
                  },
            hqBranch: null,
            primaryBranch: null,
          },
        }),
      });
      const req = makeReq({
        platformHostContext: platformCtx({
          resultType: "resolved_tenant",
          resolution: blessboardResolution({}),
        }),
      });
      const res = makeRes();
      const { nextCalls } = await runMiddleware(mw, req, res);
      assert.equal(nextCalls, 1);
      assert.equal(req.blessBoardCatalogueContext.resultType, resultType);
      assert.equal(res.state.statusCode, 200);
      assert.equal(res.state.redirected, false);
    });
  }

  it("repository exception becomes catalogue_lookup_error", async () => {
    const logs = [];
    const mw = createLoadBlessBoardCatalogueContext({
      getPool: () => ({ query: async () => ({ rows: [] }) }),
      getCatalogueContext: async () => {
        throw new Error("boom STACK secret");
      },
      log: (line) => logs.push(line),
    });
    const req = makeReq({
      platformHostContext: platformCtx({
        resultType: "resolved_tenant",
        resolution: blessboardResolution({}),
      }),
    });
    const res = makeRes();
    const { nextCalls } = await runMiddleware(mw, req, res);
    assert.equal(nextCalls, 1);
    assert.equal(req.blessBoardCatalogueContext.resultType, RESULT_TYPES.CATALOGUE_LOOKUP_ERROR);
    assert.equal(res.state.statusCode, 200);
    assert.equal(res.state.redirected, false);
    assert.equal(JSON.stringify(req.blessBoardCatalogueContext).includes("STACK"), false);
    assert.ok(logs.some((l) => /blessboard_catalogue_context/.test(l)));
    assert.ok(logs.every((l) => !/STACK|secret/i.test(l)));
  });
});

describe("blessboard catalogue http context — read-only", () => {
  it("middleware does not create a pool and service does not read process.env", async () => {
    let poolFactoryCalls = 0;
    const sharedPool = { query: async () => ({ rows: [] }) };
    const mw = createLoadBlessBoardCatalogueContext({
      getPool: () => {
        poolFactoryCalls += 1;
        return sharedPool;
      },
      getCatalogueContext: async (db) => {
        assert.equal(db, sharedPool);
        return {
          ok: true,
          status: STATUS.OK,
          context: {
            church: {
              id: CHURCH_ID,
              key: "demo-church",
              displayName: "Demo",
              status: "active",
              dataEnvironment: "testing",
            },
            hqBranch: { id: HQ_ID, key: "hq", displayName: "HQ", status: "active" },
            primaryBranch: {
              id: HQ_ID,
              key: "hq",
              displayName: "HQ",
              status: "active",
              branchType: "hq",
            },
          },
        };
      },
    });
    const req = makeReq({
      platformHostContext: platformCtx({
        resultType: "resolved_tenant",
        resolution: blessboardResolution({}),
      }),
    });
    await runMiddleware(mw, req, makeRes());
    assert.equal(poolFactoryCalls, 1);

    const serviceSrc = fs.readFileSync(
      path.join(__dirname, "../src/blessboard/services/getBlessBoardCatalogueContext.js"),
      "utf8"
    );
    const mwSrc = fs.readFileSync(
      path.join(__dirname, "../src/blessboard/http/loadBlessBoardCatalogueContext.js"),
      "utf8"
    );
    // Comments may mention process.env; executable reads must not.
    const stripComments = (src) =>
      src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
    assert.equal(/\bprocess\.env\b/.test(stripComments(serviceSrc)), false);
    assert.equal(/\bprocess\.env\b/.test(stripComments(mwSrc)), false);
    assert.doesNotMatch(mwSrc, /\b(migrate|provisionBlessBoardChurch|provisionPlatformTenant)\b/);
  });
});

describe("UUID-first comparison with catalogue context", () => {
  const platformWithOrg = (orgId, key) =>
    platformCtx({
      resultType: "resolved_tenant",
      resolution: {
        type: "resolved_tenant",
        organization: { id: orgId, key },
        product: { key: "blessboard" },
        deployment: { code: "blessboard-org-staging" },
      },
    });

  it("matching platform organization UUIDs produce match with organization_uuid", () => {
    const result = comparePlatformAndLegacy(
      platformWithOrg(ORG_ID, "demo-church"),
      {
        kind: "tenant",
        tenantKey: "different-key",
        productHint: "blessboard",
        organizationId: ORG_ID,
        churchId: null,
      },
      null
    );
    assert.equal(result.category, COMPARISON_CATEGORIES.MATCH);
    assert.equal(result.comparisonBasis, COMPARISON_BASIS.ORGANIZATION_UUID);
  });

  it("matching church UUIDs produce match with church_uuid", () => {
    const result = comparePlatformAndLegacy(
      platformWithOrg(ORG_ID, "demo-church"),
      {
        kind: "tenant",
        tenantKey: "other",
        productHint: "blessboard",
        organizationId: null,
        churchId: CHURCH_ID,
      },
      {
        enabled: true,
        applicable: true,
        resultType: "resolved",
        organizationId: ORG_ID,
        church: { id: CHURCH_ID, churchKey: "demo-church" },
        hqBranch: null,
        primaryBranch: null,
      }
    );
    assert.equal(result.category, COMPARISON_CATEGORIES.MATCH);
    assert.equal(result.comparisonBasis, COMPARISON_BASIS.CHURCH_UUID);
  });

  it("different UUIDs produce identity_mismatch", () => {
    const result = comparePlatformAndLegacy(
      platformWithOrg(ORG_ID, "demo-church"),
      {
        kind: "tenant",
        tenantKey: "demo-church",
        productHint: "blessboard",
        organizationId: "99999999-9999-4999-8999-999999999999",
        churchId: null,
      },
      null
    );
    assert.equal(result.category, COMPARISON_CATEGORIES.IDENTITY_MISMATCH);
    assert.equal(result.comparisonBasis, COMPARISON_BASIS.ORGANIZATION_UUID);
  });

  it("missing UUIDs fall back to product_and_key", () => {
    const result = comparePlatformAndLegacy(
      platformWithOrg(ORG_ID, "demo-church"),
      {
        kind: "tenant",
        tenantKey: "demo-church",
        productHint: "blessboard",
        organizationId: null,
        churchId: null,
      },
      null
    );
    assert.equal(result.category, COMPARISON_CATEGORIES.MATCH);
    assert.equal(result.comparisonBasis, COMPARISON_BASIS.PRODUCT_AND_KEY);
  });

  it("missing reliable identifiers produce not_comparable", () => {
    const result = comparePlatformAndLegacy(
      platformWithOrg(null, null),
      { kind: "none", tenantKey: null, productHint: null, organizationId: null, churchId: null },
      null
    );
    assert.equal(result.category, COMPARISON_CATEGORIES.NOT_COMPARABLE);
    assert.equal(result.comparisonBasis, COMPARISON_BASIS.NONE);
  });

  it("display names are never used for comparison", () => {
    const src = fs.readFileSync(
      path.join(__dirname, "../src/platform/http/compareLegacyHostContext.js"),
      "utf8"
    );
    assert.doesNotMatch(src, /displayName|display_name/);
  });
});

describe("blessboard catalogue http context — live lookup write check", () => {
  let databaseUrl;
  let pool;
  let skipSuite = false;
  let skipReason = "";
  let organizationId;

  before(async () => {
    try {
      databaseUrl = await resetFoundationDatabase();
      pool = createFoundationPool(databaseUrl);
      await migrate({ connectionString: databaseUrl });
      const platform = await provisionPlatformTenant(pool, {
        organizationKey: "http-ctx-church",
        displayName: "HTTP Ctx Church",
        legalName: null,
        dataEnvironment: "testing",
        productKey: "blessboard",
        productTenantKey: "http-ctx-church",
        hostname: "http-ctx.blessboard.test",
        domainType: "canonical",
        deploymentCode: "blessboard-org-staging",
        isPrimary: true,
      });
      organizationId = platform.records.organization.id;
      await provisionBlessBoardChurch(pool, {
        organizationKey: "http-ctx-church",
        churchKey: "http-ctx-church",
        displayName: "HTTP Ctx Church",
        legalName: null,
        dataEnvironment: "testing",
        hqBranchKey: "hq",
        hqBranchDisplayName: "Headquarters",
      });
    } catch (err) {
      skipSuite = true;
      skipReason = err && err.message ? err.message : String(err);
    }
  });

  after(async () => {
    if (pool) await pool.end();
  });

  it("middleware performs no writes against live DB", async () => {
    if (skipSuite) assert.fail(`Local PostgreSQL unavailable: ${skipReason}`);
    const before = await pool.query(
      `SELECT
         (SELECT COUNT(*)::int FROM blessboard.churches) AS churches,
         (SELECT COUNT(*)::int FROM blessboard.branches) AS branches`
    );
    const mw = createLoadBlessBoardCatalogueContext({
      getPool: () => pool,
      getCatalogueContext: getBlessBoardCatalogueContext,
    });
    const req = makeReq({
      platformHostContext: platformCtx({
        resultType: "resolved_tenant",
        resolution: {
          type: "resolved_tenant",
          product: { key: "blessboard" },
          organization: {
            id: organizationId,
            key: "http-ctx-church",
            dataEnvironment: "testing",
          },
        },
      }),
    });
    await runMiddleware(mw, req, makeRes());
    assert.equal(req.blessBoardCatalogueContext.resultType, RESULT_TYPES.RESOLVED);
    const after = await pool.query(
      `SELECT
         (SELECT COUNT(*)::int FROM blessboard.churches) AS churches,
         (SELECT COUNT(*)::int FROM blessboard.branches) AS branches`
    );
    assert.deepEqual(after.rows[0], before.rows[0]);
  });
});
