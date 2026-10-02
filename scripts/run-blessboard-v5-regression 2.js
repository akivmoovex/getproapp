#!/usr/bin/env node
"use strict";

/**
 * Non-destructive BlessBoard V5 regression runner (local / CI).
 * Composes existing npm scripts; fails immediately on the first non-zero exit.
 * Does not apply hosted migrations, change env files, or write production data.
 *
 * Usage:
 *   node scripts/run-blessboard-v5-regression.js           # full
 *   node scripts/run-blessboard-v5-regression.js --fast    # static precommit only
 *   npm run test:blessboard:v5:regression
 *   npm run test:blessboard:v5:regression:fast
 */

const { spawnSync } = require("child_process");

/** @typedef {{ name: string, script: string }} Suite */

/** @type {Suite[]} */
const FAST_SUITES = [
  {
    name: "Static pre-commit (design system, a11y, responsive, assets, audits, routing mode)",
    script: "test:blessboard:precommit-fast",
  },
];

/** @type {Suite[]} */
const FULL_SUITES = [
  {
    name: "Static pre-commit",
    script: "test:blessboard:precommit-fast",
  },
  {
    name: "Admin shells (branch / HQ / platform)",
    script: "test:blessboard:shells",
  },
  {
    name: "Apex (auth GUI, home, marketing)",
    script: "test:blessboard:apex",
  },
  {
    name: "Auth schema",
    script: "test:blessboard:auth-schema",
  },
  {
    name: "Auth HTTP",
    script: "test:blessboard:auth",
  },
  {
    name: "Tenant host auth",
    script: "test:blessboard:tenant-auth",
  },
  {
    name: "Platform V5 sessions",
    script: "test:platform:sessions",
  },
  {
    name: "Authorization matrix",
    script: "test:blessboard:authorization",
  },
  {
    name: "Member suite",
    script: "test:blessboard:member-suite",
  },
  {
    name: "Admin modules (attendance, giving, forms, reports, content)",
    script: "test:blessboard:admin-modules",
  },
  {
    name: "Media",
    script: "test:blessboard:media",
  },
  {
    name: "Tenant public pages",
    script: "test:blessboard:public-pages",
  },
  {
    name: "Public content schema",
    script: "test:blessboard:public-content-schema",
  },
  {
    name: "Settings",
    script: "test:blessboard:settings",
  },
  {
    name: "Branch list",
    script: "test:blessboard:branch-list",
  },
  {
    name: "Tenant routing (mode + evaluate)",
    script: "test:blessboard:tenant-routing",
  },
  {
    name: "Catalogue schema + lookup",
    script: "test:blessboard:catalogue",
  },
  {
    name: "Catalogue HTTP context",
    script: "test:blessboard:http-context",
  },
  {
    name: "Church provisioning",
    script: "test:blessboard:provisioning",
  },
  {
    name: "Provision CLI safety",
    script: "test:blessboard:provision-cli-safety",
  },
  {
    name: "Demo V5 minimum dataset tool",
    script: "test:blessboard:demo-v5-dataset",
  },
  {
    name: "Platform entitlements",
    script: "test:platform:entitlements",
  },
  {
    name: "Migration mapping (unit)",
    script: "test:migration:mapping",
  },
  {
    name: "Migration tooling (local fixtures only)",
    script: "test:migration:tooling",
  },
];

function printBanner(title) {
  const line = "=".repeat(72);
  process.stdout.write(`\n${line}\n${title}\n${line}\n`);
}

/**
 * @param {Suite[]} suites
 * @param {string} modeLabel
 */
function runSuites(suites, modeLabel) {
  printBanner(`BlessBoard V5 regression (${modeLabel}) — ${suites.length} suite(s)`);
  process.stdout.write(
    "Non-destructive: local/ephemeral DB only. No hosted migrate apply. No env mutation.\n"
  );

  const started = Date.now();
  for (let i = 0; i < suites.length; i += 1) {
    const suite = suites[i];
    const label = `[${i + 1}/${suites.length}] ${suite.name}`;
    printBanner(label);
    process.stdout.write(`→ npm run ${suite.script}\n\n`);

    const result = spawnSync("npm", ["run", suite.script], {
      stdio: "inherit",
      env: process.env,
      shell: false,
    });

    const code = result.status == null ? 1 : result.status;
    if (result.error) {
      process.stderr.write(`\nFailed to spawn npm: ${result.error.message}\n`);
      process.exit(1);
    }
    if (code !== 0) {
      printBanner(`FAILED: ${suite.name} (exit ${code})`);
      process.stderr.write(
        `BlessBoard V5 regression stopped (fail-fast). Remaining suites were not run.\n`
      );
      process.exit(code);
    }
    process.stdout.write(`\n✓ Passed: ${suite.name}\n`);
  }

  const elapsedSec = ((Date.now() - started) / 1000).toFixed(1);
  printBanner(`BlessBoard V5 regression PASSED (${modeLabel}) in ${elapsedSec}s`);
  process.exit(0);
}

function main() {
  const args = process.argv.slice(2);
  const fast = args.includes("--fast") || args.includes("-f");
  if (args.includes("--help") || args.includes("-h")) {
    process.stdout.write(
      "Usage: node scripts/run-blessboard-v5-regression.js [--fast]\n" +
        "  --fast   Run static pre-commit suite only\n" +
        "  (default) Full local V5 foundation regression\n"
    );
    process.exit(0);
  }
  if (fast) {
    runSuites(FAST_SUITES, "fast");
  } else {
    runSuites(FULL_SUITES, "full");
  }
}

main();
