"use strict";

/**
 * Central BlessBoard entitlement service (Phase 1 — resolve only, do not enforce).
 *
 * Prefer these helpers over scattering package_code checks in routes or EJS.
 */

const organizationsRepo = require("../../db/pg/church/organizationsRepo");
const {
  resolvePackageFromPlanCode,
  readEntitlementPath,
  isUnlimitedLimit,
  isFairUseLimit,
  UNLIMITED,
  FAIR_USE,
  DEFAULT_PACKAGE_CODE,
} = require("../../church/blessBoardPackageCatalogue");

/**
 * Load organisation package resolution (scoped strictly by organization id).
 * @param {import("pg").Pool} pool
 * @param {number} organizationId
 * @returns {Promise<object | null>} null if organisation does not exist
 */
async function getOrganisationPlan(pool, organizationId) {
  const id = Number(organizationId);
  if (!Number.isFinite(id) || id <= 0) return null;

  const organization = await organizationsRepo.findOrganizationById(pool, id);
  if (!organization) return null;

  // Isolation: never accept a caller-supplied plan_code — only the row for this id.
  const resolved = resolvePackageFromPlanCode(organization.plan_code);

  return {
    organizationId: organization.id,
    organizationName: organization.name,
    organizationSlug: organization.slug,
    organizationStatus: organization.status,
    platformTenantId: organization.platform_tenant_id,
    storedPlanCode: organization.plan_code == null ? null : String(organization.plan_code),
    planStatus: organization.plan_status || "active",
    planStartedAt: organization.plan_started_at || null,
    planNotes: organization.plan_notes || null,
    packageCode: resolved.packageCode,
    packageLabel: resolved.packageDefinition.label,
    entitlements: resolved.packageDefinition.entitlements,
    entitlementSource: resolved.entitlementSource,
    usedFallback: resolved.usedFallback,
    fallbackReason: resolved.fallbackReason,
  };
}

/**
 * @param {object} planOrEntitlements - result of getOrganisationPlan, or entitlements object, or package snapshot
 * @param {string} key
 */
function getEntitlement(planOrEntitlements, key) {
  if (!planOrEntitlements) return undefined;
  const entitlements =
    planOrEntitlements.entitlements ||
    (planOrEntitlements.packageDefinition && planOrEntitlements.packageDefinition.entitlements) ||
    planOrEntitlements;
  return readEntitlementPath(entitlements, key);
}

/**
 * Boolean entitlement check. Non-boolean truthy string levels ("basic", "advanced", "limited") count as entitled.
 * false / 0 / null / undefined → not entitled.
 * @param {object} planOrEntitlements
 * @param {string} key
 */
function hasEntitlement(planOrEntitlements, key) {
  const value = getEntitlement(planOrEntitlements, key);
  if (value === false || value == null) return false;
  if (value === true) return true;
  if (typeof value === "number") return value !== 0 && !Number.isNaN(value);
  if (typeof value === "string") {
    const v = value.trim().toLowerCase();
    if (!v || v === "false" || v === "off" || v === "none") return false;
    return true;
  }
  return Boolean(value);
}

/**
 * Numeric limit helper. Returns:
 * - number for hard caps
 * - null for unlimited
 * - FAIR_USE string for fair-use (not a hard number)
 * - undefined if path missing
 *
 * For composed Growth storage/email limits, pass activeBranchCount to resolve effective bytes/emails.
 *
 * @param {object} planOrEntitlements
 * @param {string} key
 * @param {{ activeBranchCount?: number }} [opts]
 */
function getNumericLimit(planOrEntitlements, key, opts = {}) {
  const activeBranches = Number(opts.activeBranchCount);
  const branchCount = Number.isFinite(activeBranches) && activeBranches > 0 ? activeBranches : 0;

  if (key === "storage.bytes" || key === "storage.effective_bytes") {
    const bytes = getEntitlement(planOrEntitlements, "storage.bytes");
    if (bytes != null && typeof bytes === "number") return bytes;
    const base = getEntitlement(planOrEntitlements, "storage.bytes_base");
    const per = getEntitlement(planOrEntitlements, "storage.bytes_per_active_branch");
    if (typeof base === "number" && typeof per === "number") {
      return base + per * branchCount;
    }
    if (typeof base === "number") return base;
    return undefined;
  }

  if (key === "external_emails.monthly" || key === "external_emails.effective_monthly") {
    const monthly = getEntitlement(planOrEntitlements, "external_emails.monthly");
    if (monthly != null && typeof monthly === "number") return monthly;
    const base = getEntitlement(planOrEntitlements, "external_emails.monthly_base");
    const per = getEntitlement(planOrEntitlements, "external_emails.monthly_per_active_branch");
    if (typeof base === "number" && typeof per === "number") {
      return base + per * branchCount;
    }
    if (typeof base === "number") return base;
    return undefined;
  }

  const value = getEntitlement(planOrEntitlements, key);
  if (value == null) return undefined;
  if (isFairUseLimit(value)) return FAIR_USE;
  if (isUnlimitedLimit(value)) return null;
  if (typeof value === "number" && Number.isFinite(value)) return value;
  return undefined;
}

