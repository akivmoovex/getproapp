"use strict";

/**
 * Deployment-profile brand subtitle — production vs staging presentation.
 */

const { describe, it, beforeEach, afterEach } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");

const {
  CODE_COM_PRODUCTION,
  CODE_ORG_STAGING,
  resolveDeploymentConfiguration,
  resetDeploymentProfileWarningsForTests,
} = require("../src/platform/config/deploymentProfiles");
const {
  resolveDeploymentBrand,
} = require("../src/platform/config/deploymentBrand");
const { renderV5Ejs } = require("../src/blessboard/http/v5EjsTemplateCache");

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

function productionEnv() {
  return {
    PLATFORM_DEPLOYMENT_CODE: CODE_COM_PRODUCTION,
    NODE_ENV: "production",
    SESSION_SECRET: "test-session-secret-32chars-min!!",
    DATABASE_URL: "postgres://user:pass@localhost:5432/bb_prod",
  };
}

function stagingEnv() {
  return {
    PLATFORM_DEPLOYMENT_CODE: CODE_ORG_STAGING,
    NODE_ENV: "production",
    SESSION_SECRET: "test-session-secret-32chars-min!!",
    DATABASE_URL: "postgres://user:pass@localhost:5432/bb_test",
  };
}

describe("deployment brand subtitle", () => {
  beforeEach(() => {
    resetDeploymentProfileWarningsForTests();
  });

  afterEach(() => {
    resetDeploymentProfileWarningsForTests();
  });

  it("blessboard-com-production resolves Powered by GetPro", () => {
    withEnv(productionEnv(), () => {
      const brand = resolveDeploymentBrand();
      const cfg = resolveDeploymentConfiguration();
      assert.equal(brand.brandSubtitle, "Powered by GetPro");
      assert.equal(brand.brandSubtitleVariant, "production-partner");
      assert.equal(cfg.brandSubtitle, "Powered by GetPro");
      assert.equal(cfg.brandSubtitleVariant, "production-partner");
      assert.equal(cfg.code, CODE_COM_PRODUCTION);
    });
  });

  it("blessboard-org-staging resolves Demo Only", () => {
    withEnv(stagingEnv(), () => {
      const brand = resolveDeploymentBrand();
      const cfg = resolveDeploymentConfiguration();
      assert.equal(brand.brandSubtitle, "Demo Only");
      assert.equal(brand.brandSubtitleVariant, "demo");
      assert.equal(cfg.brandSubtitle, "Demo Only");
      assert.equal(cfg.brandSubtitleVariant, "demo");
      assert.equal(cfg.code, CODE_ORG_STAGING);
    });
  });

  it("production does not resolve Demo Only", () => {
    withEnv(productionEnv(), () => {
      const brand = resolveDeploymentBrand();
      assert.notEqual(brand.brandSubtitle, "Demo Only");
      assert.notEqual(brand.brandSubtitleVariant, "demo");
    });
  });

  it("staging does not resolve Powered by GetPro", () => {
    withEnv(stagingEnv(), () => {
      const brand = resolveDeploymentBrand();
      assert.notEqual(brand.brandSubtitle, "Powered by GetPro");
      assert.notEqual(brand.brandSubtitleVariant, "production-partner");
    });
  });

  it("unknown or unprofiled deployments resolve neither subtitle", () => {
    withEnv(
      {
        PLATFORM_DEPLOYMENT_CODE: undefined,
        NODE_ENV: "development",
      },
      () => {
        const brand = resolveDeploymentBrand();
        assert.equal(brand.authoritative, false);
        assert.equal(brand.brandSubtitle, null);
        assert.equal(brand.brandSubtitleVariant, null);
      }
    );
  });

  it("selection uses PLATFORM_DEPLOYMENT_CODE profile, not hostname", () => {
    withEnv(
      {
        ...productionEnv(),
        BLESSBOARD_CANONICAL_DOMAIN: "blessboard.org",
        HOST: "blessboard.org",
      },
      () => {
        const brand = resolveDeploymentBrand();
        assert.equal(brand.brandSubtitle, "Powered by GetPro");
        assert.equal(brand.brandSubtitleVariant, "production-partner");
      }
    );
    withEnv(
      {
        ...stagingEnv(),
        BLESSBOARD_CANONICAL_DOMAIN: "blessboard.com",
        HOST: "blessboard.com",
      },
      () => {
        const brand = resolveDeploymentBrand();
        assert.equal(brand.brandSubtitle, "Demo Only");
        assert.equal(brand.brandSubtitleVariant, "demo");
      }
    );
  });

  it("does not require a new environment variable beyond PLATFORM_DEPLOYMENT_CODE", () => {
    withEnv(productionEnv(), () => {
      const brand = resolveDeploymentBrand();
      assert.equal(brand.brandSubtitle, "Powered by GetPro");
    });
    withEnv(stagingEnv(), () => {
      const brand = resolveDeploymentBrand();
      assert.equal(brand.brandSubtitle, "Demo Only");
    });
  });

  it("apex desktop header renders production subtitle", () => {
    withEnv(productionEnv(), () => {
      const html = renderV5Ejs("partials/apex-shell-start.ejs", {
        pageTitle: "Home",
        authenticated: false,
        activeNav: "home",
        csrfToken: "tok",
      });
      assert.match(html, /data-bb-brand-subtitle="1"/);
      assert.match(html, /data-bb-brand-subtitle-variant="production-partner"/);
      assert.match(html, /Powered by/);
      assert.match(html, /GetPro/);
      assert.doesNotMatch(html, /Demo Only/);
      assert.match(html, /bb-apex-brand/);
    });
  });

  it("apex desktop header renders staging subtitle", () => {
    withEnv(stagingEnv(), () => {
      const html = renderV5Ejs("partials/apex-shell-start.ejs", {
        pageTitle: "Home",
        authenticated: false,
        activeNav: "home",
        csrfToken: "tok",
      });
      assert.match(html, /data-bb-brand-subtitle-variant="demo"/);
      assert.match(html, /Demo Only/);
      assert.doesNotMatch(html, /bb-powered-by__getpro/);
      assert.doesNotMatch(html, /Powered by[\s\S]*GetPro/);
    });
  });

  it("apex mobile drawer renders the correct subtitle", () => {
    withEnv(stagingEnv(), () => {
      const html = renderV5Ejs("partials/apex-shell-start.ejs", {
        pageTitle: "Home",
        authenticated: false,
        activeNav: "home",
        csrfToken: "tok",
      });
      assert.match(html, /bb-apex-drawer__powered/);
      assert.match(html, /bb-powered-by--demo/);
      assert.match(html, /Demo Only/);
    });
    withEnv(productionEnv(), () => {
      const html = renderV5Ejs("partials/apex-shell-start.ejs", {
        pageTitle: "Home",
        authenticated: false,
        activeNav: "home",
        csrfToken: "tok",
      });
      assert.match(html, /bb-apex-drawer__powered/);
      assert.match(html, /bb-powered-by__getpro/);
      assert.doesNotMatch(html, /bb-powered-by--demo/);
    });
  });

  it("login page renders the correct subtitle", () => {
    withEnv(productionEnv(), () => {
      const html = renderV5Ejs("apex/login.ejs", {
        csrfToken: "tok",
        error: null,
        errorState: null,
        errorTitle: null,
        emailValue: "",
        transferHostname: null,
        hostKind: "apex",
        subtitle: "Sign in",
        panelTitle: "Welcome",
        panelLead: "Lead",
        loggedOut: false,
        passwordReset: false,
      });
      assert.match(html, /data-bb-brand-subtitle-variant="production-partner"/);
      assert.match(html, /GetPro/);
      assert.doesNotMatch(html, /Demo Only/);
    });
    withEnv(stagingEnv(), () => {
      const html = renderV5Ejs("apex/login.ejs", {
        csrfToken: "tok",
        error: null,
        errorState: null,
        errorTitle: null,
        emailValue: "",
        transferHostname: null,
        hostKind: "apex",
        subtitle: "Sign in",
        panelTitle: "Welcome",
        panelLead: "Lead",
        loggedOut: false,
        passwordReset: false,
      });
      assert.match(html, /data-bb-brand-subtitle-variant="demo"/);
      assert.match(html, /Demo Only/);
      assert.doesNotMatch(html, /bb-powered-by__getpro/);
    });
  });

  it("church-owned shell-brand is not wired to platform brand subtitle", () => {
    const shellBrand = fs.readFileSync(
      path.join(
        __dirname,
        "../views/blessboard/v5/public/partials/shell-brand.ejs"
      ),
      "utf8"
    );
    assert.doesNotMatch(shellBrand, /platform-brand-subtitle/);
    assert.doesNotMatch(shellBrand, /deploymentBrand/);
    assert.doesNotMatch(shellBrand, /brandSubtitle/);

    const tenantStart = fs.readFileSync(
      path.join(
        __dirname,
        "../views/blessboard/v5/partials/tenant-public-shell-start.ejs"
      ),
      "utf8"
    );
    assert.match(tenantStart, /shell-brand/);
    assert.doesNotMatch(tenantStart, /platform-brand-subtitle/);
    assert.doesNotMatch(tenantStart, /apex-platform-brand/);
  });

  it("unprofiled apex header renders neither platform subtitle", () => {
    withEnv(
      {
        PLATFORM_DEPLOYMENT_CODE: undefined,
        NODE_ENV: "development",
      },
      () => {
        const html = renderV5Ejs("partials/apex-shell-start.ejs", {
          pageTitle: "Home",
          authenticated: false,
          activeNav: "home",
          csrfToken: "tok",
        });
        assert.doesNotMatch(html, /data-bb-brand-subtitle="1"/);
        assert.doesNotMatch(html, /Demo Only/);
        // Legacy powered-by remains in drawer for unprofiled hosts
        assert.match(html, /bb-powered-by__getpro/);
      }
    );
  });
});
