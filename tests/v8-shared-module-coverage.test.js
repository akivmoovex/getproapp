"use strict";

/**
 * Coverage-oriented unit tests for V8-modified shared-platform modules.
 * Pure / in-memory where possible; disposable DB only when needed.
 */

const { describe, it, after } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const express = require("express");
const request = require("supertest");

const {
  CODE_MOOVEX_PLATFORM_V8_TESTING,
  CODE_MOOVEX_PLATFORM_TESTING,
  CODE_ACTIVECLINIC_ORG_V6,
  MOOVEX_PLATFORM_IDENTITY_KEY,
} = require("../src/platform/config/deploymentProfiles");
const {
  resolvePlatformLine,
  isV8Deployment,
  areOutboundSideEffectsAllowed,
  resolveIsolationTempDir,
  buildHostOnlyCookieOptions,
  assertV8EnvironmentSafeOrError,
} = require("../src/platform/config/v8DeploymentIsolation");
const {
  getV5SessionCookieName,
  setV5SessionCookie,
  clearV5SessionCookie,
  readV5SessionCookie,
  cookieHeaderHasSessionSid,
  DEFAULT_V5_COOKIE,
} = require("../src/platform/session/v5SessionCookie");
const {
  assertHostnameMatchesEnvironment,
  assertHostnameAllowedForDeployment,
  resolvePlatformRequestContext,
  createLoadPlatformRequestContext,
  UnknownPlatformHostError,
  PlatformEnvironmentHostMismatchError,
} = require("../src/platform/http/platformRequestContext");
const {
  isAdditiveColumnDdlSafe,
  assertRelationColumnsExist,
} = require("../src/platform/schema/v8DbCompatibilityContract");
const { resolveCanonicalHost } = require("../src/platform/config/canonicalHostRegistry");

const V8_ENV = Object.freeze({
  NODE_ENV: "production",
  DEPLOYMENT_ENV: "testing",
  PLATFORM_DEPLOYMENT_CODE: CODE_MOOVEX_PLATFORM_V8_TESTING,
  DATABASE_URL: "postgres://unused/local",
  SESSION_SECRET: "v8-coverage-session-secret-do-not-use-0123456789",
  DATABASE_IDENTITY_EXPECTED: MOOVEX_PLATFORM_IDENTITY_KEY,
  DATABASE_IDENTITY_ENV: "testing",
});

const tmpRoots = [];

after(() => {
  for (const root of tmpRoots) {
    try {
      fs.rmSync(root, { recursive: true, force: true });
    } catch {
      /* ignore */
    }
  }
});

describe("V8 shared-module coverage — deployment isolation", () => {
  it("resolves platform line and side-effect gates", () => {
    assert.equal(resolvePlatformLine(V8_ENV), "v8");
    assert.equal(
      resolvePlatformLine({
        PLATFORM_DEPLOYMENT_CODE: CODE_MOOVEX_PLATFORM_TESTING,
        DEPLOYMENT_ENV: "testing",
      }),
      "v7"
    );
    assert.equal(isV8Deployment(V8_ENV), true);
    assert.equal(areOutboundSideEffectsAllowed(V8_ENV), false);
    assert.equal(
      areOutboundSideEffectsAllowed({
        PLATFORM_DEPLOYMENT_CODE: CODE_MOOVEX_PLATFORM_TESTING,
        DEPLOYMENT_ENV: "testing",
        BLESSBOARD_JOBS_ENABLED: "false",
      }),
      false
    );
    // Without an authoritative profile, jobs resolve to null → fail-closed false.
    assert.equal(areOutboundSideEffectsAllowed({}), false);
  });

  it("creates isolation temp dirs under deployment namespace", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "getpro-v8-cov-"));
    tmpRoots.push(root);
    const dir = resolveIsolationTempDir(
      { ...V8_ENV, GETPRO_ISOLATION_TMP_ROOT: root },
      "uploads"
    );
    assert.ok(dir.startsWith(root));
    assert.ok(fs.existsSync(dir));
    const opts = buildHostOnlyCookieOptions({ NODE_ENV: "test" });
    assert.equal(opts.secure, false);
    assert.equal(Object.prototype.hasOwnProperty.call(opts, "domain"), false);
  });

  it("assertV8EnvironmentSafeOrError covers fail-closed branches", () => {
    assert.equal(
      assertV8EnvironmentSafeOrError({
        PLATFORM_DEPLOYMENT_CODE: CODE_MOOVEX_PLATFORM_TESTING,
      }).skipped,
      true
    );
    const missing = assertV8EnvironmentSafeOrError({
      PLATFORM_DEPLOYMENT_CODE: CODE_MOOVEX_PLATFORM_V8_TESTING,
      NODE_ENV: "production",
      DEPLOYMENT_ENV: "testing",
    });
    assert.equal(missing.ok, false);
    assert.equal(missing.code, "v8_env_missing");

    // DEPLOYMENT_ENV=production must refuse even if profile resolution fails closed.
    const prodEnv = assertV8EnvironmentSafeOrError({
      ...V8_ENV,
      DEPLOYMENT_ENV: "production",
    });
    assert.equal(prodEnv.ok, false);
    assert.equal(prodEnv.code, "v8_production_env_refused");

    const prodId = assertV8EnvironmentSafeOrError({
      ...V8_ENV,
      DATABASE_IDENTITY_ENV: "production",
    });
    assert.equal(prodId.ok, false);
    assert.equal(prodId.code, "v8_production_identity_env_refused");

    const ok = assertV8EnvironmentSafeOrError(V8_ENV);
    assert.equal(ok.ok, true);
    assert.equal(ok.skipped, false);
  });
});

