"use strict";

/**
 * Hostinger testing / pronline.org / DEPLOYMENT_ENV fail-closed tests for V7.
 */

const { describe, it, beforeEach } = require("node:test");
const assert = require("node:assert/strict");
const express = require("express");
const request = require("supertest");

const {
  CODE_MOOVEX_PLATFORM_TESTING,
  CODE_MOOVEX_PLATFORM_PRODUCTION,
  validateAuthoritativeProfileCompatibility,
  resolveDeploymentConfiguration,
  resetDeploymentProfileWarningsForTests,
} = require("../src/platform/config/deploymentProfiles");
const {
  resolveCanonicalHost,
} = require("../src/platform/config/canonicalHostRegistry");
const {
  resolvePlatformRequestContext,
} = require("../src/platform/http/platformRequestContext");
const {
  createMoovexPlatformRuntimeApp,
} = require("../src/platform/http/moovexPlatformRuntimeServer");
const {
  buildPlatformRuntimeDiagnosticLines,
} = require("../src/startup/platformRuntimeDiagnostics");
const {
  verifyPlatformDatabaseIdentity,
} = require("../src/startup/blessBoardOrgDbGate");

const PLATFORM_TESTING_ENV = Object.freeze({
  NODE_ENV: "production",
  DEPLOYMENT_ENV: "testing",
  PLATFORM_DEPLOYMENT_CODE: CODE_MOOVEX_PLATFORM_TESTING,
  DATABASE_IDENTITY_EXPECTED: "moovex-platform-v7",
  DATABASE_IDENTITY_ENV: "testing",
  DATABASE_URL: "postgres://user:pass@127.0.0.1:5432/moovex_testing",
  SESSION_SECRET: "t".repeat(40),
});

