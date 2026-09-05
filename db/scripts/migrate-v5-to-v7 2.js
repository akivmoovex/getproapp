#!/usr/bin/env node
"use strict";

/**
 * V5/V6 → V7 production migration CLI.
 *
 * Env (explicit — no DATABASE_URL fallback):
 *   V5_BB_SOURCE_DATABASE_URL
 *   V6_AC_SOURCE_DATABASE_URL (optional; defaults to BB source)
 *   V7_TARGET_DATABASE_URL
 *   V7_SOURCE_IDENTITY_EXPECTED (default blessboard-platform-v5)
 *   V7_TARGET_IDENTITY_EXPECTED (default moovex-platform-v7)
 *   V7_SOURCE_ENVIRONMENT_EXPECTED
 *   V7_TARGET_ENVIRONMENT_EXPECTED
 *   V7_MIGRATION_ALLOW_HOSTED=1 (for Supabase clones)
 *   V7_MIGRATION_CONFIRM_PRODUCTION_TARGET=1 (production target writes)
 *
 * Commands: plan | dry-run | apply --confirm | verify
 */

const path = require("path");
const {
  loadMigrationEnv,
  parseCliArgs,
  assertCommandSafety,
  createReadOnlySourcePool,
  createTargetPool,
  verifyDatabaseIdentity,
  assertSourceReadOnly,
  assertDistinctConnections,
  runMigrationPipeline,
  defaultOutputDir,
} = require("../../src/migration/v5ToV7");

function printHelp() {
  console.log(`Usage: node db/scripts/migrate-v5-to-v7.js <plan|dry-run|apply|verify> [--confirm] [--delta]

Required env:
  V5_BB_SOURCE_DATABASE_URL
  V7_TARGET_DATABASE_URL
  V7_SOURCE_IDENTITY_EXPECTED (default: blessboard-platform-v5)
  V7_TARGET_IDENTITY_EXPECTED (default: moovex-platform-v7)
  V7_SOURCE_ENVIRONMENT_EXPECTED
  V7_TARGET_ENVIRONMENT_EXPECTED

Optional:
  V6_AC_SOURCE_DATABASE_URL
  V7_MIGRATION_ALLOW_HOSTED=1
  V7_MIGRATION_CONFIRM_PRODUCTION_TARGET=1
  V7_MIGRATION_EXCLUDE_ORG_KEYS=comma,separated,keys

Safety:
  - source pools are read-only
  - apply requires --confirm
  - production target requires V7_MIGRATION_CONFIRM_PRODUCTION_TARGET=1
  - never prints credentials`);
}

async function main() {
  const { command, confirm, delta, help, stateDir, autoBackfill } = parseCliArgs(process.argv.slice(2));
  if (help) {
    printHelp();
    process.exit(0);
  }

  const cmdGate = assertCommandSafety(command, { confirm });
  if (!cmdGate.ok) {
    console.error(JSON.stringify({ ok: false, code: cmdGate.code, message: cmdGate.message }));
    process.exit(1);
  }

  const env = loadMigrationEnv({
    allowHosted: process.env.V7_MIGRATION_ALLOW_HOSTED === "1",
    confirmProductionTarget: process.env.V7_MIGRATION_CONFIRM_PRODUCTION_TARGET === "1",
  });
  if (!env.ok) {
    console.error(JSON.stringify({ ok: false, code: "env_invalid", errors: env.errors }));
    process.exit(1);
  }

  const distinctUrls = [env.config.bbSourceUrl, env.config.targetUrl];
  if (env.config.acSourceExplicit) distinctUrls.push(env.config.acSourceUrl);
  const distinct = assertDistinctConnections(distinctUrls);
  if (!distinct.ok) {
    console.error(JSON.stringify({ ok: false, code: distinct.code }));
    process.exit(1);
  }

  const root = path.resolve(__dirname, "../..");
  const outputDir = stateDir
    ? path.resolve(stateDir)
    : process.env.V7_MIGRATION_OUTPUT_DIR
      ? String(process.env.V7_MIGRATION_OUTPUT_DIR).trim()
      : defaultOutputDir(root);

  let bbSourcePool = null;
  let acSourcePool = null;
  let targetPool = null;
  try {
    bbSourcePool = createReadOnlySourcePool(env.config.bbSourceUrl);
    acSourcePool = createReadOnlySourcePool(env.config.acSourceUrl);
    targetPool = createTargetPool(env.config.targetUrl);

    const ro = await assertSourceReadOnly(bbSourcePool);
    if (!ro.ok) {
      console.error(JSON.stringify({ ok: false, code: ro.code, message: ro.message }));
      process.exit(1);
    }

    const srcIdentity = await verifyDatabaseIdentity(bbSourcePool, {
      identityKey: env.config.sourceIdentity,
      environmentCode: env.config.sourceEnvironment,
      label: "bb_source",
    });
    if (!srcIdentity.ok) {
      console.error(JSON.stringify({ ok: false, code: srcIdentity.code, message: srcIdentity.message }));
      process.exit(1);
    }

    const tgtIdentity = await verifyDatabaseIdentity(targetPool, {
      identityKey: env.config.targetIdentity,
      environmentCode: env.config.targetEnvironment,
      label: "v7_target",
    });
    if (!tgtIdentity.ok) {
      console.error(JSON.stringify({ ok: false, code: tgtIdentity.code, message: tgtIdentity.message }));
      process.exit(1);
    }

    const result = await runMigrationPipeline({
      command,
      config: env.config,
      bbSourcePool,
      acSourcePool,
      targetPool,
      outputDir,
      delta,
      autoBackfill,
    });

    console.log(JSON.stringify({ ok: true, command, outputDir, ...result }, null, 2));
    if (command === "verify" && result.verify && !result.verify.ok) process.exit(3);
  } finally {
    await Promise.all(
      [bbSourcePool, acSourcePool, targetPool].filter(Boolean).map((p) => p.end().catch(() => {}))
    );
  }
}

main().catch((err) => {
  console.error(JSON.stringify({ ok: false, error: err.message }));
  process.exit(1);
});
