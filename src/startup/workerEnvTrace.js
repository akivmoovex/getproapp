"use strict";

/**
 * High-signal worker identity and env presence tracing (no secrets).
 * Used to compare env at earliest bootstrap vs after merge — application code does not mutate DATABASE_*.
 *
 * Temporary diagnostic: **DBURL_TEST** — set a dummy name/value in Hostinger (e.g. `yes`) to see if only
 * `DATABASE_URL` is mishandled vs general worker env propagation. Never a secret; presence only.
 *
 * Note: DBURL_TEST is often present via `/home/.../pronline/.env.production` early fill
 * (override:false) even when absent from the Hostinger hPanel variable list.
 */

const os = require("os");

function envKeyPresent(key, env) {
  const source = env || process.env;
  return source[key] != null && String(source[key]).trim() !== "";
}

const TRACKED_PRESENCE_KEYS = Object.freeze([
  "DATABASE_URL",
  "GETPRO_DATABASE_URL",
  "DBURL_TEST",
  "SESSION_SECRET",
  "BASE_DOMAIN",
  "PLATFORM_DEPLOYMENT_CODE",
  "DEPLOYMENT_ENV",
  "DATABASE_IDENTITY_EXPECTED",
  "DATABASE_IDENTITY_ENV",
  "GETPRO_PG_SSL",
  "NODE_ENV",
]);

/**
 * @param {NodeJS.ProcessEnv} [env]
 * @returns {Record<string, string>}
 */
function snapshotEnvPresenceYesNo(env) {
  /** @type {Record<string, string>} */
  const out = {};
  for (const key of TRACKED_PRESENCE_KEYS) {
    out[key] = envKeyPresent(key, env) ? "yes" : "no";
  }
  return out;
}

/**
 * Non-secret config values suitable for logs (never DATABASE_URL / SESSION_SECRET values).
 * @param {NodeJS.ProcessEnv} [env]
 */
function snapshotSafeConfigValues(env) {
  const source = env || process.env;
  function val(name) {
    const v = source[name];
    if (v == null || String(v).trim() === "") return "(unset)";
    return String(v).trim();
  }
  return {
    NODE_ENV: val("NODE_ENV"),
    DEPLOYMENT_ENV: val("DEPLOYMENT_ENV"),
    PLATFORM_DEPLOYMENT_CODE: val("PLATFORM_DEPLOYMENT_CODE"),
    DATABASE_IDENTITY_EXPECTED: val("DATABASE_IDENTITY_EXPECTED"),
    DATABASE_IDENTITY_ENV: val("DATABASE_IDENTITY_ENV"),
    BASE_DOMAIN: val("BASE_DOMAIN"),
    GETPRO_PG_SSL: val("GETPRO_PG_SSL"),
    DBURL_TEST: envKeyPresent("DBURL_TEST", source) ? "present" : "absent",
    DATABASE_URL: envKeyPresent("DATABASE_URL", source) ? "present" : "absent",
    GETPRO_DATABASE_URL: envKeyPresent("GETPRO_DATABASE_URL", source) ? "present" : "absent",
    SESSION_SECRET: envKeyPresent("SESSION_SECRET", source) ? "present" : "absent",
  };
}

/**
 * Format presence map as `KEY=yes|no` pairs for greppable logs.
 * @param {Record<string, string>} presence
 * @param {string[]} [keys]
 */
function formatPresencePairs(presence, keys) {
  const list = keys || TRACKED_PRESENCE_KEYS;
  return list.map((k) => `${k}=${presence[k] || "no"}`).join(" ");
}

/**
 * @param {'pre_file'|'after_early_production_file'|'after_dotenv_merge'|'bootstrap_complete'|string} phase
 * @param {{ startupEntry: string, presence?: Record<string, string> }} opts
 */
