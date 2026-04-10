"use strict";

/**
 * @deprecated Prefer `require("./bootstrap").runBootstrap()` — kept for scripts that only need dotenv metadata.
 */
const bootstrap = require("./bootstrap");

function loadAppDotenv() {
  const b = bootstrap.runBootstrap();
  return {
    envPath: b.envPath,
    dotenvKeyCount: b.dotenvKeyCount,
    dotenvErrorMessage: b.dotenvErrorMessage,
  };
}

module.exports = {
  loadAppDotenv,
  getStartupEntryLabel: bootstrap.getStartupEntryLabel,
  getMainScriptPath: bootstrap.getMainScriptPath,
};
