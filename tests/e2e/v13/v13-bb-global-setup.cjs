"use strict";

/**
 * V13 BlessBoard Playwright setup. The database guard runs before the shared
 * foundation setup is loaded, so no pool is constructed when authorization
 * is missing.
 */

const { assertV13BrowserHarness } = require("../../v13/helpers/v13BrowserIsolation");

async function v13BbGlobalSetup(options) {
  const injected = options && typeof options.loadGlobalSetup === "function" && options.env;
  const env = injected ? options.env : process.env;
  const load = injected ? options.loadGlobalSetup : () => require("../global-setup.cjs");
  const harness = assertV13BrowserHarness(env, { fallbackPort: "4186" });
  if (String(env.GETPRO_V13_SKIP_LEGACY_CHURCH_SCHEMA || "") === "1") {
    const connectionString = String(env.E2E_DATABASE_URL || env.DATABASE_URL || "");
    if (
      connectionString.includes("127.0.0.1:55432") &&
      connectionString.includes("getpro_v13_e2e_g78d2301") &&
      !connectionString.includes(":5432/")
    ) {
      const { ensureSyntheticChurchesPublished } = require("./v13-bb-public-fixture.cjs");
      await ensureSyntheticChurchesPublished(env);
    }
    return;
  }
  if (!injected) {
    process.env.NODE_ENV = "test";
    process.env.GETPRO_TEST_DB = "1";
    process.env.DEPLOYMENT_ENV = "testing";
    process.env.EXPECTED_DATABASE_ENV = "testing";
    process.env.DATABASE_IDENTITY_ENV = "testing";
    process.env.TEST_DATABASE_URL = harness.connectionString;
    process.env.DATABASE_URL = harness.connectionString;
    process.env.E2E_DATABASE_URL = harness.connectionString;
    delete process.env.GETPRO_DATABASE_URL;
  }
  return load();
}

module.exports = v13BbGlobalSetup;
