"use strict";

const { getChurchHostDomain, parseChurchHostFromDedicatedDomain } = require("../../church/host");
const { getPgPool, isPgConfigured, getPoolRuntimeConfig } = require("../../db/pg/pool");
const branchesRepo = require("../../db/pg/church/branchesRepo");
const { classifyPgError } = require("../../church/churchDbResilience");

const LATEST_CHURCH_MIGRATION = "090_church_operational_readiness.sql";

const HOST_RESOLUTION_SAMPLES = [
  { host: "blessboard.com", label: "BlessBoard apex" },
  { host: "demo.blessboard.com", label: "Demo branch" },
  { host: "kafuebaptist.blessboard.com", label: "Pilot branch (if provisioned)" },
  { host: "unknown.blessboard.com", label: "Unknown slug" },
];

function deploymentLabel() {
  return (
    String(process.env.GETPRO_DEPLOY_LABEL || "").trim() ||
    String(process.env.GETPRO_GIT_SHA || "").trim().slice(0, 12) ||
    String(process.env.GETPRO_STYLES_V || "").trim() ||
    "(not set — set GETPRO_DEPLOY_LABEL or GETPRO_GIT_SHA in Hostinger env)"
  );
}

function sessionSecretWarning() {
  const secret = String(process.env.SESSION_SECRET || "");
  if (!secret) return "SESSION_SECRET is not set.";
  if (secret.length < 32) return "SESSION_SECRET is shorter than 32 characters.";
  return null;
}

async function checkDatabaseReachable(pool) {
  if (!pool) return { ok: false, error: "PostgreSQL is not configured.", errorKind: "not_configured" };
  try {
    await pool.query("SELECT 1 AS ok");
    return { ok: true };
  } catch (err) {
    const classified = classifyPgError(err);
    return { ok: false, error: classified.message, errorKind: classified.kind };
  }
}

async function checkChurchBranchesTable(pool) {
  if (!pool) return { ok: false, message: "Database not configured." };
  try {
    await pool.query(`SELECT 1 FROM public.church_branches LIMIT 1`);
    return { ok: true, message: "Reachable." };
  } catch (err) {
    const classified = classifyPgError(err);
    return { ok: false, message: classified.message, errorKind: classified.kind };
  }
}

async function checkDemoBranchLookup(pool) {
  if (!pool) {
    return { ok: false, host: "demo.blessboard.com", slug: "demo", message: "Database not configured." };
  }
  try {
    const branch = await branchesRepo.findBranchByHostSlug(pool, "demo");
    if (!branch) {
      return {
        ok: false,
        host: "demo.blessboard.com",
        slug: "demo",
        message: "No branch with host_slug=demo.",
      };
    }
    return {
      ok: true,
      host: "demo.blessboard.com",
      slug: "demo",
      message: `Resolved branch id=${branch.id}, status=${branch.status}.`,
      branchId: branch.id,
    };
  } catch (err) {
    const classified = classifyPgError(err);
    return {
      ok: false,
      host: "demo.blessboard.com",
      slug: "demo",
      message: classified.message,
      errorKind: classified.kind,
    };
  }
}

async function checkSchemaFeatures(pool) {
  if (!pool) {
    return {
      memberRegistrationColumn: { ok: false, message: "Database not configured." },
      contactSubmissionsTable: { ok: false, message: "Database not configured." },
    };
  }
  const out = {
    memberRegistrationColumn: { ok: false, message: "Column missing." },
    contactSubmissionsTable: { ok: false, message: "Table missing." },
  };
  try {
    const col = await pool.query(
      `SELECT 1
       FROM information_schema.columns
       WHERE table_schema = 'public'
         AND table_name = 'church_branches'
         AND column_name = 'member_registration_enabled'
       LIMIT 1`
    );
    out.memberRegistrationColumn =
      col.rows.length > 0
        ? { ok: true, message: "Present." }
        : { ok: false, message: "Run migration 090 or restart app to apply ensureChurchSchema." };
  } catch (err) {
    out.memberRegistrationColumn = { ok: false, message: err.message || "Check failed." };
  }
  try {
    const tbl = await pool.query(
      `SELECT 1
       FROM information_schema.tables
       WHERE table_schema = 'public'
         AND table_name = 'church_public_contact_submissions'
       LIMIT 1`
    );
    out.contactSubmissionsTable =
      tbl.rows.length > 0
        ? { ok: true, message: "Present." }
        : { ok: false, message: "Run migration 090 or restart app to apply ensureChurchSchema." };
  } catch (err) {
    out.contactSubmissionsTable = { ok: false, message: err.message || "Check failed." };
  }
  return out;
}

