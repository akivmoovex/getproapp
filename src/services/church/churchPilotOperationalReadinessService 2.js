"use strict";

/**
 * Read-only BlessBoard V5 pilot operational readiness checks.
 * Never prints secrets or mutates data.
 */

const { latestChurchSchemaMigration } = require("../../db/pg/ensureChurchSchema");
const {
  getBlessBoardCanonicalDomain,
  getChurchHostDomain,
  getSessionCookieName,
  areBlessBoardJobsEnabled,
  getDeploymentEnv,
  getDeploymentEnvMode,
  isTestingDeployment,
  isProductionDeployment,
  validateExpectedDatabaseEnv,
} = require("../../church/blessBoardEnv");
const {
  isPgConfigured,
  getPgPool,
  redactDatabaseHostFingerprint,
  getDatabaseUrl,
} = require("../../db/pg/pool");
const { getDatabaseIdentity } = require("../../db/pg/church/databaseIdentityRepo");
const organizationsRepo = require("../../db/pg/church/organizationsRepo");
const {
  gatherGrowthJobPausedCounts,
  LATEST_CHURCH_MIGRATION,
} = require("./churchProductionDiagnostics");

const REQUIRED_ENV_VARS = Object.freeze([
  { key: "SESSION_SECRET", required: true },
  { key: "DEPLOYMENT_ENV", required: false, recommended: true },
]);

const REQUIRED_TABLES = Object.freeze([
  "church_organizations",
  "church_branches",
  "church_database_identity",
  "church_organization_usage_months",
  "church_members",
  "church_hq_broadcast_attachments",
  "church_announcement_attachments",
  "church_platform_support_access",
  "church_organization_account_managers",
]);

const REQUIRED_INDEXES = Object.freeze([
  "idx_church_members_organization_status",
  "idx_church_hq_broadcast_attachments_org",
  "idx_church_announcement_attachments_organization",
]);

