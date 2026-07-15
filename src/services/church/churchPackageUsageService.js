"use strict";

/**
 * Central BlessBoard package usage measurement and hard-limit helpers.
 *
 * Does not collect payments or estimate invoice totals.
 * Uses cached storage bytes and monthly counters — not full-table scans per request.
 */

const branchesRepo = require("../../db/pg/church/branchesRepo");
const organizationUsageRepo = require("../../db/pg/church/organizationUsageRepo");
const auditLogsRepo = require("../../db/pg/church/auditLogsRepo");
const {
  FAIR_USE,
  getPackageDefinition,
} = require("../../church/blessBoardPackageCatalogue");
const {
  getOrganisationPlan,
  getNumericLimit,
  checkQuota,
} = require("./churchEntitlementService");
const {
  countActiveMembersForOrganization,
  countPrivilegedAccountsForOrganization,
} = require("./churchSeatQuotaService");

const STORAGE_QUOTA_ERROR =
  "Storage limit reached for your package. Delete unused files or upgrade to Growth.";
const EXTERNAL_EMAIL_QUOTA_ERROR =
  "Monthly external email limit reached for your package. Wait for next month or upgrade.";
const SCHEDULED_REPORT_QUOTA_ERROR =
  "Monthly scheduled report limit reached for your package.";

/** Email categories that must never be counted or blocked by package quotas. */
const EXEMPT_EMAIL_CATEGORIES = new Set([
  "security_notification",
  "password_recovery",
  "safeguarding",
  "account_export",
  "billing_access",
  "offboarding",
]);

const DEFAULT_WARNING_THRESHOLDS = Object.freeze([0.8, 0.9, 1.0]);

/**
 * Configurable warning thresholds (ratios of used/limit).
 * Env: BLESSBOARD_USAGE_WARNING_THRESHOLDS=0.8,0.9,1.0
 * @returns {number[]}
 */
function getWarningThresholds() {
  const raw = process.env.BLESSBOARD_USAGE_WARNING_THRESHOLDS;
  if (!raw || !String(raw).trim()) return [...DEFAULT_WARNING_THRESHOLDS];
  const parsed = String(raw)
    .split(",")
    .map((s) => Number(String(s).trim()))
    .filter((n) => Number.isFinite(n) && n > 0);
  return parsed.length ? parsed.sort((a, b) => a - b) : [...DEFAULT_WARNING_THRESHOLDS];
}

function isExemptEmailCategory(category) {
  const key = String(category || "")
    .trim()
    .toLowerCase();
  return EXEMPT_EMAIL_CATEGORIES.has(key);
}

