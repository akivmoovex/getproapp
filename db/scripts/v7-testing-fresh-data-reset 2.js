#!/usr/bin/env node
"use strict";

/**
 * V7 testing-only fresh business-data reset (schema preserved).
 *
 * Gates:
 *   - DEPLOYMENT_ENV=testing
 *   - platform.database_identity = moovex-platform-v7 / testing
 *   - confirm phrase: CLEAR V7 TESTING BUSINESS DATA
 *
 *   scripts/local/run-with-blessboard-env.sh testing \
 *     node db/scripts/v7-testing-fresh-data-reset.js --dry-run
 *
 *   scripts/local/run-with-blessboard-env.sh testing \
 *     node db/scripts/v7-testing-fresh-data-reset.js \
 *     --confirm 'CLEAR V7 TESTING BUSINESS DATA' \
 *     --backup-dir /tmp/v7-testing-db-backups
 *
 * Never prints DATABASE_URL or passwords.
 */

const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");
const {
  resolveDatabaseUrlSafe,
  requireMatchedIdentity,
  redactSecretsDeep,
  assertNoSecretsInText,
  createProvisionPool,
} = require("./lib/provisionCliSafety");
const bbResetRepo = require("../../src/platform/repositories/testingDataResetRepository");

const CONFIRM_PHRASE = "CLEAR V7 TESTING BUSINESS DATA";
const EXPECTED_IDENTITY = "moovex-platform-v7";
const EXPECTED_ENV = "testing";

function parseArgs(argv) {
  let confirm = "";
  let dryRun = false;
  let backupDir = "";
  let skipBackup = false;
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--dry-run") dryRun = true;
    else if (arg === "--skip-backup") skipBackup = true;
    else if (arg === "--confirm") confirm = String(argv[++i] || "");
    else if (arg.startsWith("--confirm=")) confirm = arg.slice("--confirm=".length);
    else if (arg === "--backup-dir") backupDir = String(argv[++i] || "");
    else if (arg.startsWith("--backup-dir=")) backupDir = arg.slice("--backup-dir=".length);
  }
  return { confirm, dryRun, backupDir, skipBackup };
}

function emit(obj) {
  const text = JSON.stringify(redactSecretsDeep(obj), null, 2);
  assertNoSecretsInText(text);
  // eslint-disable-next-line no-console
  console.log(text);
}

