#!/usr/bin/env node
"use strict";

/**
 * Hosted BlessBoard V5 test-user seed — Node-only (no npm required).
 *
 * Uses the same bootstrap + getPgPool() as the hosted V5 application.
 * Never loads repo .env when NODE_ENV=production (Hostinger process.env / production env file).
 * Never uses GETPRO_DATABASE_URL, ephemeral Postgres, or test helpers.
 *
 * Locate Node on Hostinger if needed:
 *   which node
 *   command -v node
 *   find /opt/alt /usr/local /home -type f -name node 2>/dev/null | head -30
 *
 * Examples (replace <NODE_BINARY> and identity):
 *
 *   DEPLOYMENT_ENV=testing \
 *   BLESSBOARD_ALLOW_TEST_USERS=true \
 *   DATABASE_IDENTITY_EXPECTED='blessboard-platform-v5' \
 *   <NODE_BINARY> db/scripts/blessboard-hosted-test-users-seed.js --diagnose
 *
 *   … same env … <NODE_BINARY> db/scripts/blessboard-hosted-test-users-seed.js
 *   … same env … <NODE_BINARY> db/scripts/blessboard-hosted-test-users-seed.js --confirm
 */

const path = require("path");

// Resolve app root from this file so cwd does not matter.
const APP_ROOT = path.resolve(__dirname, "../..");

function parseArgs(argv) {
  let confirm = false;
  let diagnose = false;
  let resetPasswords = false;
  let explicitDryRun = false;
  for (const arg of argv) {
    if (arg === "--confirm") confirm = true;
    else if (arg === "--diagnose") diagnose = true;
    else if (arg === "--reset-passwords") resetPasswords = true;
    else if (arg === "--dry-run") explicitDryRun = true;
  }
  // Dry-run wins over confirm (safer). Diagnose is always non-writing.
  if (diagnose) confirm = false;
  if (explicitDryRun) confirm = false;
  const dryRun = !confirm || diagnose || explicitDryRun;
  return { confirm, diagnose, resetPasswords, dryRun };
}

