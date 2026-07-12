"use strict";

const fs = require("fs");
const path = require("path");

/**
 * Applies db/postgres/049_church_core.sql once at startup (idempotent DDL).
 * @param {import("pg").Pool} pool
 */
async function ensureChurchSchema(pool) {
  const base = path.join(__dirname, "../../../db/postgres");
  for (const file of [
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
  ]) {
    const sql = fs.readFileSync(path.join(base, file), "utf8");
    await pool.query(sql);
  }
}

module.exports = { ensureChurchSchema };
