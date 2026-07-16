"use strict";

/**
 * Platform-admin Foundation / Growth package assignment.
 * No self-service payment, no Network activation, no automatic downgrade of unsuitable tenants.
 */

const crypto = require("crypto");
const organizationsRepo = require("../../db/pg/church/organizationsRepo");
const branchesRepo = require("../../db/pg/church/branchesRepo");
const auditLogsRepo = require("../../db/pg/church/auditLogsRepo");
const churchBillingRepo = require("../../db/pg/church/churchBillingRepo");
const {
  PACKAGE_CODES,
  resolvePackageFromPlanCode,
  getPackageDefinition,
} = require("../../church/blessBoardPackageCatalogue");
const {
  getOrganisationPlan,
  getNumericLimit,
} = require("./churchEntitlementService");
const {
  countActiveMembersForOrganization,
  countPrivilegedAccountsForOrganization,
} = require("./churchSeatQuotaService");

const ASSIGNABLE_PACKAGE_CODES = Object.freeze(["foundation", "growth"]);

const TOKEN_TTL_MS = 30 * 60 * 1000;

function packageAssignmentSigningSecret() {
  return (
    process.env.CHURCH_PACKAGE_ASSIGN_SECRET ||
    process.env.SESSION_SECRET ||
    "blessboard-package-assign-dev"
  );
}

function parseEffectiveAt(raw) {
  if (raw == null || raw === "") return new Date();
  const d = raw instanceof Date ? raw : new Date(String(raw));
  if (Number.isNaN(d.getTime())) {
    const err = new Error("Invalid effective date.");
    err.code = "INVALID_EFFECTIVE_AT";
    throw err;
  }
  return d;
}

function validateAssignablePackageCode(raw) {
  const code = String(raw || "")
    .trim()
    .toLowerCase();
  if (!ASSIGNABLE_PACKAGE_CODES.includes(code)) {
    const err = new Error("Only Foundation and Growth packages can be assigned.");
    err.code = "INVALID_PACKAGE";
    throw err;
  }
  return code;
}

/**
 * Sign a preview payload so confirm must match preview fields (anti-duplicate / CSRF-adjacent).
 * @param {object} payload
 */
function signAssignmentPreview(payload) {
  const body = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  const sig = crypto
    .createHmac("sha256", packageAssignmentSigningSecret())
    .update(body)
    .digest("base64url");
  return `${body}.${sig}`;
}

function verifyAssignmentPreviewToken(token, expected) {
  const raw = String(token || "");
  const parts = raw.split(".");
  if (parts.length !== 2) return { ok: false, code: "INVALID_TOKEN" };
  const [body, sig] = parts;
  const expectedSig = crypto
    .createHmac("sha256", packageAssignmentSigningSecret())
    .update(body)
    .digest("base64url");
  const a = Buffer.from(sig);
  const b = Buffer.from(expectedSig);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    return { ok: false, code: "INVALID_TOKEN" };
  }
  let parsed;
  try {
    parsed = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
  } catch {
    return { ok: false, code: "INVALID_TOKEN" };
  }
  if (!parsed || Number(parsed.organizationId) !== Number(expected.organizationId)) {
    return { ok: false, code: "CROSS_TENANT_TOKEN" };
  }
  if (String(parsed.packageCode) !== String(expected.packageCode)) {
    return { ok: false, code: "TOKEN_MISMATCH" };
  }
  if (String(parsed.reason || "") !== String(expected.reason || "")) {
    return { ok: false, code: "TOKEN_MISMATCH" };
  }
  if (String(parsed.effectiveAt || "") !== String(expected.effectiveAt || "")) {
    return { ok: false, code: "TOKEN_MISMATCH" };
  }
  if (parsed.issuedAt && Date.now() - Number(parsed.issuedAt) > TOKEN_TTL_MS) {
    return { ok: false, code: "TOKEN_EXPIRED" };
  }
  return { ok: true, payload: parsed };
}

/**
 * Growth → Foundation compatibility (does not modify data).
 * @param {import("pg").Pool | import("pg").PoolClient} db
 * @param {number} organizationId
 */
