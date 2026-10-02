#!/usr/bin/env node
"use strict";

/**
 * Reset a BlessBoard V5 user password. DATABASE_URL + identity required.
 * Dry-run is the default. Writes require --confirm.
 * Password must be supplied via --password-stdin only (never --password argv).
 */

const {
  parseWriteMode,
  resolveDatabaseUrlSafe,
  createProvisionPool,
  requireMatchedIdentity,
  assertNoLegacyPublicTables,
  buildProvisionReport,
  emitProvisionReport,
  assertNoSecretsInText,
} = require("./lib/provisionCliSafety");
const {
  resetBlessBoardUserPassword,
  STATUS,
} = require("../../src/blessboard/services/resetBlessBoardUserPassword");
const { normalizeEmail } = require("../../src/blessboard/services/createBlessBoardUser");
const { getPlatformDeploymentCode } = require("../../src/platform/config/platformDeploymentCode");

function parseArgs(argv) {
  const out = {
    email: "",
    passwordStdin: false,
    passwordFromArgv: false,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    const next = () => String(argv[++i] || "");
    const take = (prefix) => arg.slice(prefix.length);
    if (arg === "--email") out.email = next();
    else if (arg.startsWith("--email=")) out.email = take("--email=");
    else if (arg === "--password-stdin") out.passwordStdin = true;
    else if (arg === "--password" || arg.startsWith("--password=")) {
      out.passwordFromArgv = true;
      if (arg === "--password") i += 1; // consume value without storing
    }
  }
  return out;
}

function readStdinPassword() {
  return new Promise((resolve, reject) => {
    const chunks = [];
    process.stdin.setEncoding("utf8");
    process.stdin.on("data", (c) => chunks.push(c));
    process.stdin.on("end", () => resolve(chunks.join("").replace(/\r?\n$/, "")));
    process.stdin.on("error", reject);
  });
}

async function main() {
  const mode = parseWriteMode(process.argv.slice(2));
  const args = parseArgs(mode.rest);
  let exitCode = 0;
  let passwordConsumed = false;

  const finish = (payload) => {
    const preview = payload.preview || null;
    const report = buildProvisionReport({
      tool: "blessboard:user:password-reset",
      dryRun: mode.dryRun,
      ok: payload.ok,
      status: payload.status,
      message: payload.message,
      planned: preview
        ? {
            password_update: true,
            sessions_to_invalidate: preview.activeSessionCount,
            platform_admin_role: preview.hasActivePlatformAdminRole,
            password_meets_policy: preview.passwordMeetsPolicy,
          }
        : payload.planned || null,
      created: payload.result
        ? {
            password_updated: payload.ok && payload.status === STATUS.RESET,
            sessions_revoked: payload.result.sessionsRevoked,
          }
        : null,
      identityKey: payload.identityKey,
      environmentCode: payload.environmentCode,
      databaseName: payload.databaseName,
      hostFingerprint: payload.hostFingerprint,
      deploymentCode: payload.deploymentCode,
      keys: {
        email: normalizeEmail(args.email) || null,
        account_status: preview ? preview.accountStatus : null,
        has_active_platform_admin_role: preview ? preview.hasActivePlatformAdminRole : null,
        login_eligible: preview ? preview.loginEligible : null,
        password_meets_policy: preview ? preview.passwordMeetsPolicy : null,
        active_sessions: preview ? preview.activeSessionCount : null,
        requires_confirm: preview ? preview.requiresConfirm : mode.dryRun,
      },
      error: payload.error,
    });
    assertNoSecretsInText(report.human, payload.connectionString);
    assertNoSecretsInText(JSON.stringify(report.machine), payload.connectionString);
    emitProvisionReport(report);
    if (payload.ok === true) {
      exitCode = 0;
    } else {
      exitCode = payload.exitCode != null ? Number(payload.exitCode) : 2;
    }
  };

  if (args.passwordFromArgv) {
    finish({
      ok: false,
      status: STATUS.ARGV_PASSWORD_FORBIDDEN,
      message: "password_must_use_stdin",
      error: "Use --password-stdin only; --password argv is forbidden.",
    });
    process.exit(exitCode);
  }

  if (!String(args.email || "").trim()) {
    finish({
      ok: false,
      status: STATUS.INVALID_INPUT,
      message: "missing_required_arguments",
      error: "email",
    });
    process.exit(exitCode);
  }

  let password = null;
  if (args.passwordStdin) {
    password = await readStdinPassword();
    passwordConsumed = true;
  } else if (!mode.dryRun) {
    finish({
      ok: false,
      status: STATUS.INVALID_INPUT,
      message: "password_required_via_stdin",
      error: "Pass the new password on stdin with --password-stdin.",
    });
    process.exit(exitCode);
  }

  // Dry-run without stdin: allow preview of user/sessions; policy flagged unmet.
  if (mode.dryRun && !passwordConsumed) {
    password = null;
  }

  const dbResolved = resolveDatabaseUrlSafe();
  if (!dbResolved.ok) {
    finish({
      ok: false,
      status: STATUS.TRANSACTION_ERROR,
      message: dbResolved.message,
      error: dbResolved.detail || "database_unreachable",
      exitCode: 1,
    });
    process.exit(exitCode);
  }

  const deploy = getPlatformDeploymentCode(process.env);
  const deploymentCode = deploy && deploy.ok ? deploy.code : "blessboard-org-v5";

  const pool = createProvisionPool(dbResolved.connectionString, { max: 2 });
  try {
    // Connectivity probe (no secrets).
    await pool.query("SELECT 1 AS ok");

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
        exitCode: 1,
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
        exitCode: 1,
      });
      return;
    }

    const result = await resetBlessBoardUserPassword(pool, {
      email: args.email,
      password,
      dryRun: mode.dryRun,
      passwordFromArgv: false,
      deploymentCode,
    });

    finish({
      ok: result.ok,
      status: result.status,
      message: result.message,
      preview: result.preview,
      result: result.result,
      identityKey: identity.identityKey,
      environmentCode: identity.environmentCode,
      databaseName: dbResolved.databaseName,
      hostFingerprint: dbResolved.hostFingerprint,
      deploymentCode,
      connectionString: dbResolved.connectionString,
      exitCode: result.ok ? 0 : result.status === STATUS.TRANSACTION_ERROR ? 1 : 2,
    });
  } catch {
    finish({
      ok: false,
      status: STATUS.TRANSACTION_ERROR,
      message: "database_unreachable_or_cli_failure",
      error: "Safe diagnostic: database query failed. Check DATABASE_URL reachability.",
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
