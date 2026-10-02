#!/usr/bin/env node
"use strict";

/**
 * Explicit administrative BlessBoard church + HQ branch provisioner.
 * Never runs during startup or migrations. DATABASE_URL only. Never prints secrets.
 *
 * Dry-run is the default. Writes require --confirm.
 *
 * Usage (preview):
 *   DATABASE_URL=… DATABASE_IDENTITY_EXPECTED=… npm run blessboard:church:provision -- \
 *     --organization-key diagnostic-church \
 *     --church-key diagnostic-church \
 *     --display-name "BlessBoard Diagnostic Church" \
 *     --environment testing \
 *     --hq-branch-key hq \
 *     --hq-branch-name "Headquarters" \
 *     --deployment blessboard-org-v5
 *
 * Usage (write): same args + --confirm
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
  provisionBlessBoardChurch,
  STATUS,
} = require("../../src/blessboard/services/provisionBlessBoardChurch");

function parseArgs(argv) {
  const out = {
    organizationKey: "",
    churchKey: "",
    displayName: "",
    legalName: "",
    environment: "",
    hqBranchKey: "",
    hqBranchName: "",
    timezone: "",
    countryCode: "",
    deployment: "",
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    const next = () => String(argv[++i] || "");
    const take = (prefix) => arg.slice(prefix.length);
    if (arg === "--organization-key") out.organizationKey = next();
    else if (arg.startsWith("--organization-key=")) out.organizationKey = take("--organization-key=");
    else if (arg === "--church-key") out.churchKey = next();
    else if (arg.startsWith("--church-key=")) out.churchKey = take("--church-key=");
    else if (arg === "--display-name") out.displayName = next();
    else if (arg.startsWith("--display-name=")) out.displayName = take("--display-name=");
    else if (arg === "--legal-name") out.legalName = next();
    else if (arg.startsWith("--legal-name=")) out.legalName = take("--legal-name=");
    else if (arg === "--environment") out.environment = next();
    else if (arg.startsWith("--environment=")) out.environment = take("--environment=");
    else if (arg === "--hq-branch-key") out.hqBranchKey = next();
    else if (arg.startsWith("--hq-branch-key=")) out.hqBranchKey = take("--hq-branch-key=");
    else if (arg === "--hq-branch-name") out.hqBranchName = next();
    else if (arg.startsWith("--hq-branch-name=")) out.hqBranchName = take("--hq-branch-name=");
    else if (arg === "--timezone") out.timezone = next();
    else if (arg.startsWith("--timezone=")) out.timezone = take("--timezone=");
    else if (arg === "--country-code") out.countryCode = next();
    else if (arg.startsWith("--country-code=")) out.countryCode = take("--country-code=");
    else if (arg === "--deployment") out.deployment = next();
    else if (arg.startsWith("--deployment=")) out.deployment = take("--deployment=");
  }
  return out;
}

/**
 * Resolve deployment to verify: explicit --deployment, else PLATFORM_DEPLOYMENT_CODE,
 * else first active domain for the organization.
 */
async function resolveChurchDeployment(pool, organizationKey, explicitDeployment) {
  const code =
    String(explicitDeployment || "").trim() ||
    String(process.env.PLATFORM_DEPLOYMENT_CODE || "").trim();
  if (code) {
    return assertDeploymentTarget(pool, code);
  }
  const r = await pool.query(
    `SELECT d.deployment_code, COUNT(*)::int AS n
       FROM platform.domains d
       JOIN platform.organizations o ON o.id = d.organization_id
      WHERE o.organization_key = $1 AND d.status = 'active'
      GROUP BY d.deployment_code`,
    [String(organizationKey).trim().toLowerCase()]
  );
  if (r.rowCount === 0) {
    return { ok: false, message: "deployment_code_required" };
  }
  if (r.rowCount > 1) {
    return {
      ok: false,
      message: "deployment_ambiguous",
      detail: r.rows.map((row) => row.deployment_code).join(","),
    };
  }
  return assertDeploymentTarget(pool, r.rows[0].deployment_code);
}

async function main() {
  const mode = parseWriteMode(process.argv.slice(2));
  const args = parseArgs(mode.rest);
  let exitCode = 0;

  const finish = (payload) => {
    const report = buildProvisionReport({
      tool: "blessboard:church:provision",
      dryRun: mode.dryRun,
      ok: Boolean(payload.ok),
      status: payload.status || STATUS.TRANSACTION_ERROR,
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
    if (payload.ok === true) {
      exitCode = 0;
    } else {
      exitCode = payload.exitCode != null ? Number(payload.exitCode) : 2;
    }
  };

  const required = [
    ["organizationKey", args.organizationKey],
    ["churchKey", args.churchKey],
    ["displayName", args.displayName],
    ["environment", args.environment],
    ["hqBranchKey", args.hqBranchKey],
    ["hqBranchName", args.hqBranchName],
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

  const pool = new Pool({ connectionString: dbResolved.connectionString, max: 2 });

  try {
    const identity = await requireMatchedIdentity(pool);
    if (!identity.ok) {
      finish({
        ok: false,
        status: STATUS.TRANSACTION_ERROR,
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

    const deployment = await resolveChurchDeployment(pool, args.organizationKey, args.deployment);
    if (!deployment.ok) {
      finish({
        ok: false,
        status: STATUS.TRANSACTION_ERROR,
        message: deployment.message,
        error: deployment.detail,
        identityKey: identity.identityKey,
        databaseName: dbResolved.databaseName,
        hostFingerprint: dbResolved.hostFingerprint,
        connectionString: dbResolved.connectionString,
      });
      return;
    }

    const result = await provisionBlessBoardChurch(pool, {
      organizationKey: args.organizationKey,
      churchKey: args.churchKey,
      displayName: args.displayName,
      legalName: args.legalName || null,
      dataEnvironment: args.environment,
      hqBranchKey: args.hqBranchKey,
      hqBranchDisplayName: args.hqBranchName,
      timezone: args.timezone || null,
      countryCode: args.countryCode || null,
      dryRun: mode.dryRun,
    });

    finish({
      ok: result.ok,
      status: result.status,
      message: result.message,
      planned: result.planned || null,
      created: result.created || null,
      identityKey: identity.identityKey,
      environmentCode: identity.environmentCode,
      deploymentCode: deployment.deploymentCode,
      databaseName: dbResolved.databaseName,
      hostFingerprint: dbResolved.hostFingerprint,
      connectionString: dbResolved.connectionString,
      keys: {
        organization_key: args.organizationKey,
        church_key: args.churchKey,
        hq_branch_key: args.hqBranchKey,
        deployment: deployment.deploymentCode,
      },
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
