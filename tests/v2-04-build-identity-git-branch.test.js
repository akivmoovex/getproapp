"use strict";

/**
 * V2.04 — Build identity: GETPRO_GIT_BRANCH authoritative (no UNKNOWN when set).
 */

const { describe, it, beforeEach, afterEach } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const os = require("os");

const {
  getBuildIdentity,
  UNKNOWN_BRANCH,
} = require("../src/platform/runtime/buildIdentity");
const {
  resolveDeploymentBrand,
} = require("../src/platform/config/deploymentBrand");
const {
  CODE_MOOVEX_PLATFORM_V8_TESTING,
  CODE_MOOVEX_PLATFORM_PRODUCTION,
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
    PLATFORM_DEPLOYMENT_CODE: CODE_MOOVEX_PLATFORM_V8_TESTING,
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

function clearBranchEnv() {
  return {
    GETPRO_GIT_BRANCH: undefined,
    GIT_BRANCH: undefined,
    GITHUB_REF_NAME: undefined,
    VERCEL_GIT_COMMIT_REF: undefined,
    HOSTINGER_GIT_BRANCH: undefined,
    DEPLOYMENT_BRANCH: undefined,
  };
}

describe("V2.04 build identity GETPRO_GIT_BRANCH", () => {
  beforeEach(() => {
    resetDeploymentProfileWarningsForTests();
  });

  afterEach(() => {
    resetDeploymentProfileWarningsForTests();
  });

  it("GETPRO_GIT_BRANCH=V4 → displayLabel \"V4 testing\"", () => {
    withEnv(testingEnv({ GETPRO_GIT_BRANCH: "V4" }), () => {
      const id = getBuildIdentity({ env: process.env });
      assert.equal(id.branch, "V4");
      assert.equal(id.branchSource, "GETPRO_GIT_BRANCH");
      assert.equal(id.environment, "testing");
      assert.equal(id.displayLabel, "V4 testing");
    });
  });

  it("missing env + git HEAD ref → branch from git metadata", () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "gp-bid-git-"));
    try {
      fs.mkdirSync(path.join(tmp, ".git", "refs", "heads"), { recursive: true });
      fs.writeFileSync(path.join(tmp, ".git", "HEAD"), "ref: refs/heads/release-candidate\n");
      fs.writeFileSync(path.join(tmp, ".git", "refs", "heads", "release-candidate"), "abc123\n");
      withEnv(testingEnv(clearBranchEnv()), () => {
        const id = getBuildIdentity({ env: process.env, appRoot: tmp });
        assert.equal(id.branch, "release-candidate");
        assert.equal(id.branchSource, "git.head-ref");
        assert.equal(id.displayLabel, "release-candidate testing");
      });
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });

  it("neither env nor git → UNKNOWN testing", () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "gp-bid-none-"));
    try {
      withEnv(testingEnv(clearBranchEnv()), () => {
        const id = getBuildIdentity({ env: process.env, appRoot: tmp });
        assert.equal(id.branch, UNKNOWN_BRANCH);
        assert.equal(id.displayLabel, "UNKNOWN testing");
      });
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });

  it("BB and AC resolve identically for V4 testing", () => {
    withEnv(testingEnv({ GETPRO_GIT_BRANCH: "V4" }), () => {
      const shared = getBuildIdentity({ env: process.env });
      assert.equal(shared.displayLabel, "V4 testing");

      const brand = resolveDeploymentBrand(process.env);
      assert.equal(brand.brandSubtitleSource, "buildIdentity");
      assert.equal(brand.brandSubtitle, "V4 testing");

      const bbHtml = renderV5Ejs("partials/apex-shell-start.ejs", {
        pageTitle: "Home",
        authenticated: false,
        activeNav: "home",
        csrfToken: "tok",
      });
      assert.match(bbHtml, /V4 testing/);
      assert.doesNotMatch(bbHtml, /UNKNOWN testing/);

      const acHtml = renderPublicView("public/home", {
        csrfToken: "tok",
        pageTitle: "ActiveClinic",
        pageId: "public-home",
      });
      assert.match(acHtml, /V4 testing/);
      assert.doesNotMatch(acHtml, /UNKNOWN testing/);
      assert.equal(shared.displayLabel, brand.brandSubtitle);
    });
  });

  it("production label unchanged (V4 production; no testing subtitle)", () => {
    withEnv(productionEnv({ GETPRO_GIT_BRANCH: "V4" }), () => {
      const id = getBuildIdentity({ env: process.env });
      assert.equal(id.environment, "production");
      assert.equal(id.displayLabel, "V4 production");
      assert.equal(id.deploymentCode, CODE_MOOVEX_PLATFORM_PRODUCTION);
      const brand = resolveDeploymentBrand(process.env);
      assert.equal(brand.brandSubtitleSource, null);
      assert.equal(brand.brandSubtitle, null);
    });
  });

  it("live process.env.GETPRO_GIT_BRANCH wins over stale opts.env snapshot", () => {
    withEnv(testingEnv({ GETPRO_GIT_BRANCH: "V4" }), () => {
      const stale = {
        ...process.env,
        GETPRO_GIT_BRANCH: "",
        GIT_BRANCH: "",
        GITHUB_REF_NAME: "",
      };
      const id = getBuildIdentity({ env: stale });
      assert.equal(id.branch, "V4");
      assert.equal(id.branchSource, "GETPRO_GIT_BRANCH");
      assert.equal(id.displayLabel, "V4 testing");
    });
  });
});