async function evaluateFoundationDowngradeEligibility(db, organizationId) {
  const foundation = getPackageDefinition("foundation");
  const plan = { entitlements: foundation.entitlements };
  const memberLimit = getNumericLimit(plan, "members.max_active");
  const adminLimit = getNumericLimit(plan, "admins.max");
  const branchLimit = getNumericLimit(plan, "branches.max_active");

  const [activeBranches, members, privileged, inactiveBranches, growthJobs] = await Promise.all([
    branchesRepo.countActiveBranchesForOrganization(db, organizationId),
    countActiveMembersForOrganization(db, organizationId),
    countPrivilegedAccountsForOrganization(db, organizationId),
    db.query(
      `SELECT id, name, slug, status, lifecycle_phase
       FROM public.church_branches
       WHERE organization_id = $1 AND status IS DISTINCT FROM 'active'
       ORDER BY name ASC
       LIMIT 50`,
      [organizationId]
    ),
    collectIncompatibleGrowthJobs(db, organizationId),
  ]);

  const incompatibilities = [];

  if (typeof branchLimit === "number" && activeBranches > branchLimit) {
    incompatibilities.push({
      code: "active_branches",
      message: `Active branches (${activeBranches}) exceed Foundation limit (${branchLimit}). Deactivate extra branches first.`,
      used: activeBranches,
      limit: branchLimit,
    });
  }

  if (typeof memberLimit === "number" && members > memberLimit) {
    incompatibilities.push({
      code: "active_members",
      message: `Active members (${members}) exceed Foundation limit (${memberLimit}). Archive or suspend members first.`,
      used: members,
      limit: memberLimit,
    });
  }

  if (typeof adminLimit === "number" && privileged.total > adminLimit) {
    incompatibilities.push({
      code: "admins",
      message: `Administrator/leadership accounts (${privileged.total}) exceed Foundation limit (${adminLimit}). Deactivate privileged accounts first.`,
      used: privileged.total,
      limit: adminLimit,
    });
  }

  // No paid add-on catalogue yet — never invent add-ons.
  const paidAddOns = [];
  if (paidAddOns.length) {
    incompatibilities.push({
      code: "paid_addons",
      message: `Active paid add-ons must be removed before downgrade: ${paidAddOns.join(", ")}.`,
      used: paidAddOns.length,
      limit: 0,
    });
  }

  for (const job of growthJobs) {
    incompatibilities.push(job);
  }

  return {
    allowed: incompatibilities.length === 0,
    incompatibilities,
    usage: {
      activeBranches,
      activeMembers: members,
      privilegedAccounts: privileged.total,
      privilegedBreakdown: privileged,
      growthJobs,
    },
    inactiveBranches: inactiveBranches.rows || [],
    limits: {
      branches: branchLimit,
      members: memberLimit,
      admins: adminLimit,
    },
  };
}

/**
 * Identify active Growth-only jobs/features that block Foundation downgrade.
 * Does not delete data — callers must pause/cancel these first.
 * @param {import("pg").Pool | import("pg").PoolClient} db
 * @param {number} organizationId
 * @returns {Promise<Array<{code:string,message:string,used:number,limit:number}>>}
 */
