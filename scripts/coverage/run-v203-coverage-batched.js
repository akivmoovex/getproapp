#!/usr/bin/env node
"use strict";

/**
 * V2.03 Prompt 5 — safer batched coverage orchestration.
 *
 * Fixes the hang/UX failure mode of spawnSync buffering an 855-file monolithic
 * c8 run (~41 min silent). Design from V203_COVERAGE_HANG_DIAGNOSED_READY_FOR_BATCHED_RUN:
 *
 *   - deterministic sorted manifest
 *   - ~75 files / batch
 *   - streamed TAP progress
 *   - checkpoint / resume
 *   - identical .c8rc + include every batch
 *   - shared V8 temp accumulation
 *   - --clean only on first batch; --clean=false thereafter
 *   - final `c8 report --merge-async`
 *
 * Does NOT merge incompatible product-scoped coverage-final.json files.
 * Product metrics are derived by path-filtering the single overall report.
 *
 * Usage:
 *   node scripts/coverage/run-v203-coverage-batched.js
 *   node scripts/coverage/run-v203-coverage-batched.js --resume
 *   node scripts/coverage/run-v203-coverage-batched.js --batch-size=75
 *   npm run test:coverage:batched
 */

const { spawn } = require("child_process");
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..", "..");
const C8_CONFIG = path.join(ROOT, ".c8rc.json");
const REPORTS_DIR = path.join(ROOT, "coverage", "v203");
const TEMP_DIR = path.join(REPORTS_DIR, "tmp");
const BATCH_DIR = path.join(REPORTS_DIR, "batches");
const MANIFEST_PATH = path.join(BATCH_DIR, "manifest.txt");
const PROGRESS_PATH = path.join(BATCH_DIR, "progress.json");
const RUN_LOG_PATH = path.join(BATCH_DIR, "run.log");
const BATCH_VALIDATION_PATH = path.join(BATCH_DIR, "batch-validation.json");
/** Authoritative V2.03 green-suite SoT (865 files). */
const CANONICAL_MANIFEST = path.join(
  ROOT,
  "docs/qa/manifests/V2_03_CANONICAL_TEST_MANIFEST.txt"
);
const COVERAGE_INPUT_FINGERPRINT = path.join(
  ROOT,
  "docs/qa/manifests/V2_03_COVERAGE_INPUT_FINGERPRINT.json"
);

const OVERALL_INCLUDE = Object.freeze([
  "src/**",
  "server.js",
  "server.legacy.js",
  "index.js",
]);

/** Path prefixes (posix) for product slices of the overall report — not separate merges. */
const PRODUCT_SLICES = Object.freeze({
  PLATFORM: [
    "src/platform/",
    "src/db/",
    "src/phone/",
    "src/http/",
    "src/middleware/",
    "src/lib/",
    "src/config/",
    "server.js",
    "index.js",
  ],
  BLESSBOARD: ["src/blessboard/", "src/church/"],
  ACTIVECLINIC: ["src/activeclinic/"],
});

const DEFAULT_BATCH_SIZE = 75;
const DEFAULT_STALL_MS = 10 * 60 * 1000;
const DEFAULT_BATCH_WALL_MS = 25 * 60 * 1000;

function findC8Bin() {
  const local = path.join(ROOT, "node_modules", ".bin", "c8");
  return fs.existsSync(local) ? local : null;
}

function expandTestGlob() {
  if (typeof fs.globSync === "function") {
    return fs
      .globSync("tests/**/*.test.js", { cwd: ROOT })
      .map((f) => String(f).split(path.sep).join("/"))
      .sort();
  }
  const out = [];
  function walk(dir) {
    for (const name of fs.readdirSync(dir)) {
      const abs = path.join(dir, name);
      const st = fs.statSync(abs);
      if (st.isDirectory()) walk(abs);
      else if (name.endsWith(".test.js")) {
        out.push(path.relative(ROOT, abs).split(path.sep).join("/"));
      }
    }
  }
  walk(path.join(ROOT, "tests"));
  return out.sort();
}

function sha256Text(text) {
  return crypto.createHash("sha256").update(text).digest("hex");
}

function sha256File(absPath) {
  return crypto.createHash("sha256").update(fs.readFileSync(absPath)).digest("hex");
}

