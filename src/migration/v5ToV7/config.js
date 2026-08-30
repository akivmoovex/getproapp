"use strict";

/**
 * V5/V6 → V7 migration env — never falls back to DATABASE_URL alone.
 */

const crypto = require("crypto");
const { parseDatabaseName } = require("../../../db/scripts/lib/databaseUrl");
const { sanitizeHostFingerprint } = require("../../../db/scripts/lib/hostFingerprint");

const ALLOWED_SOURCE_IDENTITIES = Object.freeze([
  "blessboard-platform-v5",
  "moovex-platform-v7", // rehearsal clone of V5-shaped data
]);

const ALLOWED_TARGET_IDENTITIES = Object.freeze(["moovex-platform-v7"]);

const ALLOWED_ENVIRONMENTS = Object.freeze(["testing", "production", "rehearsal", "preproduction"]);

function envRequired(name) {
  const v = process.env[name];
  if (v == null || String(v).trim() === "") {
    return { ok: false, reason: `missing_${name}` };
  }
  return { ok: true, value: String(v).trim() };
}

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

function safeConnectionSummary(connectionString, label) {
  return {
    label,
    hostFingerprint: sanitizeHostFingerprint(connectionString),
    databaseName: parseDatabaseName(connectionString) || "(unknown)",
    fingerprintSha256Prefix: (connectionFingerprint(connectionString) || "").slice(0, 12),
  };
}

/**
 * @param {object} [overrides]
 */
