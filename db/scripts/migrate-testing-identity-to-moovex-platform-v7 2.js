#!/usr/bin/env node
"use strict";

/**
 * TESTING-ONLY: rename platform.database_identity.identity_key
 *   blessboard-platform-v5 → moovex-platform-v7
 * while keeping environment_code=testing.
 *
 * Hard gates:
 * - DEPLOYMENT_ENV=testing (or DATABASE_IDENTITY_ENV=testing)
 * - connected row must be exactly identity_key=blessboard-platform-v5 + environment_code=testing
 *   (or already moovex-platform-v7 / testing → idempotent no-op)
 * - refuses environment_code=production
 * - refuses GETPRO_DATABASE_URL as the connection source (DATABASE_URL only)
 * - requires --confirm migrate-testing-identity-to-moovex-platform-v7
 *
 * Never prints credentials or full DATABASE_URL.
 *
 * Usage:
 *   scripts/local/run-with-blessboard-env.sh testing \
 *     node db/scripts/migrate-testing-identity-to-moovex-platform-v7.js \
 *     --confirm migrate-testing-identity-to-moovex-platform-v7
 */

const { Pool } = require("pg");
const { requireDatabaseUrl, parseDatabaseName, envStringIsSet } = require("./lib/databaseUrl");
const { sanitizeHostFingerprint } = require("./lib/hostFingerprint");
const { buildFoundationPoolConfig } = require("./lib/foundationPool");
const {
  readIdentityRow,
  identityTableExists,
  normalizeIdentityKey,
} = require("./lib/databaseIdentity");

const CONFIRM_PHRASE = "migrate-testing-identity-to-moovex-platform-v7";
const FROM_KEY = "blessboard-platform-v5";
const TO_KEY = "moovex-platform-v7";
const REQUIRED_ENV = "testing";

function parseArgs(argv) {
  const out = { confirm: null, dryRun: false };
  for (let i = 2; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === "--dry-run") out.dryRun = true;
    else if (a === "--confirm") {
      out.confirm = argv[i + 1] != null ? String(argv[i + 1]) : "";
      i += 1;
    }
  }
  return out;
}

function supabaseProjectHint(connectionString) {
  try {
    const u = new URL(String(connectionString).replace(/^postgresql:/i, "postgres:"));
    const user = u.username || "";
    if (user.includes(".")) {
      const ref = user.split(".").slice(1).join(".");
      return `${ref.slice(0, 8)}…`;
    }
    return "(no-project-ref-in-user)";
  } catch (_err) {
    return "(unparseable)";
  }
}

function assertTestingOnlySafety(connectionString) {
  if (envStringIsSet(process.env.GETPRO_DATABASE_URL)) {
    // Allowed to be unset; if set, refuse so we never confuse dual URLs.
    return {
      ok: false,
      code: "getpro_database_url_present",
      message:
        "Refusing: GETPRO_DATABASE_URL is set. Unset it and use DATABASE_URL (testing) only.",
    };
  }

  const deploymentEnv = String(process.env.DEPLOYMENT_ENV || "")
    .trim()
    .toLowerCase();
  const identityEnv = String(process.env.DATABASE_IDENTITY_ENV || "")
    .trim()
    .toLowerCase();
  if (deploymentEnv !== REQUIRED_ENV && identityEnv !== REQUIRED_ENV) {
    return {
      ok: false,
      code: "not_testing_env",
      message:
        `Refusing: require DEPLOYMENT_ENV=testing or DATABASE_IDENTITY_ENV=testing ` +
        `(got DEPLOYMENT_ENV=${deploymentEnv || "(unset)"} DATABASE_IDENTITY_ENV=${identityEnv || "(unset)"}).`,
    };
  }
  if (deploymentEnv === "production" || identityEnv === "production") {
    return {
      ok: false,
      code: "production_env_marker",
      message: "Refusing: production environment marker present.",
    };
  }

  return {
    ok: true,
    deploymentEnv: deploymentEnv || "(unset)",
    identityEnv: identityEnv || "(unset)",
    hostFingerprint: sanitizeHostFingerprint(connectionString),
    projectHint: supabaseProjectHint(connectionString),
    databaseName: parseDatabaseName(connectionString),
  };
}

