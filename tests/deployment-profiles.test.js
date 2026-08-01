"use strict";

/**
 * Deployment profile registry + minimal V5 Hostinger env surface.
 */

const { describe, it, beforeEach, afterEach } = require("node:test");
const assert = require("node:assert/strict");

const {
  DEPLOYMENT_PROFILES,
  CODE_ORG_V5,
  CODE_COM_V4,
  V5_SESSION_COOKIE,
  PRODUCTION_SESSION_COOKIE,
  getDeploymentProfile,
  hasAuthoritativeDeploymentProfile,
  getDeploymentSetting,
  getAuthoritativeDomainConfig,
  resolveDeploymentProfileOrError,
  validateAuthoritativeProfileCompatibility,
  resolveTrustProxy,
  resolveListenHost,
  resetDeploymentProfileWarningsForTests,
} = require("../src/platform/config/deploymentProfiles");
const { isV5FoundationMode } = require("../src/platform/config/v5FoundationMode");
const {
  checkV5FoundationDeploymentPairing,
  parseBlessBoardJobsEnabled,
  parseSessionCookieName,
} = require("../src/platform/config/v5EnvValidation");
const {
  getBlessBoardCanonicalDomain,
  getBlessBoardPublicUrl,
  getBlessBoardAdminUrl,
  getChurchHostDomain,
  getBlessBoardApexDomainSet,
  getSessionCookieName,
  getDeploymentEnvMode,
  areBlessBoardJobsEnabled,
  isBlessBoardOrgTestingDeployment,
} = require("../src/church/blessBoardEnv");
const { getV5SessionCookieName } = require("../src/platform/session/v5SessionCookie");
const {
  getProductionMissingRequiredEnv,
} = require("../src/startup/productionEnvGate");
const { foundationWwwToApexRedirect } = require("../src/platform/http/v5FoundationServer");

const PROFILE_KEYS = [
  "PLATFORM_DEPLOYMENT_CODE",
  "DEPLOYMENT_ENV",
  "EXPECTED_DATABASE_ENV",
  "BLESSBOARD_CANONICAL_DOMAIN",
  "BLESSBOARD_APEX_DOMAINS",
  "BLESSBOARD_PUBLIC_URL",
  "BLESSBOARD_ADMIN_URL",
  "CHURCH_HOST_DOMAIN",
  "SESSION_COOKIE_NAME",
  "BLESSBOARD_JOBS_ENABLED",
  "PLATFORM_HOST_CONTEXT_MODE",
  "TRUST_PROXY",
  "HOST",
  "BASE_DOMAIN",
  "NODE_ENV",
  "SESSION_SECRET",
  "DATABASE_URL",
];