/**
 * Quota inspection — never blocks by itself. Enforcement lives in seat / usage services.
 *
 * Warning bands: optional thresholds (default 80%, 90%, 100%).
 * Status: ok | near | warn_90 | at_limit | exceeded | fair_use | unlimited | unknown
 * (`near` = >=80% and <90%; `warn_90` = >=90% and <100%).
 *
 * @param {object} planOrEntitlements
 * @param {string} key
 * @param {number} used
 * @param {{ activeBranchCount?: number, thresholds?: number[] }} [opts]
 */
function checkQuota(planOrEntitlements, key, used, opts = {}) {
  const usedN = Number(used);
  const usage = Number.isFinite(usedN) && usedN >= 0 ? usedN : 0;
  const limit = getNumericLimit(planOrEntitlements, key, opts);

  if (limit === FAIR_USE) {
    return {
      key,
      used: usage,
      limit: FAIR_USE,
      remaining: null,
      status: "fair_use",
      warningBand: null,
      ok: true,
      enforced: false,
    };
  }

  // getNumericLimit maps UNLIMITED → null; missing path → undefined
  if (limit === null) {
    return {
      key,
      used: usage,
      limit: null,
      remaining: null,
      status: "unlimited",
      warningBand: null,
      ok: true,
      enforced: false,
    };
  }

  if (typeof limit !== "number") {
    return {
      key,
      used: usage,
      limit: undefined,
      remaining: undefined,
      status: "unknown",
      warningBand: null,
      ok: true,
      enforced: false,
    };
  }

  const remaining = Math.max(0, limit - usage);
  const thresholds =
    Array.isArray(opts.thresholds) && opts.thresholds.length
      ? opts.thresholds
      : [0.8, 0.9, 1.0];
  const ratio = limit > 0 ? usage / limit : usage > 0 ? Number.POSITIVE_INFINITY : 0;

  let status = "ok";
  let warningBand = null;
  if (usage > limit) {
    status = "exceeded";
    warningBand = 100;
  } else if (usage === limit || ratio >= 1) {
    status = "at_limit";
    warningBand = 100;
  } else {
    const sorted = [...thresholds]
      .filter((t) => Number.isFinite(t) && t > 0 && t < 1)
      .sort((a, b) => b - a);
    const hit = sorted.find((t) => ratio >= t);
    if (hit != null) {
      warningBand = Math.round(hit * 100);
      status = warningBand >= 90 ? "warn_90" : "near";
    }
  }

  return {
    key,
    used: usage,
    limit,
    remaining,
    status,
    warningBand,
    ok: usage <= limit,
    enforced: false,
  };
}

/**
 * Read-only diagnostic payload for platform admin UI.
 * @param {import("pg").Pool} pool
 * @param {number} organizationId
 */
