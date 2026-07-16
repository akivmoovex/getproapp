"use strict";

/**
 * Branch activation policy — Foundation / Growth active-branch enforcement.
 * Sets Growth billing start/end windows; does not collect payments.
 */

const organizationsRepo = require("../../db/pg/church/organizationsRepo");
const branchesRepo = require("../../db/pg/church/branchesRepo");
const branchAdminsRepo = require("../../db/pg/church/branchAdminsRepo");
const {
  resolvePackageFromPlanCode,
  getPackageDefinition,
  readEntitlementPath,
} = require("../../church/blessBoardPackageCatalogue");
const {
  resolveBranchLifecycle,
  operationalStatusForLifecycle,
  normalizeLifecyclePhase,
} = require("../../church/branchLifecycle");
const { getNumericLimit } = require("./churchEntitlementService");

function foundationSecondActiveBranchError(limit) {
  // Preserve exact Foundation (1) wording used by activation UX and tests.
  if (limit === 1) {
    return "Foundation includes one active branch. Deactivate the existing branch or upgrade to Growth.";
  }
  const n = Number(limit);
  const noun = n === 1 ? "branch" : "branches";
  return `Foundation includes ${n} active ${noun}. Deactivate the existing ${noun} or upgrade to Growth.`;
}

const FOUNDATION_SECOND_ACTIVE_ERROR = foundationSecondActiveBranchError(
  readEntitlementPath(getPackageDefinition("foundation").entitlements, "branches.max_active")
);

/**
 * @param {import("pg").Pool | import("pg").PoolClient} db
 * @param {number} organizationId
 * @param {{ excludeBranchId?: number | null }} [opts]
 */
async function countActiveBranchesForOrganization(db, organizationId, opts = {}) {
  return branchesRepo.countActiveBranchesForOrganization(db, organizationId, opts);
}

/**
 * Whether the package allows another active branch (not counting excludeBranchId).
 * @param {object} organization
 * @param {number} activeCountExcludingTarget
 */
function canActivateAnotherActiveBranch(organization, activeCountExcludingTarget) {
  const resolved = resolvePackageFromPlanCode(organization && organization.plan_code);
  const plan = { entitlements: resolved.packageDefinition.entitlements };
  const limit = getNumericLimit(plan, "branches.max_active");

  if (limit == null) {
    // Unlimited (Growth)
    return {
      allowed: true,
      packageCode: resolved.packageCode,
      limit: null,
      activeCount: activeCountExcludingTarget,
    };
  }

  if (typeof limit === "number" && activeCountExcludingTarget >= limit) {
    return {
      allowed: false,
      packageCode: resolved.packageCode,
      limit,
      activeCount: activeCountExcludingTarget,
      error:
        resolved.packageCode === "foundation" || resolved.packageCode === "free"
          ? FOUNDATION_SECOND_ACTIVE_ERROR
          : FOUNDATION_SECOND_ACTIVE_ERROR,
    };
  }

  return {
    allowed: true,
    packageCode: resolved.packageCode,
    limit,
    activeCount: activeCountExcludingTarget,
  };
}

/**
 * Activation readiness checks (name, address, admin, schedule, billing placeholder for Growth).
 * @param {object} branch
 * @param {{ packageCode: string, activeAdminCount: number, billingAcknowledged?: boolean, skipBilling?: boolean }} opts
 */
function validateActivationRequirements(branch, opts) {
  const errors = [];
  const name = String((branch && branch.name) || "").trim();
  if (!name) errors.push("Branch name is required before activation.");

  const address = String(
    (branch && (branch.location_text || branch.city || branch.address)) || ""
  ).trim();
  if (!address) errors.push("Branch address / location is required before activation.");

  const schedule = String((branch && branch.service_times) || "").trim();
  if (!schedule) errors.push("Service schedule is required before activation.");

  const adminCount = Number(opts.activeAdminCount || 0);
  if (!Number.isFinite(adminCount) || adminCount < 1) {
    errors.push("An assigned branch administrator is required before activation.");
  }

  const packageCode = opts.packageCode;
  const isGrowth = packageCode === "growth" || packageCode === "standard" || packageCode === "pro";
  if (isGrowth && !opts.skipBilling) {
    if (!opts.billingAcknowledged && !(branch && branch.billing_ready === true)) {
      errors.push(
        "Confirm future billing readiness for this active branch (Growth package) before activation."
      );
    }
  }

  return {
    ok: errors.length === 0,
    errors,
    error: errors[0] || null,
  };
}

