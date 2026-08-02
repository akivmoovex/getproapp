#!/usr/bin/env node
"use strict";

/**
 * Prompt 11B diagnostics: phone identity data quality (testing only).
 * Reports aggregates only — never prints personal phone numbers or emails.
 *
 * Usage (testing env):
 *   set -a && source .env.testing.local && set +a
 *   node db/scripts/blessboard-phone-identity-diagnostics.js
 */

const { Pool } = require("pg");
const {
  checkDatabaseIdentity,
  validateIdentityKey,
} = require("./lib/databaseIdentity");
const { requireDatabaseUrl } = require("./lib/databaseUrl");
const { buildFoundationPoolConfig } = require("./lib/foundationPool");
const {
  normalizeBlessBoardPhone,
} = require("../../src/blessboard/services/normalizeBlessBoardPhone");

async function main() {
  const connectionString = requireDatabaseUrl();
  const expectedKeyRaw = process.env.DATABASE_IDENTITY_EXPECTED;
  const envCode = String(process.env.DATABASE_IDENTITY_ENV || "").trim().toLowerCase();
  const deploymentEnv = String(process.env.DEPLOYMENT_ENV || "").trim().toLowerCase();

  if (deploymentEnv === "production" || envCode === "production") {
    // eslint-disable-next-line no-console
    console.error("[phone-identity-diagnostics] Refusing to run against production.");
    process.exit(1);
  }

  const keyCheck = validateIdentityKey(expectedKeyRaw);
  if (!keyCheck.ok) {
    // eslint-disable-next-line no-console
    console.error("[phone-identity-diagnostics] DATABASE_IDENTITY_EXPECTED is missing or invalid.");
    process.exit(1);
  }

  const pool = new Pool(buildFoundationPoolConfig(connectionString, { max: 2 }));
  try {
    const identity = await checkDatabaseIdentity(pool, { identityKey: keyCheck.key });
    if (!identity.ok) {
      // eslint-disable-next-line no-console
      console.error(`[phone-identity-diagnostics] ${identity.message}`);
      process.exit(1);
    }
    if (String(identity.row.environment_code) !== "testing") {
      // eslint-disable-next-line no-console
      console.error(
        `[phone-identity-diagnostics] Refusing: environment_code=${identity.row.environment_code} (allowCreate: false / testing only).`
      );
      process.exit(1);
    }

    const usersTotal = await pool.query(`SELECT COUNT(*)::int AS n FROM blessboard.users`);
    const usersMissingPhone = await pool.query(
      `SELECT COUNT(*)::int AS n FROM blessboard.users WHERE phone_normalized IS NULL`
    );
    const usersEmailOnly = await pool.query(
      `SELECT COUNT(*)::int AS n
         FROM blessboard.users
        WHERE phone_normalized IS NULL
          AND email_normalized IS NOT NULL`
    );
    const usersPhoneOnly = await pool.query(
      `SELECT COUNT(*)::int AS n
         FROM blessboard.users
        WHERE phone_normalized IS NOT NULL
          AND email_normalized IS NULL`
    );
    const usersVerifiedPhone = await pool.query(
      `SELECT COUNT(*)::int AS n
         FROM blessboard.users
        WHERE phone_verified_at IS NOT NULL`
    );
    const usersUnverifiedPhone = await pool.query(
      `SELECT COUNT(*)::int AS n
         FROM blessboard.users
        WHERE phone_normalized IS NOT NULL
          AND phone_verified_at IS NULL`
    );

    const membersMissingPhone = await pool.query(
      `SELECT COUNT(*)::int AS n
         FROM blessboard.members
        WHERE phone_normalized IS NULL
          AND status IN ('active', 'pending')`
    );
    const membersTotal = await pool.query(
      `SELECT COUNT(*)::int AS n
         FROM blessboard.members
        WHERE status IN ('active', 'pending')`
    );

    const staffDupes = await pool.query(
      `SELECT organization_id, phone_normalized, COUNT(*)::int AS n
         FROM blessboard.organization_staff_phones
        GROUP BY organization_id, phone_normalized
       HAVING COUNT(*) > 1`
    );

    const memberDupes = await pool.query(
      `SELECT church_id, phone_normalized, COUNT(*)::int AS n
         FROM blessboard.members
        WHERE phone_normalized IS NOT NULL
          AND status IN ('active', 'pending')
        GROUP BY church_id, phone_normalized
       HAVING COUNT(*) > 1`
    );

    // Sample up to 500 user phones for normalization validity (counts only).
    const sample = await pool.query(
      `SELECT phone_normalized, phone_display
         FROM blessboard.users
        WHERE phone_normalized IS NOT NULL OR phone_display IS NOT NULL
        ORDER BY created_at DESC
        LIMIT 500`
    );
    let invalidNormalized = 0;
    let cannotNormalizeDisplay = 0;
    for (const row of sample.rows) {
      if (row.phone_normalized) {
        const check = normalizeBlessBoardPhone(row.phone_normalized, {
          requireCountry: true,
        });
        if (!check.ok || check.normalized !== row.phone_normalized) {
          invalidNormalized += 1;
        }
      } else if (row.phone_display) {
        const check = normalizeBlessBoardPhone(row.phone_display);
        if (!check.ok) cannotNormalizeDisplay += 1;
      }
    }

    const report = {
      ok: true,
      identity: {
        identity_key: identity.row.identity_key,
        environment_code: identity.row.environment_code,
      },
      users: {
        total: usersTotal.rows[0].n,
        missing_phone: usersMissingPhone.rows[0].n,
        email_only: usersEmailOnly.rows[0].n,
        phone_only: usersPhoneOnly.rows[0].n,
        phone_verified: usersVerifiedPhone.rows[0].n,
        phone_unverified: usersUnverifiedPhone.rows[0].n,
      },
      members: {
        active_or_pending: membersTotal.rows[0].n,
        missing_phone: membersMissingPhone.rows[0].n,
      },
      duplicates: {
        organization_staff_phone_duplicate_groups: staffDupes.rowCount,
        member_phone_duplicate_groups: memberDupes.rowCount,
      },
      sample_validation: {
        sampled_rows: sample.rowCount,
        invalid_stored_normalized: invalidNormalized,
        display_cannot_normalize: cannotNormalizeDisplay,
      },
      note: "No personal phone numbers or emails are included in this report.",
    };

    // eslint-disable-next-line no-console
    console.log(JSON.stringify(report, null, 2));
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error("[phone-identity-diagnostics]", err && err.message ? err.message : err);
  process.exit(1);
});
