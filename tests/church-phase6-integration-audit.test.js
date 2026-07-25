"use strict";

/**
 * Phase 6 integration audit — static route/view/nav/CSS hooks for all eight screens.
 * PG behavioral coverage lives in church-phase6-members-directory-verification.test.js
 * and church-phase6-attendance-tracker.test.js.
 */

const fs = require("fs");
const path = require("path");
const test = require("node:test");
const assert = require("node:assert/strict");

const ROOT = path.join(__dirname, "..");

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), "utf8");
}

test("Phase 6 eight screens have responsive Branch Admin views and Stitch hooks", () => {
  const verification = read("views/church/partials/phase6_verification_queue_body.ejs");
  const directory = read("views/church/partials/phase6_members_directory_body.ejs");
  const tracker = read("views/church/partials/phase6_attendance_tracker_body.ejs");
  const detail = read("views/church/partials/phase6_attendance_record_detail_body.ejs");

  assert.match(verification, /data-p6-screen="verification-queue"/);
  assert.match(verification, /data-testid="verification-table"/);
  assert.match(verification, /data-testid="verification-cards"/);
  assert.match(verification, /data-testid="verification-empty"/);

  assert.match(directory, /data-p6-screen="member-directory"/);
  assert.match(directory, /data-testid="directory-table"/);
  assert.match(directory, /data-testid="directory-cards"/);
  assert.match(directory, /data-testid="directory-empty"/);

  assert.match(tracker, /data-p6-screen="attendance-tracker"/);
  assert.match(tracker, /data-responsive="desktop-mobile"/);
  assert.match(tracker, /data-testid="attendance-table"/);
  assert.match(tracker, /data-testid="attendance-cards"/);
  assert.match(tracker, /data-testid="attendance-empty"/);
  assert.match(tracker, /aria-busy=/);

  assert.match(detail, /data-p6-screen="attendance-record-detail"/);
  assert.match(detail, /data-responsive="desktop-mobile"/);
  assert.match(detail, /data-testid="attendance-detail-back"/);
  assert.match(detail, /data-testid="attendance-detail-breakdown"/);
  assert.match(detail, /data-testid="attendance-detail-members-empty"/);
  assert.match(detail, /aria-busy=/);
  assert.doesNotMatch(detail, /\+12%|Sunny|Weather|Present|Absent|Late|Excused/);
});

test("Phase 6 wrappers wire Branch and HQ shells without duplicate modules", () => {
  assert.match(read("views/church/branch-admin/verification_queue.ejs"), /phase6_verification_queue_body/);
  assert.match(read("views/church/hq/verification_queue.ejs"), /phase6_verification_queue_body/);
  assert.match(read("views/church/branch-admin/members_directory.ejs"), /phase6_members_directory_body/);
  assert.match(read("views/church/hq/members_directory.ejs"), /phase6_members_directory_body/);
  assert.match(read("views/church/branch-admin/attendance_tracker.ejs"), /phase6_attendance_tracker_body/);
  assert.match(read("views/church/hq/attendance_tracker.ejs"), /phase6_attendance_tracker_body/);
  assert.match(read("views/church/branch-admin/attendance_record_detail.ejs"), /phase6_attendance_record_detail_body/);
  assert.match(read("views/church/hq/attendance_record_detail.ejs"), /phase6_attendance_record_detail_body/);

  const branchAttendance = read("src/routes/church/branchAdminAttendance.js");
  const hqAttendance = read("src/routes/church/hqAdminAttendance.js");
  assert.match(branchAttendance, /\/branch\/attendance/);
  assert.match(branchAttendance, /\/branch\/attendance\/:recordId\/update/);
  assert.match(hqAttendance, /\/hq\/attendance/);
  assert.match(hqAttendance, /findAttendanceRecordByIdForOrganization/);
  assert.doesNotMatch(hqAttendance, /saveAttendanceRecordForBranch|createAttendanceRecord/);
});

test("Phase 6 navigation: Attendance and Giving remain separate; active nav keys exist", () => {
  const nav = read("views/church/partials/branch_admin_nav.ejs");
  const shell = read("views/church/partials/branch_admin_shell_start.ejs");
  const hqShell = read("views/church/partials/hq_shell_start.ejs");
  const shared = read("src/routes/church/branchAdminShared.js");
  const hqShared = read("src/routes/church/hqAdminShared.js");

  assert.match(nav, /data-testid="nav-attendance"/);
  assert.match(nav, /href="\/branch\/attendance"/);
  assert.match(nav, /data-testid="nav-giving"/);
  assert.match(nav, /href="\/branch\/giving-summary"/);
  assert.doesNotMatch(nav, /data-testid="nav-giving"[^]*href="\/branch\/attendance/);

  assert.match(shell, /href="\/branch\/giving-summary"/);
  assert.match(shell, /data-testid="nav-more-giving"/);
  assert.match(hqShell, /href="\/hq\/attendance"/);

  assert.match(shared, /startsWith\("\/branch\/attendance"\)\)\s*return "attendance"/);
  assert.match(shared, /giving-summary/);
  assert.match(hqShared, /\/hq\/attendance/);
});

test("Phase 6 CSS is scoped to branch/HQ admin bodies and shells bump cache", () => {
  const css = read("public/church/church.css");
  assert.match(css, /\.church-body--branch-admin \.church-p6-attendance/);
  assert.match(css, /\.church-body--hq-admin \.church-p6-attendance-detail/);
  assert.match(css, /\.church-body--branch-admin \.church-p6-page-hero/);
  assert.match(css, /\.church-body--branch-admin \.church-p6-giving-settings/);
  assert.doesNotMatch(css, /^\.church-p6-attendance\s*\{/m);

  const branchShell = read("views/church/partials/branch_admin_shell_start.ejs");
  const hqShell = read("views/church/partials/hq_shell_start.ejs");
  assert.match(branchShell, /church\.css\?v=54/);
  assert.match(hqShell, /church\.css\?v=54/);
});

test("Phase 6 Giving Summary + Settings screens are wired without duplicate modules", () => {
  assert.match(read("views/church/branch-admin/giving_summary.ejs"), /phase6_giving_summary_body/);
  assert.match(read("views/church/hq/giving_summary.ejs"), /phase6_giving_summary_body/);
  assert.match(read("views/church/branch-admin/giving_settings.ejs"), /phase6_giving_settings_body/);
  assert.match(read("views/church/partials/phase6_giving_settings_body.ejs"), /data-p6-screen="giving-settings"/);
  assert.match(read("views/church/partials/phase6_giving_summary_body.ejs"), /data-p6-screen="giving-summary"/);

  const settingsRoute = read("src/routes/church/branchAdminGivingSettings.js");
  assert.match(settingsRoute, /requireChurchSessionCsrf/);
  assert.match(settingsRoute, /validateGivingSettingsFields/);
  assert.doesNotMatch(settingsRoute, /sk_live|webhook_secret/);

  const nav = read("views/church/partials/branch_admin_nav.ejs");
  assert.match(nav, /data-testid="nav-giving-settings"/);
  assert.match(nav, /href="\/branch\/giving-settings"/);
});

test("Phase 6 uses classic /branch/attendance routes (not a second subsystem)", () => {
  const branchAttendance = read("src/routes/church/branchAdminAttendance.js");
  assert.match(branchAttendance, /router\.(get|post)\("\/branch\/attendance/);
  assert.doesNotMatch(branchAttendance, /router\.(get|post)\("\/branch-admin\/attendance/);
  assert.match(read("src/routes/church/hqAdmin.js"), /hqAdminAttendance/);
});
