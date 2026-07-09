"use strict";

const auditLogsRepo = require("../../db/pg/church/auditLogsRepo");

function branchAdminLocals(req, extra) {
  const org = req.churchContext.organization;
  const branch = req.churchContext.branch;
  return {
    churchName: branch.name || org.name,
    pageTitle: branch.name || org.name,
    organization: org,
    branch,
    branchAdmin: req.churchBranchAdmin || null,
    ...(extra || {}),
  };
}

function flashFromQuery(req, allowed) {
  const notice = String((req.query && req.query.notice) || "").trim().slice(0, 200);
  if (!notice) return null;
  return allowed.has(notice) ? notice : null;
}

const MEMBER_NOTICES = new Set([
  "approved",
  "rejected",
  "more_info",
  "verified",
  "already_verified",
  "suspended",
  "reactivated",
  "profile_updated",
  "admin_note_added",
]);
const ATTENDANCE_NOTICES = new Set(["created", "submitted", "status_updated"]);
const GIVING_NOTICES = new Set(["giving_saved", "giving_submitted"]);
const REPORT_NOTICES = new Set(["report_draft_saved", "report_submitted"]);
const REQUEST_NOTICES = new Set([
  "request_in_review",
  "request_approved",
  "request_rejected",
  "request_more_info",
  "request_completed",
]);
const PRAYER_ADMIN_NOTICES = new Set(["prayer_reviewed", "prayer_closed"]);
const ANNOUNCEMENT_NOTICES = new Set([
  "announcement_created",
  "announcement_updated",
  "announcement_published",
  "announcement_archived",
]);
const EVENT_NOTICES = new Set(["event_created", "event_updated", "event_published", "event_cancelled"]);
const WEBSITE_NOTICES = new Set(["website_draft_saved", "website_published"]);
const GIVING_SETTINGS_NOTICES = new Set(["giving_settings_draft_saved", "giving_settings_published"]);
const MINISTRY_NOTICES = new Set([
  "ministry_created",
  "ministry_updated",
  "ministry_published",
  "ministry_archived",
]);
const DEPARTMENT_NOTICES = new Set([
  "department_created",
  "department_updated",
  "department_activated",
  "department_archived",
]);
const DUTY_NOTICES = new Set(["duty_created", "duty_updated", "duty_confirmed", "duty_cancelled"]);
const MINISTRY_ACTIVITY_NOTICES = new Set([
  "activity_note_reviewed",
  "activity_follow_up_requested",
]);
const LEADER_NOTICES = new Set([
  "leader_created",
  "leader_updated",
  "leader_activated",
  "leader_deactivated",
  "leader_password_reset",
  "leader_activate_failed",
  "leader_deactivate_failed",
  "leader_password_reset_failed",
]);
const MINISTRY_JOIN_NOTICES = new Set([
  "join_request_submitted",
  "join_request_approved",
  "join_request_rejected",
  "join_request_more_info",
]);
const ACCOUNT_NOTICES = new Set(["password_changed"]);
const PASSWORD_RESET_NOTICES = new Set(["reset_reviewed", "reset_completed", "reset_rejected"]);
const LEADER_PASSWORD_RESET_NOTICES = PASSWORD_RESET_NOTICES;

