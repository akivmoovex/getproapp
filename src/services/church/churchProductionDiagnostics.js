"use strict";

const crypto = require("crypto");
const path = require("path");
const { execFileSync } = require("child_process");

const { getChurchHostDomain, parseChurchHostFromDedicatedDomain } = require("../../church/host");
const {
  getBlessBoardCanonicalDomain,
  getDeploymentEnv,
  getSessionCookieName,
  areBlessBoardJobsEnabled,
  getUploadRoot,
} = require("../../church/blessBoardEnv");
const {
  getPgPool,
  isPgConfigured,
  getPoolRuntimeConfig,
  redactDatabaseHostFingerprint,
  getDatabaseUrl,
} = require("../../db/pg/pool");
const branchesRepo = require("../../db/pg/church/branchesRepo");
const { getDatabaseIdentity } = require("../../db/pg/church/databaseIdentityRepo");
const organizationsRepo = require("../../db/pg/church/organizationsRepo");
const { classifyPgError } = require("../../church/churchDbResilience");

const { latestChurchSchemaMigration } = require("../../db/pg/ensureChurchSchema");

const LATEST_CHURCH_MIGRATION = latestChurchSchemaMigration();
const PROJECT_ROOT = path.join(__dirname, "..", "..", "..");

function shortHash(value) {
  return crypto.createHash("sha256").update(String(value || "")).digest("hex").slice(0, 12);
}

/** Git commit SHA + branch, best effort: env first, then `git` (never throws). */
function getGitInfo() {
  let sha = String(process.env.GETPRO_GIT_SHA || "").trim();
  let branch = String(process.env.GETPRO_GIT_BRANCH || "").trim();
  if (!sha) {
    try {
      sha = execFileSync("git", ["rev-parse", "HEAD"], {
        cwd: PROJECT_ROOT,
        timeout: 800,
        stdio: ["ignore", "pipe", "ignore"],
      })
        .toString()
        .trim();
    } catch {
      sha = "";
    }
  }
  if (!branch) {
    try {
      branch = execFileSync("git", ["rev-parse", "--abbrev-ref", "HEAD"], {
        cwd: PROJECT_ROOT,
        timeout: 800,
        stdio: ["ignore", "pipe", "ignore"],
      })
        .toString()
        .trim();
    } catch {
      branch = "";
    }
  }
  return {
    commitSha: sha ? sha.slice(0, 12) : "(unavailable)",
    branch: branch || "(unavailable)",
  };
}

/**
 * Sanitized upload-root fingerprint: a stable hash + the final path segment only.
 * Never exposes the full filesystem path.
 */
function uploadRootFingerprint() {
  try {
    const root = getUploadRoot();
    return `${shortHash(root)} (…/${path.basename(root)})`;
  } catch {
    return "(unavailable)";
  }
}

/**
 * Sanitized PostgreSQL server + identity facts (no credentials, addresses, or URLs).
 * @param {import("pg").Pool|null} pool
 */