async function checkDemoBranch(pool) {
  if (!pool) return { ok: false, message: "Database not configured." };
  try {
    const branch = await branchesRepo.findBranchByHostSlug(pool, "demo");
    if (!branch) return { ok: false, message: "No branch with host_slug=demo. Demo seed may not have run." };
    return {
      ok: true,
      message: `Found branch id=${branch.id}, status=${branch.status}.`,
      branchId: branch.id,
      branchStatus: branch.status,
    };
  } catch (err) {
    return { ok: false, message: err.message || "Lookup failed." };
  }
}

async function checkPilotBranch(pool, slug = "kafuebaptist") {
  if (!pool) return { ok: false, message: "Database not configured.", slug };
  try {
    const branch = await branchesRepo.findBranchByHostSlug(pool, slug);
    if (!branch) {
      return {
        ok: false,
        message: `Not provisioned yet. Create via /admin/church/organizations/new with host slug ${slug}.`,
        slug,
      };
    }
    return {
      ok: true,
      message: `Found branch id=${branch.id}, name=${branch.name}, status=${branch.status}.`,
      slug,
      branchId: branch.id,
      branchName: branch.name,
      branchStatus: branch.status,
    };
  } catch (err) {
    return { ok: false, message: err.message || "Lookup failed.", slug };
  }
}

function resolveHostSamples() {
  return HOST_RESOLUTION_SAMPLES.map((sample) => {
    const parsed = parseChurchHostFromDedicatedDomain(sample.host);
    const kind = parsed ? parsed.kind : "unrecognized";
    const slug =
      parsed && (parsed.hostSlug || parsed.orgSlug) ? parsed.hostSlug || parsed.orgSlug : null;
    return {
      ...sample,
      parsedKind: kind,
      parsedSlug: slug,
    };
  });
}

/**
 * Safe production diagnostics for super admins (no secrets).
 * @returns {Promise<object>}
 */
async function gatherChurchProductionDiagnostics() {
  const pool = getPgPool();
  const churchDomain = getChurchHostDomain();
  const dbCheck = await checkDatabaseReachable(pool);
  const churchBranchesTable = await checkChurchBranchesTable(pool);
  const demoBranchLookup = await checkDemoBranchLookup(pool);
  const schema = await checkSchemaFeatures(pool);
  const demoBranch = await checkDemoBranch(pool);
  const pilotBranch = await checkPilotBranch(pool, "kafuebaptist");
  const poolConfig = getPoolRuntimeConfig();

  const warnings = [];
  const sessionWarn = sessionSecretWarning();
  if (sessionWarn) warnings.push(sessionWarn);
  if (!dbCheck.ok) {
    warnings.push(
      dbCheck.errorKind === "timeout"
        ? `Database timeout: ${dbCheck.error}`
        : "Database is not reachable."
    );
  }
  if (!churchBranchesTable.ok) {
    warnings.push(`church_branches table: ${churchBranchesTable.message}`);
  }
  if (!demoBranchLookup.ok) {
    warnings.push(`Demo branch lookup (demo.blessboard.com): ${demoBranchLookup.message}`);
  }
  if (!schema.memberRegistrationColumn.ok) warnings.push(schema.memberRegistrationColumn.message);
  if (!schema.contactSubmissionsTable.ok) warnings.push(schema.contactSubmissionsTable.message);
  if (!demoBranch.ok) warnings.push(`Demo branch: ${demoBranch.message}`);
  if (process.env.NODE_ENV !== "production") {
    warnings.push("NODE_ENV is not production (expected on local dev).");
  }

  return {
    deploymentLabel: deploymentLabel(),
    nodeEnv: process.env.NODE_ENV || "(unset)",
    databaseConfigured: isPgConfigured(),
    databaseReachable: dbCheck.ok,
    databaseError: dbCheck.ok ? null : dbCheck.error,
    databaseErrorKind: dbCheck.ok ? null : dbCheck.errorKind || "other",
    poolConfig,
    churchBranchesTable,
    demoBranchLookup,
    latestChurchMigration: LATEST_CHURCH_MIGRATION,
    churchHostDomain: churchDomain,
    baseDomain: process.env.BASE_DOMAIN || "(unset)",
    hostResolutionSamples: resolveHostSamples(),
    demoBranch,
    pilotBranch,
    schema,
    sessionSecretConfigured: Boolean(String(process.env.SESSION_SECRET || "").trim()),
    sessionSecretLengthOk: !sessionSecretWarning(),
    sessionSecretWarning: sessionWarn,
    warnings,
    checkedAt: new Date().toISOString(),
  };
}

module.exports = {
  gatherChurchProductionDiagnostics,
  LATEST_CHURCH_MIGRATION,
  deploymentLabel,
  sessionSecretWarning,
  checkDemoBranchLookup,
  checkChurchBranchesTable,
};
