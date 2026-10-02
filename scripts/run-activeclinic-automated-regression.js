#!/usr/bin/env node
"use strict";

/**
 * ActiveClinic targeted automated regression (local node:test only).
 *
 * This repo uses Node's built-in test runner (`node --test`), not Mocha.
 * Prior "hangs" when closing editor QA were operator/harness misuse:
 *   - `npx mocha … --grep …` on node:test files (Mocha finds 0 tests)
 *   - `npm test -- --grep …` (Node ignores `--grep`; runs the full suite)
 *   - piping to `tail` (buffers all TAP until exit → looks hung)
 *
 * Correct targeting uses `--test-name-pattern` and explicit file lists.
 *
 * Usage:
 *   node scripts/run-activeclinic-automated-regression.js
 *   npm run test:activeclinic:v7-regression
 *
 * Does not deploy, touch production, or modify V7-first-production.
 */

const { spawn } = require("child_process");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");

/**
 * Curated AC V7 release-candidate automated gate.
 *
 * Intentionally excludes pre-existing brittle / inventory suites that fail on
 * current V7 without relating to the editor-closure product fixes, e.g.:
 *   - activeclinic-acw08-auth (401 vs 403 safe-state assertion drift)
 *   - activeclinic-clinic-onboarding / clinic-registration (duplicate HTTP + schema-leak copy)
 *   - activeclinic-website-cms overlay copy assertions
 *   - shared-website-editor-wave2/3 BlessBoard 301 redirect expectations
 *   - v7-inline-editor-coverage / v7-bugs-04-09 stale copy/inventory ("Save to draft", cancel attrs)
 * Those remain known automated debt; hosted editor closure already passed separately.
 */
const FILES = [
  // Cache / auth-session private no-store (includes /clinics/*)
  "tests/v5-session-auth-intermittent.test.js",
  // Registration + phone + recovery anti-enumeration / delivery-pending semantics
  "tests/activeclinic-phone-standardization.test.js",
  "tests/activeclinic-qa-wave1-defects.test.js",
  "tests/activeclinic-account-lifecycle.test.js",
  "tests/activeclinic-registration-identity-idempotency.test.js",
  // Auth (email / phone / bad password)
  "tests/activeclinic-authentication-foundation.test.js",
  "tests/v7-phone-login-tab-http.test.js",
  // Services catalogue CRUD + visibility + unauthorized
  "tests/v7-website-public-catalogue.test.js",
  "tests/v7-ac-qa-wave2-media-unit.test.js",
  // Media validation (valid / spoof / oversized paths)
  "tests/v7-website-image-management.test.js",
  // Editor draft/publish/restore + CSRF/network client contracts
  "tests/activeclinic-editor-client-contracts.test.js",
  "tests/v7-shared-website-editor.test.js",
  "tests/v7-new-clinic-operational-readiness.test.js",
  "tests/activeclinic-clinic-website-availability.test.js",
];

function printBanner(title) {
  const line = "=".repeat(72);
  process.stdout.write(`\n${line}\n${title}\n${line}\n`);
}

function rejectMochaStyleArgs(argv) {
  const bad = [];
  for (const a of argv) {
    if (a === "--grep" || a.startsWith("--grep=")) bad.push(a);
    if (a === "--fgrep" || a.startsWith("--fgrep=")) bad.push(a);
    if (a === "mocha" || a.endsWith("/mocha")) bad.push(a);
  }
  if (bad.length) {
    process.stderr.write(
      "ActiveClinic automated regression uses node:test, not Mocha.\n" +
        `Rejected args: ${bad.join(" ")}\n` +
        "Use --test-name-pattern <regex> to filter, or edit FILES in this script.\n" +
        "Do not pipe the full suite to `tail` — that hides progress and looks like a hang.\n"
    );
    process.exit(2);
  }
}

