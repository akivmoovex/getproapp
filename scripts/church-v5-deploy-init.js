#!/usr/bin/env node
"use strict";

/**
 * BlessBoard.org V5 one-time Hostinger deploy initialization.
 *
 * Ensures church schema (incl. migration 121) and initializes the singleton
 * database identity as testing / "BlessBoard V5".
 *
 * Hostinger Build Command:
 *   npm run church:v5:deploy-init
 *
 * Required environment (Hostinger app env):
 *   DEPLOYMENT_ENV=testing
 *   DATABASE_URL=…          (already present; never logged)
 *   BLESSBOARD_INITIALIZE_DB_IDENTITY=1   (temporary — remove after first successful deploy)
 *
 * Does not start the web server. Does not seed tenants.
 */

const { runBootstrap } = require("../src/startup/bootstrap");
runBootstrap();

const { getPgPool, isPgConfigured, closePgPool } = require("../src/db/pg/pool");
const {
  INIT_FLAG_ENV,
  redactSecrets,
  runV5DeployInit,
} = require("../src/services/church/churchV5DeployInitService");

async function main() {
  if (!isPgConfigured()) {
    // eslint-disable-next-line no-console
    console.error("[church:v5:deploy-init] PostgreSQL is not configured (set DATABASE_URL).");
    process.exit(1);
  }

  const pool = getPgPool();
  const result = await runV5DeployInit(pool, { env: process.env });
  for (const line of result.logLines) {
    // eslint-disable-next-line no-console
    console.log(line);
  }
  // eslint-disable-next-line no-console
  console.log(
    redactSecrets(
      JSON.stringify({
        ok: true,
        result: result.result,
        environment_code: result.environmentCode,
        deployment_name: result.deploymentName,
        database_host_fingerprint: result.hostFingerprint,
      })
    )
  );
  try {
    await closePgPool();
  } catch {
    /* ignore */
  }
  process.exit(0);
}

main().catch(async (err) => {
  const code = err && err.code ? err.code : "FAILED";
  const message = redactSecrets(err && err.message ? err.message : String(err));
  // eslint-disable-next-line no-console
  console.error(message);
  if (code === "INIT_FLAG_REQUIRED") {
    // eslint-disable-next-line no-console
    console.error(
      `[church:v5:deploy-init] Hint: set ${INIT_FLAG_ENV}=1 only for the first V5 build, then remove it.`
    );
  }
  try {
    await closePgPool();
  } catch {
    /* ignore */
  }
  const exitByCode = {
    INIT_FLAG_REQUIRED: 2,
    DEPLOYMENT_ENV_REQUIRED: 2,
    PRODUCTION_REFUSED: 2,
    DATABASE_URL_REQUIRED: 2,
    IDENTITY_MISMATCH: 3,
  };
  process.exit(exitByCode[code] || 1);
});
