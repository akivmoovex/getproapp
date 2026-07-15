"use strict";

const auditLogsRepo = require("../../db/pg/church/auditLogsRepo");
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

function resolveBranchAdminNavActive(req) {
  const p = String((req && req.path) || "");
  if (p === "/branch/dashboard" || p === "/branch") return "dashboard";
  if (p.startsWith("/branch/account")) return "account";
  if (p.startsWith("/branch/member-verification")) return "verification";
  if (p.startsWith("/branch/members")) return "members";
  if (p.startsWith("/branch/requests")) return "requests";
  if (p.startsWith("/branch/reset-requests") || p.startsWith("/branch/password-reset") || p.startsWith("/branch/leader-password-reset")) {
    return "reset";
  }
  if (p.startsWith("/branch/prayer-requests")) return "prayer";
  if (p.startsWith("/branch/announcements")) return "announcements";
  if (p.startsWith("/branch/events")) return "events";
  if (p.startsWith("/branch/website-editor") || p.startsWith("/branch/site")) return "website";
  if (p.startsWith("/branch/contact-submissions")) return "contact";
  if (p.startsWith("/branch/sermons")) return "sermons";
  if (p.startsWith("/branch/resources")) return "resources";
  if (p.startsWith("/branch/attendance-offline")) return "attendance-offline";
  if (p.startsWith("/branch/attendance-rules")) return "attendance-rules";
  if (p.startsWith("/branch/attendance")) return "attendance";
  if (p.startsWith("/branch/giving-summary")) return "giving-summary";
  if (p.startsWith("/branch/giving-settings")) return "giving-settings";
  if (p.startsWith("/branch/ministries")) return "ministries";
  if (p.startsWith("/branch/departments")) return "departments";
  if (p.startsWith("/branch/duty-roster")) return "duty";
  if (p.startsWith("/branch/volunteer-scheduling")) return "volunteer-scheduling";
  if (p.startsWith("/branch/appointments")) return "appointments";
  if (p.startsWith("/branch/event-logistics")) return "event-logistics";
  if (p.startsWith("/branch/scheduled-reports")) return "reports-scheduled";
  if (p.startsWith("/branch/domains/custom") || p.startsWith("/branch/domains-custom")) return "domains-custom";
  if (p.startsWith("/branch/email/hosted") || p.startsWith("/branch/email-hosted")) return "email-hosted";
  if (p.startsWith("/branch/ministry-activity")) return "ministry-activity";
  if (p.startsWith("/branch/ministry-attendance")) return "ministry-attendance";
  if (p.startsWith("/branch/leaders")) return "leaders";
  if (p.startsWith("/branch/ministry-join-requests")) return "join-requests";
  if (p.startsWith("/branch/reports")) return "reports";
  if (p.startsWith("/branch/activity")) return "activity";
  return "";
}
function branchAdminShellTitle(navActive) {
  const titles = {
    dashboard: "Branch Dashboard",
    account: "Account",
    verification: "Member Verification",
    members: "Members",
    requests: "Requests",
    reset: "Reset Inbox",
    prayer: "Prayer Requests",
    announcements: "Announcements",
    events: "Events Management",
    website: "Website Editor",
    contact: "Contact Submissions",
    sermons: "Sermons",
    resources: "Resources",
    attendance: "Attendance",
    "giving-summary": "Giving Summary",
    "giving-settings": "Giving Settings",
    ministries: "Ministries",
    departments: "Departments",
    duty: "Duty Roster",
    "volunteer-scheduling": "Volunteer scheduling",
    appointments: "Appointments",
    "attendance-offline": "Offline attendance",
    "attendance-rules": "Attendance rules",
    "event-logistics": "Event logistics",
    "reports-scheduled": "Scheduled reports",
    "domains-custom": "Custom domain",
    "email-hosted": "Hosted email",
    "ministry-activity": "Ministry Activity",
    "ministry-attendance": "Ministry Attendance",
    leaders: "Leaders",
    "join-requests": "Join Requests",
    reports: "Reports",
    activity: "Activity",
  };
  return titles[navActive] || "Branch Admin";
}

function branchAdminLocals(req, extra) {
  const org = req.churchContext.organization;
  const branch = req.churchContext.branch;
  const navActive = (extra && extra.navActive) || resolveBranchAdminNavActive(req);
  const shellTitle = (extra && extra.shellTitle) || branchAdminShellTitle(navActive);
  const adminName =
    (req.churchBranchAdmin && req.churchBranchAdmin.full_name) ||
    (extra && extra.branchAdmin && extra.branchAdmin.full_name) ||
    "Branch Admin";
  const csrf = req.churchBranchAdmin
    ? churchSessionCsrfLocals(req)
    : { churchCsrfToken: "", churchCsrfField: "_csrf" };
  return {
    churchName: branch.name || org.name,
    pageTitle: branch.name || org.name,
    organization: org,
    branch,
    branchAdmin: req.churchBranchAdmin || null,
    navActive,
    shellTitle,
    adminName,
    adminAvatarUrl: "/church/images/branch-admin/avatar-pastor-stitch.jpg",
    ...csrf,
    ...packageFeatureLocalsFromOrg(org, "branch"),
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
  "transferred",
  "import_decisions_saved",
  "import_committed",
  "import_already_committed",
  "import_reversed",
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
const WEBSITE_NOTICES = new Set([
  "website_draft_saved",
  "website_published",
  "registration_updated",
  "settings_error",
]);
const CONTACT_NOTICES = new Set(["contact_updated"]);
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
const SCHEDULED_REPORT_NOTICES = new Set([
  "schedule_created",
  "schedule_enabled",
  "schedule_paused",
  "schedule_cancelled",
  "run_retried",
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
    transferred: "Member transferred to another campus. History preserved.",
    import_decisions_saved: "Import review decisions saved.",
    import_committed: "Member import committed. Review the summary for outcomes.",
    import_already_committed: "This import batch was already committed (idempotent).",
    import_reversed:
      "Import batch reversed. People created by this batch were suspended — not deleted.",
    created: "Attendance record saved.",
    submitted: "Attendance record submitted successfully.",
    status_updated: "Attendance status updated.",
    giving_saved: "Giving summary saved.",
    giving_submitted: "Giving summary submitted.",
    report_draft_saved: "Monthly report draft saved.",
    report_submitted: "Monthly report submitted to HQ.",
    schedule_created: "Scheduled report saved.",
    schedule_enabled: "Scheduled report enabled.",
    schedule_paused: "Scheduled report paused.",
    schedule_cancelled: "Scheduled report cancelled.",
    run_retried: "Failed scheduled report run queued for retry.",
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
    registration_updated: "Member registration setting updated.",
    settings_error: "Settings could not be saved. Please try again.",
    contact_updated: "Contact submission updated.",
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
  SCHEDULED_REPORT_NOTICES,
  REQUEST_NOTICES,
  PRAYER_ADMIN_NOTICES,
  ANNOUNCEMENT_NOTICES,
  EVENT_NOTICES,
  WEBSITE_NOTICES,
  CONTACT_NOTICES,
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
