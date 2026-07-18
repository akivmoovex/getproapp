"use strict";

/**
 * Pre-write safety gates for V4→V5 migration.
 */

const { Pool } = require("pg");
const { checkDatabaseIdentity } = require("../../../db/scripts/lib/databaseIdentity");
const { connectionFingerprint, safeConnectionSummary } = require("./config");

/**
 * Create a source pool forced to read-only transactions.
 * @param {string} connectionString
 */
function createReadOnlySourcePool(connectionString) {
  const pool = new Pool({
    connectionString,
    max: 4,
    options: "-c default_transaction_read_only=on",
  });
  return pool;
}

/**
 * Create a target pool (writes allowed only when apply+confirm).
 * @param {string} connectionString
 */
function createTargetPool(connectionString) {
  return new Pool({ connectionString, max: 4 });
}

/**
 * Verify target identity matches DATABASE_IDENTITY_EXPECTED before any writes.
 * @param {import('pg').Pool} targetPool
 * @param {string} identityKey
 */
async function verifyTargetIdentity(targetPool, identityKey) {
  const result = await checkDatabaseIdentity(targetPool, { identityKey });
  if (!result.ok) {
    return {
      ok: false,
      code: result.code || "identity_check_failed",
      message: result.message || "Target identity verification failed.",
    };
  }
  return { ok: true, row: result.row };
}

/**
 * Refuse identical source/target fingerprints.
 */
function assertDistinctConnections(sourceUrl, targetUrl) {
  const a = connectionFingerprint(sourceUrl);
  const b = connectionFingerprint(targetUrl);
  if (!a || !b) {
    return { ok: false, code: "unparseable_connection_string" };
  }
  if (a === b) {
    return {
      ok: false,
      code: "same_source_and_target_fingerprint",
      message: "Source and target resolve to the same database fingerprint.",
      source: safeConnectionSummary(sourceUrl, "v4_source"),
      target: safeConnectionSummary(targetUrl, "v5_target"),
    };
  }
  return { ok: true };
}

/**
 * Parse CLI flags. apply requires explicit --confirm.
 * @param {string[]} argv
 */
function parseCliArgs(argv) {
  const args = Array.isArray(argv) ? argv.slice() : [];
  const command = String(args[0] || "").trim().toLowerCase() || "dry-run";
  const flags = new Set(args.slice(1).filter((a) => a.startsWith("--")));
  return {
    command,
    confirm: flags.has("--confirm"),
    resume: flags.has("--resume"),
    help: flags.has("--help") || command === "help",
  };
}

/**
 * @param {string} command
 * @param {{ confirm: boolean }} flags
 */
function assertCommandSafety(command, flags) {
  if (command === "apply" && !flags.confirm) {
    return {
      ok: false,
      code: "confirm_required",
      message: "apply requires explicit --confirm. Default remains dry-run.",
    };
  }
  const allowed = new Set(["plan", "dry-run", "apply", "verify", "help"]);
  if (!allowed.has(command)) {
    return { ok: false, code: "unknown_command", message: `Unknown command: ${command}` };
  }
  return { ok: true };
}

/**
 * Probe that source rejects writes (read-only session).
 * @param {import('pg').Pool} sourcePool
 */
async function assertSourceReadOnly(sourcePool) {
  const client = await sourcePool.connect();
  try {
    await client.query("BEGIN");
    try {
      await client.query("CREATE TEMP TABLE __v4_migration_write_probe (id int)");
      await client.query("ROLLBACK");
      return {
        ok: false,
        code: "source_not_read_only",
        message: "Source connection allowed a write; refusing to continue.",
      };
    } catch (err) {
      await client.query("ROLLBACK").catch(() => {});
      const msg = String(err && err.message ? err.message : err);
      if (/read-only|readonly/i.test(msg)) {
        return { ok: true };
      }
      // Some PG setups error differently; require read_only GUC.
      const guc = await sourcePool.query("SHOW default_transaction_read_only");
      const on = String(guc.rows[0] && guc.rows[0].default_transaction_read_only).toLowerCase();
      if (on === "on") return { ok: true };
      return {
        ok: false,
        code: "source_not_read_only",
        message: "Could not confirm source read-only mode.",
      };
    }
  } finally {
    client.release();
  }
}

module.exports = {
  createReadOnlySourcePool,
  createTargetPool,
  verifyTargetIdentity,
  assertDistinctConnections,
  parseCliArgs,
  assertCommandSafety,
  assertSourceReadOnly,
};
