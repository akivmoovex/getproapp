#!/usr/bin/env node
"use strict";

/**
 * V2.03 QA04 — Coverage gap analyzer.
 *
 * Reads machine-readable c8 output from QA03 (`coverage-summary.json`) and
 * produces diagnostic gap reports. Does not modify application source or tests.
 * Thresholds are diagnostic only — not release gates.
 *
 * Usage:
 *   npm run test:coverage:analyze
 *   node scripts/analyze-test-coverage.js
 *   node scripts/analyze-test-coverage.js --input coverage/v203-critical
 */

const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");

const THRESHOLDS = Object.freeze({
  lines: 70,
  functions: 70,
  branches: 60,
});

const LARGE_FILE_LINES = 200;
const WEAK_LARGE_LINES_PCT = 50;

/** Preferred QA03 report directories (first existing wins). */
const DEFAULT_INPUT_CANDIDATES = Object.freeze([
  "coverage/v203-critical",
  "coverage/v203",
  "coverage/v203-platform",
  "coverage/v203-blessboard",
  "coverage/v203-activeclinic",
  "coverage/v8",
]);

const HIGH_RISK_PATTERNS = Object.freeze([
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
]);

const MEDIUM_RISK_PATTERNS = Object.freeze([
  /repositor/i,
  /settings/i,
  /editor/i,
  /website/i,
  /public/i,
  /api/i,
  /onboarding/i,
  /directory/i,
]);

const LOWER_RISK_PATTERNS = Object.freeze([
  /present/i,
  /render/i,
  /format/i,
  /copy\.js$/i,
  /label/i,
  /theme/i,
  /css/i,
  /partial/i,
  /legal\/.*Content/i,
]);

function parseArgs(argv) {
  let input = null;
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === "--input" || a === "-i") {
      input = argv[i + 1] || null;
      i += 1;
    } else if (a.startsWith("--input=")) {
      input = a.slice("--input=".length);
    }
  }
  return { input };
}

function resolveInputDir(cliInput) {
  if (cliInput) {
    const abs = path.isAbsolute(cliInput) ? cliInput : path.join(ROOT, cliInput);
    if (!fs.existsSync(abs)) {
      throw new Error(`Coverage input not found: ${cliInput}`);
    }
    return abs;
  }
  for (const rel of DEFAULT_INPUT_CANDIDATES) {
    const abs = path.join(ROOT, rel);
    const summary = path.join(abs, "coverage-summary.json");
    if (fs.existsSync(summary)) return abs;
  }
  throw new Error(
    "No QA03 coverage-summary.json found. Run e.g. `npm run test:coverage:critical` first.\n" +
      `Looked in: ${DEFAULT_INPUT_CANDIDATES.join(", ")}`
  );
}

function loadSummary(inputDir) {
  const summaryPath = path.join(inputDir, "coverage-summary.json");
  if (!fs.existsSync(summaryPath)) {
    throw new Error(`Missing coverage-summary.json in ${inputDir}`);
  }
  const raw = JSON.parse(fs.readFileSync(summaryPath, "utf8"));
  const metaPath = path.join(inputDir, "v203-coverage-meta.json");
  let meta = null;
  if (fs.existsSync(metaPath)) {
    try {
      meta = JSON.parse(fs.readFileSync(metaPath, "utf8"));
    } catch {
      meta = null;
    }
  }
  return { summaryPath, raw, meta };
}

function toRepoRel(absPath) {
  const n = String(absPath).split(path.sep).join("/");
  const root = ROOT.split(path.sep).join("/");
  if (n.startsWith(root + "/")) return n.slice(root.length + 1);
  // c8 sometimes uses absolute paths; also accept already-relative
  if (n.startsWith("src/") || n === "server.js" || n === "index.js") return n;
  return n;
}

function bucketFor(rel) {
  if (rel.startsWith("src/platform/")) return "src/platform";
  if (rel.startsWith("src/blessboard/")) return "src/blessboard";
  if (rel.startsWith("src/church/")) return "src/church";
  if (rel.startsWith("src/activeclinic/")) return "src/activeclinic";
  if (rel.startsWith("src/")) return "other_src";
  if (rel === "server.js" || rel === "server.legacy.js" || rel === "index.js") {
    return "app_entry";
  }
  return "other";
}

