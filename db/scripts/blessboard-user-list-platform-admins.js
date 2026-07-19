#!/usr/bin/env node
"use strict";

/**
 * Read-only list of BlessBoard V5 platform_admin accounts.
 * Never prints password hashes, sessions, secrets, or DATABASE_URL.
 * Dry-run / no writes. Does not fall back to GETPRO_DATABASE_URL.
 */

const { Pool } = require("pg");
const {
  resolveDatabaseUrlSafe,
  requireMatchedIdentity,
  assertNoLegacyPublicTables,
  assertNoSecretsInText,
} = require("./lib/provisionCliSafety");
const authRepo = require("../../src/blessboard/repositories/blessBoardAuthRepository");

async function main() {
  let exitCode = 0;
  const dbResolved = resolveDatabaseUrlSafe();
  if (!dbResolved.ok) {
    const machine = {
      ok: false,
      tool: "blessboard:user:list-platform-admins",
      status: "database_unreachable",
      message: dbResolved.message,
      detail: dbResolved.detail || undefined,
    };
    // eslint-disable-next-line no-console
    console.log(JSON.stringify(machine, null, 2));
    // eslint-disable-next-line no-console
    console.error(
      "[blessboard:user:list-platform-admins] DATABASE_URL missing or GETPRO_DATABASE_URL forbidden. Stop."
    );
    process.exit(1);
  }

  const pool = new Pool({ connectionString: dbResolved.connectionString, max: 2 });
  try {
    await pool.query("SELECT 1 AS ok");

    const identity = await requireMatchedIdentity(pool);
    if (!identity.ok) {
      // eslint-disable-next-line no-console
      console.log(
        JSON.stringify(
          {
            ok: false,
            tool: "blessboard:user:list-platform-admins",
            status: "identity_required",
            message: identity.message,
            host_fingerprint: dbResolved.hostFingerprint,
            database: dbResolved.databaseName,
          },
          null,
          2
        )
      );
      exitCode = 1;
      return;
    }

    const legacy = await assertNoLegacyPublicTables(pool);
    if (!legacy.ok) {
      // eslint-disable-next-line no-console
      console.log(
        JSON.stringify(
          {
            ok: false,
            tool: "blessboard:user:list-platform-admins",
            status: "legacy_tables_present",
            message: legacy.message,
          },
          null,
          2
        )
      );
      exitCode = 1;
      return;
    }

    const rows = await authRepo.listPlatformAdministrators(pool);
    const accounts = (rows || []).map((row) => {
      const accountStatus = String(row.account_status || "");
      const roleStatus = String(row.role_status || "");
      const loginEligible = accountStatus === "active" && roleStatus === "active";
      return {
        user_id: String(row.id),
        display_name: String(row.display_name || ""),
        email_normalized: String(row.email_normalized || ""),
        account_status: accountStatus,
        role_code: String(row.role_code || "platform_admin"),
        role_status: roleStatus,
        created_at: row.created_at || null,
        last_login_at: row.last_login_at || null,
        login_eligible: loginEligible,
      };
    });

    const machine = {
      ok: true,
      tool: "blessboard:user:list-platform-admins",
      status: "ok",
      connectivity: "ok",
      identity_key: identity.identityKey,
      database_environment: identity.environmentCode || null,
      host_fingerprint: dbResolved.hostFingerprint,
      database: dbResolved.databaseName,
      platform_admin_count: accounts.length,
      active_eligible_count: accounts.filter((a) => a.login_eligible).length,
      accounts,
    };

    const text = JSON.stringify(machine, null, 2);
    assertNoSecretsInText(text, dbResolved.connectionString);
    // eslint-disable-next-line no-console
    console.log(text);
    // eslint-disable-next-line no-console
    console.error(
      `[blessboard:user:list-platform-admins] ok count=${accounts.length} eligible=${machine.active_eligible_count}`
    );
  } catch {
    // eslint-disable-next-line no-console
    console.log(
      JSON.stringify(
        {
          ok: false,
          tool: "blessboard:user:list-platform-admins",
          status: "database_unreachable",
          message:
            "Safe diagnostic: database could not be reached. Confirm DATABASE_URL from the ops environment.",
          host_fingerprint: dbResolved.hostFingerprint,
          database: dbResolved.databaseName,
        },
        null,
        2
      )
    );
    exitCode = 1;
  } finally {
    await pool.end().catch(() => {});
    process.exit(exitCode);
  }
}

main();