async function gatherDeploymentIdentity(pool) {
  const hostFingerprint = redactDatabaseHostFingerprint(getDatabaseUrl());
  const out = {
    databaseEnvironmentCode: "(not set)",
    deploymentName: "(not set)",
    databaseInstanceId: "(not set)",
    currentDatabase: "(unavailable)",
    postgresServerIdentity: "(unavailable)",
    postgresServerVersion: "(unavailable)",
    databaseHostFingerprint: hostFingerprint,
    schemaMigrationCurrent: "(unavailable)",
    latestExpectedMigration: LATEST_CHURCH_MIGRATION,
  };

  if (!pool) return out;

  try {
    const r = await pool.query(
      `SELECT current_database() AS current_database,
              current_setting('server_version') AS server_version,
              host(inet_server_addr()) AS server_addr,
              inet_server_port() AS server_port`
    );
    const row = r.rows[0] || {};
    out.currentDatabase = row.current_database || "(unavailable)";
    if (row.server_version) {
      const major = String(row.server_version).split(".")[0];
      out.postgresServerVersion = `PostgreSQL ${major}`;
    }
    // Hash address:port so the server is identifiable/comparable without leaking its location.
    const addrPart = row.server_addr ? `${row.server_addr}:${row.server_port || ""}` : hostFingerprint;
    out.postgresServerIdentity = `sha256:${shortHash(addrPart)}`;
  } catch {
    /* leave defaults */
  }

  try {
    const identity = await getDatabaseIdentity(pool);
    if (identity) {
      out.databaseEnvironmentCode = identity.environmentCode;
      out.deploymentName = identity.deploymentName || "(none)";
      out.databaseInstanceId = identity.databaseInstanceId;
    } else {
      out.databaseEnvironmentCode = "(not set — run church:db-identity:init)";
    }
  } catch {
    out.databaseEnvironmentCode = "(unavailable)";
  }

  try {
    const probe = await pool.query(
      `SELECT to_regclass('public.church_database_identity') IS NOT NULL AS latest_present`
    );
    out.schemaMigrationCurrent = probe.rows[0] && probe.rows[0].latest_present
      ? LATEST_CHURCH_MIGRATION
      : `behind (newest migration ${LATEST_CHURCH_MIGRATION} not applied)`;
  } catch {
    /* leave default */
  }

  return out;
}

function hostResolutionSamples() {
  const church = getChurchHostDomain();
  const apex = getBlessBoardCanonicalDomain();
  return [
    { host: apex, label: "BlessBoard apex" },
    { host: `demo.${church}`, label: "Demo branch" },
    { host: `kafuebaptist.${church}`, label: "Pilot branch (if provisioned)" },
    { host: `unknown.${church}`, label: "Unknown slug" },
  ];
}

