#!/usr/bin/env node
"use strict";

/**
 * Assign a BlessBoard V5 role. DATABASE_URL + identity required.
 * Dry-run is the default. Writes require --confirm.
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
  assignBlessBoardRole,
  STATUS,
} = require("../../src/blessboard/services/assignBlessBoardRole");

function parseArgs(argv) {
  const out = {
    email: "",
    organizationKey: "",
    role: "",
    churchKey: "",
    branchKey: "",
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    const next = () => String(argv[++i] || "");
    const take = (prefix) => arg.slice(prefix.length);
    if (arg === "--email") out.email = next();
    else if (arg.startsWith("--email=")) out.email = take("--email=");
    else if (arg === "--organization-key") out.organizationKey = next();
    else if (arg.startsWith("--organization-key=")) out.organizationKey = take("--organization-key=");
    else if (arg === "--role") out.role = next();
    else if (arg.startsWith("--role=")) out.role = take("--role=");
    else if (arg === "--church-key") out.churchKey = next();
    else if (arg.startsWith("--church-key=")) out.churchKey = take("--church-key=");
    else if (arg === "--branch-key") out.branchKey = next();
    else if (arg.startsWith("--branch-key=")) out.branchKey = take("--branch-key=");
  }
  return out;
}

async function main() {
  const mode = parseWriteMode(process.argv.slice(2));
  const args = parseArgs(mode.rest);
  let exitCode = 0;

  const finish = (payload) => {
    const report = buildProvisionReport({
      tool: "blessboard:user:role:assign",
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
        email: String(args.email || "").trim().toLowerCase() || null,
        organization_key: args.organizationKey || null,
        role: args.role || null,
        church_key: args.churchKey || null,
        branch_key: args.branchKey || null,
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

  const required = [
    ["email", args.email],
    ["organizationKey", args.organizationKey],
    ["role", args.role],
  ];
  const missing = required.filter(([, v]) => !String(v || "").trim()).map(([k]) => k);
  if (missing.length) {
    finish({
      ok: false,
      status: STATUS.INVALID_INPUT,
      message: "missing_required_arguments",
      error: missing.join(","),
    });
    process.exit(exitCode);
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

  const pool = createProvisionPool(dbResolved.connectionString, { max: 2 });
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

    const result = await assignBlessBoardRole(pool, {
      email: args.email,
      organizationKey: args.organizationKey,
      roleKey: args.role,
      churchKey: args.churchKey || null,
      branchKey: args.branchKey || null,
      dryRun: mode.dryRun,
    });
    finish({
      ok: result.ok,
      status: result.status,
      message: result.message,
      planned: result.planned || null,
      created: result.ok && !mode.dryRun ? { role: result.status === STATUS.ASSIGNED } : null,
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