function wantCoverageFingerprintPath(rel) {
  const fingerprintRel = "docs/qa/manifests/V2_03_COVERAGE_INPUT_FINGERPRINT.json";
  if (rel === fingerprintRel) return false;
  if (rel.startsWith("tests/__screenshots__/") || rel.startsWith("tests/__image_snapshots__/")) {
    return false;
  }
  if (rel.startsWith("src/") || rel.startsWith("tests/")) return true;
  if (
    rel === "server.js" ||
    rel === "index.js" ||
    rel === ".c8rc.json" ||
    rel === "docs/qa/manifests/V2_03_CANONICAL_TEST_MANIFEST.txt"
  ) {
    return true;
  }
  return false;
}

/** Working-tree fingerprint matching docs/qa/manifests/V2_03_COVERAGE_INPUT_FINGERPRINT.json */
function computeCoverageTreeFingerprint() {
  const { execFileSync } = require("child_process");
  const rows = new Map();
  const tracked = execFileSync("git", ["ls-files", "-z"], { cwd: ROOT })
    .toString("utf8")
    .split("\0")
    .filter(Boolean);
  for (const rel of tracked) {
    if (!wantCoverageFingerprintPath(rel)) continue;
    const abs = path.join(ROOT, rel);
    if (!fs.existsSync(abs) || !fs.statSync(abs).isFile()) continue;
    rows.set(rel, `${rel}:${sha256File(abs)}`);
  }
  const porcelain = execFileSync("git", ["status", "--porcelain"], { cwd: ROOT }).toString("utf8");
  for (const line of porcelain.split(/\r?\n/)) {
    if (!line.startsWith("?? ")) continue;
    const rel = line.slice(3);
    if (!wantCoverageFingerprintPath(rel)) continue;
    const abs = path.join(ROOT, rel);
    if (!fs.existsSync(abs) || !fs.statSync(abs).isFile()) continue;
    rows.set(rel, `${rel}:${sha256File(abs)}`);
  }
  const ordered = [...rows.values()].sort();
  return {
    treeFingerprint: sha256Text(`${ordered.join("\n")}`),
    treeFileCount: ordered.length,
  };
}

function assertCoverageInputFingerprint() {
  if (!fs.existsSync(COVERAGE_INPUT_FINGERPRINT)) {
    throw new Error(
      `MISSING_COVERAGE_INPUT_FINGERPRINT ${COVERAGE_INPUT_FINGERPRINT} — re-freeze green state first`
    );
  }
  const frozen = JSON.parse(fs.readFileSync(COVERAGE_INPUT_FINGERPRINT, "utf8"));
  const { execFileSync } = require("child_process");
  const head = execFileSync("git", ["rev-parse", "HEAD"], { cwd: ROOT }).toString("utf8").trim();
  const manifestSha = sha256File(CANONICAL_MANIFEST);
  const { treeFingerprint, treeFileCount } = computeCoverageTreeFingerprint();
  const mismatches = [];
  if (frozen.COVERAGE_MANIFEST_SHA !== manifestSha) {
    mismatches.push(`MANIFEST ${manifestSha} != frozen ${frozen.COVERAGE_MANIFEST_SHA}`);
  }
  if (frozen.TREE_FINGERPRINT !== treeFingerprint) {
    mismatches.push(
      `TREE ${treeFingerprint} != frozen ${frozen.TREE_FINGERPRINT} (files=${treeFileCount})`
    );
  }
  if (mismatches.length) {
    const err = new Error(
      `COVERAGE_INPUT_FINGERPRINT_MISMATCH\n${mismatches.join("\n")}\n` +
        `Re-run post-billing green freeze before coverage.`
    );
    err.code = "COVERAGE_INPUT_FINGERPRINT_MISMATCH";
    throw err;
  }
  if (frozen.COVERAGE_INPUT_SHA !== head) {
    process.stderr.write(
      `[v203-batched] WARN coverage HEAD drifted (${head.slice(0, 12)} vs frozen ` +
        `${String(frozen.COVERAGE_INPUT_SHA).slice(0, 12)}) but TREE+MANIFEST match — continuing\n`
    );
  }
  return {
    head,
    manifestSha,
    treeFingerprint,
    frozenMarker: frozen.GREEN_GATE_MARKER || null,
  };
}

function chunk(arr, size) {
  const batches = [];
  for (let i = 0; i < arr.length; i += size) {
    batches.push(arr.slice(i, i + size));
  }
  return batches;
}