async function collectIncompatibleGrowthJobs(db, organizationId) {
  const jobs = [];

  const scheduledBroadcasts = await db
    .query(
      `SELECT COUNT(*)::int AS c
       FROM public.church_hq_broadcasts
       WHERE organization_id = $1
         AND (
           status = 'scheduled'
           OR (
             publish_at IS NOT NULL
             AND publish_at > now() + interval '2 minutes'
             AND status IN ('draft', 'preview', 'audience_estimate', 'approval', 'scheduled', 'processing')
           )
         )`,
      [organizationId]
    )
    .catch(() => ({ rows: [{ c: 0 }] }));
  const broadcastCount = Number(scheduledBroadcasts.rows[0]?.c) || 0;
  if (broadcastCount > 0) {
    jobs.push({
      code: "growth_scheduled_broadcasts",
      message: `${broadcastCount} scheduled or future HQ broadcast(s) require Growth. Cancel or publish them before downgrade.`,
      used: broadcastCount,
      limit: 0,
    });
  }

  const scheduledReports = await db
    .query(
      `SELECT COUNT(*)::int AS c
       FROM public.church_scheduled_reports
       WHERE organization_id = $1 AND status = 'enabled'`,
      [organizationId]
    )
    .catch(() => ({ rows: [{ c: 0 }] }));
  const reportCount = Number(scheduledReports.rows[0]?.c) || 0;
  if (reportCount > 0) {
    jobs.push({
      code: "growth_scheduled_reports",
      message: `${reportCount} enabled scheduled report(s) require Growth. Pause or cancel them before downgrade.`,
      used: reportCount,
      limit: 0,
    });
  }

  const pastoralAutomation = await db
    .query(
      `SELECT COUNT(*)::int AS c
       FROM public.church_pastoral_automation_settings
       WHERE organization_id = $1 AND enabled = true`,
      [organizationId]
    )
    .catch(() => ({ rows: [{ c: 0 }] }));
  const automationCount = Number(pastoralAutomation.rows[0]?.c) || 0;
  if (automationCount > 0) {
    jobs.push({
      code: "growth_pastoral_automation",
      message: `${automationCount} branch pastoral automation setting(s) are enabled. Disable them before downgrade.`,
      used: automationCount,
      limit: 0,
    });
  }

  const pendingAutomationWork = await db
    .query(
      `SELECT COUNT(*)::int AS c
       FROM public.church_pastoral_automation_work_items
       WHERE organization_id = $1 AND status IN ('pending', 'accepted')`,
      [organizationId]
    )
    .catch(() => ({ rows: [{ c: 0 }] }));
  const workCount = Number(pendingAutomationWork.rows[0]?.c) || 0;
  if (workCount > 0) {
    jobs.push({
      code: "growth_automation_work_items",
      message: `${workCount} open pastoral automation work item(s) require Growth. Resolve or dismiss them before downgrade.`,
      used: workCount,
      limit: 0,
    });
  }

  const activeSurveys = await db
    .query(
      `SELECT COUNT(*)::int AS c
       FROM public.church_surveys
       WHERE organization_id = $1 AND status = 'active'`,
      [organizationId]
    )
    .catch(() => ({ rows: [{ c: 0 }] }));
  const surveyCount = Number(activeSurveys.rows[0]?.c) || 0;
  if (surveyCount > 0) {
    jobs.push({
      code: "growth_active_surveys",
      message: `${surveyCount} active survey(s) require Growth. Close them before downgrade.`,
      used: surveyCount,
      limit: 0,
    });
  }

  return jobs;
}

/**
 * @param {import("pg").Pool | import("pg").PoolClient} db
 * @param {number} organizationId
 * @param {{ package_code: string, reason?: string, effective_at?: string|Date, plan_status?: string }} fields
 */
