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
  { id: "package", label: "Package events" },
  { id: "security", label: "Security events" },
];

const ACTION_GROUP_SQL = {
  members: ["member_%", "platform_member_%"],
  reports: ["monthly_report_%", "hq_report_%", "scheduled_report_%"],
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
  broadcasts: ["hq_broadcast_%", "scheduled_broadcast_%"],
  package: [
    "platform_package_%",
    "platform_church_plan_%",
    "platform_growth_trial_%",
    "package_%",
  ],
  security: [
    "%login_locked",
    "%password_reset%",
    "password_reset_request_rate_limited",
    "platform_login_%",
    "platform_member_password_%",
    "platform_support_diagnostic_%",
    "platform_pilot_readiness_%",
    "platform_demo_organisation_%",
    "platform_organization_data_environment_%",
    "platform_backup_%",
    "member_password_changed_self_service",
    "branch_admin_password_changed_self_service",
    "hq_admin_password_changed_self_service",
  ],
};

/** Branch admins must not see these even when branch_id is set. */
const BRANCH_RESTRICTED_ACTION_LIKE = Object.freeze([
  "platform_%",
  "package_%",
  "organization_inactivity_%",
  "organization_marked_dormant",
  "organization_reactivated_from_dormancy",
]);

const BRANCH_RESTRICTED_ACTOR_TYPES = Object.freeze(["platform_admin"]);

/** Safe export page size cap (no full-table dump). */
const AUDIT_EXPORT_MAX_ROWS = 500;

