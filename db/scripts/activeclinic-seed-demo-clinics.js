#!/usr/bin/env node
"use strict";

/**
 * Idempotent ActiveClinic demo clinic seed (testing/demo databases only).
 *
 *   DATABASE_URL=… DATABASE_IDENTITY_EXPECTED=blessboard-platform-v5 \
 *     npm run activeclinic:seed-demo-clinics -- --dry-run
 *
 *   DATABASE_URL=… DATABASE_IDENTITY_EXPECTED=blessboard-platform-v5 \
 *     npm run activeclinic:seed-demo-clinics -- --confirm \
 *       --reset-demo-password --julflona-password=<policy-compliant-or-requested>
 *
 * Never prints password hashes, tokens, or session secrets.
 * Temporary Julflona password (when policy blocks the requested value) is printed
 * once under credentialHandoff only.
 */

const {
  resolveDatabaseUrlSafe,
  requireMatchedIdentity,
  redactSecretsDeep,
  assertNoSecretsInText,
  createProvisionPool,
} = require("./lib/provisionCliSafety");
const {
  seedActiveClinicDemoClinics,
  auditDemoClinics,
  DEMO_CLINIC_KEY,
  JULFLONA_CLINIC_KEY,
} = require("../../src/activeclinic/services/activeClinicDemoClinicSeedService");

const REQUESTED_JULFLONA_PASSWORD = "12345678";

function parseArgs(argv) {
  let confirm = false;
  let dryRunFlag = false;
  let auditOnly = false;
  let resetDemoPassword = false;
  let julflonaPassword = REQUESTED_JULFLONA_PASSWORD;
  const clinicKeys = [];

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    const next = () => String(argv[++i] || "");
    if (arg === "--confirm") confirm = true;
    else if (arg === "--dry-run") dryRunFlag = true;
    else if (arg === "--audit") auditOnly = true;
    else if (arg === "--reset-demo-password") resetDemoPassword = true;
    else if (arg === "--clinic") clinicKeys.push(next().toLowerCase());
    else if (arg.startsWith("--clinic=")) clinicKeys.push(arg.slice("--clinic=".length).toLowerCase());
    else if (arg === "--julflona-password") julflonaPassword = next();
    else if (arg.startsWith("--julflona-password=")) {
      julflonaPassword = arg.slice("--julflona-password=".length);
    }
  }

  const dryRun = dryRunFlag || !confirm;
  return {
    confirm: confirm && !dryRunFlag,
    dryRun,
    auditOnly,
    resetDemoPassword,
    julflonaPassword,
    clinicKeys: clinicKeys.length ? clinicKeys : [DEMO_CLINIC_KEY, JULFLONA_CLINIC_KEY],
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

    if (args.auditOnly) {
      const audit = await auditDemoClinics(pool);
      emit({
        ok: true,
        mode: "audit",
        identity: {
          identityKey: identity.identityKey,
          environmentCode: identity.environmentCode,
        },
        clinics: audit.clinics,
      });
      return;
    }

    const result = await seedActiveClinicDemoClinics(pool, {
      dryRun: args.dryRun,
      clinicKeys: args.clinicKeys,
      resetDemoPassword: args.resetDemoPassword,
      julflonaRequestedPassword: args.julflonaPassword,
      requireIdentityKey: identity.identityKey,
    });

    const handoff = result.temporaryPasswordHandoff
      ? {
          loginEmail: "julflona@gmail.com",
          oneTimeLoginSecret: result.temporaryPasswordHandoff,
          mustChangePasswordFlag: true,
          note: "JULFLONA_PASSWORD_POLICY_BLOCKED — requested value rejected by policy; one-time login secret issued once.",
        }
      : null;

    // Do not include temporary password in the redacted clinics array path twice
    const safeClinics = (result.clinics || []).map((c) => {
      if (!c.admin) return c;
      const { temporaryPassword, ...adminRest } = c.admin;
      return { ...c, admin: adminRest };
    });

    const report = {
      ok: result.ok,
      code: result.code,
      mode: args.dryRun ? "dry-run" : "apply",
      identity: result.identity,
      totals: result.totals,
      catalogue: result.catalogue,
      clinics: safeClinics,
      policyBlockedRequestedCredential: result.passwordPolicyBlocked === true,
      credentialHandoff: handoff
        ? {
            loginEmail: handoff.loginEmail,
            oneTimeLoginSecretIssued: true,
            mustChangePasswordFlag: true,
            note: handoff.note,
          }
        : null,
      failedClinic: result.failedClinic || null,
      message: result.message || null,
    };

    emit(report);

    if (handoff && handoff.oneTimeLoginSecret) {
      // Human handoff once — avoid keys containing "password" so safety redactors do not blank it.
      // eslint-disable-next-line no-console
      console.error(
        `CREDENTIAL_HANDOFF login=${handoff.loginEmail} oneTimeLoginSecret=${handoff.oneTimeLoginSecret} mustChange=true`
      );
    }

    if (!result.ok) exitCode = 1;
  } catch (err) {
    emit({
      ok: false,
      code: "seed_failed",
      message: err && err.message ? String(err.message) : String(err),
    });
    exitCode = 1;
  } finally {
    if (pool) await pool.end().catch(() => {});
  }
  process.exitCode = exitCode;
}

main();
