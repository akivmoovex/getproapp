"use strict";

/**
 * Safety checks for repo-root `.env` on local/non-production processes.
 *
 * Does not introduce a second environment system: it only decides whether the
 * existing dotenv merge of repo-root `.env` is safe. Production processes
 * (`NODE_ENV=production`) never merge that file (see bootstrap.js).
 *
 * Never logs secret values or connection strings.
 */

const fs = require("fs");
const path = require("path");

function envTrimLower(value) {
  return String(value == null ? "" : value).trim().toLowerCase();
}

function getRepoRootEnvPath() {
  return path.join(__dirname, "..", "..", ".env");
}

/**
 * Identity markers that mean "this file is production runtime configuration".
 * Names only — never values beyond the known identity enums/codes.
 * @param {Record<string, string>} parsed
 * @returns {string[]}
 */
function productionIdentityReasons(parsed) {
  const file = parsed && typeof parsed === "object" ? parsed : {};
  const reasons = [];
  if (envTrimLower(file.NODE_ENV) === "production") reasons.push("NODE_ENV=production");
  if (envTrimLower(file.DEPLOYMENT_ENV) === "production") reasons.push("DEPLOYMENT_ENV=production");
  if (envTrimLower(file.DATABASE_IDENTITY_ENV) === "production") reasons.push("DATABASE_IDENTITY_ENV=production");
  const code = envTrimLower(file.PLATFORM_DEPLOYMENT_CODE);
  if (code.includes("production")) reasons.push("PLATFORM_DEPLOYMENT_CODE production identity");
  return reasons;
}

function refuseMergeMessage(reasons) {
  const listed = Array.isArray(reasons) && reasons.length ? reasons.join(", ") : "production identity";
  return (
    "[getpro] FATAL: repo-root .env declares production identity (" +
    listed +
    "). Local/non-production commands will not load it. " +
    "Production runtime uses Hostinger-injected environment (set NODE_ENV=production before start). " +
    "Named local files: scripts/local/run-with-blessboard-env.sh testing|production|rehearsal."
  );
}

/**
 * Decide whether a process may merge repo-root `.env`.
 * @param {{ processEnv?: NodeJS.ProcessEnv, parsedFile?: Record<string, string>|null }} opts
 * @returns {{ ok: boolean, action: string, code: string, reasons?: string[], message?: string }}
 */
function assessRepoDotenvMerge(opts) {
  const processEnv = (opts && opts.processEnv) || {};
  const parsedFile = (opts && opts.parsedFile) || {};
  const processNodeEnv = envTrimLower(processEnv.NODE_ENV);

  if (processNodeEnv === "production") {
    return {
      ok: true,
      action: "skip_repo_dotenv_production_process",
      code: "production_process",
    };
  }

  const skipExplicit =
    String(processEnv.GETPRO_SKIP_DOTENV || "").trim() === "1" ||
    String(processEnv.GETPRO_SKIP_DOTENV || "").trim().toLowerCase() === "true";
  if (skipExplicit) {
    return {
      ok: true,
      action: "skip_explicit",
      code: "GETPRO_SKIP_DOTENV",
    };
  }

  if (!parsedFile || Object.keys(parsedFile).length === 0) {
    return { ok: true, action: "merge", code: "empty_or_missing" };
  }

  const reasons = productionIdentityReasons(parsedFile);
  if (reasons.length > 0) {
    return {
      ok: false,
      action: "refuse_merge",
      code: "repo_dotenv_production_identity",
      reasons,
      message: refuseMergeMessage(reasons),
    };
  }

  return { ok: true, action: "merge", code: "safe_local" };
}

/**
 * Parse a dotenv file without applying it to process.env.
 * @param {string} envPath
 * @returns {Record<string, string>|null}
 */
function peekDotenvFile(envPath) {
  if (!envPath || !fs.existsSync(envPath)) return null;
  const raw = fs.readFileSync(envPath, "utf8");
  return require("dotenv").parse(raw);
}

/**
 * Merge repo-root `.env` only when it is not production-shaped.
 * @param {string} [envPath]
 * @param {NodeJS.ProcessEnv} [processEnv]
 * @returns {{ loaded: boolean, skipped: boolean, parsedKeys: string[], dotenvErrorMessage: string|null, assessment: object }}
 */
function loadRepoDotenvIfSafe(envPath, processEnv) {
  const env = processEnv || process.env;
  const pathToUse = envPath || getRepoRootEnvPath();
  const parsedFile = peekDotenvFile(pathToUse);
  const assessment = assessRepoDotenvMerge({ processEnv: env, parsedFile: parsedFile || {} });

  if (assessment.action !== "merge") {
    return {
      loaded: false,
      skipped: true,
      parsedKeys: [],
      dotenvErrorMessage: null,
      assessment,
    };
  }

  if (!parsedFile) {
    return {
      loaded: false,
      skipped: false,
      parsedKeys: [],
      dotenvErrorMessage: fs.existsSync(pathToUse) ? null : `ENOENT: no such file ${pathToUse}`,
      assessment,
    };
  }

  const dotenvResult = require("dotenv").config({ path: pathToUse, quiet: true });
  return {
    loaded: !dotenvResult.error,
    skipped: false,
    parsedKeys: Object.keys(dotenvResult.parsed || {}),
    dotenvErrorMessage: dotenvResult.error ? String(dotenvResult.error.message || dotenvResult.error) : null,
    assessment,
  };
}

/**
 * CLI scripts that historically called `dotenv.config()` with no path.
 * Production processes skip repo `.env`. Production-shaped leftover `.env` exits.
 */
function loadRepoDotenvForCliOrExit(envPath) {
  const env = process.env;
  if (envTrimLower(env.NODE_ENV) === "production") {
    return {
      loaded: false,
      skipped: true,
      parsedKeys: [],
      dotenvErrorMessage: null,
      assessment: {
        ok: true,
        action: "skip_repo_dotenv_production_process",
        code: "production_process",
      },
    };
  }
  const result = loadRepoDotenvIfSafe(envPath || getRepoRootEnvPath(), env);
  if (result.assessment && result.assessment.action === "refuse_merge") {
    // eslint-disable-next-line no-console
    console.error(result.assessment.message);
    process.exit(1);
  }
  return result;
}

/**
 * True when bootstrap refused leftover production `.env` and no DB URL is already in the process.
 * Used by the HTTP server so `npm start` / `npm run dev` fail closed with a specific message.
 */
function shouldFailClosedHttpStart(boot, processEnv) {
  const env = processEnv || process.env;
  const safety = boot && boot.repoDotenvSafety;
  if (!safety || safety.action !== "refuse_merge") return false;
  const hasDb =
    (env.DATABASE_URL != null && String(env.DATABASE_URL).trim() !== "") ||
    (env.GETPRO_DATABASE_URL != null && String(env.GETPRO_DATABASE_URL).trim() !== "");
  return !hasDb;
}

module.exports = {
  envTrimLower,
  getRepoRootEnvPath,
  productionIdentityReasons,
  assessRepoDotenvMerge,
  peekDotenvFile,
  loadRepoDotenvIfSafe,
  loadRepoDotenvForCliOrExit,
  shouldFailClosedHttpStart,
};
