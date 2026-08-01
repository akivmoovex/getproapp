"use strict";

/**
 * BlessBoard V5 environment validation (pure parsers + pairing / secret policy).
 * Does not mutate Hostinger or process.env beyond temporary test overrides.
 */

const { describe, it, beforeEach, afterEach } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");

const {
  parseDeploymentEnvForV5,
  parseTenantRoutingMode,
  parsePlatformHostContextMode,
  parsePublicScheme,
  parseBlessBoardJobsEnabled,
  parseSessionSecret,
  parseSessionCookieName,
  summarizeV5DatabaseEnv,
  validateIdentityKey,
  validateEnvironmentCode,
  getPlatformDeploymentCode,
  isV5FoundationMode,
  checkV5FoundationDeploymentPairing,
  checkV5SessionSecretPolicy,
  MIN_SESSION_SECRET_LENGTH,
  DEFAULT_V5_SESSION_COOKIE,
  V5_FOUNDATION_DEPLOYMENT_CODE,
  IDENTITY_ALLOWED_ENVS,
} = require("../src/platform/config/v5EnvValidation");
const { getDatabaseUrl, summarizeDatabaseUrlEnv } = require("../src/db/pg/pool");
const { getBlessBoardTenantRoutingMode, resetTenantRoutingModeWarningForTests } = require("../src/blessboard/config/tenantRoutingMode");
const { areBlessBoardJobsEnabled } = require("../src/church/blessBoardEnv");

const ROOT = path.resolve(__dirname, "..");

function withEnv(overrides, fn) {
  const keys = Object.keys(overrides);
  const prev = {};
  for (const key of keys) {
    prev[key] = process.env[key];
    if (overrides[key] === undefined) delete process.env[key];
    else process.env[key] = overrides[key];
  }
  try {
    return fn();
  } finally {
    for (const key of keys) {
      if (prev[key] === undefined) delete process.env[key];
      else process.env[key] = prev[key];
    }
  }
}

describe("V5 DEPLOYMENT_ENV / foundation pairing", () => {
  it("accepts testing and production labels", () => {
    assert.deepEqual(parseDeploymentEnvForV5({ DEPLOYMENT_ENV: "testing" }), {
      ok: true,
      value: "testing",
    });
    assert.deepEqual(parseDeploymentEnvForV5({ DEPLOYMENT_ENV: "PRODUCTION" }), {
      ok: true,
      value: "production",
    });
  });

  it("rejects missing and unsupported DEPLOYMENT_ENV", () => {
    assert.equal(parseDeploymentEnvForV5({}).ok, false);
    assert.equal(parseDeploymentEnvForV5({ DEPLOYMENT_ENV: "staging" }).reason, "unsupported");
    assert.equal(parseDeploymentEnvForV5({ DEPLOYMENT_ENV: "test" }).ok, false);
  });

  it("foundation mode requires blessboard-org-v5 + testing", () => {
    assert.equal(
      isV5FoundationMode({
        PLATFORM_DEPLOYMENT_CODE: V5_FOUNDATION_DEPLOYMENT_CODE,
        DEPLOYMENT_ENV: "testing",
      }),
      true
    );
    assert.equal(
      isV5FoundationMode({
        PLATFORM_DEPLOYMENT_CODE: V5_FOUNDATION_DEPLOYMENT_CODE,
        DEPLOYMENT_ENV: "production",
      }),
      false
    );
  });

  it("refuses silent legacy fall-through when code is V5 but DEPLOYMENT_ENV is wrong", () => {
    assert.equal(
      checkV5FoundationDeploymentPairing({
        PLATFORM_DEPLOYMENT_CODE: V5_FOUNDATION_DEPLOYMENT_CODE,
        DEPLOYMENT_ENV: "testing",
      }).ok,
      true
    );
    // Unset DEPLOYMENT_ENV is allowed (derived from deployment profile).
    const okUnset = checkV5FoundationDeploymentPairing({
      PLATFORM_DEPLOYMENT_CODE: V5_FOUNDATION_DEPLOYMENT_CODE,
    });
    assert.equal(okUnset.ok, true);

    const badProd = checkV5FoundationDeploymentPairing({
      PLATFORM_DEPLOYMENT_CODE: V5_FOUNDATION_DEPLOYMENT_CODE,
      DEPLOYMENT_ENV: "production",
    });
    assert.equal(badProd.ok, false);

    assert.equal(
      checkV5FoundationDeploymentPairing({
        PLATFORM_DEPLOYMENT_CODE: "blessboard-com-v4",
        DEPLOYMENT_ENV: "production",
      }).ok,
      true
    );
  });

  it("foundation mode allows unset DEPLOYMENT_ENV with blessboard-org-v5", () => {
    assert.equal(
      isV5FoundationMode({
        PLATFORM_DEPLOYMENT_CODE: V5_FOUNDATION_DEPLOYMENT_CODE,
      }),
      true
    );
  });

  it("server.js wires pairing assert before foundation branch", () => {
    const src = fs.readFileSync(path.join(ROOT, "server.js"), "utf8");
    assert.match(src, /assertV5FoundationDeploymentPairingOrExit/);
    const pairingIdx = src.indexOf("assertV5FoundationDeploymentPairingOrExit");
    const branchIdx = src.indexOf("isV5FoundationMode()");
    assert.ok(pairingIdx > 0 && branchIdx > pairingIdx);
  });
});