/**
 * Decide initial status/lifecycle when creating a branch row.
 * Foundation with an existing active branch → draft (suspended), not active.
 *
 * @param {import("pg").Pool | import("pg").PoolClient} db
 * @param {object} organization
 * @param {{ preferActive?: boolean }} [opts]
 */
async function resolveCreateBranchLifecycle(db, organization, opts = {}) {
  const preferActive = opts.preferActive !== false;
  const resolved = resolvePackageFromPlanCode(organization.plan_code);

  try {
    const churchBillingStateService = require("./churchBillingStateService");
    const gate = churchBillingStateService.mayCreateNewBranch(organization);
    if (!gate.allowed) {
      return {
        status: "suspended",
        lifecycle_phase: "draft",
        createdAsActive: false,
        packageCode: resolved.packageCode,
        deferReason: gate.message,
        billingRestricted: true,
      };
    }
  } catch {
    /* optional */
  }

  const activeCount = await countActiveBranchesForOrganization(db, organization.id);
  const quota = canActivateAnotherActiveBranch(organization, activeCount);

  if (preferActive && quota.allowed) {
    return {
      status: "active",
      lifecycle_phase: "active",
      createdAsActive: true,
      packageCode: resolved.packageCode,
    };
  }

  // Cannot activate now — create as draft (non-active) so history can exist under Foundation.
  return {
    status: "suspended",
    lifecycle_phase: "draft",
    createdAsActive: false,
    packageCode: resolved.packageCode,
    deferReason: quota.allowed
      ? null
      : quota.error || FOUNDATION_SECOND_ACTIVE_ERROR,
  };
}

/**
 * Full activation (suspended/archived→active) with package + readiness checks.
 * Transaction-safe when `db` is a Pool (opens a client) or an existing client.
 *
 * @param {import("pg").Pool | import("pg").PoolClient} db
 * @param {number} branchId
 * @param {{
 *   reason?: string | null,
 *   platformAdminId?: number | null,
 *   billingAcknowledged?: boolean,
 *   actorType?: string,
 *   skipRequirementChecks?: boolean,
 * }} opts
 */
async function activateBranch(db, branchId, opts = {}) {
  const id = Number(branchId);
  const ownsClient = typeof db.connect === "function";
  const client = ownsClient ? await db.connect() : db;

  try {
    if (ownsClient) await client.query("BEGIN");

    const branch = await branchesRepo.findBranchByIdForPlatform(client, id);
    if (!branch) {
      throw Object.assign(new Error("Branch not found."), { code: "NOT_FOUND" });
    }

    const organization = await organizationsRepo.findOrganizationById(client, branch.organization_id);
    if (!organization) {
      throw Object.assign(new Error("Organization not found."), { code: "NOT_FOUND" });
    }

    // Lock siblings so concurrent activations cannot bypass Foundation cap.
    await client.query(
      `SELECT id FROM public.church_branches WHERE organization_id = $1 FOR UPDATE`,
      [organization.id]
    );

    if (branch.status === "active") {
      if (ownsClient) await client.query("COMMIT");
      return { branch, alreadyActive: true, organization };
    }

    if (branch.status === "archived") {
      throw Object.assign(new Error("Archived branches cannot be reactivated in this release."), {
        code: "ARCHIVED",
      });
    }

    const activeCount = await countActiveBranchesForOrganization(client, organization.id, {
      excludeBranchId: id,
    });
    const quota = canActivateAnotherActiveBranch(organization, activeCount);
    if (!quota.allowed) {
      throw Object.assign(new Error(quota.error || FOUNDATION_SECOND_ACTIVE_ERROR), {
        code: "FOUNDATION_ACTIVE_BRANCH_LIMIT",
        packageCode: quota.packageCode,
      });
    }

    let activeAdminCount = 0;
    if (typeof branchAdminsRepo.countActiveBranchAdminsForBranch === "function") {
      activeAdminCount = await branchAdminsRepo.countActiveBranchAdminsForBranch(client, id);
    } else {
      const r = await client.query(
        `SELECT COUNT(*)::int AS c FROM public.church_branch_admins
         WHERE branch_id = $1 AND status = 'active'`,
        [id]
      );
      activeAdminCount = r.rows[0]?.c ?? 0;
    }

    if (!opts.skipRequirementChecks) {
      const requirements = validateActivationRequirements(branch, {
        packageCode: quota.packageCode,
        activeAdminCount,
        billingAcknowledged: opts.billingAcknowledged === true,
      });
      if (!requirements.ok) {
        throw Object.assign(new Error(requirements.error), {
          code: "ACTIVATION_REQUIREMENTS",
          errors: requirements.errors,
        });
      }
    }

    const billingReady =
      opts.billingAcknowledged === true ||
      branch.billing_ready === true ||
      quota.packageCode === "foundation";

    const updated = await branchesRepo.updateBranchStatus(client, id, "active", {
      reason: opts.reason,
      platformAdminId: opts.platformAdminId || null,
      previousStatus: branch.status,
      organizationId: organization.id,
      lifecyclePhase: "active",
      billingReady: billingReady === true,
      auditAction: "platform_church_branch_activated",
      auditMetadataExtra: {
        package_code: quota.packageCode,
        lifecycle_phase: "active",
        billing_ready: billingReady === true,
        active_branch_count_after: activeCount + 1,
      },
    });

    // Growth: establish billing start date (idempotent if already set). Demo/test/pilot never become billable.
    if (quota.packageCode === "growth") {
      const { isBillableEnvironment } = require("../../church/orgDataEnvironment");
      if (isBillableEnvironment(organization)) {
        const churchBillingRepo = require("../../db/pg/church/churchBillingRepo");
        const { resolveBranchBillingDates } = require("./churchBillingInvoiceService");
        const dates = resolveBranchBillingDates(updated, organization, "activate", {
          at: opts.at instanceof Date ? opts.at : new Date(),
        });
        if (dates.apply) {
          await churchBillingRepo.setBranchBillingWindow(client, id, {
            billing_started_at: dates.billing_started_at,
            billing_ends_at: null,
          });
          updated.billing_started_at = dates.billing_started_at;
          updated.billing_ends_at = null;
        }
      }
    }

    if (ownsClient) await client.query("COMMIT");
    return { branch: updated, alreadyActive: false, organization, packageCode: quota.packageCode };
  } catch (err) {
    if (ownsClient) {
      try {
        await client.query("ROLLBACK");
      } catch {
        /* ignore */
      }
    }
    throw err;
  } finally {
    if (ownsClient) client.release();
  }
}

