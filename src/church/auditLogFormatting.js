"use strict";

const AUDIT_ACTOR_TYPES = ["branch_admin", "hq_admin", "member", "leader", "system", "public", "platform_admin"];

const AUDIT_ACTION_GROUPS = [
  { id: "all", label: "All actions" },
  { id: "members", label: "Members" },
  { id: "reports", label: "Reports" },
  { id: "attendance", label: "Attendance" },
  { id: "giving", label: "Giving" },
  { id: "website", label: "Website" },
  { id: "announcements", label: "Announcements" },
  { id: "events", label: "Events" },
  { id: "ministries", label: "Ministries" },
  { id: "leaders", label: "Leaders" },
  { id: "requests", label: "Requests" },
  { id: "hq_review", label: "HQ Review" },
  { id: "broadcasts", label: "Broadcasts" },
];

const ACTION_GROUP_SQL = {
  members: ["member_%", "platform_member_%"],
  reports: ["monthly_report_%", "hq_report_%"],
  attendance: ["attendance_%", "leader_attendance_%"],
  giving: ["giving_%"],
  website: ["website_%"],
  announcements: ["announcement_%"],
  events: ["event_%"],
  ministries: [
    "ministry_%",
    "department_%",
    "duty_%",
    "member_added_to_ministry",
    "ministry_activity_%",
    "leader_activity_note_%",
  ],
  leaders: ["ministry_leader_%"],
  requests: [
    "member_request_%",
    "prayer_request_%",
    "join_request_%",
    "member_password_reset_%",
    "ministry_leader_password_reset_%",
    "branch_admin_password_reset_%",
    "hq_admin_password_reset_%",
    "password_reset_request_rate_limited",
  ],
  hq_review: ["hq_report_%", "ministry_activity_%", "ministry_activity_follow_up_%"],
  broadcasts: ["hq_broadcast_%"],
};

