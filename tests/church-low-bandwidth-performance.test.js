"use strict";

/**
 * Low-bandwidth checks for newly added BlessBoard Growth/Foundation screens.
 * Keeps server-rendered architecture; asserts pagination, table-first defaults,
 * and no unbounded delivery/import HTML payloads.
 */

const fs = require("fs");
const path = require("path");
const ejs = require("ejs");
const test = require("node:test");
const assert = require("node:assert/strict");

const ROOT = path.join(__dirname, "..");

function readView(rel) {
  return fs.readFileSync(path.join(ROOT, rel), "utf8");
}

test("cross-branch route defaults to table-first viewMode", () => {
  const src = fs.readFileSync(
    path.join(ROOT, "src/routes/church/hqAdminCrossBranchReports.js"),
    "utf8"
  );
  assert.match(src, /view \|\| ["']table["']/);
  assert.doesNotMatch(src, /view \|\| ["']chart["']/);
});

test("cross-branch: table is always present; chart only when viewMode=chart", () => {
  const src = readView("views/church/hq/cross_branch_reports.ejs");
  assert.match(src, /data-cross-branch-table/);
  assert.match(src, /<% if \(viewMode === 'chart'\)/);
  assert.match(src, /Comparison table/);
  // Chart CSS is scoped inside chart branch (not always shipped).
  assert.match(src, /viewMode === 'chart'[\s\S]*church-hq-bar-chart__bar/);
});

test("cross-branch rendered HTML: default table mode omits chart DOM", async () => {
  // Render only the comparison sections by evaluating the view with shell stubs replaced.
  const filename = path.join(ROOT, "views/church/hq/cross_branch_reports.ejs");
  let source = fs.readFileSync(filename, "utf8");
  source = source
    .replace("<%- include('../partials/hq_shell_start') %>", "<!-- shell start -->")
    .replace("<%- include('../partials/hq_shell_end') %>", "<!-- shell end -->");

  const baseLocals = {
    filters: {
      dateFrom: "2026-01-01",
      dateTo: "2026-01-31",
      branchId: null,
      serviceType: "",
      ministryId: null,
      departmentId: null,
    },
    comparison: {
      totals: {
        branch_count: 2,
        active_members: 10,
        monthly_attendance: 20,
        visitors: 3,
        event_registrations: 1,
        event_attendance: 1,
        open_pastoral_follow_ups: 0,
        overdue_pastoral_cases: 0,
        giving_total: 0,
      },
      rows: [
        {
          branch_id: 1,
          branch_name: "Main",
          active_members: 7,
          monthly_attendance: 12,
          visitors: 2,
          event_registrations: 1,
          event_attendance: 1,
          open_pastoral_follow_ups: 0,
          overdue_pastoral_cases: 0,
          giving_total: 0,
        },
      ],
      chart: { active_members: [7] },
      kpiDefinitions: {
        active_members: { label: "Active members", definition: "Verified members." },
      },
      filters: {
        dateFrom: "2026-01-01",
        dateTo: "2026-01-31",
        branchId: null,
        serviceType: "",
        ministryId: null,
        departmentId: null,
      },
    },
    canViewFinance: false,
    branches: [],
    ministries: [],
    departments: [],
    formatMoney: (n) => String(n),
  };

  const tableHtml = ejs.render(source, { ...baseLocals, viewMode: "table" }, { filename });
  assert.match(tableHtml, /data-cross-branch-table/);
  assert.doesNotMatch(tableHtml, /data-cross-branch-chart/);
  assert.match(tableHtml, /Comparison table/);
  assert.doesNotMatch(tableHtml, /church-hq-bar-chart__bar/);

  const chartHtml = ejs.render(source, { ...baseLocals, viewMode: "chart" }, { filename });
  assert.match(chartHtml, /data-cross-branch-chart/);
  assert.match(chartHtml, /data-cross-branch-table/);
  assert.ok(chartHtml.length > tableHtml.length, "chart mode should include extra chart markup");
});

test("scheduled reports list route does not N+1 listRunsForSchedule", () => {
  const src = fs.readFileSync(
    path.join(ROOT, "src/routes/church/branchAdminScheduledReports.js"),
    "utf8"
  );
  // List GET must not loop listRunsForSchedule (detail page still may batch-load).
  const listFn = src.match(
    /router\.get\(\s*"\/branch\/scheduled-reports"[\s\S]*?router\.post\(\s*"\/branch\/scheduled-reports"/
  );
  assert.ok(listFn, "expected scheduled-reports list route");
  assert.doesNotMatch(listFn[0], /listRunsForSchedule/);
  assert.match(src, /listDeliveriesForSchedule/);
});

test("scheduled report schedules query is limited", () => {
  const src = fs.readFileSync(
    path.join(ROOT, "src/services/church/scheduledReportService.js"),
    "utf8"
  );
  assert.match(src, /async function listSchedulesForBranch[\s\S]*LIMIT \$3 OFFSET \$4/);
  assert.match(src, /async function listDeliveriesForSchedule[\s\S]*COUNT\(\*\)/);
});

test("broadcast deliveries are paginated (not unbounded)", () => {
  const svc = fs.readFileSync(
    path.join(ROOT, "src/services/church/scheduledBroadcastService.js"),
    "utf8"
  );
  assert.match(svc, /async function listDeliveries[\s\S]*LIMIT \$3 OFFSET \$4/);
  assert.match(svc, /totalPages/);

  const view = readView("views/church/hq/scheduled_broadcast_detail.ejs");
  assert.match(view, /data-delivery-pagination/);
  assert.match(view, /Delivery results pages/);
});

test("member import UI detail paginates and omits payload by default", () => {
  const svc = fs.readFileSync(
    path.join(ROOT, "src/services/church/churchMemberImportService.js"),
    "utf8"
  );
  assert.match(svc, /includePayload/);
  assert.match(svc, /paginate/);
  assert.match(svc, /LIMIT \$2 OFFSET \$3/);

  const route = fs.readFileSync(
    path.join(ROOT, "src/routes/church/branchAdminMemberImport.js"),
    "utf8"
  );
  assert.match(route, /limit:\s*75/);

  const summary = readView("views/church/branch-admin/member_import_summary.ejs");
  assert.doesNotMatch(summary, /JSON\.stringify/);
  assert.match(summary, /data-import-pagination/);
  assert.match(summary, /commit\.created/);
});

test("package feature locals reuse req.churchPackagePlan (no duplicate plan fetch)", () => {
  const src = fs.readFileSync(
    path.join(ROOT, "src/services/church/churchPackageFeatureGateService.js"),
    "utf8"
  );
  assert.match(
    src,
    /attachPackageFeatureLocals[\s\S]*req\.churchPackagePlan \|\| \(await loadPlanForReq\(req\)\)/
  );

  const hq = fs.readFileSync(path.join(ROOT, "src/routes/church/hqAdminShared.js"), "utf8");
  assert.match(hq, /req\.churchPackagePlan/);
  const branch = fs.readFileSync(
    path.join(ROOT, "src/routes/church/branchAdminShared.js"),
    "utf8"
  );
  assert.match(branch, /req\.churchPackagePlan/);
});

test("new Growth screens have no client auto-refresh or fetch polling", () => {
  const files = [
    "views/church/hq/cross_branch_reports.ejs",
    "views/church/hq/scheduled_broadcasts.ejs",
    "views/church/hq/scheduled_broadcast_detail.ejs",
    "views/church/branch-admin/scheduled_reports.ejs",
    "views/church/branch-admin/scheduled_report_detail.ejs",
    "views/church/partials/package_usage_summary.ejs",
    "views/church/branch-admin/member_import_review.ejs",
    "views/church/branch-admin/member_import_summary.ejs",
  ];
  for (const rel of files) {
    const src = readView(rel);
    assert.doesNotMatch(src, /setInterval\s*\(/, rel);
    assert.doesNotMatch(src, /meta[^>]+http-equiv=["']refresh["']/i, rel);
    assert.doesNotMatch(src, /\bfetch\s*\(/, rel);
  }
});

test("listDeliveries returns paged object shape", async () => {
  const { isPgConfigured, getPgPool } = require("../src/db/pg/pool");
  if (!isPgConfigured()) {
    assert.ok(true, "skip without PG");
    return;
  }
  // Shape contract without requiring seeded deliveries.
  const scheduledBroadcastService = require("../src/services/church/scheduledBroadcastService");
  const pool = getPgPool();
  const listed = await scheduledBroadcastService.listDeliveries(pool, -1, -1, {
    page: 1,
    limit: 10,
  });
  assert.equal(typeof listed, "object");
  assert.ok(Array.isArray(listed.rows));
  assert.equal(listed.page, 1);
  assert.equal(listed.limit, 10);
  assert.equal(listed.total, 0);
  assert.equal(listed.totalPages, 1);
});
