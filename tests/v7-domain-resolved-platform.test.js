"use strict";

/**
 * Domain-resolved Moovex platform runtime tests.
 * No production DB / Hostinger / DNS.
 */

const { describe, it, beforeEach } = require("node:test");
const assert = require("node:assert/strict");
const express = require("express");
const request = require("supertest");

const {
  CANONICAL_HOST_REGISTRY,
  CANONICAL_PLATFORM_IDENTITY_KEY,
  resolveCanonicalHost,
  normalizeCanonicalHostname,
} = require("../src/platform/config/canonicalHostRegistry");
const {
  CODE_MOOVEX_PLATFORM_TESTING,
  CODE_MOOVEX_PLATFORM_PRODUCTION,
  CODE_COM_PRODUCTION,
  CODE_BLESSBOARD_PRONLINE_TESTING,
  MOOVEX_PLATFORM_IDENTITY_KEY,
  DEPLOYMENT_PROFILES,
  resolveDeploymentConfiguration,
  resetDeploymentProfileWarningsForTests,
} = require("../src/platform/config/deploymentProfiles");
const {
  assertHostnameMatchesEnvironment,
  resolvePlatformRequestContext,
  createLoadPlatformRequestContext,
} = require("../src/platform/http/platformRequestContext");
const {
  resolveProductBootstrapTarget,
  isRoutePackAllowed,
} = require("../src/platform/http/productBootstrap");
const {
  createMoovexPlatformRuntimeApp,
} = require("../src/platform/http/moovexPlatformRuntimeServer");
const {
  getV5SessionCookieName,
} = require("../src/platform/session/v5SessionCookie");

function withEnv(overrides, fn) {
  const keys = new Set([
    "PLATFORM_DEPLOYMENT_CODE",
    "DEPLOYMENT_ENV",
    "DATABASE_IDENTITY_EXPECTED",
    "DATABASE_IDENTITY_ENV",
    "NODE_ENV",
    "PLATFORM_TEST_HOST",
    ...Object.keys(overrides),
  ]);
  const prev = {};
  for (const key of keys) {
    prev[key] = process.env[key];
    if (overrides[key] === undefined) delete process.env[key];
    else process.env[key] = overrides[key];
  }
  const restore = () => {
    for (const key of keys) {
      if (prev[key] === undefined) delete process.env[key];
      else process.env[key] = prev[key];
    }
  };
  try {
    const result = fn();
    if (result && typeof result.then === "function") return result.finally(restore);
    restore();
    return result;
  } catch (err) {
    restore();
    throw err;
  }
}

function stubProductApp(label) {
  const app = express();
  app.get("/healthz", (req, res) => {
    res.json({
      ok: true,
      product: label,
      platformProduct: req.platform && req.platform.productKey,
      cookie: req.platform && req.platform.sessionCookieName,
    });
  });
  app.get("/patients", (req, res) => {
    if (label !== "activeclinic") {
      return res.status(404).json({ ok: false, code: "product_route_isolated" });
    }
    return res.json({ ok: true, route: "patients" });
  });
  app.get("/hq/members", (req, res) => {
    if (label !== "blessboard") {
      return res.status(404).json({ ok: false, code: "product_route_isolated" });
    }
    return res.json({ ok: true, route: "hq-members" });
  });
  app.get("/pharmacy", (req, res) => {
    if (label !== "activeclinic") {
      return res.status(404).json({ ok: false, code: "product_route_isolated" });
    }
    return res.json({ ok: true, route: "pharmacy" });
  });
  app.get("/leads", (req, res) => {
    if (label !== "getpro") {
      return res.status(404).json({ ok: false, code: "product_route_isolated" });
    }
    return res.json({ ok: true, route: "leads" });
  });
  app.get("/programs", (req, res) => {
    if (label !== "ngo") {
      return res.status(404).json({ ok: false, code: "product_route_isolated" });
    }
    return res.json({ ok: true, route: "programs" });
  });
  app.use((req, res) => {
    res.status(404).json({ ok: false, code: "not_found", product: label });
  });
  return app;
}

