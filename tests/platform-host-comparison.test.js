"use strict";

/**
 * Deployment identity + platform vs legacy host comparison tests (mocks only).
 */

const { describe, it, afterEach } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");

const {
  getPlatformDeploymentCode,
  warnOnceIfDiagnosticDeploymentUnavailable,
  resetPlatformDeploymentCodeWarningForTests,
  STATUS_UNAVAILABLE,
  STATUS_INVALID,
} = require("../src/platform/config/platformDeploymentCode");
const { MODE_DIAGNOSTIC, MODE_OFF } = require("../src/platform/config/platformHostContextMode");
const {
  createCompareLegacyHostContext,
  comparePlatformAndLegacy,
  extractLegacyTenantIdentity,
  COMPARISON_CATEGORIES,
  COMPARISON_BASIS,
} = require("../src/platform/http/compareLegacyHostContext");
const { createLoadPlatformHostContext } = require("../src/platform/http/loadPlatformHostContext");
const { RESULT_TYPES } = require("../src/platform/services/resolveHostname");

function makeReq(overrides) {
  return {
    path: overrides.path || "/page",
    url: overrides.url || "/page",
    isChurchHost: overrides.isChurchHost || false,
    churchContext: overrides.churchContext || null,
    tenant: overrides.tenant || null,
    tenantSlug: overrides.tenantSlug || null,
    platformHostContext: overrides.platformHostContext,
    cookies: overrides.cookies || { sid: "keep" },
    session: overrides.session || { userId: 1 },
    ...overrides.extra,
  };
}

function makeRes() {
  const state = { statusCode: 200, redirected: false, locals: {}, body: null };
  return {
    state,
    locals: state.locals,
    status(code) {
      state.statusCode = code;
      return this;
    },
    redirect(url) {
      state.redirected = true;
      state.redirectUrl = url;
      return this;
    },
  };
}

async function runMiddleware(mw, req, res) {
  let nextCalls = 0;
  await new Promise((resolve, reject) => {
    mw(req, res, (err) => {
      nextCalls += 1;
      if (err) reject(err);
      else resolve();
    });
  });
  return { nextCalls };
}

function platformCtx(partial) {
  return {
    enabled: true,
    mode: "diagnostic",
    expectedDeploymentCode: partial.expectedDeploymentCode != null ? partial.expectedDeploymentCode : "blessboard-com-v4",
    deploymentComparisonAvailable: partial.deploymentComparisonAvailable !== false,
    hostname: partial.hostname || "demo.blessboard.com",
    resultType: partial.resultType,
    resolution: partial.resolution !== undefined ? partial.resolution : null,
  };
}

describe("platform deployment code config", () => {
  afterEach(() => {
    resetPlatformDeploymentCodeWarningForTests();
  });

  it("valid deployment code is normalized", () => {
    const r = getPlatformDeploymentCode({ PLATFORM_DEPLOYMENT_CODE: " BlessBoard-Com-V4 " });
    assert.equal(r.ok, true);
    assert.equal(r.code, "blessboard-com-v4");
  });

  it("missing deployment code is unavailable", () => {
    const r = getPlatformDeploymentCode({ PLATFORM_DEPLOYMENT_CODE: "" });
    assert.equal(r.ok, false);
    assert.equal(r.status, STATUS_UNAVAILABLE);
    assert.equal(r.code, null);
  });

  it("invalid deployment code is marked invalid", () => {
    const r = getPlatformDeploymentCode({ PLATFORM_DEPLOYMENT_CODE: "BlessBoard_Com_V4!" });
    assert.equal(r.ok, false);
    assert.equal(r.status, STATUS_INVALID);
  });

  it("database identity is not used as deployment identity", () => {
    const r = getPlatformDeploymentCode({
      PLATFORM_DEPLOYMENT_CODE: "",
      DATABASE_IDENTITY_EXPECTED: "testing",
      CHURCH_DB_IDENTITY_ENV: "production",
      NODE_ENV: "production",
    });
    assert.equal(r.ok, false);
    assert.equal(r.status, STATUS_UNAVAILABLE);
  });

  it("deployment code is not inferred from hostname", () => {
    const r = getPlatformDeploymentCode({
      PLATFORM_DEPLOYMENT_CODE: "",
      BASE_DOMAIN: "blessboard.com",
      HOST: "blessboard.org",
    });
    assert.equal(r.code, null);
  });

  it("diagnostic unavailable warns once", () => {
    const lines = [];
    warnOnceIfDiagnosticDeploymentUnavailable(
      MODE_DIAGNOSTIC,
      { ok: false, status: STATUS_UNAVAILABLE },
      (m) => lines.push(m)
    );
    warnOnceIfDiagnosticDeploymentUnavailable(
      MODE_DIAGNOSTIC,
      { ok: false, status: STATUS_UNAVAILABLE },
      (m) => lines.push(m)
    );
    assert.equal(lines.length, 1);
  });
});