describe("V5 PLATFORM_DEPLOYMENT_CODE", () => {
  it("accepts kebab-case codes", () => {
    const r = getPlatformDeploymentCode({ PLATFORM_DEPLOYMENT_CODE: "blessboard-org-v5" });
    assert.equal(r.ok, true);
    assert.equal(r.code, "blessboard-org-v5");
  });

  it("rejects empty and invalid formats", () => {
    assert.equal(getPlatformDeploymentCode({}).status, "unavailable");
    assert.equal(getPlatformDeploymentCode({ PLATFORM_DEPLOYMENT_CODE: "Bad_Code!" }).status, "invalid");
  });
});

describe("V5 DATABASE_IDENTITY_EXPECTED parsers", () => {
  it("validates identity_key format", () => {
    assert.deepEqual(validateIdentityKey("blessboard-platform-v5"), {
      ok: true,
      key: "blessboard-platform-v5",
    });
    assert.equal(validateIdentityKey("").ok, false);
    assert.equal(validateIdentityKey("Not Valid").ok, false);
  });

  it("validates identity environment_code enum", () => {
    for (const env of IDENTITY_ALLOWED_ENVS) {
      assert.equal(validateEnvironmentCode(env).ok, true);
    }
    assert.equal(validateEnvironmentCode("staging").ok, false);
    assert.equal(validateEnvironmentCode("test").ok, false);
  });
});

describe("V5 routing and host-context enums", () => {
  beforeEach(() => {
    resetTenantRoutingModeWarningForTests();
  });

  it("defaults routing to off; rejects unsupported as not applied", () => {
    assert.deepEqual(parseTenantRoutingMode({}), { ok: true, mode: "off" });
    assert.equal(parseTenantRoutingMode({ BLESSBOARD_TENANT_ROUTING_MODE: "shadow" }).mode, "shadow");
    const bad = parseTenantRoutingMode({ BLESSBOARD_TENANT_ROUTING_MODE: "on" });
    assert.equal(bad.ok, false);
    assert.equal(bad.mode, "off");
    assert.equal(getBlessBoardTenantRoutingMode({ BLESSBOARD_TENANT_ROUTING_MODE: "on" }), "off");
  });

  it("defaults host context to off; rejects unsupported", () => {
    assert.deepEqual(parsePlatformHostContextMode({}), { ok: true, mode: "off" });
    assert.equal(
      parsePlatformHostContextMode({ PLATFORM_HOST_CONTEXT_MODE: "diagnostic" }).mode,
      "diagnostic"
    );
    const bad = parsePlatformHostContextMode({ PLATFORM_HOST_CONTEXT_MODE: "enforce" });
    assert.equal(bad.ok, false);
    assert.equal(bad.mode, "off");
  });
});

