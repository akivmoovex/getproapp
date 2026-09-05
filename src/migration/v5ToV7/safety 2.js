"use strict";

const { Pool } = require("pg");
const {
  checkDatabaseIdentity,
  readIdentityRow,
} = require("../../../db/scripts/lib/databaseIdentity");
const { connectionFingerprint } = require("./config");

function createReadOnlySourcePool(connectionString) {
  return new Pool({
    connectionString,
    max: 4,
    options: "-c default_transaction_read_only=on",
  });
}

function createTargetPool(connectionString) {
  return new Pool({ connectionString, max: 4 });
}

async function verifyDatabaseIdentity(pool, { identityKey, environmentCode, label }) {
  const result = await checkDatabaseIdentity(pool, { identityKey });
  if (!result.ok) {
    return {
      ok: false,
      code: result.code || "identity_check_failed",
      message: `${label}: ${result.message || "identity verification failed"}`,
    };
  }
  const row = result.row || (await readIdentityRow(pool));
  const env = String(row && row.environment_code ? row.environment_code : "").toLowerCase();
  if (environmentCode && env !== String(environmentCode).toLowerCase()) {
    return {
      ok: false,
      code: "environment_mismatch",
      message: `${label}: expected environment_code=${environmentCode}, found=${env || "(missing)"}`,
    };
  }
  return { ok: true, row };
}

function parseCliArgs(argv) {
  const args = Array.isArray(argv) ? argv.slice() : [];
  const command = String(args[0] || "").trim().toLowerCase() || "plan";
  const flags = new Set(args.slice(1).filter((a) => a.startsWith("--")));
  const stateDirFlag = args.find((a) => a.startsWith("--state-dir="));
  return {
    command,
    confirm: flags.has("--confirm"),
    resume: flags.has("--resume"),
    delta: flags.has("--delta"),
    autoBackfill: flags.has("--auto-backfill"),
    stateDir: stateDirFlag ? stateDirFlag.slice("--state-dir=".length) : null,
    help: flags.has("--help") || command === "help",
  };
}

function assertCommandSafety(command, flags) {
  if (command === "apply" && !flags.confirm) {
    return {
      ok: false,
      code: "confirm_required",
      message: "apply requires explicit --confirm.",
    };
  }
  const allowed = new Set(["plan", "dry-run", "apply", "verify", "help"]);
  if (!allowed.has(command)) {
    return { ok: false, code: "unknown_command", message: `Unknown command: ${command}` };
  }
  return { ok: true };
}

async function assertSourceReadOnly(sourcePool) {
  const client = await sourcePool.connect();
  try {
    await client.query("BEGIN");
    try {
      await client.query("CREATE TEMP TABLE __v5_migration_write_probe (id int)");
      await client.query("ROLLBACK");
      return {
        ok: false,
        code: "source_not_read_only",
        message: "Source connection allowed a write; refusing to continue.",
      };
    } catch (err) {
      await client.query("ROLLBACK").catch(() => {});
      const msg = String(err && err.message ? err.message : err);
      if (/read-only|readonly/i.test(msg)) return { ok: true };
      const guc = await sourcePool.query("SHOW default_transaction_read_only");
      const on = String(guc.rows[0] && guc.rows[0].default_transaction_read_only).toLowerCase();
      if (on === "on") return { ok: true };
      return { ok: false, code: "source_not_read_only", message: "Could not confirm source read-only mode." };
    }
  } finally {
    client.release();
  }
}

function assertDistinctConnections(urls) {
  const fps = urls.filter(Boolean).map(connectionFingerprint);
  const set = new Set(fps);
  if (fps.length !== set.size) {
    return { ok: false, code: "duplicate_connection_fingerprint" };
  }
  return { ok: true };
}

module.exports = {
  createReadOnlySourcePool,
  createTargetPool,
  verifyDatabaseIdentity,
  parseCliArgs,
  assertCommandSafety,
  assertSourceReadOnly,
  assertDistinctConnections,
};
