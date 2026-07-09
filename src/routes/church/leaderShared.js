"use strict";

const auditLogsRepo = require("../../db/pg/church/auditLogsRepo");

function leaderPortalLocals(req, extra) {
  const org = req.churchContext.organization;
  const branch = req.churchContext.branch;
  return {
    churchName: branch.name || org.name,
    pageTitle: branch.name || org.name,
    organization: org,
    branch,
    leader: req.churchLeader || null,
    leaderName: req.churchLeader ? req.churchLeader.full_name : "",
    ...(extra || {}),
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
