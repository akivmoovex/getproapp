#!/usr/bin/env node
"use strict";

/**
 * Testing-only ActiveClinic tenant purge.
 *
 *   scripts/local/run-with-blessboard-env.sh testing \
 *     npm run activeclinic:purge-testing-tenant -- \
 *       --organization-key=qa-pronline-v7-clinic-y392u6-14cef8 --dry-run
 *
 *   scripts/local/run-with-blessboard-env.sh testing \
 *     npm run activeclinic:purge-testing-tenant -- \
 *       --organization-key=qa-pronline-v7-clinic-y392u6-14cef8 --confirm
 *
 * Dry-run is the default. Writes require --confirm. --dry-run wins if both are passed.
 * Never prints DATABASE_URL, passwords, or session secrets.
 */

const {
  resolveDatabaseUrlSafe,
  requireMatchedIdentity,
  redactSecretsDeep,
  assertNoSecretsInText,
  createProvisionPool,
  parseWriteMode,
} = require("./lib/provisionCliSafety");
const {
  purgeActiveClinicTestingOrganization,
  EXPECTED_IDENTITY_KEY,
  EXPECTED_DB_ENV,
  TOOL,
} = require("../../src/activeclinic/services/purgeActiveClinicTestingOrganization");

function parseArgs(argv) {
  const mode = parseWriteMode(argv);
  let organizationKey = "";
  let healthcareOrganizationId = "";
  for (const arg of mode.rest) {
    if (arg.startsWith("--organization-key=")) {
      organizationKey = arg.slice("--organization-key=".length);
    } else if (arg === "--organization-key") {
      /* value may be next; handled below */
    } else if (arg.startsWith("--healthcare-organization-id=")) {
      healthcareOrganizationId = arg.slice("--healthcare-organization-id=".length);
    }
  }
  for (let i = 0; i < mode.rest.length; i += 1) {
    const arg = mode.rest[i];
    const next = mode.rest[i + 1];
    if (arg === "--organization-key" && next && !next.startsWith("--")) {
      organizationKey = next;
    }
    if (arg === "--healthcare-organization-id" && next && !next.startsWith("--")) {
      healthcareOrganizationId = next;
    }
  }
  return {
    dryRun: mode.dryRun,
    confirm: mode.confirm,
    organizationKey: String(organizationKey || "").trim().toLowerCase(),
    healthcareOrganizationId: String(healthcareOrganizationId || "").trim(),
  };
}

function emit(obj) {
  const text = JSON.stringify(redactSecretsDeep(obj), null, 2);
  assertNoSecretsInText(text);
  // eslint-disable-next-line no-console
  console.log(text);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const url = resolveDatabaseUrlSafe();
  if (!url.ok) {
    emit({ ok: false, tool: TOOL, reason: url.message, detail: url.detail || null });
    process.exitCode = 2;
    return;
  }

  const pool = createProvisionPool(url.connectionString);
  try {
    const matched = await requireMatchedIdentity(pool);
    if (!matched.ok) {
      emit({
        ok: false,
        tool: TOOL,
        reason: matched.code || "identity_mismatch",
        message: matched.message,
      });
      process.exitCode = 2;
      return;
    }
    if (matched.identityKey !== EXPECTED_IDENTITY_KEY) {
      emit({
        ok: false,
        tool: TOOL,
        reason: "expected_identity_not_moovex_platform_v7",
        identityKey: matched.identityKey,
      });
      process.exitCode = 2;
      return;
    }
    if (String(matched.environmentCode || "").toLowerCase() !== EXPECTED_DB_ENV) {
      emit({
        ok: false,
        tool: TOOL,
        reason: "database_env_not_testing",
        environmentCode: matched.environmentCode,
      });
      process.exitCode = 2;
      return;
    }

    const result = await purgeActiveClinicTestingOrganization(
      pool,
      {
        organizationKey: args.organizationKey || undefined,
        healthcareOrganizationId: args.healthcareOrganizationId || undefined,
        dryRun: args.dryRun,
        confirmDestructive: args.confirm === true,
        actor: `cli:${TOOL}`,
      },
      process.env
    );
    emit({
      tool: TOOL,
      hostFingerprint: url.hostFingerprint,
      currentDatabase: url.databaseName,
      identityKey: matched.identityKey,
      environmentCode: matched.environmentCode,
      ...result,
    });
    if (!result.ok) process.exitCode = 1;
  } finally {
    await pool.end().catch(() => {});
  }
}

main().catch((err) => {
  emit({
    ok: false,
    tool: TOOL,
    reason: "cli_error",
    message: err && err.message ? String(err.message) : "unknown_error",
  });
  process.exitCode = 1;
});
