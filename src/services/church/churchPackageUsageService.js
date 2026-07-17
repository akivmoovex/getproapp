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

const { formatHardLimitFailureMessage } = require("../../church/blessBoardQuotaWarnings");

const STORAGE_QUOTA_ERROR = formatHardLimitFailureMessage("storage", { packageLabel: "Foundation" });
const EXTERNAL_EMAIL_QUOTA_ERROR = formatHardLimitFailureMessage("externalEmails", {
  packageLabel: "Foundation",
});
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
  "growth_trial_lifecycle",
  "foundation_dormancy_lifecycle",
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

/**
 * Human-readable package ceiling rows for the admin package & usage panel.
 * Derived only from central getNumericLimit — not for EJS-side math.
 * @param {object} plan - getOrganisationPlan result
 * @param {number} activeBranchCount
 */
function buildPackageLimitRows(plan, activeBranchCount) {
  const branchLimit = getNumericLimit(plan, "branches.max_active");
  const memberLimit = getNumericLimit(plan, "members.max_active");
  const adminLimit = getNumericLimit(plan, "admins.max");
  const storageLimit = getNumericLimit(plan, "storage.bytes", { activeBranchCount });
  const emailLimit = getNumericLimit(plan, "external_emails.monthly", { activeBranchCount });
  const reportLimit = getNumericLimit(plan, "reports.scheduled_monthly");

  function countCeiling(limit, { fairUse, unlimited }) {
    if (limit === FAIR_USE) return fairUse;
    if (limit == null) return unlimited;
    if (typeof limit === "number") return String(limit);
    return "—";
  }

  return [
    {
      key: "branches",
      label: "Active branches",
      value: countCeiling(branchLimit, {
        fairUse: "Fair use (unlimited)",
        unlimited: "Counted (unlimited)",
      }),
    },
    {
      key: "members",
      label: "Active members",
      value: countCeiling(memberLimit, {
        fairUse: "Unlimited (fair use)",
        unlimited: "Unlimited",
      }),
    },
    {
      key: "admins",
      label: "Administrators / leadership",
      value: countCeiling(adminLimit, {
        fairUse: "Unlimited (fair use)",
        unlimited: "Unlimited",
      }),
    },
    {
      key: "storage",
      label: "Storage",
      value: typeof storageLimit === "number" ? formatBytes(storageLimit) : "—",
    },
    {
      key: "externalEmails",
      label: "External emails / month",
      value: typeof emailLimit === "number" ? String(emailLimit) : "—",
    },
    {
      key: "scheduledReports",
      label: "Scheduled reports / month",
      value:
        reportLimit === 0
          ? "Not included"
          : typeof reportLimit === "number"
            ? String(reportLimit)
            : "—",
    },
  ];
}

/**
 * Billing readiness safe for branch/HQ admins (no invoices, amounts, or dunning internals).
 * @param {import("pg").Pool | import("pg").PoolClient} db
 * @param {number} organizationId
 */