function logEnvTracePhase(phase, opts) {
  const entry = opts.startupEntry != null ? String(opts.startupEntry) : "(unknown)";
  const s = opts.presence || snapshotEnvPresenceYesNo();
  const safe = snapshotSafeConfigValues();
  const ppid = typeof process.ppid === "number" ? process.ppid : "n/a";
  // eslint-disable-next-line no-console
  console.log(
    `[getpro] envTrace phase=${phase} pid=${process.pid} ppid=${ppid} startupEntry=${entry} cwd=${process.cwd()} ` +
      `osHostname=${os.hostname()} ${formatPresencePairs(s)} ` +
      `safeValues NODE_ENV=${safe.NODE_ENV} DEPLOYMENT_ENV=${safe.DEPLOYMENT_ENV} ` +
      `PLATFORM_DEPLOYMENT_CODE=${safe.PLATFORM_DEPLOYMENT_CODE} ` +
      `DATABASE_IDENTITY_EXPECTED=${safe.DATABASE_IDENTITY_EXPECTED} ` +
      `DATABASE_IDENTITY_ENV=${safe.DATABASE_IDENTITY_ENV} BASE_DOMAIN=${safe.BASE_DOMAIN} ` +
      `GETPRO_PG_SSL=${safe.GETPRO_PG_SSL}`
  );
}

/**
 * Temporary Hostinger diagnostic: single greppable line at earliest bootstrap (presence only).
 * @param {{ startupEntry: string, presence?: Record<string, string> }} opts
 */
function logEnvPresenceDiagnosticLine(opts) {
  const entry = opts.startupEntry != null ? String(opts.startupEntry) : "(unknown)";
  const label = buildWorkerLabel(entry);
  const s = opts.presence || snapshotEnvPresenceYesNo();
  const hasDb = s.DATABASE_URL === "yes" || s.GETPRO_DATABASE_URL === "yes";
  const classification = hasDb ? "HEALTHY_WORKER" : "MISCONFIGURED_WORKER";
  // eslint-disable-next-line no-console
  console.log(
    `[getpro] envPresence workerLabel=${label} pid=${process.pid} classification=${classification} ` +
      formatPresencePairs(s)
  );
}

function buildWorkerLabel(startupEntry) {
  const pid = process.pid;
  if (/[/\\]lsws[/\\]fcgi-bin[/\\]lsnode\.js$/i.test(String(startupEntry || ""))) {
    return `lsnode:${pid}`;
  }
  return `${os.hostname()}:${pid}`;
}

/**
 * One line after bootstrap; classification is DB-URL focused (PostgreSQL gate).
 * @param {{ startupEntry: string, skipDotenv: boolean, dotenvSkippedForProduction: boolean }} opts
 */
function logWorkerIdentityLine(opts) {
  const entry = opts.startupEntry != null ? String(opts.startupEntry) : "(unknown)";
  const s = snapshotEnvPresenceYesNo();
  const hasDb = s.DATABASE_URL === "yes" || s.GETPRO_DATABASE_URL === "yes";
  const classification = hasDb ? "HEALTHY_WORKER" : "MISCONFIGURED_WORKER";
  const workerNeedsHostingerEnv = hasDb ? "no" : "yes";
  const workerMissingRequiredEnv = hasDb ? "none" : "DATABASE_URL";
  const label = buildWorkerLabel(entry);
  const skipInEnv = process.env.GETPRO_SKIP_DOTENV != null && String(process.env.GETPRO_SKIP_DOTENV).trim() !== "";
  // eslint-disable-next-line no-console
  console.log(
    `[getpro] worker: label=${label} classification=${classification} workerNeedsHostingerEnv=${workerNeedsHostingerEnv} workerMissingRequiredEnv=${workerMissingRequiredEnv} GETPRO_SKIP_DOTENV=${skipInEnv ? "set" : "unset"} dotenvSkippedByPolicy=${opts.skipDotenv ? "yes" : "no"} productionSkipsDotenvFile=${opts.dotenvSkippedForProduction ? "yes" : "no"}`
  );
}

/**
 * If any tracked var went from present → absent (yes→no), warn — app code should never remove env keys.
 * @param {Record<string, string>} earliest
 * @param {Record<string, string>} final
 */
function logEnvPresenceLostIfAny(earliest, final) {
  const lost = TRACKED_PRESENCE_KEYS.filter((k) => earliest[k] === "yes" && final[k] === "no");
  if (lost.length === 0) return;
  // eslint-disable-next-line no-console
  console.warn(
    `[getpro] envTrace: unexpected loss of env keys between pre_file and bootstrap_complete: ${lost.join(
      ", "
    )} (should not happen — investigate process env mutation)`
  );
}

