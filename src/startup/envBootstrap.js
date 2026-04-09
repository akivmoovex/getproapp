"use strict";

const path = require("path");

/**
 * Single shared .env load for every Node entrypoint (server, scripts).
 * Path is always the repository root `.env` next to `server.js`, not `process.cwd()`
 * (hosts often start workers with a different cwd).
 *
 * @returns {{ envPath: string, dotenvKeyCount: number, dotenvErrorMessage: string | null }}
 */
function loadAppDotenv() {
  const envPath = path.join(__dirname, "..", "..", ".env");
  const dotenvResult = require("dotenv").config({ path: envPath, quiet: true });
  return {
    envPath,
    dotenvKeyCount: Object.keys(dotenvResult.parsed || {}).length,
    dotenvErrorMessage: dotenvResult.error ? String(dotenvResult.error.message || dotenvResult.error) : null,
  };
}

/** Absolute path of the main module (the file `node` executed), when available. */
function getMainScriptPath() {
  if (require.main && require.main.filename) return String(require.main.filename);
  if (process.argv[1]) return path.resolve(process.cwd(), process.argv[1]);
  return "(unknown)";
}

/** Short label for logs: `node path/to/server.js` style. */
function getStartupEntryLabel() {
  const main = getMainScriptPath();
  return main;
}

module.exports = {
  loadAppDotenv,
  getMainScriptPath,
  getStartupEntryLabel,
};
