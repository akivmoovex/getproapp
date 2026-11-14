#!/usr/bin/env node
"use strict";

/**
 * Fail closed if V13 CI database identity is unsafe.
 * Usage: node scripts/ci/v13-assert-db-isolation.cjs
 */

const {
  assertV13CiDatabaseUrl,
  assertV13CiEnvironmentIdentity,
  assertDbWritingStagesAuthorized,
} = require("../../tests/v13/helpers/v13CiDatabaseGuard");

function main() {
  const env = process.env;
  assertV13CiEnvironmentIdentity(env);

  const url = String(env.DATABASE_URL || env.TEST_DATABASE_URL || env.E2E_DATABASE_URL || "");
  const expected = String(env.GETPRO_V13_OWNED_DB_NAME || "").trim();
  assertV13CiDatabaseUrl(url, {
    expectedDatabaseName: expected || undefined,
    requireLocalhost: true,
  });

  if (String(env.GETPRO_V13_REQUIRE_DB_WRITE_AUTH || "") === "1") {
    assertDbWritingStagesAuthorized(env);
  }

  process.stdout.write("V13_CI_DB_ISOLATION_OK\n");
}

try {
  main();
} catch (err) {
  process.stderr.write(`${err && err.message ? err.message : String(err)}\n`);
  process.exit(1);
}