function noticeMessage(code) {
  const map = {
    approved: "Member approved successfully.",
    rejected: "Member registration rejected.",
    more_info: "Request for more information recorded. Member remains pending.",
    verified: "Member verified successfully.",
    already_verified: "Member is already verified.",
    suspended: "Member access suspended.",
    reactivated: "Member reactivated successfully.",
    profile_updated: "Member profile updated.",
    admin_note_added: "Admin note added.",
    created: "Attendance record saved.",
    submitted: "Attendance record submitted successfully.",
    status_updated: "Attendance status updated.",
    giving_saved: "Giving summary saved.",
    giving_submitted: "Giving summary submitted.",
    report_draft_saved: "Monthly report draft saved.",
    report_submitted: "Monthly report submitted to HQ.",
    request_in_review: "Request marked in review.",
    request_approved: "Request approved.",
    request_rejected: "Request rejected.",
    request_more_info: "More information requested from member.",
    request_completed: "Request marked completed.",
    prayer_reviewed: "Prayer request marked reviewed.",
    prayer_closed: "Prayer request closed.",
    announcement_created: "Announcement saved as draft.",
    announcement_updated: "Announcement updated.",
    announcement_published: "Announcement published.",
    announcement_archived: "Announcement archived.",
    event_created: "Event saved as draft.",
    event_updated: "Event updated.",
    event_published: "Event published.",
    event_cancelled: "Event cancelled.",
    website_draft_saved: "Website draft saved.",
    website_published: "Website published successfully.",
    giving_settings_draft_saved: "Giving settings draft saved.",
    giving_settings_published: "Giving information published.",
    ministry_created: "Ministry saved as draft.",
    ministry_updated: "Ministry updated.",
    ministry_published: "Ministry published.",
    ministry_archived: "Ministry archived.",
    department_created: "Department created.",
    department_updated: "Department updated.",
    department_activated: "Department activated.",
    department_archived: "Department archived.",
    duty_created: "Duty saved as draft.",
    duty_updated: "Duty updated.",
    duty_confirmed: "Duty confirmed.",
    duty_cancelled: "Duty cancelled.",
    activity_note_reviewed: "Ministry activity note marked as reviewed.",
    activity_follow_up_requested: "Follow-up requested from ministry leader.",
    leader_created: "Ministry leader account created.",
    leader_updated: "Ministry leader updated.",
    leader_activated: "Ministry leader activated.",
    leader_deactivated: "Ministry leader deactivated.",
    leader_password_reset: "Leader password reset successfully.",
    leader_activate_failed: "Leader could not be activated.",
    leader_deactivate_failed: "Leader could not be deactivated.",
    leader_password_reset_failed: "Password could not be reset.",
    join_request_submitted: "Your ministry join request has been submitted.",
    join_request_approved: "Join request approved and member assigned to ministry.",
    join_request_rejected: "Join request rejected.",
    join_request_more_info: "More information requested from member.",
    password_changed: "Password updated. Use your new password next time you log in.",
    reset_reviewed: "Password reset request marked as reviewed.",
    reset_completed: "Password reset completed. Share the temporary password securely.",
    reset_rejected: "Password reset request rejected.",
  };
  return map[code] || null;
}

async function recordBranchAudit(pool, req, { action, entityType, entityId, metadata }) {
  const org = req.churchContext.organization;
  const branch = req.churchContext.branch;
  const admin = req.churchBranchAdmin;
  await auditLogsRepo.insertAuditLog(pool, {
    organization_id: org.id,
    branch_id: branch.id,
    actor_type: "branch_admin",
    actor_id: admin.admin_id,
    action,
    entity_type: entityType,
    entity_id: entityId,
    metadata_json: metadata && typeof metadata === "object" ? metadata : {},
  });
}

module.exports = {
  branchAdminLocals,
  flashFromQuery,
  MEMBER_NOTICES,
  ATTENDANCE_NOTICES,
  GIVING_NOTICES,
  REPORT_NOTICES,
  REQUEST_NOTICES,
  PRAYER_ADMIN_NOTICES,
  ANNOUNCEMENT_NOTICES,
  EVENT_NOTICES,
  WEBSITE_NOTICES,
  GIVING_SETTINGS_NOTICES,
  MINISTRY_NOTICES,
  DEPARTMENT_NOTICES,
  DUTY_NOTICES,
  MINISTRY_ACTIVITY_NOTICES,
  LEADER_NOTICES,
  MINISTRY_JOIN_NOTICES,
  ACCOUNT_NOTICES,
  PASSWORD_RESET_NOTICES,
  LEADER_PASSWORD_RESET_NOTICES,
  noticeMessage,
  recordBranchAudit,
};