const ACTION_LABELS = {
  member_verified_by_admin: "Member verified",
  member_suspended: "Member suspended",
  member_reactivated: "Member reactivated",
  member_profile_updated_by_admin: "Member profile updated by admin",
  member_admin_note_added: "Admin note added to member",
  platform_member_password_reset: "Platform member password reset",
  member_password_changed_self_service: "Member password changed (self-service)",
  member_password_reset_requested: "Member password reset requested",
  member_password_reset_request_reviewed: "Password reset request reviewed",
  member_password_reset_completed_by_branch_admin: "Member password reset by branch admin",
  member_password_reset_request_rejected: "Password reset request rejected",
  ministry_leader_password_reset_requested: "Ministry leader password reset requested",
  ministry_leader_password_reset_request_reviewed: "Ministry leader password reset request reviewed",
  ministry_leader_password_reset_completed_by_branch_admin: "Ministry leader password reset by branch admin",
  ministry_leader_password_reset_request_rejected: "Ministry leader password reset request rejected",
  branch_admin_password_reset_requested: "Branch admin password reset requested",
  branch_admin_password_reset_request_reviewed: "Branch admin password reset request reviewed",
  branch_admin_password_reset_completed_by_platform_admin: "Branch admin password reset by platform admin",
  branch_admin_password_reset_request_rejected: "Branch admin password reset request rejected",
  hq_admin_password_reset_requested: "HQ admin password reset requested",
  hq_admin_password_reset_request_reviewed: "HQ admin password reset request reviewed",
  hq_admin_password_reset_completed_by_platform_admin: "HQ admin password reset by platform admin",
  hq_admin_password_reset_request_rejected: "HQ admin password reset request rejected",
  password_reset_request_rate_limited: "Password reset request rate limited",
  member_login_locked: "Member login locked",
  branch_admin_login_locked: "Branch admin login locked",
  hq_admin_login_locked: "HQ admin login locked",
  ministry_leader_login_locked: "Ministry leader login locked",
  platform_login_account_unlocked: "Platform login account unlocked",
  branch_admin_password_changed_self_service: "Branch admin password changed (self-service)",
  hq_admin_password_changed_self_service: "HQ admin password changed (self-service)",
  platform_member_suspended: "Platform member suspended",
  platform_member_reactivated: "Platform member reactivated",
  platform_member_verified: "Platform member verified",
  platform_support_note_added: "Platform support note added",
  member_profile_updated: "Member profile updated",
  member_request_submitted: "Member request submitted",
  prayer_request_submitted: "Prayer request submitted",
  monthly_report_draft_saved: "Monthly report draft saved",
  monthly_report_submitted: "Monthly report submitted",
  hq_report_approved: "HQ approved monthly report",
  hq_report_changes_requested: "HQ requested report changes",
  attendance_record_submitted: "Attendance record submitted",
  leader_attendance_record_created: "Leader recorded ministry attendance",
  giving_summary_created: "Giving summary created",
  giving_summary_submitted: "Giving summary submitted",
  giving_settings_draft_saved: "Giving settings draft saved",
  giving_settings_published: "Giving settings published",
  website_draft_saved: "Website draft saved",
  website_published: "Website content published",
  announcement_created: "Announcement created",
  announcement_updated: "Announcement updated",
  announcement_published: "Announcement published",
  announcement_archived: "Announcement archived",
  event_created: "Event created",
  event_updated: "Event updated",
  event_published: "Event published",
  event_cancelled: "Event cancelled",
  ministry_created: "Ministry created",
  ministry_updated: "Ministry updated",
  ministry_published: "Ministry published",
  ministry_archived: "Ministry archived",
  department_created: "Department created",
  department_updated: "Department updated",
  department_activated: "Department activated",
  department_archived: "Department archived",
  duty_created: "Duty roster entry created",
  duty_updated: "Duty roster entry updated",
  duty_confirmed: "Duty confirmed",
  duty_cancelled: "Duty cancelled",
  ministry_leader_created: "Ministry leader created",
  ministry_leader_updated: "Ministry leader updated",
  ministry_leader_activated: "Ministry leader activated",
  ministry_leader_deactivated: "Ministry leader deactivated",
  ministry_leader_password_reset: "Ministry leader password reset",
  member_added_to_ministry: "Member added to ministry",
  ministry_activity_note_reviewed: "Ministry activity note reviewed",
  ministry_activity_follow_up_requested: "Ministry activity follow-up requested",
  leader_activity_note_saved: "Leader activity note saved",
  leader_activity_note_submitted: "Leader activity note submitted",
  hq_broadcast_created: "HQ broadcast created",
  hq_broadcast_updated: "HQ broadcast updated",
  hq_broadcast_published: "HQ broadcast published",
  hq_broadcast_archived: "HQ broadcast archived",
};

const ACTOR_TYPE_LABELS = {
  branch_admin: "Branch admin",
  hq_admin: "HQ admin",
  member: "Member",
  leader: "Leader",
  system: "System",
  public: "Public",
  platform_admin: "Platform admin",
};

const TARGET_TYPE_LABELS = {
  member: "Member",
  monthly_report: "Monthly report",
  attendance_record: "Attendance record",
  giving_summary: "Giving summary",
  announcement: "Announcement",
  event: "Event",
  ministry: "Ministry",
  department: "Department",
  duty: "Duty",
  ministry_leader: "Ministry leader",
  member_request: "Member request",
  prayer_request: "Prayer request",
  website_content: "Website content",
  giving_settings: "Giving settings",
  ministry_activity_note: "Ministry activity note",
  hq_broadcast: "HQ broadcast",
  ministry_join_request: "Ministry join request",
  password_reset_request: "Password reset request",
  branch_admin_password_reset_request: "Branch admin password reset request",
  hq_admin_password_reset_request: "HQ admin password reset request",
  password_reset_rate_limit: "Password reset rate limit",
};

function actionLabel(action) {
  if (!action) return "—";
  return ACTION_LABELS[action] || action.replace(/_/g, " ");
}

function actorTypeLabel(actorType) {
  return ACTOR_TYPE_LABELS[actorType] || actorType || "—";
}

function targetTypeLabel(entityType) {
  return TARGET_TYPE_LABELS[entityType] || entityType || "—";
}

