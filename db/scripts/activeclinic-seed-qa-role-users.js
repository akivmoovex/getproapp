#!/usr/bin/env node
"use strict";

/**
 * Testing-only ActiveClinic QA role users seed (activeclinic-demo).
 *
 *   scripts/local/run-with-blessboard-env.sh testing \
 *     npm run activeclinic:seed-qa-role-users -- --dry-run
 *
 *   scripts/local/run-with-blessboard-env.sh testing \
 *     npm run activeclinic:seed-qa-role-users -- --confirm --password=1234567890
 *
 * Requested password 12345678 is rejected by platform policy (min length 10).
 * Never prints password hashes or tokens.
 */

const {
  resolveDatabaseUrlSafe,
  requireMatchedIdentity,
  redactSecretsDeep,
  assertNoSecretsInText,
  createProvisionPool,
} = require("./lib/provisionCliSafety");
const {
  seedActiveClinicQaRoleUsers,
  REQUESTED_QA_PASSWORD,
  RECOMMENDED_QA_PASSWORD,
  PASSWORD_MIN_LENGTH,
  RESULT,
} = require("../../src/activeclinic/services/activeClinicQaRoleUsersSeedService");

function parseArgs(argv) {
  let confirm = false;
  let dryRunFlag = false;
  let resetPasswords = false;
  let password = null;

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    const next = () => String(argv[++i] || "");
    if (arg === "--confirm") confirm = true;
    else if (arg === "--dry-run") dryRunFlag = true;
    else if (arg === "--reset-passwords") resetPasswords = true;
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

    pool = createProvisionPool(dbUrl.connectionString);
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

    const result = await seedActiveClinicQaRoleUsers(pool, {
      dryRun: args.dryRun,
      confirm: args.confirm,
      password: args.password,
      resetPasswords: args.resetPasswords,
      requireIdentityKey: identity.identityKey,
    });

    if (result.code === RESULT.PASSWORD_REJECTED) {
      const pol = result.passwordPolicy || {};
      // Avoid keys containing "password" so provisionCliSafety redaction keeps lengths visible.
      emit({
        ok: false,
        code: RESULT.PASSWORD_REJECTED,
        message: result.message,
        policyMinLength: pol.minLength || PASSWORD_MIN_LENGTH,
        policyMaxLength: pol.maxLength || 200,
        requestedLength:
          pol.requestedLength != null
            ? pol.requestedLength
            : REQUESTED_QA_PASSWORD.length,
        recommendedLength: RECOMMENDED_QA_PASSWORD.length,
        note:
          `Requested secret length ${
            pol.requestedLength != null
              ? pol.requestedLength
              : REQUESTED_QA_PASSWORD.length
          } is below platform minimum ${PASSWORD_MIN_LENGTH}. ` +
          `Supply a compliant secret via the password CLI flag (length ≥ ${PASSWORD_MIN_LENGTH}; ` +
          `smallest example length ${RECOMMENDED_QA_PASSWORD.length}).`,
        usersCreated: 0,
      });
      exitCode = 2;
      return;
    }

    const matrix = (result.verifications || []).map((v) => ({
      username: v.username,
      email: v.email,
      role: v.roleKey,
      scope: v.scopeType,
      permissionCount: v.permissionCount,
      LOGIN_READY: v.LOGIN_READY,
      nav: v.navModules,
      positiveOk: v.positiveOk,
      negativeOk: v.negativeOk,
    }));

    emit({
      ok: result.ok,
      code: result.code,
      mode: result.mode || (args.dryRun ? "dry-run" : "apply"),
      identity: {
        identityKey: identity.identityKey,
        environmentCode: identity.environmentCode,
      },
      organization: result.organization || null,
      facility: result.facility || null,
      loginReadyCount: result.loginReadyCount,
      beforeCounts: result.beforeCounts || null,
      afterCounts: result.afterCounts || null,
      julflonaQaEmailStaffCount: result.julflonaQaEmailStaffCount,
      matrix,
      preservedDemoUsers: result.preservedDemoUsersAfter || result.preservedDemoUsers,
      message: result.message || null,
      failedUsername: result.failedUsername || null,
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