function parseArgs(argv) {
  const opts = {
    resume: false,
    batchSize: DEFAULT_BATCH_SIZE,
    stallMs: DEFAULT_STALL_MS,
    batchWallMs: DEFAULT_BATCH_WALL_MS,
    reportOnly: false,
    /** Abort authoritative baseline if any batch reports FAIL≠0. */
    requireGreen: true,
    /** Prefer canonical 865-file manifest (default). Use --glob-manifest for legacy glob. */
    useCanonicalManifest: true,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === "--resume") opts.resume = true;
    else if (a === "--report-only") opts.reportOnly = true;
    else if (a === "--allow-fail") opts.requireGreen = false;
    else if (a === "--glob-manifest") opts.useCanonicalManifest = false;
    else if (a === "--canonical-manifest") opts.useCanonicalManifest = true;
    else if (a.startsWith("--batch-size=")) {
      opts.batchSize = Math.max(1, Number(a.slice("--batch-size=".length)) || DEFAULT_BATCH_SIZE);
    } else if (a === "--batch-size") {
      opts.batchSize = Math.max(1, Number(argv[++i]) || DEFAULT_BATCH_SIZE);
    } else if (a.startsWith("--stall-ms=")) {
      opts.stallMs = Math.max(60_000, Number(a.slice("--stall-ms=".length)) || DEFAULT_STALL_MS);
    } else if (a.startsWith("--batch-wall-ms=")) {
      opts.batchWallMs =
        Math.max(60_000, Number(a.slice("--batch-wall-ms=".length)) || DEFAULT_BATCH_WALL_MS);
    }
  }
  return opts;
}

function readCanonicalManifestFiles() {
  if (!fs.existsSync(CANONICAL_MANIFEST)) {
    throw new Error(`MISSING_CANONICAL_MANIFEST ${CANONICAL_MANIFEST}`);
  }
  const files = fs
    .readFileSync(CANONICAL_MANIFEST, "utf8")
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  if (files.length !== 865) {
    throw new Error(`EXPECTED_865_GOT_${files.length}`);
  }
  for (const rel of files) {
    if (!fs.existsSync(path.join(ROOT, rel))) {
      throw new Error(`MISSING_TEST_FILE ${rel}`);
    }
  }
  return files;
}

function emptyCounts() {
  return { pass: 0, fail: 0, skip: 0, todo: 0, cancelled: 0, tests: 0 };
}

