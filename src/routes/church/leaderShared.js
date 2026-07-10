"use strict";

const auditLogsRepo = require("../../db/pg/church/auditLogsRepo");

function inferLeaderActiveNav(req) {
  const p = String((req && req.path) || "");
  if (p.startsWith("/leader/roster")) return "roster";
  if (p.startsWith("/leader/duties")) return "duties";
  if (p.startsWith("/leader/attendance")) return "attendance";
  if (p.startsWith("/leader/activity-notes")) return "activity-notes";
  if (p.startsWith("/leader/dashboard") || p === "/leader" || p === "/leader/") return "dashboard";
  return "";
}

function leaderPortalLocals(req, extra) {
  const org = req.churchContext.organization;
  const branch = req.churchContext.branch;
  const extraObj = extra && typeof extra === "object" ? extra : {};
  return {
    churchName: branch.name || org.name,
    pageTitle: extraObj.pageTitle || branch.name || org.name,
    organization: org,
    branch,
    leader: req.churchLeader || null,
    leaderName: req.churchLeader ? req.churchLeader.full_name : "",
    activeNav: extraObj.activeNav != null ? extraObj.activeNav : inferLeaderActiveNav(req),
    ...extraObj,
  };
}

function flashFromQuery(req) {
  const notice = String((req.query && req.query.notice) || "").trim().slice(0, 200);
  const map = {
    attendance_saved: "Attendance record saved.",
    activity_note_saved: "Activity note saved as draft.",
    activity_note_submitted: "Activity note submitted.",
  };
  return map[notice] || null;
}

async function recordLeaderAudit(pool, req, { action, entityType, entityId, metadata }) {
  const org = req.churchContext.organization;
  const branch = req.churchContext.branch;
  const leader = req.churchLeader;
  await auditLogsRepo.insertAuditLog(pool, {
    organization_id: org.id,
    branch_id: branch.id,
    actor_type: "ministry_leader",
    actor_id: leader.leader_id,
    action,
    entity_type: entityType,
    entity_id: entityId,
    metadata_json: metadata && typeof metadata === "object" ? metadata : {},
  });
}

module.exports = {
  leaderPortalLocals,
  flashFromQuery,
  recordLeaderAudit,
};
