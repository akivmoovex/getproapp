#!/usr/bin/env node
"use strict";

/**
 * Idempotent repair for approved churches whose public miniwebsite is incomplete
 * (missing pages / still draft). Does not change valid organization_key values.
 *
 * Dry-run is the default. Writes require --confirm.
 *
 * Usage:
 *   DATABASE_URL=… DATABASE_IDENTITY_EXPECTED=… npm run blessboard:public-miniwebsite:repair -- \
 *     --organization-key grace-community-church
 *
 *   … --application-id <uuid>
 *   … --organization-id <uuid>
 *   … --confirm
 */

const { Pool } = require("pg");
const {
  parseWriteMode,
  resolveDatabaseUrlSafe,
  requireMatchedIdentity,
  assertNoLegacyPublicTables,
  assertDeploymentTarget,
  buildProvisionReport,
  emitProvisionReport,
  assertNoSecretsInText,
} = require("./lib/provisionCliSafety");
const {
  repairPublicMiniwebsite,
} = require("../../src/blessboard/services/publicMiniwebsiteRepairService");

function parseArgs(argv) {
  const out = {
    organizationKey: "",
    organizationId: "",
    applicationId: "",
    deployment: "",
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    const next = () => String(argv[++i] || "");
    const take = (prefix) => arg.slice(prefix.length);
    if (arg === "--organization-key") out.organizationKey = next();
    else if (arg.startsWith("--organization-key=")) {
      out.organizationKey = take("--organization-key=");
    } else if (arg === "--organization-id") out.organizationId = next();
    else if (arg.startsWith("--organization-id=")) {
      out.organizationId = take("--organization-id=");
    } else if (arg === "--application-id") out.applicationId = next();
    else if (arg.startsWith("--application-id=")) {
      out.applicationId = take("--application-id=");
    } else if (arg === "--deployment") out.deployment = next();
    else if (arg.startsWith("--deployment=")) out.deployment = take("--deployment=");
  }
  return out;
}

async function main() {
  const mode = parseWriteMode(process.argv.slice(2));
  const args = parseArgs(mode.rest);
  let exitCode = 0;

  const finish = (payload) => {
    const report = buildProvisionReport({
      tool: "blessboard:public-miniwebsite:repair",
      dryRun: mode.dryRun,
      ok: Boolean(payload.ok),
      status: payload.status || "error",
      message: payload.message,
      error: payload.error,
      planned: payload.planned,
      created: payload.created,
      identityKey: payload.identityKey,
      environmentCode: payload.environmentCode,
      deploymentCode: payload.deploymentCode,
      databaseName: payload.databaseName,
      hostFingerprint: payload.hostFingerprint,
      keys: payload.keys,
    });
    assertNoSecretsInText(report.human, payload.connectionString);
    assertNoSecretsInText(JSON.stringify(report.machine), payload.connectionString);
    emitProvisionReport(report);
    exitCode = payload.ok === true ? 0 : payload.exitCode != null ? Number(payload.exitCode) : 2;
  };

  if (!args.organizationKey && !args.organizationId && !args.applicationId) {
    finish({
      ok: false,
      status: "invalid_input",
      message: "missing_target",
      error: "organization-key|organization-id|application-id",
    });
    process.exit(exitCode);
  }

  const dbResolved = resolveDatabaseUrlSafe();
  if (!dbResolved.ok) {
    finish({
      ok: false,
      status: "error",
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
        status: "error",
        message: identity.message,
        error: identity.code || identity.identity_code,
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
        status: "error",
        message: legacy.message,
        error: (legacy.tables || []).join(","),
        identityKey: identity.identityKey,
        databaseName: dbResolved.databaseName,
        hostFingerprint: dbResolved.hostFingerprint,
        connectionString: dbResolved.connectionString,
      });
      return;
    }

    const deploymentCode =
      String(args.deployment || "").trim() ||
      String(process.env.PLATFORM_DEPLOYMENT_CODE || "").trim() ||
      "blessboard-org-v5";
    const deployment = await assertDeploymentTarget(pool, deploymentCode);
    if (!deployment.ok) {
      finish({
        ok: false,
        status: "error",
        message: deployment.message,
        error: deployment.detail,
        identityKey: identity.identityKey,
        databaseName: dbResolved.databaseName,
        hostFingerprint: dbResolved.hostFingerprint,
        connectionString: dbResolved.connectionString,
      });
      return;
    }

    const result = await repairPublicMiniwebsite(pool, {
      organizationKey: args.organizationKey || null,
      organizationId: args.organizationId || null,
      applicationId: args.applicationId || null,
      dryRun: mode.dryRun,
      env: process.env,
    });

    finish({
      ok: Boolean(result && result.ok),
      status: (result && result.status) || "error",
      message: (result && result.reason) || null,
      error: result && !result.ok ? result.reason : null,
      planned: result && result.plannedActions,
      created: result && result.after,
      keys: {
        organization_key:
          (result && result.after && result.after.organizationKey) ||
          (result && result.before && result.before.organizationKey) ||
          args.organizationKey ||
          null,
        public_path:
          (result && result.after && result.after.publicPath) ||
          (result && result.before && result.before.publicPath) ||
          null,
        needs_repair: Boolean(result && result.needsRepair),
        applied: Boolean(result && result.applied),
        website_status_before: result && result.before && result.before.websiteStatus,
        website_status_after: result && result.after && result.after.websiteStatus,
      },
      identityKey: identity.identityKey,
      environmentCode: identity.environmentCode,
      deploymentCode,
      databaseName: dbResolved.databaseName,
      hostFingerprint: dbResolved.hostFingerprint,
      connectionString: dbResolved.connectionString,
      exitCode: result && result.status === "not_found" ? 3 : undefined,
    });
  } finally {
    await pool.end().catch(() => {});
  }

  process.exit(exitCode);
}

main().catch((err) => {
  console.error(
    JSON.stringify({
      ok: false,
      error: String((err && err.message) || err).slice(0, 300),
    })
  );
  process.exit(1);
});
