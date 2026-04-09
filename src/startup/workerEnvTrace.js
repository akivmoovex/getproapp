"use strict";

/**
 * High-signal worker identity and env presence tracing (no secrets).
 * Used to compare env at earliest bootstrap vs after merge — application code does not mutate DATABASE_*.
 *
 * Temporary diagnostic: **DBURL_TEST** — set a dummy name/value in Hostinger (e.g. `yes`) to see if only
 * `DATABASE_URL` is mishandled vs general worker env propagation. Never a secret; presence only.
 */

const os = require("os");

function envKeyPresent(key) {
  return process.env[key] != null && String(process.env[key]).trim() !== "";
}

/**
 * @returns {{ DATABASE_URL: string, GETPRO_DATABASE_URL: string, DBURL_TEST: string, SESSION_SECRET: string, BASE_DOMAIN: string }}
 */
function snapshotEnvPresenceYesNo() {
  return {
    DATABASE_URL: envKeyPresent("DATABASE_URL") ? "yes" : "no",
    GETPRO_DATABASE_URL: envKeyPresent("GETPRO_DATABASE_URL") ? "yes" : "no",
    DBURL_TEST: envKeyPresent("DBURL_TEST") ? "yes" : "no",
    SESSION_SECRET: envKeyPresent("SESSION_SECRET") ? "yes" : "no",
    BASE_DOMAIN: envKeyPresent("BASE_DOMAIN") ? "yes" : "no",
  };
}

/**
 * @param {'earliest'|'after_dotenv_merge'|'bootstrap_complete'} phase
 * @param {{ startupEntry: string }} opts
 */
function logEnvTracePhase(phase, opts) {
  const entry = opts.startupEntry != null ? String(opts.startupEntry) : "(unknown)";
  const s = snapshotEnvPresenceYesNo();
  const ppid = typeof process.ppid === "number" ? process.ppid : "n/a";
  const nodeEnv = process.env.NODE_ENV || "(unset)";
  // eslint-disable-next-line no-console
  console.log(
    `[getpro] envTrace phase=${phase} pid=${process.pid} ppid=${ppid} startupEntry=${entry} cwd=${process.cwd()} osHostname=${os.hostname()} NODE_ENV=${nodeEnv} DATABASE_URL=${s.DATABASE_URL} GETPRO_DATABASE_URL=${s.GETPRO_DATABASE_URL} DBURL_TEST=${s.DBURL_TEST} SESSION_SECRET=${s.SESSION_SECRET} BASE_DOMAIN=${s.BASE_DOMAIN}`
  );
}

/**
 * Temporary Hostinger diagnostic: single greppable line at earliest bootstrap (presence only).
 * @param {{ startupEntry: string }} opts
 */
function logEnvPresenceDiagnosticLine(opts) {
  const entry = opts.startupEntry != null ? String(opts.startupEntry) : "(unknown)";
  const label = buildWorkerLabel(entry);
  const s = snapshotEnvPresenceYesNo();
  const hasDb = s.DATABASE_URL === "yes" || s.GETPRO_DATABASE_URL === "yes";
  const classification = hasDb ? "HEALTHY_WORKER" : "MISCONFIGURED_WORKER";
  // eslint-disable-next-line no-console
  console.log(
    `[getpro] envPresence workerLabel=${label} pid=${process.pid} classification=${classification} DATABASE_URL=${s.DATABASE_URL} GETPRO_DATABASE_URL=${s.GETPRO_DATABASE_URL} DBURL_TEST=${s.DBURL_TEST} SESSION_SECRET=${s.SESSION_SECRET} BASE_DOMAIN=${s.BASE_DOMAIN}`
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
 * @param {ReturnType<typeof snapshotEnvPresenceYesNo>} earliest
 * @param {ReturnType<typeof snapshotEnvPresenceYesNo>} final
 */
function logEnvPresenceLostIfAny(earliest, final) {
  const keys = ["DATABASE_URL", "GETPRO_DATABASE_URL", "DBURL_TEST", "SESSION_SECRET", "BASE_DOMAIN"];
  const lost = keys.filter((k) => earliest[k] === "yes" && final[k] === "no");
  if (lost.length === 0) return;
  // eslint-disable-next-line no-console
  console.warn(
    `[getpro] envTrace: unexpected loss of env keys between earliest and bootstrap_complete: ${lost.join(
      ", "
    )} (should not happen — investigate process env mutation)`
  );
}

module.exports = {
  snapshotEnvPresenceYesNo,
  logEnvTracePhase,
  logEnvPresenceDiagnosticLine,
  buildWorkerLabel,
  logWorkerIdentityLine,
  logEnvPresenceLostIfAny,
};
