"use strict";

/**
 * Unified BlessBoard deployment profiles — identical Hostinger keys for .com and .org.
 */

const { describe, it, beforeEach } = require("node:test");
const assert = require("node:assert/strict");

const {
  DEPLOYMENT_PROFILES,
  CODE_COM_PRODUCTION,
  CODE_ORG_STAGING,
  CODE_ACTIVECLINIC_ORG_V6,
  CODE_ORG_V5,
  CODE_COM_V4,
  COOKIE_COM,
  COOKIE_ORG,
  PRODUCTION_SESSION_COOKIE,
  requiredHostingerKeys,
  optionalHostingerKeys,
  getDeploymentProfile,
  hasAuthoritativeDeploymentProfile,
  getDeploymentSetting,
  getAuthoritativeDomainConfig,
  resolveDeploymentConfiguration,
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

const MINIMAL_PRODUCTION = Object.freeze({
  NODE_ENV: "production",
  PLATFORM_DEPLOYMENT_CODE: CODE_COM_PRODUCTION,
  DATABASE_URL: "postgres://prod-user:prod-pass@127.0.0.1:5432/blessboard_prod_test",
  SESSION_SECRET: "p".repeat(40),
});

const MINIMAL_STAGING = Object.freeze({
  NODE_ENV: "production",
  PLATFORM_DEPLOYMENT_CODE: CODE_ORG_STAGING,
  DATABASE_URL: "postgres://test-user:test-pass@127.0.0.1:5432/blessboard_staging_test",
  SESSION_SECRET: "s".repeat(40),
});

describe("required Hostinger keys are identical", () => {
  it("requiredHostingerKeys(production) equals requiredHostingerKeys(staging)", () => {
    assert.deepEqual(
      [...requiredHostingerKeys(CODE_COM_PRODUCTION)],
      [...requiredHostingerKeys(CODE_ORG_STAGING)]
    );
    assert.deepEqual([...requiredHostingerKeys(CODE_COM_PRODUCTION)], [
      "NODE_ENV",
      "PLATFORM_DEPLOYMENT_CODE",
      "DATABASE_URL",
      "SESSION_SECRET",
    ]);
    assert.ok(optionalHostingerKeys(CODE_COM_PRODUCTION).includes("GETPRO_PG_SSL"));
    assert.ok(optionalHostingerKeys(CODE_ORG_STAGING).includes("GETPRO_PG_SSL"));
  });
});

describe("deploymentProfiles registry", () => {
  beforeEach(() => {
    resetDeploymentProfileWarningsForTests();
  });

  it("registers blessboard-com-production as authoritative V5 foundation (production)", () => {
    const p = DEPLOYMENT_PROFILES[CODE_COM_PRODUCTION];
    assert.equal(p.authoritative, true);
    assert.equal(p.runtimeMode, "v5-foundation");
    assert.equal(p.productCode, "blessboard");
    assert.equal(p.deploymentEnvironment, "production");
    assert.equal(p.expectedDatabaseEnvironment, "production");
    assert.equal(p.canonicalDomain, "blessboard.com");
    assert.equal(p.sessionCookieName, COOKIE_COM);
    assert.equal(p.csrfCookieName, "blessboard_org_csrf");
    assert.equal(p.jobsEnabled, true);
    assert.equal(p.allowTestUsersByDefault, false);
    assert.ok(!p.apexDomains.includes("blessboard.org"));
  });

  it("registers blessboard-org-staging as authoritative V5 foundation", () => {
    const p = DEPLOYMENT_PROFILES[CODE_ORG_STAGING];
    assert.equal(p.authoritative, true);
    assert.equal(p.runtimeMode, "v5-foundation");
    assert.equal(p.productCode, "blessboard");
    assert.equal(p.deploymentEnvironment, "testing");
    assert.equal(p.expectedDatabaseEnvironment, "testing");
    assert.equal(p.canonicalDomain, "blessboard.org");
    assert.equal(p.sessionCookieName, COOKIE_ORG);
    assert.equal(p.csrfCookieName, "blessboard_org_csrf");
    assert.equal(p.jobsEnabled, false);
    assert.equal(p.allowTestUsersByDefault, false);
    assert.ok(!p.apexDomains.includes("blessboard.com"));
  });

  it("registers activeclinic-org-v6 as authoritative ActiveClinic testing profile", () => {
    const p = DEPLOYMENT_PROFILES[CODE_ACTIVECLINIC_ORG_V6];
    assert.equal(p.productCode, "activeclinic");
    assert.equal(p.canonicalDomain, "activeclinic.org");
    assert.equal(p.publicOrigin, "https://activeclinic.org");
    assert.equal(p.deploymentEnvironment, "testing");
    assert.equal(p.expectedDatabaseEnvironment, "testing");
    assert.equal(p.sessionCookieName, "activeclinic_org_sid");
    assert.equal(p.csrfCookieName, "activeclinic_org_csrf");
    assert.equal(p.jobsEnabled, false);
    assert.ok(!p.apexDomains.includes("blessboard.com"));
    assert.ok(!p.apexDomains.includes("blessboard.org"));
    assert.equal(p.churchHostDomain, "activeclinic.org");
  });

  it("rejects Hostinger typo activeclinic-org-testing fail-closed", () => {
    const r = resolveDeploymentProfileOrError({
      PLATFORM_DEPLOYMENT_CODE: "activeclinic-org-testing",
    });
    assert.equal(r.ok, false);
    assert.equal(r.code, "unknown_deployment_code");
    assert.match(r.message, /activeclinic-org-testing/);
    assert.match(r.message, /activeclinic-org-v6/);
    assert.match(r.message, /PLATFORM_DEPLOYMENT_CODE/);
    assert.match(r.message, /Startup intentionally blocked/);
    assert.doesNotMatch(r.message, /postgres:\/\//i);
    assert.doesNotMatch(r.message, /SESSION_SECRET/i);
  });

  it("maps deprecated blessboard-org-v5 alias to staging with warning", () => {
    const warnings = [];
    const r = resolveDeploymentProfileOrError(
      { PLATFORM_DEPLOYMENT_CODE: CODE_ORG_V5 },
      { warnFn: (m) => warnings.push(m) }
    );
    assert.equal(r.ok, true);
    assert.equal(r.aliased, true);
    assert.equal(r.profile.deploymentCode, CODE_ORG_STAGING);
    assert.ok(warnings.some((w) => /DEPRECATED/.test(w)));
  });

  it("maps deprecated blessboard-com-v4 alias to production V5 foundation", () => {
    const r = resolveDeploymentProfileOrError({
      PLATFORM_DEPLOYMENT_CODE: CODE_COM_V4,
    });
    assert.equal(r.ok, true);
    assert.equal(r.aliased, true);
    assert.equal(r.profile.deploymentCode, CODE_COM_PRODUCTION);
    assert.equal(r.profile.runtimeMode, "v5-foundation");
  });

  it("unknown PLATFORM_DEPLOYMENT_CODE fails closed", () => {
    const r = resolveDeploymentProfileOrError({
      PLATFORM_DEPLOYMENT_CODE: "not-a-real-profile",
    });
    assert.equal(r.ok, false);
    assert.equal(r.code, "unknown_deployment_code");
    assert.match(r.message, /Startup intentionally blocked/);
    assert.match(r.message, /Fix Hostinger PLATFORM_DEPLOYMENT_CODE/);
  });

  it("invalid format fails closed", () => {
    const r = resolveDeploymentProfileOrError({
      PLATFORM_DEPLOYMENT_CODE: "Bad_Code!",
    });
    assert.equal(r.ok, false);
    assert.equal(r.code, "invalid_deployment_code");
    assert.match(r.message, /Startup intentionally blocked/);
  });

  it("unset PLATFORM_DEPLOYMENT_CODE is legacy-ok", () => {
    const r = resolveDeploymentProfileOrError({});
    assert.equal(r.ok, true);
    assert.equal(r.profile, null);
  });
});

describe("minimal production Hostinger env", () => {
  beforeEach(() => resetDeploymentProfileWarningsForTests());

  it("selects V5 foundation runtime and derives domains/jobs/cookie/env", () => {
    withEnv(MINIMAL_PRODUCTION, () => {
      const deployment = resolveDeploymentConfiguration();
      assert.equal(deployment.runtimeMode, "v5-foundation");
      assert.equal(deployment.environment, "production");
      assert.equal(deployment.expectedDatabaseEnvironment, "production");
      assert.equal(isV5FoundationMode(), true);
      assert.equal(hasAuthoritativeDeploymentProfile(), true);
      assert.equal(getDeploymentEnvMode(), "production");
      assert.equal(getBlessBoardCanonicalDomain(), "blessboard.com");
      assert.equal(getBlessBoardPublicUrl(), "https://blessboard.com");
      assert.equal(getBlessBoardAdminUrl(), "https://blessboard.com");
      assert.equal(getChurchHostDomain(), "blessboard.com");
      assert.deepEqual([...getBlessBoardApexDomainSet()].sort(), [
        "blessboard.com",
        "www.blessboard.com",
      ]);
      assert.equal(areBlessBoardJobsEnabled(), true);
      assert.equal(getSessionCookieName(), COOKIE_COM);
      assert.ok(!getBlessBoardApexDomainSet().has("blessboard.org"));
      assert.equal(getDeploymentSetting("trustProxy"), 1);
      assert.equal(resolveListenHost(), "0.0.0.0");
      assert.equal(resolveTrustProxy(), 1);
    });
  });

  it("allows missing BASE_DOMAIN for production profile", () => {
    withEnv({ ...MINIMAL_PRODUCTION, BASE_DOMAIN: undefined }, () => {
      assert.deepEqual(getProductionMissingRequiredEnv(), []);
    });
  });

  it("requires DATABASE_URL for production profile", () => {
    withEnv({ ...MINIMAL_PRODUCTION, DATABASE_URL: undefined }, () => {
      assert.deepEqual(getProductionMissingRequiredEnv(), ["DATABASE_URL"]);
    });
  });

  it("requires SESSION_SECRET for production profile", () => {
    withEnv({ ...MINIMAL_PRODUCTION, SESSION_SECRET: undefined }, () => {
      assert.deepEqual(getProductionMissingRequiredEnv(), ["SESSION_SECRET"]);
    });
  });
});

describe("minimal staging Hostinger env", () => {
  beforeEach(() => resetDeploymentProfileWarningsForTests());

  it("selects V5 foundation runtime and derives domains/jobs/cookie/env", () => {
    withEnv(MINIMAL_STAGING, () => {
      const deployment = resolveDeploymentConfiguration();
      assert.equal(deployment.runtimeMode, "v5-foundation");
      assert.equal(deployment.environment, "testing");
      assert.equal(deployment.expectedDatabaseEnvironment, "testing");
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
      assert.equal(getSessionCookieName(), COOKIE_ORG);
      assert.equal(getV5SessionCookieName(), COOKIE_ORG);
      assert.equal(isBlessBoardOrgTestingDeployment(), true);
      assert.ok(!getBlessBoardApexDomainSet().has("blessboard.com"));
    });
  });

  it("allows missing BASE_DOMAIN for staging profile", () => {
    withEnv({ ...MINIMAL_STAGING, BASE_DOMAIN: undefined }, () => {
      assert.deepEqual(getProductionMissingRequiredEnv(), []);
    });
  });

  it("requires DATABASE_URL for staging profile", () => {
    withEnv({ ...MINIMAL_STAGING, DATABASE_URL: undefined }, () => {
      assert.deepEqual(getProductionMissingRequiredEnv(), ["DATABASE_URL"]);
    });
  });

  it("requires SESSION_SECRET for staging profile", () => {
    withEnv({ ...MINIMAL_STAGING, SESSION_SECRET: undefined }, () => {
      assert.deepEqual(getProductionMissingRequiredEnv(), ["SESSION_SECRET"]);
    });
  });

  it("pairing allows unset DEPLOYMENT_ENV for staging", () => {
    withEnv({ PLATFORM_DEPLOYMENT_CODE: CODE_ORG_STAGING }, () => {
      assert.equal(
        checkV5FoundationDeploymentPairing({
          PLATFORM_DEPLOYMENT_CODE: CODE_ORG_STAGING,
        }).ok,
        true
      );
    });
  });
});

describe("production and staging cookie names differ", () => {
  it("com and org profiles use distinct host-only cookie names", () => {
    assert.notEqual(COOKIE_COM, COOKIE_ORG);
    withEnv(MINIMAL_PRODUCTION, () => {
      assert.equal(getSessionCookieName(), COOKIE_COM);
    });
    withEnv(MINIMAL_STAGING, () => {
      assert.equal(getSessionCookieName(), COOKIE_ORG);
      assert.equal(getV5SessionCookieName(), COOKIE_ORG);
    });
  });
});

describe("authoritative profile conflicts", () => {
  beforeEach(() => resetDeploymentProfileWarningsForTests());

  it("staging DEPLOYMENT_ENV=production is fatal", () => {
    const r = validateAuthoritativeProfileCompatibility({
      PLATFORM_DEPLOYMENT_CODE: CODE_ORG_STAGING,
      DEPLOYMENT_ENV: "production",
    });
    assert.equal(r.ok, false);
    assert.equal(r.code, "deployment_env_conflict");
  });

  it("production DEPLOYMENT_ENV=testing is fatal", () => {
    const r = validateAuthoritativeProfileCompatibility({
      PLATFORM_DEPLOYMENT_CODE: CODE_COM_PRODUCTION,
      DEPLOYMENT_ENV: "testing",
    });
    assert.equal(r.ok, false);
    assert.equal(r.code, "deployment_env_conflict");
  });

  it("staging BLESSBOARD_CANONICAL_DOMAIN=blessboard.com is fatal", () => {
    const r = validateAuthoritativeProfileCompatibility({
      PLATFORM_DEPLOYMENT_CODE: CODE_ORG_STAGING,
      BLESSBOARD_CANONICAL_DOMAIN: "blessboard.com",
    });
    assert.equal(r.ok, false);
    assert.equal(r.code, "canonical_domain_conflict");
  });

  it("production BLESSBOARD_CANONICAL_DOMAIN=blessboard.org is fatal", () => {
    const r = validateAuthoritativeProfileCompatibility({
      PLATFORM_DEPLOYMENT_CODE: CODE_COM_PRODUCTION,
      BLESSBOARD_CANONICAL_DOMAIN: "blessboard.org",
    });
    assert.equal(r.ok, false);
    assert.equal(r.code, "canonical_domain_conflict");
  });

  it("staging apex list containing .com is fatal", () => {
    const r = validateAuthoritativeProfileCompatibility({
      PLATFORM_DEPLOYMENT_CODE: CODE_ORG_STAGING,
      BLESSBOARD_APEX_DOMAINS: "blessboard.org,www.blessboard.org,blessboard.com",
    });
    assert.equal(r.ok, false);
    assert.equal(r.code, "apex_domains_conflict");
  });

  it("production apex list containing .org is fatal", () => {
    const r = validateAuthoritativeProfileCompatibility({
      PLATFORM_DEPLOYMENT_CODE: CODE_COM_PRODUCTION,
      BLESSBOARD_APEX_DOMAINS: "blessboard.com,www.blessboard.com,blessboard.org",
    });
    assert.equal(r.ok, false);
    assert.equal(r.code, "apex_domains_conflict");
  });

  it("staging jobs enabled is fatal", () => {
    const r = validateAuthoritativeProfileCompatibility({
      PLATFORM_DEPLOYMENT_CODE: CODE_ORG_STAGING,
      BLESSBOARD_JOBS_ENABLED: "1",
    });
    assert.equal(r.ok, false);
    assert.equal(r.code, "jobs_enabled_conflict");
  });

  it("production BASE_DOMAIN=blessboard.org is fatal", () => {
    const r = validateAuthoritativeProfileCompatibility({
      PLATFORM_DEPLOYMENT_CODE: CODE_COM_PRODUCTION,
      BASE_DOMAIN: "blessboard.org",
    });
    assert.equal(r.ok, false);
    assert.equal(r.code, "base_domain_conflict");
  });

  it("SESSION_COOKIE_NAME=getpro_sid on staging is fatal", () => {
    const r = validateAuthoritativeProfileCompatibility({
      PLATFORM_DEPLOYMENT_CODE: CODE_ORG_STAGING,
      SESSION_COOKIE_NAME: PRODUCTION_SESSION_COOKIE,
    });
    assert.equal(r.ok, false);
    assert.equal(r.code, "session_cookie_conflict");
  });

  it("matching legacy duplicates warn but allow", () => {
    const warnings = [];
    const r = validateAuthoritativeProfileCompatibility(
      {
        PLATFORM_DEPLOYMENT_CODE: CODE_ORG_STAGING,
        DEPLOYMENT_ENV: "testing",
        BLESSBOARD_CANONICAL_DOMAIN: "blessboard.org",
        BLESSBOARD_APEX_DOMAINS: "blessboard.org,www.blessboard.org",
        BLESSBOARD_PUBLIC_URL: "https://blessboard.org",
        BLESSBOARD_ADMIN_URL: "https://blessboard.org",
        CHURCH_HOST_DOMAIN: "blessboard.org",
        SESSION_COOKIE_NAME: COOKIE_ORG,
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
  it("requires BASE_DOMAIN when no profile", () => {
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

  it("blessboard-com-v4 alias maps to production V5 foundation (not legacy)", () => {
    withEnv(
      {
        PLATFORM_DEPLOYMENT_CODE: CODE_COM_V4,
        DEPLOYMENT_ENV: "production",
      },
      () => {
        assert.equal(isV5FoundationMode(), true);
        assert.equal(hasAuthoritativeDeploymentProfile(), true);
        assert.equal(getDeploymentProfile().runtimeMode, "v5-foundation");
        assert.equal(getDeploymentProfile().deploymentEnvironment, "production");
      }
    );
  });
});

describe("www and cross-TLD redirects under profiles", () => {
  it("www.blessboard.org redirects to blessboard.org under staging", () => {
    withEnv(MINIMAL_STAGING, () => {
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

  it("staging apex never treats blessboard.com as alias", () => {
    withEnv(MINIMAL_STAGING, () => {
      assert.equal(getBlessBoardCanonicalDomain(), "blessboard.org");
      assert.ok(!getBlessBoardApexDomainSet().has("blessboard.com"));
      assert.ok(!getBlessBoardApexDomainSet().has("www.blessboard.com"));
    });
  });

  it("www.blessboard.com redirects to blessboard.com under production profile", () => {
    withEnv(MINIMAL_PRODUCTION, () => {
      let status = null;
      let location = null;
      foundationWwwToApexRedirect(
        {
          headers: { host: "www.blessboard.com", "x-forwarded-proto": "https" },
          originalUrl: "/pricing",
          protocol: "http",
          get(name) {
            const key = String(name || "").toLowerCase();
            if (key === "host") return this.headers.host;
            if (key === "x-forwarded-proto") return this.headers["x-forwarded-proto"];
            return undefined;
          },
        },
        {
          redirect(code, url) {
            status = code;
            location = url;
          },
        },
        () => {}
      );
      assert.equal(status, 301);
      assert.equal(location, "https://blessboard.com/pricing");
    });
  });

  it("production apex never treats blessboard.org as alias", () => {
    withEnv(MINIMAL_PRODUCTION, () => {
      assert.equal(getBlessBoardCanonicalDomain(), "blessboard.com");
      assert.ok(!getBlessBoardApexDomainSet().has("blessboard.org"));
      assert.ok(!getBlessBoardApexDomainSet().has("www.blessboard.org"));
      assert.ok(getBlessBoardApexDomainSet().has("www.blessboard.com"));
    });
  });
});

describe("session cookie isolation under profile", () => {
  it("staging uses blessboard_org_sid", () => {
    withEnv(MINIMAL_STAGING, () => {
      assert.equal(getV5SessionCookieName(), COOKIE_ORG);
      assert.equal(parseSessionCookieName().name, COOKIE_ORG);
      assert.equal(parseBlessBoardJobsEnabled().enabled, false);
    });
  });

  it("production uses blessboard_com_sid and enables jobs", () => {
    withEnv(MINIMAL_PRODUCTION, () => {
      assert.equal(getSessionCookieName(), COOKIE_COM);
      assert.equal(parseBlessBoardJobsEnabled().enabled, true);
    });
  });
});