describe("V8 shared-module coverage — session cookies", () => {
  it("names cookies from platform request context and env fallback", () => {
    assert.equal(
      getV5SessionCookieName(V8_ENV, {
        platform: { sessionCookieName: "custom_v8_sid" },
      }),
      "custom_v8_sid"
    );
    assert.equal(
      getV5SessionCookieName({
        PLATFORM_DEPLOYMENT_CODE: CODE_MOOVEX_PLATFORM_V8_TESTING,
        DEPLOYMENT_ENV: "testing",
      }),
      "moovex_platform_v8_testing_sid"
    );
    assert.equal(
      getV5SessionCookieName({ SESSION_COOKIE_NAME: "legacy_sid" }),
      "legacy_sid"
    );
    assert.equal(getV5SessionCookieName({}), DEFAULT_V5_COOKIE);
  });

  it("sets, clears, and reads host-only session cookies", () => {
    const jars = [];
    const res = {
      cookie(name, value, options) {
        jars.push({ op: "set", name, value, options });
      },
      clearCookie(name, options) {
        jars.push({ op: "clear", name, options });
      },
    };
    setV5SessionCookie(res, "tok-a", { env: V8_ENV, secure: true });
    clearV5SessionCookie(res, { env: V8_ENV, secure: true });
    assert.equal(jars.length, 2);
    assert.equal(jars[0].op, "set");
    assert.equal(jars[1].op, "clear");
    assert.equal(Object.prototype.hasOwnProperty.call(jars[0].options, "domain"), false);

    const name = getV5SessionCookieName(V8_ENV);
    const req = {
      headers: { cookie: `${name}=tok%2Db; other=1` },
      platform: { sessionCookieName: name },
    };
    assert.equal(readV5SessionCookie(req, V8_ENV), "tok-b");
    assert.equal(cookieHeaderHasSessionSid(req), true);
    assert.equal(cookieHeaderHasSessionSid({ headers: {} }), false);

    const fromJar = {
      headers: {},
      cookies: { [name]: "from-jar" },
      platform: { sessionCookieName: name },
    };
    assert.equal(readV5SessionCookie(fromJar, V8_ENV), "from-jar");
    assert.equal(readNamedFallback(), null);

    function readNamedFallback() {
      return readV5SessionCookie({ headers: { cookie: "a=1; b=2" } }, V8_ENV);
    }

    const badDecode = {
      headers: { cookie: `${name}=%E0%A4%A` },
      platform: { sessionCookieName: name },
    };
    const decoded = readV5SessionCookie(badDecode, V8_ENV);
    assert.ok(typeof decoded === "string" || decoded === null);
  });
});

