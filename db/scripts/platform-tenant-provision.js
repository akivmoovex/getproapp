#!/usr/bin/env node
"use strict";

/**
 * Explicit administrative platform tenant catalogue provisioner.
 * Never runs during startup or migrations. DATABASE_URL only. Never prints secrets.
 *
 * Dry-run is the default. Writes require --confirm.
 *
 * Usage (preview):
 *   DATABASE_URL=… DATABASE_IDENTITY_EXPECTED=blessboard-platform-v5 \
 *     npm run platform:tenant:provision -- \
 *     --organization-key diagnostic-church \
 *     --display-name "BlessBoard Diagnostic Church" \
 *     --environment testing \
 *     --product blessboard \
 *     --tenant-key diagnostic-church \
 *     --hostname diagnostic.blessboard.org \
 *     --domain-type canonical \
 *     --deployment blessboard-org-staging
 *
 * Usage (write):
 *   … same args … --confirm
 */

const {
  parseWriteMode,
  resolveDatabaseUrlSafe,
  createProvisionPool,
  requireMatchedIdentity,
  assertNoLegacyPublicTables,
  assertDeploymentTarget,
  buildProvisionReport,
  emitProvisionReport,
  assertNoSecretsInText,
} = require("./lib/provisionCliSafety");
const {
  provisionPlatformTenant,
  STATUS,
} = require("../../src/platform/services/provisionPlatformTenant");

function parseArgs(argv) {
  const out = {
    organizationKey: "",
    displayName: "",
    legalName: "",
    environment: "",
    product: "",
    tenantKey: "",
    hostname: "",
    domainType: "",
    deployment: "",
    primary: undefined,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    const next = () => String(argv[++i] || "");
    const take = (prefix) => arg.slice(prefix.length);
    if (arg === "--organization-key") out.organizationKey = next();
    else if (arg.startsWith("--organization-key=")) out.organizationKey = take("--organization-key=");
    else if (arg === "--display-name") out.displayName = next();
    else if (arg.startsWith("--display-name=")) out.displayName = take("--display-name=");
    else if (arg === "--legal-name") out.legalName = next();
    else if (arg.startsWith("--legal-name=")) out.legalName = take("--legal-name=");
    else if (arg === "--environment") out.environment = next();
    else if (arg.startsWith("--environment=")) out.environment = take("--environment=");
    else if (arg === "--product") out.product = next();
    else if (arg.startsWith("--product=")) out.product = take("--product=");
    else if (arg === "--tenant-key") out.tenantKey = next();
    else if (arg.startsWith("--tenant-key=")) out.tenantKey = take("--tenant-key=");
    else if (arg === "--hostname") out.hostname = next();
    else if (arg.startsWith("--hostname=")) out.hostname = take("--hostname=");
    else if (arg === "--domain-type") out.domainType = next();
    else if (arg.startsWith("--domain-type=")) out.domainType = take("--domain-type=");
    else if (arg === "--deployment") out.deployment = next();
    else if (arg.startsWith("--deployment=")) out.deployment = take("--deployment=");
    else if (arg === "--primary") out.primary = next();
    else if (arg.startsWith("--primary=")) out.primary = take("--primary=");
  }
  return out;
}

function parsePrimary(raw) {
  if (raw === undefined || raw === "") return true;
  const v = String(raw).trim().toLowerCase();
  if (v === "1" || v === "true" || v === "yes") return true;
  if (v === "0" || v === "false" || v === "no") return false;
  return null;
}

async function main() {
  const mode = parseWriteMode(process.argv.slice(2));
  const args = parseArgs(mode.rest);
  let exitCode = 0;

  const finish = (payload) => {
    const report = buildProvisionReport({
      tool: "platform:tenant:provision",
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
    ["displayName", args.displayName],
    ["environment", args.environment],
    ["product", args.product],
    ["tenantKey", args.tenantKey],
    ["hostname", args.hostname],
    ["domainType", args.domainType],
    ["deployment", args.deployment],
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

  const primary = parsePrimary(args.primary);
  if (primary === null) {
    finish({ ok: false, status: STATUS.INVALID_INPUT, message: "invalid_primary" });
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

    const deployment = await assertDeploymentTarget(pool, args.deployment);
    if (!deployment.ok) {
      finish({
        ok: false,
        status: STATUS.TRANSACTION_ERROR,
        message: deployment.message,
        deploymentCode: args.deployment,
        identityKey: identity.identityKey,
        databaseName: dbResolved.databaseName,
        hostFingerprint: dbResolved.hostFingerprint,
        connectionString: dbResolved.connectionString,
      });
      return;
    }

    const result = await provisionPlatformTenant(pool, {
      organizationKey: args.organizationKey,
      displayName: args.displayName,
      legalName: args.legalName || null,
      dataEnvironment: args.environment,
      productKey: args.product,
      productTenantKey: args.tenantKey,
      hostname: args.hostname,
      domainType: args.domainType,
      deploymentCode: args.deployment,
      isPrimary: primary,
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
        tenant_key: args.tenantKey,
        hostname: args.hostname,
        product: args.product,
        deployment: args.deployment,
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