describe("canonical host registry", () => {
  it("maps testing and production hosts exactly", () => {
    const cases = [
      ["blessboard.pronline.org", "testing", "blessboard", "BlessBoard"],
      ["activeclinic.pronline.org", "testing", "activeclinic", "ActiveClinic"],
      ["getpro.pronline.org", "testing", "getpro", "GetPro"],
      ["netraz.pronline.org", "testing", "ngo", "Netraz"],
      ["blessboard.com", "production", "blessboard", "BlessBoard"],
      ["activeclinic.org", "production", "activeclinic", "ActiveClinic"],
      ["getproapp.org", "production", "getpro", "GetPro"],
      ["netraz.org", "production", "ngo", "Netraz"],
    ];
    for (const [host, env, product, brand] of cases) {
      const r = resolveCanonicalHost(host);
      assert.equal(r.ok, true, host);
      assert.equal(r.site.environment, env, host);
      assert.equal(r.site.productKey, product, host);
      assert.equal(r.site.brand, brand, host);
    }
    assert.equal(CANONICAL_PLATFORM_IDENTITY_KEY, "moovex-platform-v7");
    assert.ok(CANONICAL_HOST_REGISTRY["moovex.org"].siteType === "corporate");
  });

  it("rejects unknown and malformed hosts", () => {
    assert.equal(resolveCanonicalHost("unknown.example").ok, false);
    assert.equal(resolveCanonicalHost("unknown.example").code, "UNKNOWN_PLATFORM_HOST");
    assert.equal(normalizeCanonicalHostname("evil/../x").ok, false);
    assert.equal(resolveCanonicalHost("ActiveClinic").ok, false);
  });

  it("does not substring-match product names", () => {
    assert.equal(resolveCanonicalHost("notactiveclinic.org").ok, false);
    assert.equal(resolveCanonicalHost("blessboard.evil.com").ok, false);
  });
});

describe("moovex platform deployment profiles", () => {
  beforeEach(() => resetDeploymentProfileWarningsForTests());

  it("registers moovex-platform-testing/production with hostname product selection", () => {
    const testing = DEPLOYMENT_PROFILES[CODE_MOOVEX_PLATFORM_TESTING];
    assert.equal(testing.productSelection, "hostname");
    assert.equal(testing.expectedIdentityKey, MOOVEX_PLATFORM_IDENTITY_KEY);
    assert.equal(testing.deploymentEnvironment, "testing");
    assert.equal(testing.expectedDatabaseEnvironment, "testing");

    const production = DEPLOYMENT_PROFILES[CODE_MOOVEX_PLATFORM_PRODUCTION];
    assert.equal(production.productSelection, "hostname");
    assert.equal(production.expectedIdentityKey, "moovex-platform-v7");
    assert.equal(production.deploymentEnvironment, "production");
  });

  it("bootstrap targets moovex-platform-runtime", () => {
    withEnv({ PLATFORM_DEPLOYMENT_CODE: CODE_MOOVEX_PLATFORM_TESTING }, () => {
      const t = resolveProductBootstrapTarget();
      assert.equal(t.ok, true);
      assert.equal(t.target, "moovex-platform-runtime");
      assert.equal(resolveDeploymentConfiguration().productSelection, "hostname");
    });
  });

  it("keeps transitional product profiles available", () => {
    assert.equal(
      DEPLOYMENT_PROFILES[CODE_BLESSBOARD_PRONLINE_TESTING].profileStatus,
      "transitional"
    );
    assert.equal(
      DEPLOYMENT_PROFILES[CODE_COM_PRODUCTION].replacementCode,
      CODE_MOOVEX_PLATFORM_PRODUCTION
    );
  });
});

describe("environment × hostname guard", () => {
  beforeEach(() => resetDeploymentProfileWarningsForTests());

  it("accepts matching testing hosts", () => {
    withEnv({ PLATFORM_DEPLOYMENT_CODE: CODE_MOOVEX_PLATFORM_TESTING }, () => {
      const r = resolvePlatformRequestContext({
        env: process.env,
        hostname: "activeclinic.pronline.org",
      });
      assert.equal(r.ok, true);
      assert.equal(r.platform.productKey, "activeclinic");
      assert.equal(r.platform.environment, "testing");
      assert.equal(r.platform.sessionCookieName, "activeclinic_pronline_sid");
    });
  });

  it("rejects production host on testing runtime", () => {
    withEnv({ PLATFORM_DEPLOYMENT_CODE: CODE_MOOVEX_PLATFORM_TESTING }, () => {
      const r = resolvePlatformRequestContext({
        env: process.env,
        hostname: "blessboard.com",
      });
      assert.equal(r.ok, false);
      assert.equal(r.code, "PLATFORM_ENVIRONMENT_HOST_MISMATCH");
    });
  });

  it("rejects testing host on production runtime", () => {
    withEnv({ PLATFORM_DEPLOYMENT_CODE: CODE_MOOVEX_PLATFORM_PRODUCTION }, () => {
      const r = resolvePlatformRequestContext({
        env: process.env,
        hostname: "blessboard.pronline.org",
      });
      assert.equal(r.ok, false);
      assert.equal(r.code, "PLATFORM_ENVIRONMENT_HOST_MISMATCH");
    });
  });

  it("assertHostnameMatchesEnvironment helper", () => {
    assert.equal(
      assertHostnameMatchesEnvironment("testing", {
        environment: "testing",
        hostname: "x",
      }).ok,
      true
    );
    assert.equal(
      assertHostnameMatchesEnvironment("testing", {
        environment: "production",
        hostname: "blessboard.com",
      }).ok,
      false
    );
  });
});