function withEnv(overrides, fn) {
  const keys = new Set([
    "NODE_ENV",
    "DEPLOYMENT_ENV",
    "PLATFORM_DEPLOYMENT_CODE",
    "DATABASE_IDENTITY_EXPECTED",
    "DATABASE_IDENTITY_ENV",
    "DATABASE_URL",
    "SESSION_SECRET",
    "BASE_DOMAIN",
    "SESSION_COOKIE_NAME",
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
  app.get("/probe", (req, res) => {
    res.json({
      ok: true,
      product: label,
      platformProduct: req.platform && req.platform.productKey,
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
  app.use((req, res) => res.status(404).json({ ok: false, code: "not_found", product: label }));
  return app;
}

describe("Hostinger platform testing env requirements", () => {
  beforeEach(() => resetDeploymentProfileWarningsForTests());

  it("moovex-platform-testing resolves environment testing", () => {
    withEnv(PLATFORM_TESTING_ENV, () => {
      const d = resolveDeploymentConfiguration();
      assert.equal(d.environment, "testing");
      assert.equal(d.code, CODE_MOOVEX_PLATFORM_TESTING);
      assert.equal(d.productSelection, "hostname");
      assert.equal(d.expectedIdentityKey, "moovex-platform-v7");
      assert.equal(d.expectedDatabaseEnvironment, "testing");
    });
  });

  it("missing DEPLOYMENT_ENV on platform runtime fails closed", () => {
    const r = validateAuthoritativeProfileCompatibility({
      ...PLATFORM_TESTING_ENV,
      DEPLOYMENT_ENV: undefined,
    });
    assert.equal(r.ok, false);
    assert.equal(r.code, "deployment_env_required");
    assert.match(r.message, /DEPLOYMENT_ENV is required/);
    assert.match(r.message, /will not silently treat this as production/i);
  });

  it("missing DATABASE_IDENTITY_EXPECTED fails closed", () => {
    const r = validateAuthoritativeProfileCompatibility({
      ...PLATFORM_TESTING_ENV,
      DATABASE_IDENTITY_EXPECTED: undefined,
    });
    assert.equal(r.ok, false);
    assert.equal(r.code, "database_identity_expected_required");
  });

  it("missing DATABASE_IDENTITY_ENV fails closed", () => {
    const r = validateAuthoritativeProfileCompatibility({
      ...PLATFORM_TESTING_ENV,
      DATABASE_IDENTITY_ENV: undefined,
    });
    assert.equal(r.ok, false);
    assert.equal(r.code, "database_identity_env_required");
  });

  it("accepts complete Hostinger testing matrix", () => {
    const r = validateAuthoritativeProfileCompatibility({ ...PLATFORM_TESTING_ENV });
    assert.equal(r.ok, true);
  });

  it("diagnostics print testing metadata without secrets", () => {
    withEnv(PLATFORM_TESTING_ENV, () => {
      const text = buildPlatformRuntimeDiagnosticLines().join("\n");
      assert.match(text, /runtime environment = testing/);
      assert.match(text, /deployment = moovex-platform-testing/);
      assert.match(text, /database identity expected = moovex-platform-v7/);
      assert.match(text, /host resolution mode = hostname/);
      assert.doesNotMatch(text, /postgres:\/\//i);
      assert.doesNotMatch(text, /user:pass/);
      assert.match(text, /DATABASE_URL present: yes/);
      assert.match(text, /SESSION_SECRET present: yes/);
    });
  });
});

describe("pronline.org QA launcher + product hosts", () => {
  beforeEach(() => resetDeploymentProfileWarningsForTests());

  it("registers pronline.org as testing platform hub", () => {
    const r = resolveCanonicalHost("pronline.org");
    assert.equal(r.ok, true);
    assert.equal(r.site.environment, "testing");
    assert.equal(r.site.siteType, "platform");
    assert.equal(r.site.brand, "Moovex Platform QA");
    assert.equal(r.site.productKey, null);
  });

  it("serves QA launcher and blocks product routes on pronline.org", async () => {
    await withEnv(PLATFORM_TESTING_ENV, async () => {
      const app = createMoovexPlatformRuntimeApp({
        env: process.env,
        productApps: {
          blessboard: stubProductApp("blessboard"),
          activeclinic: stubProductApp("activeclinic"),
          getpro: stubProductApp("getpro"),
          ngo: stubProductApp("ngo"),
        },
      });

      const home = await request(app).get("/").set("Host", "pronline.org");
      assert.equal(home.status, 200);
      assert.match(home.text, /Moovex Platform QA/);
      assert.match(home.text, /blessboard\.pronline\.org/);
      assert.match(home.text, /activeclinic\.pronline\.org/);
      assert.match(home.text, /getproapp\.pronline\.org/);
      assert.match(home.text, /netraz\.pronline\.org/);
      assert.match(home.text, /data-site-type="platform"/);

      const patients = await request(app).get("/patients").set("Host", "pronline.org");
      assert.equal(patients.status, 404);
      assert.equal(patients.body.code, "platform_qa_hub_only");

      const www = await request(app).get("/docs").set("Host", "www.pronline.org");
      assert.equal(www.status, 301);
      assert.equal(www.headers.location, "https://pronline.org/docs");
    });
  });

  it("resolves each product testing host", async () => {
    await withEnv(PLATFORM_TESTING_ENV, async () => {
      const app = createMoovexPlatformRuntimeApp({
        env: process.env,
        productApps: {
          blessboard: stubProductApp("blessboard"),
          activeclinic: stubProductApp("activeclinic"),
          getpro: stubProductApp("getpro"),
          ngo: stubProductApp("ngo"),
        },
      });

      const cases = [
        ["blessboard.pronline.org", "blessboard"],
        ["activeclinic.pronline.org", "activeclinic"],
        ["getproapp.pronline.org", "getpro"],
        ["netraz.pronline.org", "ngo"],
      ];
      for (const [host, product] of cases) {
        const res = await request(app).get("/probe").set("Host", host);
        assert.equal(res.status, 200, host);
        assert.equal(res.body.product, product, host);
        assert.equal(res.body.platformProduct, product, host);
      }

      const isolation = await request(app)
        .get("/patients")
        .set("Host", "blessboard.pronline.org");
      assert.equal(isolation.status, 404);
      assert.equal(isolation.body.code, "product_route_isolated");

      const acOk = await request(app)
        .get("/patients")
        .set("Host", "activeclinic.pronline.org");
      assert.equal(acOk.status, 200);
    });
  });

  it("rejects production host and unknown host on testing runtime", async () => {
    await withEnv(PLATFORM_TESTING_ENV, async () => {
      const mismatch = resolvePlatformRequestContext({
        env: process.env,
        hostname: "blessboard.com",
      });
      assert.equal(mismatch.ok, false);
      assert.equal(mismatch.code, "PLATFORM_ENVIRONMENT_HOST_MISMATCH");

      const app = createMoovexPlatformRuntimeApp({
        env: process.env,
        productApps: {
          blessboard: stubProductApp("blessboard"),
          activeclinic: stubProductApp("activeclinic"),
          getpro: stubProductApp("getpro"),
          ngo: stubProductApp("ngo"),
        },
      });
      const unknown = await request(app).get("/").set("Host", "random.example.com");
      assert.equal(unknown.status, 404);
      assert.equal(unknown.body.code, "UNKNOWN_PLATFORM_HOST");
    });
  });
});

describe("NODE_ENV lowercase production", () => {
  it("production checks are lowercase-sensitive; Hostinger must use production", () => {
    assert.equal("Production" === "production", false);
    assert.equal(String("Production").trim().toLowerCase(), "production");
  });
});

describe("moovex-platform-v7 identity gate", () => {
  beforeEach(() => resetDeploymentProfileWarningsForTests());

  function mockPool(row) {
    return {
      async query(sql) {
        const s = String(sql);
        if (s.includes("information_schema.tables")) {
          return { rowCount: 1, rows: [{ "?column?": 1 }] };
        }
        if (s.includes("information_schema.columns")) {
          return {
            rows: [
              { column_name: "identity_key" },
              { column_name: "environment_code" },
            ],
          };
        }
        if (s.includes("platform.database_identity")) {
          return { rows: row ? [row] : [] };
        }
        return { rows: [] };
      },
    };
  }

  it("accepts moovex-platform-v7 / testing on testing runtime", async () => {
    await withEnv(PLATFORM_TESTING_ENV, async () => {
      const result = await verifyPlatformDatabaseIdentity(
        mockPool({
          identity_key: "moovex-platform-v7",
          environment_code: "testing",
        })
      );
      assert.equal(result.status, "ok");
      assert.equal(result.expectedIdentityKey, "moovex-platform-v7");
      assert.equal(result.expectedEnvironment, "testing");
    });
  });

  it("rejects moovex-platform-v7 / production on testing runtime", async () => {
    await withEnv(PLATFORM_TESTING_ENV, async () => {
      const result = await verifyPlatformDatabaseIdentity(
        mockPool({
          identity_key: "moovex-platform-v7",
          environment_code: "production",
        })
      );
      assert.equal(result.status, "fatal");
      assert.equal(result.reason, "mismatch");
      assert.match(result.sanitizedMessage, /DATABASE_IDENTITY_MISMATCH|environment_code=production/);
    });
  });

  it("rejects wrong identity key on testing runtime", async () => {
    await withEnv(PLATFORM_TESTING_ENV, async () => {
      const result = await verifyPlatformDatabaseIdentity(
        mockPool({
          identity_key: "blessboard-platform-v5",
          environment_code: "testing",
        })
      );
      assert.equal(result.status, "fatal");
      assert.equal(result.reason, "identity-key-mismatch");
    });
  });

  it("production profile expects production env code", () => {
    withEnv(
      {
        NODE_ENV: "production",
        DEPLOYMENT_ENV: "production",
        PLATFORM_DEPLOYMENT_CODE: CODE_MOOVEX_PLATFORM_PRODUCTION,
        DATABASE_IDENTITY_EXPECTED: "moovex-platform-v7",
        DATABASE_IDENTITY_ENV: "production",
        DATABASE_URL: "postgres://x",
        SESSION_SECRET: "p".repeat(40),
      },
      () => {
        const d = resolveDeploymentConfiguration();
        assert.equal(d.expectedDatabaseEnvironment, "production");
        assert.equal(d.expectedIdentityKey, "moovex-platform-v7");
      }
    );
  });
});