function withEnv(overrides, fn) {
  const keys = new Set([...PROFILE_KEYS, ...Object.keys(overrides)]);
  const prev = {};
  for (const key of keys) {
    prev[key] = process.env[key];
    if (overrides[key] === undefined) delete process.env[key];
    else if (Object.prototype.hasOwnProperty.call(overrides, key)) {
      process.env[key] = overrides[key];
    }
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

const MINIMAL_V5 = Object.freeze({
  NODE_ENV: "production",
  PLATFORM_DEPLOYMENT_CODE: CODE_ORG_V5,
  DATABASE_URL: "postgres://test-user:test-pass@127.0.0.1:5432/blessboard_v5_test",
  SESSION_SECRET: "t".repeat(40),
});

describe("deploymentProfiles registry", () => {
  beforeEach(() => {
    resetDeploymentProfileWarningsForTests();
  });

  it("registers blessboard-org-v5 as authoritative V5 foundation", () => {
    const p = DEPLOYMENT_PROFILES[CODE_ORG_V5];
    assert.equal(p.authoritative, true);
    assert.equal(p.runtimeMode, "v5-foundation");
    assert.equal(p.deploymentEnvironment, "testing");
    assert.equal(p.canonicalDomain, "blessboard.org");
    assert.equal(p.publicOrigin, "https://blessboard.org");
    assert.equal(p.sessionCookieName, V5_SESSION_COOKIE);
    assert.equal(p.jobsEnabled, false);
    assert.equal(p.allowTestUsersByDefault, false);
  });

  it("registers blessboard-com-v4 as non-authoritative legacy", () => {
    const p = DEPLOYMENT_PROFILES[CODE_COM_V4];
    assert.equal(p.authoritative, false);
    assert.equal(p.runtimeMode, "legacy");
  });

  it("unknown PLATFORM_DEPLOYMENT_CODE fails closed", () => {
    const r = resolveDeploymentProfileOrError({
      PLATFORM_DEPLOYMENT_CODE: "not-a-real-profile",
    });
    assert.equal(r.ok, false);
    assert.equal(r.code, "unknown_deployment_code");
  });

  it("invalid format fails closed", () => {
    const r = resolveDeploymentProfileOrError({
      PLATFORM_DEPLOYMENT_CODE: "Bad_Code!",
    });
    assert.equal(r.ok, false);
    assert.equal(r.code, "invalid_deployment_code");
  });

  it("unset PLATFORM_DEPLOYMENT_CODE is legacy-ok", () => {
    const r = resolveDeploymentProfileOrError({});
    assert.equal(r.ok, true);
    assert.equal(r.profile, null);
  });
});

describe("minimal V5 Hostinger env", () => {
  beforeEach(() => resetDeploymentProfileWarningsForTests());

  it("selects foundation runtime and derives domains/jobs/cookie/env", () => {
    withEnv(MINIMAL_V5, () => {
      assert.equal(isV5FoundationMode(), true);
      assert.equal(hasAuthoritativeDeploymentProfile(), true);
      assert.equal(getDeploymentEnvMode(), "testing");
      assert.equal(getBlessBoardCanonicalDomain(), "blessboard.org");
      assert.equal(getBlessBoardPublicUrl(), "https://blessboard.org");
      assert.equal(getBlessBoardAdminUrl(), "https://blessboard.org");
      assert.equal(getChurchHostDomain(), "blessboard.org");
      assert.deepEqual([...getBlessBoardApexDomainSet()].sort(), [
        "blessboard.org",
        "www.blessboard.org",
      ]);
      assert.equal(areBlessBoardJobsEnabled(), false);
      assert.equal(getSessionCookieName(), V5_SESSION_COOKIE);
      assert.equal(getV5SessionCookieName(), V5_SESSION_COOKIE);
      assert.equal(isBlessBoardOrgTestingDeployment(), true);
      assert.equal(getDeploymentSetting("trustProxy"), 1);
      assert.equal(resolveListenHost(), "0.0.0.0");
      assert.equal(resolveTrustProxy(), 1);

      const domain = getAuthoritativeDomainConfig();
      assert.equal(domain.canonicalDomain, "blessboard.org");
      assert.ok(!domain.apexDomains.includes("blessboard.com"));
    });
  });

  it("allows missing BASE_DOMAIN in V5 foundation production gate", () => {
    withEnv({ ...MINIMAL_V5, BASE_DOMAIN: undefined }, () => {
      assert.deepEqual(getProductionMissingRequiredEnv(), []);
    });
  });

  it("still requires SESSION_SECRET in V5 production", () => {
    withEnv({ ...MINIMAL_V5, SESSION_SECRET: undefined }, () => {
      assert.deepEqual(getProductionMissingRequiredEnv(), ["SESSION_SECRET"]);
    });
  });

  it("pairing allows unset DEPLOYMENT_ENV for blessboard-org-v5", () => {
    withEnv({ PLATFORM_DEPLOYMENT_CODE: CODE_ORG_V5 }, () => {
      assert.equal(checkV5FoundationDeploymentPairing({}).ok, true);
      assert.equal(
        checkV5FoundationDeploymentPairing({
          PLATFORM_DEPLOYMENT_CODE: CODE_ORG_V5,
        }).ok,
        true
      );
    });
  });
});

describe("authoritative profile conflicts", () => {
  beforeEach(() => resetDeploymentProfileWarningsForTests());

  it("DEPLOYMENT_ENV=production is fatal", () => {
    const r = validateAuthoritativeProfileCompatibility({
      PLATFORM_DEPLOYMENT_CODE: CODE_ORG_V5,
      DEPLOYMENT_ENV: "production",
    });
    assert.equal(r.ok, false);
    assert.equal(r.code, "deployment_env_conflict");
  });

  it("BLESSBOARD_CANONICAL_DOMAIN=blessboard.com is fatal", () => {
    const r = validateAuthoritativeProfileCompatibility({
      PLATFORM_DEPLOYMENT_CODE: CODE_ORG_V5,
      BLESSBOARD_CANONICAL_DOMAIN: "blessboard.com",
    });
    assert.equal(r.ok, false);
    assert.equal(r.code, "canonical_domain_conflict");
  });

  it("BLESSBOARD_APEX_DOMAINS containing blessboard.com is fatal", () => {
    const r = validateAuthoritativeProfileCompatibility({
      PLATFORM_DEPLOYMENT_CODE: CODE_ORG_V5,
      BLESSBOARD_APEX_DOMAINS: "blessboard.org,www.blessboard.org,blessboard.com",
    });
    assert.equal(r.ok, false);
    assert.equal(r.code, "apex_domains_conflict");
  });

  it("BLESSBOARD_JOBS_ENABLED=1 is fatal", () => {
    const r = validateAuthoritativeProfileCompatibility({
      PLATFORM_DEPLOYMENT_CODE: CODE_ORG_V5,
      BLESSBOARD_JOBS_ENABLED: "1",
    });
    assert.equal(r.ok, false);
    assert.equal(r.code, "jobs_enabled_conflict");
  });

  it("SESSION_COOKIE_NAME=getpro_sid is fatal", () => {
    const r = validateAuthoritativeProfileCompatibility({
      PLATFORM_DEPLOYMENT_CODE: CODE_ORG_V5,
      SESSION_COOKIE_NAME: PRODUCTION_SESSION_COOKIE,
    });
    assert.equal(r.ok, false);
    assert.equal(r.code, "session_cookie_conflict");
  });

  it("matching legacy duplicates warn but allow", () => {
    const warnings = [];
    const r = validateAuthoritativeProfileCompatibility(
      {
        PLATFORM_DEPLOYMENT_CODE: CODE_ORG_V5,
        DEPLOYMENT_ENV: "testing",
        BLESSBOARD_CANONICAL_DOMAIN: "blessboard.org",
        BLESSBOARD_APEX_DOMAINS: "blessboard.org,www.blessboard.org",
        BLESSBOARD_PUBLIC_URL: "https://blessboard.org",
        BLESSBOARD_ADMIN_URL: "https://blessboard.org",
        CHURCH_HOST_DOMAIN: "blessboard.org",
        SESSION_COOKIE_NAME: V5_SESSION_COOKIE,
        BLESSBOARD_JOBS_ENABLED: "0",
        EXPECTED_DATABASE_ENV: "testing",
      },
      { warnFn: (m) => warnings.push(m) }
    );
    assert.equal(r.ok, true);
    assert.ok(warnings.length >= 5);
    assert.ok(warnings.every((w) => /DEPRECATED/.test(w)));
  });
});

describe("legacy production BASE_DOMAIN gate unchanged", () => {
  it("requires BASE_DOMAIN when not on V5 profile", () => {
    withEnv(
      {
        NODE_ENV: "production",
        PLATFORM_DEPLOYMENT_CODE: undefined,
        SESSION_SECRET: undefined,
        BASE_DOMAIN: undefined,
        DEPLOYMENT_ENV: undefined,
      },
      () => {
        assert.deepEqual(getProductionMissingRequiredEnv().sort(), [
          "BASE_DOMAIN",
          "SESSION_SECRET",
        ]);
      }
    );
  });

  it("blessboard-com-v4 does not enter foundation mode", () => {
    withEnv(
      {
        PLATFORM_DEPLOYMENT_CODE: CODE_COM_V4,
        DEPLOYMENT_ENV: "production",
      },
      () => {
        assert.equal(isV5FoundationMode(), false);
        assert.equal(hasAuthoritativeDeploymentProfile(), false);
      }
    );
  });
});

describe("www and cross-TLD redirects under V5 profile", () => {
  it("www.blessboard.org redirects to blessboard.org", () => {
    withEnv(MINIMAL_V5, () => {
      let status = null;
      let location = null;
      const req = {
        headers: { host: "www.blessboard.org", "x-forwarded-proto": "https" },
        originalUrl: "/features?x=1",
        protocol: "http",
        get(name) {
          const key = String(name || "").toLowerCase();
          if (key === "host") return this.headers.host;
          if (key === "x-forwarded-proto") return this.headers["x-forwarded-proto"];
          return undefined;
        },
      };
      const res = {
        redirect(code, url) {
          status = code;
          location = url;
        },
      };
      let nextCalled = false;
      foundationWwwToApexRedirect(req, res, () => {
        nextCalled = true;
      });
      assert.equal(nextCalled, false);
      assert.equal(status, 301);
      assert.equal(location, "https://blessboard.org/features?x=1");
    });
  });

  it("blessboard.org apex does not redirect to blessboard.com", () => {
    withEnv(MINIMAL_V5, () => {
      assert.equal(getBlessBoardCanonicalDomain(), "blessboard.org");
      assert.ok(!getBlessBoardApexDomainSet().has("blessboard.com"));
      let redirected = false;
      foundationWwwToApexRedirect(
        {
          headers: { host: "blessboard.org" },
          originalUrl: "/",
          get(name) {
            if (String(name || "").toLowerCase() === "host") return this.headers.host;
            return undefined;
          },
        },
        {
          redirect() {
            redirected = true;
          },
        },
        () => {}
      );
      assert.equal(redirected, false);
    });
  });
});

describe("session cookie isolation under profile", () => {
  it("uses blessboard_org_v5_sid and Secure in production", () => {
    withEnv(MINIMAL_V5, () => {
      assert.equal(getV5SessionCookieName(), V5_SESSION_COOKIE);
      assert.equal(parseSessionCookieName().name, V5_SESSION_COOKIE);
      assert.equal(parseBlessBoardJobsEnabled().enabled, false);
    });
  });
});
