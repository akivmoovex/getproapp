#!/usr/bin/env node
"use strict";

/**
 * Set the shared testing password on an ActiveClinic QA clinic-admin identity,
 * through the approved credential service (setPlatformIdentityPassword).
 *
 * Safety:
 *   - refuses unless the connected database is the V7 testing identity
 *   - refuses unless DEPLOYMENT_ENV=testing
 *   - refuses organizations that are not testing + test_cleanup_eligible
 *   - dry-run by default; writes only with --confirm
 *   - password is read from stdin only, never argv, never printed
 *
 * Usage:
 *   scripts/local/run-with-blessboard-env.sh testing \
 *     node scripts/local/qa-set-ac-admin-password.js --email=<addr> [--confirm] --password-stdin
 */

const { Pool } = require("pg");
const { readIdentityRow } = require("../../db/scripts/lib/databaseIdentity");
const {
  setPlatformIdentityPassword,
} = require("../../src/platform/services/platformIdentityCredentialService");

function arg(name) {
  const hit = process.argv.slice(2).find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : null;
}

async function readStdin() {
  const chunks = [];
  for await (const c of process.stdin) chunks.push(c);
  return Buffer.concat(chunks).toString("utf8").trim();
}

async function main() {
  const argv = process.argv.slice(2);
  if (argv.some((a) => a.startsWith("--password="))) {
    console.error("refusing --password on argv; use --password-stdin");
    process.exit(2);
  }
  const email = arg("email");
  if (!email) {
    console.error("--email=<address> is required");
    process.exit(2);
  }
  const confirm = argv.includes("--confirm");
  const env = process.env;
  if (String(env.DEPLOYMENT_ENV || "") !== "testing") {
    console.error("refusing: DEPLOYMENT_ENV must be testing");
    process.exit(2);
  }

  const pool = new Pool({
    connectionString: env.DATABASE_URL,
    ssl: env.GETPRO_PG_SSL === "no-verify" ? { rejectUnauthorized: false } : undefined,
    max: 2,
    application_name: "qa-set-ac-admin-password",
  });

  try {
    const identity = await readIdentityRow(pool);
    if (!identity || identity.identity_key !== "moovex-platform-v7" || identity.environment_code !== "testing") {
      console.error("refusing: not the V7 testing database");
      process.exit(2);
    }

    const r = await pool.query(
      `SELECT pi.id, pi.primary_email, pi.status,
              o.organization_key, o.data_environment, o.test_cleanup_eligible
         FROM platform.identities pi
         JOIN activeclinic.staff_members sm ON sm.platform_identity_id = pi.id
         JOIN platform.organizations o ON o.id = sm.organization_id
        WHERE pi.email_normalized = lower($1)`,
      [email]
    );
    if (!r.rows.length) {
      console.error(`no ActiveClinic staff identity for ${email}`);
      process.exit(1);
    }
    const row = r.rows[0];
    if (row.data_environment !== "testing" || row.test_cleanup_eligible !== true) {
      console.error(
        `refusing: ${row.organization_key} is not a disposable testing org (env=${row.data_environment}, cleanupEligible=${row.test_cleanup_eligible})`
      );
      process.exit(2);
    }

    console.log(`target: ${row.primary_email} (identity ${row.id}) in ${row.organization_key} [${row.status}]`);
    if (!confirm) {
      console.log("dry-run: would set the shared testing password. Re-run with --confirm to write.");
      return;
    }

    const password = argv.includes("--password-stdin") ? await readStdin() : null;
    if (!password) {
      console.error("no password on stdin; pass --password-stdin and pipe the value");
      process.exit(2);
    }

    const result = await setPlatformIdentityPassword(pool, {
      identityId: row.id,
      password,
      mustChangePassword: false,
    });
    console.log(`setPlatformIdentityPassword: ok=${result.ok} code=${result.code}`);
    if (!result.ok) process.exit(1);
    console.log("password updated (value not logged)");
  } finally {
    await pool.end();
  }
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
