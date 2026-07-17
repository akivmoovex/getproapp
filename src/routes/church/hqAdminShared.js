"use strict";

const auditLogsRepo = require("../../db/pg/church/auditLogsRepo");
const { getHqStatusBanner } = require("../../church/churchStatusAccess");
const { churchSessionCsrfLocals } = require("../../church/churchSessionCsrf");
const { resolvePackageFromPlanCode } = require("../../church/blessBoardPackageCatalogue");
const { listNavFeatureGates } = require("../../church/blessBoardPackageFeatures");

function packageFeatureLocalsFromOrg(org, portal) {
  const resolved = resolvePackageFromPlanCode(org && org.plan_code);
  const plan = {
    packageCode: resolved.packageCode,
    packageLabel: resolved.packageDefinition.label,
    entitlements: resolved.packageDefinition.entitlements,
    storedPlanCode: org && org.plan_code != null ? String(org.plan_code) : null,
  };
  return {
    packagePlan: plan,
    packageFeatureNav: listNavFeatureGates(plan, portal),
  };
}

function inferHqActiveNav(req) {
  const p = String((req && req.path) || "");
  if (p.startsWith("/hq/scheduled-broadcasts")) return "broadcasts-scheduled";
  if (p.startsWith("/hq/broadcasts")) return "broadcasts";
  if (p.startsWith("/hq/support-access")) return "support-access";
  if (p.startsWith("/hq/audit")) return "audit";
  if (p.startsWith("/hq/members")) return "members";
  if (p.startsWith("/hq/branches")) return "branches";
  if (p.startsWith("/hq/cross-branch-reports")) return "reports-cross-branch";
  if (p.startsWith("/hq/custom-report-builder")) return "reports-builder";
  if (p.startsWith("/hq/reports")) return "reports";
  if (p.startsWith("/hq/analytics")) return "analytics";
  if (p.startsWith("/hq/integrations")) return "integrations";
  if (p.startsWith("/hq/network")) return "network";
  if (p.startsWith("/hq/notification-templates")) return "notification-templates";
  if (p.startsWith("/hq/account")) return "account";
  if (p.startsWith("/hq/dashboard") || p === "/hq" || p === "/hq/") return "dashboard";
  return "";
}

function hqAdminLocals(req, extra) {
  const org = req.churchContext.organization;
  const branch = req.churchContext.branch;
  const extraObj = extra && typeof extra === "object" ? extra : {};
  const csrf = req.churchHqAdmin
    ? churchSessionCsrfLocals(req)
    : { churchCsrfToken: "", churchCsrfField: "_csrf" };
  // Prefer request-scoped plan (one DB load) over re-deriving from org.plan_code alone.
  const packageLocals = req.churchPackagePlan
    ? {
        packagePlan: req.churchPackagePlan,
        packageFeatureNav: listNavFeatureGates(req.churchPackagePlan, "hq"),
      }
    : packageFeatureLocalsFromOrg(org, "hq");
  const planContext = extraObj.planContext || req.churchPlanContext || null;
  return {
    churchName: org.name,
    organizationName: org.name,
    pageTitle: extraObj.pageTitle || org.name,
    organization: org,
    branch,
    hqAdmin: req.churchHqAdmin || null,
    statusBanner: getHqStatusBanner(req.churchContext),
    activeNav: extraObj.activeNav != null ? extraObj.activeNav : inferHqActiveNav(req),
    ...csrf,
    ...packageLocals,
    ...(planContext ? { planContext } : {}),
    ...extraObj,
  };
}

function flashFromQuery(req, allowed) {
  const notice = String((req.query && req.query.notice) || "").trim().slice(0, 200);
  if (!notice) return null;
  return allowed.has(notice) ? notice : null;
}

const HQ_NOTICES = new Set([
  "approved",
  "changes_requested",
  "broadcast_created",
  "broadcast_updated",
  "broadcast_published",
  "broadcast_archived",
]);
const BRANCH_NOTICES = new Set([
  "branch_created_active",
  "branch_created_draft",
  "branch_activated",
  "branch_deactivated",
]);
const ACCOUNT_NOTICES = new Set(["password_changed", "reactivated_from_dormancy"]);

function noticeMessage(code) {
  const map = {
    approved: "Report approved successfully.",
    changes_requested: "Changes requested and sent to branch.",
    broadcast_created: "Broadcast saved as draft.",
    broadcast_updated: "Broadcast updated successfully.",
    broadcast_published: "Broadcast published successfully.",
    broadcast_archived: "Broadcast archived.",
    password_changed: "Password updated. Use your new password next time you log in.",
    reactivated_from_dormancy:
      "Organisation reactivated from dormancy. The public site remains unpublished until you republish it. Member access is restored.",
  };
  return map[code] || null;
}

function branchNoticeMessage(code) {
  const map = {
    branch_created_active: "Branch created and activated.",
    branch_created_draft:
      "Branch created as draft. Complete setup and activate when ready (Foundation allows one active branch).",
    branch_activated: "Branch activated successfully.",
    branch_deactivated: "Branch deactivated. Historical data remains available to HQ.",
  };
  return map[code] || null;
}

async function recordHqAudit(pool, req, { action, branchId, entityType, entityId, metadata }) {
  const org = req.churchContext.organization;
  const admin = req.churchHqAdmin;
  await auditLogsRepo.insertAuditLog(pool, {
    organization_id: org.id,
    branch_id: branchId,
    actor_type: "hq_admin",
    actor_id: admin.hq_admin_id,
    action,
    entity_type: entityType,
    entity_id: entityId,
    metadata_json: metadata && typeof metadata === "object" ? metadata : {},
  });
}

module.exports = {
  hqAdminLocals,
  flashFromQuery,
  HQ_NOTICES,
  BRANCH_NOTICES,
  ACCOUNT_NOTICES,
  noticeMessage,
  branchNoticeMessage,
  recordHqAudit,
  BROADCAST_NOTICES: HQ_NOTICES,
};