function layerHint(rel) {
  const lower = rel.toLowerCase();
  if (/\/http\//.test(lower) || /routes?\.js$/.test(lower) || /route/i.test(path.basename(rel))) {
    return "route";
  }
  if (/\/repositories\//.test(lower) || /repository\.js$/i.test(rel)) return "repository";
  if (/\/services\//.test(lower) || /service\.js$/i.test(rel)) return "service";
  if (/\/bootstrap\//.test(lower) || /migrat/i.test(lower)) return "migration/bootstrap";
  return "other";
}

function riskWeight(rel) {
  const base = path.basename(rel);
  const full = rel;
  for (const re of LOWER_RISK_PATTERNS) {
    if (re.test(full) || re.test(base)) {
      // Lower only if not also high-risk (e.g. renderAuth is still auth)
      let high = false;
      for (const h of HIGH_RISK_PATTERNS) {
        if (h.test(full)) {
          high = true;
          break;
        }
      }
      if (!high) return "LOWER";
    }
  }
  for (const re of HIGH_RISK_PATTERNS) {
    if (re.test(full)) return "HIGH";
  }
  for (const re of MEDIUM_RISK_PATTERNS) {
    if (re.test(full)) return "MEDIUM";
  }
  // Default by layer
  const layer = layerHint(rel);
  if (layer === "route" || layer === "service") return "MEDIUM";
  if (layer === "repository") return "MEDIUM";
  return "LOWER";
}

function metricsOf(entry) {
  const m = (k) => {
    const v = entry[k] || {};
    return {
      total: Number(v.total) || 0,
      covered: Number(v.covered) || 0,
      pct: typeof v.pct === "number" ? v.pct : 0,
    };
  };
  return {
    statements: m("statements"),
    branches: m("branches"),
    functions: m("functions"),
    lines: m("lines"),
  };
}

function emptyMetrics() {
  return {
    statements: { total: 0, covered: 0, pct: 0 },
    branches: { total: 0, covered: 0, pct: 0 },
    functions: { total: 0, covered: 0, pct: 0 },
    lines: { total: 0, covered: 0, pct: 0 },
  };
}

function addMetrics(acc, next) {
  for (const k of ["statements", "branches", "functions", "lines"]) {
    acc[k].total += next[k].total;
    acc[k].covered += next[k].covered;
  }
}

function finalizePct(acc) {
  for (const k of ["statements", "branches", "functions", "lines"]) {
    const t = acc[k].total;
    acc[k].pct = t === 0 ? 100 : Math.round((10000 * acc[k].covered) / t) / 100;
  }
  return acc;
}

function walkJsFiles(dir, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, ent.name);
    if (ent.isDirectory()) {
      if (ent.name === "node_modules" || ent.name === "vendor") continue;
      walkJsFiles(p, out);
    } else if (ent.isFile() && ent.name.endsWith(".js")) {
      out.push(p);
    }
  }
  return out;
}

function belowThreshold(metrics) {
  const reasons = [];
  if (metrics.lines.pct < THRESHOLDS.lines) {
    reasons.push(`lines ${metrics.lines.pct}% < ${THRESHOLDS.lines}%`);
  }
  if (metrics.functions.pct < THRESHOLDS.functions) {
    reasons.push(`functions ${metrics.functions.pct}% < ${THRESHOLDS.functions}%`);
  }
  if (metrics.branches.pct < THRESHOLDS.branches) {
    reasons.push(`branches ${metrics.branches.pct}% < ${THRESHOLDS.branches}%`);
  }
  if (metrics.lines.pct === 0 || (metrics.lines.total > 0 && metrics.lines.covered === 0)) {
    reasons.push("0% lines (untested)");
  }
  return reasons;
}

function riskScore(file) {
  // Higher = more urgent for review
  const riskW = { HIGH: 100, MEDIUM: 40, LOWER: 10 }[file.risk] || 10;
  const gap = Math.max(0, THRESHOLDS.lines - file.metrics.lines.pct);
  const size = Math.min(50, Math.log10(Math.max(10, file.metrics.lines.total)) * 20);
  const zero = file.metrics.lines.pct === 0 ? 30 : 0;
  return Math.round(riskW + gap + size + zero);
}

function buildReport(inputDir, raw, meta) {
  const files = [];
  const coveredRel = new Set();

  for (const [absKey, entry] of Object.entries(raw)) {
    if (absKey === "total") continue;
    const rel = toRepoRel(absKey);
    if (!rel.startsWith("src/") && !/^(server|server\.legacy|index)\.js$/.test(rel)) {
      // Skip non-application paths if any slipped in
      continue;
    }
    coveredRel.add(rel);
    const metrics = metricsOf(entry);
    const reasons = belowThreshold(metrics);
    const file = {
      file: rel,
      bucket: bucketFor(rel),
      layer: layerHint(rel),
      risk: riskWeight(rel),
      metrics,
      flagReasons: reasons,
      flagged: reasons.length > 0,
    };
    file.riskScore = riskScore(file);
    files.push(file);
  }

  // Completely absent from coverage run (never loaded) → treat as 0%
  const srcRoot = path.join(ROOT, "src");
  const onDisk = walkJsFiles(srcRoot).map((p) => toRepoRel(p));
  for (const rel of ["server.js", "server.legacy.js", "index.js"]) {
    if (fs.existsSync(path.join(ROOT, rel))) onDisk.push(rel);
  }

  const untestedAbsent = [];
  for (const rel of onDisk) {
    if (coveredRel.has(rel)) continue;
    const metrics = emptyMetrics();
    // Unknown size — use file line count as proxy for "total"
    let lineCount = 0;
    try {
      lineCount = fs.readFileSync(path.join(ROOT, rel), "utf8").split("\n").length;
    } catch {
      lineCount = 0;
    }
    metrics.lines = { total: lineCount, covered: 0, pct: 0 };
    metrics.statements = { total: lineCount, covered: 0, pct: 0 };
    metrics.functions = { total: 0, covered: 0, pct: 0 };
    metrics.branches = { total: 0, covered: 0, pct: 0 };
    const file = {
      file: rel,
      bucket: bucketFor(rel),
      layer: layerHint(rel),
      risk: riskWeight(rel),
      metrics,
      flagReasons: ["absent from coverage run (never loaded / 0%)"],
      flagged: true,
      absentFromCoverage: true,
    };
    file.riskScore = riskScore(file);
    files.push(file);
    untestedAbsent.push(rel);
  }

  const byBucket = {};
  for (const f of files) {
    if (!byBucket[f.bucket]) byBucket[f.bucket] = emptyMetrics();
    // Only aggregate files that appeared in c8 summary with real counters
    if (!f.absentFromCoverage) addMetrics(byBucket[f.bucket], f.metrics);
  }
  for (const k of Object.keys(byBucket)) finalizePct(byBucket[k]);

  const overall = raw.total ? metricsOf(raw.total) : emptyMetrics();

  const flagged = files.filter((f) => f.flagged);
  const completelyUntested = files.filter(
    (f) => f.metrics.lines.pct === 0 || f.absentFromCoverage
  );
  const largeWeak = files.filter(
    (f) =>
      !f.absentFromCoverage &&
      f.metrics.lines.total >= LARGE_FILE_LINES &&
      f.metrics.lines.pct < WEAK_LARGE_LINES_PCT
  );
  const weakRoutes = flagged.filter((f) => f.layer === "route");
  const weakRepos = flagged.filter((f) => f.layer === "repository");
  const weakServices = flagged.filter((f) => f.layer === "service");

  const highRiskFlagged = flagged
    .filter((f) => f.risk === "HIGH")
    .sort((a, b) => b.riskScore - a.riskScore);

  const priorityReview = [...flagged].sort((a, b) => b.riskScore - a.riskScore).slice(0, 75);

  return {
    generatedAt: new Date().toISOString(),
    analyzer: "scripts/analyze-test-coverage.js",
    prerequisite: "QA03 c8 coverage-summary.json",
    inputDir: path.relative(ROOT, inputDir).split(path.sep).join("/"),
    coverageMeta: meta,
    diagnosticThresholds: { ...THRESHOLDS, note: "NOT release gates" },
    overall,
    byBucket,
    counts: {
      filesInSummary: files.filter((f) => !f.absentFromCoverage).length,
      filesOnDiskScanned: onDisk.length,
      absentFromCoverage: untestedAbsent.length,
      flagged: flagged.length,
      completelyUntested: completelyUntested.length,
      largeWeak: largeWeak.length,
      weakRoutes: weakRoutes.length,
      weakRepositories: weakRepos.length,
      weakServices: weakServices.length,
      highRiskFlagged: highRiskFlagged.length,
    },
    priorityReview: priorityReview.map(summarizeFile),
    completelyUntested: completelyUntested
      .sort((a, b) => b.riskScore - a.riskScore)
      .slice(0, 200)
      .map(summarizeFile),
    largeWeakFiles: largeWeak
      .sort((a, b) => b.riskScore - a.riskScore)
      .slice(0, 100)
      .map(summarizeFile),
    weakRoutes: weakRoutes
      .sort((a, b) => b.riskScore - a.riskScore)
      .slice(0, 100)
      .map(summarizeFile),
    weakRepositories: weakRepos
      .sort((a, b) => b.riskScore - a.riskScore)
      .slice(0, 100)
      .map(summarizeFile),
    weakServices: weakServices
      .sort((a, b) => b.riskScore - a.riskScore)
      .slice(0, 100)
      .map(summarizeFile),
    highRiskFlagged: highRiskFlagged.slice(0, 100).map(summarizeFile),
    marker: "V203_COVERAGE_ANALYZER_PASS",
  };
}

function summarizeFile(f) {
  return {
    file: f.file,
    bucket: f.bucket,
    layer: f.layer,
    risk: f.risk,
    riskScore: f.riskScore,
    linesPct: f.metrics.lines.pct,
    functionsPct: f.metrics.functions.pct,
    branchesPct: f.metrics.branches.pct,
    statementsPct: f.metrics.statements.pct,
    linesTotal: f.metrics.lines.total,
    flagReasons: f.flagReasons,
    absentFromCoverage: !!f.absentFromCoverage,
  };
}

function pctCell(m) {
  return `${m.pct}% (${m.covered}/${m.total})`;
}

function renderMarkdown(report) {
  const lines = [];
  lines.push("# V2.03 Coverage Gap Report (QA04)");
  lines.push("");
  lines.push(`Generated: \`${report.generatedAt}\``);
  lines.push(`Input: \`${report.inputDir}\``);
  lines.push("");
  lines.push("```text");
  lines.push("V203_COVERAGE_ANALYZER_PASS");
  lines.push("```");
  lines.push("");
  lines.push("> Diagnostic thresholds only (not release gates):");
  lines.push(
    `> lines < ${THRESHOLDS.lines}% · functions < ${THRESHOLDS.functions}% · branches < ${THRESHOLDS.branches}% · or 0% / absent file.`
  );
  lines.push("");
  lines.push("## Overall");
  lines.push("");
  lines.push("| Metric | Coverage |");
  lines.push("|--------|----------|");
  lines.push(`| Statements | ${pctCell(report.overall.statements)} |`);
  lines.push(`| Branches | ${pctCell(report.overall.branches)} |`);
  lines.push(`| Functions | ${pctCell(report.overall.functions)} |`);
  lines.push(`| Lines | ${pctCell(report.overall.lines)} |`);
  lines.push("");
  lines.push("## By module bucket");
  lines.push("");
  lines.push("| Bucket | Statements | Branches | Functions | Lines |");
  lines.push("|--------|------------|----------|-----------|-------|");
  const bucketOrder = [
    "src/platform",
    "src/blessboard",
    "src/church",
    "src/activeclinic",
    "other_src",
    "app_entry",
    "other",
  ];
  for (const b of bucketOrder) {
    if (!report.byBucket[b]) continue;
    const m = report.byBucket[b];
    lines.push(
      `| \`${b}\` | ${m.statements.pct}% | ${m.branches.pct}% | ${m.functions.pct}% | ${m.lines.pct}% |`
    );
  }
  lines.push("");
  lines.push("## Counts");
  lines.push("");
  lines.push("| Item | Count |");
  lines.push("|------|------:|");
  for (const [k, v] of Object.entries(report.counts)) {
    lines.push(`| ${k} | ${v} |`);
  }
  lines.push("");
  lines.push("## Priority review (risk-weighted, top 40)");
  lines.push("");
  lines.push("| Score | Risk | Layer | Lines% | File | Reasons |");
  lines.push("|------:|------|-------|-------:|------|---------|");
  for (const f of report.priorityReview.slice(0, 40)) {
    lines.push(
      `| ${f.riskScore} | ${f.risk} | ${f.layer} | ${f.linesPct} | \`${f.file}\` | ${f.flagReasons.join("; ")} |`
    );
  }
  lines.push("");
  lines.push("## HIGH risk flagged (top 30)");
  lines.push("");
  lines.push("| Score | Lines% | File |");
  lines.push("|------:|-------:|------|");
  for (const f of report.highRiskFlagged.slice(0, 30)) {
    lines.push(`| ${f.riskScore} | ${f.linesPct} | \`${f.file}\` |`);
  }
  lines.push("");
  lines.push("## Large / weak files");
  lines.push("");
  lines.push(
    `Files with ≥${LARGE_FILE_LINES} lines and lines coverage <${WEAK_LARGE_LINES_PCT}% (top 25).`
  );
  lines.push("");
  lines.push("| Score | Risk | Lines | Lines% | File |");
  lines.push("|------:|------|------:|-------:|------|");
  for (const f of report.largeWeakFiles.slice(0, 25)) {
    lines.push(
      `| ${f.riskScore} | ${f.risk} | ${f.linesTotal} | ${f.linesPct} | \`${f.file}\` |`
    );
  }
  lines.push("");
  lines.push("## Weak routes");
  lines.push("");
  for (const f of report.weakRoutes.slice(0, 20)) {
    lines.push(`- **${f.risk}** \`${f.file}\` — lines ${f.linesPct}%`);
  }
  lines.push("");
  lines.push("## Weak repositories");
  lines.push("");
  for (const f of report.weakRepositories.slice(0, 20)) {
    lines.push(`- **${f.risk}** \`${f.file}\` — lines ${f.linesPct}%`);
  }
  lines.push("");
  lines.push("## Weak services");
  lines.push("");
  for (const f of report.weakServices.slice(0, 20)) {
    lines.push(`- **${f.risk}** \`${f.file}\` — lines ${f.linesPct}%`);
  }
  lines.push("");
  lines.push("## Completely untested / absent (sample)");
  lines.push("");
  for (const f of report.completelyUntested.slice(0, 40)) {
    lines.push(
      `- **${f.risk}** \`${f.file}\`${f.absentFromCoverage ? " _(absent from run)_" : ""}`
    );
  }
  lines.push("");
  lines.push("---");
  lines.push("");
  lines.push("Full machine-readable detail: `coverage/coverage-gap-report.json`.");
  lines.push("");
  return lines.join("\n");
}

function main(argv) {
  const { input } = parseArgs(argv);
  const inputDir = resolveInputDir(input);
  const { summaryPath, raw, meta } = loadSummary(inputDir);
  const report = buildReport(inputDir, raw, meta);

  const outDir = path.join(ROOT, "coverage");
  fs.mkdirSync(outDir, { recursive: true });
  const jsonOut = path.join(outDir, "coverage-gap-report.json");
  const mdOut = path.join(outDir, "coverage-gap-report.md");
  fs.writeFileSync(jsonOut, JSON.stringify(report, null, 2) + "\n");
  fs.writeFileSync(mdOut, renderMarkdown(report));

  process.stdout.write(
    `[v203-coverage-analyze] input=${path.relative(ROOT, summaryPath)}\n`
  );
  process.stdout.write(
    `[v203-coverage-analyze] overall lines=${report.overall.lines.pct}% ` +
      `functions=${report.overall.functions.pct}% branches=${report.overall.branches.pct}%\n`
  );
  process.stdout.write(
    `[v203-coverage-analyze] flagged=${report.counts.flagged} ` +
      `highRisk=${report.counts.highRiskFlagged} ` +
      `untested=${report.counts.completelyUntested}\n`
  );
  process.stdout.write(`[v203-coverage-analyze] wrote ${path.relative(ROOT, jsonOut)}\n`);
  process.stdout.write(`[v203-coverage-analyze] wrote ${path.relative(ROOT, mdOut)}\n`);
  process.stdout.write("V203_COVERAGE_ANALYZER_PASS\n");
  return 0;
}

if (require.main === module) {
  try {
    process.exitCode = main(process.argv.slice(2));
  } catch (err) {
    process.stderr.write(
      `[v203-coverage-analyze] FAIL ${err && err.stack ? err.stack : err}\n`
    );
    process.exitCode = 1;
  }
}

module.exports = {
  THRESHOLDS,
  resolveInputDir,
  buildReport,
  riskWeight,
};
