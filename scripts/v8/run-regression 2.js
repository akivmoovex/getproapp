#!/usr/bin/env node
"use strict";

/**
 * Single V8 regression command.
 * Runs shared-platform → compatibility → BlessBoard → ActiveClinic suites.
 *
 * Usage:
 *   npm run test:v8:regression
 *   node scripts/v8/run-regression.js
 *   node scripts/v8/run-regression.js --with-coverage
 */

const { spawnSync } = require("child_process");
const path = require("path");
const { ROOT, REGRESSION_SUITE_ORDER } = require("./suite-manifest");

function run(cmd, args, env) {
  process.stdout.write(`\n>>> ${cmd} ${args.join(" ")}\n`);
  const result = spawnSync(cmd, args, {
    cwd: ROOT,
    env: { ...process.env, ...(env || {}) },
    stdio: "inherit",
  });
  return result.status == null ? 1 : result.status;
}

function main(argv) {
  const withCoverage = argv.includes("--with-coverage");
  const started = Date.now();

  const suiteStatus = run(process.execPath, [
    path.join("scripts", "v8", "run-suite.js"),
    ...REGRESSION_SUITE_ORDER,
  ]);
  if (suiteStatus !== 0) {
    process.stderr.write("[v8-regression] suite gate FAILED\n");
    return suiteStatus;
  }

  if (withCoverage) {
    const covStatus = run(process.execPath, [
      path.join("scripts", "v8", "run-coverage.js"),
    ]);
    if (covStatus !== 0) {
      process.stderr.write("[v8-regression] coverage gate FAILED\n");
      return covStatus;
    }
  }

  const secs = ((Date.now() - started) / 1000).toFixed(1);
  process.stdout.write(
    `\n[v8-regression] PASS (${REGRESSION_SUITE_ORDER.join(" → ")}) in ${secs}s` +
      `${withCoverage ? " + coverage" : ""}\n`
  );
  return 0;
}

process.exitCode = main(process.argv.slice(2));