/**
 * Secondary production-file pass diagnostics. `loaded=yes` only when this pass itself called dotenv.
 * Early pass uses earlyProductionEnvFile — do not confuse the two.
 * @param {{
 *   startupEntry: string,
 *   path: string,
 *   exists: boolean,
 *   loaded: boolean,
 *   mergeSkipped?: boolean,
 *   earlyAlreadyLoaded?: boolean,
 *   filledKeys: string[],
 *   error: string|null,
 *   presence: Record<string, string>,
 * }} opts
 */
function logProductionEnvFileFallback(opts) {
  const label = buildWorkerLabel(opts.startupEntry);
  const pathLabel = opts.path != null && String(opts.path).trim() !== "" ? String(opts.path) : "(none)";
  const filled = opts.filledKeys && opts.filledKeys.length ? opts.filledKeys.join(",") : "none";
  const err = opts.error != null && String(opts.error).trim() !== "" ? String(opts.error).trim().slice(0, 200) : null;
  const mergeSkipped = opts.mergeSkipped === true ? "yes" : "no";
  const earlyAlready = opts.earlyAlreadyLoaded === true ? "yes" : "no";
  const p = opts.presence || {};
  // eslint-disable-next-line no-console
  console.log(
    `[getpro] productionEnvFile phase=secondary_rescue path=${pathLabel} exists=${opts.exists ? "yes" : "no"} ` +
      `loaded=${opts.loaded ? "yes" : "no"} mergeSkipped=${mergeSkipped} earlyAlreadyLoaded=${earlyAlready} ` +
      `filledKeys=${filled} workerLabel=${label} pid=${process.pid} ` +
      `DATABASE_URL=${p.DATABASE_URL || "no"} GETPRO_DATABASE_URL=${p.GETPRO_DATABASE_URL || "no"} ` +
      `SESSION_SECRET=${p.SESSION_SECRET || "no"} BASE_DOMAIN=${p.BASE_DOMAIN || "no"} ` +
      `DBURL_TEST=${p.DBURL_TEST || "no"} PLATFORM_DEPLOYMENT_CODE=${p.PLATFORM_DEPLOYMENT_CODE || "no"} ` +
      `DEPLOYMENT_ENV=${p.DEPLOYMENT_ENV || "no"}`
  );
  if (opts.mergeSkipped === true && opts.earlyAlreadyLoaded === true) {
    // eslint-disable-next-line no-console
    console.log(
      "[getpro] productionEnvFile note: secondary mergeSkipped because rescue vars already present " +
        "(DB URL + SESSION_SECRET + BASE_DOMAIN). Early file load may already have run; " +
        "loaded=no here means this secondary pass did not call dotenv again (not that the file failed)."
    );
  }
  if (err) {
    // eslint-disable-next-line no-console
    console.warn(`[getpro] productionEnvFile: read/parse issue (message truncated, no values): ${err}`);
  }
}

/**
 * Early production fallback: ordered candidates, per-path exists, selected path, load result (no values).
 * @param {{
 *   startupEntry: string,
 *   candidatesOrdered: string[],
 *   candidatesExistsSummary: string,
 *   selectedPath: string|null,
 *   loaded: boolean,
 *   filledKeys?: string[],
 * }} opts
 */
function logEarlyProductionEnvFileResolution(opts) {
  const label = buildWorkerLabel(opts.startupEntry);
  const cand = opts.candidatesOrdered.length ? opts.candidatesOrdered.join("|") : "(none)";
  const selected = opts.selectedPath != null ? opts.selectedPath : "(none)";
  const filled = opts.filledKeys && opts.filledKeys.length ? opts.filledKeys.join(",") : "none";
  // eslint-disable-next-line no-console
  console.log(
    `[getpro] earlyProductionEnvFile phase=early_fill candidates=${cand} candidatesExists=${opts.candidatesExistsSummary} ` +
      `selected=${selected} loaded=${opts.loaded ? "yes" : "no"} filledMissingKeys=${filled} ` +
      `override=false workerLabel=${label} pid=${process.pid}`
  );
}

module.exports = {
  TRACKED_PRESENCE_KEYS,
  snapshotEnvPresenceYesNo,
  snapshotSafeConfigValues,
  formatPresencePairs,
  logEnvTracePhase,
  logEnvPresenceDiagnosticLine,
  logEarlyProductionEnvFileResolution,
  logProductionEnvFileFallback,
  buildWorkerLabel,
  logWorkerIdentityLine,
  logEnvPresenceLostIfAny,
};
