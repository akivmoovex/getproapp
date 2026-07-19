#!/usr/bin/env node
"use strict";

/**
 * Seed one BlessBoard V5 test user per canonical persona.
 * Dry-run by default. Writes require --confirm.
 *
 * Safety: refuses NODE_ENV=production unless BLESSBOARD_ALLOW_TEST_USERS_IN_PRODUCTION=true.
 * Also requires NODE_ENV=test, DEPLOYMENT_ENV=testing, or BLESSBOARD_ALLOW_TEST_USERS=true
 * (production override alone is accepted only with the explicit production flag).
 *
 * Preview:
 *   npm run blessboard:test-users:seed
 *
 * Write:
 *   npm run blessboard:test-users:seed -- --confirm
 *   npm run blessboard:test-users:seed -- --confirm --reset-passwords
 */

const { Pool } = require("pg");
const {
  parseWriteMode,
  resolveDatabaseUrlSafe,
  requireMatchedIdentity,
  assertNoLegacyPublicTables,
  buildProvisionReport,
  emitProvisionReport,
  assertNoSecretsInText,
} = require("./lib/provisionCliSafety");
const {
  seedBlessBoardTestUsers,
  STATUS,
  TEST_PASSWORD,
  PRODUCTION_OVERRIDE_ENV,
  discoverCanonicalRoles,
  outputContainsSecrets,
  FIXTURE,
} = require("../../src/blessboard/services/seedBlessBoardTestUsers");

function parseArgs(argv) {
  const out = { resetPasswords: false };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--reset-passwords") out.resetPasswords = true;
  }
  return out;
}

function printLocalSummary(payload) {
  const lines = [];
  lines.push("");
  lines.push("=== BlessBoard V5 test users (local summary) ===");
  lines.push(
    "WARNING: Temporary shared testing password is for initial testing only. Do not use in production."
  );
  lines.push(`Organization: ${FIXTURE.organizationDisplayName} (${FIXTURE.organizationKey})`);
  lines.push(`HQ branch: ${FIXTURE.hqBranchKey} | Campus: ${FIXTURE.campusBranchKey}`);
  lines.push(`Hostname: ${FIXTURE.hostname}`);
  const discovered = payload.discovered || discoverCanonicalRoles();
  lines.push(`user_roles keys: ${discovered.userRoleKeys.join(", ")}`);
  lines.push(`personas: ${discovered.personas.join(", ")}`);
  for (const u of discovered.unsupportedLoginRoles || []) {
    lines.push(`unsupported: ${u.key} — ${u.reason}`);
  }
  if (payload.preview && payload.preview.users) {
    lines.push("Preview users:");
    for (const u of payload.preview.users) {
      lines.push(
        `  - ${u.email} action=${u.userAction} role=${u.roleAction || "n/a"} member=${u.memberAction || "n/a"}`
      );
    }
  }
  if (payload.result && payload.result.loginTable) {
    lines.push("Login table (testing-only):");
    lines.push("  Role | Email | Temporary password | Expected portal");
    for (const row of payload.result.loginTable) {
      lines.push(
        `  ${row.role} | ${row.email} | ${row.temporaryPassword} | ${row.expectedPortal}`
      );
    }
    lines.push(
      "Replace or delete these accounts before production launch. Temporary shared testing password must not remain."
    );
  } else if (!payload.dryRun && payload.ok) {
    lines.push(`Shared temporary testing password (do not log elsewhere): ${TEST_PASSWORD}`);
  }
  const text = lines.join("\n");
  if (outputContainsSecrets(text) || /\$2[aby]\$/.test(text)) {
    throw new Error("Refusing to print secret material in local summary");
  }
  // eslint-disable-next-line no-console
  console.error(text);
}

