#!/usr/bin/env node
"use strict";

/**
 * Local V5→V7 migration rehearsal (fixture DBs only).
 */

const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");
const {
  prepareV5ToV7RehearsalDatabases,
  endPools,
} = require("../../tests/helpers/v5ToV7FixtureDb");

async function main() {
  const root = path.resolve(__dirname, "../..");
  let pools;
  const stateDir = path.join(root, "tmp", "v5-to-v7-rehearsal-state");
  fs.rmSync(stateDir, { recursive: true, force: true });
  try {
    pools = await prepareV5ToV7RehearsalDatabases();
    const env = {
      ...process.env,
      V5_BB_SOURCE_DATABASE_URL: pools.sourceUrl,
      V7_TARGET_DATABASE_URL: pools.targetUrl,
      V7_SOURCE_IDENTITY_EXPECTED: "blessboard-platform-v5",
      V7_TARGET_IDENTITY_EXPECTED: "moovex-platform-v7",
      V7_SOURCE_ENVIRONMENT_EXPECTED: "testing",
      V7_TARGET_ENVIRONMENT_EXPECTED: "testing",
      V7_MIGRATION_STATE_DIR: stateDir,
      V7_MEDIA_SOURCE_ROOT: pools.mediaRoot,
      V7_MEDIA_TARGET_ROOT: path.join(root, "tmp", "v7-media-rehearsal"),
    };

    const run = (args) =>
      execSync(`node db/scripts/migrate-v5-to-v7.js ${args}`, {
        cwd: root,
        env,
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"],
      });

    const plan = JSON.parse(run("plan"));
    const dry = JSON.parse(run("dry-run"));
    const applied = JSON.parse(run("apply --confirm"));
    const verified = JSON.parse(run("verify"));

    await pools.sourcePool.query(
      `UPDATE blessboard.page_sections SET heading = 'Welcome Updated' WHERE section_key = 'welcome'`
    );

    const deltaApplied = JSON.parse(run("apply --confirm --delta"));
    const deltaVerified = JSON.parse(run("verify"));
    const deltaAgain = JSON.parse(run("apply --confirm --delta"));

    console.log(
      JSON.stringify(
        {
          ok: true,
          rehearsal: "local_fixture_bb_ac",
          plan: plan.plan && plan.plan.blessboard,
          activeclinic: plan.plan && plan.plan.activeclinic,
          apply: applied.apply,
          verify: verified.verify,
          deltaApply: deltaApplied.apply,
          deltaVerify: deltaVerified.verify,
          deltaIdempotent: deltaAgain.apply,
          stateDir,
        },
        null,
        2
      )
    );
  } finally {
    if (pools) await endPools(pools.sourcePool, pools.targetPool);
  }
}

main().catch((err) => {
  console.error(JSON.stringify({ ok: false, error: err.message, stack: err.stack }));
  process.exit(1);
});
