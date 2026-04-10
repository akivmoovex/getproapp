"use strict";

/**
 * Single shared bootstrap for server.js and CLI scripts.
 * - **Production (`NODE_ENV=production`):** does **not** load repo-root `.env` — Hostinger-injected `process.env` first.
 *   An **early** merge runs before any env snapshot: try `GETPRO_PRODUCTION_ENV_FILE_FALLBACK` first if set, else
 *   deterministic paths under `/home/u549637099/` — folder-scoped `pronline/.env.production` / `getpro/.env.production`
 *   from path hints, then legacy suffixed files, then generic `.env.production` (`override: false`).
 *   A later conditional merge from the **same resolved path** remains for filled-key diagnostics (idempotent).
 * - **Non-production:** loads `.env` from app root (path from this file, not `cwd`) unless `GETPRO_SKIP_DOTENV=1`.
 * - Snapshots DB-related env before any file merge for provenance logging.
 * - `dotenv` does not override existing process.env keys (`override: false`).
 *
 * LiteSpeed may set `require.main.filename` to `.../lsnode.js` — expected; app paths still resolve from this repo.
 */

const fs = require("fs");
const path = require("path");
const {
  snapshotEnvPresenceYesNo,
  logEnvTracePhase,
  logEnvPresenceDiagnosticLine,
  logEarlyProductionEnvFileResolution,
  logProductionEnvFileFallback,
  logWorkerIdentityLine,
  logEnvPresenceLostIfAny,
  buildWorkerLabel,
} = require("./workerEnvTrace");

/** Generic deterministic fallback (last resort in built-in list). */
const DEFAULT_PRODUCTION_ENV_FILE_FALLBACK = "/home/u549637099/.env.production";

const PRODUCTION_FALLBACK_HOME = "/home/u549637099";

/**
 * Ordered paths: explicit env first (if set), then domain-hinted folder files, legacy suffixed files, generic. Deduped.
 * Does not depend on Hostinger for the built-in list — only optional GETPRO_PRODUCTION_ENV_FILE_FALLBACK when injected.
 */
function buildProductionFallbackCandidates(appRoot, cwd, startupEntry) {
  const explicit = String(process.env.GETPRO_PRODUCTION_ENV_FILE_FALLBACK || "").trim();
  const hay = `${String(appRoot)}\n${String(cwd)}\n${String(startupEntry)}`.toLowerCase();
  const deterministic = [];
  if (hay.includes("pronline")) {
    deterministic.push(`${PRODUCTION_FALLBACK_HOME}/pronline/.env.production`);
    deterministic.push(`${PRODUCTION_FALLBACK_HOME}/.env.production.pronline`);
  }
  if (hay.includes("getproapp")) {
    deterministic.push(`${PRODUCTION_FALLBACK_HOME}/getpro/.env.production`);
    deterministic.push(`${PRODUCTION_FALLBACK_HOME}/.env.production.getpro`);
  }
  deterministic.push(`${PRODUCTION_FALLBACK_HOME}/.env.production`);
  const ordered = [];
  if (explicit) ordered.push(explicit);
  for (const p of deterministic) {
    if (!ordered.includes(p)) ordered.push(p);
  }
  return ordered;
}

/**
 * Per-path exists summary + load first existing file successfully (override:false). On parse error, try next path.
 * @returns {{ candidatesOrdered: string[], candidatesExistsSummary: string, selectedPath: string|null, loaded: boolean, parsedKeys: string[], loadError: string|null }}
 */
function tryLoadFirstExistingProductionFallback(orderedPaths) {
  const existsParts = orderedPaths.map((p) => `${p}=${fs.existsSync(p) ? "yes" : "no"}`);
  let selectedPath = null;
  let loaded = false;
  /** @type {string[]} */
  let parsedKeys = [];
  let loadError = null;
  for (const p of orderedPaths) {
    if (!fs.existsSync(p)) continue;
    const r = require("dotenv").config({
      path: p,
      override: false,
      quiet: true,
    });
    if (r.error) {
      loadError = String(r.error.message || r.error);
      continue;
    }
    selectedPath = p;
    loaded = true;
    parsedKeys = Object.keys(r.parsed || {});
    loadError = null;
    break;
  }
  return {
    candidatesOrdered: orderedPaths,
    candidatesExistsSummary: existsParts.join(";"),
    selectedPath,
    loaded,
    parsedKeys,
    loadError,
  };
}

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