describe("platform vs legacy host comparison", () => {
  it("matching stable tenant keys produce match", () => {
    const legacy = { kind: "tenant", tenantKey: "acme", productHint: "blessboard" };
    const result = comparePlatformAndLegacy(
      platformCtx({
        resultType: "resolved_tenant",
        resolution: {
          type: "resolved_tenant",
          organization: { key: "acme", dataEnvironment: "testing" },
          product: { key: "blessboard" },
          deployment: { code: "blessboard-com-v4" },
        },
      }),
      legacy
    );
    assert.equal(result.category, COMPARISON_CATEGORIES.MATCH);
    assert.equal(result.comparisonBasis, COMPARISON_BASIS.PRODUCT_AND_KEY);
  });

  it("legacy-only resolution produces legacy_only", () => {
    const result = comparePlatformAndLegacy(
      platformCtx({ resultType: "unknown_domain", resolution: null }),
      { kind: "tenant", tenantKey: "acme", productHint: "blessboard" }
    );
    assert.equal(result.category, COMPARISON_CATEGORIES.LEGACY_ONLY);
  });

  it("platform-only resolution produces platform_only", () => {
    const result = comparePlatformAndLegacy(
      platformCtx({
        resultType: "resolved_tenant",
        resolution: {
          type: "resolved_tenant",
          organization: { key: "acme" },
          product: { key: "blessboard" },
          deployment: { code: "blessboard-com-v4" },
        },
      }),
      { kind: "none", tenantKey: null, productHint: null }
    );
    assert.equal(result.category, COMPARISON_CATEGORIES.PLATFORM_ONLY);
  });

  it("different stable tenant identities produce identity_mismatch", () => {
    const result = comparePlatformAndLegacy(
      platformCtx({
        resultType: "resolved_tenant",
        resolution: {
          type: "resolved_tenant",
          organization: { key: "alpha" },
          product: { key: "blessboard" },
          deployment: { code: "blessboard-com-v4" },
        },
      }),
      { kind: "tenant", tenantKey: "beta", productHint: "blessboard" }
    );
    assert.equal(result.category, COMPARISON_CATEGORIES.IDENTITY_MISMATCH);
  });

  it("reliable different product identities produce product_mismatch", () => {
    const result = comparePlatformAndLegacy(
      platformCtx({
        resultType: "resolved_tenant",
        resolution: {
          type: "resolved_tenant",
          organization: { key: "acme" },
          product: { key: "getpro" },
          deployment: { code: "blessboard-com-v4" },
        },
      }),
      { kind: "tenant", tenantKey: "acme", productHint: "blessboard" }
    );
    assert.equal(result.category, COMPARISON_CATEGORIES.PRODUCT_MISMATCH);
  });

  it("apex result produces not_comparable", () => {
    const result = comparePlatformAndLegacy(
      platformCtx({
        resultType: "resolved_apex",
        resolution: { type: "resolved_apex", organization: null, product: { key: "blessboard" } },
      }),
      { kind: "apex", tenantKey: null, productHint: "blessboard" }
    );
    assert.equal(result.category, COMPARISON_CATEGORIES.NOT_COMPARABLE);
  });

  it("lookup_error produces not_comparable", () => {
    const result = comparePlatformAndLegacy(
      platformCtx({ resultType: "lookup_error", resolution: null }),
      { kind: "none", tenantKey: null, productHint: null }
    );
    assert.equal(result.category, COMPARISON_CATEGORIES.NOT_COMPARABLE);
  });

  it("missing shared stable identifier produces not_comparable", () => {
    const result = comparePlatformAndLegacy(
      platformCtx({
        resultType: "resolved_tenant",
        resolution: {
          type: "resolved_tenant",
          organization: null,
          product: { key: "blessboard" },
        },
      }),
      { kind: "church_unresolved", tenantKey: null, productHint: "blessboard" }
    );
    assert.equal(result.category, COMPARISON_CATEGORIES.NOT_COMPARABLE);
  });

  it("inactive platform status does not produce match", () => {
    const result = comparePlatformAndLegacy(
      platformCtx({
        resultType: "inactive_organization",
        resolution: {
          type: "inactive_organization",
          organization: { key: "acme", status: "inactive" },
          product: { key: "blessboard" },
        },
      }),
      { kind: "tenant", tenantKey: "acme", productHint: "blessboard" }
    );
    assert.notEqual(result.category, COMPARISON_CATEGORIES.MATCH);
  });

  it("extractLegacyTenantIdentity prefers church org slug", () => {
    const id = extractLegacyTenantIdentity(
      makeReq({
        isChurchHost: true,
        churchContext: {
          kind: "branch",
          orgSlug: "kafuebaptist",
          organization: { slug: "kafuebaptist", name: "Ignore Display Name" },
        },
      })
    );
    assert.equal(id.tenantKey, "kafuebaptist");
    assert.equal(id.productHint, "blessboard");
  });

  it("middleware always calls next and performs no database query", async () => {
    const mw = createCompareLegacyHostContext({
      getMode: () => MODE_DIAGNOSTIC,
      log: () => {},
    });
    const req = makeReq({
      platformHostContext: platformCtx({
        resultType: "resolved_tenant",
        resolution: {
          type: "resolved_tenant",
          organization: { key: "acme" },
          product: { key: "blessboard" },
          deployment: { code: "blessboard-com-v4" },
        },
      }),
      isChurchHost: true,
      churchContext: { kind: "branch", orgSlug: "acme", organization: { slug: "acme" } },
    });
    const res = makeRes();
    const { nextCalls } = await runMiddleware(mw, req, res);
    assert.equal(nextCalls, 1);
    assert.equal(res.state.statusCode, 200);
    assert.equal(res.state.redirected, false);
    assert.equal(req.platformHostComparison.category, COMPARISON_CATEGORIES.MATCH);
    const src = fs.readFileSync(
      path.join(__dirname, "../src/platform/http/compareLegacyHostContext.js"),
      "utf8"
    );
    assert.doesNotMatch(src, /getPgPool|REQUIRE.*db\/pg|\.query\s*\(/);
  });

  it("middleware does not mutate legacy or platform context", async () => {
    const platformHostContext = platformCtx({
      resultType: "unknown_domain",
      resolution: null,
    });
    const churchContext = { kind: "branch", orgSlug: "acme", organization: { slug: "acme" } };
    const snapshotPlatform = JSON.stringify(platformHostContext);
    const snapshotChurch = JSON.stringify(churchContext);
    const mw = createCompareLegacyHostContext({ getMode: () => MODE_DIAGNOSTIC, log: () => {} });
    const req = makeReq({
      platformHostContext,
      isChurchHost: true,
      churchContext,
    });
    await runMiddleware(mw, req, makeRes());
    assert.equal(JSON.stringify(req.platformHostContext), snapshotPlatform);
    assert.equal(JSON.stringify(req.churchContext), snapshotChurch);
  });

  it("secrets and raw errors are not logged or attached", async () => {
    const lines = [];
    const mw = createCompareLegacyHostContext({
      getMode: () => MODE_DIAGNOSTIC,
      log: (line) => lines.push(line),
    });
    const req = makeReq({
      platformHostContext: platformCtx({
        resultType: "resolved_tenant",
        resolution: {
          type: "resolved_tenant",
          organization: { key: "acme", dataEnvironment: "testing" },
          product: { key: "blessboard" },
          deployment: { code: "blessboard-com-v4" },
        },
      }),
      isChurchHost: true,
      churchContext: { kind: "branch", orgSlug: "acme", organization: { slug: "acme" } },
      cookies: { sid: "secret-cookie", authorization: "Bearer tok" },
      session: { id: "sess-secret" },
    });
    await runMiddleware(mw, req, makeRes());
    const joined = lines.join("\n");
    assert.equal(joined.includes("secret-cookie"), false);
    assert.equal(joined.includes("Bearer"), false);
    assert.equal(joined.includes("sess-secret"), false);
    assert.equal(req.platformHostComparison.error, undefined);
    assert.match(joined, /platform_host_comparison/);
  });

  it("static and health requests are skipped consistently", async () => {
    const lines = [];
    const mw = createCompareLegacyHostContext({
      getMode: () => MODE_DIAGNOSTIC,
      log: (line) => lines.push(line),
    });
    const req = makeReq({
      path: "/healthz",
      platformHostContext: platformCtx({
        resultType: "resolved_tenant",
        resolution: {
          type: "resolved_tenant",
          organization: { key: "acme" },
          product: { key: "blessboard" },
          deployment: { code: "blessboard-com-v4" },
        },
      }),
      isChurchHost: true,
      churchContext: { kind: "branch", orgSlug: "acme" },
    });
    await runMiddleware(mw, req, makeRes());
    assert.equal(lines.length, 0);
    assert.ok(req.platformHostComparison);
  });

  it("off mode performs no comparison", async () => {
    const mw = createCompareLegacyHostContext({ getMode: () => MODE_OFF, log: () => {} });
    const req = makeReq({
      platformHostContext: { enabled: false, mode: "off" },
    });
    await runMiddleware(mw, req, makeRes());
    assert.equal(req.platformHostComparison, undefined);
  });

  it("comparison middleware is registered after legacy context attachment", () => {
    const serverSrc = fs.readFileSync(path.join(__dirname, "../server.legacy.js"), "utf8");
    const tenantUse = serverSrc.indexOf("app.use(createAttachTenantByHost())");
    const compareUse = serverSrc.indexOf("createCompareLegacyHostContext({");
    assert.ok(tenantUse > 0);
    assert.ok(compareUse > tenantUse);
  });

  it("diagnostic requests remain fail-open when comparison throws", async () => {
    const mw = createCompareLegacyHostContext({
      getMode: () => {
        throw new Error("boom");
      },
      log: () => {},
    });
    // getMode throws inside try before comparison — middleware still next()
    const req = makeReq({
      platformHostContext: platformCtx({ resultType: "unknown_domain", resolution: null }),
    });
    const res = makeRes();
    const { nextCalls } = await runMiddleware(mw, req, res);
    assert.equal(nextCalls, 1);
    assert.equal(res.state.statusCode, 200);
  });
});

describe("loader + deployment identity integration", () => {
  it("off mode performs no lookup and no comparison wiring", async () => {
    let resolveCalls = 0;
    const load = createLoadPlatformHostContext({
      getMode: () => MODE_OFF,
      getPool: () => ({ query: async () => ({ rows: [] }) }),
      getDeploymentIdentity: () => ({ ok: true, status: "ok", code: "blessboard-com-v4" }),
      resolveHostname: async () => {
        resolveCalls += 1;
        return { type: RESULT_TYPES.RESOLVED_TENANT };
      },
      getEffectiveHostname: () => "x.example.test",
    });
    const req = makeReq({});
    await runMiddleware(load, req, makeRes());
    assert.equal(resolveCalls, 0);
    const compare = createCompareLegacyHostContext({ getMode: () => MODE_OFF });
    await runMiddleware(compare, req, makeRes());
    assert.equal(req.platformHostComparison, undefined);
  });
});