/**
 * Deactivate (suspend) with lifecycle + audit enrichment. Preserves all records.
 * Growth: stops future billing at the end of the current paid period.
 */
async function deactivateBranch(db, branchId, opts = {}) {
  const phase = normalizeLifecyclePhase(opts.lifecyclePhase) || "temporarily_inactive";
  const status = operationalStatusForLifecycle(phase);
  if (status === "active") {
    throw Object.assign(new Error("Invalid deactivate lifecycle."), { code: "INVALID_LIFECYCLE" });
  }

  const updated = await branchesRepo.updateBranchStatus(db, branchId, status === "archived" ? "archived" : "suspended", {
    reason: opts.reason,
    platformAdminId: opts.platformAdminId || null,
    lifecyclePhase: phase,
    auditAction:
      status === "archived" ? "platform_church_branch_archived" : "platform_church_branch_deactivated",
    auditMetadataExtra: {
      lifecycle_phase: phase,
      deactivate: true,
    },
  });

  try {
    const organization = await organizationsRepo.findOrganizationById(db, updated.organization_id);
    const resolved = resolvePackageFromPlanCode(organization && organization.plan_code);
    if (resolved.packageCode === "growth") {
      const churchBillingRepo = require("../../db/pg/church/churchBillingRepo");
      const { resolveBranchBillingDates } = require("./churchBillingInvoiceService");
      const dates = resolveBranchBillingDates(updated, organization, "deactivate", {
        at: opts.at instanceof Date ? opts.at : new Date(),
      });
      if (dates.apply && dates.billing_ends_at) {
        await churchBillingRepo.setBranchBillingWindow(db, branchId, {
          billing_ends_at: dates.billing_ends_at,
        });
        updated.billing_ends_at = dates.billing_ends_at;
      }
    }
  } catch {
    /* billing window is best-effort after status change */
  }

  return updated;
}

module.exports = {
  FOUNDATION_SECOND_ACTIVE_ERROR,
  countActiveBranchesForOrganization,
  canActivateAnotherActiveBranch,
  validateActivationRequirements,
  resolveCreateBranchLifecycle,
  activateBranch,
  deactivateBranch,
  resolveBranchLifecycle,
};