async function loadAdminSafeBillingReadiness(db, organizationId, opts = {}) {
  try {
    const row =
      opts.organization ||
      (
        await db.query(
          `SELECT billing_cadence, billing_currency, billing_payment_status, billing_collection_state,
                  billing_payment_provider_enabled
           FROM public.church_organizations WHERE id = $1 LIMIT 1`,
          [organizationId]
        )
      ).rows[0];
    if (!row) return null;

    const cadence = String(row.billing_cadence || "monthly").toLowerCase();
    const collectionState = String(row.billing_collection_state || "ok").toLowerCase();
    const paymentStatus = String(row.billing_payment_status || "not_applicable").toLowerCase();
    const providerEnabled = row.billing_payment_provider_enabled === true;

    let summary = "Billing readiness: metering is available. Payment collection is not enabled yet.";
    if (providerEnabled) {
      summary = "Billing readiness: a payment provider is enabled for this organisation.";
    } else if (paymentStatus === "awaiting_provider" || paymentStatus === "pending") {
      summary = "Billing readiness: awaiting payment provider setup. No card details are stored here.";
    }

    return {
      cadence,
      currency: String(row.billing_currency || "USD").toUpperCase(),
      paymentStatus,
      collectionState,
      paymentProviderEnabled: providerEnabled,
      summary,
    };
  } catch {
    return null;
  }
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

  const plan =
    opts.plan ||
    (await getOrganisationPlan(db, orgId, {
      at: opts.at,
      organization: opts.organization,
      trialRecord: opts.trialRecord,
      trialState: opts.trialState,
    }));
  if (!plan) return null;

  let org = opts.organization
    ? {
        id: opts.organization.id,
        timezone: opts.organization.timezone,
        storage_bytes_used: opts.organization.storage_bytes_used,
        storage_bytes_reconciled_at: opts.organization.storage_bytes_reconciled_at,
      }
    : (
        await db.query(
          `SELECT id, timezone, storage_bytes_used, storage_bytes_reconciled_at
     FROM public.church_organizations WHERE id = $1 LIMIT 1`,
          [orgId]
        )
      ).rows[0];
  if (!org) return null;

  const timezone = org.timezone || "UTC";
  const at = opts.at instanceof Date ? opts.at : new Date();
  const usageMonth = organizationUsageRepo.usageMonthKeyForTimezone(timezone, at);

  const needsStorageReconcile = opts.reconcileStorage === true;
  if (needsStorageReconcile) {
    await organizationUsageRepo.reconcileStorageBytesUsed(db, orgId);
    const refreshed = await db.query(
      `SELECT storage_bytes_used, storage_bytes_reconciled_at, timezone
       FROM public.church_organizations WHERE id = $1`,
      [orgId]
    );
    org = { ...org, ...(refreshed.rows[0] || {}) };
  }

  const storageBytes = Number(org.storage_bytes_used) || 0;

  const [activeBranches, totalBranches, activeMembers, totalMembers, privileged, monthRow] =
    await Promise.all([
      branchesRepo.countActiveBranchesForOrganization(db, orgId),
      branchesRepo.countBranchesForOrganization(db, orgId),
      countActiveMembersForOrganization(db, orgId),
      db
        .query(
          `SELECT COUNT(*)::int AS c FROM public.church_members WHERE organization_id = $1`,
          [orgId]
        )
        .then((r) => r.rows[0]?.c ?? 0),
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

  const {
    buildQuotaWarningsFromMeters,
  } = require("../../church/blessBoardQuotaWarnings");
  const quotaWarnings = buildQuotaWarningsFromMeters(meters, {
    packageCode: plan.packageCode,
    packageLabel: plan.packageLabel,
  });

  // Legacy shape kept for older callers; prefer quotaWarnings for UI.
  const warnings = quotaWarnings
    .filter((w) => w.band < 100)
    .map((w) => ({
      key: w.key,
      message: [w.message, w.guidance].filter(Boolean).join(" "),
      warningBand: w.band,
    }));
  const blocked = quotaWarnings
    .filter((w) => w.band >= 100)
    .map((w) => ({
      key: w.key,
      message: [w.message, w.existingDataNote, w.guidance].filter(Boolean).join(" "),
      warningBand: w.band,
    }));

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

  const billingReadiness = await loadAdminSafeBillingReadiness(db, orgId, {
    organization: opts.organization,
  });

  let trialStatus = opts.trialStatus || null;
  if (!trialStatus) {
    try {
      const churchGrowthTrialService = require("./churchGrowthTrialService");
      const trialState =
        opts.trialState ||
        (await churchGrowthTrialService.resolveGrowthTrialForEntitlement(db, orgId, {
          at,
          trialRecord: opts.trialRecord,
        }));
      trialStatus = trialState.trialStatus;
    } catch {
      trialStatus = null;
    }
  }

  return {
    organizationId: orgId,
    timezone,
    usageMonth,
    packageCode: plan.packageCode,
    packageLabel: plan.packageLabel,
    planStatus: plan.planStatus || "active",
    storedPlanCode: plan.storedPlanCode,
    entitlementSource: plan.entitlementSource,
    usedFallback: Boolean(plan.usedFallback),
    fallbackReason: plan.fallbackReason || null,
    trial: plan.trial || null,
    trialStatus,
    activeBranches,
    totalBranches,
    activeMembers,
    totalMembers,
    privilegedAccounts: privileged.total,
    privilegedBreakdown: privileged,
    storageBytesUsed: storageBytes,
    externalEmailsThisMonth: monthRow.external_emails_count || 0,
    scheduledReportsThisMonth: monthRow.scheduled_reports_count || 0,
    meters,
    quotaWarnings,
    warnings,
    blocked,
    availableUpgrade,
    packageLimitRows: buildPackageLimitRows(plan, activeBranches),
    billingReadiness,
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

/**
 * Account-page loader: never throws; returns null when usage cannot be shown.
 * @param {import("pg").Pool | import("pg").PoolClient} db
 * @param {number} organizationId
 * @param {{ reconcileStorage?: boolean, at?: Date }} [opts]
 */
async function loadPackageUsageForAccountPage(db, organizationId, opts = {}) {
  try {
    // Prefer exported binding so tests (and future wrappers) can intercept failures.
    return await module.exports.getOrganisationUsageSnapshot(db, organizationId, opts);
  } catch {
    return null;
  }
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
 * Hard limit: attachment storage.
 * When opts.reserve !== false (default), atomically reserves bytes so concurrent uploads
 * cannot both succeed past the limit. Caller must releaseStorageBytes on failed business write.
 */
async function assertCanConsumeStorage(db, opts) {
  const organizationId = Number(opts.organizationId);
  const additionalBytes = Math.max(0, Math.floor(Number(opts.additionalBytes) || 0));
  const plan =
    opts.plan ||
    (await getOrganisationPlan(db, organizationId, {
      organization: opts.organization,
    }));
  if (!plan) {
    const err = new Error("Organisation not found");
    err.code = "ORG_NOT_FOUND";
    throw err;
  }

  const activeBranches =
    opts.activeBranchCount != null
      ? Number(opts.activeBranchCount)
      : await branchesRepo.countActiveBranchesForOrganization(db, organizationId);
  const limit = getNumericLimit(plan, "storage.bytes", { activeBranchCount: activeBranches });
  if (limit === FAIR_USE || limit == null || typeof limit !== "number") {
    if (opts.reserve === false) {
      return { allowed: true, limit, used: null, packageCode: plan.packageCode, reserved: 0 };
    }
    if (additionalBytes > 0) {
      const reservation = await organizationUsageRepo.tryReserveStorageBytes(
        db,
        organizationId,
        additionalBytes,
        null
      );
      return {
        allowed: true,
        limit,
        used: reservation.used,
        packageCode: plan.packageCode,
        reserved: reservation.reserved,
      };
    }
    return { allowed: true, limit, used: null, packageCode: plan.packageCode, reserved: 0 };
  }

  if (opts.reserve === false) {
    const org = await db.query(
      `SELECT storage_bytes_used FROM public.church_organizations WHERE id = $1`,
      [organizationId]
    );
    const used = Number(org.rows[0]?.storage_bytes_used) || 0;
    if (used + additionalBytes > limit) {
      const message = formatHardLimitFailureMessage("storage", {
        packageLabel: plan.packageLabel,
        used,
        limit,
        display: `${formatBytes(used)} / ${formatBytes(limit)}`,
      });
      throw Object.assign(new Error(message), {
        code: "PACKAGE_STORAGE_LIMIT",
        packageCode: plan.packageCode,
        used,
        limit,
      });
    }
    return { allowed: true, used, limit, packageCode: plan.packageCode, reserved: 0 };
  }

  const reservation = await organizationUsageRepo.tryReserveStorageBytes(
    db,
    organizationId,
    additionalBytes,
    limit
  );
  if (reservation.reserved < additionalBytes) {
    const message = formatHardLimitFailureMessage("storage", {
      packageLabel: plan.packageLabel,
      used: reservation.used,
      limit,
      display: `${formatBytes(reservation.used)} / ${formatBytes(limit)}`,
    });
    await recordQuotaBlock(db, {
      organizationId,
      actorType: opts.actorType,
      actorId: opts.actorId,
      action: "package_quota_storage_blocked",
      packageCode: plan.packageCode,
      quotaKey: "storage.bytes",
      used: reservation.used,
      limit,
      message,
      metadata: { additional_bytes: additionalBytes },
    });
    throw Object.assign(new Error(message), {
      code: "PACKAGE_STORAGE_LIMIT",
      packageCode: plan.packageCode,
      used: reservation.used,
      limit,
    });
  }
  return {
    allowed: true,
    used: reservation.used,
    limit,
    packageCode: plan.packageCode,
    reserved: reservation.reserved,
  };
}

/**
 * Release previously reserved storage bytes (failed upload / insert).
 */
async function releaseStorageBytes(db, opts) {
  const organizationId = Number(opts.organizationId);
  const bytes = Math.max(0, Math.floor(Number(opts.bytes) || 0));
  if (!bytes) return null;
  return organizationUsageRepo.adjustStorageBytesUsed(db, organizationId, -bytes);
}

/**
 * Record + optionally enforce external email send.
 * Exempt categories never increment meters and never block.
 * Accepts optional pre-resolved `plan` / `organization` to avoid per-recipient re-resolve.
 * All-or-nothing for the requested count (throws PACKAGE_EXTERNAL_EMAIL_LIMIT when full count cannot fit).
 */
async function recordExternalEmailSend(db, opts) {
  const organizationId = Number(opts.organizationId);
  const category = String(opts.category || "general")
    .trim()
    .toLowerCase();
  const count = Math.max(1, Math.floor(Number(opts.count) || 1));
  const plan =
    opts.plan ||
    (await getOrganisationPlan(db, organizationId, {
      organization: opts.organization,
      at: opts.at,
    }));
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
    const orgRow =
      opts.organization ||
      (
        await db.query(
          `SELECT billing_collection_state FROM public.church_organizations WHERE id = $1`,
          [organizationId]
        )
      ).rows[0];
    const messaging = churchBillingStateService.maySendExternalMessaging(orgRow || {});
    if (!messaging.allowed) {
      throw Object.assign(new Error(messaging.message), {
        code: messaging.code || "BILLING_RESTRICTED",
      });
    }
  } catch (err) {
    if (err && err.code === "BILLING_RESTRICTED") throw err;
    /* billing state helper optional if columns missing mid-migration */
  }

  const timezone =
    (opts.organization && opts.organization.timezone) ||
    (
      await db.query(`SELECT timezone FROM public.church_organizations WHERE id = $1`, [organizationId])
    ).rows[0]?.timezone ||
    "UTC";
  const usageMonth = organizationUsageRepo.usageMonthKeyForTimezone(
    timezone,
    opts.at instanceof Date ? opts.at : new Date()
  );

  const activeBranches =
    opts.activeBranchCount != null
      ? Number(opts.activeBranchCount)
      : await branchesRepo.countActiveBranchesForOrganization(db, organizationId);
  const limit = getNumericLimit(plan, "external_emails.monthly", {
    activeBranchCount: activeBranches,
  });

  const reservation = await organizationUsageRepo.tryReserveExternalEmailsUpTo(
    db,
    organizationId,
    usageMonth,
    count,
    typeof limit === "number" ? limit : null
  );

  if (reservation.reserved < count) {
    const used = Math.max(0, (reservation.used || 0) - reservation.reserved);
    const message = formatHardLimitFailureMessage("externalEmails", {
      packageLabel: plan.packageLabel,
      used,
      limit,
    });
    if (reservation.reserved > 0) {
      await organizationUsageRepo.adjustExternalEmails(
        db,
        organizationId,
        usageMonth,
        -reservation.reserved
      );
    }
    await recordQuotaBlock(db, {
      organizationId,
      actorType: opts.actorType,
      actorId: opts.actorId,
      action: "package_quota_external_email_blocked",
      packageCode: plan.packageCode,
      quotaKey: "external_emails.monthly",
      used,
      limit,
      message,
      metadata: { category, count },
    });
    throw Object.assign(new Error(message), {
      code: "PACKAGE_EXTERNAL_EMAIL_LIMIT",
      packageCode: plan.packageCode,
      used,
      limit,
    });
  }

  return {
    allowed: true,
    exempt: false,
    category,
    recorded: true,
    used: reservation.used,
    limit,
    usageMonth,
    packageCode: plan.packageCode,
    reserved: reservation.reserved,
  };
}

/**
 * Reserve up to `count` metered external emails in one atomic operation.
 * Returns how many were reserved (may be less than requested when near the hard limit).
 * Exempt categories return reserved=count without metering.
 */
async function reserveExternalEmailSends(db, opts) {
  const organizationId = Number(opts.organizationId);
  const category = String(opts.category || "general")
    .trim()
    .toLowerCase();
  const count = Math.max(0, Math.floor(Number(opts.count) || 0));
  const plan =
    opts.plan ||
    (await getOrganisationPlan(db, organizationId, {
      organization: opts.organization,
      at: opts.at,
    }));
  if (!plan) {
    const err = new Error("Organisation not found");
    err.code = "ORG_NOT_FOUND";
    throw err;
  }

  if (count === 0) {
    return {
      allowed: true,
      reserved: 0,
      category,
      packageCode: plan.packageCode,
      usageMonth: null,
      limit: null,
      used: null,
    };
  }

  if (isExemptEmailCategory(category)) {
    return {
      allowed: true,
      exempt: true,
      reserved: count,
      category,
      recorded: false,
      packageCode: plan.packageCode,
      usageMonth: null,
      limit: null,
      used: null,
    };
  }

  try {
    const churchBillingStateService = require("./churchBillingStateService");
    const orgRow =
      opts.organization ||
      (
        await db.query(
          `SELECT billing_collection_state, timezone FROM public.church_organizations WHERE id = $1`,
          [organizationId]
        )
      ).rows[0];
    const messaging = churchBillingStateService.maySendExternalMessaging(orgRow || {});
    if (!messaging.allowed) {
      throw Object.assign(new Error(messaging.message), {
        code: messaging.code || "BILLING_RESTRICTED",
      });
    }
  } catch (err) {
    if (err && err.code === "BILLING_RESTRICTED") throw err;
  }

  const timezone =
    (opts.organization && opts.organization.timezone) ||
    (
      await db.query(`SELECT timezone FROM public.church_organizations WHERE id = $1`, [organizationId])
    ).rows[0]?.timezone ||
    "UTC";
  const usageMonth = organizationUsageRepo.usageMonthKeyForTimezone(
    timezone,
    opts.at instanceof Date ? opts.at : new Date()
  );

  const activeBranches =
    opts.activeBranchCount != null
      ? Number(opts.activeBranchCount)
      : await branchesRepo.countActiveBranchesForOrganization(db, organizationId);
  const limit = getNumericLimit(plan, "external_emails.monthly", {
    activeBranchCount: activeBranches,
  });

  const reservation = await organizationUsageRepo.tryReserveExternalEmailsUpTo(
    db,
    organizationId,
    usageMonth,
    count,
    typeof limit === "number" ? limit : null
  );

  if (reservation.reserved === 0 && typeof limit === "number" && count > 0) {
    const message = formatHardLimitFailureMessage("externalEmails", {
      packageLabel: plan.packageLabel,
      used: reservation.used,
      limit,
    });
    await recordQuotaBlock(db, {
      organizationId,
      actorType: opts.actorType,
      actorId: opts.actorId,
      action: "package_quota_external_email_blocked",
      packageCode: plan.packageCode,
      quotaKey: "external_emails.monthly",
      used: reservation.used,
      limit,
      message,
      metadata: { category, count, reserved: 0 },
    });
  }

  return {
    allowed: reservation.reserved > 0 || count === 0,
    exempt: false,
    reserved: reservation.reserved,
    requested: count,
    category,
    recorded: reservation.reserved > 0,
    used: reservation.used,
    limit,
    usageMonth,
    packageCode: plan.packageCode,
  };
}

/**
 * Release previously reserved external email quota (e.g. insert conflict / failed send).
 */
async function releaseExternalEmailSends(db, opts) {
  const organizationId = Number(opts.organizationId);
  const count = Math.max(0, Math.floor(Number(opts.count) || 0));
  if (!count || !opts.usageMonth) return null;
  if (opts.exempt) return null;
  return organizationUsageRepo.adjustExternalEmails(
    db,
    organizationId,
    opts.usageMonth,
    -count
  );
}

/**
 * Consume one scheduled-report slot for the org month (hard limit when numeric).
 * When consume:true, uses an atomic reservation so concurrent jobs cannot exceed the limit.
 */
async function assertCanCreateScheduledReport(db, opts) {
  const organizationId = Number(opts.organizationId);
  const plan =
    opts.plan ||
    (await getOrganisationPlan(db, organizationId, {
      organization: opts.organization,
      at: opts.at,
    }));
  if (!plan) {
    const err = new Error("Organisation not found");
    err.code = "ORG_NOT_FOUND";
    throw err;
  }

  const timezone =
    (opts.organization && opts.organization.timezone) ||
    (
      await db.query(`SELECT timezone FROM public.church_organizations WHERE id = $1`, [organizationId])
    ).rows[0]?.timezone ||
    "UTC";
  const usageMonth = organizationUsageRepo.usageMonthKeyForTimezone(
    timezone,
    opts.at instanceof Date ? opts.at : new Date()
  );

  const limit = getNumericLimit(plan, "reports.scheduled_monthly");
  const count = Math.max(1, Math.floor(Number(opts.count) || 1));

  if (!opts.consume) {
    const current = await organizationUsageRepo.getOrCreateUsageMonth(db, organizationId, usageMonth);
    const used = current.scheduled_reports_count || 0;
    if (typeof limit === "number" && used + count > limit) {
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
    return { allowed: true, used, limit, usageMonth, packageCode: plan.packageCode, reserved: 0 };
  }

  const reservation = await organizationUsageRepo.tryReserveScheduledReportsUpTo(
    db,
    organizationId,
    usageMonth,
    count,
    typeof limit === "number" ? limit : null
  );

  if (reservation.reserved < count) {
    const used = Math.max(0, (reservation.used || 0) - reservation.reserved);
    if (reservation.reserved > 0) {
      await organizationUsageRepo.adjustScheduledReports(
        db,
        organizationId,
        usageMonth,
        -reservation.reserved
      );
    }
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

  return {
    allowed: true,
    used: reservation.used,
    limit,
    usageMonth,
    packageCode: plan.packageCode,
    reserved: reservation.reserved,
  };
}

/**
 * Release previously reserved scheduled-report slots.
 */
async function releaseScheduledReportSlots(db, opts) {
  const organizationId = Number(opts.organizationId);
  const count = Math.max(0, Math.floor(Number(opts.count) || 0));
  if (!count || !opts.usageMonth) return null;
  return organizationUsageRepo.adjustScheduledReports(
    db,
    organizationId,
    opts.usageMonth,
    -count
  );
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
  buildPackageLimitRows,
  loadAdminSafeBillingReadiness,
  getOrganisationUsageSnapshot,
  loadPackageUsageForAccountPage,
  assertCanConsumeStorage,
  releaseStorageBytes,
  recordExternalEmailSend,
  reserveExternalEmailSends,
  releaseExternalEmailSends,
  assertCanCreateScheduledReport,
  releaseScheduledReportSlots,
  usageMonthKeyForTimezone: organizationUsageRepo.usageMonthKeyForTimezone,
};
