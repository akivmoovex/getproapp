"use strict";

/**
 * BlessBoard onboarding adapter — church checklist facts stay in BlessBoard tables.
 * Shared engine stores only progress/status/resume; follow-up columns stay here.
 */

const {
  getOrganizationOnboardingSummary,
  REQUIRED_CHECKLIST_KEYS,
  RECOMMENDED_CHECKLIST_KEYS,
} = require("../services/organizationOnboardingSummaryService");
const repo = require("../repositories/platformChurchRegistrationRepository");
const { STEP_KIND, PRODUCT, STATUS, isTerminalStatus } = require("../../platform/onboarding/constants");

const HQ_ROLES = new Set(["church_hq_admin", "platform_admin"]);

function roleKeysFrom(actor) {
  const roles = (actor && (actor.roles || actor.effectiveRoles)) || [];
  return roles.map((r) => (typeof r === "string" ? r : String(r.roleKey || r.role_key || "")));
}

function canManage(actor) {
  if (!actor) return false;
  const keys = roleKeysFrom(actor);
  if (keys.some((k) => HQ_ROLES.has(k))) return true;
  const perms = actor.permissions || [];
  return perms.includes("organisation.settings.manage");
}

async function countActiveStaffRoles(db, organizationId) {
  try {
    const r = await db.query(
      `SELECT COUNT(*)::int AS n
         FROM blessboard.user_roles
        WHERE organization_id = $1
          AND revoked_at IS NULL`,
      [organizationId]
    );
    return Number(r.rows[0] && r.rows[0].n) || 0;
  } catch {
    return 1;
  }
}

function mapChecklistItem(item) {
  const key = String(item.key || "");
  const required = REQUIRED_CHECKLIST_KEYS.includes(key);
  return {
    key,
    label: item.label,
    kind: required ? STEP_KIND.REQUIRED : STEP_KIND.RECOMMENDED,
    complete: item.completed === true,
    skippable: !required,
    destinationUrl: item.actionUrl || null,
    explanation: item.explanation || null,
  };
}

async function listSteps(db, input) {
  const organizationId = String((input && input.organizationId) || "").trim();
  const loaded = await getOrganizationOnboardingSummary(db, {
    organizationId,
    linkContext: "hq",
  });
  const checklist = loaded && loaded.ok && loaded.summary ? loaded.summary.checklist || [] : [];
  const steps = checklist
    .filter((item) => REQUIRED_CHECKLIST_KEYS.includes(item.key) || RECOMMENDED_CHECKLIST_KEYS.includes(item.key))
    .map(mapChecklistItem);
  const staffCount = await countActiveStaffRoles(db, organizationId);
  steps.push({
    key: "invite_staff",
    label: "Invite staff",
    kind: STEP_KIND.RECOMMENDED,
    complete: staffCount > 1,
    skippable: true,
    destinationUrl: "/hq/settings/staff-access",
    explanation: "Invite another HQ or branch administrator.",
  });
  return { steps, deploymentCode: null };
}

async function getStoredTerminalStatus(db, input) {
  const organizationId = String((input && input.organizationId) || "").trim();
  if (!organizationId) return null;
  try {
    const r = await db.query(
      `SELECT onboarding_status
         FROM blessboard.organization_onboarding
        WHERE organization_id = $1
        LIMIT 1`,
      [organizationId]
    );
    const status = r.rows[0] && r.rows[0].onboarding_status;
    return isTerminalStatus(status) ? String(status) : null;
  } catch {
    return null;
  }
}

async function syncProductCompletion(db, input) {
  const organizationId = String((input && input.organizationId) || "").trim();
  const status = String((input && input.status) || STATUS.COMPLETED);
  if (!organizationId) return { ok: false };
  const at = input.completedAt || new Date();
  try {
    await repo.updateOrganizationOnboarding(db, organizationId, {
      onboardingStatus: status,
      onboardingStartedAt: at,
      onboardingCompletedAt: at,
    });
    return { ok: true, status };
  } catch {
    return { ok: false, status };
  }
}

module.exports = {
  productCode: PRODUCT.BLESSBOARD,
  canManage,
  listSteps,
  getStoredTerminalStatus,
  syncProductCompletion,
};