describe("V8 shared-module coverage — platform request context", () => {
  it("exports typed host errors", () => {
    const a = new UnknownPlatformHostError("x", { h: 1 });
    const b = new PlatformEnvironmentHostMismatchError("y", { h: 2 });
    assert.equal(a.code, "UNKNOWN_PLATFORM_HOST");
    assert.equal(b.code, "PLATFORM_ENVIRONMENT_HOST_MISMATCH");
  });

  it("matches and rejects host environments", () => {
    assert.equal(
      assertHostnameMatchesEnvironment("testing", {
        environment: "testing",
        hostname: "blessboard.neuniversity.org",
      }).ok,
      true
    );
    assert.equal(
      assertHostnameMatchesEnvironment("", {
        environment: "testing",
        hostname: "x",
      }).ok,
      false
    );
    assert.equal(
      assertHostnameMatchesEnvironment("production", {
        environment: "testing",
        hostname: "x",
      }).ok,
      false
    );
  });

  it("allows non-hostname productSelection profiles without apex gate", () => {
    assert.equal(
      assertHostnameAllowedForDeployment(
        { productSelection: "profile", apexDomains: [] },
        { hostname: "anything.example" }
      ).ok,
      true
    );
  });

  it("resolves V8 hostname context and rejects env mismatch", () => {
    const ok = resolvePlatformRequestContext({
      env: V8_ENV,
      hostname: "blessboard.neuniversity.org",
    });
    assert.equal(ok.ok, true);
    assert.equal(ok.platform.productKey, "blessboard");
    assert.equal(ok.platform.platformLine, "v8");
    assert.ok(ok.platform.sessionCookieName.includes("v8"));

    const missing = resolvePlatformRequestContext({ env: V8_ENV });
    assert.equal(missing.ok, false);
    assert.equal(missing.code, "missing_host");

    const unknown = resolvePlatformRequestContext({
      env: V8_ENV,
      hostname: "evil.example.com",
    });
    assert.equal(unknown.ok, false);

    const mismatch = resolvePlatformRequestContext({
      env: { ...V8_ENV, DEPLOYMENT_ENV: "production" },
      hostname: "blessboard.neuniversity.org",
    });
    assert.equal(mismatch.ok, false);
    assert.equal(mismatch.code, "PLATFORM_ENVIRONMENT_HOST_MISMATCH");
  });

  it("rejects product-profile host mismatch for ActiveClinic org profile", () => {
    const env = {
      NODE_ENV: "test",
      PLATFORM_DEPLOYMENT_CODE: CODE_ACTIVECLINIC_ORG_V6,
      DEPLOYMENT_ENV: "testing",
      DATABASE_URL: "postgres://unused/local",
      SESSION_SECRET: "a".repeat(40),
    };
    const result = resolvePlatformRequestContext({
      env,
      hostname: "blessboard.pronline.org",
    });
    // Either mismatch or host not allowed depending on profile apex list.
    assert.equal(result.ok, false);
  });

  it("middleware attaches platform or returns fail-closed status", async () => {
    const appOk = express();
    appOk.use(
      createLoadPlatformRequestContext({
        env: V8_ENV,
        allowTestHostOverride: true,
      })
    );
    appOk.get("/ping", (req, res) => {
      res.json({ ok: true, productKey: req.platform.productKey });
    });

    const good = await request(appOk)
      .get("/ping")
      .set("Host", "blessboard.neuniversity.org");
    assert.equal(good.status, 200);
    assert.equal(good.body.productKey, "blessboard");

    const appBad = express();
    appBad.use(createLoadPlatformRequestContext({ env: V8_ENV }));
    appBad.get("/ping", (_req, res) => res.json({ ok: true }));
    const bad = await request(appBad).get("/ping").set("Host", "evil.example.com");
    assert.ok(bad.status === 404 || bad.status === 421);

    const appCb = express();
    let saw = null;
    appCb.use(
      createLoadPlatformRequestContext({
        env: V8_ENV,
        onUnknown(req, res, result) {
          saw = result.code;
          res.status(499).json({ code: result.code });
        },
      })
    );
    appCb.get("/ping", (_req, res) => res.json({ ok: true }));
    const custom = await request(appCb).get("/ping").set("Host", "evil.example.com");
    assert.equal(custom.status, 499);
    assert.ok(saw);
  });

  it("canonical hub host resolves with null productKey", () => {
    const hub = resolveCanonicalHost("neuniversity.org");
    assert.equal(hub.ok, true);
    assert.equal(hub.site.productKey, null);
    const ctx = resolvePlatformRequestContext({
      env: V8_ENV,
      hostname: "neuniversity.org",
    });
    assert.equal(ctx.ok, true);
    assert.equal(ctx.platform.productKey, null);
  });
});

describe("V8 shared-module coverage — schema contract helpers", () => {
  it("isAdditiveColumnDdlSafe rejects unsafe NOT NULL without DEFAULT", () => {
    assert.equal(isAdditiveColumnDdlSafe(""), false);
    assert.equal(
      isAdditiveColumnDdlSafe("ALTER TABLE t ADD COLUMN c TEXT NOT NULL"),
      false
    );
    assert.equal(
      isAdditiveColumnDdlSafe("ALTER TABLE t ADD COLUMN c TEXT NOT NULL DEFAULT ''"),
      true
    );
  });

  it("assertRelationColumnsExist reports missing tables", async () => {
    const db = {
      async query() {
        return { rowCount: 0, rows: [] };
      },
    };
    const missing = await assertRelationColumnsExist(db, {
      schema: "platform",
      table: "does_not_exist_v8_cov",
      columns: ["id"],
    });
    assert.equal(missing.ok, false);
    assert.equal(missing.reason, "table_missing");

    const present = await assertRelationColumnsExist(
      {
        async query() {
          return { rowCount: 2, rows: [{ column_name: "id" }, { column_name: "name" }] };
        },
      },
      { schema: "platform", table: "organizations", columns: ["id", "missing_col"] }
    );
    assert.equal(present.ok, false);
    assert.equal(present.reason, "columns_missing");
    assert.deepEqual(present.missing, ["missing_col"]);
  });
});
