"use strict";

/**
 * Single shared bootstrap for server.js and CLI scripts.
 * - Snapshots DB-related env *before* optional dotenv merge (host-injected vs file).
 * - Loads `.env` from app root (path derived from this file, never `process.cwd()` alone).
 * - `dotenv` does not override existing process.env keys (default), so healthy LiteSpeed workers
 *   keep host DATABASE_URL; workers without host injection can pick up DATABASE_URL from `.env`.
 *
 * LiteSpeed often sets `require.main.filename` to `/usr/local/lsws/fcgi-bin/lsnode.js` — that is expected;
 * app root for `.env` is still resolved from this module location beside `server.js`.
 */

const fs = require("fs");
const path = require("path");

/** @type {object | null} */
let _bootstrapSingleton = null;

function envStringIsSet(value) {
  return value != null && String(value).trim() !== "";
}

function snapshotDbEnvPresence() {
  return {
    DATABASE_URL: envStringIsSet(process.env.DATABASE_URL),
    GETPRO_DATABASE_URL: envStringIsSet(process.env.GETPRO_DATABASE_URL),
  };
}

function getAppRootFromBootstrap() {
  return path.join(__dirname, "..", "..");
}

function getEnvFilePath() {
  return path.join(getAppRootFromBootstrap(), ".env");
}

function getServerJsPath() {
  return path.join(getAppRootFromBootstrap(), "server.js");
}

/** Absolute path of the main module (often LiteSpeed `lsnode.js`, not `server.js`). */
function getMainScriptPath() {
  if (require.main && require.main.filename) return String(require.main.filename);
  if (process.argv[1]) return path.resolve(process.cwd(), process.argv[1]);
  return "(unknown)";
}

function getStartupEntryLabel() {
  return getMainScriptPath();
}

function isLiteSpeedLsnodeEntry(entry) {
  return /[/\\]lsws[/\\]fcgi-bin[/\\]lsnode\.js$/i.test(String(entry || ""));
}

/**
 * Classify where the effective Postgres URL came from (never log the value).
 * @param {{ DATABASE_URL: boolean, GETPRO_DATABASE_URL: boolean }} before
 * @param {string[]} parsedDotenvKeys — keys dotenv read from the `.env` file
 * @param {string} effectiveVarName — from pool.getDatabaseUrlEnvName()
 * @returns {{ kind: string, logLine: string }}
 */
function computeDbUrlProvenance(before, parsedDotenvKeys, effectiveVarName) {
  const parsed = new Set(parsedDotenvKeys);
  if (effectiveVarName === "(none)") {
    return {
      kind: "none",
      logLine: "dbUrlSource=none (no DATABASE_URL or GETPRO_DATABASE_URL after bootstrap)",
    };
  }
  const key = effectiveVarName;
  const hostHad = key === "DATABASE_URL" ? before.DATABASE_URL : before.GETPRO_DATABASE_URL;
  if (hostHad) {
    return {
      kind: "host",
      logLine: `dbUrlSource=host-injected var=${key} (present before dotenv merge; dotenv does not override existing keys)`,
    };
  }
  if (parsed.has(key)) {
    return {
      kind: "dotenv",
      logLine: `dbUrlSource=dotenv-file var=${key} (.env beside app root; host did not inject this var in this worker)`,
    };
  }
  return {
    kind: "unknown",
    logLine: `dbUrlSource=unknown var=${key} (not in pre-dotenv snapshot or .env key list; check inherited env)`,
  };
}

function runBootstrap() {
  if (_bootstrapSingleton) return _bootstrapSingleton;

  const appRoot = getAppRootFromBootstrap();
  const envPath = getEnvFilePath();
  const serverJsPath = getServerJsPath();
  const bootstrapModulePath = __filename;
  const startupEntry = getStartupEntryLabel();
  const liteSpeedLsnode = isLiteSpeedLsnodeEntry(startupEntry);

  const beforeDb = snapshotDbEnvPresence();
  const skipDotenv =
    process.env.GETPRO_SKIP_DOTENV === "1" || String(process.env.GETPRO_SKIP_DOTENV || "").toLowerCase() === "true";
  let dotenvKeyCount = 0;
  let dotenvErrorMessage = null;
  /** @type {string[]} */
  let parsedDotenvKeys = [];

  if (!skipDotenv) {
    const dotenvResult = require("dotenv").config({ path: envPath, quiet: true });
    dotenvKeyCount = Object.keys(dotenvResult.parsed || {}).length;
    parsedDotenvKeys = Object.keys(dotenvResult.parsed || {});
    dotenvErrorMessage = dotenvResult.error ? String(dotenvResult.error.message || dotenvResult.error) : null;
  }

  const envFileExists = fs.existsSync(envPath);

  // Pool reads merged process.env; load after dotenv.
  const { getDatabaseUrlEnvName } = require("../db/pg/pool");
  const effectiveVarName = getDatabaseUrlEnvName();
  const dbProvenance = computeDbUrlProvenance(beforeDb, parsedDotenvKeys, effectiveVarName);

  _bootstrapSingleton = {
    appRoot,
    envPath,
    serverJsPath,
    bootstrapModulePath,
    startupEntry,
    liteSpeedLsnode,
    beforeDb,
    skipDotenv,
    dotenvKeyCount,
    dotenvErrorMessage,
    parsedDotenvKeys,
    envFileExists,
    effectiveVarName,
    dbProvenance,
  };
  return _bootstrapSingleton;
}

/** @param {ReturnType<typeof runBootstrap>} boot */
function logBootstrapMarker(boot) {
  const snap = {
    pid: process.pid,
    cwd: process.cwd(),
  };
  const ls = boot.liteSpeedLsnode ? "yes (HTTP app still loaded from project; see serverJs path)" : "no";
  // eslint-disable-next-line no-console
  console.log(
    `[getpro] bootstrap: appRoot=${boot.appRoot} | serverJs=${boot.serverJsPath} | bootstrapModule=${boot.bootstrapModulePath} | startupEntry=${boot.startupEntry} | liteSpeedLsnode=${ls} | pid=${snap.pid} | cwd=${snap.cwd} | envFileExists=${boot.envFileExists ? "yes" : "no"} | dotenvSkipped=${boot.skipDotenv ? "yes" : "no"} | dotenvKeysLoaded=${boot.dotenvKeyCount} | ${boot.dbProvenance.logLine}`
  );
}

/** Test-only: allow multiple runBootstrap() in one process. */
function resetBootstrapForTests() {
  _bootstrapSingleton = null;
}

module.exports = {
  runBootstrap,
  logBootstrapMarker,
  computeDbUrlProvenance,
  snapshotDbEnvPresence,
  getAppRootFromBootstrap,
  getEnvFilePath,
  getServerJsPath,
  getMainScriptPath,
  getStartupEntryLabel,
  isLiteSpeedLsnodeEntry,
  resetBootstrapForTests,
};
