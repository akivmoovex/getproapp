#!/usr/bin/env node
"use strict";

/**
 * V2.03 Phase A — run exact canonical manifest (no coverage).
 * Detached-friendly: writes TAP + final census to durable paths.
 */

const fs = require("fs");
const path = require("path");
const { run } = require("node:test");
const { spec } = require("node:test/reporters");

const ROOT = path.resolve(__dirname, "..", "..");
const MANIFEST = path.join(ROOT, "docs/qa/manifests/V2_03_CANONICAL_TEST_MANIFEST.txt");
const OUT_DIR = process.env.V203_PHASE_A_OUT || "/tmp/v203-canonical-phase-a";
const LOG_PATH = path.join(OUT_DIR, "full-suite.log");
const SUMMARY_PATH = path.join(OUT_DIR, "summary.json");
const EXIT_PATH = path.join(OUT_DIR, "suite.exit");

function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const lines = fs
    .readFileSync(MANIFEST, "utf8")
    .split(/\n+/)
    .map((l) => l.trim())
    .filter(Boolean);
  const files = lines.map((rel) => path.join(ROOT, rel));
  for (const f of files) {
    if (!fs.existsSync(f)) {
      console.error("MISSING_MANIFEST_FILE", f);
      process.exit(2);
    }
  }

  const logFd = fs.openSync(LOG_PATH, "w");
  const write = (s) => {
    fs.writeSync(logFd, s);
  };

  const startedAt = new Date().toISOString();
  write(`[phase-a] START ${startedAt} files=${files.length} cwd=${ROOT}\n`);
  write(`TAP version 13\n`);

  const counts = {
    tests: 0,
    pass: 0,
    fail: 0,
    skip: 0,
    cancelled: 0,
    todo: 0,
  };
  const t0 = Date.now();

  // Prefer streaming TAP via built-in spec-like tap from run events.
  // Node's run() emits TestEvent objects; use tap reporter when available.
  let stream;
  try {
    // Node 22+: reporters.tap
    const reporters = require("node:test/reporters");
    const tap = reporters.tap || reporters.spec;
    stream = run({
      files,
      concurrency: 1,
      timeout: 0,
    });
    stream.on("test:pass", (d) => {
      counts.pass += 1;
      counts.tests += 1;
      if (d && d.skip) {
        counts.pass -= 1;
        counts.skip += 1;
      }
    });
    stream.on("test:fail", () => {
      counts.fail += 1;
      counts.tests += 1;
    });
    // Pipe human TAP through reporter into log + stdout
    const reporter = typeof reporters.tap === "function" ? new reporters.tap() : new spec();
    stream.compose(reporter).on("data", (chunk) => {
      const text = Buffer.isBuffer(chunk) ? chunk.toString("utf8") : String(chunk);
      write(text);
      process.stdout.write(text);
    });
  } catch (err) {
    write(`[phase-a] FATAL ${err && err.stack ? err.stack : err}\n`);
    fs.writeFileSync(EXIT_PATH, "2\n");
    process.exit(2);
  }

  stream.on("test:diagnostic", (d) => {
    // already in tap stream usually
  });

  // Recalculate from TAP is more reliable — also parse final after close.
  stream.on("finish", () => {
    // finish may fire before all reporters flush; use 'end'
  });

  stream.on("end", () => {
    finalize(0);
  });

  stream.on("error", (err) => {
    write(`[phase-a] STREAM_ERROR ${err && err.message ? err.message : err}\n`);
    finalize(1);
  });

  function finalize(codeHint) {
    // Re-parse log for authoritative # pass/# fail from TAP if present;
    // else use event counters (leaf events may double-count suites depending on node version).
    const text = fs.readFileSync(LOG_PATH, "utf8");
    const pick = (re, fallback) => {
      const all = [...text.matchAll(re)].map((m) => Number(m[1]));
      return all.length ? all[all.length - 1] : fallback;
    };
    // node:test tap reporter emits summary at end as "# pass N" etc. when using CLI;
    // programmatic tap may not — fall back to counters, then leaf parse.
    let pass = pick(/# pass\s+(\d+)/g, null);
    let fail = pick(/# fail\s+(\d+)/g, null);
    let skip = pick(/# (?:skip|skipped)\s+(\d+)/g, null);
    let cancelled = pick(/# cancelled\s+(\d+)/g, null);
    let tests = pick(/# tests\s+(\d+)/g, null);

    if (pass == null || fail == null) {
      // Leaf parse: ok/not ok with type test only is hard; use event counters as best effort
      pass = counts.pass;
      fail = counts.fail;
      skip = counts.skip;
      cancelled = counts.cancelled;
      tests = counts.tests;
    }

    const durationMs = Date.now() - t0;
    const summary = {
      startedAt,
      finishedAt: new Date().toISOString(),
      durationMs,
      testFiles: files.length,
      tests,
      pass,
      fail,
      skip: skip || 0,
      cancelled: cancelled || 0,
      exitCodeHint: codeHint,
      billingFixIncludedInRun: false,
      coverage: false,
      baselineSha: "13f0dac4762b387c6b91260eb8bceebb27cf5076",
      logPath: LOG_PATH,
    };
    fs.writeFileSync(SUMMARY_PATH, JSON.stringify(summary, null, 2));
    write(
      `\n[phase-a] END ${summary.finishedAt} exit_hint=${codeHint} duration_ms=${durationMs} pass=${pass} fail=${fail} skip=${skip || 0} cancelled=${cancelled || 0}\n`
    );
    fs.closeSync(logFd);
    const exitCode = fail > 0 || codeHint ? 1 : 0;
    fs.writeFileSync(EXIT_PATH, `${exitCode}\n`);
    process.exit(exitCode);
  }
}

main();