async function main() {
  const mode = parseWriteMode(process.argv.slice(2));
  const args = parseArgs(mode.rest);
  let exitCode = 0;

  // Strong warning always (stderr) — password value only after confirmed seed in local summary.
  // eslint-disable-next-line no-console
  console.error(
    "[blessboard:test-users:seed] WARNING: Uses a temporary shared testing password for fixtures only. Never deploy these accounts to production."
  );

  const finish = (payload) => {
    const report = buildProvisionReport({
      tool: "blessboard:test-users:seed",
      dryRun: mode.dryRun,
      ok: Boolean(payload.ok),
      status: payload.status || STATUS.TRANSACTION_ERROR,
      message: payload.message,
      error: payload.error || payload.detail,
      planned: payload.preview
        ? {
            organization: payload.preview.infrastructure
              ? payload.preview.infrastructure.organization === "create"
              : false,
            users: (payload.preview.users || []).some((u) => u.userAction === "create"),
            roles: (payload.preview.users || []).some((u) => u.roleAction === "assign"),
            members: (payload.preview.users || []).some((u) => u.memberAction === "link_member"),
            writes: false,
          }
        : payload.result
          ? {
              organization: Boolean(payload.result.created && payload.result.created.organization),
              users: (payload.result.created && payload.result.created.users) || [],
              roles: (payload.result.created && payload.result.created.roles) || [],
              members: (payload.result.created && payload.result.created.members) || [],
            }
          : null,
      identityKey: payload.identityKey,
      environmentCode: payload.environmentCode,
      deploymentCode: FIXTURE.deploymentCode,
      databaseName: payload.databaseName,
      hostFingerprint: payload.hostFingerprint,
      keys: {
        organization_key: FIXTURE.organizationKey,
        church_key: FIXTURE.churchKey,
        hq_branch_key: FIXTURE.hqBranchKey,
        campus_branch_key: FIXTURE.campusBranchKey,
        reset_passwords: args.resetPasswords ? "yes" : "no",
      },
    });
    report.machine.discovered_roles = payload.discovered || discoverCanonicalRoles();
    report.machine.unsupported_roles =
      (payload.discovered && payload.discovered.unsupportedLoginRoles) ||
      discoverCanonicalRoles().unsupportedLoginRoles;
    if (payload.preview) report.machine.preview = payload.preview;
    if (payload.warning) report.machine.warning = payload.warning;
    // Never put login table / plaintext password into JSON machine report.
    assertNoSecretsInText(report.human, payload.connectionString);
    assertNoSecretsInText(JSON.stringify(report.machine), payload.connectionString);
    if (outputContainsSecrets(JSON.stringify(report.machine))) {
      throw new Error("Refusing to emit report with secret material");
    }
    emitProvisionReport(report);
    try {
      printLocalSummary({
        ok: payload.ok,
        dryRun: mode.dryRun,
        discovered: payload.discovered,
        preview: payload.preview,
        result: mode.dryRun ? null : payload.result,
      });
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error(`[blessboard:test-users:seed] summary_omitted: ${err.message}`);
    }
    if (payload.ok === true) {
      exitCode = 0;
    } else {
      exitCode = payload.exitCode != null ? Number(payload.exitCode) : 2;
    }
  };

  const envGate = {
    // Re-checked inside service; fail fast for clear CLI messaging.
  };
  void envGate;

  if (String(process.env.NODE_ENV || "").toLowerCase() === "production") {
    if (String(process.env[PRODUCTION_OVERRIDE_ENV] || "").toLowerCase() !== "true") {
      finish({
        ok: false,
        status: STATUS.REFUSED_PRODUCTION,
        message: "refused_production",
        error: `${PRODUCTION_OVERRIDE_ENV} required for production`,
      });
      process.exit(exitCode);
    }
  }

  const dbResolved = resolveDatabaseUrlSafe();
  if (!dbResolved.ok) {
    finish({
      ok: false,
      status: STATUS.TRANSACTION_ERROR,
      message: dbResolved.message,
      error: dbResolved.detail,
    });
    process.exit(exitCode);
  }

  const pool = new Pool({ connectionString: dbResolved.connectionString, max: 2 });
  try {
    const identity = await requireMatchedIdentity(pool);
    if (!identity.ok) {
      finish({
        ok: false,
        status: STATUS.TRANSACTION_ERROR,
        message: identity.message,
        error: identity.code,
        databaseName: dbResolved.databaseName,
        hostFingerprint: dbResolved.hostFingerprint,
        connectionString: dbResolved.connectionString,
      });
      return;
    }

    const legacy = await assertNoLegacyPublicTables(pool);
    if (!legacy.ok) {
      finish({
        ok: false,
        status: STATUS.TRANSACTION_ERROR,
        message: legacy.message,
        error: (legacy.tables || []).join(","),
        identityKey: identity.identityKey,
        databaseName: dbResolved.databaseName,
        hostFingerprint: dbResolved.hostFingerprint,
        connectionString: dbResolved.connectionString,
      });
      return;
    }

    const result = await seedBlessBoardTestUsers(pool, {
      dryRun: mode.dryRun,
      resetPasswords: args.resetPasswords,
      env: process.env,
    });

    finish({
      ok: result.ok,
      status: result.status,
      message: result.message,
      detail: result.detail,
      discovered: result.discovered,
      preview: result.preview,
      result: result.result,
      warning: result.warning,
      identityKey: identity.identityKey,
      environmentCode: identity.environmentCode,
      databaseName: dbResolved.databaseName,
      hostFingerprint: dbResolved.hostFingerprint,
      connectionString: dbResolved.connectionString,
    });
  } catch {
    finish({
      ok: false,
      status: STATUS.TRANSACTION_ERROR,
      message: "cli_failure",
      exitCode: 1,
      databaseName: dbResolved.databaseName,
      hostFingerprint: dbResolved.hostFingerprint,
      connectionString: dbResolved.connectionString,
    });
  } finally {
    await pool.end();
    process.exit(exitCode);
  }
}

main();