function assertSafeText(text) {
  const s = String(text || "");
  if (/postgres(ql)?:\/\//i.test(s)) throw new Error("Refusing to print a postgres URL");
  if (/\$2[aby]\$\d{2}\$/.test(s)) throw new Error("Refusing to print bcrypt material");
  if (/password\s*=/i.test(s)) throw new Error("Refusing to print password material");
}

function emitJson(obj) {
  const text = JSON.stringify(obj, null, 2);
  assertSafeText(text);
  // eslint-disable-next-line no-console
  console.log(text);
}

function emitHuman(lines) {
  const text = lines.join("\n");
  assertSafeText(text);
  // eslint-disable-next-line no-console
  console.error(text);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  let exitCode = 2;

  // eslint-disable-next-line no-console
  console.error(
    "[blessboard-hosted-test-users-seed] WARNING: Temporary shared testing password is for testing only. Never use these accounts in a customer production deployment."
  );

  // Same bootstrap as hosted V5 app (Hostinger env; no repo .env in production).
  // Keep bootstrap + pool diagnostics on stderr so stdout remains machine JSON only.
  const { runBootstrap } = require("../../src/startup/bootstrap");
  const originalLog = console.log;
  console.log = (...parts) => {
    // eslint-disable-next-line no-console
    console.error(...parts);
  };
  let bootstrap;
  try {
    bootstrap = runBootstrap();
  } catch (err) {
    console.log = originalLog;
    throw err;
  }

  const poolMod = require("../../src/db/pg/pool");
  const {
    getPgPool,
    closePgPool,
    isPgConfigured,
    summarizeDatabaseUrlEnv,
    redactDatabaseHostFingerprint,
    getDatabaseUrl,
  } = poolMod;

  const urlSummary = summarizeDatabaseUrlEnv();
  const hasUrl = isPgConfigured();

  if (!hasUrl) {
    console.log = originalLog;
    emitJson({
      ok: false,
      status: "missing_database_url",
      message: "DATABASE_URL not available after application bootstrap",
      database_url_received: Boolean(urlSummary.hasDatabaseUrl),
      database_url_source: urlSummary.effectiveSource,
      getpro_database_url_present: Boolean(urlSummary.hasGetproDatabaseUrl),
      node_env: process.env.NODE_ENV || null,
      deployment_env: process.env.DEPLOYMENT_ENV || null,
      bootstrap_env_path: bootstrap.envPath || null,
      writes: false,
    });
    emitHuman([
      "[hosted-seed] FAIL: DATABASE_URL missing after application bootstrap.",
      "  Ensure Hostinger Environment Variables include DATABASE_URL for this app.",
      "  Do not rely on repo .env when NODE_ENV=production.",
      "  GETPRO_DATABASE_URL is never used for V5 foundation seeding.",
    ]);
    process.exit(2);
  }

  // Refuse GETPRO fallback presence as a misconfiguration trap (V5 uses DATABASE_URL only).
  if (urlSummary.hasGetproDatabaseUrl && urlSummary.effectiveSource !== "DATABASE_URL") {
    console.log = originalLog;
    emitJson({
      ok: false,
      status: "getpro_database_url_forbidden",
      message: "V5 hosted seed requires DATABASE_URL; GETPRO_DATABASE_URL must not be the effective source",
      database_url_source: urlSummary.effectiveSource,
      writes: false,
    });
    process.exit(2);
  }

  const connectionString = getDatabaseUrl();
  const hostFingerprint = redactDatabaseHostFingerprint(connectionString);

  const {
    runHostedTestUserSeed,
    OPERATIONAL_POOL_MODULE,
    TEST_PASSWORD,
    FIXTURE,
    outputContainsSecrets,
  } = require("../../src/blessboard/services/seedBlessBoardHostedTestUsers");

  const pool = getPgPool();
  if (!pool) {
    console.log = originalLog;
    emitJson({
      ok: false,
      status: "pool_unavailable",
      message: "getPgPool() returned null",
      writes: false,
    });
    process.exit(2);
  }

  try {
    const result = await runHostedTestUserSeed(pool, {
      dryRun: args.dryRun,
      diagnose: args.diagnose,
      confirm: args.confirm,
      resetPasswords: args.resetPasswords,
      env: process.env,
      urlSourceName: urlSummary.effectiveSource,
    });

    // Machine report — never include login table plaintext password in JSON when dry-run;
    // on confirm, include login emails/roles only; password only on stderr summary.
    const machine = {
      ok: result.ok,
      status: result.status,
      message: result.message || null,
      mode: args.diagnose ? "diagnose" : args.confirm ? "write" : "dry_run",
      operational_pool_module: result.operationalPoolModule || OPERATIONAL_POOL_MODULE,
      repository_implementation: result.repositoryImplementation || "real_v5_postgres",
      node_env: result.nodeEnv || process.env.NODE_ENV || null,
      deployment_env: result.deploymentEnv || process.env.DEPLOYMENT_ENV || null,
      database_url_source: result.databaseUrlSource || urlSummary.effectiveSource,
      host_fingerprint: hostFingerprint,
      probe: result.probe || null,
      identity: result.identity || null,
      writes: Boolean(result.writes),
      preview: result.preview || null,
      diagnose: result.diagnose || null,
      result: result.result
        ? {
            organizationKey: result.result.organizationKey,
            hqBranchKey: result.result.hqBranchKey,
            campusBranchKey: result.result.campusBranchKey,
            hostname: result.result.hostname,
            created: result.result.created,
            userCount: result.result.userCount,
            inTxVerify: result.result.inTxVerify,
            freshVerify: result.result.freshVerify,
            loginEmails: (result.result.loginTable || []).map((r) => ({
              role: r.role,
              email: r.email,
              expectedPortal: r.expectedPortal,
            })),
          }
        : null,
      warning: result.warning || null,
      error_class: result.errorClass || null,
      detail: result.detail || null,
      app_root: APP_ROOT,
    };

    if (outputContainsSecrets(JSON.stringify(machine))) {
      throw new Error("Refusing to emit report with secret material");
    }
    console.log = originalLog;
    emitJson(machine);

    const human = [
      `[hosted-seed] mode=${machine.mode} ok=${machine.ok} status=${machine.status}`,
      `  pool=${machine.operational_pool_module} source=${machine.database_url_source}`,
      `  NODE_ENV=${machine.node_env} DEPLOYMENT_ENV=${machine.deployment_env}`,
      `  host_fingerprint=${machine.host_fingerprint}`,
    ];
    if (machine.identity) {
      human.push(
        `  identity expected=${machine.identity.expected} actual=${machine.identity.actual} match=${machine.identity.match}`
      );
    }
    if (machine.probe) {
      human.push(
        `  database=${machine.probe.databaseName} port=${machine.probe.serverPort} schema=${machine.probe.currentSchema}`
      );
      human.push(`  required_tables=${machine.probe.requiredTablesPresent}`);
    }
    if (machine.preview) {
      human.push(`  missing_users=${(machine.preview.missingUsers || []).join(",") || "(none)"}`);
      human.push(`  writes=false`);
    }
    if (result.ok && args.confirm && result.result) {
      human.push(`  user_count=${result.result.userCount}`);
      human.push(`  fresh_verify_ok=${Boolean(result.result.freshVerify && result.result.freshVerify.count === 4)}`);
      human.push("");
      human.push("=== Login table (testing-only; stderr only) ===");
      human.push("Role | Email | Temporary password | Portal");
      for (const row of result.result.loginTable || []) {
        human.push(
          `${row.role} | ${row.email} | ${row.temporaryPassword} | ${row.expectedPortal}`
        );
      }
      human.push(
        `Shared temporary testing password (do not place in JSON logs): ${TEST_PASSWORD}`
      );
      human.push(`Fixture org: ${FIXTURE.organizationKey} / campus: ${FIXTURE.campusBranchKey}`);
      human.push("Replace or delete these accounts before any customer production launch.");
    }
    if (!result.ok && result.message) human.push(`  message=${result.message}`);
    emitHuman(human);

    exitCode = result.ok ? 0 : 2;
  } catch (err) {
    console.log = originalLog;
    const safe = err && err.message ? String(err.message) : "cli_failure";
    emitJson({
      ok: false,
      status: "cli_failure",
      message: safe,
      writes: false,
    });
    emitHuman([`[hosted-seed] ERROR: ${safe}`]);
    exitCode = 1;
  } finally {
    console.log = originalLog;
    try {
      await closePgPool();
    } catch {
      /* ignore */
    }
    process.exit(exitCode);
  }
}

main();
