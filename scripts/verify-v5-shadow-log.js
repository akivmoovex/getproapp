#!/usr/bin/env node
"use strict";

/**
 * CLI: validate a local redacted BlessBoard V5 shadow-routing log file.
 *
 *   npm run verify:v5:shadow-log -- --file <path>
 *
 * Does not connect to databases, Hostinger, or remote log APIs.
 * Never prints raw log lines (secrets stay off stdout).
 */

const path = require("path");
const {
  validateShadowLogFile,
  formatValidatorReport,
} = require("../src/blessboard/tools/shadowLogValidator");

function printUsage() {
  process.stderr.write(`Usage:
  npm run verify:v5:shadow-log -- --file <local-path> [options]

Options:
  --file <path>                 Local redacted log file (required)
  --mode match|unknown-host     Evidence mode (default: match)
  --hostname <host>             Expected hostname
  --organization-key <key>      Expected organizationKey
  --church-key <key>            Expected churchKey
  --primary-branch-key <key>    Expected primaryBranchKey (also HQ when HQ≡primary)

Hard rules:
  - Local files only (no http(s) URLs)
  - No database or remote log fetch
  - Failures report codes/fields only — never echo sensitive lines
`);
}

/**
 * @param {string[]} argv
 */
function parseArgs(argv) {
  const args = argv.slice(2);
  /** @type {Record<string, string | boolean>} */
  const out = { mode: "match" };
  for (let i = 0; i < args.length; i += 1) {
    const a = args[i];
    if (a === "--help" || a === "-h") {
      out.help = true;
      continue;
    }
    const take = () => {
      i += 1;
      return args[i];
    };
    if (a === "--file") out.file = take();
    else if (a === "--mode") out.mode = take();
    else if (a === "--hostname") out.hostname = take();
    else if (a === "--organization-key") out.organizationKey = take();
    else if (a === "--church-key") out.churchKey = take();
    else if (a === "--primary-branch-key") out.primaryBranchKey = take();
    else {
      out.unknown = a;
    }
  }
  return out;
}

function main() {
  const parsed = parseArgs(process.argv);
  if (parsed.help) {
    printUsage();
    process.exit(0);
  }
  if (parsed.unknown) {
    process.stderr.write(`Unknown argument: ${parsed.unknown}\n`);
    printUsage();
    process.exit(2);
  }
  if (!parsed.file) {
    printUsage();
    process.exit(2);
  }

  const mode = String(parsed.mode || "match").trim();
  if (mode !== "match" && mode !== "unknown-host") {
    process.stderr.write("Invalid --mode (use match or unknown-host)\n");
    process.exit(2);
  }

  const result = validateShadowLogFile(String(parsed.file), {
    mode,
    expectedHostname: parsed.hostname ? String(parsed.hostname) : null,
    expectedOrganizationKey: parsed.organizationKey ? String(parsed.organizationKey) : null,
    expectedChurchKey: parsed.churchKey ? String(parsed.churchKey) : null,
    expectedPrimaryBranchKey: parsed.primaryBranchKey ? String(parsed.primaryBranchKey) : null,
  });

  const report = formatValidatorReport(result);
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);

  if (!result.ok) {
    process.stderr.write(
      `[verify:v5:shadow-log] FAIL events=${report.eventCount} findings=${report.findings.length} file=${report.file || "(none)"}\n`
    );
    process.exit(1);
  }

  process.stderr.write(
    `[verify:v5:shadow-log] PASS events=${report.eventCount} mode=${report.mode} file=${report.file}\n`
  );
  process.exit(0);
}

main();