async function main() {
  const args = parseArgs(process.argv);
  if (args.confirm !== CONFIRM_PHRASE) {
    // eslint-disable-next-line no-console
    console.error(
      `[migrate-testing-identity] Refusing without --confirm ${CONFIRM_PHRASE}`
    );
    process.exit(2);
  }

  let connectionString;
  try {
    connectionString = requireDatabaseUrl();
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error(`[migrate-testing-identity] ${err.message}`);
    process.exit(1);
  }

  const safety = assertTestingOnlySafety(connectionString);
  if (!safety.ok) {
    // eslint-disable-next-line no-console
    console.error(`[migrate-testing-identity] ${safety.message}`);
    process.exit(2);
  }

  const pool = new Pool(buildFoundationPoolConfig(connectionString, { max: 1 }));

  try {
    if (!(await identityTableExists(pool))) {
      // eslint-disable-next-line no-console
      console.error("[migrate-testing-identity] platform.database_identity missing.");
      process.exit(1);
    }

    const before = await readIdentityRow(pool);
    if (!before) {
      // eslint-disable-next-line no-console
      console.error("[migrate-testing-identity] No identity row (id=1).");
      process.exit(1);
    }

    const beforeKey = before.identity_key ? normalizeIdentityKey(before.identity_key) : "";
    const beforeEnv = String(before.environment_code || "")
      .trim()
      .toLowerCase();

    const proof = {
      ok: true,
      phase: "pre_mutation",
      PRODUCTION_TOUCHED: "NO",
      dry_run: args.dryRun,
      DEPLOYMENT_ENV: safety.deploymentEnv,
      DATABASE_IDENTITY_ENV: safety.identityEnv,
      live_host_fingerprint: safety.hostFingerprint,
      project_hint: safety.projectHint,
      database_name: safety.databaseName,
      database_instance_id: before.database_instance_id,
      before: { identity_key: beforeKey, environment_code: beforeEnv },
    };

    if (beforeEnv === "production") {
      // eslint-disable-next-line no-console
      console.error(
        JSON.stringify(
          {
            ...proof,
            ok: false,
            code: "production_identity_row",
            message: "Refusing: identity row environment_code=production.",
            PRODUCTION_TOUCHED: "NO",
          },
          null,
          2
        )
      );
      process.exit(2);
    }

    if (beforeEnv !== REQUIRED_ENV) {
      // eslint-disable-next-line no-console
      console.error(
        JSON.stringify(
          {
            ...proof,
            ok: false,
            code: "unexpected_environment_code",
            message: `Refusing: expected environment_code=${REQUIRED_ENV}, got ${beforeEnv}`,
          },
          null,
          2
        )
      );
      process.exit(2);
    }

    if (beforeKey === TO_KEY) {
      // eslint-disable-next-line no-console
      console.log(
        JSON.stringify(
          {
            ...proof,
            result: "already_migrated",
            after: { identity_key: beforeKey, environment_code: beforeEnv },
            rows_affected: 0,
          },
          null,
          2
        )
      );
      return;
    }

    if (beforeKey !== FROM_KEY) {
      // eslint-disable-next-line no-console
      console.error(
        JSON.stringify(
          {
            ...proof,
            ok: false,
            code: "unexpected_identity_key",
            message: `Refusing: expected identity_key=${FROM_KEY}, got ${beforeKey || "(null)"}`,
          },
          null,
          2
        )
      );
      process.exit(2);
    }

    if (args.dryRun) {
      // eslint-disable-next-line no-console
      console.log(
        JSON.stringify(
          {
            ...proof,
            result: "dry_run_ok",
            would_update_to: { identity_key: TO_KEY, environment_code: REQUIRED_ENV },
          },
          null,
          2
        )
      );
      return;
    }

    const upd = await pool.query(
      `UPDATE platform.database_identity
          SET identity_key = $1,
              updated_at = now()
        WHERE id = 1
          AND environment_code = $2
          AND identity_key = $3
        RETURNING id, identity_key, environment_code, database_instance_id, database_name, host_fingerprint, updated_at`,
      [TO_KEY, REQUIRED_ENV, FROM_KEY]
    );

    if (upd.rowCount !== 1) {
      // eslint-disable-next-line no-console
      console.error(
        JSON.stringify(
          {
            ...proof,
            ok: false,
            code: "update_rowcount_mismatch",
            message: `Expected 1 row updated, got ${upd.rowCount}. No change assumed.`,
            rows_affected: upd.rowCount,
          },
          null,
          2
        )
      );
      process.exit(1);
    }

    const after = await readIdentityRow(pool);
    const afterKey = after.identity_key ? normalizeIdentityKey(after.identity_key) : "";
    const afterEnv = String(after.environment_code || "")
      .trim()
      .toLowerCase();

    if (afterKey !== TO_KEY || afterEnv !== REQUIRED_ENV) {
      // eslint-disable-next-line no-console
      console.error(
        JSON.stringify(
          {
            ...proof,
            ok: false,
            code: "post_readback_mismatch",
            after: { identity_key: afterKey, environment_code: afterEnv },
            rows_affected: upd.rowCount,
          },
          null,
          2
        )
      );
      process.exit(1);
    }

    // eslint-disable-next-line no-console
    console.log(
      JSON.stringify(
        {
          ...proof,
          phase: "post_mutation",
          result: "migrated",
          after: { identity_key: afterKey, environment_code: afterEnv },
          rows_affected: upd.rowCount,
          PRODUCTION_TOUCHED: "NO",
        },
        null,
        2
      )
    );
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error(
      `[migrate-testing-identity] ${err && err.message ? err.message : String(err)}`
    );
    process.exit(1);
  } finally {
    await pool.end();
  }
}

main();