/** True if Hostinger (or prior env) already has all vars the production file is allowed to rescue. */
function hostHasAllProductionRescueVars() {
  const hasDb = envStringIsSet(process.env.DATABASE_URL) || envStringIsSet(process.env.GETPRO_DATABASE_URL);
  return hasDb && envStringIsSet(process.env.SESSION_SECRET) && envStringIsSet(process.env.BASE_DOMAIN);
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
 * @param {string[]} parsedDotenvKeys — keys dotenv read from repo `.env` (non-production)
 * @param {string} effectiveVarName — from pool.getDatabaseUrlEnvName()
 * @param {{ productionFileKeys?: string[] }} [opts]
 * @returns {{ kind: string, logLine: string }}
 */
function computeDbUrlProvenance(before, parsedDotenvKeys, effectiveVarName, opts) {
  const parsed = new Set(parsedDotenvKeys);
  const parsedProd = new Set((opts && opts.productionFileKeys) || []);
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
      logLine: `dbUrlSource=host-injected var=${key} (present before file merge; existing env is never overwritten)`,
    };
  }
  if (parsed.has(key)) {
    return {
      kind: "dotenv",
      logLine: `dbUrlSource=dotenv-file var=${key} (repo .env; non-production)`,
    };
  }
  if (parsedProd.has(key)) {
    return {
      kind: "production-file",
      logLine: `dbUrlSource=production-env-file var=${key} (Hostinger .env.production path; override=false; missing keys only)`,
    };
  }
  return {
    kind: "unknown",
    logLine: `dbUrlSource=unknown var=${key} (not in host snapshot or known file key lists; check inherited env)`,
  };
}

