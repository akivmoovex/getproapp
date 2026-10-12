"use strict";

const { statusReadOnly } = require("./migrator");
const { checkDatabaseIdentity } = require("./databaseIdentity");
const {
  inspectV7RuntimeSchemaCompatibility,
} = require("../../../src/platform/schema/v7RuntimeSchemaCompatibility");

const UNIFIED_IDENTITY = "moovex-platform-v7";

async function verifyUnified(pool, opts = {}) {
  const failures = [];
  const identity = await checkDatabaseIdentity(pool, {
    identityKey: opts.identityKey || UNIFIED_IDENTITY,
  });
  if (!identity.ok) failures.push(`identity:${identity.code}`);

  const migrationStatus = await statusReadOnly({ pool });
  if (migrationStatus.ledger_missing) failures.push("schema_migrations_missing");
  if (migrationStatus.drift > 0) failures.push("checksum_drift");
  if (migrationStatus.pending > 0) failures.push("migrations_pending");

  const schema = await inspectV7RuntimeSchemaCompatibility(pool);
  if (!schema.compatible) {
    failures.push(...(schema.missing || []).map((item) => `schema:${item}`));
  }

  return {
    ok: failures.length === 0,
    failures,
    details: { identity, migration_status: migrationStatus, schema },
  };
}

module.exports = { UNIFIED_IDENTITY, verifyUnified };
