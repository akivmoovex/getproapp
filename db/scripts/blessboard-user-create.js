#!/usr/bin/env node
"use strict";

/**
 * Create a BlessBoard V5 user. DATABASE_URL + identity required.
 * Dry-run is the default. Writes require --confirm.
 * Password required only for --confirm (prefer --password-stdin).
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
  createBlessBoardUser,
  STATUS,
} = require("../../src/blessboard/services/createBlessBoardUser");
const authRepo = require("../../src/blessboard/repositories/blessBoardAuthRepository");

function parseArgs(argv) {
  const out = {
    email: "",
    displayName: "",
    passwordStdin: false,
    password: "",
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    const next = () => String(argv[++i] || "");
    const take = (prefix) => arg.slice(prefix.length);
    if (arg === "--email") out.email = next();
    else if (arg.startsWith("--email=")) out.email = take("--email=");
    else if (arg === "--display-name") out.displayName = next();
    else if (arg.startsWith("--display-name=")) out.displayName = take("--display-name=");
    else if (arg === "--password-stdin") out.passwordStdin = true;
    else if (arg === "--password") out.password = next();
    else if (arg.startsWith("--password=")) out.password = take("--password=");
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

function normalizeEmail(raw) {
  return String(raw || "")
    .trim()
    .toLowerCase();
}

async function planUserCreate(pool, email, displayName) {
  const emailNormalized = normalizeEmail(email);
  const existing = await authRepo.findUserByEmail(pool, emailNormalized);
  if (!existing) {
    return {
      ok: true,
      status: "dry_run_would_create",
      planned: { user: true },
    };
  }
  if (String(existing.display_name) === String(displayName).trim() && String(existing.status) === "active") {
    return {
      ok: true,
      status: "dry_run_already_exists",
      planned: { user: false },
    };
  }
  return {
    ok: false,
    status: STATUS.IDENTITY_CONFLICT,
    message: "identity_conflict",
    planned: null,
  };
}

async function main() {
  const mode = parseWriteMode(process.argv.slice(2));
  const args = parseArgs(mode.rest);
  let exitCode = 0;

  const finish = (payload) => {
    const report = buildProvisionReport({
      tool: "blessboard:user:create",
      dryRun: mode.dryRun,
      ok: payload.ok,
      status: payload.status,
      message: payload.message,
      planned: payload.planned,
      created: payload.created,
      identityKey: payload.identityKey,
      environmentCode: payload.environmentCode,
      databaseName: payload.databaseName,
      hostFingerprint: payload.hostFingerprint,
      keys: {
        email: normalizeEmail(args.email) || null,
        display_name: String(args.displayName || "").trim() || null,
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

  if (!String(args.email || "").trim() || !String(args.displayName || "").trim()) {
    finish({
      ok: false,
      status: STATUS.INVALID_INPUT,
      message: "missing_required_arguments",
      error: "email,displayName",
    });
    process.exit(exitCode);
  }

  let password = args.password;
  if (!mode.dryRun) {
    if (args.passwordStdin) {
      password = await readStdinPassword();
    }
    if (!password) {
      finish({
        ok: false,
        status: STATUS.INVALID_INPUT,
        message: "password_required_via_stdin_or_flag",
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

    if (mode.dryRun) {
      const plan = await planUserCreate(pool, args.email, args.displayName);
      finish({
        ok: plan.ok,
        status: plan.status,
        message: plan.message,
        planned: plan.planned,
        identityKey: identity.identityKey,
        environmentCode: identity.environmentCode,
        databaseName: dbResolved.databaseName,
        hostFingerprint: dbResolved.hostFingerprint,
        connectionString: dbResolved.connectionString,
      });
      return;
    }

    const result = await createBlessBoardUser(pool, {
      email: args.email,
      displayName: args.displayName,
      password,
    });
    finish({
      ok: result.ok,
      status: result.status,
      message: result.message,
      created: result.ok ? { user: result.status === STATUS.CREATED } : null,
      planned: null,
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
