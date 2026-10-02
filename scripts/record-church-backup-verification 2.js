#!/usr/bin/env node
"use strict";

/**
 * Record operator-attested backup verification or restoration-test events.
 * Does NOT create infrastructure backups or invent success without explicit flags.
 *
 * Usage:
 *   node scripts/record-church-backup-verification.js backup --outcome success --evidence snap-123
 *   node scripts/record-church-backup-verification.js restoration-test --outcome success --environment staging --notes "..."
 *   node scripts/record-church-backup-verification.js --help
 */

const { getPgPool, isPgConfigured } = require("../src/db/pg/pool");
const { ensureChurchSchema } = require("../src/db/pg/ensureChurchSchema");
const churchBackupVerificationService = require("../src/services/church/churchBackupVerificationService");

function usage() {
  console.log(`Usage:
  node scripts/record-church-backup-verification.js backup --outcome <success|failed|partial> [options]
  node scripts/record-church-backup-verification.js restoration-test --outcome <success|failed|partial> [options]

Options:
  --outcome <value>         Required. Never defaults to success.
  --evidence <text>         Evidence reference (required for successful backup verification)
  --environment <label>     Default: production-provider-check | staging
  --notes <text>            Free-text notes (secrets are redacted)
  --verified-at <ISO>       Optional timestamp
  --actor-label <text>      Default: cli:record-church-backup-verification
`);
}

function parseArgs(argv) {
  const args = { _: [] };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === "--help" || a === "-h") {
      args.help = true;
      continue;
    }
    if (a.startsWith("--")) {
      const key = a.slice(2);
      const val = argv[i + 1];
      if (val == null || val.startsWith("--")) {
        args[key] = true;
      } else {
        args[key] = val;
        i += 1;
      }
      continue;
    }
    args._.push(a);
  }
  return args;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help || !args._.length) {
    usage();
    process.exit(args.help ? 0 : 1);
  }

  const command = String(args._[0] || "").trim().toLowerCase();
  const outcome = String(args.outcome || "").trim().toLowerCase();
  if (!outcome) {
    console.error("Error: --outcome is required and is never defaulted to success.");
    process.exit(1);
  }

  if (!isPgConfigured()) {
    console.error("PostgreSQL is not configured.");
    process.exit(1);
  }

  const pool = getPgPool();
  await ensureChurchSchema(pool);

  const common = {
    outcome,
    verifiedAt: args["verified-at"],
    evidenceReference: args.evidence,
    environmentLabel: args.environment,
    notes: args.notes,
    actorType: "platform_admin",
    actorId: null,
    actorLabel: args["actor-label"] || "cli:record-church-backup-verification",
  };

  let row;
  if (command === "backup") {
    row = await churchBackupVerificationService.recordBackupVerification(pool, common);
  } else if (command === "restoration-test" || command === "restore-test") {
    if (!common.environmentLabel) common.environmentLabel = "staging";
    row = await churchBackupVerificationService.recordRestorationTest(pool, common);
  } else {
    console.error(`Unknown command: ${command}`);
    usage();
    process.exit(1);
  }

  const status = await churchBackupVerificationService.getBackupVerificationStatus(pool);
  console.log(
    JSON.stringify(
      {
        ok: true,
        recorded: {
          id: row.id,
          event_type: row.event_type,
          outcome: row.outcome,
          verified_at: row.verified_at,
        },
        status: {
          status: status.status,
          lastSuccessfulBackupAt: status.lastSuccessfulBackupAt,
          lastRestorationTestAt: status.lastRestorationTestAt,
          health: status.health,
        },
      },
      null,
      2
    )
  );
}

main().catch((err) => {
  console.error(err && err.message ? err.message : err);
  process.exit(1);
});
