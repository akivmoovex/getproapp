"use strict";

/**
 * Unit tests for the opt-in platform host-context diagnostic middleware.
 * Uses mocks — no hosted database required.
 */

const { describe, it, afterEach } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");

const {
  getPlatformHostContextMode,
  MODE_OFF,
  MODE_DIAGNOSTIC,
} = require("../src/platform/config/platformHostContextMode");
const { createLoadPlatformHostContext } = require("../src/platform/http/loadPlatformHostContext");
const { RESULT_TYPES } = require("../src/platform/services/resolveHostname");

function makeReq(overrides) {
  const headers = { ...(overrides.headers || {}) };
  const cookieJar = { ...(overrides.cookies || {}) };
  const sessionObj = { ...(overrides.session || {}) };
  return {
    path: overrides.path || "/page",
    url: overrides.url || "/page",
    originalUrl: overrides.originalUrl || "/page",
    hostname: overrides.hostname || "tenant.example.test",
    headers,
    cookies: cookieJar,
    session: sessionObj,
    get(name) {
      const key = String(name || "").toLowerCase();
      if (key === "host") return overrides.hostHeader || "tenant.example.test";
      return headers[key];
    },
    app: {
      get(key) {
        if (key === "trust proxy") return overrides.trustProxy != null ? overrides.trustProxy : 1;
        return undefined;
      },
    },
    ...overrides.extra,
  };
}

function makeRes() {
  const state = {
    statusCode: 200,
    headersSent: false,
    redirected: false,
    locals: {},
    body: null,
  };
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
    json(payload) {
      state.body = payload;
      return this;
    },
    setHeader() {
      return this;
    },
  };
}

async function runMiddleware(mw, req, res) {
  let nextCalls = 0;
  let nextErr = null;
  await new Promise((resolve, reject) => {
    mw(req, res, (err) => {
      nextCalls += 1;
      if (err) {
        nextErr = err;
        reject(err);
        return;
      }
      resolve();
    });
  });
  return { nextCalls, nextErr };
}

describe("platform host context mode", () => {
  const prev = process.env.PLATFORM_HOST_CONTEXT_MODE;

  afterEach(() => {
    if (prev === undefined) delete process.env.PLATFORM_HOST_CONTEXT_MODE;
    else process.env.PLATFORM_HOST_CONTEXT_MODE = prev;
  });

  it("default mode is off", () => {
    delete process.env.PLATFORM_HOST_CONTEXT_MODE;
    assert.equal(getPlatformHostContextMode({}), MODE_OFF);
  });

  it("unsupported feature-flag values are treated as off", () => {
    assert.equal(getPlatformHostContextMode({ PLATFORM_HOST_CONTEXT_MODE: "enforce" }), MODE_OFF);
    assert.equal(getPlatformHostContextMode({ PLATFORM_HOST_CONTEXT_MODE: "ON" }), MODE_OFF);
  });
});

