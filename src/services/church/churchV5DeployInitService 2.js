"use strict";

/**
 * One-time BlessBoard.org V5 Hostinger deploy initialization.
 *
 * Applies church schema (including migration 121) and initializes the singleton
 * database identity as testing / "BlessBoard V5". Never runs during ordinary
 * app startup — only via the explicit deploy-init CLI with an opt-in flag.
 *
 * Does not seed tenants or mutate unrelated data.
 */

const crypto = require("crypto");
const { ensureChurchSchema } = require("../../db/pg/ensureChurchSchema");
const {
  getDatabaseIdentity,
  insertDatabaseIdentity,
} = require("../../db/pg/church/databaseIdentityRepo");
const { redactDatabaseHostFingerprint } = require("../../db/pg/pool");

const INIT_FLAG_ENV = "BLESSBOARD_INITIALIZE_DB_IDENTITY";
const TARGET_DEPLOYMENT_ENV = "testing";
const TARGET_DEPLOYMENT_NAME = "BlessBoard V5";

const SECRET_LEAK =
  /(postgres(ql)?:\/\/[^\s"']+|(?:password|passwd|pwd|secret|token|api[_-]?key)\s*[:=]\s*\S+)/gi;

function redactSecrets(text) {
  return String(text || "").replace(SECRET_LEAK, "[redacted]");
}

function isInitializeFlagEnabled(env = process.env) {
  const v = String(env[INIT_FLAG_ENV] || "")
    .trim()
    .toLowerCase();
  return v === "1" || v === "true" || v === "yes";
}

function refuse(code, message) {
  return Object.assign(new Error(redactSecrets(message)), { code });
}

/**
 * @param {import("pg").Pool} pool
 * @param {{ env?: NodeJS.ProcessEnv, skipSchema?: boolean }} [opts]
 * @returns {Promise<{
 *   ok: boolean,
 *   result: "created" | "already-initialized",
 *   environmentCode: string,
 *   deploymentName: string|null,
 *   hostFingerprint: string,
 *   logLines: string[],
 * }>}
 */
async function runV5DeployInit(pool, opts = {}) {
  const env = opts.env || process.env;
  const logLines = [];
  const log = (line) => {
    logLines.push(redactSecrets(line));
  };

  if (!isInitializeFlagEnabled(env)) {
    throw refuse(
      "INIT_FLAG_REQUIRED",
      `[church:v5:deploy-init] Refusing: set ${INIT_FLAG_ENV}=1 for this one-time Hostinger build only. ` +
        "Ordinary startup never initializes database identity."
    );
  }

  const deploymentEnv = String(env.DEPLOYMENT_ENV || "")
    .trim()
    .toLowerCase();
  if (deploymentEnv !== TARGET_DEPLOYMENT_ENV) {
    throw refuse(
      deploymentEnv === "production" ? "PRODUCTION_REFUSED" : "DEPLOYMENT_ENV_REQUIRED",
      `[church:v5:deploy-init] Refusing: DEPLOYMENT_ENV must be "${TARGET_DEPLOYMENT_ENV}" ` +
        `(got "${deploymentEnv || "(unset)"}"). Never initializes production identity from this command.`
    );
  }

  const hasDatabaseUrl = Boolean(String(env.DATABASE_URL || "").trim());
  if (!hasDatabaseUrl) {
    throw refuse(
      "DATABASE_URL_REQUIRED",
      "[church:v5:deploy-init] Refusing: DATABASE_URL is required (credentials never logged)."
    );
  }

  let hostFingerprint = "(unavailable)";
  try {
    hostFingerprint = redactDatabaseHostFingerprint(String(env.DATABASE_URL).trim());
  } catch {
    hostFingerprint = "(unavailable)";
  }

  if (!opts.skipSchema) {
    await ensureChurchSchema(pool);
    log("[church:v5:deploy-init] Schema ensured (includes database identity migration).");
  }

  const existing = await getDatabaseIdentity(pool);
  if (existing) {
    if (existing.environmentCode === TARGET_DEPLOYMENT_ENV) {
      log(
        `[church:v5:deploy-init] Already initialized as "${TARGET_DEPLOYMENT_ENV}" ` +
          `(deployment_name=${existing.deploymentName || "(none)"}; host ${hostFingerprint}). No changes made.`
      );
      return {
        ok: true,
        result: "already-initialized",
        environmentCode: existing.environmentCode,
        deploymentName: existing.deploymentName,
        hostFingerprint,
        logLines,
      };
    }
    throw refuse(
      "IDENTITY_MISMATCH",
      `[church:v5:deploy-init] Refusing to overwrite: database identity is already ` +
        `environment_code=${existing.environmentCode} (host ${hostFingerprint}). ` +
        `Expected "${TARGET_DEPLOYMENT_ENV}". Identity is immutable once set.`
    );
  }

  const identity = await insertDatabaseIdentity(pool, {
    environmentCode: TARGET_DEPLOYMENT_ENV,
    deploymentName: TARGET_DEPLOYMENT_NAME,
    databaseInstanceId: crypto.randomUUID(),
  });

  log(
    `[church:v5:deploy-init] Initialized database identity as "${TARGET_DEPLOYMENT_ENV}" ` +
      `(deployment_name=${TARGET_DEPLOYMENT_NAME}; host ${hostFingerprint}).`
  );

  return {
    ok: true,
    result: "created",
    environmentCode: identity.environmentCode,
    deploymentName: identity.deploymentName,
    hostFingerprint,
    logLines,
  };
}

module.exports = {
  INIT_FLAG_ENV,
  TARGET_DEPLOYMENT_ENV,
  TARGET_DEPLOYMENT_NAME,
  isInitializeFlagEnabled,
  redactSecrets,
  runV5DeployInit,
};
