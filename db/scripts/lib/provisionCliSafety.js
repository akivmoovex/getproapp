"use strict";

/**
 * Shared safety gates for BlessBoard V5 demo / ops provisioning CLIs.
 * Never logs DATABASE_URL, passwords, or GETPRO_DATABASE_URL values.
 */

const { envStringIsSet, requireDatabaseUrl, parseDatabaseName } = require("./databaseUrl");
const { sanitizeHostFingerprint } = require("./hostFingerprint");
const { checkDatabaseIdentity, validateIdentityKey } = require("./databaseIdentity");
const { buildFoundationPoolConfig } = require("./foundationPool");
const { Pool } = require("pg");

const FORBIDDEN_PUBLIC_TABLES = Object.freeze(["tenants", "session"]);

/**
 * Pool for ops CLIs against hosted Supabase (TLS / GETPRO_PG_SSL aware).
 * @param {string} connectionString
 * @param {{ max?: number }} [opts]
 */
function createProvisionPool(connectionString, opts = {}) {
  return new Pool(buildFoundationPoolConfig(connectionString, { max: opts.max != null ? opts.max : 2 }));
}

/**
 * Parse write mode. Dry-run is the default; writes require --confirm.
 * @param {string[]} argv
 * @returns {{ confirm: boolean, dryRun: boolean, rest: string[] }}
 */
function parseWriteMode(argv) {
  let confirm = false;
  let explicitDryRun = false;
  const rest = [];
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--confirm") confirm = true;
    else if (arg === "--dry-run") explicitDryRun = true;
    else rest.push(arg);
  }
  // Dry-run wins if both passed (safer). Confirm alone enables writes.
  const dryRun = explicitDryRun || !confirm;
  return { confirm: confirm && !explicitDryRun, dryRun, rest };
}

/**
 * Refuse GETPRO_DATABASE_URL even when DATABASE_URL is set (misconfiguration trap).
 * @returns {{ ok: true } | { ok: false, message: string, detail?: string }}
 */
function rejectGetproDatabaseUrlFallback() {
  if (envStringIsSet(process.env.GETPRO_DATABASE_URL)) {
    return {
      ok: false,
      message: "GETPRO_DATABASE_URL_forbidden",
      detail:
        "Unset GETPRO_DATABASE_URL. V5 provisioning uses DATABASE_URL only and will not fall back.",
    };
  }
  return { ok: true };
}

/**
 * @returns {{ ok: true, connectionString: string, databaseName: string|null, hostFingerprint: string }
 *   | { ok: false, message: string, detail?: string }}
 */
function resolveDatabaseUrlSafe() {
  const getpro = rejectGetproDatabaseUrlFallback();
  if (!getpro.ok) return getpro;
  try {
    const connectionString = requireDatabaseUrl();
    return {
      ok: true,
      connectionString,
      databaseName: parseDatabaseName(connectionString) || null,
      hostFingerprint: sanitizeHostFingerprint(connectionString),
    };
  } catch (err) {
    return { ok: false, message: err.message || "DATABASE_URL_required" };
  }
}

/**
 * Require DATABASE_IDENTITY_EXPECTED and match platform.database_identity.identity_key.
 * @param {import('pg').Pool} pool
 */
async function requireMatchedIdentity(pool) {
  const expectedRaw = process.env.DATABASE_IDENTITY_EXPECTED;
  if (!envStringIsSet(expectedRaw)) {
    return {
      ok: false,
      code: "missing_expected_identity",
      message: "DATABASE_IDENTITY_EXPECTED is required",
    };
  }
  const keyCheck = validateIdentityKey(expectedRaw);
  if (!keyCheck.ok) {
    return {
      ok: false,
      code: "invalid_identity_key",
      message: "DATABASE_IDENTITY_EXPECTED is invalid",
    };
  }
  const identity = await checkDatabaseIdentity(pool, { identityKey: keyCheck.key });
  if (!identity.ok) {
    return {
      ok: false,
      code: identity.code || "identity_mismatch",
      message: "database_identity_required",
      identity_code: identity.code,
    };
  }
  return {
    ok: true,
    identityKey: keyCheck.key,
    environmentCode: identity.row && identity.row.environment_code,
    row: identity.row,
  };
}

/**
 * Fail closed if legacy V4 tables exist on this database.
 * @param {import('pg').Pool} pool
 */
async function assertNoLegacyPublicTables(pool) {
  const found = [];
  for (const table of FORBIDDEN_PUBLIC_TABLES) {
    const r = await pool.query(`SELECT to_regclass($1) AS reg`, [`public.${table}`]);
    if (r.rows[0] && r.rows[0].reg) found.push(`public.${table}`);
  }
  if (found.length) {
    return {
      ok: false,
      message: "legacy_public_tables_present",
      tables: found,
      detail: "V5 provisioning refuses databases that expose public.tenants or public.session.",
    };
  }
  return { ok: true, tables: [] };
}

/**
 * Verify deployment_code exists, is active, and optionally matches PLATFORM_DEPLOYMENT_CODE.
 * @param {import('pg').Pool} pool
 * @param {string} deploymentCode
 */
