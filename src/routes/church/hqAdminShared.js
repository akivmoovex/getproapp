"use strict";

const auditLogsRepo = require("../../db/pg/church/auditLogsRepo");
const { getHqStatusBanner } = require("../../church/churchStatusAccess");

function hqAdminLocals(req, extra) {
  const org = req.churchContext.organization;
  const branch = req.churchContext.branch;
  return {
    churchName: org.name,
    organizationName: org.name,
    pageTitle: org.name,
    organization: org,
    branch,
    hqAdmin: req.churchHqAdmin || null,
    statusBanner: getHqStatusBanner(req.churchContext),
    ...(extra || {}),
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
