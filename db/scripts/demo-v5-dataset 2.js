#!/usr/bin/env node
"use strict";

/**
 * Prepare the sparse BlessBoard V5 minimum demo dataset for one org/church/deployment.
 * Dry-run by default. Writes require --confirm. Never creates passwords.
 * Does not touch hosted data unless DATABASE_URL + identity deliberately point there.
 * Refuses legacy V4 tenant/session tables and GETPRO URL fallback (see provisionCliSafety).
 *
 * Preview:
 *   DATABASE_URL=… DATABASE_IDENTITY_EXPECTED=… npm run demo:v5:plan -- \
 *     --organization-key diagnostic-church \
 *     --church-key diagnostic-church \
 *     --deployment blessboard-org-v5 \
 *     --hostname diagnostic.blessboard.org
 *
 * Apply:
 *   … npm run demo:v5:apply -- --confirm \
 *     --organization-key … --church-key … --deployment … [--hostname …] [--actor-email …]
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
  redactSecretsDeep,
} = require("./lib/provisionCliSafety");
const {
  prepareDemoMinimumDataset,
  STATUS,
} = require("../../src/blessboard/services/demoMinimumDatasetService");
const { PAGES } = require("../../src/blessboard/services/demoMinimumDatasetSpec");

function parseArgs(argv) {
  const out = {
    organizationKey: "",
    churchKey: "",
    deployment: "",
    hostname: "",
    displayName: "",
    environment: "testing",
    hqBranchKey: "hq",
    hqBranchName: "Headquarters",
    actorEmail: "",
    productTenantKey: "",
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    const next = () => String(argv[++i] || "");
    const take = (prefix) => arg.slice(prefix.length);
    if (arg === "--organization-key") out.organizationKey = next();
    else if (arg.startsWith("--organization-key=")) out.organizationKey = take("--organization-key=");
    else if (arg === "--church-key") out.churchKey = next();
    else if (arg.startsWith("--church-key=")) out.churchKey = take("--church-key=");
    else if (arg === "--deployment") out.deployment = next();
    else if (arg.startsWith("--deployment=")) out.deployment = take("--deployment=");
    else if (arg === "--hostname") out.hostname = next();
    else if (arg.startsWith("--hostname=")) out.hostname = take("--hostname=");
    else if (arg === "--display-name") out.displayName = next();
    else if (arg.startsWith("--display-name=")) out.displayName = take("--display-name=");
    else if (arg === "--environment") out.environment = next();
    else if (arg.startsWith("--environment=")) out.environment = take("--environment=");
    else if (arg === "--hq-branch-key") out.hqBranchKey = next();
    else if (arg.startsWith("--hq-branch-key=")) out.hqBranchKey = take("--hq-branch-key=");
    else if (arg === "--hq-branch-name") out.hqBranchName = next();
    else if (arg.startsWith("--hq-branch-name=")) out.hqBranchName = take("--hq-branch-name=");
    else if (arg === "--actor-email") out.actorEmail = next();
    else if (arg.startsWith("--actor-email=")) out.actorEmail = take("--actor-email=");
    else if (arg === "--product-tenant-key") out.productTenantKey = next();
    else if (arg.startsWith("--product-tenant-key=")) out.productTenantKey = take("--product-tenant-key=");
  }
  return out;
}

function summarizeActions(actions) {
  const counts = {};
  for (const a of actions || []) {
    const s = a && a.status ? String(a.status) : "unknown";
    counts[s] = (counts[s] || 0) + 1;
  }
  return {
    total: (actions || []).length,
    by_status: counts,
    page_keys: PAGES.map((p) => p.pageKey),
  };
}

async function main() {
  const mode = parseWriteMode(process.argv.slice(2));
  const args = parseArgs(mode.rest);
  let exitCode = 0;

  const finish = (payload) => {
    const report = buildProvisionReport({
      tool: "demo:v5",
      dryRun: mode.dryRun,
      ok: Boolean(payload.ok),
      status: payload.status || STATUS.ERROR,
      message: payload.message,
      error: payload.error,
      planned: payload.planned,
      identityKey: payload.identityKey,
      environmentCode: payload.environmentCode,
      deploymentCode: payload.deploymentCode,
      databaseName: payload.databaseName,
      hostFingerprint: payload.hostFingerprint,
      keys: payload.keys,
    });
    report.machine.actions = redactSecretsDeep(payload.actions || null);
    report.machine.cleanup_index = redactSecretsDeep(payload.cleanupIndex || null);
    report.machine.action_summary = redactSecretsDeep(payload.actionSummary || null);
    report.machine.notes = redactSecretsDeep(payload.notes || null);
    report.machine.dates = redactSecretsDeep(payload.dates || null);
    if (payload.detail) report.machine.detail = redactSecretsDeep(payload.detail);

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
    ["deployment", args.deployment],
  ];
  const missing = required.filter(([, v]) => !String(v || "").trim()).map(([k]) => k);
  if (missing.length) {
    finish({
      ok: false,
      status: STATUS.BLOCKED,
      message: "missing_required_arguments",
      error: missing.join(","),
    });
    process.exit(exitCode);
  }

  const dbResolved = resolveDatabaseUrlSafe();
  if (!dbResolved.ok) {
    finish({
      ok: false,
      status: STATUS.BLOCKED,
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
        status: STATUS.BLOCKED,
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
        status: STATUS.BLOCKED,
        message: legacy.message,
        error: (legacy.tables || []).join(","),
        identityKey: identity.identityKey,
        databaseName: dbResolved.databaseName,
        hostFingerprint: dbResolved.hostFingerprint,
        connectionString: dbResolved.connectionString,
      });
      return;
    }

    const deployment = await assertDeploymentTarget(pool, args.deployment);
    if (!deployment.ok) {
      finish({
        ok: false,
        status: STATUS.BLOCKED,
        message: deployment.message,
        error: deployment.detail || deployment.expected || deployment.deploymentCode,
        identityKey: identity.identityKey,
        databaseName: dbResolved.databaseName,
        hostFingerprint: dbResolved.hostFingerprint,
        connectionString: dbResolved.connectionString,
      });
      return;
    }

    const result = await prepareDemoMinimumDataset(pool, {
      dryRun: mode.dryRun,
      organizationKey: args.organizationKey,
      churchKey: args.churchKey,
      deploymentCode: deployment.deploymentCode,
      hostname: args.hostname || null,
      displayName: args.displayName || null,
      dataEnvironment: args.environment,
      hqBranchKey: args.hqBranchKey,
      hqBranchName: args.hqBranchName,
      actorEmail: args.actorEmail || null,
      productTenantKey: args.productTenantKey || args.churchKey,
    });

    finish({
      ok: result.ok,
      status: result.status,
      message: result.message,
      detail: result.detail || null,
      planned: summarizeActions(result.actions),
      actions: result.actions,
      cleanupIndex: result.cleanupIndex,
      actionSummary: summarizeActions(result.actions),
      notes: result.notes,
      dates: result.dates,
      identityKey: identity.identityKey,
      environmentCode: identity.environmentCode,
      deploymentCode: deployment.deploymentCode,
      databaseName: dbResolved.databaseName,
      hostFingerprint: dbResolved.hostFingerprint,
      connectionString: dbResolved.connectionString,
      keys: result.keys || {
        organization_key: args.organizationKey,
        church_key: args.churchKey,
        deployment: deployment.deploymentCode,
      },
    });
  } catch (err) {
    finish({
      ok: false,
      status: STATUS.ERROR,
      message: "cli_failure",
      error: err && err.message ? String(err.message).slice(0, 120) : null,
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