function parseOptionalDate(value) {
  const raw = String(value || "").trim();
  if (!raw) return { ok: true, value: null };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    return { ok: false, error: "Date must be YYYY-MM-DD." };
  }
  const d = new Date(`${raw}T00:00:00`);
  if (Number.isNaN(d.getTime())) {
    return { ok: false, error: "Invalid date." };
  }
  return { ok: true, value: raw };
}

function parseAuditFilters(query) {
  const page = Math.max(Number(query && query.page) || 1, 1);
  const limit = Math.min(Math.max(Number(query && query.limit) || 50, 1), 100);
  const q = String((query && query.q) || "").trim();
  const action = String((query && query.action) || "").trim();
  const actionGroup = String((query && query.action_group) || "all").trim();
  const actorType = String((query && query.actor_type) || "").trim();
  const targetType = String((query && query.target_type) || "").trim();
  const branchIdRaw = query && query.branch_id;
  const branchId =
    branchIdRaw != null && String(branchIdRaw).trim() !== ""
      ? Number(branchIdRaw)
      : null;
  const organizationIdRaw = query && query.organization_id;
  const organizationId =
    organizationIdRaw != null && String(organizationIdRaw).trim() !== ""
      ? Number(organizationIdRaw)
      : null;
  const dateFrom = parseOptionalDate(query && query.date_from);
  const dateTo = parseOptionalDate(query && query.date_to);

  if (!dateFrom.ok) return { ok: false, error: dateFrom.error };
  if (!dateTo.ok) return { ok: false, error: dateTo.error };

  return {
    ok: true,
    filters: {
      page,
      limit,
      offset: (page - 1) * limit,
      q,
      action,
      actionGroup: AUDIT_ACTION_GROUPS.some((g) => g.id === actionGroup) ? actionGroup : "all",
      actorType: actorType && AUDIT_ACTOR_TYPES.includes(actorType) ? actorType : "",
      targetType: targetType || "",
      branchId: Number.isFinite(branchId) && branchId > 0 ? branchId : null,
      organizationId: Number.isFinite(organizationId) && organizationId > 0 ? organizationId : null,
      dateFrom: dateFrom.value,
      dateTo: dateTo.value,
    },
  };
}

function parseMetadata(raw) {
  if (!raw) return {};
  if (typeof raw === "object") return raw;
  try {
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

function targetLabelFromRow(row) {
  if (row.target_label) return row.target_label;
  const meta = parseMetadata(row.metadata_json);
  if (meta.title) return String(meta.title);
  if (meta.period_month) return String(meta.period_month);
  if (meta.period_month_label) return String(meta.period_month_label);
  if (row.entity_id != null) return `#${row.entity_id}`;
  return "—";
}

function actorDisplayFromRow(row) {
  if (row.actor_label) return row.actor_label;
  if (row.actor_name) return row.actor_name;
  if (row.actor_id != null) return `#${row.actor_id}`;
  return "—";
}

function auditSummary(row) {
  const label = actionLabel(row.action);
  const meta = parseMetadata(row.metadata_json);
  const parts = [label];
  if (meta.title) parts.push(`— ${meta.title}`);
  else if (meta.period_month_label) parts.push(`— ${meta.period_month_label}`);
  else if (meta.status) parts.push(`(${meta.status})`);
  return parts.join(" ");
}

function formatMetadataForDisplay(raw) {
  const meta = parseMetadata(raw);
  if (!meta || Object.keys(meta).length === 0) return "—";
  try {
    return JSON.stringify(meta, null, 2);
  } catch {
    return "—";
  }
}

function actionPatternsForGroup(groupId) {
  if (!groupId || groupId === "all") return null;
  return ACTION_GROUP_SQL[groupId] || null;
}

module.exports = {
  AUDIT_ACTOR_TYPES,
  AUDIT_ACTION_GROUPS,
  ACTION_GROUP_SQL,
  actionLabel,
  actorTypeLabel,
  targetTypeLabel,
  parseAuditFilters,
  parseMetadata,
  targetLabelFromRow,
  actorDisplayFromRow,
  auditSummary,
  formatMetadataForDisplay,
  actionPatternsForGroup,
};