const ACTION_LABELS = {
  member_verified_by_admin: "Member verified",
  member_import_previewed: "Member import previewed",
  member_import_committed: "Member import committed",
  member_imported: "Member imported",
  member_import_reversed: "Member import reversed",
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
  prayer_request_acknowledged: "Prayer request acknowledged",
  prayer_request_assigned: "Prayer request assigned",
  prayer_request_follow_up: "Prayer follow-up recorded",
  prayer_request_reviewed: "Prayer request reviewed",
  prayer_request_closed: "Prayer request closed",
  pastoral_case_opened: "Pastoral case opened",
  pastoral_case_follow_up: "Pastoral follow-up recorded",
  pastoral_case_closed: "Pastoral case closed",
  pastoral_attachment_uploaded: "Pastoral attachment uploaded",
  safeguarding_incident_opened: "Safeguarding incident opened",
  monthly_report_draft_saved: "Monthly report draft saved",
  monthly_report_submitted: "Monthly report submitted",
  foundation_basic_report_exported: "Foundation basic report exported",
  hq_report_approved: "HQ approved monthly report",
  hq_report_changes_requested: "HQ requested report changes",
  attendance_record_submitted: "Attendance record submitted",
  attendance_session_opened: "Attendance session opened",
  attendance_session_closed: "Attendance session closed",
  attendance_check_in_recorded: "Attendance check-in recorded",
  attendance_check_in_corrected: "Attendance check-in corrected",
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
  announcement_attachment_uploaded: "Announcement attachment uploaded",
  announcement_attachment_deleted: "Announcement attachment deleted",
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
  ministry_join_request_submitted: "Ministry join request submitted",
  ministry_join_request_approved: "Ministry join request approved",
  ministry_join_request_rejected: "Ministry join request rejected",
  ministry_join_request_more_info_requested: "Ministry join request more info requested",
  ministry_join_request_leader_reviewed: "Ministry join request leader reviewed",
  ministry_activity_note_reviewed: "Ministry activity note reviewed",
  ministry_activity_follow_up_requested: "Ministry activity follow-up requested",
  leader_activity_note_saved: "Leader activity note saved",
  leader_activity_note_submitted: "Leader activity note submitted",
  hq_broadcast_created: "HQ broadcast created",
  hq_broadcast_updated: "HQ broadcast updated",
  hq_broadcast_published: "HQ broadcast published",
  hq_broadcast_archived: "HQ broadcast archived",
  hq_broadcast_attachment_deleted: "HQ broadcast attachment deleted",
  platform_church_organization_created: "Organization created",
  platform_church_organization_updated: "Organization updated",
  platform_church_organization_suspended: "Organization suspended",
  platform_church_organization_reactivated: "Organization reactivated",
  platform_church_organization_archived: "Organization archived",
  organization_inactivity_first_warning: "Inactivity first warning",
  organization_inactivity_final_warning: "Inactivity final warning",
  organization_marked_dormant: "Organization marked dormant",
  organization_reactivated_from_dormancy: "Organization reactivated from dormancy",
  platform_church_organization_slug_changed: "Organization slug changed",
  platform_church_plan_updated: "Organization plan updated",
  platform_package_assigned: "Package assigned",
  platform_background_job_retry: "Background job retried",
  platform_background_job_cancelled: "Background job cancelled",
  platform_notification_template_updated: "Notification template updated",
  notification_template_override_saved: "Notification template override saved",
  notification_template_override_restored: "Notification template default restored",
  notification_template_test_sent: "Notification template test delivery recorded",
  platform_support_diagnostic_viewed: "Support diagnostic viewed",
  platform_support_diagnostic_exported: "Support diagnostic exported",
  platform_pilot_readiness_note_updated: "Pilot readiness note updated",
  platform_pilot_readiness_approved: "Pilot readiness approved",
  platform_demo_organisation_reset: "Demo organisation content reset",
  platform_organization_data_environment_updated: "Organisation data environment updated",
  platform_backup_verification_recorded: "Backup verification recorded",
  platform_backup_restoration_test_recorded: "Backup restoration test recorded",
  platform_package_assignment_previewed: "Package assignment previewed",
  platform_growth_trial_granted: "Growth trial granted",
  platform_growth_trial_reminder: "Growth trial reminder",
  platform_growth_trial_expired: "Growth trial expired",
  platform_growth_trial_config_retention_ended: "Growth trial config retention ended",
  package_feature_denied: "Package feature denied",
  package_quota_member_blocked: "Member seat quota blocked",
  package_quota_admin_blocked: "Admin seat quota blocked",
  package_quota_storage_blocked: "Storage quota blocked",
  package_quota_external_email_blocked: "External email quota blocked",
  package_quota_scheduled_report_blocked: "Scheduled report quota blocked",
  platform_church_branch_created: "Branch created",
  platform_church_branch_updated: "Branch updated",
  platform_church_branch_suspended: "Branch suspended",
  platform_church_branch_reactivated: "Branch reactivated",
  platform_church_branch_archived: "Branch archived",
  platform_church_branch_host_slug_changed: "Branch host slug changed",
  platform_church_hq_admin_created: "HQ admin created",
  platform_church_hq_admin_updated: "HQ admin updated",
  platform_church_hq_admin_activated: "HQ admin activated",
  platform_church_hq_admin_deactivated: "HQ admin deactivated",
  platform_church_hq_admin_password_reset: "HQ admin password reset",
  platform_church_branch_admin_created: "Branch admin created",
  platform_church_branch_admin_updated: "Branch admin updated",
  platform_church_branch_admin_activated: "Branch admin activated",
  platform_church_branch_admin_deactivated: "Branch admin deactivated",
  platform_church_branch_admin_password_reset: "Branch admin password reset",
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
  attendance_session: "Attendance session",
  attendance_check_in: "Attendance check-in",
  giving_summary: "Giving summary",
  announcement: "Announcement",
  event: "Event",
  ministry: "Ministry",
  department: "Department",
  duty: "Duty",
  ministry_leader: "Ministry leader",
  member_request: "Member request",
  prayer_request: "Prayer request",
  pastoral_case: "Pastoral case",
  safeguarding_incident: "Safeguarding incident",
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
  const action = String((query && query.action) || "").trim().slice(0, 128);
  const actionGroup = String((query && query.action_group) || "all").trim();
  const actorType = String((query && query.actor_type) || "").trim();
  const targetType = String((query && query.target_type) || "").trim();
  const actorIdRaw = query && (query.actor_id != null ? query.actor_id : query.user);
  const actorId =
    actorIdRaw != null && String(actorIdRaw).trim() !== "" ? Number(actorIdRaw) : null;
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
      actorId: Number.isFinite(actorId) && actorId > 0 ? actorId : null,
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

function entityIdentifierFromRow(row) {
  if (row == null || row.entity_id == null || row.entity_id === "") return "—";
  return String(row.entity_id);
}

/**
 * Compact label for tables: "member 42" or entity type alone when no id.
 */
function entityDisplayFromRow(row) {
  const type = targetTypeLabel(row && row.entity_type);
  const id = entityIdentifierFromRow(row);
  if (id === "—") return type === "—" ? "—" : type;
  return `${type} ${id}`;
}

function packageChangeFromRow(row) {
  const meta = parseMetadata(row && row.metadata_json);
  const previous =
    meta.previous_package ||
    meta.previous_package_code ||
    meta.previous_plan ||
    null;
  const next = meta.new_package || meta.new_package_code || meta.new_plan || null;
  if (previous && next) return `${previous} → ${next}`;
  if (next) return String(next);
  if (meta.package_code) return String(meta.package_code);
  if (meta.feature_id) return String(meta.feature_id);
  return "—";
}

function reasonFromRow(row) {
  const meta = parseMetadata(row && row.metadata_json);
  if (meta.reason != null && String(meta.reason).trim()) return String(meta.reason).slice(0, 500);
  if (meta.defer_reason != null && String(meta.defer_reason).trim()) {
    return String(meta.defer_reason).slice(0, 500);
  }
  return "—";
}

function resultFromRow(row) {
  const meta = parseMetadata(row && row.metadata_json);
  if (meta.result != null && String(meta.result).trim()) return String(meta.result).slice(0, 200);
  if (meta.status != null && String(meta.status).trim()) return String(meta.status).slice(0, 200);
  if (meta.outcome != null && String(meta.outcome).trim()) return String(meta.outcome).slice(0, 200);
  return "—";
}

const SENSITIVE_METADATA_KEYS = new Set([
  "password",
  "password_hash",
  "new_password",
  "current_password",
  "confirm_password",
  "temporary_password",
  "token",
  "access_token",
  "refresh_token",
  "csrf",
  "_csrf",
  "csrf_token",
  "cookie",
  "cookies",
  "session",
  "session_id",
  "secret",
  "secret_answer",
  "raw_body",
  "request_body",
  "database_url",
  "databaseUrl",
  "env",
  "environment",
  "note",
  "notes",
  "body",
  "content",
  "admin_note",
  "pastoral_note",
  "pastoral_content",
  "care_note",
  "care_notes",
  "support_note",
  "support_note_body",
  "prayer_text",
  "prayer_content",
  "prayer_request_text",
  "prayer_details",
  "note_body",
  "notes_confidential",
  "confidential_note",
  "raw_csv",
  "csv_content",
  "row_payload",
]);

/** Commercial / operational keys that must remain visible despite "_note" suffixes. */
const SENSITIVE_METADATA_ALLOWLIST = new Set([
  "plan_notes",
  "quota_key",
  "feature_id",
  "entitlement_key",
  "history_id",
  "trial_id",
]);

function isSensitiveMetadataKey(key) {
  const normalized = String(key).toLowerCase().replace(/[\s-]+/g, "_");
  if (SENSITIVE_METADATA_ALLOWLIST.has(normalized)) return false;
  if (SENSITIVE_METADATA_KEYS.has(normalized)) return true;
  if (normalized.includes("password")) return true;
  if (normalized.includes("token")) return true;
  if (normalized.includes("csrf")) return true;
  if (normalized.includes("cookie")) return true;
  if (normalized.includes("secret")) return true;
  if (normalized.includes("session_id")) return true;
  if (normalized.includes("database_url")) return true;
  if (normalized.includes("pastoral")) return true;
  if (normalized.includes("prayer")) return true;
  if (normalized.includes("confiden")) return true;
  if (normalized.includes("care_note") || normalized.includes("care_notes")) return true;
  if (normalized.endsWith("_note") || normalized.endsWith("_notes") || normalized.includes("_note_")) {
    return true;
  }
  return false;
}

function sanitizeMetadataForDisplay(value, depth) {
  if (depth > 6) return "[omitted]";
  if (value == null) return value;
  if (Array.isArray(value)) {
    return value.map((item) => sanitizeMetadataForDisplay(item, depth + 1));
  }
  if (typeof value !== "object") return value;
  const out = {};
  for (const [key, nested] of Object.entries(value)) {
    if (isSensitiveMetadataKey(key)) continue;
    out[key] = sanitizeMetadataForDisplay(nested, depth + 1);
  }
  return out;
}

function formatMetadataForDisplay(raw) {
  const meta = sanitizeMetadataForDisplay(parseMetadata(raw), 0);
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

function likePatternToRegExp(pattern) {
  const escaped = String(pattern).replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/%/g, ".*");
  return new RegExp(`^${escaped}$`, "i");
}

function isBranchRestrictedAuditRow(row) {
  if (!row) return true;
  const actorType = String(row.actor_type || "");
  if (BRANCH_RESTRICTED_ACTOR_TYPES.includes(actorType)) return true;
  const action = String(row.action || "");
  return BRANCH_RESTRICTED_ACTION_LIKE.some((pattern) => likePatternToRegExp(pattern).test(action));
}

function csvEscape(value) {
  const s = value == null ? "" : String(value);
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function auditRowToSafeExportObject(row) {
  const meta = sanitizeMetadataForDisplay(parseMetadata(row.metadata_json), 0);
  return {
    timestamp: row.created_at ? new Date(row.created_at).toISOString() : "",
    organization: row.organization_name || "",
    branch: row.branch_name || "",
    acting_user: actorDisplayFromRow(row),
    actor_type: row.actor_type || "",
    action: row.action || "",
    action_label: actionLabel(row.action),
    entity_type: row.entity_type || "",
    entity_id: row.entity_id != null ? String(row.entity_id) : "",
    package_change: packageChangeFromRow(row) === "—" ? "" : packageChangeFromRow(row),
    reason: reasonFromRow(row) === "—" ? "" : reasonFromRow(row),
    result: resultFromRow(row) === "—" ? "" : resultFromRow(row),
    ip_address: row.ip_address || "",
    // Deliberately omit user_agent and sanitized metadata dump from CSV for minimal surface.
    metadata_safe: Object.keys(meta || {}).length ? JSON.stringify(meta) : "",
  };
}

function buildAuditExportCsv(rows) {
  const headers = [
    "timestamp",
    "organization",
    "branch",
    "acting_user",
    "actor_type",
    "action",
    "action_label",
    "entity_type",
    "entity_id",
    "package_change",
    "reason",
    "result",
    "ip_address",
  ];
  const lines = [headers.join(",")];
  for (const row of rows || []) {
    const obj = auditRowToSafeExportObject(row);
    lines.push(headers.map((h) => csvEscape(obj[h])).join(","));
  }
  return `${lines.join("\n")}\n`;
}

module.exports = {
  AUDIT_ACTOR_TYPES,
  AUDIT_ACTION_GROUPS,
  ACTION_GROUP_SQL,
  BRANCH_RESTRICTED_ACTION_LIKE,
  BRANCH_RESTRICTED_ACTOR_TYPES,
  AUDIT_EXPORT_MAX_ROWS,
  actionLabel,
  actorTypeLabel,
  targetTypeLabel,
  parseAuditFilters,
  parseMetadata,
  targetLabelFromRow,
  actorDisplayFromRow,
  auditSummary,
  entityIdentifierFromRow,
  entityDisplayFromRow,
  packageChangeFromRow,
  reasonFromRow,
  resultFromRow,
  formatMetadataForDisplay,
  sanitizeMetadataForDisplay,
  actionPatternsForGroup,
  isBranchRestrictedAuditRow,
  auditRowToSafeExportObject,
  buildAuditExportCsv,
};
