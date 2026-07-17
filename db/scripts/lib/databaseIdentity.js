"use strict";

/**
 * Shared platform.database_identity helpers for CLI tools.
 * identity_key (DATABASE_IDENTITY_EXPECTED) is distinct from PLATFORM_DEPLOYMENT_CODE.
 */

const crypto = require("crypto");
const { parseDatabaseName } = require("./databaseUrl");
const { sanitizeHostFingerprint } = require("./hostFingerprint");

const ALLOWED_ENVS = Object.freeze(["preproduction", "shared", "production", "testing"]);
const IDENTITY_KEY_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/**
 * @param {string} raw
 * @returns {string}
 */
function normalizeIdentityKey(raw) {
  return String(raw || "")
    .trim()
    .toLowerCase();
}

/**
 * @param {string} raw
 * @returns {{ ok: true, key: string } | { ok: false, reason: string }}
 */
function validateIdentityKey(raw) {
  const key = normalizeIdentityKey(raw);
  if (!key) return { ok: false, reason: "missing" };
  if (!IDENTITY_KEY_PATTERN.test(key)) return { ok: false, reason: "invalid_format" };
  return { ok: true, key };
}

/**
 * @param {string} raw
 * @returns {{ ok: true, env: string } | { ok: false, reason: string }}
 */
function validateEnvironmentCode(raw) {
  const env = String(raw || "")
    .trim()
    .toLowerCase();
  if (!ALLOWED_ENVS.includes(env)) return { ok: false, reason: "invalid_environment" };
  return { ok: true, env };
}

/**
 * @param {import('pg').Pool} pool
 */
async function identityTableExists(pool) {
  const r = await pool.query(
    `SELECT 1
       FROM information_schema.tables
      WHERE table_schema = 'platform' AND table_name = 'database_identity'`
  );
  return r.rowCount > 0;
}

/**
 * @param {import('pg').Pool} pool
 */
async function readIdentityRow(pool) {
  const cols = await pool.query(
    `SELECT column_name
       FROM information_schema.columns
      WHERE table_schema = 'platform' AND table_name = 'database_identity'`
  );
  const names = new Set(cols.rows.map((r) => r.column_name));
  const selectIdentityKey = names.has("identity_key") ? "identity_key" : "NULL::text AS identity_key";
  const r = await pool.query(
    `SELECT database_instance_id, environment_code, database_name, host_fingerprint,
            ${selectIdentityKey}, created_at, updated_at
       FROM platform.database_identity
      WHERE id = 1`
  );
  return r.rows[0] || null;
}

/**
 * Initialize or confirm singleton identity.
 * @param {import('pg').Pool} pool
 * @param {{
 *   connectionString: string,
 *   identityKey: string,
 *   environmentCode: string,
 * }} opts
 */
async function ensureDatabaseIdentity(pool, opts) {
  const keyCheck = validateIdentityKey(opts.identityKey);
  if (!keyCheck.ok) {
    return { ok: false, code: "invalid_identity_key", message: "DATABASE_IDENTITY_EXPECTED is missing or invalid." };
  }
  const envCheck = validateEnvironmentCode(opts.environmentCode);
  if (!envCheck.ok) {
    return {
      ok: false,
      code: "invalid_environment",
      message: `environment_code must be one of: ${ALLOWED_ENVS.join(", ")}.`,
    };
  }

  if (!(await identityTableExists(pool))) {
    return {
      ok: false,
      code: "identity_table_missing",
      message: "platform.database_identity does not exist. Run migrations first.",
    };
  }

  const databaseName = parseDatabaseName(opts.connectionString);
  const hostFingerprint = sanitizeHostFingerprint(opts.connectionString);
  if (!databaseName) {
    return { ok: false, code: "unparseable_database_name", message: "Could not parse database name from DATABASE_URL." };
  }

  const existing = await readIdentityRow(pool);
  if (existing) {
    const existingKey = existing.identity_key ? normalizeIdentityKey(existing.identity_key) : "";
    if (existingKey && existingKey !== keyCheck.key) {
      return {
        ok: false,
        code: "identity_key_mismatch",
        message:
          `Refusing: database identity_key=${existingKey} does not match expected=${keyCheck.key}. ` +
          "Will not overwrite a different database purpose.",
        existing,
      };
    }
    if (existing.environment_code !== envCheck.env) {
      return {
        ok: false,
        code: "environment_mismatch",
        message:
          `Refusing: identity already exists with environment_code=${existing.environment_code}. ` +
          `Will not overwrite with ${envCheck.env}.`,
        existing,
      };
    }
    if (!existingKey) {
      await pool.query(
        `UPDATE platform.database_identity
            SET identity_key = $1, updated_at = now()
          WHERE id = 1 AND identity_key IS NULL`,
        [keyCheck.key]
      );
      const updated = await readIdentityRow(pool);
      return { ok: true, result: "identity_key_backfilled", row: updated };
    }
    return { ok: true, result: "already_initialized", row: existing };
  }

  const databaseInstanceId = crypto.randomUUID();
  await pool.query(
    `INSERT INTO platform.database_identity
       (id, database_instance_id, environment_code, database_name, host_fingerprint, identity_key)
     VALUES (1, $1, $2, $3, $4, $5)`,
    [databaseInstanceId, envCheck.env, databaseName, hostFingerprint, keyCheck.key]
  );
  const row = await readIdentityRow(pool);
  return { ok: true, result: "initialized", row };
}

/**
 * @param {import('pg').Pool} pool
 * @param {{ identityKey?: string }} [opts]
 */
async function checkDatabaseIdentity(pool, opts = {}) {
  if (!(await identityTableExists(pool))) {
    return {
      ok: false,
      code: "identity_table_missing",
      message: "platform.database_identity does not exist.",
    };
  }
  const row = await readIdentityRow(pool);
  if (!row) {
    return { ok: false, code: "missing", message: "Identity is not initialized.", row: null };
  }

  const expectedRaw = opts.identityKey;
  if (expectedRaw != null && String(expectedRaw).trim() !== "") {
    const keyCheck = validateIdentityKey(expectedRaw);
    if (!keyCheck.ok) {
      return { ok: false, code: "invalid_identity_key", message: "DATABASE_IDENTITY_EXPECTED is invalid.", row };
    }
    const actual = row.identity_key ? normalizeIdentityKey(row.identity_key) : "";
    if (actual !== keyCheck.key) {
      return {
        ok: false,
        code: "identity_key_mismatch",
        message: `identity_key mismatch: database=${actual || "(null)"} expected=${keyCheck.key}`,
        row,
      };
    }
  }

  return { ok: true, code: "present", row };
}

module.exports = {
  ALLOWED_ENVS,
  IDENTITY_KEY_PATTERN,
  normalizeIdentityKey,
  validateIdentityKey,
  validateEnvironmentCode,
  identityTableExists,
  readIdentityRow,
  ensureDatabaseIdentity,
  checkDatabaseIdentity,
};