function runBootstrap() {
  if (_bootstrapSingleton) return _bootstrapSingleton;

  const startupEntry = getStartupEntryLabel();
  /** Host-only DB presence before any production file merge (provenance). */
  const beforeDb = snapshotDbEnvPresence();
  const appRoot = getAppRootFromBootstrap();

  let earlyProductionEnvPath = null;
  let earlyProductionEnvExists = false;
  let earlyProductionEnvLoaded = false;
  /** @type {string[]} */
  let earlyProductionFileParsedKeys = [];
  /** @type {string[]} */
  let productionFallbackCandidatesOrdered = [];
  let productionFallbackCandidatesExistsSummary = "";
  let earlyProductionLoadError = null;

  if (process.env.NODE_ENV === "production") {
    const ordered = buildProductionFallbackCandidates(appRoot, process.cwd(), startupEntry);
    const res = tryLoadFirstExistingProductionFallback(ordered);
    productionFallbackCandidatesOrdered = res.candidatesOrdered;
    productionFallbackCandidatesExistsSummary = res.candidatesExistsSummary;
    earlyProductionEnvPath = res.selectedPath;
    earlyProductionEnvExists = res.selectedPath != null && fs.existsSync(res.selectedPath);
    earlyProductionEnvLoaded = res.loaded;
    earlyProductionFileParsedKeys = res.parsedKeys;
    earlyProductionLoadError = res.loadError;
    logEarlyProductionEnvFileResolution({
      startupEntry,
      candidatesOrdered: res.candidatesOrdered,
      candidatesExistsSummary: res.candidatesExistsSummary,
      selectedPath: res.selectedPath,
      loaded: res.loaded,
    });
    if (earlyProductionLoadError != null && !res.loaded) {
      // eslint-disable-next-line no-console
      console.warn(
        `[getpro] earlyProductionEnvFile: no file loaded successfully (last parse error truncated, no values): ${String(
          earlyProductionLoadError
        ).slice(0, 200)}`
      );
    }
  }

  const envPresenceEarliest = snapshotEnvPresenceYesNo();
  logEnvTracePhase("earliest", { startupEntry });
  logEnvPresenceDiagnosticLine({ startupEntry });

  const envPath = getEnvFilePath();
  const serverJsPath = getServerJsPath();
  const bootstrapModulePath = __filename;
  const liteSpeedLsnode = isLiteSpeedLsnodeEntry(startupEntry);

  const isProduction = process.env.NODE_ENV === "production";
  const skipDotenvExplicit =
    process.env.GETPRO_SKIP_DOTENV === "1" || String(process.env.GETPRO_SKIP_DOTENV || "").toLowerCase() === "true";
  /** In production, never merge repo-root `.env` — use Hostinger env + optional production file path. */
  const skipDotenv = isProduction || skipDotenvExplicit;
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

  /** @type {string|null} */
  let productionEnvFilePath = null;
  let productionFileExists = false;
  let productionFileLoaded = false;
  /** @type {string[]} */
  let productionFileParsedKeys = [];
  /** @type {string[]} */
  let productionFileFilledKeys = [];
  /** @type {string|null} */
  let productionFileError = null;
  /** merge skipped: host already had DB URL + SESSION_SECRET + BASE_DOMAIN (optional DBURL_TEST only fills when merge runs). */
  let productionFileMergeSkipped = false;

  if (isProduction) {
    productionEnvFilePath = earlyProductionEnvPath;
    productionFileExists = productionEnvFilePath != null && fs.existsSync(productionEnvFilePath);
    const snapBeforeProdFile = snapshotEnvPresenceYesNo();
    const needsRescueFromFile = !hostHasAllProductionRescueVars();
    if (productionFileExists && needsRescueFromFile) {
      const dotenvProd = require("dotenv").config({
        path: productionEnvFilePath,
        override: false,
        quiet: true,
      });
      productionFileParsedKeys = Object.keys(dotenvProd.parsed || {});
      productionFileError = dotenvProd.error ? String(dotenvProd.error.message || dotenvProd.error) : null;
      productionFileLoaded = !dotenvProd.error;
      const snapAfter = snapshotEnvPresenceYesNo();
      const rescueKeys = ["DATABASE_URL", "GETPRO_DATABASE_URL", "SESSION_SECRET", "BASE_DOMAIN", "DBURL_TEST"];
      productionFileFilledKeys = rescueKeys.filter((k) => snapBeforeProdFile[k] === "no" && snapAfter[k] === "yes");
    } else if (productionFileExists && !needsRescueFromFile) {
      productionFileMergeSkipped = true;
    }
    const fin = snapshotEnvPresenceYesNo();
    logProductionEnvFileFallback({
      startupEntry,
      path: productionEnvFilePath,
      exists: productionFileExists,
      loaded: productionFileLoaded,
      mergeSkipped: productionFileMergeSkipped,
      filledKeys: productionFileFilledKeys,
      error: productionFileError,
      presence: {
        DATABASE_URL: fin.DATABASE_URL,
        GETPRO_DATABASE_URL: fin.GETPRO_DATABASE_URL,
        SESSION_SECRET: fin.SESSION_SECRET,
        BASE_DOMAIN: fin.BASE_DOMAIN,
      },
    });
  }

  logEnvTracePhase("after_dotenv_merge", { startupEntry });

  const envFileExists = fs.existsSync(envPath);

  // Pool reads merged process.env; load after dotenv (read-only — does not mutate process.env).
  const { getDatabaseUrlEnvName } = require("../db/pg/pool");
  const effectiveVarName = getDatabaseUrlEnvName();
  const productionFileKeysCombined = [...new Set([...earlyProductionFileParsedKeys, ...productionFileParsedKeys])];
  const dbProvenance = computeDbUrlProvenance(beforeDb, parsedDotenvKeys, effectiveVarName, {
    productionFileKeys: productionFileKeysCombined,
  });

  const envPresenceFinal = snapshotEnvPresenceYesNo();
  logEnvTracePhase("bootstrap_complete", { startupEntry });
  logEnvPresenceLostIfAny(envPresenceEarliest, envPresenceFinal);
  logWorkerIdentityLine({
    startupEntry,
    skipDotenv,
    dotenvSkippedForProduction: isProduction,
  });

  _bootstrapSingleton = {
    appRoot,
    envPath,
    serverJsPath,
    bootstrapModulePath,
    startupEntry,
    liteSpeedLsnode,
    beforeDb,
    skipDotenv,
    dotenvSkippedForProduction: isProduction,
    dotenvKeyCount,
    dotenvErrorMessage,
    parsedDotenvKeys,
    envFileExists,
    effectiveVarName,
    dbProvenance,
    workerLabel: buildWorkerLabel(startupEntry),
    envPresenceEarliest,
    envPresenceFinal,
    productionEnvFilePath,
    productionFileExists,
    productionFileLoaded,
    productionFileParsedKeys,
    productionFileFilledKeys,
    productionFileError,
    productionFileMergeSkipped,
    earlyProductionEnvPath,
    earlyProductionEnvExists,
    earlyProductionEnvLoaded,
    earlyProductionFileParsedKeys,
    productionFallbackCandidatesOrdered,
    productionFallbackCandidatesExistsSummary,
    earlyProductionLoadError,
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
  const dotenvWhy = boot.dotenvSkippedForProduction
    ? "skipped repo .env (NODE_ENV=production)"
    : boot.skipDotenv
      ? "skipped (GETPRO_SKIP_DOTENV)"
      : `merged (${boot.dotenvKeyCount} keys from .env)`;
  const prodFileWhy =
    boot.productionEnvFilePath != null
      ? ` | productionEnvFile path=${boot.productionEnvFilePath} exists=${boot.productionFileExists ? "yes" : "no"} loaded=${boot.productionFileLoaded ? "yes" : "no"} mergeSkipped=${boot.productionFileMergeSkipped ? "yes" : "no"} filled=${boot.productionFileFilledKeys && boot.productionFileFilledKeys.length ? boot.productionFileFilledKeys.join(",") : "none"}`
      : "";
  // eslint-disable-next-line no-console
  console.log(
    `[getpro] bootstrap: appRoot=${boot.appRoot} | serverJs=${boot.serverJsPath} | bootstrapModule=${boot.bootstrapModulePath} | startupEntry=${boot.startupEntry} | liteSpeedLsnode=${ls} | pid=${snap.pid} | cwd=${snap.cwd} | envFileExists=${boot.envFileExists ? "yes" : "no"} | dotenv=${dotenvWhy}${prodFileWhy} | ${boot.dbProvenance.logLine}`
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
  hostHasAllProductionRescueVars,
  getAppRootFromBootstrap,
  getEnvFilePath,
  getServerJsPath,
  getMainScriptPath,
  getStartupEntryLabel,
  isLiteSpeedLsnodeEntry,
  resetBootstrapForTests,
  DEFAULT_PRODUCTION_ENV_FILE_FALLBACK,
  buildProductionFallbackCandidates,
  tryLoadFirstExistingProductionFallback,
  PRODUCTION_FALLBACK_HOME,
};