function formatBytes(bytes) {
  const n = Number(bytes) || 0;
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / (1024 * 1024)).toFixed(1)} MB`;
  return `${(n / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

function formatLimitDisplay(used, limit, opts = {}) {
  if (limit === FAIR_USE) {
    return opts.fairUseLabel || `${used} / fair use`;
  }
  if (limit == null) {
    return `${used} (counted; no hard cap)`;
  }
  if (typeof limit !== "number") return String(used);
  if (opts.format === "bytes") {
    return `${formatBytes(used)} / ${formatBytes(limit)}`;
  }
  return `${used} / ${limit}`;
}

function quotaToMeter(quota, displayOpts = {}) {
  const warningBand = quota.warningBand || null;
  let state = "ok";
  if (quota.status === "exceeded" || quota.status === "at_limit" || warningBand === 100) {
    state = "blocked";
  } else if (warningBand === 90 || warningBand === 80 || quota.status === "near" || quota.status === "warn_90" || quota.status === "warn_80") {
    state = "warning";
  } else if (quota.status === "fair_use" || quota.status === "unlimited") {
    state = quota.status;
  }

  return {
    key: quota.key,
    used: quota.used,
    limit: quota.limit,
    remaining: quota.remaining,
    status: quota.status,
    warningBand,
    state,
    ok: quota.ok,
    enforced: Boolean(quota.enforced),
    display: formatLimitDisplay(quota.used, quota.limit, displayOpts),
  };
}

/**
 * @param {import("pg").Pool | import("pg").PoolClient} db
 * @param {number} organizationId
 * @param {{ reconcileStorage?: boolean, at?: Date }} [opts]
 */
async function getOrganisationUsageSnapshot(db, organizationId, opts = {}) {
  const orgId = Number(organizationId);
  if (!Number.isFinite(orgId) || orgId <= 0) return null;

  const plan = await getOrganisationPlan(db, orgId);
  if (!plan) return null;

  const orgRow = await db.query(
    `SELECT id, timezone, storage_bytes_used, storage_bytes_reconciled_at
     FROM public.church_organizations WHERE id = $1 LIMIT 1`,
    [orgId]
  );
  const org = orgRow.rows[0];
  if (!org) return null;

  const timezone = org.timezone || "UTC";
  const at = opts.at instanceof Date ? opts.at : new Date();
  const usageMonth = organizationUsageRepo.usageMonthKeyForTimezone(timezone, at);

  if (opts.reconcileStorage || !org.storage_bytes_reconciled_at) {
    await organizationUsageRepo.reconcileStorageBytesUsed(db, orgId);
  }

  const refreshed = await db.query(
    `SELECT storage_bytes_used, storage_bytes_reconciled_at, timezone
     FROM public.church_organizations WHERE id = $1`,
    [orgId]
  );
  const storageBytes = Number(refreshed.rows[0]?.storage_bytes_used) || 0;

  const [activeBranches, activeMembers, privileged, monthRow] = await Promise.all([
    branchesRepo.countActiveBranchesForOrganization(db, orgId),
    countActiveMembersForOrganization(db, orgId),
    countPrivilegedAccountsForOrganization(db, orgId),
    organizationUsageRepo.getOrCreateUsageMonth(db, orgId, usageMonth),
  ]);

  const limitOpts = { activeBranchCount: activeBranches };
  const thresholds = getWarningThresholds();

  const meters = {
    branches: quotaToMeter(
      checkQuota(plan, "branches.max_active", activeBranches, { ...limitOpts, thresholds })
    ),
    members: quotaToMeter(
      checkQuota(plan, "members.max_active", activeMembers, { thresholds })
    ),
    admins: quotaToMeter(
      checkQuota(plan, "admins.max", privileged.total, { thresholds })
    ),
    storage: quotaToMeter(
      checkQuota(plan, "storage.bytes", storageBytes, { ...limitOpts, thresholds }),
      { format: "bytes" }
    ),
    externalEmails: quotaToMeter(
      checkQuota(plan, "external_emails.monthly", monthRow.external_emails_count || 0, {
        ...limitOpts,
        thresholds,
      })
    ),
    scheduledReports: quotaToMeter(
      checkQuota(plan, "reports.scheduled_monthly", monthRow.scheduled_reports_count || 0, {
        thresholds,
      })
    ),
  };

  // Hard enforcement flags (matches assert helpers). Fair-use / unlimited → not hard-blocked.
  meters.branches.enforced = typeof meters.branches.limit === "number";
  meters.members.enforced = typeof meters.members.limit === "number";
  meters.admins.enforced = typeof meters.admins.limit === "number";
  meters.storage.enforced = typeof meters.storage.limit === "number";
  meters.externalEmails.enforced = typeof meters.externalEmails.limit === "number";
  meters.scheduledReports.enforced = typeof meters.scheduledReports.limit === "number";

  // Limit 0 with no usage = feature not included (Foundation scheduled reports), not an active block alert.
  if (
    meters.scheduledReports.limit === 0 &&
    meters.scheduledReports.used === 0
  ) {
    meters.scheduledReports.state = "unavailable";
    meters.scheduledReports.display = "Not included (0 / month)";
  }

  const warnings = [];
  const blocked = [];
  for (const meter of Object.values(meters)) {
    if (meter.state === "unavailable") continue;
    if (meter.state === "blocked" && typeof meter.limit === "number") {
      blocked.push({
        key: meter.key,
        message: `${meter.key} at ${meter.display}`,
        warningBand: meter.warningBand,
      });
    } else if (meter.state === "warning" && typeof meter.limit === "number") {
      warnings.push({
        key: meter.key,
        message: `${meter.key} at ${meter.warningBand || 80}% (${meter.display})`,
        warningBand: meter.warningBand,
      });
    }
  }

  const availableUpgrade =
    plan.packageCode === "foundation"
      ? {
          packageCode: "growth",
          packageLabel: getPackageDefinition("growth").label,
          reason: blocked.length
            ? "A hard package limit was reached."
            : warnings.length
              ? "Usage is approaching Foundation limits."
              : "Unlock Growth capacity and features.",
        }
      : null;

  return {
    organizationId: orgId,
    timezone,
    usageMonth,
    packageCode: plan.packageCode,
    packageLabel: plan.packageLabel,
    planStatus: plan.planStatus,
    activeBranches,
    activeMembers,
    privilegedAccounts: privileged.total,
    privilegedBreakdown: privileged,
    storageBytesUsed: storageBytes,
    externalEmailsThisMonth: monthRow.external_emails_count || 0,
    scheduledReportsThisMonth: monthRow.scheduled_reports_count || 0,
    meters,
    warnings,
    blocked,
    availableUpgrade,
    limits: {
      branches: meters.branches.limit,
      members: meters.members.limit,
      admins: meters.admins.limit,
      storageBytes: meters.storage.limit,
      externalEmailsMonthly: meters.externalEmails.limit,
      scheduledReportsMonthly: meters.scheduledReports.limit,
    },
  };
}

async function recordQuotaBlock(db, entry) {
  await auditLogsRepo.insertAuditLog(db, {
    organization_id: entry.organizationId,
    branch_id: entry.branchId || null,
    actor_type: entry.actorType || "system",
    actor_id: entry.actorId || null,
    action: entry.action,
    entity_type: entry.entityType || "church_organization",
    entity_id: entry.entityId || entry.organizationId,
    target_label: entry.targetLabel || null,
    metadata_json: {
      package_code: entry.packageCode || null,
      quota_key: entry.quotaKey,
      used: entry.used,
      limit: entry.limit,
      message: entry.message,
      ...(entry.metadata || {}),
    },
  });
}

/**
 * Hard limit: attachment storage. Call before upload persistence.
 */
async function assertCanConsumeStorage(db, opts) {
  const organizationId = Number(opts.organizationId);
  const additionalBytes = Math.max(0, Math.floor(Number(opts.additionalBytes) || 0));
  const plan = await getOrganisationPlan(db, organizationId);
  if (!plan) {
    const err = new Error("Organisation not found");
    err.code = "ORG_NOT_FOUND";
    throw err;
  }

  const activeBranches = await branchesRepo.countActiveBranchesForOrganization(db, organizationId);
  const limit = getNumericLimit(plan, "storage.bytes", { activeBranchCount: activeBranches });
  if (limit === FAIR_USE || limit == null || typeof limit !== "number") {
    return { allowed: true, limit, used: null, packageCode: plan.packageCode };
  }

  const org = await db.query(
    `SELECT storage_bytes_used FROM public.church_organizations WHERE id = $1`,
    [organizationId]
  );
  const used = Number(org.rows[0]?.storage_bytes_used) || 0;
  if (used + additionalBytes > limit) {
    await recordQuotaBlock(db, {
      organizationId,
      actorType: opts.actorType,
      actorId: opts.actorId,
      action: "package_quota_storage_blocked",
      packageCode: plan.packageCode,
      quotaKey: "storage.bytes",
      used,
      limit,
      message: STORAGE_QUOTA_ERROR,
      metadata: { additional_bytes: additionalBytes },
    });
    throw Object.assign(new Error(STORAGE_QUOTA_ERROR), {
      code: "PACKAGE_STORAGE_LIMIT",
      packageCode: plan.packageCode,
      used,
      limit,
    });
  }
  return { allowed: true, used, limit, packageCode: plan.packageCode };
}

/**
 * Record + optionally enforce external email send.
 * Exempt categories never increment meters and never block.
 */
async function recordExternalEmailSend(db, opts) {
  const organizationId = Number(opts.organizationId);
  const category = String(opts.category || "general")
    .trim()
    .toLowerCase();
  const count = Math.max(1, Math.floor(Number(opts.count) || 1));
  const plan = await getOrganisationPlan(db, organizationId);
  if (!plan) {
    const err = new Error("Organisation not found");
    err.code = "ORG_NOT_FOUND";
    throw err;
  }

  if (isExemptEmailCategory(category)) {
    return {
      allowed: true,
      exempt: true,
      category,
      recorded: false,
      packageCode: plan.packageCode,
    };
  }

  try {
    const churchBillingStateService = require("./churchBillingStateService");
    const orgRow = await db.query(
      `SELECT billing_collection_state FROM public.church_organizations WHERE id = $1`,
      [organizationId]
    );
    const messaging = churchBillingStateService.maySendExternalMessaging(orgRow.rows[0] || {});
    if (!messaging.allowed) {
      throw Object.assign(new Error(messaging.message), {
        code: messaging.code || "BILLING_RESTRICTED",
      });
    }
  } catch (err) {
    if (err && err.code === "BILLING_RESTRICTED") throw err;
    /* billing state helper optional if columns missing mid-migration */
  }

  const org = await db.query(`SELECT timezone FROM public.church_organizations WHERE id = $1`, [
    organizationId,
  ]);
  const timezone = org.rows[0]?.timezone || "UTC";
  const usageMonth = organizationUsageRepo.usageMonthKeyForTimezone(
    timezone,
    opts.at instanceof Date ? opts.at : new Date()
  );

  const activeBranches = await branchesRepo.countActiveBranchesForOrganization(db, organizationId);
  const limit = getNumericLimit(plan, "external_emails.monthly", {
    activeBranchCount: activeBranches,
  });

  const current = await organizationUsageRepo.getOrCreateUsageMonth(db, organizationId, usageMonth);
  const used = current.external_emails_count || 0;

  if (typeof limit === "number" && used + count > limit) {
    await recordQuotaBlock(db, {
      organizationId,
      actorType: opts.actorType,
      actorId: opts.actorId,
      action: "package_quota_external_email_blocked",
      packageCode: plan.packageCode,
      quotaKey: "external_emails.monthly",
      used,
      limit,
      message: EXTERNAL_EMAIL_QUOTA_ERROR,
      metadata: { category, count },
    });
    throw Object.assign(new Error(EXTERNAL_EMAIL_QUOTA_ERROR), {
      code: "PACKAGE_EXTERNAL_EMAIL_LIMIT",
      packageCode: plan.packageCode,
      used,
      limit,
    });
  }

  const row = await organizationUsageRepo.incrementExternalEmails(
    db,
    organizationId,
    usageMonth,
    count
  );
  return {
    allowed: true,
    exempt: false,
    category,
    recorded: true,
    used: row.external_emails_count,
    limit,
    usageMonth,
    packageCode: plan.packageCode,
  };
}

/**
 * Consume one scheduled-report slot for the org month (hard limit when numeric).
 */
async function assertCanCreateScheduledReport(db, opts) {
  const organizationId = Number(opts.organizationId);
  const plan = await getOrganisationPlan(db, organizationId);
  if (!plan) {
    const err = new Error("Organisation not found");
    err.code = "ORG_NOT_FOUND";
    throw err;
  }

  const org = await db.query(`SELECT timezone FROM public.church_organizations WHERE id = $1`, [
    organizationId,
  ]);
  const timezone = org.rows[0]?.timezone || "UTC";
  const usageMonth = organizationUsageRepo.usageMonthKeyForTimezone(
    timezone,
    opts.at instanceof Date ? opts.at : new Date()
  );

  const limit = getNumericLimit(plan, "reports.scheduled_monthly");
  const current = await organizationUsageRepo.getOrCreateUsageMonth(db, organizationId, usageMonth);
  const used = current.scheduled_reports_count || 0;

  if (typeof limit === "number" && used >= limit) {
    await recordQuotaBlock(db, {
      organizationId,
      actorType: opts.actorType,
      actorId: opts.actorId,
      action: "package_quota_scheduled_report_blocked",
      packageCode: plan.packageCode,
      quotaKey: "reports.scheduled_monthly",
      used,
      limit,
      message: SCHEDULED_REPORT_QUOTA_ERROR,
    });
    throw Object.assign(new Error(SCHEDULED_REPORT_QUOTA_ERROR), {
      code: "PACKAGE_SCHEDULED_REPORT_LIMIT",
      packageCode: plan.packageCode,
      used,
      limit,
    });
  }

  if (opts.consume) {
    const row = await organizationUsageRepo.incrementScheduledReports(
      db,
      organizationId,
      usageMonth,
      1
    );
    return {
      allowed: true,
      used: row.scheduled_reports_count,
      limit,
      usageMonth,
      packageCode: plan.packageCode,
    };
  }

  return { allowed: true, used, limit, usageMonth, packageCode: plan.packageCode };
}

module.exports = {
  EXEMPT_EMAIL_CATEGORIES,
  DEFAULT_WARNING_THRESHOLDS,
  STORAGE_QUOTA_ERROR,
  EXTERNAL_EMAIL_QUOTA_ERROR,
  SCHEDULED_REPORT_QUOTA_ERROR,
  getWarningThresholds,
  isExemptEmailCategory,
  formatBytes,
  getOrganisationUsageSnapshot,
  assertCanConsumeStorage,
  recordExternalEmailSend,
  assertCanCreateScheduledReport,
  usageMonthKeyForTimezone: organizationUsageRepo.usageMonthKeyForTimezone,
};
