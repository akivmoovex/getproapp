#!/usr/bin/env node
"use strict";

/**
 * V2.03 QA03 — reproducible coverage harness (c8 + node --test).
 *
 * Provider: c8 (already in devDependencies). Wraps the existing Node.js
 * built-in test runner. Native `--experimental-test-coverage` is text-only
 * and lacks JSON/LCOV — insufficient for the required machine-readable outputs.
 *
 * Usage:
 *   npm run test:coverage
 *   npm run test:coverage:platform
 *   npm run test:coverage:blessboard
 *   npm run test:coverage:activeclinic
 *   npm run test:coverage:critical
 *   node scripts/coverage/run-v203-coverage.js --scope=critical
 *
 * No coverage thresholds are enforced (QA03).
 */

const { spawnSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..", "..");

const SCOPES = Object.freeze({
  all: {
    reportsDir: "coverage/v203",
    include: ["src/**", "server.js", "server.legacy.js", "index.js"],
    // Full default suite — same glob as `npm test`.
    tests: null,
    testGlob: "tests/**/*.test.js",
  },
  platform: {
    reportsDir: "coverage/v203-platform",
    include: [
      "src/platform/**",
      "src/db/**",
      "src/phone/**",
      "src/http/**",
      "src/middleware/**",
      "src/lib/**",
      "src/config/**",
      "server.js",
      "index.js",
    ],
    tests: null,
    testGlobs: [
      "tests/platform-*.test.js",
      "tests/v8-*.test.js",
      "tests/v10-pc*.test.js",
      "tests/v10-pl*.test.js",
      "tests/v10-dbcl*.test.js",
      "tests/v7-shared-*.test.js",
      "tests/v7-platform-*.test.js",
      "tests/v7-migrate-*.test.js",
      "tests/v7-runtime-*.test.js",
      "tests/db-*.test.js",
      "tests/migration-*.test.js",
      "tests/committed-secret-hygiene.test.js",
      "tests/v203-critical-platform-security.test.js",
    ],
  },
  blessboard: {
    reportsDir: "coverage/v203-blessboard",
    include: ["src/blessboard/**", "src/church/**"],
    tests: null,
    testGlobs: [
      "tests/blessboard-*.test.js",
      "tests/church-*.test.js",
      "tests/v7-bb-*.test.js",
      "tests/v7-blessboard-*.test.js",
      "tests/v2-01-shared-hq-branch-website.test.js",
      "tests/phase4-*.test.js",
    ],
  },
  activeclinic: {
    reportsDir: "coverage/v203-activeclinic",
    include: ["src/activeclinic/**"],
    tests: null,
    testGlobs: [
      "tests/activeclinic-*.test.js",
      "tests/v7-activeclinic-*.test.js",
    ],
  },
  critical: {
    reportsDir: "coverage/v203-critical",
    include: ["src/**", "server.js", "server.legacy.js", "index.js"],
    // QA01 critical pack (architecture + migrations + platform-core + BB/AC critical).
    tests: [
      "tests/v10-pc15-architecture-guardrails.test.js",
      "tests/v10-pc03-platform-product-dependency-direction.test.js",
      "tests/v8-migration-contract.test.js",
      "tests/v7-migrate-identity-gate.test.js",
      "tests/migration-mapping.test.js",
      "tests/v8-db-compatibility-baseline.test.js",
      "tests/v10-pl07-canonical-migration-baseline.test.js",
      "tests/v10-pc06-platform-schema-ownership.test.js",
      "tests/v10-pc18-organization-key-lift.test.js",
      "tests/v10-pc19-cross-product-dependency-zero.test.js",
      "tests/v10-pc02-platform-consolidation-characterization.test.js",
      "tests/v10-pc07-shared-website-editor-http.test.js",
      "tests/v10-pc08-platform-media-consolidation.test.js",
      "tests/v10-pc09-platform-ops-ui-primitives.test.js",
      "tests/v10-pc10-publication-convergence.test.js",
      "tests/v10-pc11-cms-convergence.test.js",
      "tests/v8-shared-auth-password-security.test.js",
      "tests/v8-shared-session-security.test.js",
      "tests/v8-shared-verification.test.js",
      "tests/v8-shared-rbac-tenant-isolation.test.js",
      "tests/v8-tenant-product-isolation.test.js",
      "tests/v8-environment-isolation.test.js",
      "tests/v203-critical-platform-security.test.js",
      "tests/v8-shared-media-resolution.test.js",
      "tests/v8-shared-website-lifecycle.test.js",
      "tests/v8-shared-website-sections.test.js",
      "tests/v7-shared-phone-identity.test.js",
      "tests/v7-bb-ac-phone-parity.test.js",
      "tests/v7-bb-form-phone-split.test.js",
      "tests/v7-shared-media-folders.test.js",
      "tests/v7-shared-content-media-library.test.js",
      "tests/v7-public-website-url-hardening.test.js",
      "tests/v2-01-shared-hq-branch-website.test.js",
      "tests/blessboard-p0-publish-auth.test.js",
      "tests/phase4-publish-website.test.js",
      "tests/phase4-restore-previous-website.test.js",
      "tests/v7-shared-website-editor.test.js",
      "tests/v7-website-draft-live-integrity.test.js",
      "tests/activeclinic-batch1a-config.test.js",
      "tests/activeclinic-batch1a-management-data.test.js",
      "tests/activeclinic-batch1a-patient-reception.test.js",
      "tests/activeclinic-batch1a-appointments.test.js",
      "tests/activeclinic-batch1a-clinical.test.js",
      "tests/activeclinic-batch1a-billing.test.js",
      "tests/v203-ac-batch1-test-readiness.test.js",
      "tests/activeclinic-batch2-shell.test.js",
      "tests/activeclinic-batch2-dashboard.test.js",
      "tests/activeclinic-batch2-facilities.test.js",
      "tests/activeclinic-batch2-patient-workspace.test.js",
      "tests/activeclinic-batch2-appointments-workspace.test.js",
      "tests/activeclinic-batch2-clinical-encounter.test.js",
      "tests/activeclinic-batch2-operational-queues.test.js",
      "tests/activeclinic-batch2-billing.test.js",
      "tests/activeclinic-batch2-rbac-isolation.test.js",
      "tests/v203-ac-batch2-test-readiness.test.js",
      "tests/activeclinic-batch3-acn27-rooms.test.js",
      "tests/activeclinic-batch3-acn18-clinical-documents.test.js",
      "tests/activeclinic-batch3-acn17-acn19.test.js",
      "tests/activeclinic-batch3-acn20.test.js",
      "tests/activeclinic-batch3-acp03-acp07.test.js",
      "tests/activeclinic-batch3-acp04.test.js",
      "tests/activeclinic-batch3-acp05-visit-summary.test.js",
      "tests/activeclinic-batch3-acp06.test.js",
      "tests/v203-ac-batch3-test-readiness.test.js",
      "tests/v2-02-legacy-rbac-removal.test.js",
      "tests/v2-02-bb-catalogue-only-rbac.test.js",
      "tests/blessboard-p0-publish-auth.test.js",
      "tests/v7-blessboard-publish-engine-bridge.test.js",
      "tests/v203-bb-regression-test-readiness.test.js",
      "tests/v203-end-to-end-journeys.test.js",
    ],
  },
});

function findC8Bin() {
  const local = path.join(ROOT, "node_modules", ".bin", "c8");
  return fs.existsSync(local) ? local : null;
}

function expandGlobs(globs) {
  const out = new Set();
  for (const pattern of globs) {
    if (typeof fs.globSync === "function") {
      for (const hit of fs.globSync(pattern, { cwd: ROOT })) {
        out.add(String(hit).split(path.sep).join("/"));
      }
      continue;
    }
    // Minimal fallback: only support tests/<prefix>*.test.js style.
    const dir = path.join(ROOT, "tests");
    const prefix = path.basename(pattern).replace(/\*.*$/, "");
    const suffix = ".test.js";
    for (const name of fs.readdirSync(dir)) {
      if (name.startsWith(prefix) && name.endsWith(suffix)) {
        out.add(path.join("tests", name));
      }
    }
  }
  return [...out].sort();
}

function resolveTestFiles(scope) {
  if (Array.isArray(scope.tests) && scope.tests.length) {
    const missing = scope.tests.filter((f) => !fs.existsSync(path.join(ROOT, f)));
    if (missing.length) {
      throw new Error(`Missing critical test files:\n${missing.join("\n")}`);
    }
    return scope.tests.slice();
  }
  if (scope.testGlob) {
    return expandGlobs([scope.testGlob]);
  }
  if (scope.testGlobs) {
    return expandGlobs(scope.testGlobs);
  }
  throw new Error("Scope has no tests configured");
}

function parseArgs(argv) {
  let scopeName = "all";
  for (const arg of argv) {
    if (arg.startsWith("--scope=")) scopeName = arg.slice("--scope=".length);
    else if (arg === "--scope" || arg === "-s") {
      /* next */
    } else if (!arg.startsWith("-") && SCOPES[arg]) {
      scopeName = arg;
    }
  }
  const idx = argv.indexOf("--scope");
  if (idx >= 0 && argv[idx + 1] && !argv[idx + 1].startsWith("-")) {
    scopeName = argv[idx + 1];
  }
  if (!SCOPES[scopeName]) {
    throw new Error(
      `Unknown scope "${scopeName}". Use: ${Object.keys(SCOPES).join(", ")}`
    );
  }
  return { scopeName, scope: SCOPES[scopeName] };
}

function writeMeta(reportsDirAbs, meta) {
  fs.writeFileSync(
    path.join(reportsDirAbs, "v203-coverage-meta.json"),
    JSON.stringify(meta, null, 2) + "\n"
  );
}

function main(argv) {
  const c8 = findC8Bin();
  if (!c8) {
    process.stderr.write(
      "[v203-coverage] c8 is not installed. Expected devDependency c8.\n"
    );
    return 1;
  }

  const { scopeName, scope } = parseArgs(argv);
  const testFiles = resolveTestFiles(scope);
  if (!testFiles.length) {
    process.stderr.write(`[v203-coverage] no test files for scope=${scopeName}\n`);
    return 1;
  }

  const reportsDirRel = scope.reportsDir;
  const reportsDirAbs = path.join(ROOT, reportsDirRel);
  fs.mkdirSync(reportsDirAbs, { recursive: true });

  const includeArgs = [];
  for (const inc of scope.include) {
    includeArgs.push("--include", inc);
  }

  const args = [
    "--config",
    path.join(ROOT, ".c8rc.json"),
    ...includeArgs,
    "--reporter=text",
    "--reporter=text-summary",
    "--reporter=json",
    "--reporter=json-summary",
    "--reporter=lcov",
    `--reports-dir=${reportsDirAbs}`,
    // No --check-coverage / thresholds (QA03).
    process.execPath,
    "--test",
    "--test-concurrency=1",
    ...testFiles.map((f) => path.join(ROOT, f)),
  ];

  const started = Date.now();
  process.stdout.write(
    `[v203-coverage] provider=c8 scope=${scopeName} tests=${testFiles.length} ` +
      `reportsDir=${reportsDirRel}\n`
  );

  const result = spawnSync(c8, args, {
    cwd: ROOT,
    env: {
      ...process.env,
      NODE_ENV: process.env.NODE_ENV || "test",
    },
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  });

  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);

  const summaryPath = path.join(reportsDirAbs, "coverage-summary.json");
  const lcovPath = path.join(reportsDirAbs, "lcov.info");
  const jsonPath = path.join(reportsDirAbs, "coverage-final.json");
  const reportsOk =
    fs.existsSync(summaryPath) &&
    (fs.existsSync(lcovPath) || fs.existsSync(path.join(reportsDirAbs, "lcov"))) &&
    (fs.existsSync(jsonPath) || fs.existsSync(summaryPath));

  let summary = null;
  if (fs.existsSync(summaryPath)) {
    try {
      summary = JSON.parse(fs.readFileSync(summaryPath, "utf8"));
    } catch {
      summary = null;
    }
  }

  const meta = {
    provider: "c8",
    runner: "node --test",
    scope: scopeName,
    testFileCount: testFiles.length,
    include: scope.include,
    reportsDir: reportsDirRel,
    durationMs: Date.now() - started,
    testExitCode: result.status == null ? 1 : result.status,
    reportsOk,
    totals: summary && summary.total ? summary.total : null,
    artifacts: {
      text: "printed to stdout",
      jsonSummary: fs.existsSync(summaryPath)
        ? path.relative(ROOT, summaryPath)
        : null,
      json: fs.existsSync(jsonPath) ? path.relative(ROOT, jsonPath) : null,
      lcov: fs.existsSync(lcovPath)
        ? path.relative(ROOT, lcovPath)
        : fs.existsSync(path.join(reportsDirAbs, "lcov"))
          ? path.relative(ROOT, path.join(reportsDirAbs, "lcov"))
          : null,
    },
    note:
      "Harness PASS requires machine-readable reports; individual test failures do not fail the harness (no thresholds in QA03).",
  };
  writeMeta(reportsDirAbs, meta);

  if (summary && summary.total) {
    const t = summary.total;
    process.stdout.write(
      `[v203-coverage] lines=${t.lines && t.lines.pct}% ` +
        `statements=${t.statements && t.statements.pct}% ` +
        `functions=${t.functions && t.functions.pct}% ` +
        `branches=${t.branches && t.branches.pct}%\n`
    );
  }

  process.stdout.write(
    `[v203-coverage] meta=${path.relative(ROOT, path.join(reportsDirAbs, "v203-coverage-meta.json"))}\n`
  );

  if (!reportsOk) {
    process.stderr.write("[v203-coverage] FAILED — coverage artifacts missing\n");
    return 1;
  }

  process.stdout.write(
    `[v203-coverage] HARNESS_PASS scope=${scopeName} ` +
      `(testExitCode=${meta.testExitCode}; thresholds=none)\n`
  );
  return 0;
}

module.exports = { SCOPES, ROOT };

if (require.main === module) {
  try {
    process.exitCode = main(process.argv.slice(2));
  } catch (err) {
    process.stderr.write(`[v203-coverage] ${err && err.stack ? err.stack : err}\n`);
    process.exitCode = 1;
  }
}