async function assertDeploymentTarget(pool, deploymentCode) {
  const code = String(deploymentCode || "")
    .trim()
    .toLowerCase();
  if (!code) {
    return { ok: false, message: "deployment_code_required" };
  }
  const r = await pool.query(
    `SELECT deployment_code, status, environment_code
       FROM platform.deployments
      WHERE deployment_code = $1
      LIMIT 2`,
    [code]
  );
  if (r.rowCount === 0) {
    return { ok: false, message: "deployment_not_found", deploymentCode: code };
  }
  if (r.rowCount > 1) {
    return { ok: false, message: "deployment_ambiguous", deploymentCode: code };
  }
  const row = r.rows[0];
  if (String(row.status) !== "active") {
    return {
      ok: false,
      message: "inactive_deployment",
      deploymentCode: code,
      status: row.status,
    };
  }
  const expectedDeploy = String(process.env.PLATFORM_DEPLOYMENT_CODE || "")
    .trim()
    .toLowerCase();
  if (expectedDeploy && expectedDeploy !== code) {
    return {
      ok: false,
      message: "deployment_code_mismatch",
      deploymentCode: code,
      expected: expectedDeploy,
    };
  }
  return {
    ok: true,
    deploymentCode: row.deployment_code,
    status: row.status,
    environmentCode: row.environment_code,
  };
}

/**
 * Strip any accidental secret-looking substrings from a report object (defensive).
 * @param {unknown} value
 * @returns {unknown}
 */
function redactSecretsDeep(value) {
  if (value == null) return value;
  if (typeof value === "string") {
    if (/postgres(ql)?:\/\//i.test(value)) return "[redacted_url]";
    if (/password\s*=/i.test(value)) return "[redacted]";
    if (/GETPRO_DATABASE_URL/i.test(value) && value.includes("=")) return "[redacted]";
    return value;
  }
  if (Array.isArray(value)) return value.map(redactSecretsDeep);
  if (typeof value === "object") {
    const out = {};
    for (const [k, v] of Object.entries(value)) {
      const key = String(k).toLowerCase();
      if (
        key.includes("password") ||
        key.includes("secret") ||
        key.includes("connection") ||
        key === "database_url" ||
        key === "getpro_database_url"
      ) {
        out[k] = "[redacted]";
      } else {
        out[k] = redactSecretsDeep(v);
      }
    }
    return out;
  }
  return value;
}

/**
 * Build machine + human readable provision report.
 * @param {object} input
 */
function buildProvisionReport(input) {
  const mode = input.dryRun ? "dry_run" : "write";
  const machine = redactSecretsDeep({
    ok: Boolean(input.ok),
    mode,
    status: input.status || null,
    message: input.message || null,
    tool: input.tool || null,
    planned: input.planned || null,
    created: input.created || null,
    keys: input.keys || null,
    identity_key: input.identityKey || null,
    database_environment: input.environmentCode || null,
    deployment_code: input.deploymentCode || null,
    current_database: input.databaseName || null,
    host_fingerprint: input.hostFingerprint || null,
    requires_confirm: Boolean(input.dryRun),
    hint: input.dryRun
      ? "Re-run with --confirm to apply writes (omit --dry-run)."
      : undefined,
    error: input.error || undefined,
  });

  const lines = [
    `[${input.tool || "provision"}] mode=${mode} ok=${machine.ok} status=${machine.status || "n/a"}`,
  ];
  if (machine.planned && typeof machine.planned === "object") {
    const bits = Object.entries(machine.planned)
      .filter(([, v]) => v)
      .map(([k]) => k);
    lines.push(
      bits.length
        ? `  planned_writes: ${bits.join(", ")}`
        : "  planned_writes: (none — already provisioned / no-op)"
    );
  }
  if (machine.keys && typeof machine.keys === "object") {
    const keyBits = Object.entries(machine.keys)
      .filter(([, v]) => v != null && v !== "")
      .map(([k, v]) => `${k}=${v}`);
    if (keyBits.length) lines.push(`  keys: ${keyBits.join(" ")}`);
  }
  if (machine.identity_key) lines.push(`  identity_key: ${machine.identity_key}`);
  if (machine.deployment_code) lines.push(`  deployment_code: ${machine.deployment_code}`);
  if (machine.current_database) lines.push(`  database: ${machine.current_database}`);
  if (machine.host_fingerprint) lines.push(`  host_fingerprint: ${machine.host_fingerprint}`);
  if (machine.hint) lines.push(`  hint: ${machine.hint}`);
  if (machine.error) lines.push(`  error: ${machine.error}`);
  if (!machine.ok && machine.message) lines.push(`  message: ${machine.message}`);

  return {
    machine,
    human: lines.join("\n"),
  };
}

/**
 * Print report: stdout = JSON machine report; stderr = human summary.
 */
function emitProvisionReport(report) {
  // eslint-disable-next-line no-console
  console.log(JSON.stringify(report.machine, null, 2));
  // eslint-disable-next-line no-console
  console.error(report.human);
}

/**
 * Assert text does not contain secret material (for tests / defensive CLI checks).
 * @param {string} text
 * @param {string} [connectionString]
 */
function assertNoSecretsInText(text, connectionString) {
  const s = String(text || "");
  if (/postgres(ql)?:\/\//i.test(s)) {
    throw new Error("Refusing to print a postgres URL");
  }
  if (/password\s*=/i.test(s)) {
    throw new Error("Refusing to print password material");
  }
  if (connectionString && s.includes(connectionString)) {
    throw new Error("Refusing to print connection string");
  }
}

module.exports = {
  FORBIDDEN_PUBLIC_TABLES,
  parseWriteMode,
  rejectGetproDatabaseUrlFallback,
  resolveDatabaseUrlSafe,
  createProvisionPool,
  requireMatchedIdentity,
  assertNoLegacyPublicTables,
  assertDeploymentTarget,
  redactSecretsDeep,
  buildProvisionReport,
  emitProvisionReport,
  assertNoSecretsInText,
};
