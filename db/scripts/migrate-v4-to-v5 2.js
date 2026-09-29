#!/usr/bin/env node
"use strict";

/**
 * V4 → V5 migration CLI.
 *
 * Env (required, explicit — no DATABASE_URL fallback):
 *   V4_SOURCE_DATABASE_URL
 *   V5_TARGET_DATABASE_URL
 *   DATABASE_IDENTITY_EXPECTED
 *
 * Commands:
 *   plan | dry-run | apply | verify
 *
 * apply requires --confirm
 * Never prints credentials. Never mutates source. Never auto-runs at startup.
 */

const path = require("path");
const { loadMigrationEnv } = require("../../src/migration/v4ToV5/config");
const {
  parseCliArgs,
  assertCommandSafety,
  assertDistinctConnections,
  createReadOnlySourcePool,
  createTargetPool,
  assertSourceReadOnly,
  verifyTargetIdentity,
} = require("../../src/migration/v4ToV5/safety");
const { createPgExtractor } = require("../../src/migration/v4ToV5/extractPg");
const {
  runMigrationPipeline,
  defaultOutputDir,
} = require("../../src/migration/v4ToV5/pipeline");
const { consoleSafeSummary } = require("../../src/migration/v4ToV5/reports");

function printHelp() {
  // eslint-disable-next-line no-console
  console.log(`Usage: node db/scripts/migrate-v4-to-v5.js <plan|dry-run|apply|verify> [--confirm] [--resume]

Required env:
  V4_SOURCE_DATABASE_URL
  V5_TARGET_DATABASE_URL
  DATABASE_IDENTITY_EXPECTED

Safety:
  - dry-run is the default operational mode
  - apply requires --confirm
  - source is opened read-only
  - same source/target fingerprint is refused
  - credentials are never printed`);
}

async function main() {
  const { command, confirm, resume, help } = parseCliArgs(process.argv.slice(2));
  if (help) {
    printHelp();
    process.exit(0);
  }

  const cmdGate = assertCommandSafety(command, { confirm });
  if (!cmdGate.ok) {
    // eslint-disable-next-line no-console
    console.error(JSON.stringify({ ok: false, code: cmdGate.code, message: cmdGate.message }));
    process.exit(1);
  }

  const env = loadMigrationEnv();
  if (!env.ok) {
    // eslint-disable-next-line no-console
    console.error(JSON.stringify({ ok: false, code: "env_invalid", errors: env.errors }));
    process.exit(1);
  }

  const distinct = assertDistinctConnections(env.config.sourceUrl, env.config.targetUrl);
  if (!distinct.ok) {
    // eslint-disable-next-line no-console
    console.error(
      JSON.stringify({
        ok: false,
        code: distinct.code,
        message: distinct.message,
        source: distinct.source,
        target: distinct.target,
      })
    );
    process.exit(1);
  }

  const root = path.resolve(__dirname, "../..");
  const outputDir = process.env.V4_TO_V5_OUTPUT_DIR
    ? String(process.env.V4_TO_V5_OUTPUT_DIR).trim()
    : defaultOutputDir(root);
  const stateDir = path.join(outputDir, "state");

  let sourcePool = null;
  let targetPool = null;
  try {
    sourcePool = createReadOnlySourcePool(env.config.sourceUrl);
    targetPool = createTargetPool(env.config.targetUrl);

    const ro = await assertSourceReadOnly(sourcePool);
    if (!ro.ok) {
      // eslint-disable-next-line no-console
      console.error(JSON.stringify({ ok: false, code: ro.code, message: ro.message }));
      process.exit(1);
    }

    const identity = await verifyTargetIdentity(targetPool, env.config.identityKey);
    if (!identity.ok) {
      // eslint-disable-next-line no-console
      console.error(
        JSON.stringify({ ok: false, code: identity.code, message: identity.message })
      );
      process.exit(1);
    }

    const extractor = createPgExtractor(sourcePool, {
      batchSize: env.config.runConfig.batchSize,
    });

    const result = await runMigrationPipeline({
      mode: command,
      config: env.config,
      extractor,
      targetPool,
      outputDir,
      checkpointPath: path.join(stateDir, "checkpoints.json"),
      idMapPath: path.join(stateDir, "id-map.json"),
      resume,
    });

    // eslint-disable-next-line no-console
    console.log(
      JSON.stringify(
        {
          ok: result.ok,
          mode: command,
          code: result.code || null,
          message: result.message || null,
          source: env.config.sourceSummary,
          target: env.config.targetSummary,
          totals: result.totals || consoleSafeSummary({}),
          files: result.files || null,
          rolledBack: result.rolledBack || false,
        },
        null,
        2
      )
    );
    process.exit(result.ok ? 0 : 1);
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error(
      JSON.stringify({
        ok: false,
        code: "migration_error",
        message: err && err.message ? String(err.message) : String(err),
      })
    );
    process.exit(1);
  } finally {
    if (sourcePool) await sourcePool.end().catch(() => {});
    if (targetPool) await targetPool.end().catch(() => {});
  }
}

main();