const SECRET_PATTERN =
  /(postgres(ql)?:\/\/[^\s"']+|(?:password|passwd|pwd)\s*[:=]\s*\S+|(?:api[_-]?key|access[_-]?token)\s*[:=]\s*\S+|bearer\s+[A-Za-z0-9\-._~+/]+=*)/gi;

function redactSecrets(text) {
  return String(text || "").replace(SECRET_PATTERN, "[redacted]");
}

function checkResult(id, status, message, detail = null) {
  return {
    id,
    status, // pass | fail | warn
    message: redactSecrets(message),
    detail: detail != null ? redactSecrets(String(detail)) : null,
  };
}

function hasDatabaseUrl() {
  return Boolean(
    String(process.env.DATABASE_URL || "").trim() ||
      String(process.env.GETPRO_DATABASE_URL || "").trim() ||
      String(process.env.TEST_DATABASE_URL || "").trim()
  );
}

async function countRecentFailedJobs(pool) {
  const out = {
    failedReportRuns: 0,
    failedBroadcastDeliveries: 0,
    available: false,
  };
  try {
    const reports = await pool.query(
      `SELECT COUNT(*)::int AS c
       FROM public.church_scheduled_report_runs
       WHERE status = 'failed'
         AND COALESCE(finished_at, started_at, created_at) > now() - interval '7 days'`
    );
    const broadcasts = await pool.query(
      `SELECT COUNT(*)::int AS c
       FROM public.church_hq_broadcast_deliveries
       WHERE status = 'failed'
         AND COALESCE(delivered_at, created_at) > now() - interval '7 days'`
    );
    out.failedReportRuns = Number(reports.rows[0]?.c) || 0;
    out.failedBroadcastDeliveries = Number(broadcasts.rows[0]?.c) || 0;
    out.available = true;
  } catch {
    out.available = false;
  }
  return out;
}

async function checkRequiredTables(pool) {
  const r = await pool.query(
    `SELECT c.relname AS name
     FROM pg_class c
     JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'public' AND c.relkind = 'r' AND c.relname = ANY($1::text[])`,
    [REQUIRED_TABLES]
  );
  const found = new Set(r.rows.map((row) => row.name));
  const missing = REQUIRED_TABLES.filter((t) => !found.has(t));
  return { missing, found: [...found] };
}

async function checkRequiredIndexes(pool) {
  const r = await pool.query(
    `SELECT indexname
     FROM pg_indexes
     WHERE schemaname = 'public' AND indexname = ANY($1::text[])`,
    [REQUIRED_INDEXES]
  );
  const found = new Set(r.rows.map((row) => row.indexname));
  const missing = REQUIRED_INDEXES.filter((t) => !found.has(t));
  return { missing, found: [...found] };
}

/**
 * @param {{ pool?: import("pg").Pool|null, expectEnv?: string|null }} opts
 * @returns {Promise<{ checks: object[], summary: object, exitCode: number, reportText: string }>}
 */
async function runPilotOperationalReadiness(opts = {}) {
  const checks = [];
  const env = opts.env || process.env;
  const pool = opts.pool !== undefined ? opts.pool : isPgConfigured() ? getPgPool() : null;
  const expectEnv =
    opts.expectEnv != null
      ? String(opts.expectEnv).trim().toLowerCase()
      : String(env.EXPECTED_DATABASE_ENV || env.DEPLOYMENT_ENV || "")
          .trim()
          .toLowerCase();

  // --- Environment variables (presence only) ---
  if (!hasDatabaseUrl()) {
    checks.push(
      checkResult(
        "env.database_url",
        "fail",
        "DATABASE_URL or GETPRO_DATABASE_URL (or TEST_DATABASE_URL in test) is not set"
      )
    );
  } else {
    checks.push(
      checkResult(
        "env.database_url",
        "pass",
        `Database URL configured (host fingerprint ${redactDatabaseHostFingerprint(getDatabaseUrl())})`
      )
    );
  }

  const sessionSecret = String(process.env.SESSION_SECRET || "");
  if (!sessionSecret) {
    checks.push(checkResult("env.session_secret", "fail", "Session secret env var is not set"));
  } else if (sessionSecret.length < 32) {
    checks.push(
      checkResult("env.session_secret", "fail", "Session secret env var is set but shorter than 32 characters")
    );
  } else {
    checks.push(
      checkResult("env.session_secret", "pass", "Session secret env var is set (length OK; value not shown)")
    );
  }

  if (!String(env.DEPLOYMENT_ENV || "").trim()) {
    checks.push(
      checkResult(
        "env.deployment_env",
        "warn",
        "DEPLOYMENT_ENV unset — demo visibility falls back to production (demos hidden)"
      )
    );
  } else {
    checks.push(
      checkResult(
        "env.deployment_env",
        "pass",
        `DEPLOYMENT_ENV=${getDeploymentEnv(env)} (mode=${getDeploymentEnvMode(env)})`
      )
    );
  }

  for (const item of REQUIRED_ENV_VARS) {
    if (item.key === "SESSION_SECRET" || item.key === "DEPLOYMENT_ENV") continue;
    const present = Boolean(String(process.env[item.key] || "").trim());
    if (!present && item.required) {
      checks.push(checkResult(`env.${item.key.toLowerCase()}`, "fail", `${item.key} is missing`));
    } else if (!present && item.recommended) {
      checks.push(checkResult(`env.${item.key.toLowerCase()}`, "warn", `${item.key} is recommended`));
    }
  }

  // --- Expected environment ---
  const expectedMatch = validateExpectedDatabaseEnv(env);
  if (!expectedMatch.ok) {
    checks.push(
      checkResult(
        "env.expected_database_env",
        "fail",
        `EXPECTED_DATABASE_ENV=${expectedMatch.expected} does not match DEPLOYMENT_ENV=${expectedMatch.actual}`
      )
    );
  } else if (String(env.EXPECTED_DATABASE_ENV || "").trim()) {
    checks.push(
      checkResult(
        "env.expected_database_env",
        "pass",
        `EXPECTED_DATABASE_ENV matches DEPLOYMENT_ENV=${getDeploymentEnv(env)}`
      )
    );
  } else {
    checks.push(
      checkResult(
        "env.expected_database_env",
        "pass",
        "EXPECTED_DATABASE_ENV not set (optional marker)"
      )
    );
  }

  // --- Domains / session / jobs ---
  const canonical = getBlessBoardCanonicalDomain();
  const churchHost = getChurchHostDomain();
  if (!canonical || !churchHost) {
    checks.push(checkResult("domains.canonical", "fail", "Canonical or church host domain unresolved"));
  } else {
    checks.push(
      checkResult(
        "domains.canonical",
        "pass",
        `canonical=${canonical}; church_host=${churchHost}`
      )
    );
  }

  checks.push(
    checkResult(
      "session.cookie_name",
      "pass",
      `Session cookie name configured as ${getSessionCookieName()}`
    )
  );

  const jobsEnabled = areBlessBoardJobsEnabled();
  checks.push(
    checkResult(
      "jobs.enabled",
      jobsEnabled ? "pass" : "warn",
      jobsEnabled
        ? "BLESSBOARD_JOBS_ENABLED is on (default or explicit)"
        : "BLESSBOARD_JOBS_ENABLED is disabled — cron workers will no-op"
    )
  );

  checks.push(
    checkResult(
      "demo.visibility_policy",
      "pass",
      isTestingDeployment(env)
        ? "DEPLOYMENT_ENV=testing — demo tenants may appear in directory/selector"
        : "Production-safe demo policy — demo tenants hidden from directory/selector"
    )
  );

  // --- Database identity + schema ---
  if (!pool) {
    checks.push(checkResult("db.reachable", "fail", "PostgreSQL pool is not configured"));
  } else {
    try {
      await pool.query("SELECT 1");
      checks.push(checkResult("db.reachable", "pass", "PostgreSQL SELECT 1 succeeded"));
    } catch (err) {
      checks.push(
        checkResult("db.reachable", "fail", `PostgreSQL not reachable: ${err.message || "error"}`)
      );
    }

    try {
      const identity = await getDatabaseIdentity(pool);
      if (!identity) {
        checks.push(
          checkResult(
            "db.identity",
            "fail",
            "No church_database_identity row — run npm run church:db-identity:init"
          )
        );
      } else {
        const code = String(identity.environmentCode || "").toLowerCase();
        const want =
          expectEnv === "testing" || expectEnv === "production"
            ? expectEnv
            : getDeploymentEnvMode(env);
        if (code !== want && (want === "testing" || want === "production")) {
          checks.push(
            checkResult(
              "db.identity",
              "fail",
              `Database identity is "${code}" but expected "${want}" (deployment mode)`
            )
          );
        } else {
          checks.push(
            checkResult(
              "db.identity",
              "pass",
              `Database identity=${code}; instance=${identity.databaseInstanceId}`
            )
          );
        }
      }
    } catch (err) {
      checks.push(
        checkResult("db.identity", "fail", `Could not read database identity: ${err.message || "error"}`)
      );
    }

    try {
      const probe = await pool.query(
        `SELECT to_regclass($1) IS NOT NULL AS present`,
        [`public.${REQUIRED_TABLES.includes("church_platform_support_access") ? "church_platform_support_access" : "church_organizations"}`]
      );
      const latest = latestChurchSchemaMigration() || LATEST_CHURCH_MIGRATION;
      const supportPresent = await pool.query(
        `SELECT to_regclass('public.church_platform_support_access') IS NOT NULL AS present`
      );
      if (supportPresent.rows[0]?.present) {
        checks.push(
          checkResult(
            "db.migration",
            "pass",
            `Latest church migration marker present (${latest})`
          )
        );
      } else {
        checks.push(
          checkResult(
            "db.migration",
            "fail",
            `Expected latest migration objects missing (want ${latest})`
          )
        );
      }
      void probe;
    } catch (err) {
      checks.push(
        checkResult("db.migration", "fail", `Migration probe failed: ${err.message || "error"}`)
      );
    }

    try {
      const tables = await checkRequiredTables(pool);
      if (tables.missing.length) {
        checks.push(
          checkResult(
            "db.tables",
            "fail",
            `Missing required tables: ${tables.missing.join(", ")}`
          )
        );
      } else {
        checks.push(
          checkResult("db.tables", "pass", `Required tables present (${REQUIRED_TABLES.length})`)
        );
      }
    } catch (err) {
      checks.push(checkResult("db.tables", "fail", `Table check failed: ${err.message || "error"}`));
    }

    try {
      const indexes = await checkRequiredIndexes(pool);
      if (indexes.missing.length) {
        checks.push(
          checkResult(
            "db.indexes",
            "fail",
            `Missing required indexes: ${indexes.missing.join(", ")}`
          )
        );
      } else {
        checks.push(
          checkResult("db.indexes", "pass", `Required indexes present (${REQUIRED_INDEXES.length})`)
        );
      }
    } catch (err) {
      checks.push(checkResult("db.indexes", "fail", `Index check failed: ${err.message || "error"}`));
    }

    try {
      const legacy = await organizationsRepo.getLegacyPlanCodeAudit(pool);
      if (legacy.legacyIncompatible) {
        checks.push(
          checkResult(
            "plans.legacy",
            "warn",
            `Legacy plan codes on ${legacy.legacyTotal} org(s) — preserved, not auto-rewritten`
          )
        );
      } else {
        checks.push(
          checkResult(
            "plans.legacy",
            "pass",
            `No incompatible legacy plan codes (foundation=${legacy.foundationCount}, growth=${legacy.growthCount})`
          )
        );
      }
    } catch (err) {
      checks.push(
        checkResult("plans.legacy", "warn", `Legacy plan audit unavailable: ${err.message || "error"}`)
      );
    }

    const paused = await gatherGrowthJobPausedCounts(pool);
    if (!paused.available) {
      checks.push(
        checkResult("jobs.paused", "warn", "Paused entitlement/inactive job counts unavailable")
      );
    } else {
      const totalPaused =
        (paused.scheduledBroadcastsPausedNoEntitlement || 0) +
        (paused.scheduledBroadcastsPausedOrgInactive || 0) +
        (paused.scheduledReportsPausedNoEntitlement || 0) +
        (paused.scheduledReportsPausedOrgInactive || 0);
      checks.push(
        checkResult(
          "jobs.paused",
          totalPaused > 0 ? "warn" : "pass",
          `Paused jobs: broadcasts entitlement=${paused.scheduledBroadcastsPausedNoEntitlement}, broadcasts inactive=${paused.scheduledBroadcastsPausedOrgInactive}, reports entitlement=${paused.scheduledReportsPausedNoEntitlement}, reports inactive=${paused.scheduledReportsPausedOrgInactive}`
        )
      );
    }

    const failed = await countRecentFailedJobs(pool);
    if (!failed.available) {
      checks.push(checkResult("jobs.failed", "warn", "Recent failed-job counts unavailable"));
    } else {
      const totalFailed = failed.failedReportRuns + failed.failedBroadcastDeliveries;
      checks.push(
        checkResult(
          "jobs.failed",
          totalFailed > 0 ? "warn" : "pass",
          `Failed in last 7d: report_runs=${failed.failedReportRuns}, broadcast_deliveries=${failed.failedBroadcastDeliveries}`
        )
      );
    }
  }

  void isProductionDeployment;

  const summary = {
    pass: checks.filter((c) => c.status === "pass").length,
    fail: checks.filter((c) => c.status === "fail").length,
    warn: checks.filter((c) => c.status === "warn").length,
    total: checks.length,
    checkedAt: new Date().toISOString(),
    deploymentEnv: getDeploymentEnv(env),
    deploymentMode: getDeploymentEnvMode(env),
    latestMigration: latestChurchSchemaMigration() || LATEST_CHURCH_MIGRATION,
    readOnly: true,
  };

  const lines = [
    "BlessBoard V5 pilot operational readiness (read-only)",
    `Checked at: ${summary.checkedAt}`,
    `DEPLOYMENT_ENV=${summary.deploymentEnv} mode=${summary.deploymentMode}`,
    `Latest migration: ${summary.latestMigration}`,
    "",
  ];
  for (const c of checks) {
    const tag = c.status.toUpperCase().padEnd(4);
    lines.push(`${tag} ${c.id}: ${c.message}`);
  }
  lines.push("");
  lines.push(
    `SUMMARY pass=${summary.pass} fail=${summary.fail} warn=${summary.warn} total=${summary.total}`
  );
  if (summary.fail > 0) {
    lines.push("RESULT: FAIL — resolve failing checks before pilot promotion");
  } else if (summary.warn > 0) {
    lines.push("RESULT: PASS WITH WARNINGS — review warnings before pilot");
  } else {
    lines.push("RESULT: PASS");
  }

  const reportText = redactSecrets(lines.join("\n"));
  return {
    checks,
    summary,
    exitCode: summary.fail > 0 ? 1 : 0,
    reportText,
  };
}

module.exports = {
  runPilotOperationalReadiness,
  redactSecrets,
  REQUIRED_TABLES,
  REQUIRED_INDEXES,
  SECRET_PATTERN,
};