function parseTapTrailer(text) {
  const counts = emptyCounts();
  const m = (re) => {
    const hit = text.match(re);
    return hit ? Number(hit[1]) : null;
  };
  const pass = m(/#\s*pass\s+(\d+)/i);
  const fail = m(/#\s*fail\s+(\d+)/i);
  const skip = m(/#\s*skipped\s+(\d+)/i);
  const todo = m(/#\s*todo\s+(\d+)/i);
  const cancelled = m(/#\s*cancelled\s+(\d+)/i);
  const tests = m(/#\s*tests\s+(\d+)/i);
  if (pass != null) counts.pass = pass;
  if (fail != null) counts.fail = fail;
  if (skip != null) counts.skip = skip;
  if (todo != null) counts.todo = todo;
  if (cancelled != null) counts.cancelled = cancelled;
  if (tests != null) counts.tests = tests;
  return counts;
}

function addCounts(acc, next) {
  for (const k of Object.keys(acc)) acc[k] += next[k] || 0;
}

function writeJson(file, obj) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(obj, null, 2) + "\n");
}

function logLine(msg) {
  const line = `[v203-batched] ${msg}\n`;
  process.stdout.write(line);
  fs.appendFileSync(RUN_LOG_PATH, line);
}

function includeArgs() {
  const out = [];
  for (const inc of OVERALL_INCLUDE) out.push("--include", inc);
  return out;
}

function runSpawn(cmd, args, { logFile, stallMs, wallMs, label }) {
  return new Promise((resolve) => {
    const started = Date.now();
    let lastProgressAt = Date.now();
    let killed = null;
    // Keep only a trailing window for TAP trailer parsing (avoid multi‑MB RAM growth).
    let tail = "";
    const TAIL_MAX = 256 * 1024;

    const child = spawn(cmd, args, {
      cwd: ROOT,
      env: {
        ...process.env,
        NODE_ENV: process.env.NODE_ENV || "test",
      },
      stdio: ["ignore", "pipe", "pipe"],
      // New process group so stall/wall can SIGKILL the whole c8→node tree.
      detached: true,
    });

    const logStream = fs.createWriteStream(logFile, { flags: "a" });
    const onChunk = (chunk, isErr) => {
      const text = chunk.toString("utf8");
      if (isErr) process.stderr.write(text);
      else process.stdout.write(text);
      logStream.write(text);
      tail = (tail + text).slice(-TAIL_MAX);
      if (
        /#\s*Subtest|^(ok|not ok)\s+\d+|^\s*#\s*pass\s+\d+|duration_ms/m.test(text)
      ) {
        lastProgressAt = Date.now();
      }
    };
    child.stdout.on("data", (c) => onChunk(c, false));
    child.stderr.on("data", (c) => onChunk(c, true));

    function killTree(reason) {
      if (killed) return;
      killed = reason;
      logLine(`${label} ${reason.toUpperCase()} — killing process group`);
      try {
        process.kill(-child.pid, "SIGKILL");
      } catch {
        try {
          child.kill("SIGKILL");
        } catch {
          /* ignore */
        }
      }
    }

    const timer = setInterval(() => {
      const now = Date.now();
      if (now - lastProgressAt > stallMs) killTree("stall");
      else if (now - started > wallMs) killTree("wall");
    }, 5000);

    child.on("close", (code, signal) => {
      clearInterval(timer);
      logStream.end();
      resolve({
        code: code == null ? 1 : code,
        signal,
        killed,
        durationMs: Date.now() - started,
        stdout: tail,
        stderr: "",
        counts: parseTapTrailer(tail),
      });
    });
  });
}

function buildManifest(batchSize, { useCanonicalManifest = true } = {}) {
  const files = useCanonicalManifest ? readCanonicalManifestFiles() : expandTestGlob();
  const body = files.join("\n") + (files.length ? "\n" : "");
  const sha = sha256Text(body);
  const canonicalSourceSha = useCanonicalManifest
    ? sha256Text(fs.readFileSync(CANONICAL_MANIFEST))
    : null;
  fs.mkdirSync(BATCH_DIR, { recursive: true });
  fs.writeFileSync(MANIFEST_PATH, body);
  const batches = chunk(files, batchSize).map((filesInBatch, idx) => ({
    id: String(idx).padStart(3, "0"),
    index: idx,
    files: filesInBatch,
  }));
  return {
    files,
    sha,
    batches,
    source: useCanonicalManifest ? "canonical-865" : "glob-tests",
    canonicalSourceSha,
  };
}

function countV8Artifacts() {
  try {
    return fs.readdirSync(TEMP_DIR).filter((n) => n.endsWith(".json")).length;
  } catch {
    return 0;
  }
}

function loadProgress() {
  if (!fs.existsSync(PROGRESS_PATH)) return null;
  try {
    return JSON.parse(fs.readFileSync(PROGRESS_PATH, "utf8"));
  } catch {
    return null;
  }
}

async function runBatch(c8, batch, { clean, stallMs, batchWallMs }) {
  const batchLog = path.join(BATCH_DIR, `batch-${batch.id}.log`);
  fs.writeFileSync(batchLog, "");
  const cleanArg = clean ? "--clean" : "--clean=false";
  // Per-batch: accumulate V8 only; throwaway reports-dir avoids clobbering final.
  const batchReports = path.join(BATCH_DIR, `reports-${batch.id}`);
  fs.mkdirSync(batchReports, { recursive: true });

  const args = [
    "--config",
    C8_CONFIG,
    ...includeArgs(),
    "--temp-directory",
    TEMP_DIR,
    cleanArg,
    "--reporter=none",
    `--reports-dir=${batchReports}`,
    process.execPath,
    "--test",
    "--test-concurrency=1",
    ...batch.files.map((f) => path.join(ROOT, f)),
  ];

  logLine(
    `batch ${batch.id} start files=${batch.files.length} clean=${Boolean(clean)} first=${batch.files[0]}`
  );

  const result = await runSpawn(c8, args, {
    logFile: batchLog,
    stallMs,
    wallMs: batchWallMs,
    label: `batch-${batch.id}`,
  });

  logLine(
    `batch ${batch.id} done exit=${result.code} killed=${result.killed || "no"} ` +
      `pass=${result.counts.pass} fail=${result.counts.fail} skip=${result.counts.skip} ` +
      `ms=${result.durationMs}`
  );
  return result;
}

async function finalReport(c8) {
  const args = [
    "report",
    "--config",
    C8_CONFIG,
    ...includeArgs(),
    "--temp-directory",
    TEMP_DIR,
    `--reports-dir=${REPORTS_DIR}`,
    "--reporter=text",
    "--reporter=text-summary",
    "--reporter=json",
    "--reporter=json-summary",
    "--reporter=lcov",
    "--reporter=html",
    "--merge-async",
  ];
  logLine("final c8 report --merge-async …");
  const reportLog = path.join(BATCH_DIR, "final-report.log");
  fs.writeFileSync(reportLog, "");
  const result = await runSpawn(c8, args, {
    logFile: reportLog,
    stallMs: 15 * 60 * 1000,
    wallMs: 30 * 60 * 1000,
    label: "final-report",
  });
  return result;
}

function relFromCoverageKey(key) {
  const norm = String(key).split(path.sep).join("/");
  const marker = ROOT.split(path.sep).join("/") + "/";
  if (norm.startsWith(marker)) return norm.slice(marker.length);
  // Sometimes absolute without trailing consistency
  const idx = norm.lastIndexOf("/src/");
  if (idx >= 0) return norm.slice(idx + 1);
  if (norm.endsWith("/server.js")) return "server.js";
  if (norm.endsWith("/server.legacy.js")) return "server.legacy.js";
  if (norm.endsWith("/index.js") && !norm.includes("/src/")) return "index.js";
  return norm;
}

function matchesSlice(rel, prefixes) {
  const r = rel.replace(/^\.\//, "");
  return prefixes.some((p) => {
    if (p.endsWith("/")) return r.startsWith(p);
    return r === p;
  });
}

function aggregateFromSummary(summary, prefixes) {
  const acc = {
    statements: { total: 0, covered: 0 },
    branches: { total: 0, covered: 0 },
    functions: { total: 0, covered: 0 },
    lines: { total: 0, covered: 0 },
  };
  for (const [key, entry] of Object.entries(summary || {})) {
    if (key === "total" || !entry || typeof entry !== "object") continue;
    const rel = relFromCoverageKey(key);
    if (prefixes && !matchesSlice(rel, prefixes)) continue;
    for (const metric of ["statements", "branches", "functions", "lines"]) {
      const m = entry[metric] || {};
      acc[metric].total += Number(m.total) || 0;
      acc[metric].covered += Number(m.covered) || 0;
    }
  }
  const out = {};
  for (const metric of Object.keys(acc)) {
    const t = acc[metric].total;
    const c = acc[metric].covered;
    out[metric] = {
      total: t,
      covered: c,
      pct: t === 0 ? 100 : Math.round((10000 * c) / t) / 100,
    };
  }
  return out;
}

function highRiskFromSummary(summary) {
  const HIGH_RISK_PATTERNS = [
    /auth/i,
    /session/i,
    /rbac/i,
    /permission/i,
    /authoriz/i,
    /tenant.?isolat/i,
    /isolation/i,
    /registrat/i,
    /verif(y|ication)/i,
    /publish/i,
    /publication/i,
    /cms/i,
    /media/i,
    /clinical/i,
    /patient/i,
    /billing/i,
    /cashier/i,
    /migrat/i,
    /bootstrap/i,
    /admin/i,
    /provision/i,
    /entitlement/i,
  ];
  let uncoveredLines = 0;
  let totalLines = 0;
  let uncoveredBranches = 0;
  let totalBranches = 0;
  const files = [];
  for (const [key, entry] of Object.entries(summary || {})) {
    if (key === "total" || !entry || typeof entry !== "object") continue;
    const rel = relFromCoverageKey(key);
    if (!HIGH_RISK_PATTERNS.some((re) => re.test(rel))) continue;
    const lines = entry.lines || {};
    const branches = entry.branches || {};
    const lt = Number(lines.total) || 0;
    const lc = Number(lines.covered) || 0;
    const bt = Number(branches.total) || 0;
    const bc = Number(branches.covered) || 0;
    totalLines += lt;
    uncoveredLines += Math.max(0, lt - lc);
    totalBranches += bt;
    uncoveredBranches += Math.max(0, bt - bc);
    files.push({
      file: rel,
      linesPct: typeof lines.pct === "number" ? lines.pct : lt ? (100 * lc) / lt : 100,
      branchesPct:
        typeof branches.pct === "number" ? branches.pct : bt ? (100 * bc) / bt : 100,
      uncoveredLines: Math.max(0, lt - lc),
      uncoveredBranches: Math.max(0, bt - bc),
    });
  }
  files.sort(
    (a, b) =>
      b.uncoveredLines + b.uncoveredBranches - (a.uncoveredLines + a.uncoveredBranches)
  );
  return {
    HIGH_RISK_LINES: uncoveredLines,
    HIGH_RISK_BRANCHES: uncoveredBranches,
    highRiskLineTotal: totalLines,
    highRiskBranchTotal: totalBranches,
    topFiles: files.slice(0, 40),
  };
}

function rankedGapsFromSummary(summary, limit = 80) {
  const rows = [];
  for (const [key, entry] of Object.entries(summary)) {
    if (key === "total" || !entry || typeof entry !== "object") continue;
    const rel = relFromCoverageKey(key);
    const lines = entry.lines || {};
    const branches = entry.branches || {};
    const functions = entry.functions || {};
    const statements = entry.statements || {};
    const linePct = typeof lines.pct === "number" ? lines.pct : 0;
    const branchPct = typeof branches.pct === "number" ? branches.pct : 0;
    const gap =
      (100 - linePct) * (Number(lines.total) || 0) +
      (100 - branchPct) * (Number(branches.total) || 0) * 0.5;
    rows.push({
      file: rel,
      statements: statements.pct,
      branches: branchPct,
      functions: functions.pct,
      lines: linePct,
      uncoveredLines: Math.max(0, (Number(lines.total) || 0) - (Number(lines.covered) || 0)),
      uncoveredBranches: Math.max(
        0,
        (Number(branches.total) || 0) - (Number(branches.covered) || 0)
      ),
      gapScore: gap,
    });
  }
  rows.sort((a, b) => b.gapScore - a.gapScore);
  return rows.filter((r) => r.lines < 90 || r.branches < 90).slice(0, limit);
}

async function main(argv) {
  const opts = parseArgs(argv);
  const c8 = findC8Bin();
  if (!c8) {
    process.stderr.write("[v203-batched] c8 missing — install devDependency c8\n");
    return 1;
  }
  if (!fs.existsSync(C8_CONFIG)) {
    process.stderr.write("[v203-batched] .c8rc.json missing\n");
    return 1;
  }

  if (!opts.reportOnly) {
    try {
      const fp = assertCoverageInputFingerprint();
      process.stdout.write(
        `[v203-batched] coverage input fingerprint OK head=${fp.head.slice(0, 12)} ` +
          `tree=${fp.treeFingerprint.slice(0, 12)} marker=${fp.frozenMarker || "n/a"}\n`
      );
    } catch (err) {
      process.stderr.write(`[v203-batched] ${err && err.message ? err.message : err}\n`);
      return 2;
    }
  }

  fs.mkdirSync(BATCH_DIR, { recursive: true });
  fs.mkdirSync(REPORTS_DIR, { recursive: true });
  fs.mkdirSync(TEMP_DIR, { recursive: true });
  if (!opts.resume && !opts.reportOnly) {
    fs.writeFileSync(RUN_LOG_PATH, "");
  }

  const started = Date.now();
  const { files, sha, batches, source, canonicalSourceSha } = buildManifest(
    opts.batchSize,
    { useCanonicalManifest: opts.useCanonicalManifest }
  );
  logLine(
    `manifest source=${source} files=${files.length} batchSize=${opts.batchSize} ` +
      `batches=${batches.length} sha=${sha.slice(0, 12)} ` +
      `canonicalSourceSha=${canonicalSourceSha ? canonicalSourceSha.slice(0, 12) : "n/a"}`
  );

  let progress = {
    version: 1,
    provider: "c8",
    runner: "node --test (batched)",
    manifestSource: source,
    manifestSha: sha,
    canonicalSourceSha,
    batchSize: opts.batchSize,
    totalFiles: files.length,
    totalBatches: batches.length,
    include: OVERALL_INCLUDE.slice(),
    tempDirectory: path.relative(ROOT, TEMP_DIR),
    reportsDir: path.relative(ROOT, REPORTS_DIR),
    completedBatchIds: [],
    failedBatches: [],
    hungBatches: [],
    batchValidation: [],
    requireGreen: opts.requireGreen,
    greenSuitePreserved: true,
    currentBatch: null,
    status: "running",
    counts: emptyCounts(),
    startedAt: new Date().toISOString(),
  };

  if (opts.resume) {
    const prev = loadProgress();
    if (prev && prev.manifestSha === sha) {
      progress = {
        ...prev,
        status: "running",
        requireGreen: opts.requireGreen,
        batchValidation: Array.isArray(prev.batchValidation) ? prev.batchValidation : [],
      };
      logLine(
        `resume completed=${progress.completedBatchIds.length}/${batches.length}`
      );
    } else if (prev) {
      logLine("resume refused — manifest SHA mismatch; starting fresh");
      progress.startedAt = new Date().toISOString();
    }
  }

  if (!opts.reportOnly) {
    let executedInThisProcess = 0;
    for (const batch of batches) {
      if (progress.completedBatchIds.includes(batch.id)) continue;

      try {
        assertCoverageInputFingerprint();
      } catch (err) {
        progress.status = "aborted_source_drift";
        progress.sourceDrift = true;
        progress.finishedAt = new Date().toISOString();
        writeJson(PROGRESS_PATH, progress);
        writeJson(BATCH_VALIDATION_PATH, {
          batches: progress.batchValidation || [],
          aborted: true,
          reason: "SOURCE_DRIFT",
          detail: String(err && err.message ? err.message : err),
        });
        logLine(`ABORT SOURCE_DRIFT before batch ${batch.id}: ${err.message}`);
        return 2;
      }

      // --clean only for the first batch of a fresh run (never on resume mid-flight).
      const useClean =
        !opts.resume &&
        progress.completedBatchIds.length === 0 &&
        executedInThisProcess === 0 &&
        batch.index === 0;

      progress.currentBatch = batch.id;
      writeJson(PROGRESS_PATH, progress);
      const v8Before = countV8Artifacts();

      const result = await runBatch(c8, batch, {
        clean: useClean,
        stallMs: opts.stallMs,
        batchWallMs: opts.batchWallMs,
      });
      executedInThisProcess += 1;
      const v8After = countV8Artifacts();

      addCounts(progress.counts, result.counts);
      const batchFail = Number(result.counts.fail) || 0;
      const batchCancelled = Number(result.counts.cancelled) || 0;
      const validation = {
        BATCH_ID: batch.id,
        FILES: batch.files.length,
        PASS: result.counts.pass,
        FAIL: batchFail,
        SKIP: result.counts.skip,
        CANCELLED: batchCancelled,
        EXIT_CODE: result.code,
        V8_ARTIFACTS: Math.max(0, v8After - (useClean ? 0 : v8Before)),
        V8_ARTIFACTS_TOTAL: v8After,
        DURATION: result.durationMs,
        MERGED: "PENDING",
        KILLED: result.killed || null,
        FINGERPRINT_OK: true,
        FIRST: batch.files[0],
        LAST: batch.files[batch.files.length - 1],
      };
      progress.batchValidation = (progress.batchValidation || []).filter(
        (b) => b.BATCH_ID !== batch.id
      );
      progress.batchValidation.push(validation);
      writeJson(BATCH_VALIDATION_PATH, {
        updatedAt: new Date().toISOString(),
        batches: progress.batchValidation,
      });

      if (result.killed) {
        progress.hungBatches.push({
          id: batch.id,
          reason: result.killed,
          lastFiles: batch.files.slice(-3),
        });
        progress.greenSuitePreserved = false;
      }
      if (result.code !== 0 && !result.killed) {
        progress.failedBatches.push({ id: batch.id, code: result.code });
      }
      if (batchFail > 0 || batchCancelled > 0 || result.killed) {
        progress.greenSuitePreserved = false;
      }

      // Checkpoint even on test failures so resume skips finished batches.
      // Hung batches are also marked complete so the rest of the suite can finish
      // unless --require-green (default) aborts the authoritative baseline.
      progress.completedBatchIds.push(batch.id);
      progress.currentBatch = null;
      writeJson(PROGRESS_PATH, progress);

      if (opts.requireGreen && (batchFail > 0 || batchCancelled > 0 || result.killed)) {
        progress.status = "blocked_green_suite";
        progress.blockedReason =
          batchFail > 0
            ? `BATCH_${batch.id}_FAIL=${batchFail}`
            : batchCancelled > 0
              ? `BATCH_${batch.id}_CANCELLED=${batchCancelled}`
              : `BATCH_${batch.id}_KILLED=${result.killed}`;
        progress.finishedAt = new Date().toISOString();
        writeJson(PROGRESS_PATH, progress);
        logLine(
          `BLOCKED green-suite coverage: ${progress.blockedReason} — not emitting authoritative baseline`
        );
        return 2;
      }
    }
  }

  const reportResult = await finalReport(c8);
  // Mark all completed batches as merged into the shared temp → final report.
  if (Array.isArray(progress.batchValidation)) {
    for (const row of progress.batchValidation) {
      row.MERGED = reportResult.code === 0 ? "YES" : "NO";
    }
    writeJson(BATCH_VALIDATION_PATH, {
      updatedAt: new Date().toISOString(),
      allBatchesMerged: reportResult.code === 0,
      batches: progress.batchValidation,
    });
  }

  // Normalize artifact names expected by Phase D gate.
  const jsonFinal = path.join(REPORTS_DIR, "coverage-final.json");
  const jsonAlt = path.join(REPORTS_DIR, "coverage.json");
  if (!fs.existsSync(jsonFinal) && fs.existsSync(jsonAlt)) {
    fs.copyFileSync(jsonAlt, jsonFinal);
  }
  const summaryPath = path.join(REPORTS_DIR, "coverage-summary.json");
  let summary = null;
  if (fs.existsSync(summaryPath)) {
    summary = JSON.parse(fs.readFileSync(summaryPath, "utf8"));
  }

  const overall =
    summary && summary.total
      ? {
          statements: summary.total.statements,
          branches: summary.total.branches,
          functions: summary.total.functions,
          lines: summary.total.lines,
        }
      : null;

  const products = {};
  if (summary) {
    for (const [name, prefixes] of Object.entries(PRODUCT_SLICES)) {
      products[name] = aggregateFromSummary(summary, prefixes);
    }
  }

  const highRisk = summary
    ? highRiskFromSummary(summary)
    : { HIGH_RISK_LINES: null, HIGH_RISK_BRANCHES: null, topFiles: [] };

  const rankedGaps = summary ? rankedGapsFromSummary(summary, 100) : [];

  progress.status = "complete";
  progress.finishedAt = new Date().toISOString();
  progress.durationMs = Date.now() - started;
  progress.reportExitCode = reportResult.code;
  progress.totals = overall;
  progress.products = products;
  progress.highRisk = {
    HIGH_RISK_LINES: highRisk.HIGH_RISK_LINES,
    HIGH_RISK_BRANCHES: highRisk.HIGH_RISK_BRANCHES,
  };
  progress.testCounts = progress.counts;
  writeJson(PROGRESS_PATH, progress);

  const meta = {
    provider: "c8",
    runner: "node --test (batched)",
    scope: "all",
    orchestration: "batched-shared-temp",
    batchSize: opts.batchSize,
    totalBatches: batches.length,
    completedBatches: progress.completedBatchIds.length,
    manifestSha: sha,
    testFileCount: files.length,
    include: OVERALL_INCLUDE.slice(),
    reportsDir: path.relative(ROOT, REPORTS_DIR),
    tempDirectory: path.relative(ROOT, TEMP_DIR),
    durationMs: progress.durationMs,
    testExitCode: progress.failedBatches.length || progress.counts.fail ? 1 : 0,
    TEST_PASS: progress.counts.pass,
    TEST_FAIL: progress.counts.fail,
    TEST_SKIP: progress.counts.skip,
    totals: overall,
    products,
    highRisk: {
      HIGH_RISK_LINES: highRisk.HIGH_RISK_LINES,
      HIGH_RISK_BRANCHES: highRisk.HIGH_RISK_BRANCHES,
    },
    note:
      "Product metrics are path slices of the single overall report — not merged from separate product runs.",
  };
  writeJson(path.join(REPORTS_DIR, "v203-coverage-meta.json"), meta);
  writeJson(path.join(REPORTS_DIR, "v203-ranked-gaps.json"), {
    generatedAt: new Date().toISOString(),
    rankedGaps,
    highRiskTopFiles: highRisk.topFiles || [],
  });

  logLine(
    `DONE pass=${meta.TEST_PASS} fail=${meta.TEST_FAIL} skip=${meta.TEST_SKIP} ` +
      `lines=${overall && overall.lines && overall.lines.pct}% ` +
      `stmts=${overall && overall.statements && overall.statements.pct}% ` +
      `fns=${overall && overall.functions && overall.functions.pct}% ` +
      `br=${overall && overall.branches && overall.branches.pct}%`
  );
  logLine(`meta=${path.relative(ROOT, path.join(REPORTS_DIR, "v203-coverage-meta.json"))}`);

  if (!overall) {
    process.stderr.write("[v203-batched] FAILED — no coverage totals\n");
    return 1;
  }
  return 0;
}

module.exports = {
  ROOT,
  OVERALL_INCLUDE,
  PRODUCT_SLICES,
  expandTestGlob,
  aggregateFromSummary,
  highRiskFromSummary,
};

if (require.main === module) {
  main(process.argv.slice(2))
    .then((code) => {
      process.exitCode = code;
    })
    .catch((err) => {
      process.stderr.write(`[v203-batched] ${err && err.stack ? err.stack : err}\n`);
      process.exitCode = 1;
    });
}