describe("V5 PUBLIC_SCHEME / session cookie / secret", () => {
  it("defaults PUBLIC_SCHEME to https and rejects junk", () => {
    assert.deepEqual(parsePublicScheme({}), { ok: true, scheme: "https" });
    assert.equal(parsePublicScheme({ PUBLIC_SCHEME: "HTTP" }).scheme, "http");
    assert.equal(parsePublicScheme({ PUBLIC_SCHEME: "ftp" }).ok, false);
  });

  it("session cookie defaults to V5 name", () => {
    assert.deepEqual(parseSessionCookieName({}), {
      ok: true,
      name: DEFAULT_V5_SESSION_COOKIE,
      usedDefault: true,
    });
    assert.equal(parseSessionCookieName({ SESSION_COOKIE_NAME: " custom " }).name, "custom");
  });

  it("SESSION_SECRET length policy", () => {
    assert.equal(parseSessionSecret({}).reason, "missing");
    assert.equal(parseSessionSecret({ SESSION_SECRET: "short" }).reason, "too_short");
    assert.equal(
      parseSessionSecret({ SESSION_SECRET: "x".repeat(MIN_SESSION_SECRET_LENGTH) }).ok,
      true
    );
    assert.equal(
      checkV5SessionSecretPolicy({
        NODE_ENV: "production",
        SESSION_SECRET: "too-short",
      }).ok,
      false
    );
    assert.equal(
      checkV5SessionSecretPolicy({
        NODE_ENV: "test",
        SESSION_SECRET: "",
      }).ok,
      true
    );
  });
});