function loadMigrationEnv(overrides = {}) {
  const bbSource =
    overrides.V5_BB_SOURCE_DATABASE_URL != null
      ? { ok: true, value: String(overrides.V5_BB_SOURCE_DATABASE_URL).trim() }
      : envRequired("V5_BB_SOURCE_DATABASE_URL");
  const acSource =
    overrides.V6_AC_SOURCE_DATABASE_URL != null
      ? { ok: true, value: String(overrides.V6_AC_SOURCE_DATABASE_URL).trim() }
      : process.env.V6_AC_SOURCE_DATABASE_URL
        ? { ok: true, value: String(process.env.V6_AC_SOURCE_DATABASE_URL).trim() }
        : { ok: true, value: null };
  const target =
    overrides.V7_TARGET_DATABASE_URL != null
      ? { ok: true, value: String(overrides.V7_TARGET_DATABASE_URL).trim() }
      : envRequired("V7_TARGET_DATABASE_URL");

  const sourceIdentity = String(
    overrides.V7_SOURCE_IDENTITY_EXPECTED ||
      process.env.V7_SOURCE_IDENTITY_EXPECTED ||
      "blessboard-platform-v5"
  )
    .trim()
    .toLowerCase();
  const targetIdentity = String(
    overrides.V7_TARGET_IDENTITY_EXPECTED ||
      process.env.V7_TARGET_IDENTITY_EXPECTED ||
      "moovex-platform-v7"
  )
    .trim()
    .toLowerCase();
  const sourceEnv = String(
    overrides.V7_SOURCE_ENVIRONMENT_EXPECTED ||
      process.env.V7_SOURCE_ENVIRONMENT_EXPECTED ||
      "production"
  )
    .trim()
    .toLowerCase();
  const targetEnv = String(
    overrides.V7_TARGET_ENVIRONMENT_EXPECTED ||
      process.env.V7_TARGET_ENVIRONMENT_EXPECTED ||
      "rehearsal"
  )
    .trim()
    .toLowerCase();

  const errors = [];
  if (!bbSource.ok) errors.push(bbSource.reason);
  if (!target.ok) errors.push(target.reason);
  if (!ALLOWED_SOURCE_IDENTITIES.includes(sourceIdentity)) {
    errors.push("invalid_V7_SOURCE_IDENTITY_EXPECTED");
  }
  if (!ALLOWED_TARGET_IDENTITIES.includes(targetIdentity)) {
    errors.push("invalid_V7_TARGET_IDENTITY_EXPECTED");
  }
  if (!ALLOWED_ENVIRONMENTS.includes(sourceEnv)) errors.push("invalid_V7_SOURCE_ENVIRONMENT_EXPECTED");
  if (!ALLOWED_ENVIRONMENTS.includes(targetEnv)) errors.push("invalid_V7_TARGET_ENVIRONMENT_EXPECTED");

  if (
    !overrides.allowDatabaseUrl &&
    (!bbSource.ok || !target.ok) &&
    process.env.DATABASE_URL &&
    String(process.env.DATABASE_URL).trim()
  ) {
    errors.push("refusing_DATABASE_URL_fallback");
  }
  if (
    !overrides.allowGetproDatabaseUrl &&
    process.env.GETPRO_DATABASE_URL &&
    String(process.env.GETPRO_DATABASE_URL).trim()
  ) {
    errors.push("GETPRO_DATABASE_URL_forbidden");
  }

  if (errors.length) {
    return { ok: false, errors, config: null };
  }

  const sourceUrl = bbSource.value;
  const acSourceExplicit = Boolean(acSource.value);
  const acSourceUrl = acSource.value || sourceUrl;
  const targetUrl = target.value;
  const fingerprints = [sourceUrl, targetUrl];
  if (acSourceExplicit) fingerprints.push(acSourceUrl);
  const fingerprintHashes = fingerprints.map(connectionFingerprint);
  if (fingerprintHashes.some((fp) => !fp)) {
    return { ok: false, errors: ["unparseable_connection_string"], config: null };
  }
  const unique = new Set(fingerprintHashes);
  if (unique.size !== fingerprintHashes.length) {
    return { ok: false, errors: ["duplicate_connection_fingerprint"], config: null };
  }

  const hosted = /supabase\.co|amazonaws\.com|neon\.tech|render\.com/i;
  const urls = [sourceUrl, targetUrl, acSourceUrl].filter(Boolean);
  if (urls.some((u) => hosted.test(u)) && !overrides.allowHosted) {
    return { ok: false, errors: ["hosted_database_forbidden_without_V7_MIGRATION_ALLOW_HOSTED"], config: null };
  }

  if (
    targetEnv === "production" &&
    !overrides.confirmProductionTarget &&
    !process.env.V7_MIGRATION_CONFIRM_PRODUCTION_TARGET
  ) {
    return { ok: false, errors: ["production_target_requires_V7_MIGRATION_CONFIRM_PRODUCTION_TARGET"], config: null };
  }

  const excludeOrgKeys = String(
    overrides.excludeOrgKeys || process.env.V7_MIGRATION_EXCLUDE_ORG_KEYS || ""
  )
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);

  return {
    ok: true,
    errors: [],
    config: {
      bbSourceUrl: sourceUrl,
      acSourceUrl,
      acSourceExplicit,
      targetUrl,
      sourceIdentity,
      targetIdentity,
      sourceEnvironment: sourceEnv,
      targetEnvironment: targetEnv,
      bbSourceSummary: safeConnectionSummary(sourceUrl, "bb_v5_source"),
      acSourceSummary: safeConnectionSummary(acSourceUrl || sourceUrl, "ac_v6_source"),
      targetSummary: safeConnectionSummary(targetUrl, "v7_target"),
      runConfig: {
        batchSize: Math.min(
          200,
          Math.max(1, Number(overrides.batchSize || process.env.V7_MIGRATION_BATCH_SIZE || 50) || 50)
        ),
        excludeOrgKeys: excludeOrgKeys.length
          ? excludeOrgKeys
          : ["activeclinic-demo", "demo-church", "julflona-clinic"],
        excludeOrgKeyPatterns: [/qa-/i, /-qa-/i, /example\.test$/i, /example\.invalid$/i],
        migrateAcClinical: String(process.env.V7_MIGRATION_AC_CLINICAL || "1").trim() !== "0",
        watermarkFile: overrides.watermarkFile || null,
      },
    },
  };
}

module.exports = {
  loadMigrationEnv,
  connectionFingerprint,
  safeConnectionSummary,
  ALLOWED_SOURCE_IDENTITIES,
  ALLOWED_TARGET_IDENTITIES,
};
