#!/usr/bin/env node
"use strict";

/**
 * Launch the canonical 865-file suite fully detached (survives parent exit).
 * Usage: node scripts/qa/launch-canonical-manifest.js
 */

const fs = require("fs");
const path = require("path");
const { spawn } = require("child_process");

const ROOT = path.resolve(__dirname, "..", "..");
const MANIFEST = path.join(ROOT, "docs/qa/manifests/V2_03_CANONICAL_TEST_MANIFEST.txt");
const OUT_DIR = process.env.V203_PHASE_A_OUT || "/tmp/v203-canonical-phase-a";
const LOG_PATH = path.join(OUT_DIR, "full-suite.log");
const PID_PATH = path.join(OUT_DIR, "suite.pid");
const META_PATH = path.join(OUT_DIR, "run-meta.json");

fs.mkdirSync(OUT_DIR, { recursive: true });

const relFiles = fs
  .readFileSync(MANIFEST, "utf8")
  .split(/\n+/)
  .map((l) => l.trim())
  .filter(Boolean);

if (relFiles.length !== 865) {
  console.error(`EXPECTED_865_GOT_${relFiles.length}`);
  process.exit(2);
}

for (const rel of relFiles) {
  const abs = path.join(ROOT, rel);
  if (!fs.existsSync(abs)) {
    console.error("MISSING", rel);
    process.exit(2);
  }
}

const logFd = fs.openSync(LOG_PATH, "w");
const header =
  `[phase-a] START ${new Date().toISOString()} files=${relFiles.length} ` +
  `cwd=${ROOT} billingFixIncludedInRun=NO coverage=NO\n`;
fs.writeSync(logFd, header);

const args = ["--test", "--test-concurrency=1", ...relFiles.map((r) => path.join(ROOT, r))];
const child = spawn(process.execPath, args, {
  cwd: ROOT,
  env: { ...process.env, NODE_ENV: "test" },
  detached: true,
  stdio: ["ignore", logFd, logFd],
});

fs.writeFileSync(PID_PATH, String(child.pid) + "\n");
fs.writeFileSync(
  META_PATH,
  JSON.stringify(
    {
      startedAt: new Date().toISOString(),
      pid: child.pid,
      baselineSha: "13f0dac4762b387c6b91260eb8bceebb27cf5076",
      manifestSha: "fda6916a001ef8ceaea7fbf5dc0403cf95f2b2f1ac87c9f78e4dba8c858c22f5",
      testFiles: 865,
      billingFixIncludedInRun: false,
      coverage: false,
      logPath: LOG_PATH,
    },
    null,
    2
  )
);

child.unref();
console.log(`LAUNCHED_PID=${child.pid}`);
console.log(`LOG=${LOG_PATH}`);
console.log("BILLING_FIX_INCLUDED_IN_RUN=NO");
process.exit(0);
