"use strict";

const os = require("os");

function envStringIsSet(value) {
  return value != null && String(value).trim() !== "";
}

/**
 * Which required production variables are missing (names only — never values).
 * @returns {string[]}
 */
function getProductionMissingRequiredEnv() {
  if (process.env.NODE_ENV !== "production") return [];
  const missing = [];
  if (!envStringIsSet(process.env.SESSION_SECRET)) missing.push("SESSION_SECRET");
  if (!envStringIsSet(process.env.BASE_DOMAIN)) missing.push("BASE_DOMAIN");
  return missing;
}

/**
 * Safe yes/no for diagnostics (secrets: only presence).
 * @returns {{ DATABASE_URL: string, GETPRO_DATABASE_URL: string, SESSION_SECRET: string, BASE_DOMAIN: string, PUBLIC_SCHEME: string }}
 */
function summarizeProductionEnvPresence() {
  const hasDb =
    envStringIsSet(process.env.DATABASE_URL) || envStringIsSet(process.env.GETPRO_DATABASE_URL);
  return {
    DATABASE_URL: envStringIsSet(process.env.DATABASE_URL) ? "yes" : "no",
    GETPRO_DATABASE_URL: envStringIsSet(process.env.GETPRO_DATABASE_URL) ? "yes" : "no",
    effectiveDb: hasDb ? "yes" : "no",
    SESSION_SECRET: envStringIsSet(process.env.SESSION_SECRET) ? "yes" : "no",
    BASE_DOMAIN: envStringIsSet(process.env.BASE_DOMAIN) ? "yes" : "no",
    PUBLIC_SCHEME: envStringIsSet(process.env.PUBLIC_SCHEME) ? "yes" : "no (defaults to https in code)",
  };
}

/**
 * One block of startup diagnostics for production (no secrets).
 * @param {{ startupEntry?: string }} [boot]
 */
function logProductionEnvDiagnostics(boot) {
  if (process.env.NODE_ENV !== "production") return;
  const s = summarizeProductionEnvPresence();
  const entry = boot && boot.startupEntry != null ? String(boot.startupEntry) : "(unknown)";
  const lines = [
    "[getpro] Production env check (Hostinger / process.env only — .env file is not loaded in production):",
    `  NODE_ENV: production`,
    `  pid: ${process.pid} | ppid: ${typeof process.ppid === "number" ? process.ppid : "n/a"} | hostname (OS): ${os.hostname()}`,
    `  cwd: ${process.cwd()}`,
    `  startup entry: ${entry}`,
    `  DATABASE_URL present: ${s.DATABASE_URL} | GETPRO_DATABASE_URL present: ${s.GETPRO_DATABASE_URL} | effective DB URL: ${s.effectiveDb}`,
    `  SESSION_SECRET present: ${s.SESSION_SECRET}`,
    `  BASE_DOMAIN present: ${s.BASE_DOMAIN}`,
    `  PUBLIC_SCHEME set: ${s.PUBLIC_SCHEME}`,
  ];
  for (const line of lines) {
    // eslint-disable-next-line no-console
    console.log(line);
  }
}

/**
 * Call after PostgreSQL URL is known to be set. Exits 1 if production-required vars are missing.
 * @param {object} [boot]
 */
function assertProductionRequiredEnvOrExit(boot) {
  if (process.env.NODE_ENV !== "production") return;
  logProductionEnvDiagnostics(boot);
  const missing = getProductionMissingRequiredEnv();
  if (missing.length === 0) return;
  // eslint-disable-next-line no-console
  console.error(
    `[getpro] FATAL: MISCONFIGURED WORKER — production is missing required environment variable(s): ${missing.join(
      ", "
    )}. Set them in Hostinger → Website → Settings & Redeploy (Environment variables) for every Node worker. Do not rely on a .env file in production.`
  );
  process.exit(1);
}

module.exports = {
  getProductionMissingRequiredEnv,
  summarizeProductionEnvPresence,
  logProductionEnvDiagnostics,
  assertProductionRequiredEnvOrExit,
  envStringIsSet,
};
