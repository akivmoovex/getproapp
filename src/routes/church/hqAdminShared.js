"use strict";

const auditLogsRepo = require("../../db/pg/church/auditLogsRepo");
const { getHqStatusBanner } = require("../../church/churchStatusAccess");
const { churchSessionCsrfLocals } = require("../../church/churchSessionCsrf");

function inferHqActiveNav(req) {
  const p = String((req && req.path) || "");
  if (p.startsWith("/hq/broadcasts")) return "broadcasts";
  if (p.startsWith("/hq/audit")) return "audit";
  if (p.startsWith("/hq/branches")) return "branches";
  if (p.startsWith("/hq/reports")) return "reports";
  if (p.startsWith("/hq/analytics")) return "analytics";
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
const ACCOUNT_NOTICES = new Set(["password_changed"]);

function noticeMessage(code) {
  const map = {
    approved: "Report approved successfully.",
    changes_requested: "Changes requested and sent to branch.",
    broadcast_created: "Broadcast saved as draft.",
    broadcast_updated: "Broadcast updated successfully.",
    broadcast_published: "Broadcast published successfully.",
    broadcast_archived: "Broadcast archived.",
    password_changed: "Password updated. Use your new password next time you log in.",
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
  ACCOUNT_NOTICES,
  noticeMessage,
  recordHqAudit,
  BROADCAST_NOTICES: HQ_NOTICES,
};