async function previewPackageAssignment(db, organizationId, fields) {
  const orgId = Number(organizationId);
  const current = await getOrganisationPlan(db, orgId);
  if (!current) {
    const err = new Error("Organization not found.");
    err.code = "NOT_FOUND";
    throw err;
  }

  const targetCode = validateAssignablePackageCode(fields.package_code);
  const reason = String(fields.reason || fields.plan_notes || "")
    .trim()
    .slice(0, 2000);
  if (!reason) {
    const err = new Error("A reason is required for package assignment.");
    err.code = "REASON_REQUIRED";
    throw err;
  }

  const effectiveAt = parseEffectiveAt(fields.effective_at);
  const target = getPackageDefinition(targetCode);
  const fromCode = current.packageCode;
  const direction =
    fromCode === targetCode
      ? "noop"
      : fromCode === "foundation" && targetCode === "growth"
        ? "upgrade"
        : fromCode === "growth" && targetCode === "foundation"
          ? "downgrade"
          : "reassign";

  let downgrade = null;
  if (direction === "downgrade") {
    downgrade = await evaluateFoundationDowngradeEligibility(db, orgId);
  }

  const inactiveForActivation =
    direction === "upgrade"
      ? (
          await db.query(
            `SELECT id, name, slug, status, lifecycle_phase
             FROM public.church_branches
             WHERE organization_id = $1 AND status IS DISTINCT FROM 'active'
             ORDER BY name ASC
             LIMIT 50`,
            [orgId]
          )
        ).rows
      : [];

  const consequences = [];
  if (direction === "upgrade") {
    consequences.push("Growth entitlements will be enabled for this organisation.");
    consequences.push("All existing data and branch states are preserved.");
    consequences.push("No invoices are created automatically.");
    if (inactiveForActivation.length) {
      consequences.push(
        `${inactiveForActivation.length} inactive branch(es) may now be activated (subject to activation requirements).`
      );
    } else {
      consequences.push("No inactive branches are waiting to be activated.");
    }
  } else if (direction === "downgrade") {
    consequences.push("Foundation entitlements and hard limits will apply after confirmation.");
    consequences.push("No package-specific configuration or church data will be deleted.");
    consequences.push(
      "Growth-only scheduled jobs (reports, broadcasts, automation, surveys) must be cleared before confirmation."
    );
    if (downgrade && !downgrade.allowed) {
      consequences.push("Final downgrade is blocked until incompatibilities are resolved.");
    }
  } else if (direction === "noop") {
    consequences.push("Organisation is already on this package; confirmation will not change entitlements.");
  } else {
    consequences.push(`Package will change from ${fromCode} to ${targetCode}.`);
    consequences.push("Existing data is preserved; no automatic invoicing.");
  }

  const tokenPayload = {
    organizationId: orgId,
    packageCode: targetCode,
    reason,
    effectiveAt: effectiveAt.toISOString(),
    planStatus: String(fields.plan_status || current.planStatus || "active")
      .trim()
      .toLowerCase(),
    issuedAt: Date.now(),
    nonce: crypto.randomBytes(8).toString("hex"),
  };

  return {
    organizationId: orgId,
    organizationName: current.organizationName,
    currentPackage: {
      code: current.packageCode,
      label: current.packageLabel,
      storedPlanCode: current.storedPlanCode,
      planStatus: current.planStatus,
    },
    targetPackage: { code: target.code, label: target.label },
    direction,
    reason,
    effectiveAt: effectiveAt.toISOString(),
    planStatus: tokenPayload.planStatus,
    consequences,
    inactiveBranchesEligibleForActivation: inactiveForActivation,
    downgrade,
    canConfirm: direction === "noop" ? false : direction === "downgrade" ? Boolean(downgrade && downgrade.allowed) : true,
    confirmToken: signAssignmentPreview(tokenPayload),
    tokenPayload,
  };
}

/**
 * @param {import("pg").Pool} pool
 * @param {number} organizationId
 * @param {{
 *   package_code: string,
 *   reason: string,
 *   effective_at?: string|Date,
 *   plan_status?: string,
 *   confirm_token: string,
 *   generate_invoice?: boolean,
 *   used_tokens?: Set<string>|string[],
 * }} fields
 * @param {number | null} platformAdminId
 */