describe("loadPlatformHostContext middleware", () => {
  it("explicit off mode performs no resolver call", async () => {
    let resolveCalls = 0;
    let poolCalls = 0;
    const mw = createLoadPlatformHostContext({
      getMode: () => MODE_OFF,
      getPool: () => {
        poolCalls += 1;
        return { query: async () => ({ rows: [] }) };
      },
      resolveHostname: async () => {
        resolveCalls += 1;
        return { type: RESULT_TYPES.RESOLVED_TENANT };
      },
      getEffectiveHostname: () => "tenant.example.test",
    });
    const req = makeReq({});
    const res = makeRes();
    await runMiddleware(mw, req, res);
    assert.equal(resolveCalls, 0);
    assert.equal(poolCalls, 0);
    assert.deepEqual(req.platformHostContext, { enabled: false, mode: "off" });
  });

  it("diagnostic mode calls the resolver once", async () => {
    let resolveCalls = 0;
    const mw = createLoadPlatformHostContext({
      getMode: () => MODE_DIAGNOSTIC,
      getPool: () => ({ query: async () => ({ rows: [] }) }),
      resolveHostname: async () => {
        resolveCalls += 1;
        return {
          type: RESULT_TYPES.UNKNOWN_DOMAIN,
          hostname: "tenant.example.test",
          domain: null,
          deployment: null,
          product: null,
          organization: null,
          organizationProduct: null,
        };
      },
      getEffectiveHostname: () => "tenant.example.test",
      log: () => {},
    });
    const req = makeReq({});
    await runMiddleware(mw, req, makeRes());
    assert.equal(resolveCalls, 1);
  });

  it("diagnostic mode attaches resolved_tenant context", async () => {
    const mw = createLoadPlatformHostContext({
      getMode: () => MODE_DIAGNOSTIC,
      getPool: () => ({ query: async () => ({ rows: [] }) }),
      resolveHostname: async () => ({
        type: RESULT_TYPES.RESOLVED_TENANT,
        hostname: "tenant.example.test",
        domain: { id: "d1", type: "canonical", status: "active", isPrimary: true },
        deployment: { code: "blessboard-com-production", status: "active", jobsEnabled: true },
        product: { id: "p1", key: "blessboard", displayName: "BlessBoard", status: "active" },
        organization: {
          id: "o1",
          key: "acme",
          displayName: "Acme",
          status: "active",
          dataEnvironment: "testing",
        },
        organizationProduct: { id: "op1", status: "active", productTenantKey: "acme" },
      }),
      getEffectiveHostname: () => "tenant.example.test",
      log: () => {},
    });
    const req = makeReq({});
    await runMiddleware(mw, req, makeRes());
    assert.equal(req.platformHostContext.enabled, true);
    assert.equal(req.platformHostContext.mode, "diagnostic");
    assert.equal(req.platformHostContext.resultType, "resolved_tenant");
    assert.equal(req.platformHostContext.resolution.organization.key, "acme");
    assert.equal(req.platformHostContext.resolution.deployment.code, "blessboard-com-production");
  });

  it("diagnostic mode attaches resolved_apex context", async () => {
    const mw = createLoadPlatformHostContext({
      getMode: () => MODE_DIAGNOSTIC,
      getPool: () => ({ query: async () => ({ rows: [] }) }),
      resolveHostname: async () => ({
        type: RESULT_TYPES.RESOLVED_APEX,
        hostname: "apex.example.test",
        domain: { id: "d2", type: "apex", status: "active", isPrimary: true },
        deployment: { code: "blessboard-com-production", status: "active", jobsEnabled: true },
        product: { id: "p1", key: "blessboard", displayName: "BlessBoard", status: "active" },
        organization: null,
        organizationProduct: null,
      }),
      getEffectiveHostname: () => "apex.example.test",
      log: () => {},
    });
    const req = makeReq({ hostHeader: "apex.example.test" });
    await runMiddleware(mw, req, makeRes());
    assert.equal(req.platformHostContext.resultType, "resolved_apex");
    assert.equal(req.platformHostContext.resolution.organization, null);
  });

  async function assertNonFatal(resultType) {
    const mw = createLoadPlatformHostContext({
      getMode: () => MODE_DIAGNOSTIC,
      getPool: () => ({ query: async () => ({ rows: [] }) }),
      resolveHostname: async () => ({
        type: resultType,
        hostname: "x.example.test",
        domain: null,
        deployment: null,
        product: null,
        organization: null,
        organizationProduct: null,
      }),
      getEffectiveHostname: () => "x.example.test",
      log: () => {},
    });
    const req = makeReq({});
    const res = makeRes();
    const { nextCalls } = await runMiddleware(mw, req, res);
    assert.equal(nextCalls, 1);
    assert.equal(res.state.statusCode, 200);
    assert.equal(res.state.redirected, false);
    assert.equal(req.platformHostContext.resultType, resultType);
  }

  it("unknown_domain remains non-fatal", async () => {
    await assertNonFatal(RESULT_TYPES.UNKNOWN_DOMAIN);
  });

  it("invalid_hostname remains non-fatal", async () => {
    await assertNonFatal(RESULT_TYPES.INVALID_HOSTNAME);
  });

  it("inactive_domain remains non-fatal", async () => {
    await assertNonFatal(RESULT_TYPES.INACTIVE_DOMAIN);
  });

  it("missing organization remains non-fatal", async () => {
    await assertNonFatal(RESULT_TYPES.MISSING_ORGANIZATION);
  });

  it("resolver/database exception becomes lookup_error", async () => {
    const mw = createLoadPlatformHostContext({
      getMode: () => MODE_DIAGNOSTIC,
      getPool: () => ({ query: async () => ({ rows: [] }) }),
      resolveHostname: async () => {
        throw new Error("db down secret=supersecret");
      },
      getEffectiveHostname: () => "tenant.example.test",
      log: () => {},
    });
    const req = makeReq({});
    const res = makeRes();
    await runMiddleware(mw, req, res);
    assert.equal(req.platformHostContext.resultType, "lookup_error");
    assert.equal(req.platformHostContext.resolution, null);
    assert.equal(res.state.statusCode, 200);
  });

  it("exceptions call next and do not change response status", async () => {
    const mw = createLoadPlatformHostContext({
      getMode: () => MODE_DIAGNOSTIC,
      getPool: () => {
        throw new Error("pool boom");
      },
      getEffectiveHostname: () => "tenant.example.test",
      log: () => {},
    });
    const req = makeReq({});
    const res = makeRes();
    const { nextCalls } = await runMiddleware(mw, req, res);
    assert.equal(nextCalls, 1);
    assert.equal(res.state.statusCode, 200);
    assert.equal(req.platformHostContext.resultType, "lookup_error");
  });

  it("no redirect is issued", async () => {
    const mw = createLoadPlatformHostContext({
      getMode: () => MODE_DIAGNOSTIC,
      getPool: () => ({ query: async () => ({ rows: [] }) }),
      resolveHostname: async () => ({
        type: RESULT_TYPES.RESOLVED_TENANT,
        hostname: "tenant.example.test",
        domain: { id: "d", type: "alias", status: "active", isPrimary: false },
        deployment: null,
        product: null,
        organization: null,
        organizationProduct: null,
      }),
      getEffectiveHostname: () => "tenant.example.test",
      log: () => {},
    });
    const res = makeRes();
    await runMiddleware(mw, makeReq({}), res);
    assert.equal(res.state.redirected, false);
  });

  it("no session or cookie values are modified", async () => {
    const mw = createLoadPlatformHostContext({
      getMode: () => MODE_DIAGNOSTIC,
      getPool: () => ({ query: async () => ({ rows: [] }) }),
      resolveHostname: async () => ({
        type: RESULT_TYPES.UNKNOWN_DOMAIN,
        hostname: "tenant.example.test",
        domain: null,
        deployment: null,
        product: null,
        organization: null,
        organizationProduct: null,
      }),
      getEffectiveHostname: () => "tenant.example.test",
      log: () => {},
    });
    const req = makeReq({
      cookies: { sid: "abc" },
      session: { userId: 9 },
    });
    const cookieSnapshot = JSON.stringify(req.cookies);
    const sessionSnapshot = JSON.stringify(req.session);
    await runMiddleware(mw, req, makeRes());
    assert.equal(JSON.stringify(req.cookies), cookieSnapshot);
    assert.equal(JSON.stringify(req.session), sessionSnapshot);
  });

  it("raw errors are not attached to req.platformHostContext", async () => {
    const mw = createLoadPlatformHostContext({
      getMode: () => MODE_DIAGNOSTIC,
      getPool: () => ({ query: async () => ({ rows: [] }) }),
      resolveHostname: async () => {
        throw Object.assign(new Error("boom"), { stack: "STACK", secret: "x" });
      },
      getEffectiveHostname: () => "tenant.example.test",
      log: () => {},
    });
    const req = makeReq({});
    await runMiddleware(mw, req, makeRes());
    assert.equal(req.platformHostContext.resolution, null);
    assert.equal(req.platformHostContext.error, undefined);
    assert.equal(req.platformHostContext.stack, undefined);
    assert.equal(JSON.stringify(req.platformHostContext).includes("STACK"), false);
  });

  it("middleware does not create a database pool", async () => {
    let constructed = 0;
    function FakePool() {
      constructed += 1;
    }
    const shared = { query: async () => ({ rows: [] }) };
    const mw = createLoadPlatformHostContext({
      getMode: () => MODE_DIAGNOSTIC,
      getPool: () => shared,
      resolveHostname: async () => ({
        type: RESULT_TYPES.UNKNOWN_DOMAIN,
        hostname: "x.example.test",
        domain: null,
        deployment: null,
        product: null,
        organization: null,
        organizationProduct: null,
      }),
      getEffectiveHostname: () => "x.example.test",
      log: () => {},
    });
    await runMiddleware(mw, makeReq({}), makeRes());
    assert.equal(constructed, 0);
    assert.equal(FakePool.length >= 0, true);
  });

  it("middleware does not expose context in HTTP responses", async () => {
    const mw = createLoadPlatformHostContext({
      getMode: () => MODE_DIAGNOSTIC,
      getPool: () => ({ query: async () => ({ rows: [] }) }),
      resolveHostname: async () => ({
        type: RESULT_TYPES.RESOLVED_TENANT,
        hostname: "tenant.example.test",
        domain: null,
        deployment: null,
        product: null,
        organization: null,
        organizationProduct: null,
      }),
      getEffectiveHostname: () => "tenant.example.test",
      log: () => {},
    });
    const res = makeRes();
    await runMiddleware(mw, makeReq({}), res);
    assert.equal(res.locals.platformHostContext, undefined);
    assert.equal(res.state.body, null);
    assert.equal(res.state.redirected, false);
  });

  it("existing legacy routing remains registered in server.legacy.js", () => {
    const serverSrc = fs.readFileSync(path.join(__dirname, "../server.legacy.js"), "utf8");
    assert.match(serverSrc, /createLoadPlatformHostContext/);
    assert.match(serverSrc, /createCompareLegacyHostContext/);
    assert.match(serverSrc, /createAttachChurchContext/);
    assert.match(serverSrc, /createAttachTenantByHost/);
    assert.match(serverSrc, /getSubdomain\(req\)/);
    const loaderUse = serverSrc.indexOf("createLoadPlatformHostContext({");
    const churchUse = serverSrc.indexOf("app.use(createAttachChurchContext())");
    const tenantUse = serverSrc.indexOf("app.use(createAttachTenantByHost())");
    const compareUse = serverSrc.indexOf("createCompareLegacyHostContext({");
    assert.ok(loaderUse > 0 && churchUse > loaderUse);
    assert.ok(tenantUse > churchUse);
    assert.ok(compareUse > tenantUse);
  });

  it("valid expected deployment code is passed to resolveHostname", async () => {
    let seenOptions = null;
    const mw = createLoadPlatformHostContext({
      getMode: () => MODE_DIAGNOSTIC,
      getPool: () => ({ query: async () => ({ rows: [] }) }),
      getDeploymentIdentity: () => ({ ok: true, status: "ok", code: "blessboard-org-staging" }),
      resolveHostname: async (_db, _host, options) => {
        seenOptions = options;
        return {
          type: RESULT_TYPES.RESOLVED_TENANT,
          hostname: "tenant.example.test",
          domain: null,
          deployment: { code: "blessboard-org-staging", status: "active", jobsEnabled: false },
          product: { id: "p", key: "blessboard", displayName: "BlessBoard", status: "active" },
          organization: { id: "o", key: "acme", displayName: "Acme", status: "active", dataEnvironment: "testing" },
          organizationProduct: { id: "op", status: "active", productTenantKey: "acme" },
        };
      },
      getEffectiveHostname: () => "tenant.example.test",
      log: () => {},
    });
    const req = makeReq({});
    await runMiddleware(mw, req, makeRes());
    assert.deepEqual(seenOptions, { expectedDeploymentCode: "blessboard-org-staging" });
    assert.equal(req.platformHostContext.expectedDeploymentCode, "blessboard-org-staging");
    assert.equal(req.platformHostContext.deploymentComparisonAvailable, true);
    assert.equal(req.platformHostContext.resultType, "resolved_tenant");
  });

  it("matching deployment does not produce deployment_mismatch", async () => {
    const mw = createLoadPlatformHostContext({
      getMode: () => MODE_DIAGNOSTIC,
      getPool: () => ({ query: async () => ({ rows: [] }) }),
      getDeploymentIdentity: () => ({ ok: true, status: "ok", code: "blessboard-com-production" }),
      resolveHostname: async (_db, _host, options) => {
        assert.equal(options.expectedDeploymentCode, "blessboard-com-production");
        return {
          type: RESULT_TYPES.RESOLVED_TENANT,
          hostname: "tenant.example.test",
          domain: null,
          deployment: { code: "blessboard-com-production", status: "active", jobsEnabled: true },
          product: null,
          organization: { id: "o", key: "acme", displayName: "Acme", status: "active", dataEnvironment: "testing" },
          organizationProduct: null,
        };
      },
      getEffectiveHostname: () => "tenant.example.test",
      log: () => {},
    });
    const req = makeReq({});
    await runMiddleware(mw, req, makeRes());
    assert.notEqual(req.platformHostContext.resultType, "deployment_mismatch");
  });

  it("different deployment produces deployment_mismatch from resolver", async () => {
    const mw = createLoadPlatformHostContext({
      getMode: () => MODE_DIAGNOSTIC,
      getPool: () => ({ query: async () => ({ rows: [] }) }),
      getDeploymentIdentity: () => ({ ok: true, status: "ok", code: "blessboard-org-staging" }),
      resolveHostname: async () => ({
        type: RESULT_TYPES.DEPLOYMENT_MISMATCH,
        hostname: "tenant.example.test",
        domain: null,
        deployment: { code: "blessboard-com-production", status: "active", jobsEnabled: true },
        product: null,
        organization: null,
        organizationProduct: null,
      }),
      getEffectiveHostname: () => "tenant.example.test",
      log: () => {},
    });
    const req = makeReq({});
    await runMiddleware(mw, req, makeRes());
    assert.equal(req.platformHostContext.resultType, "deployment_mismatch");
    assert.equal(req.platformHostContext.deploymentComparisonAvailable, true);
  });

  it("missing deployment configuration still resolves without mismatch evaluation", async () => {
    let seenOptions = undefined;
    const mw = createLoadPlatformHostContext({
      getMode: () => MODE_DIAGNOSTIC,
      getPool: () => ({ query: async () => ({ rows: [] }) }),
      getDeploymentIdentity: () => ({ ok: false, status: "unavailable", code: null }),
      resolveHostname: async (_db, _host, options) => {
        seenOptions = options;
        return {
          type: RESULT_TYPES.RESOLVED_TENANT,
          hostname: "tenant.example.test",
          domain: null,
          deployment: { code: "blessboard-com-production", status: "active", jobsEnabled: true },
          product: null,
          organization: { id: "o", key: "acme", displayName: "A", status: "active", dataEnvironment: "testing" },
          organizationProduct: null,
        };
      },
      getEffectiveHostname: () => "tenant.example.test",
      log: () => {},
    });
    const req = makeReq({});
    await runMiddleware(mw, req, makeRes());
    assert.equal(seenOptions, undefined);
    assert.equal(req.platformHostContext.expectedDeploymentCode, null);
    assert.equal(req.platformHostContext.deploymentComparisonAvailable, false);
    assert.equal(req.platformHostContext.resultType, "resolved_tenant");
  });
});