describe("V5 DATABASE_URL vs GETPRO_DATABASE_URL", () => {
  it("summarize never returns connection string values", () => {
    const s = summarizeV5DatabaseEnv({
      PLATFORM_DEPLOYMENT_CODE: V5_FOUNDATION_DEPLOYMENT_CODE,
      DEPLOYMENT_ENV: "testing",
      DATABASE_URL: "postgres://user:super-secret@db.example/v5",
      GETPRO_DATABASE_URL: "postgres://user:other-secret@legacy/v4",
    });
    assert.equal(s.DATABASE_URL, "yes");
    assert.equal(s.GETPRO_DATABASE_URL, "yes");
    assert.equal(s.getproFallbackDisabled, true);
    assert.equal(s.getproMustRemainUnused, true);
    assert.equal(s.effectiveSource, "DATABASE_URL");
    assert.doesNotMatch(JSON.stringify(s), /super-secret|other-secret|postgres:\/\//);
  });

  it("foundation mode ignores GETPRO_DATABASE_URL when DATABASE_URL absent", () => {
    withEnv(
      {
        NODE_ENV: "development",
        GETPRO_TEST_DB: undefined,
        TEST_DATABASE_URL: undefined,
        PLATFORM_DEPLOYMENT_CODE: V5_FOUNDATION_DEPLOYMENT_CODE,
        DEPLOYMENT_ENV: "testing",
        DATABASE_URL: undefined,
        GETPRO_DATABASE_URL: "postgres://legacy-only/should-not-win",
        BLESSBOARD_CANONICAL_DOMAIN: "blessboard.org",
      },
      () => {
        assert.equal(getDatabaseUrl(), "");
        const s = summarizeDatabaseUrlEnv();
        assert.equal(s.getproFallbackDisabled, true);
        assert.equal(s.effectiveSource, "(none)");
        assert.equal(s.hasGetproDatabaseUrl, true);
      }
    );
  });
});

describe("V5 jobs gate", () => {
  const keys = [
    "PLATFORM_DEPLOYMENT_CODE",
    "DEPLOYMENT_ENV",
    "BLESSBOARD_JOBS_ENABLED",
  ];
  const saved = {};

  beforeEach(() => {
    for (const k of keys) saved[k] = process.env[k];
  });

  afterEach(() => {
    for (const k of keys) {
      if (saved[k] === undefined) delete process.env[k];
      else process.env[k] = saved[k];
    }
  });

  it("disables jobs in foundation mode even when flag unset", () => {
    process.env.PLATFORM_DEPLOYMENT_CODE = V5_FOUNDATION_DEPLOYMENT_CODE;
    process.env.DEPLOYMENT_ENV = "testing";
    delete process.env.BLESSBOARD_JOBS_ENABLED;
    assert.equal(areBlessBoardJobsEnabled(), false);
    assert.equal(parseBlessBoardJobsEnabled(process.env).enabled, false);
    assert.match(
      parseBlessBoardJobsEnabled(process.env).reason,
      /^(v5_foundation_mode|deployment_profile)$/
    );
  });

  it("V4 unset still defaults enabled", () => {
    process.env.PLATFORM_DEPLOYMENT_CODE = "blessboard-com-v4";
    process.env.DEPLOYMENT_ENV = "production";
    delete process.env.BLESSBOARD_JOBS_ENABLED;
    assert.equal(areBlessBoardJobsEnabled(), true);
  });

  it("V5 deployment code unset defaults disabled outside foundation pairing", () => {
    process.env.PLATFORM_DEPLOYMENT_CODE = V5_FOUNDATION_DEPLOYMENT_CODE;
    process.env.DEPLOYMENT_ENV = "production";
    delete process.env.BLESSBOARD_JOBS_ENABLED;
    const parsed = parseBlessBoardJobsEnabled(process.env);
    assert.equal(parsed.enabled, false);
    assert.equal(parsed.reason, "v5_default_disabled");
    assert.equal(areBlessBoardJobsEnabled(), false);
  });

  it("V5 unsupported jobs token fails closed", () => {
    process.env.PLATFORM_DEPLOYMENT_CODE = V5_FOUNDATION_DEPLOYMENT_CODE;
    process.env.DEPLOYMENT_ENV = "production";
    process.env.BLESSBOARD_JOBS_ENABLED = "maybe";
    const parsed = parseBlessBoardJobsEnabled(process.env);
    assert.equal(parsed.ok, false);
    assert.equal(parsed.enabled, false);
  });

  it("explicit disable works outside foundation", () => {
    process.env.PLATFORM_DEPLOYMENT_CODE = "blessboard-com-v4";
    process.env.DEPLOYMENT_ENV = "production";
    process.env.BLESSBOARD_JOBS_ENABLED = "0";
    assert.equal(areBlessBoardJobsEnabled(), false);
  });
});

describe("V5 env reference + startup source safety", () => {
  it("documents required variables without embedding secrets", () => {
    const doc = fs.readFileSync(
      path.join(ROOT, "docs/deployment/V5_ENVIRONMENT_VARIABLE_REFERENCE.md"),
      "utf8"
    );
    for (const name of [
      "NODE_ENV",
      "DEPLOYMENT_ENV",
      "DATABASE_URL",
      "DATABASE_IDENTITY_EXPECTED",
      "PLATFORM_DEPLOYMENT_CODE",
      "PLATFORM_HOST_CONTEXT_MODE",
      "BLESSBOARD_TENANT_ROUTING_MODE",
      "BLESSBOARD_JOBS_ENABLED",
      "BLESSBOARD_MEDIA_UPLOADS_ENABLED",
      "BLESSBOARD_WRITE_MAINTENANCE",
      "SESSION_SECRET",
      "SESSION_COOKIE_NAME",
      "BASE_DOMAIN",
      "PUBLIC_SCHEME",
      "GETPRO_DATABASE_URL",
    ]) {
      assert.match(doc, new RegExp(`\`${name}\``));
    }
    assert.doesNotMatch(doc, /postgres:\/\/[^`]+:[^`]+@/i);
    assert.doesNotMatch(doc, /SESSION_SECRET=[^\s|]{8,}/);
  });

  it("worker env trace never interpolates DATABASE_URL value", () => {
    const src = fs.readFileSync(path.join(ROOT, "src/startup/workerEnvTrace.js"), "utf8");
    assert.match(src, /DATABASE_URL=\$\{s\.DATABASE_URL\}/);
    assert.match(src, /envKeyPresent/);
    assert.doesNotMatch(src, /process\.env\.DATABASE_URL\}/);
  });

  it("V5 session cookie Secure tied to NODE_ENV=production", () => {
    const src = fs.readFileSync(path.join(ROOT, "src/platform/session/v5SessionCookie.js"), "utf8");
    assert.match(src, /NODE_ENV.*production/);
    assert.match(src, /secure/);
    assert.doesNotMatch(src, /domain:\s*["']/i);
  });
});