describe("domain-resolved product isolation", () => {
  beforeEach(() => resetDeploymentProfileWarningsForTests());

  function buildRuntime() {
    return createMoovexPlatformRuntimeApp({
      env: process.env,
      productApps: {
        blessboard: stubProductApp("blessboard"),
        activeclinic: stubProductApp("activeclinic"),
        getpro: stubProductApp("getpro"),
        ngo: stubProductApp("ngo"),
      },
    });
  }

  it("routes each testing host to its product and blocks foreign routes", async () => {
    await withEnv(
      {
        PLATFORM_DEPLOYMENT_CODE: CODE_MOOVEX_PLATFORM_TESTING,
        NODE_ENV: "test",
      },
      async () => {
        const app = buildRuntime();

        const bb = await request(app)
          .get("/healthz")
          .set("Host", "blessboard.pronline.org");
        // platform healthz is mounted before host context
        assert.equal(bb.status, 200);
        assert.equal(bb.body.mode, "moovex-platform-runtime");

        const acPatients = await request(app)
          .get("/patients")
          .set("Host", "activeclinic.pronline.org");
        assert.equal(acPatients.status, 200);
        assert.equal(acPatients.body.route, "patients");

        const bbPatients = await request(app)
          .get("/patients")
          .set("Host", "blessboard.pronline.org");
        assert.equal(bbPatients.status, 404);
        assert.equal(bbPatients.body.code, "product_route_isolated");

        const acHq = await request(app)
          .get("/hq/members")
          .set("Host", "activeclinic.pronline.org");
        assert.equal(acHq.status, 404);

        const gpPharmacy = await request(app)
          .get("/pharmacy")
          .set("Host", "getpro.pronline.org");
        assert.equal(gpPharmacy.status, 404);

        const ngoOk = await request(app)
          .get("/programs")
          .set("Host", "netraz.pronline.org");
        assert.equal(ngoOk.status, 200);

        const unknown = await request(app)
          .get("/patients")
          .set("Host", "random.example.com");
        assert.equal(unknown.status, 404);
        assert.equal(unknown.body.code, "UNKNOWN_PLATFORM_HOST");
      }
    );
  });

  it("uses host-scoped session cookie names", () => {
    withEnv({ PLATFORM_DEPLOYMENT_CODE: CODE_MOOVEX_PLATFORM_TESTING }, () => {
      const fakeReq = {
        platform: {
          sessionCookieName: "activeclinic_pronline_sid",
        },
      };
      assert.equal(getV5SessionCookieName(process.env, fakeReq), "activeclinic_pronline_sid");
      assert.notEqual(
        getV5SessionCookieName(process.env, fakeReq),
        getV5SessionCookieName(process.env, {
          platform: { sessionCookieName: "blessboard_pronline_sid" },
        })
      );
    });
  });

  it("route pack allowlist remains product-strict", () => {
    assert.equal(isRoutePackAllowed("blessboard", "activeclinic"), false);
    assert.equal(isRoutePackAllowed("ngo", "getpro"), false);
  });
});

describe("identity key expectations (config-level)", () => {
  it("testing profile expects moovex-platform-v7 / testing", () => {
    withEnv({ PLATFORM_DEPLOYMENT_CODE: CODE_MOOVEX_PLATFORM_TESTING }, () => {
      const d = resolveDeploymentConfiguration();
      assert.equal(d.expectedIdentityKey, "moovex-platform-v7");
      assert.equal(d.expectedDatabaseEnvironment, "testing");
      assert.notEqual(d.expectedDatabaseEnvironment, "production");
    });
  });

  it("production profile expects moovex-platform-v7 / production", () => {
    withEnv({ PLATFORM_DEPLOYMENT_CODE: CODE_MOOVEX_PLATFORM_PRODUCTION }, () => {
      const d = resolveDeploymentConfiguration();
      assert.equal(d.expectedIdentityKey, "moovex-platform-v7");
      assert.equal(d.expectedDatabaseEnvironment, "production");
    });
  });
});

describe("platform request context immutability", () => {
  it("freezes req.platform", async () => {
    await withEnv(
      {
        PLATFORM_DEPLOYMENT_CODE: CODE_MOOVEX_PLATFORM_TESTING,
        NODE_ENV: "test",
      },
      async () => {
        const app = express();
        app.set("trust proxy", 1);
        app.use(createLoadPlatformRequestContext({ env: process.env }));
        app.get("/ctx", (req, res) => {
          let threw = false;
          try {
            req.platform.productKey = "getpro";
          } catch (_err) {
            threw = true;
          }
          res.json({
            productKey: req.platform.productKey,
            threwOrUnchanged: threw || req.platform.productKey === "blessboard",
          });
        });
        const res = await request(app)
          .get("/ctx")
          .set("Host", "blessboard.pronline.org");
        assert.equal(res.status, 200);
        assert.equal(res.body.productKey, "blessboard");
        assert.equal(res.body.threwOrUnchanged, true);
      }
    );
  });
});