async function confirmPackageAssignment(pool, organizationId, fields, platformAdminId) {
  const orgId = Number(organizationId);
  const targetCode = validateAssignablePackageCode(fields.package_code);
  const reason = String(fields.reason || "")
    .trim()
    .slice(0, 2000);
  const effectiveAt = parseEffectiveAt(fields.effective_at);
  const confirmToken = String(fields.confirm_token || "");

  const verified = verifyAssignmentPreviewToken(confirmToken, {
    organizationId: orgId,
    packageCode: targetCode,
    reason,
    effectiveAt: effectiveAt.toISOString(),
  });
  if (!verified.ok) {
    const err = new Error(
      verified.code === "CROSS_TENANT_TOKEN"
        ? "Confirm token does not match this organisation."
        : verified.code === "TOKEN_EXPIRED"
          ? "Preview expired. Preview the package change again."
          : "Invalid or mismatched confirmation token. Preview again before confirming."
    );
    err.code = verified.code || "INVALID_TOKEN";
    throw err;
  }

  const used = fields.used_tokens;
  if (used) {
    const set = used instanceof Set ? used : new Set(used);
    if (set.has(confirmToken)) {
      const err = new Error("This package assignment was already submitted.");
      err.code = "DUPLICATE_SUBMISSION";
      throw err;
    }
  }

  const preview = await previewPackageAssignment(pool, orgId, {
    package_code: targetCode,
    reason,
    effective_at: effectiveAt,
    plan_status: fields.plan_status || verified.payload.planStatus,
  });

  if (preview.direction === "noop") {
    const err = new Error("Organisation is already on this package.");
    err.code = "ALREADY_ASSIGNED";
    throw err;
  }

  if (preview.direction === "downgrade" && preview.downgrade && !preview.downgrade.allowed) {
    const err = new Error("Downgrade blocked by Foundation compatibility checks.");
    err.code = "DOWNGRADE_BLOCKED";
    err.incompatibilities = preview.downgrade.incompatibilities;
    throw err;
  }

  const before = await getOrganisationPlan(pool, orgId);
  const updated = await organizationsRepo.updateOrganizationPlan(
    pool,
    orgId,
    {
      plan_code: targetCode,
      plan_status: preview.planStatus || "active",
      plan_notes: reason,
    },
    platformAdminId
  );

  const history = await churchBillingRepo.insertPackageHistory(pool, {
    organization_id: orgId,
    previous_plan_code: before ? before.storedPlanCode : null,
    new_plan_code: targetCode,
    previous_package_code: before ? before.packageCode : null,
    new_package_code: targetCode,
    changed_by_platform_admin_id: platformAdminId || null,
    change_reason: reason,
    effective_at: effectiveAt,
  });

  await auditLogsRepo.insertAuditLog(pool, {
    organization_id: orgId,
    branch_id: null,
    actor_type: "platform_admin",
    actor_id: platformAdminId || null,
    action: "platform_package_assigned",
    entity_type: "church_organization",
    entity_id: orgId,
    target_label: updated.name,
    metadata_json: {
      previous_package: before ? before.packageCode : null,
      new_package: targetCode,
      previous_plan_code: before ? before.storedPlanCode : null,
      new_plan_code: targetCode,
      reason,
      effective_at: effectiveAt.toISOString(),
      direction: preview.direction,
      history_id: history && history.id ? history.id : null,
      generate_invoice: false,
      platform_admin_id: platformAdminId || null,
    },
  });

  if (fields.generate_invoice === true) {
    // Explicit opt-in only — never default.
    try {
      const { generateGrowthDraftInvoice } = require("./churchBillingInvoiceService");
      if (targetCode === "growth") {
        await generateGrowthDraftInvoice(pool, orgId, { at: effectiveAt });
      }
    } catch {
      /* invoice generation optional */
    }
  }

  if (used) {
    if (used instanceof Set) used.add(confirmToken);
    else used.push(confirmToken);
  }

  return {
    organization: updated,
    package: await getOrganisationPlan(pool, orgId),
    history,
    preview,
  };
}

/**
 * Back-compat wrapper used by older callers; routes should prefer preview + confirm.
 */
async function assignOrganisationPackage(pool, organizationId, fields, platformAdminId) {
  const packageCode = validateAssignablePackageCode(fields.package_code || fields.plan_code);
  const reason =
    String(fields.change_reason || fields.plan_notes || fields.reason || "Package assignment").trim() ||
    "Package assignment";
  const effectiveAt = parseEffectiveAt(fields.effective_at);
  const preview = await previewPackageAssignment(pool, organizationId, {
    package_code: packageCode,
    reason,
    effective_at: effectiveAt,
    plan_status: fields.plan_status,
  });
  return confirmPackageAssignment(
    pool,
    organizationId,
    {
      package_code: packageCode,
      reason,
      effective_at: effectiveAt,
      plan_status: fields.plan_status,
      confirm_token: preview.confirmToken,
      generate_invoice: fields.generate_invoice === true,
    },
    platformAdminId
  );
}

module.exports = {
  ASSIGNABLE_PACKAGE_CODES,
  PACKAGE_CODES,
  previewPackageAssignment,
  confirmPackageAssignment,
  assignOrganisationPackage,
  evaluateFoundationDowngradeEligibility,
  collectIncompatibleGrowthJobs,
  signAssignmentPreview,
  verifyAssignmentPreviewToken,
  validateAssignablePackageCode,
};
