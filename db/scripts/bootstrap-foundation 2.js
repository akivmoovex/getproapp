#!/usr/bin/env node
"use strict";

/**
 * Manual hosted/local foundation bootstrap.
 * Never run from application startup.
 *
 * Requires:
 *   DATABASE_URL
 *   DATABASE_IDENTITY_EXPECTED (e.g. blessboard-platform-v5)
 * Optional:
 *   DATABASE_IDENTITY_ENV (default: testing)
 *   FOUNDATION_ALLOW_LOCALHOST=1 (local tests only)
 *
 * Usage:
 *   npm run db:bootstrap:foundation
 */

const { bootstrapFoundation } = require("./lib/foundationBootstrap");

function assertNoSecretsInText(text) {
  const s = String(text || "");
  if (/postgres(ql)?:\/\//i.test(s)) {
    throw new Error("Refusing to print a postgres URL");
  }
  if (/password\s*=/i.test(s)) {
    throw new Error("Refusing to print password material");
  }
}

async function main() {
  const lines = [];
  const result = await bootstrapFoundation({
    log: (line) => {
      assertNoSecretsInText(line);
      lines.push(line);
      // eslint-disable-next-line no-console
      console.log(line);
    },
  });

  const safe = {
    ok: result.ok,
    code: result.code || (result.ok ? "ok" : "failed"),
    host_fingerprint: result.host_fingerprint || null,
    identity_key: result.identity_key || null,
    environment_code: result.environment_code || null,
    errors: result.errors || [],
    migrate: result.migrate
      ? {
          applied: result.migrate.applied,
          skipped: result.migrate.skipped,
          seeds_applied: result.migrate.seedsApplied,
          seeds_skipped: result.migrate.seedsSkipped,
        }
      : null,
    identity: result.identity
      ? {
          result: result.identity.result,
          identity_key: result.identity.identity_key || (result.identity.row && result.identity.row.identity_key),
          environment_code:
            result.identity.environment_code ||
            (result.identity.row && result.identity.row.environment_code),
          database_name:
            result.identity.database_name || (result.identity.row && result.identity.row.database_name),
          host_fingerprint:
            result.identity.host_fingerprint ||
            (result.identity.row && result.identity.row.host_fingerprint),
        }
      : null,
    status: result.status || null,
    verify_ok: result.verify ? result.verify.ok : null,
    verify_failures: result.verify && result.verify.failures ? result.verify.failures : undefined,
  };

  const out = JSON.stringify(safe, null, 2);
  assertNoSecretsInText(out);
  // eslint-disable-next-line no-console
  console.log(out);

  if (!result.ok) process.exit(1);
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error(`[db:bootstrap:foundation] ${err && err.message ? err.message : String(err)}`);
  process.exit(1);
});
