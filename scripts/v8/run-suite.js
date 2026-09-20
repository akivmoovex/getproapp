#!/usr/bin/env node
"use strict";

/**
 * Run one or more V8 test suites via node:test.
 *
 * Usage:
 *   node scripts/v8/run-suite.js shared-platform
 *   node scripts/v8/run-suite.js compatibility blessboard
 *   node scripts/v8/run-suite.js --list
 *
 * Never targets hosted DATABASE_URL for destructive fixture resets.
 * Suite files that need Postgres use tests/helpers/foundationDb.js (disposable DBs).
 */

const { spawnSync } = require("child_process");
const fs = require("fs");
const {
  ROOT,
  SUITES,
  getSuite,
  resolveSuiteFile,
} = require("./suite-manifest");

function printList() {
  for (const suite of Object.values(SUITES)) {
    process.stdout.write(
      `${suite.id}\t${suite.files.length} files\t${suite.title}\n`
    );
  }
}

function main(argv) {
  const args = argv.slice(2);
  if (args.includes("--list") || args.includes("-l")) {
    printList();
    return 0;
  }
  if (!args.length) {
    process.stderr.write(
      "Usage: node scripts/v8/run-suite.js <suite-id> [suite-id…]\n" +
        "       node scripts/v8/run-suite.js --list\n"
    );
    return 2;
  }

  let exitCode = 0;
  for (const id of args) {
    const suite = getSuite(id);
    const files = suite.files.map(resolveSuiteFile);
    for (const file of files) {
      if (!fs.existsSync(file)) {
        process.stderr.write(`[v8-suite] missing file: ${file}\n`);
        return 1;
      }
    }
    process.stdout.write(
      `\n======== V8 suite: ${suite.id} (${suite.files.length} files) ========\n` +
        `${suite.title}\n`
    );
    const concurrency = suite.concurrency == null ? 1 : suite.concurrency;
    const result = spawnSync(
      process.execPath,
      ["--test", `--test-concurrency=${concurrency}`, ...files],
      {
        cwd: ROOT,
        env: {
          ...process.env,
          NODE_ENV: process.env.NODE_ENV || "test",
          // Refuse accidental hosted destructive resets in suite runners.
          GETPRO_V8_TEST_GATE: "1",
        },
        stdio: "inherit",
      }
    );
    if (result.status !== 0) {
      exitCode = result.status == null ? 1 : result.status;
      process.stderr.write(`[v8-suite] FAILED: ${suite.id}\n`);
      return exitCode;
    }
    process.stdout.write(`[v8-suite] PASS: ${suite.id}\n`);
  }
  return exitCode;
}

process.exitCode = main(process.argv);
