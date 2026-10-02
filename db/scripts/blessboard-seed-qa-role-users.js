#!/usr/bin/env node
"use strict";

/**
 * Testing-only BlessBoard QA role users seed (demo-church).
 *
 *   scripts/local/run-with-blessboard-env.sh testing \
 *     npm run blessboard:seed-qa-role-users -- --dry-run
 *
 *   scripts/local/run-with-blessboard-env.sh testing \
 *     npm run blessboard:seed-qa-role-users -- --confirm --password=1234567890
 *
 * Never prints password hashes or DATABASE_URL.
 */

const {
  resolveDatabaseUrlSafe,
  requireMatchedIdentity,
  redactSecretsDeep,
  assertNoSecretsInText,
  createProvisionPool,
} = require("./lib/provisionCliSafety");
const {
  seedBlessBoardQaRoleUsers,
  RESULT,
  QA_PASSWORD,
} = require("../../src/blessboard/services/blessBoardQaRoleUsersSeedService");

function parseArgs(argv) {
  let confirm = false;
  let dryRunFlag = false;
  let resetPasswords = true;
  let password = null;

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    const next = () => String(argv[++i] || "");
    if (arg === "--confirm") confirm = true;
    else if (arg === "--dry-run") dryRunFlag = true;
    else if (arg === "--no-reset-passwords") resetPasswords = false;
    else if (arg === "--password") password = next();
    else if (arg.startsWith("--password=")) {
      password = arg.slice("--password=".length);
    }
  }

  const dryRun = dryRunFlag || !confirm;
  return {
    confirm: confirm && !dryRunFlag,
    dryRun,
    resetPasswords,
    password,
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
  let pool = null;
  let exitCode = 0;

  try {
    const dbUrl = resolveDatabaseUrlSafe();
    if (!dbUrl.ok) {
      emit({ ok: false, code: "DATABASE_URL_required", message: dbUrl.message });
      exitCode = 2;
      return;
    }

    pool = createProvisionPool(dbUrl.connectionString, { max: 8 });
    const identity = await requireMatchedIdentity(pool);
    if (!identity.ok) {
      emit({
        ok: false,
        code: RESULT.REFUSED,
        message: identity.message,
        identity_code: identity.code,
      });
      exitCode = 2;
      return;
    }

    if (identity.environmentCode === "production") {
      emit({
        ok: false,
        code: RESULT.REFUSED,
        message: "QA_ROLE_USERS_SEED_REFUSED production",
      });
      exitCode = 2;
      return;
    }

    // Session rows require a deployment present in platform.deployments.
    // Moovex profile code may not yet be seeded; BlessBoard demo tenants use staging.
    const deploymentCode = "blessboard-org-staging";

    const result = await seedBlessBoardQaRoleUsers(pool, {
      dryRun: args.dryRun,
      confirm: args.confirm,
      password: args.password || QA_PASSWORD,
      resetPasswords: args.resetPasswords,
      requireIdentityKey: identity.identityKey,
      deploymentCode,
    });

    const matrix = (result.verifications || []).map((v) => ({
      role: v.roleKey,
      email: v.email,
      phone: v.phone,
      legacyBaseline: v.legacyBaseline,
      LOGIN_READY: v.LOGIN_READY,
      permissionCount: v.permissionCount,
      emailOk: v.login && v.login.emailOk,
      phoneOk: v.login && v.login.phoneOk,
      identityMatch: v.login && v.login.identityMatch,
    }));

    const existingMatrix = (result.existingUsers || []).map((u) => ({
      email: u.email,
      phone: u.phone,
      phoneAction: u.phoneAction,
      passwordReset: u.passwordReset,
      legacyRoles: u.legacyRoles,
      LOGIN_READY: u.login ? u.login.LOGIN_READY : null,
    }));

    emit({
      ok: result.ok,
      code: result.code,
      mode: result.mode || (args.dryRun ? "dry-run" : "apply"),
      identity: result.identity || {
        identityKey: identity.identityKey,
        environmentCode: identity.environmentCode,
      },
      organization: result.organization || null,
      phoneDeliveryNote: result.phoneDeliveryNote || null,
      beforeCounts: result.beforeCounts || null,
      afterCounts: result.afterCounts || null,
      phonesAssigned: result.phonesAssigned,
      phonesKept: result.phonesKept,
      passwordsReset: result.passwordsReset,
      usersCreated: result.usersCreated,
      roleAssignmentsCreated: result.roleAssignmentsCreated,
      roleAssignmentsRemoved: result.roleAssignmentsRemoved,
      permissionsChanged: result.permissionsChanged,
      humanAssignableCatalogueCount: result.humanAssignableCatalogueCount,
      loginReadyCatalogueCount: result.loginReadyCatalogueCount,
      legacyLoginReadyCount: result.legacyLoginReadyCount,
      excludedRoles: result.excludedRoles,
      existingUsers: existingMatrix,
      qaUsers: matrix,
      coverage: result.coverage,
      notReady: result.notReady || null,
      message: result.message || null,
      // Explicit QA credential reminder (testing only) — not a hash.
      qaPasswordNote: args.dryRun
        ? null
        : "testing_only_shared_password_length=" + String((args.password || QA_PASSWORD).length),
    });

    if (!result.ok) exitCode = 1;
  } catch (err) {
    emit({
      ok: false,
      code: "qa_seed_failed",
      message: err && err.message ? String(err.message) : String(err),
    });
    exitCode = 1;
  } finally {
    if (pool) await pool.end().catch(() => {});
  }
  process.exitCode = exitCode;
}

main();