function fingerprintUrl(url) {
  try {
    const u = new URL(url);
    return {
      host: u.hostname.replace(/^(.{2}).+(.{6})$/, "$1***$2"),
      db: (u.pathname || "").replace(/^\//, ""),
      userPrefix: (u.username || "").slice(0, 3) + "***",
    };
  } catch {
    return { parse_error: true };
  }
}

function resolvePgDumpBin() {
  const candidates = [
    process.env.PG_DUMP_BIN,
    "/opt/homebrew/opt/postgresql@17/bin/pg_dump",
    "/usr/local/opt/postgresql@17/bin/pg_dump",
    "pg_dump",
  ].filter(Boolean);
  for (const bin of candidates) {
    if (bin === "pg_dump") return bin;
    try {
      if (fs.existsSync(bin)) return bin;
    } catch (_err) {
      /* continue */
    }
  }
  return "pg_dump";
}

function createBackup(connectionString, backupDir) {
  const dir = backupDir || path.join("/tmp", "v7-testing-db-backups");
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const file = path.join(dir, `moovex-platform-v7-testing-${stamp}.dump`);
  const pgDump = resolvePgDumpBin();
  const result = spawnSync(
    pgDump,
    ["--format=custom", "--no-owner", "--no-acl", "--file", file, connectionString],
    { encoding: "utf8", maxBuffer: 20 * 1024 * 1024 }
  );
  if (result.status !== 0) {
    return {
      ok: false,
      error: String(result.stderr || result.stdout || "pg_dump_failed").slice(0, 400),
      file: null,
      pgDump,
    };
  }
  const stat = fs.statSync(file);
  return {
    ok: true,
    file,
    bytes: stat.size,
    timestamp: stamp,
    pgDump,
    restore: `pg_restore --clean --if-exists --no-owner --dbname=<TESTING_DATABASE_URL> ${file}`,
  };
}

async function truncateActiveClinicSchema(pool) {
  const tables = await pool.query(
    `SELECT quote_ident(n.nspname) || '.' || quote_ident(c.relname) AS qname
       FROM pg_class c
       JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'activeclinic'
        AND c.relkind = 'r'
      ORDER BY c.relname`
  );
  if (!tables.rows.length) {
    return { ok: true, truncated: 0 };
  }
  const list = tables.rows.map((r) => r.qname).join(", ");
  await pool.query(`TRUNCATE TABLE ${list} RESTART IDENTITY CASCADE`);
  return { ok: true, truncated: tables.rows.length, tables: tables.rows.map((r) => r.qname) };
}

/**
 * After AC schema truncate + BB org purge, platform.identities can remain as
 * orphans (no staff/patient/BB user link). Truncate skips identity cleanup;
 * this step removes only unreferenced identities and their tokens/sessions/
 * product profiles. Never deletes identities still linked to remaining users.
 *
 * @param {{ query: Function }} client
 */
async function purgeOrphanPlatformIdentities(client) {
  const linked = await client.query(
    `SELECT platform_identity_id AS id
       FROM blessboard.users
      WHERE platform_identity_id IS NOT NULL
     UNION
     SELECT platform_identity_id
       FROM activeclinic.staff_members
      WHERE platform_identity_id IS NOT NULL
     UNION
     SELECT platform_identity_id
       FROM activeclinic.patients
      WHERE platform_identity_id IS NOT NULL`
  );
  const keepIds = linked.rows.map((r) => String(r.id)).filter(Boolean);

  const orphans = await client.query(
    `SELECT id
       FROM platform.identities
      WHERE cardinality($1::uuid[]) = 0
         OR NOT (id = ANY($1::uuid[]))`,
    [keepIds]
  );
  const orphanIds = orphans.rows.map((r) => String(r.id));

  // Always clear all deployment sessions on testing reset (deterministic QA).
  const allSessions = await client.query(`DELETE FROM platform.deployment_sessions RETURNING id`);

  if (!orphanIds.length) {
    return {
      ok: true,
      orphanIdentitiesDeleted: 0,
      sessionsCleared: allSessions.rowCount || 0,
      tokensCleared: 0,
      profilesCleared: 0,
      transfersCleared: 0,
    };
  }

  const tokens = await client.query(
    `DELETE FROM platform.identity_action_tokens
      WHERE platform_identity_id = ANY($1::uuid[])
         OR created_by_platform_identity_id = ANY($1::uuid[])
      RETURNING id`,
    [orphanIds]
  );
  const profiles = await client.query(
    `DELETE FROM platform.identity_product_profiles
      WHERE identity_id = ANY($1::uuid[])
      RETURNING identity_id`,
    [orphanIds]
  );
  let transfersCleared = 0;
  try {
    const transfers = await client.query(
      `DELETE FROM platform.auth_transfers
        WHERE platform_identity_id = ANY($1::uuid[])
        RETURNING id`,
      [orphanIds]
    );
    transfersCleared = transfers.rowCount || 0;
  } catch (_err) {
    transfersCleared = 0;
  }
  const deleted = await client.query(
    `DELETE FROM platform.identities
      WHERE id = ANY($1::uuid[])
      RETURNING id`,
    [orphanIds]
  );

  return {
    ok: true,
    orphanIdentitiesDeleted: deleted.rowCount || 0,
    sessionsCleared: allSessions.rowCount || 0,
    tokensCleared: tokens.rowCount || 0,
    profilesCleared: profiles.rowCount || 0,
    transfersCleared,
  };
}

async function listAcOrgKeys(pool) {
  const r = await pool.query(
    `SELECT o.organization_key
       FROM platform.organizations o
       INNER JOIN activeclinic.healthcare_organizations h ON h.organization_id = o.id
      WHERE o.test_cleanup_eligible = true
      ORDER BY o.created_at ASC`
  );
  return r.rows.map((row) => String(row.organization_key));
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  let pool = null;
  let exitCode = 0;

  try {
    if (String(process.env.DEPLOYMENT_ENV || "").toLowerCase() !== "testing") {
      emit({ ok: false, code: "deployment_env_not_testing" });
      exitCode = 2;
      return;
    }

    const dbUrl = resolveDatabaseUrlSafe();
    if (!dbUrl.ok) {
      emit({ ok: false, code: "DATABASE_URL_required", message: dbUrl.message });
      exitCode = 2;
      return;
    }

    pool = createProvisionPool(dbUrl.connectionString, { max: 8 });
    const identity = await requireMatchedIdentity(pool);
    if (!identity.ok) {
      emit({ ok: false, code: "identity_blocked", detail: identity });
      exitCode = 2;
      return;
    }
    if (
      identity.identityKey !== EXPECTED_IDENTITY ||
      String(identity.environmentCode || "").toLowerCase() !== EXPECTED_ENV
    ) {
      emit({
        ok: false,
        code: "identity_mismatch",
        expected: { identity: EXPECTED_IDENTITY, env: EXPECTED_ENV },
        actual: {
          identity: identity.identityKey,
          env: identity.environmentCode,
        },
      });
      exitCode = 2;
      return;
    }

    const preserve = await bbResetRepo.listPlatformAdminPreserveSet(pool);
    const preCounts = await bbResetRepo.countResettableCategories(pool, {
      preserveOrgIds: preserve.orgIds,
      preserveUserIds: preserve.userIds,
    });
    // Prefer org list via platform product enrolment when HCO rows already truncated.
    const acKeysRes = await pool.query(
      `SELECT o.organization_key
         FROM platform.organizations o
         INNER JOIN platform.organization_products op ON op.organization_id = o.id
         INNER JOIN platform.products p ON p.id = op.product_id
        WHERE o.test_cleanup_eligible = true
          AND p.product_key = 'activeclinic'
        ORDER BY o.created_at ASC`
    ).catch(() => ({ rows: [] }));
    let acKeys = acKeysRes.rows.map((row) => String(row.organization_key));
    if (!acKeys.length) {
      acKeys = await listAcOrgKeys(pool);
    }

    const plan = {
      ok: true,
      mode: args.dryRun || args.confirm !== CONFIRM_PHRASE ? "dry_run" : "apply",
      identity: {
        identity_key: identity.identityKey,
        environment_code: identity.environmentCode,
        database_instance_id: identity.row && identity.row.database_instance_id,
      },
      dbFingerprint: fingerprintUrl(dbUrl.connectionString),
      preserve: {
        platformAdminUsers: preserve.userIds.length,
        platformAdminOrgs: preserve.orgIds.length,
      },
      preCounts,
      acOrganizations: acKeys,
      confirmRequired: CONFIRM_PHRASE,
    };

    if (plan.mode === "dry_run") {
      emit({
        ...plan,
        note:
          args.confirm && args.confirm !== CONFIRM_PHRASE
            ? "confirm_phrase_mismatch"
            : "pass --confirm with exact phrase to apply",
      });
      return;
    }

    let backup = null;
    if (!args.skipBackup) {
      backup = createBackup(dbUrl.connectionString, args.backupDir);
      if (!backup.ok) {
        emit({ ok: false, code: "backup_failed", backup, plan });
        exitCode = 3;
        return;
      }
    }

    const acTruncate = await truncateActiveClinicSchema(pool);
    const acResults = [];
    for (const organizationKey of acKeys) {
      // After schema truncate, platform org rows may remain; purge via BB tree.
      acResults.push({
        organizationKey,
        ok: true,
        reason: "schema_truncated_pending_platform_org_purge",
        status: "ok",
      });
    }

    // BB org tree purge (remaining cleanup-eligible orgs, including churches).
    const client = await pool.connect();
    const bbResults = [];
    let mediaObjects = [];
    try {
      const targets = await bbResetRepo.listResettableOrganizations(client, preserve.orgIds);
      for (const target of targets) {
        await client.query("BEGIN");
        try {
          const result = await bbResetRepo.purgeOrganizationTree(client, {
            organizationId: target.id,
            preserveOrgIds: preserve.orgIds,
            preserveUserIds: preserve.userIds,
          });
          if (!result.ok) {
            await client.query("ROLLBACK");
            bbResults.push({
              organizationKey: target.organizationKey,
              status: "skipped",
              reason: result.reason,
            });
            continue;
          }
          await client.query("COMMIT");
          if (result.mediaObjects && result.mediaObjects.length) {
            mediaObjects = mediaObjects.concat(result.mediaObjects);
          }
          bbResults.push({
            organizationKey: target.organizationKey,
            status: "deleted",
          });
        } catch (err) {
          try {
            await client.query("ROLLBACK");
          } catch (_e) {
            /* ignore */
          }
          bbResults.push({
            organizationKey: target.organizationKey,
            status: "failed",
            reason: String(err && err.message ? err.message : err).slice(0, 200),
          });
          emit({
            ok: false,
            code: "bb_purge_failed",
            organizationKey: target.organizationKey,
            error: String(err && err.message ? err.message : err).slice(0, 200),
            backup,
            acResults,
            bbResults,
          });
          exitCode = 5;
          return;
        }
      }

      await client.query("BEGIN");
      const regs = await bbResetRepo.deleteRegistrationApplications(client);
      const invites = await bbResetRepo.deleteAllInvitations(client);
      await client.query(
        `DELETE FROM activeclinic.clinic_registration_applications
          WHERE organization_id IS NULL`
      );
      const orphanPurge = await purgeOrphanPlatformIdentities(client);
      await client.query("COMMIT");

      const postOrgs = await client.query(
        `SELECT count(*)::int AS n FROM platform.organizations`
      );
      const postIdentities = await client.query(
        `SELECT count(*)::int AS n FROM platform.identities`
      );
      const postIdentity = await client.query(
        `SELECT identity_key, environment_code FROM platform.database_identity LIMIT 1`
      );
      const postMigrations = await client.query(
        `SELECT count(*)::int AS n FROM platform.schema_migrations`
      );

      emit({
        ok: true,
        mode: "applied",
        backup,
        acTruncate,
        identity: postIdentity.rows[0],
        schemaMigrations: postMigrations.rows[0].n,
        organizationsRemaining: postOrgs.rows[0].n,
        identitiesRemaining: postIdentities.rows[0].n,
        orphanIdentityPurge: orphanPurge,
        registrationsDeleted: regs,
        invitationsDeleted: invites,
        acResults,
        bbResults,
        mediaObjectKeysListed: mediaObjects.length,
        mediaNote:
          "DB media rows deleted with tenants; object-storage orphans may remain in the testing bucket only.",
        next:
          "Bootstrap QA fixtures with blessboard:seed-qa-role-users and activeclinic:seed-qa-role-users after recreating canonical tenants via registration or seed scripts.",
      });
    } finally {
      client.release();
    }
  } catch (err) {
    emit({
      ok: false,
      code: "unexpected",
      message: String(err && err.message ? err.message : err).slice(0, 400),
    });
    exitCode = 1;
  } finally {
    if (pool) await pool.end().catch(() => {});
  }

  process.exitCode = exitCode;
}

main();
