#!/usr/bin/env node
"use strict";

/**
 * CLI: BlessBoard V5 read-only deployed smoke (testing/staging).
 *
 *   npm run smoke:v5:deployed -- --base-url https://blessboard.org
 *
 * GET/HEAD only. No login POST, registration, uploads, or migrations.
 * Does not default to any host — --base-url is required.
 */

const {
  parseSmokeArgs,
  runDeployedSmoke,
  formatHumanReport,
} = require("../src/blessboard/tools/deployedSmokeRunner");

function printUsage() {
  process.stderr.write(`Usage:
  npm run smoke:v5:deployed -- --base-url <https://testing-host> [options]

Required:
  --base-url <url>              Explicit testing/staging origin (no embedded credentials)

Options:
  --tenant-host <hostname>      Tenant Host header for one demo host
  --unknown-host <hostname>     Host for unknown-host check (default: generated *.blessboard.org)
  --json                        Print JSON report only (default: human + JSON summary line)
  --allow-localhost             Permit localhost / 127.0.0.1 (mock rehearsal only)
  --allow-http                  Permit http:// for non-localhost
  --allow-hostname <host>       Allow an extra staging hostname (repeatable)
  --allow-production-hostname   Supervised override for production-classified hosts
  --timeout-ms <n>              Per-request timeout (default 15000)
  --skip-static-assets          Skip CSS/JS asset GETs
  --help

Hard rules:
  - GET/HEAD only (no login, register, uploads, writes, migrations)
  - Testing/staging allowlist by default (blessboard.org / *.blessboard.org / staging* labels)
  - Production-classified hosts rejected unless --allow-production-hostname
  - Localhost rejected unless --allow-localhost
  - Sensitive query values redacted in reports
`);
}

async function main() {
  const parsed = parseSmokeArgs(process.argv);
  if (parsed.help) {
    printUsage();
    process.exit(0);
  }
  if (parsed.unknown) {
    process.stderr.write(`Unknown argument: ${parsed.unknown}\n`);
    printUsage();
    process.exit(2);
  }
  if (!parsed.baseUrl) {
    printUsage();
    process.exit(2);
  }

  const report = await runDeployedSmoke({
    baseUrl: String(parsed.baseUrl),
    tenantHost: parsed.tenantHost ? String(parsed.tenantHost) : null,
    unknownHost: parsed.unknownHost ? String(parsed.unknownHost) : undefined,
    allowLocalhost: Boolean(parsed.allowLocalhost),
    allowHttp: Boolean(parsed.allowHttp),
    allowProductionHostname: Boolean(parsed.allowProductionHostname),
    allowHostname: /** @type {string[]} */ (parsed.allowHostname || []),
    timeoutMs: typeof parsed.timeoutMs === "number" && !Number.isNaN(parsed.timeoutMs) ? parsed.timeoutMs : undefined,
    skipStaticAssets: Boolean(parsed.skipStaticAssets),
  });

  if (parsed.json) {
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  } else {
    process.stdout.write(formatHumanReport(report));
    process.stdout.write(`\n--- JSON ---\n${JSON.stringify(report, null, 2)}\n`);
  }

  process.exit(report.ok ? 0 : 1);
}

main().catch((err) => {
  process.stderr.write(`${err && err.stack ? err.stack : err}\n`);
  process.exit(2);
});
