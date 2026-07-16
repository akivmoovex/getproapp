"use strict";

const fs = require("fs");
const path = require("path");

/** Ordered church schema SQL files applied by ensureChurchSchema (idempotent DDL). */
const CHURCH_SCHEMA_MIGRATION_FILES = Object.freeze([
  "049_church_core.sql",
  "050_church_member_auth.sql",
  "051_church_branch_admin_auth.sql",
  "052_church_attendance_giving.sql",
  "053_church_monthly_reports.sql",
  "054_church_hq_admin_auth.sql",
  "055_church_member_portal.sql",
  "056_church_branch_request_processing.sql",
  "057_church_announcements_events_admin.sql",
  "058_church_website_content.sql",
  "059_church_giving_settings.sql",
  "060_church_ministries_departments.sql",
  "061_church_duty_roster.sql",
  "062_church_ministry_leaders.sql",
  "063_church_ministry_activity_review.sql",
  "064_church_leader_management.sql",
  "065_church_ministry_join_requests.sql",
  "066_church_member_directory_enhancements.sql",
  "067_church_hq_branch_registry.sql",
  "068_church_hq_broadcasts.sql",
  "069_church_audit_timeline.sql",
  "070_church_platform_provisioning.sql",
  "071_church_plan_limits_lite.sql",
  "072_church_branch_host_slug.sql",
  "073_church_status_management.sql",
  "074_church_platform_branch_admin_management.sql",
  "075_church_platform_hq_admin_management.sql",
  "076_church_platform_member_support_actions.sql",
  "077_church_platform_support_notes.sql",
  "078_church_member_account_security.sql",
  "079_church_branch_admin_account_security.sql",
  "080_church_hq_admin_account_security.sql",
  "081_church_login_attempt_protection.sql",
  "082_church_member_password_reset_requests.sql",
  "083_church_branch_admin_password_reset_requests.sql",
  "084_church_hq_admin_password_reset_requests.sql",
  "085_church_password_reset_rate_limits.sql",
  "086_church_platform_support_notes_ministry_leader.sql",
  "087_church_platform_ministry_leader_support_actions.sql",
  "088_church_ministry_leader_password_reset_requests.sql",
  "089_church_sermons_resources.sql",
  "090_church_operational_readiness.sql",
  "091_church_broadcast_announcement_enhancements.sql",
  "092_church_broadcast_delivery_analytics.sql",
  "093_church_ministry_join_leader_recommendation.sql",
  "094_church_platform_inquiries.sql",
  "095_church_branch_lifecycle.sql",
  "096_church_member_branch_history.sql",
  "097_church_package_usage.sql",
  "098_church_growth_billing.sql",
  "099_church_growth_trials.sql",
  "100_church_scheduled_reports.sql",
  "101_church_scheduled_broadcasts.sql",
  "102_church_hq_finance_permission.sql",
  "103_church_organization_dormancy.sql",
  "104_church_member_import_batches.sql",
  "105_church_notification_templates.sql",
  "106_church_pilot_readiness.sql",
  "107_church_organization_data_environment.sql",
  "108_church_backup_verification.sql",
  "109_church_release_register.sql",
  "110_church_pilot_feature_flags.sql",
  "111_church_branch_admin_report_permissions.sql",
  "112_church_foundation_attendance_check_ins.sql",
  "113_church_foundation_pastoral_care.sql",
  "114_church_growth_advanced_attendance.sql",
  "115_church_growth_pastoral_automation.sql",
  "116_church_growth_appointments_surveys.sql",
  "117_church_growth_groups_discipleship_volunteers.sql",
  "118_church_growth_advanced_events.sql",
  "119_church_growth_advanced_reporting.sql",
  "120_church_growth_communication_controls.sql",
  "121_church_database_identity.sql",
  "122_church_members_organization_status_index.sql",
  "123_church_account_security_version.sql",
]);

/**
 * Applies db/postgres/049_church_core.sql once at startup (idempotent DDL).
 * @param {import("pg").Pool} pool
 */
async function ensureChurchSchema(pool) {
  const base = path.join(__dirname, "../../../db/postgres");
  for (const file of CHURCH_SCHEMA_MIGRATION_FILES) {
    const sql = fs.readFileSync(path.join(base, file), "utf8");
    await pool.query(sql);
  }
}

function latestChurchSchemaMigration() {
  return CHURCH_SCHEMA_MIGRATION_FILES[CHURCH_SCHEMA_MIGRATION_FILES.length - 1] || null;
}

module.exports = {
  ensureChurchSchema,
  CHURCH_SCHEMA_MIGRATION_FILES,
  latestChurchSchemaMigration,
};
