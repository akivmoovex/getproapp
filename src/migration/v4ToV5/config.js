"use strict";

/**
 * Explicit migration env — never falls back to DATABASE_URL.
 */

const { parseDatabaseName, parseDatabaseHost } = require("../../../db/scripts/lib/databaseUrl");
const { sanitizeHostFingerprint } = require("../../../db/scripts/lib/hostFingerprint");
const crypto = require("crypto");

function envRequired(name) {
  const v = process.env[name];
  if (v == null || String(v).trim() === "") {
    return { ok: false, reason: `missing_${name}` };
  }
  return { ok: true, value: String(v).trim() };
}

/**
 * Connection equality fingerprint (host|port|dbname hash). Never log the raw URL.
 * @param {string} connectionString
 */
function connectionFingerprint(connectionString) {
  try {
    const u = new URL(String(connectionString).replace(/^postgresql:/i, "postgres:"));
    const host = (u.hostname || "").toLowerCase();
    const port = u.port || "5432";
    const db = decodeURIComponent((u.pathname || "").replace(/^\//, ""));
    return crypto.createHash("sha256").update(`${host}|${port}|${db}`).digest("hex");
  } catch {
    return null;
  }
}

/**
 * Safe summary for logs/reports (no user/password/full URI).
 * @param {string} connectionString
 * @param {string} label
 */
function safeConnectionSummary(connectionString, label) {
  return {
    label,
    hostFingerprint: sanitizeHostFingerprint(connectionString),
    databaseName: parseDatabaseName(connectionString) || "(unknown)",
    fingerprintSha256Prefix: (connectionFingerprint(connectionString) || "").slice(0, 12),
  };
}

/**
 * @param {object} [overrides] — for tests
 */
function loadMigrationEnv(overrides = {}) {
  const source =
    overrides.V4_SOURCE_DATABASE_URL != null
      ? { ok: true, value: String(overrides.V4_SOURCE_DATABASE_URL).trim() }
      : envRequired("V4_SOURCE_DATABASE_URL");
  const target =
    overrides.V5_TARGET_DATABASE_URL != null
      ? { ok: true, value: String(overrides.V5_TARGET_DATABASE_URL).trim() }
      : envRequired("V5_TARGET_DATABASE_URL");
  const identity =
    overrides.DATABASE_IDENTITY_EXPECTED != null
      ? { ok: true, value: String(overrides.DATABASE_IDENTITY_EXPECTED).trim() }
      : envRequired("DATABASE_IDENTITY_EXPECTED");

  const errors = [];
  if (!source.ok) errors.push(source.reason);
  if (!target.ok) errors.push(target.reason);
  if (!identity.ok) errors.push(identity.reason);

  // Refuse ambiguous DATABASE_URL-only configuration for this tool.
  if (
    !overrides.allowDatabaseUrl &&
    (!source.ok || !target.ok) &&
    process.env.DATABASE_URL &&
    String(process.env.DATABASE_URL).trim()
  ) {
    errors.push("refusing_DATABASE_URL_fallback");
  }

  if (errors.length) {
    return { ok: false, errors, config: null };
  }

  const sourceUrl = source.value;
  const targetUrl = target.value;
  const sourceFp = connectionFingerprint(sourceUrl);
  const targetFp = connectionFingerprint(targetUrl);
  if (!sourceFp || !targetFp) {
    return { ok: false, errors: ["unparseable_connection_string"], config: null };
  }
  if (sourceFp === targetFp) {
    return { ok: false, errors: ["same_source_and_target_fingerprint"], config: null };
  }

  const hosted = /supabase\.co|amazonaws\.com|neon\.tech|render\.com/i;
  if (hosted.test(sourceUrl) || hosted.test(targetUrl)) {
    if (!overrides.allowHosted) {
      return { ok: false, errors: ["hosted_database_forbidden_in_default_mode"], config: null };
    }
  }

  return {
    ok: true,
    errors: [],
    config: {
      sourceUrl,
      targetUrl,
      identityKey: identity.value.toLowerCase(),
      sourceSummary: safeConnectionSummary(sourceUrl, "v4_source"),
      targetSummary: safeConnectionSummary(targetUrl, "v5_target"),
      sourceFingerprint: sourceFp,
      targetFingerprint: targetFp,
      runConfig: {
        dataEnvironmentDefault: String(
          overrides.dataEnvironmentDefault || process.env.V4_TO_V5_DATA_ENVIRONMENT || "pilot"
        )
          .trim()
          .toLowerCase(),
        canonicalDomainSuffix: String(
          overrides.canonicalDomainSuffix ||
            process.env.V4_TO_V5_CANONICAL_DOMAIN_SUFFIX ||
            "blessboard.org"
        )
          .trim()
          .toLowerCase(),
        deploymentCode: String(
          overrides.deploymentCode || process.env.V4_TO_V5_DEPLOYMENT_CODE || "blessboard-org-v5"
        ).trim(),
        batchSize: Math.min(
          200,
          Math.max(1, Number(overrides.batchSize || process.env.V4_TO_V5_BATCH_SIZE || 50) || 50)
        ),
      },
    },
  };
}

module.exports = {
  loadMigrationEnv,
  connectionFingerprint,
  safeConnectionSummary,
  parseDatabaseName,
  parseDatabaseHost,
};