function deploymentLabel() {
  return (
    String(process.env.GETPRO_DEPLOY_LABEL || "").trim() ||
    String(process.env.DEPLOYMENT_ENV || "").trim() ||
    String(process.env.GETPRO_GIT_SHA || "").trim().slice(0, 12) ||
    String(process.env.GETPRO_STYLES_V || "").trim() ||
    `(not set — set GETPRO_DEPLOY_LABEL, DEPLOYMENT_ENV, or GETPRO_GIT_SHA; current getDeploymentEnv=${getDeploymentEnv()})`
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
  const demoHost = `demo.${getChurchHostDomain()}`;
  if (!pool) {
    return { ok: false, host: demoHost, slug: "demo", message: "Database not configured." };
  }
  try {
    const branch = await branchesRepo.findBranchByHostSlug(pool, "demo");
    if (!branch) {
      return {
        ok: false,
        host: demoHost,
        slug: "demo",
        message: "No branch with host_slug=demo.",
      };
    }
    return {
      ok: true,
      host: demoHost,
      slug: "demo",
      message: `Resolved branch id=${branch.id}, status=${branch.status}.`,
      branchId: branch.id,
    };
  } catch (err) {
    const classified = classifyPgError(err);
    return {
      ok: false,
      host: demoHost,
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
        : { ok: false, message: `Restart app to apply ensureChurchSchema (latest: ${LATEST_CHURCH_MIGRATION}).` };
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
        : { ok: false, message: `Restart app to apply ensureChurchSchema (latest: ${LATEST_CHURCH_MIGRATION}).` };
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
  return hostResolutionSamples().map((sample) => {
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
 * Gather Growth scheduled-job paused counts (no PII).
 * @param {import("pg").Pool} pool
 * @returns {Promise<object>}
 */
async function gatherGrowthJobPausedCounts(pool) {
  if (!pool) {
    return {
      scheduledBroadcastsPausedNoEntitlement: null,
      scheduledBroadcastsPausedOrgInactive: null,
      scheduledReportsPausedNoEntitlement: null,
      scheduledReportsPausedOrgInactive: null,
      organizationsBlockedFromFoundationDowngrade: null,
      available: false,
    };
  }
  try {
    const {
      GROWTH_BROADCAST_STATUSES_BLOCKING_FOUNDATION_DOWNGRADE,
      GROWTH_REPORT_STATUSES_BLOCKING_FOUNDATION_DOWNGRADE,
    } = require("../../church/growthScheduledJobGate");
    const broadcastCounts = await pool.query(
      `SELECT
         COUNT(*) FILTER (WHERE status = 'paused_no_entitlement')::int AS no_entitlement,
         COUNT(*) FILTER (WHERE status = 'paused_organization_inactive')::int AS org_inactive
       FROM public.church_hq_broadcasts`
    );
    const reportCounts = await pool.query(
      `SELECT
         COUNT(*) FILTER (WHERE status = 'paused' AND pause_reason ILIKE '%entitlement%')::int AS no_entitlement,
         COUNT(*) FILTER (WHERE status = 'paused' AND (pause_reason ILIKE '%inactive%' OR pause_reason ILIKE '%suspend%' OR pause_reason ILIKE '%archived%' OR pause_reason ILIKE '%dormant%'))::int AS org_inactive
       FROM public.church_scheduled_reports`
    );
    const blockedOrgs = await pool.query(
      `SELECT COUNT(*)::int AS c
       FROM public.church_organizations o
       WHERE LOWER(COALESCE(o.plan_code, '')) = 'growth'
         AND (
           EXISTS (
             SELECT 1 FROM public.church_hq_broadcasts b
             WHERE b.organization_id = o.id
               AND b.status = ANY($1::text[])
           )
           OR EXISTS (
             SELECT 1 FROM public.church_scheduled_reports r
             WHERE r.organization_id = o.id
               AND r.status = ANY($2::text[])
           )
         )`,
      [
        GROWTH_BROADCAST_STATUSES_BLOCKING_FOUNDATION_DOWNGRADE,
        GROWTH_REPORT_STATUSES_BLOCKING_FOUNDATION_DOWNGRADE,
      ]
    );
    const b = broadcastCounts.rows[0] || {};
    const r = reportCounts.rows[0] || {};
    return {
      scheduledBroadcastsPausedNoEntitlement: Number(b.no_entitlement) || 0,
      scheduledBroadcastsPausedOrgInactive: Number(b.org_inactive) || 0,
      scheduledReportsPausedNoEntitlement: Number(r.no_entitlement) || 0,
      scheduledReportsPausedOrgInactive: Number(r.org_inactive) || 0,
      organizationsBlockedFromFoundationDowngrade: Number(blockedOrgs.rows[0]?.c) || 0,
      available: true,
    };
  } catch {
    return {
      scheduledBroadcastsPausedNoEntitlement: null,
      scheduledBroadcastsPausedOrgInactive: null,
      scheduledReportsPausedNoEntitlement: null,
      scheduledReportsPausedOrgInactive: null,
      organizationsBlockedFromFoundationDowngrade: null,
      available: false,
    };
  }
}

/**
 * Safe production diagnostics for super admins (no secrets).
 * @returns {Promise<object>}
 */
async function gatherChurchProductionDiagnostics(opts = {}) {
  const pool = opts.pool !== undefined ? opts.pool : getPgPool();
  const churchDomain = getChurchHostDomain();
  const dbCheck = await checkDatabaseReachable(pool);
  const churchBranchesTable = await checkChurchBranchesTable(pool);
  const demoBranchLookup = await checkDemoBranchLookup(pool);
  const schema = await checkSchemaFeatures(pool);
  const demoBranch = await checkDemoBranch(pool);
  const pilotBranch = await checkPilotBranch(pool, "kafuebaptist");
  const poolConfig = getPoolRuntimeConfig();
  const deploymentIdentity = await gatherDeploymentIdentity(pool);
  const git = getGitInfo();

  let backupVerification = null;
  if (pool && dbCheck.ok) {
    try {
      const churchBackupVerificationService = require("./churchBackupVerificationService");
      backupVerification = await churchBackupVerificationService.getBackupVerificationStatus(pool);
    } catch {
      backupVerification = {
        available: false,
        status: "unavailable",
        statusLabel: "Unavailable",
        health: "warning",
        warnings: ["Backup verification status could not be loaded."],
        lastSuccessfulBackupAt: null,
        lastRestorationTestAt: null,
        lastRestorationTestOutcome: null,
        staleDays: 7,
        recentEvents: [],
      };
    }
  } else {
    backupVerification = {
      available: false,
      status: "unavailable",
      statusLabel: "Unavailable",
      health: "warning",
      warnings: [],
      lastSuccessfulBackupAt: null,
      lastRestorationTestAt: null,
      lastRestorationTestOutcome: null,
      staleDays: 7,
      recentEvents: [],
    };
  }

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
    warnings.push(`Demo branch lookup (demo.${churchDomain}): ${demoBranchLookup.message}`);
  }
  if (!schema.memberRegistrationColumn.ok) warnings.push(schema.memberRegistrationColumn.message);
  if (!schema.contactSubmissionsTable.ok) warnings.push(schema.contactSubmissionsTable.message);
  if (!demoBranch.ok) warnings.push(`Demo branch: ${demoBranch.message}`);
  if (process.env.NODE_ENV !== "production") {
    warnings.push("NODE_ENV is not production (expected on local dev).");
  }
  if (backupVerification && Array.isArray(backupVerification.warnings)) {
    for (const w of backupVerification.warnings) warnings.push(w);
  }

  const growthJobPausedCounts = await gatherGrowthJobPausedCounts(pool && dbCheck.ok ? pool : null);

  let legacyPlanAudit = {
    totalOrganizations: 0,
    foundationCount: 0,
    growthCount: 0,
    freeCount: 0,
    standardCount: 0,
    proCount: 0,
    networkCount: 0,
    legacyTotal: 0,
    otherCount: 0,
    legacyByCode: [],
    legacyIncompatible: false,
    note: "Unavailable.",
  };
  if (pool && dbCheck.ok) {
    try {
      legacyPlanAudit = await organizationsRepo.getLegacyPlanCodeAudit(pool);
      if (legacyPlanAudit.legacyIncompatible) {
        const byCode =
          Array.isArray(legacyPlanAudit.legacyByCode) && legacyPlanAudit.legacyByCode.length
            ? legacyPlanAudit.legacyByCode
                .map((r) => `${r.plan_code}=${r.organization_count}`)
                .join(", ")
            : `free=${legacyPlanAudit.freeCount}, standard=${legacyPlanAudit.standardCount}, pro=${legacyPlanAudit.proCount}, network=${legacyPlanAudit.networkCount || 0}`;
        warnings.push(
          `Legacy package codes on ${legacyPlanAudit.legacyTotal} organisation(s) (${byCode}). Preserved — not auto-rewritten.`
        );
      }
    } catch {
      legacyPlanAudit.note = "Legacy plan audit could not be loaded.";
    }
  }

  return {
    deploymentEnv: getDeploymentEnv(),
    deploymentLabel: deploymentLabel(),
    nodeEnv: process.env.NODE_ENV || "(unset)",
    churchCanonicalDomain: getBlessBoardCanonicalDomain(),
    canonicalDomain: getBlessBoardCanonicalDomain(),
    sessionCookieName: getSessionCookieName(),
    backgroundJobsEnabled: areBlessBoardJobsEnabled(),
    uploadRootFingerprint: uploadRootFingerprint(),
    gitCommitSha: git.commitSha,
    gitBranch: git.branch,
    deploymentIdentity,
    legacyPlanAudit,
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
    backupVerification,
    growthJobPausedCounts,
    warnings,
    checkedAt: new Date().toISOString(),
  };
}

module.exports = {
  gatherChurchProductionDiagnostics,
  gatherDeploymentIdentity,
  gatherGrowthJobPausedCounts,
  uploadRootFingerprint,
  getGitInfo,
  LATEST_CHURCH_MIGRATION,
  deploymentLabel,
  sessionSecretWarning,
  checkDemoBranchLookup,
  checkChurchBranchesTable,
};
