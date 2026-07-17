#!/usr/bin/env node
"use strict";

/**
 * Read-only foundation verification.
 *
 * Requires:
 *   DATABASE_URL
 *   DATABASE_IDENTITY_EXPECTED
 *
 * Usage:
 *   npm run db:verify:foundation
 */

const { Pool } = require("pg");
const { requireDatabaseUrl, envStringIsSet } = require("./lib/databaseUrl");
const { sanitizeHostFingerprint } = require("./lib/hostFingerprint");
const { assertSafeFoundationDatabaseHost } = require("./lib/foundationHostSafety");
const { buildFoundationPoolConfig } = require("./lib/foundationPool");
const { validateIdentityKey } = require("./lib/databaseIdentity");
const { verifyFoundation } = require("./lib/foundationVerify");

async function main() {
  let connectionString;
  try {
    connectionString = requireDatabaseUrl();
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error(`[db:verify:foundation] ${err.message}`);
    process.exit(1);
  }

  if (!envStringIsSet(process.env.DATABASE_IDENTITY_EXPECTED)) {
    // eslint-disable-next-line no-console
    console.error("[db:verify:foundation] DATABASE_IDENTITY_EXPECTED is required.");
    process.exit(1);
  }
  const keyCheck = validateIdentityKey(process.env.DATABASE_IDENTITY_EXPECTED);
  if (!keyCheck.ok) {
    // eslint-disable-next-line no-console
    console.error("[db:verify:foundation] DATABASE_IDENTITY_EXPECTED is invalid.");
    process.exit(1);
  }

  const hostCheck = assertSafeFoundationDatabaseHost(connectionString, process.env);
  if (!hostCheck.ok) {
    // eslint-disable-next-line no-console
    console.error(
      `[db:verify:foundation] Refusing DATABASE_URL host "${hostCheck.host || "(empty)"}" (${hostCheck.reason}).`
    );
    process.exit(1);
  }

  const hostFingerprint = sanitizeHostFingerprint(connectionString);
  // eslint-disable-next-line no-console
  console.log(`[db:verify:foundation] host_fingerprint=${hostFingerprint}`);

  const pool = new Pool(buildFoundationPoolConfig(connectionString, { max: 2 }));
  try {
    const report = await verifyFoundation(pool, { identityKey: keyCheck.key });
    const out = {
      ok: report.ok,
      host_fingerprint: hostFingerprint,
      identity_key_expected: keyCheck.key,
      failures: report.failures,
      details: {
        schemas: report.details.schemas,
        platform_tables: report.details.platform_tables,
        deployments: report.details.deployments,
        products: report.details.products,
        public_forbidden: report.details.public_forbidden,
        product_schema_tables: report.details.product_schema_tables,
        migration_status: report.details.migration_status,
        identity: report.details.identity,
      },
    };
    // eslint-disable-next-line no-console
    console.log(JSON.stringify(out, null, 2));
    if (!report.ok) process.exit(1);
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error(`[db:verify:foundation] ${err && err.message ? err.message : String(err)}`);
  process.exit(1);
});