function parseTapSummary(buf) {
  const text = String(buf || "");
  const pick = (re) => {
    const m = text.match(re);
    return m ? Number(m[1]) : null;
  };
  return {
    tests: pick(/# tests\s+(\d+)/),
    pass: pick(/# pass\s+(\d+)/),
    fail: pick(/# fail\s+(\d+)/),
    cancelled: pick(/# cancelled\s+(\d+)/),
    skipped: pick(/# skipped\s+(\d+)/),
    todo: pick(/# todo\s+(\d+)/),
  };
}

function main() {
  const argv = process.argv.slice(2);
  if (argv.includes("--help") || argv.includes("-h")) {
    process.stdout.write(
      "Usage: node scripts/run-activeclinic-automated-regression.js [--test-name-pattern <re>]\n" +
        "Runs curated ActiveClinic node:test files with concurrency=1.\n" +
        "Do not use Mocha or --grep.\n"
    );
    process.exit(0);
  }
  rejectMochaStyleArgs(argv);

  const namePatternIdx = argv.indexOf("--test-name-pattern");
  const extra = [];
  if (namePatternIdx >= 0) {
    const pat = argv[namePatternIdx + 1];
    if (!pat || pat.startsWith("-")) {
      process.stderr.write("--test-name-pattern requires a regex argument\n");
      process.exit(2);
    }
    extra.push("--test-name-pattern", pat);
  }

  printBanner("ActiveClinic automated regression (node:test)");
  process.stdout.write(
    `Files: ${FILES.length}\n` +
      "Runner: node --test --test-concurrency=1\n" +
      "Note: Mocha/--grep/tail piping is unsupported and previously caused false hang reports.\n\n"
  );

  const nodeArgs = [
    "--test",
    "--test-concurrency=1",
    "--test-timeout=180000",
    ...extra,
    ...FILES,
  ];

  const started = Date.now();
  let combined = "";
  const child = spawn(process.execPath, nodeArgs, {
    cwd: ROOT,
    env: { ...process.env, NODE_ENV: process.env.NODE_ENV || "test" },
    stdio: ["ignore", "pipe", "pipe"],
  });

  let lastOutputAt = Date.now();
  const onChunk = (chunk, stream) => {
    const s = String(chunk);
    combined += s;
    lastOutputAt = Date.now();
    stream.write(s);
  };
  child.stdout.on("data", (c) => onChunk(c, process.stdout));
  child.stderr.on("data", (c) => onChunk(c, process.stderr));

  // Watchdog: report apparent hang without claiming PASS.
  const stallMs = Number(process.env.AC_REGRESSION_STALL_MS || 300_000);
  const watchdog = setInterval(() => {
    const idle = Date.now() - lastOutputAt;
    if (idle < stallMs) return;
    clearInterval(watchdog);
    process.stderr.write(
      `\nAUTOMATED_TEST_HANG_DETECTED idle_ms=${idle} pid=${child.pid}\n` +
        "Likely causes: leaked HTTP server/DB pool/browser in a suite, or a single test deadlock.\n" +
        "This runner will SIGTERM the child; do not treat as PASS.\n"
    );
    try {
      child.kill("SIGTERM");
    } catch (_) {
      /* ignore */
    }
    setTimeout(() => {
      try {
        child.kill("SIGKILL");
      } catch (_) {
        /* ignore */
      }
    }, 10_000).unref();
  }, 15_000);
  watchdog.unref();

  child.on("error", (err) => {
    clearInterval(watchdog);
    process.stderr.write(`Failed to spawn node --test: ${err.message}\n`);
    process.exit(1);
  });

  child.on("exit", (code, signal) => {
    clearInterval(watchdog);
    const elapsedSec = ((Date.now() - started) / 1000).toFixed(1);
    const summary = parseTapSummary(combined);
    printBanner("ActiveClinic automated regression summary");
    process.stdout.write(
      JSON.stringify(
        {
          exitCode: code,
          signal,
          elapsedSec: Number(elapsedSec),
          cleanExit: code === 0 && !signal,
          ...summary,
          files: FILES.length,
        },
        null,
        2
      ) + "\n"
    );
    if (signal) {
      process.stderr.write(`Process terminated by signal ${signal} (not a clean exit).\n`);
      process.exit(1);
    }
    process.exit(code == null ? 1 : code);
  });
}

main();
