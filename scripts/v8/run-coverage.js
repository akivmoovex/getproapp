#!/usr/bin/env node
"use strict";

/**
 * Line/branch coverage for V8-modified shared-platform modules.
 * Target: ≥90% line coverage on COVERAGE_TARGETS. Branch coverage is reported.
 *
 * Usage:
 *   npm run test:v8:coverage
 *   node scripts/v8/run-coverage.js
 */

const { spawnSync } = require("child_process");
const fs = require("fs");
const path = require("path");
const {
  ROOT,
  COVERAGE_TARGETS,
  COVERAGE_LINE_THRESHOLD,
  resolveSuiteFile,
} = require("./suite-manifest");

const COVERAGE_TEST_FILES = Object.freeze([
  "tests/v8-db-compatibility-baseline.test.js",
  "tests/v8-environment-isolation.test.js",
  "tests/v8-migration-contract.test.js",
  "tests/v8-tenant-product-isolation.test.js",
  "tests/v8-shared-module-coverage.test.js",
  "tests/v8-shared-auth-password-security.test.js",
  "tests/v8-shared-verification.test.js",
  "tests/v8-shared-session-security.test.js",
  "tests/deployment-profiles.test.js",
]);

/**
 * Justified exclusions from the 90% line gate (documented; do not expand casually).
 * Coverage still runs on these files when included in targets; exclusions only
 * apply when a target is intentionally deferred.
 */
const JUSTIFIED_EXCLUSIONS = Object.freeze([
  {
    path: "src/platform/http/moovexPlatformRuntimeServer.js",
    reason:
      "Large product-bootstrap + QA admin surface; covered by env-isolation /healthz and hosted smoke, not full line gate yet.",
  },
  {
    path: "src/platform/media/hostingerMediaConfig.js",
    reason:
      "Hostinger filesystem probes require durable roots; unit coverage of write-namespace rules lives in v8-environment-isolation.",
  },
]);

function findC8Bin() {
  const local = path.join(ROOT, "node_modules", ".bin", "c8");
  if (fs.existsSync(local)) return local;
  return null;
}

function parseTextSummary(text) {
  // c8 text reporter ends with an "All files" row.
  const lines = String(text || "").split("\n");
  for (let i = lines.length - 1; i >= 0; i -= 1) {
    if (/\bAll files\b/.test(lines[i])) {
      const parts = lines[i].trim().split("|").map((p) => p.trim());
      // File | % Stmts | % Branch | % Funcs | % Lines | Uncovered
      if (parts.length >= 5) {
        return {
          statements: Number(parts[1]),
          branches: Number(parts[2]),
          functions: Number(parts[3]),
          lines: Number(parts[4]),
        };
      }
    }
  }
  return null;
}

function main() {
  const c8 = findC8Bin();
  if (!c8) {
    process.stderr.write(
      "[v8-coverage] c8 is not installed. Run: npm install --save-dev c8\n"
    );
    return 1;
  }

  const includeArgs = [];
  for (const rel of COVERAGE_TARGETS) {
    includeArgs.push("--include", rel);
  }
  const testFiles = COVERAGE_TEST_FILES.map(resolveSuiteFile);
  for (const file of testFiles) {
    if (!fs.existsSync(file)) {
      process.stderr.write(`[v8-coverage] missing test file: ${file}\n`);
      return 1;
    }
  }

  const reportDir = path.join(ROOT, "coverage", "v8");
  fs.mkdirSync(reportDir, { recursive: true });

  const args = [
    ...includeArgs,
    "--reporter=text",
    "--reporter=text-summary",
    "--reporter=json-summary",
    `--reports-dir=${reportDir}`,
    "--check-coverage",
    `--lines=${COVERAGE_LINE_THRESHOLD}`,
    process.execPath,
    "--test",
    "--test-concurrency=1",
    ...testFiles,
  ];

  process.stdout.write(
    `[v8-coverage] Measuring ${COVERAGE_TARGETS.length} modules; ` +
      `line threshold ${COVERAGE_LINE_THRESHOLD}%\n`
  );
  process.stdout.write(
    `[v8-coverage] Justified exclusions (not in gate): ` +
      `${JUSTIFIED_EXCLUSIONS.map((e) => e.path).join(", ")}\n`
  );

  const result = spawnSync(c8, args, {
    cwd: ROOT,
    env: { ...process.env, NODE_ENV: process.env.NODE_ENV || "test" },
    encoding: "utf8",
  });
  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);

  const summary = parseTextSummary(result.stdout || "");
  if (summary) {
    process.stdout.write(
      `[v8-coverage] lines=${summary.lines}% branches=${summary.branches}% ` +
        `functions=${summary.functions}% statements=${summary.statements}%\n`
    );
  }

  const summaryJsonPath = path.join(reportDir, "coverage-summary.json");
  if (fs.existsSync(summaryJsonPath)) {
    process.stdout.write(`[v8-coverage] wrote ${path.relative(ROOT, summaryJsonPath)}\n`);
  }

  if (result.status !== 0) {
    process.stderr.write("[v8-coverage] FAILED coverage check\n");
    return result.status == null ? 1 : result.status;
  }
  process.stdout.write("[v8-coverage] PASS\n");
  return 0;
}

module.exports = { JUSTIFIED_EXCLUSIONS, COVERAGE_TEST_FILES };

process.exitCode = main();
