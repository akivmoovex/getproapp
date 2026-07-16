#!/usr/bin/env node
"use strict";

/**
 * Initialize the singleton BlessBoard database identity (public.church_database_identity).
 *
 * This marks a PostgreSQL database as "testing" or "production" so the runtime startup
 * guard can refuse to boot a testing deployment against a production database (and vice
 * versa). No identity is ever created automatically from NODE_ENV — you must run this
 * explicitly, once per database, on V4 and V5 separately.
 *
 * Safety:
 * - Requires an explicit expected environment: --env testing|production
 * - Requires confirmation: --confirm
 * - Refuses to overwrite an existing, DIFFERENT identity (never mutates an existing row)
 * - Refuses when DEPLOYMENT_ENV is set and disagrees with --env (unless ALLOW_IDENTITY_ENV_MISMATCH=1)
 * - Never prints DATABASE_URL, credentials, or the raw server address
 * - Respects V5 isolation (DATABASE_URL only; no GETPRO_DATABASE_URL fallback)
 *
 * Usage:
 *   DATABASE_URL=… node scripts/init-church-database-identity.js --env testing --confirm
 *   DATABASE_URL=… node scripts/init-church-database-identity.js --env production --confirm --name "blessboard.com V4"
 */

const crypto = require("crypto");

const { runBootstrap } = require("../src/startup/bootstrap");
runBootstrap();

const {
  getPgPool,
  isPgConfigured,
  summarizeDatabaseUrlEnv,
  redactDatabaseHostFingerprint,
  getDatabaseUrl,
} = require("../src/db/pg/pool");
const { ensureChurchSchema } = require("../src/db/pg/ensureChurchSchema");
const {
  getBlessBoardCanonicalDomain,
  isBlessBoardOrgTestingDeployment,
} = require("../src/church/blessBoardEnv");
const {
  IDENTITY_ENVIRONMENTS,
  getDatabaseIdentity,
  insertDatabaseIdentity,
} = require("../src/db/pg/church/databaseIdentityRepo");

function parseArgs(argv) {
  const out = { env: "", confirm: false, name: "" };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--confirm") out.confirm = true;
    else if (arg === "--env") out.env = String(argv[++i] || "");
    else if (arg.startsWith("--env=")) out.env = arg.slice("--env=".length);
    else if (arg === "--name") out.name = String(argv[++i] || "");
    else if (arg.startsWith("--name=")) out.name = arg.slice("--name=".length);
  }
  return out;
}

function allowEnvMismatch() {
  const v = String(process.env.ALLOW_IDENTITY_ENV_MISMATCH || "").trim().toLowerCase();
  return v === "1" || v === "true" || v === "yes";
}

function printIdentity(prefix, identity, hostFingerprint, currentDatabase) {
  // eslint-disable-next-line no-console
  console.log(
    JSON.stringify(
      {
        ok: true,
        result: prefix,
        environment_code: identity.environmentCode,
        deployment_name: identity.deploymentName,
        database_instance_id: identity.databaseInstanceId,
        current_database: currentDatabase,
        database_host_fingerprint: hostFingerprint,
      },
      null,
      2
    )
  );
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const env = args.env.trim().toLowerCase() || String(process.env.CHURCH_DB_IDENTITY_ENV || "").trim().toLowerCase();
  const confirm = args.confirm || String(process.env.CHURCH_DB_IDENTITY_CONFIRM || "").trim() === "1";

  if (!IDENTITY_ENVIRONMENTS.includes(env)) {
    // eslint-disable-next-line no-console
    console.error(
      `[church:db-identity] Refusing: --env is required and must be one of: ${IDENTITY_ENVIRONMENTS.join(", ")}.\n` +
        "  Example: node scripts/init-church-database-identity.js --env testing --confirm"
    );
    process.exit(2);
  }

  if (!confirm) {
    // eslint-disable-next-line no-console
    console.error(
      `[church:db-identity] Refusing: this writes a permanent database identity. Re-run with --confirm to mark this database as "${env}".`
    );
    process.exit(2);
  }

  const declaredDeploymentEnv = String(process.env.DEPLOYMENT_ENV || "").trim().toLowerCase();
  if (declaredDeploymentEnv && declaredDeploymentEnv !== env && !allowEnvMismatch()) {
    // eslint-disable-next-line no-console
    console.error(
      `[church:db-identity] Refusing: DEPLOYMENT_ENV=${declaredDeploymentEnv} disagrees with --env=${env}. ` +
        "This likely points at the wrong database. Fix the mismatch, or set ALLOW_IDENTITY_ENV_MISMATCH=1 to override."
    );
    process.exit(2);
  }

  if (isBlessBoardOrgTestingDeployment()) {
    const summary = summarizeDatabaseUrlEnv();
    if (summary.effectiveSource !== "DATABASE_URL") {
      // eslint-disable-next-line no-console
      console.error(
        `[church:db-identity] Refusing: BlessBoard.org testing must use an explicit DATABASE_URL (effective=${summary.effectiveSource}).`
      );
      process.exit(2);
    }
  }

  if (!isPgConfigured()) {
    // eslint-disable-next-line no-console
    console.error("[church:db-identity] PostgreSQL is not configured (set DATABASE_URL).");
    process.exit(1);
  }

  const hostFingerprint = redactDatabaseHostFingerprint(getDatabaseUrl());
  const pool = getPgPool();
  await ensureChurchSchema(pool);

  let currentDatabase = "(unavailable)";
  try {
    const r = await pool.query("SELECT current_database() AS db");
    currentDatabase = (r.rows[0] && r.rows[0].db) || "(unavailable)";
  } catch {
    /* non-fatal */
  }

  const existing = await getDatabaseIdentity(pool);
  if (existing) {
    if (existing.environmentCode === env) {
      // eslint-disable-next-line no-console
      console.log(
        `[church:db-identity] Already initialized as "${env}" (host ${hostFingerprint}). No changes made.`
      );
      printIdentity("already-initialized", existing, hostFingerprint, currentDatabase);
      process.exit(0);
    }
    // eslint-disable-next-line no-console
    console.error(
      `[church:db-identity] Refusing to overwrite: this database is already marked environment_code=${existing.environmentCode} ` +
        `(host ${hostFingerprint}), but --env=${env}. A database identity is immutable once set — this protects against wrong-database writes.`
    );
    process.exit(3);
  }

  const deploymentName =
    (args.name && args.name.trim()) ||
    String(process.env.CHURCH_DB_IDENTITY_NAME || "").trim() ||
    `${getBlessBoardCanonicalDomain()} (${env})`;

  const identity = await insertDatabaseIdentity(pool, {
    environmentCode: env,
    deploymentName,
    databaseInstanceId: crypto.randomUUID(),
  });

  // eslint-disable-next-line no-console
  console.log(`[church:db-identity] Initialized database identity as "${env}" (host ${hostFingerprint}).`);
  printIdentity("created", identity, hostFingerprint, currentDatabase);
  process.exit(0);
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error("[church:db-identity] FAILED —", err && err.message ? err.message : String(err));
  process.exit(1);
});
