"use strict";

/**
 * Deployment env mode must follow explicit app env, not process.env.DEPLOYMENT_ENV.
 */

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const request = require("supertest");

const {
  getDeploymentEnvMode,
  isTestingDeployment,
  isProductionDeployment,
} = require("../src/church/blessBoardEnv");
const {
  isPublicDirectoryEnvironment,
  sqlPublicDirectoryEnvironmentFilter,
} = require("../src/church/orgDataEnvironment");
const {
  seedChurchDemoOrganizationsForDeploymentIfAllowed,
} = require("../src/seeds/seedChurchDemoOrganization");
const {
  assertControlledPilotSafety,
} = require("../src/services/church/churchControlledPilotSeedService");
const {
  searchPublicOrganizations,
} = require("../src/blessboard/repositories/publicChurchDirectoryRepository");
const { createV5FoundationApp } = require("../src/platform/http/v5FoundationServer");
const {
  CODE_MOOVEX_PLATFORM_TESTING,
  resetDeploymentProfileWarningsForTests,
} = require("../src/platform/config/deploymentProfiles");

const TESTING_ENV = Object.freeze({
  NODE_ENV: "test",
  DEPLOYMENT_ENV: "testing",
  PLATFORM_DEPLOYMENT_CODE: CODE_MOOVEX_PLATFORM_TESTING,
  SESSION_SECRET: "test-session-secret-at-least-32-chars!!",
});

const PRODUCTION_ENV = Object.freeze({
  NODE_ENV: "test",
  DEPLOYMENT_ENV: "production",
  SESSION_SECRET: "test-session-secret-at-least-32-chars!!",
});

const PROCESS_KEYS = ["DEPLOYMENT_ENV", "PLATFORM_DEPLOYMENT_CODE"];

function withProcessEnv(overrides, fn) {
  const prev = {};
  for (const key of PROCESS_KEYS) {
    prev[key] = process.env[key];
    if (overrides[key] === undefined) delete process.env[key];
    else process.env[key] = overrides[key];
  }
  const restore = () => {
    for (const key of PROCESS_KEYS) {
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

function assertTestingBehavior(env) {
  assert.equal(getDeploymentEnvMode(env), "testing");
  assert.equal(isTestingDeployment(env), true);
  assert.equal(isProductionDeployment(env), false);
  assert.equal(isPublicDirectoryEnvironment("demo", env), true);
  assert.match(sqlPublicDirectoryEnvironmentFilter("o", env), /'demo'/);
}

function assertProductionBehavior(env) {
  assert.equal(getDeploymentEnvMode(env), "production");
  assert.equal(isTestingDeployment(env), false);
  assert.equal(isProductionDeployment(env), true);
  assert.equal(isPublicDirectoryEnvironment("demo", env), false);
  assert.doesNotMatch(sqlPublicDirectoryEnvironmentFilter("o", env), /'demo'/);
}

describe("deployment env mode follows app env", () => {
  resetDeploymentProfileWarningsForTests();

  it("Matrix A: app testing / process testing → testing behavior", async () => {
    await withProcessEnv(
      { DEPLOYMENT_ENV: "testing", PLATFORM_DEPLOYMENT_CODE: CODE_MOOVEX_PLATFORM_TESTING },
      () => {
        assertTestingBehavior(TESTING_ENV);
      }
    );
  });

  it("Matrix B: app testing / process production → testing behavior", async () => {
    await withProcessEnv({ DEPLOYMENT_ENV: "production" }, () => {
      assertTestingBehavior(TESTING_ENV);
    });
  });

  it("Matrix C: app production / process testing → production behavior", async () => {
    await withProcessEnv({ DEPLOYMENT_ENV: "testing" }, async () => {
      assertProductionBehavior(PRODUCTION_ENV);
      const seed = await seedChurchDemoOrganizationsForDeploymentIfAllowed(null, PRODUCTION_ENV);
      assert.equal(seed.skipped, true);
      await assert.rejects(
        () => assertControlledPilotSafety(null, { env: PRODUCTION_ENV }),
        (err) => err && err.code === "PRODUCTION_REFUSED"
      );
    });
  });

  it("Matrix D: app production / process unset → production behavior", async () => {
    await withProcessEnv({}, async () => {
      assertProductionBehavior(PRODUCTION_ENV);
      const seed = await seedChurchDemoOrganizationsForDeploymentIfAllowed(null, PRODUCTION_ENV);
      assert.equal(seed.skipped, true);
    });
  });

  it("directory SQL uses app env while process env conflicts", async () => {
    await withProcessEnv({ DEPLOYMENT_ENV: "testing" }, async () => {
      const captured = [];
      const pool = {
        query: async (sql) => {
          captured.push(String(sql));
          return { rows: [] };
        },
      };
      await searchPublicOrganizations(pool, { env: PRODUCTION_ENV });
      assert.equal(captured.length > 0, true);
      assert.doesNotMatch(captured[0], /'demo'/);
      captured.length = 0;
      await searchPublicOrganizations(pool, { env: TESTING_ENV });
      assert.match(captured[0], /'demo'/);
    });
  });

  it("two apps in one process keep independent env-mode gates", async () => {
    await withProcessEnv({ DEPLOYMENT_ENV: "testing" }, async () => {
      const appA = createV5FoundationApp({
        env: TESTING_ENV,
        allowPlatformRuntimeChild: true,
        getPool: () => null,
      });
      const appB = createV5FoundationApp({
        env: PRODUCTION_ENV,
        allowPlatformRuntimeChild: true,
        getPool: () => null,
      });
      const [resA, resB] = await Promise.all([
        request(appA).get("/directory").set("Host", "blessboard.pronline.org"),
        request(appB).get("/directory").set("Host", "blessboard.com"),
      ]);
      assert.equal(resA.status, 200);
      assert.equal(resB.status, 200);
      assertTestingBehavior(TESTING_ENV);
      assertProductionBehavior(PRODUCTION_ENV);
      const seedB = await seedChurchDemoOrganizationsForDeploymentIfAllowed(null, PRODUCTION_ENV);
      assert.equal(seedB.skipped, true);
    });
  });
});
