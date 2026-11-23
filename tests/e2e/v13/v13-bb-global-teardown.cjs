"use strict";

/**
 * V13 BlessBoard Playwright teardown. Cleanup cannot open PostgreSQL until
 * the same browser and disposable-database guard has passed.
 */

const { assertV13BrowserHarness } = require("../../v13/helpers/v13BrowserIsolation");

async function v13BbGlobalTeardown(options) {
  const injected = options && typeof options.loadGlobalTeardown === "function" && options.env;
  const env = injected ? options.env : process.env;
  const load = injected ? options.loadGlobalTeardown : () => require("../global-teardown.cjs");
  assertV13BrowserHarness(env, { fallbackPort: "4186" });
  if (String(env.GETPRO_V13_SKIP_LEGACY_CHURCH_SCHEMA || "") === "1") return;
  return load();
}

module.exports = v13BbGlobalTeardown;
