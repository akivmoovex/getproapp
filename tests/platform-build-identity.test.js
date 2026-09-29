"use strict";

/**
 * V2.03 — Shared platform build identity (deployed Git branch / version label).
 */

const { describe, it, beforeEach, afterEach } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const os = require("os");

const {
  getBuildIdentity,
  UNKNOWN_BRANCH,
  BRANCH_ENV_KEYS,
} = require("../src/platform/runtime/buildIdentity");
const {
  resolveDeploymentBrand,
} = require("../src/platform/config/deploymentBrand");
const {
  CODE_MOOVEX_PLATFORM_TESTING,
  CODE_MOOVEX_PLATFORM_PRODUCTION,
  CODE_MOOVEX_PLATFORM_V8_TESTING,
  resetDeploymentProfileWarningsForTests,
} = require("../src/platform/config/deploymentProfiles");
const { renderV5Ejs } = require("../src/blessboard/http/v5EjsTemplateCache");
const {
  renderPublicView,
} = require("../src/activeclinic/http/renderActiveClinicPublic");

const PROFILE_KEYS = [
  "PLATFORM_DEPLOYMENT_CODE",
  "DEPLOYMENT_ENV",
  "EXPECTED_DATABASE_ENV",
  "DATABASE_IDENTITY_ENV",
  "GETPRO_GIT_BRANCH",
  "GIT_BRANCH",
  "GITHUB_REF_NAME",
  "VERCEL_GIT_COMMIT_REF",
  "HOSTINGER_GIT_BRANCH",
  "DEPLOYMENT_BRANCH",
  "GETPRO_GIT_SHA",
  "GIT_SHA",
  "COMMIT_SHA",
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

function testingEnv(extra) {
  return {
    PLATFORM_DEPLOYMENT_CODE: CODE_MOOVEX_PLATFORM_TESTING,
    DEPLOYMENT_ENV: "testing",
    DATABASE_IDENTITY_ENV: "testing",
    NODE_ENV: "production",
    SESSION_SECRET: "test-session-secret-32chars-min!!",
    DATABASE_URL: "postgres://user:pass@localhost:5432/bb_test",
    ...(extra || {}),
  };
}

function productionEnv(extra) {
  return {
    PLATFORM_DEPLOYMENT_CODE: CODE_MOOVEX_PLATFORM_PRODUCTION,
    DEPLOYMENT_ENV: "production",
    DATABASE_IDENTITY_ENV: "production",
    NODE_ENV: "production",
    SESSION_SECRET: "test-session-secret-32chars-min!!",
    DATABASE_URL: "postgres://user:pass@localhost:5432/bb_prod",
    ...(extra || {}),
  };
}

describe("platform buildIdentity", () => {
  beforeEach(() => {
    resetDeploymentProfileWarningsForTests();
  });

  afterEach(() => {
    resetDeploymentProfileWarningsForTests();
  });

  it("A: GETPRO_GIT_BRANCH=V10 → branch V10", () => {
    withEnv(testingEnv({ GETPRO_GIT_BRANCH: "V10" }), () => {
      const id = getBuildIdentity({ env: process.env });
      assert.equal(id.branch, "V10");
      assert.equal(id.branchSource, "GETPRO_GIT_BRANCH");
    });
  });

  it("B: environment=testing → displayLabel \"V10 testing\"", () => {
    withEnv(testingEnv({ GETPRO_GIT_BRANCH: "V10" }), () => {
      const id = getBuildIdentity({ env: process.env });
      assert.equal(id.environment, "testing");
      assert.equal(id.displayLabel, "V10 testing");
      assert.equal(id.deploymentCode, CODE_MOOVEX_PLATFORM_TESTING);
    });
  });

  it("C+D+I: BlessBoard and ActiveClinic receive the same shared identity", () => {
    withEnv(
      testingEnv({
        GETPRO_GIT_BRANCH: "V10",
        GETPRO_GIT_SHA: "5e2e77074ee6375834a9089a306df5d5c383aea9",
      }),
      () => {
        const shared = getBuildIdentity({ env: process.env });
        const bbBrand = resolveDeploymentBrand(process.env);
        assert.equal(bbBrand.brandSubtitle, "V10 testing");
        assert.equal(bbBrand.brandSubtitleSource, "buildIdentity");

        const bbHtml = renderV5Ejs("partials/apex-shell-start.ejs", {
          pageTitle: "Home",
          authenticated: false,
          activeNav: "home",
          csrfToken: "tok",
        });
        assert.match(bbHtml, /V10 testing/);
        assert.doesNotMatch(bbHtml, /V9 [Tt]esting/);

        const acHtml = renderPublicView("public/home", {
          csrfToken: "tok",
          pageTitle: "ActiveClinic",
          pageId: "public-home",
        });
        assert.match(acHtml, /data-gp-build-identity="1"/);
        assert.match(acHtml, /V10 testing/);
        assert.doesNotMatch(acHtml, /V9 [Tt]esting/);

        assert.equal(shared.displayLabel, "V10 testing");
        assert.equal(bbBrand.brandSubtitle, shared.displayLabel);
      }
    );
  });

  it("E: no hard-coded V9/V8/V10 testing literals remain in runtime UI sources", () => {
    const roots = [
      path.join(__dirname, "../src/platform/config/canonicalDeploymentProfiles.js"),
      path.join(__dirname, "../src/platform/config/deploymentBrand.js"),
      path.join(__dirname, "../src/platform/runtime/buildIdentity.js"),
      path.join(__dirname, "../views/blessboard/v5/partials/platform-brand-subtitle.ejs"),
      path.join(__dirname, "../views/activeclinic/partials/public-platform-header.ejs"),
    ];
    for (const file of roots) {
      const text = fs.readFileSync(file, "utf8");
      assert.doesNotMatch(text, /["']V9 [Tt]esting["']/);
      assert.doesNotMatch(text, /["']V8 [Tt]esting["']/);
      assert.doesNotMatch(text, /["']V10 [Tt]esting["']/);
    }
  });

  it("F: unknown branch does NOT falsely report V9 or V10", () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "gp-build-id-"));
    try {
      withEnv(
        testingEnv({
          GETPRO_GIT_BRANCH: undefined,
          GIT_BRANCH: undefined,
          GITHUB_REF_NAME: undefined,
          VERCEL_GIT_COMMIT_REF: undefined,
          HOSTINGER_GIT_BRANCH: undefined,
          DEPLOYMENT_BRANCH: undefined,
        }),
        () => {
          const id = getBuildIdentity({ env: process.env, appRoot: tmp });
          assert.equal(id.branch, UNKNOWN_BRANCH);
          assert.equal(id.displayLabel, "UNKNOWN testing");
          assert.notEqual(id.branch, "V9");
          assert.notEqual(id.branch, "V10");
          assert.doesNotMatch(id.displayLabel, /\bV9\b/);
          assert.doesNotMatch(id.displayLabel, /\bV10\b/);
        }
      );
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });

  it("G: production environment continues to resolve production correctly", () => {
    withEnv(productionEnv({ GETPRO_GIT_BRANCH: "V10" }), () => {
      const id = getBuildIdentity({ env: process.env });
      assert.equal(id.environment, "production");
      assert.equal(id.displayLabel, "V10 production");
      assert.equal(id.deploymentCode, CODE_MOOVEX_PLATFORM_PRODUCTION);
      const brand = resolveDeploymentBrand(process.env);
      assert.equal(brand.brandSubtitleSource, null);
      assert.equal(brand.brandSubtitle, null);
    });
  });

  it("H: SHA comes from existing authoritative deployment SHA source", () => {
    const full = "5e2e77074ee6375834a9089a306df5d5c383aea9";
    withEnv(testingEnv({ GETPRO_GIT_BRANCH: "V10", GETPRO_GIT_SHA: full }), () => {
      const id = getBuildIdentity({ env: process.env });
      assert.equal(id.gitSha, full);
      assert.equal(id.gitShaShort, full.slice(0, 12));
    });
  });

  it("prefers GETPRO_GIT_BRANCH over other provider keys", () => {
    withEnv(
      testingEnv({
        GETPRO_GIT_BRANCH: "V10",
        GITHUB_REF_NAME: "V9",
        GIT_BRANCH: "main",
      }),
      () => {
        const id = getBuildIdentity({ env: process.env });
        assert.equal(id.branch, "V10");
        assert.equal(id.branchSource, "GETPRO_GIT_BRANCH");
      }
    );
  });

  it("V8 testing profile also uses buildIdentity subtitle source", () => {
    withEnv(
      {
        ...testingEnv({ GETPRO_GIT_BRANCH: "V8" }),
        PLATFORM_DEPLOYMENT_CODE: CODE_MOOVEX_PLATFORM_V8_TESTING,
      },
      () => {
        const brand = resolveDeploymentBrand(process.env);
        assert.equal(brand.brandSubtitleSource, "buildIdentity");
        assert.equal(brand.brandSubtitle, "V8 testing");
      }
    );
  });

  it("BRANCH_ENV_KEYS documents the canonical resolution order", () => {
    assert.equal(BRANCH_ENV_KEYS[0], "GETPRO_GIT_BRANCH");
    assert.ok(BRANCH_ENV_KEYS.includes("GITHUB_REF_NAME"));
    assert.ok(BRANCH_ENV_KEYS.includes("HOSTINGER_GIT_BRANCH"));
  });
});