async function getOrganisationPackageDiagnostic(pool, organizationId) {
  const plan = await getOrganisationPlan(pool, organizationId);
  if (!plan) return null;

  let usage = null;
  let billingReadiness = null;
  try {
    const churchPackageUsageService = require("./churchPackageUsageService");
    usage = await churchPackageUsageService.getOrganisationUsageSnapshot(pool, organizationId, {
      reconcileStorage: true,
    });
  } catch {
    usage = null;
  }

  try {
    const orgBilling = await pool.query(
      `SELECT billing_cadence, billing_currency, billing_payment_status, billing_collection_state,
              billing_dunning_enabled, billing_payment_provider_enabled, billing_dunning_day
       FROM public.church_organizations WHERE id = $1`,
      [organizationId]
    );
    const row = orgBilling.rows[0] || {};
    billingReadiness = {
      cadence: row.billing_cadence || "monthly",
      currency: row.billing_currency || "USD",
      paymentStatus: row.billing_payment_status || "not_applicable",
      collectionState: row.billing_collection_state || "ok",
      dunningEnabled: row.billing_dunning_enabled === true,
      paymentProviderEnabled: row.billing_payment_provider_enabled === true,
      dunningDay: row.billing_dunning_day || 0,
      note: "Draft invoices only. Card details are never stored. Dunning automation stays off until a payment provider is enabled.",
    };
  } catch {
    billingReadiness = {
      note: "Billing columns not available yet.",
    };
  }

  return {
    organization: {
      id: plan.organizationId,
      name: plan.organizationName,
      slug: plan.organizationSlug,
      status: plan.organizationStatus,
      platform_tenant_id: plan.platformTenantId,
    },
    currentPackage: {
      code: plan.packageCode,
      label: plan.packageLabel,
    },
    storedPlanCode: plan.storedPlanCode,
    entitlementSource: plan.entitlementSource,
    fallback: {
      used: plan.usedFallback,
      reason: plan.fallbackReason,
    },
    planStatus: plan.planStatus,
    defaultPackageCode: DEFAULT_PACKAGE_CODE,
    sampleEntitlements: {
      "branches.max_active": getNumericLimit(plan, "branches.max_active"),
      "members.max_active": getNumericLimit(plan, "members.max_active"),
      "admins.max": getNumericLimit(plan, "admins.max"),
      "storage.bytes": getNumericLimit(plan, "storage.bytes", {
        activeBranchCount: usage ? usage.activeBranches : 1,
      }),
      "external_emails.monthly": getNumericLimit(plan, "external_emails.monthly", {
        activeBranchCount: usage ? usage.activeBranches : 1,
      }),
      "reports.scheduled_monthly": getNumericLimit(plan, "reports.scheduled_monthly"),
      "attendance.qr": getEntitlement(plan, "attendance.qr"),
      "attendance.offline": getEntitlement(plan, "attendance.offline"),
      "broadcasts.scheduled": getEntitlement(plan, "broadcasts.scheduled"),
      "domains.custom": getEntitlement(plan, "domains.custom"),
    },
    usage,
    billingReadiness,
  };
}

/**
 * Assign package via existing church_organizations.plan_code + audit log.
 * Does not enforce quotas.
 *
 * @param {import("pg").Pool} pool
 * @param {number} organizationId
 * @param {{ package_code: string, plan_status?: string, plan_notes?: string | null }} fields
 * @param {number | null} platformAdminId
 */
const ASSIGNABLE_PLAN_CODES = new Set(["foundation", "growth", "free", "standard", "pro"]);

async function assignOrganisationPackage(pool, organizationId, fields, platformAdminId) {
  const packageCode = String(fields.package_code || "")
    .trim()
    .toLowerCase();
  if (!ASSIGNABLE_PLAN_CODES.has(packageCode)) {
    const err = new Error(`Invalid package code: ${packageCode || "(empty)"}`);
    err.code = "INVALID_PACKAGE";
    throw err;
  }

  const before = await getOrganisationPlan(pool, organizationId);
  const updated = await organizationsRepo.updateOrganizationPlan(
    pool,
    organizationId,
    {
      plan_code: packageCode,
      plan_status: fields.plan_status,
      plan_notes: fields.plan_notes,
    },
    platformAdminId
  );

  try {
    const churchBillingRepo = require("../../db/pg/church/churchBillingRepo");
    const after = resolvePackageFromPlanCode(packageCode);
    await churchBillingRepo.insertPackageHistory(pool, {
      organization_id: organizationId,
      previous_plan_code: before ? before.storedPlanCode : null,
      new_plan_code: packageCode,
      previous_package_code: before ? before.packageCode : null,
      new_package_code: after.packageCode,
      changed_by_platform_admin_id: platformAdminId || null,
      change_reason: fields.change_reason || fields.plan_notes || null,
    });
  } catch {
    /* package history is additive */
  }

  return {
    organization: updated,
    package: await getOrganisationPlan(pool, organizationId),
  };
}

module.exports = {
  getOrganisationPlan,
  getEntitlement,
  hasEntitlement,
  getNumericLimit,
  checkQuota,
  getOrganisationPackageDiagnostic,
  assignOrganisationPackage,
  UNLIMITED,
  FAIR_USE,
};
