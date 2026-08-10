#!/usr/bin/env node
"use strict";

/**
 * Idempotent Prompt 3 migration: ActiveClinic tenant admins
 * facility_admin → organization_admin (testing/demo databases only).
 *
 *   DATABASE_URL=… DATABASE_IDENTITY_EXPECTED=blessboard-platform-v5 \
 *     npm run activeclinic:migrate-tenant-admins -- --dry-run
 *
 *   DATABASE_URL=… DATABASE_IDENTITY_EXPECTED=blessboard-platform-v5 \
 *     npm run activeclinic:migrate-tenant-admins -- --confirm
 *
 * Prefer:
 *   scripts/local/run-with-blessboard-env.sh testing npm run activeclinic:migrate-tenant-admins -- --confirm
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
  migrateActiveClinicTenantAdmins,
  resolveTargetAdmin,
  snapshotAdminAccess,
  TARGET_ADMINS,
} = require("../../src/activeclinic/services/activeClinicAdminRoleMigrationService");

function emit(obj) {
  const text = JSON.stringify(redactSecretsDeep(obj), null, 2);
  assertNoSecretsInText(text);
  // eslint-disable-next-line no-console
  console.log(text);
}

async function auditBefore(pool) {
  const rows = [];
  for (const target of TARGET_ADMINS) {
    const resolved = await resolveTargetAdmin(pool, target);
    if (!resolved.ok) {
      rows.push({
        key: target.key,
        email: target.emailNormalized,
        organizationKey: target.organizationKey,
        ok: false,
        code: resolved.code,
        detail: resolved.detail || null,
      });
      continue;
    }
    const snap = await snapshotAdminAccess(pool, resolved);
    rows.push({
      key: target.key,
      email: target.emailNormalized,
      organizationKey: resolved.organization.key,
      identityId: resolved.identity.id,
      staffMemberId: resolved.staffMember.id,
      staffStatus: resolved.staffMember.status,
      roleKeys: snap.roleKeys,
      permissionCount: snap.permissionCount,
      loginReady: snap.loginReady,
      loginCode: snap.loginCode,
      isOrgWideAdmin: snap.isOrgWideAdmin,
      missingRequired: snap.missingRequired,
      forbiddenPresent: snap.forbiddenPresent,
    });
  }
  return rows;
}

async function main() {
  const { confirm, dryRun } = parseWriteMode(process.argv.slice(2));
  let pool = null;
  let exitCode = 0;

  try {
    const dbUrl = resolveDatabaseUrlSafe();
    if (!dbUrl.ok) {
      emit({ ok: false, code: "DATABASE_URL_required", message: dbUrl.message });
      process.exitCode = 2;
      return;
    }

    pool = createProvisionPool(dbUrl.connectionString);
    const identity = await requireMatchedIdentity(pool);
    if (!identity.ok) {
      emit({
        ok: false,
        code: "ABORT_WITH_DATABASE_IDENTITY_UNKNOWN",
        message: identity.message,
        identity_code: identity.code,
      });
      process.exitCode = 2;
      return;
    }

    if (identity.environmentCode && identity.environmentCode !== "testing") {
      emit({
        ok: false,
        code: "ABORT_NON_TESTING_ENVIRONMENT",
        message: "Prompt 3 admin migration is testing-only",
        environmentCode: identity.environmentCode,
      });
      process.exitCode = 2;
      return;
    }

    const before = await auditBefore(pool);
    const result = await migrateActiveClinicTenantAdmins(pool, { dryRun });

    emit({
      ok: result.ok,
      code: result.code,
      mode: dryRun ? "dry-run" : "apply",
      confirm,
      identity: {
        identityKey: identity.identityKey,
        environmentCode: identity.environmentCode,
        databaseName: dbUrl.databaseName,
        hostFingerprint: dbUrl.hostFingerprint,
      },
      before,
      results: (result.results || []).map((r) => ({
        ok: r.ok,
        code: r.code,
        target: r.target,
        organization: r.organization || null,
        staffMemberId: r.staffMember && r.staffMember.id,
        identityId: r.identityId || null,
        email: r.email || null,
        beforeRoles: r.beforeRoles || null,
        after: r.after
          ? {
              roleKeys: r.after.roleKeys,
              permissionCount: r.after.permissionCount,
              loginReady: r.after.loginReady,
              loginCode: r.after.loginCode,
              isOrgWideAdmin: r.after.isOrgWideAdmin,
              missingRequired: r.after.missingRequired,
              forbiddenPresent: r.after.forbiddenPresent,
            }
          : null,
        verification: r.verification || null,
        actions: r.actions || null,
        detail: r.detail || null,
        assignCode: r.assignCode || null,
      })),
    });

    if (!result.ok) exitCode = 1;
  } catch (err) {
    emit({
      ok: false,
      code: "migration_failed",
      message: err && err.message ? String(err.message) : String(err),
    });
    exitCode = 1;
  } finally {
    if (pool) await pool.end().catch(() => {});
  }
  process.exitCode = exitCode;
}

main();
