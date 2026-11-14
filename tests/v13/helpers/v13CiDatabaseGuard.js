"use strict";

/**
 * V13 CI disposable-database isolation guards.
 * Refuses production hosts, shared QA names, and unexpected identities.
 */

const LOCAL_HOSTS = new Set(["127.0.0.1", "localhost", "::1"]);
const BANNED_HOST_MARKERS = Object.freeze([
  "hostinger",
  "pronline.org",
  "blessboard.com",
  "activeclinic",
  "amazonaws.com",
  "neon.tech",
  "supabase.co",
  "railway.app",
  "render.com",
]);

const ALLOWED_CI_DB_NAME_RE = /^getpro_v13_(ci|bb_qa|int|e2e)_[a-z0-9]{6,32}$/;

/**
 * @param {string} connectionString
 */
function parsePgUrl(connectionString) {
  const raw = String(connectionString || "").trim();
  if (!raw) throw new Error("V13_CI_DB_GUARD: empty connection string");
  let u;
  try {
    u = new URL(raw.replace(/^postgresql:/i, "postgres:"));
  } catch {
    throw new Error("V13_CI_DB_GUARD: invalid PostgreSQL connection string");
  }
  return {
    hostname: String(u.hostname || "").toLowerCase(),
    port: u.port || "5432",
    database: decodeURIComponent((u.pathname || "").replace(/^\//, "").split("/")[0] || ""),
    username: decodeURIComponent(u.username || ""),
  };
}

/**
 * @param {string} name
 */
function assertOwnedDisposableDatabaseName(name) {
  const n = String(name || "");
  if (!ALLOWED_CI_DB_NAME_RE.test(n)) {
    throw new Error(
      `V13_CI_DB_GUARD: refusing unexpected database name "${n}" (expected getpro_v13_* disposable)`
    );
  }
  return n;
}

/**
 * @param {string} connectionString
 * @param {{ expectedDatabaseName?: string, requireLocalhost?: boolean }} [opts]
 */
function assertV13CiDatabaseUrl(connectionString, opts = {}) {
  const parsed = parsePgUrl(connectionString);
  const requireLocalhost = opts.requireLocalhost !== false;

  if (requireLocalhost && !LOCAL_HOSTS.has(parsed.hostname)) {
    throw new Error(
      `V13_CI_DB_GUARD: refusing non-local host (${parsed.hostname || "empty"})`
    );
  }

  const blob = String(connectionString || "").toLowerCase();
  for (const token of BANNED_HOST_MARKERS) {
    if (blob.includes(token)) {
      throw new Error(`V13_CI_DB_GUARD: refusing production/remote marker (${token})`);
    }
  }

  const sharedBanned = [
    "getpro_ci",
    "getpro_bb_browser_ci",
    "blessboard_foundation_test",
    "postgres",
    "production",
    "prod",
    "shared_qa",
  ];
  for (const banned of sharedBanned) {
    if (parsed.database === banned) {
      throw new Error(
        `V13_CI_DB_GUARD: refusing shared/non-owned database name "${parsed.database}"`
      );
    }
  }

  assertOwnedDisposableDatabaseName(parsed.database);

  if (opts.expectedDatabaseName) {
    if (parsed.database !== opts.expectedDatabaseName) {
      throw new Error(
        `V13_CI_DB_GUARD: database identity mismatch (got ${parsed.database}, expected ${opts.expectedDatabaseName})`
      );
    }
  }

  return parsed;
}

/**
 * Workflow must set GETPRO_V13_CI_RUN_ID and DATABASE_IDENTITY_ENV=testing.
 * @param {NodeJS.ProcessEnv} [env]
 */
function assertV13CiEnvironmentIdentity(env = process.env) {
  const runId = String(env.GETPRO_V13_CI_RUN_ID || "").trim();
  if (!/^[a-z0-9_-]{8,64}$/i.test(runId)) {
    throw new Error("V13_CI_DB_GUARD: missing or invalid GETPRO_V13_CI_RUN_ID");
  }
  const envCode = String(env.DATABASE_IDENTITY_ENV || env.EXPECTED_DATABASE_ENV || "").trim();
  if (envCode !== "testing") {
    throw new Error("V13_CI_DB_GUARD: DATABASE_IDENTITY_ENV must be testing");
  }
  if (String(env.GETPRO_TEST_DB || "") !== "1") {
    throw new Error("V13_CI_DB_GUARD: GETPRO_TEST_DB=1 required");
  }
  if (String(env.NODE_ENV || "") !== "test") {
    throw new Error("V13_CI_DB_GUARD: NODE_ENV must be test");
  }
  return { runId, envCode };
}

/**
 * DB-writing stages require explicit dual authorization (never default-on).
 * @param {NodeJS.ProcessEnv} [env]
 */
function assertDbWritingStagesAuthorized(env = process.env) {
  const enabled = String(env.GETPRO_V13_ALLOW_DB_WRITES || "") === "1";
  const authorized = String(env.GETPRO_V13_DB_STAGES_AUTHORIZED || "") === "1";
  if (!enabled || !authorized) {
    throw new Error(
      "V13_CI_DB_GUARD: database-writing stages are not authorized (require GETPRO_V13_ALLOW_DB_WRITES=1 and GETPRO_V13_DB_STAGES_AUTHORIZED=1)"
    );
  }
  return true;
}

/**
 * Build a run-owned disposable database name.
 * @param {string} runId
 * @param {'ci'|'bb_qa'|'int'|'e2e'} kind
 */
function buildOwnedDatabaseName(runId, kind) {
  const safeRun = String(runId || "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "")
    .slice(0, 20);
  if (safeRun.length < 6) {
    throw new Error("V13_CI_DB_GUARD: run id too short for disposable database name");
  }
  const safeKind = String(kind || "ci");
  if (!["ci", "bb_qa", "int", "e2e"].includes(safeKind)) {
    throw new Error("V13_CI_DB_GUARD: invalid disposable kind");
  }
  return assertOwnedDisposableDatabaseName(`getpro_v13_${safeKind}_${safeRun}`);
}

module.exports = {
  LOCAL_HOSTS,
  BANNED_HOST_MARKERS,
  ALLOWED_CI_DB_NAME_RE,
  parsePgUrl,
  assertOwnedDisposableDatabaseName,
  assertV13CiDatabaseUrl,
  assertV13CiEnvironmentIdentity,
  assertDbWritingStagesAuthorized,
  buildOwnedDatabaseName,
};
