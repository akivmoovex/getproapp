"use strict";

const fs = require("fs");
const path = require("path");
const ejs = require("ejs");
const test = require("node:test");
const assert = require("node:assert/strict");

const ROOT = path.join(__dirname, "..");

function readView(rel) {
  return fs.readFileSync(path.join(ROOT, rel), "utf8");
}

async function renderPartial(rel, locals) {
  const filename = path.join(ROOT, rel);
  const source = fs.readFileSync(filename, "utf8");
  return ejs.render(source, locals, { filename, views: [path.join(ROOT, "views")] });
}

test("scheduled reports: error alert uses error class and table has Actions header", () => {
  const src = readView("views/church/branch-admin/scheduled_reports.ejs");
  assert.doesNotMatch(src, /church-alert--danger/);
  assert.match(src, /church-alert--error/);
  assert.match(src, /<th scope="col">Actions<\/th>/);
  assert.match(src, /aria-label="View schedule for/);
  assert.match(src, /aria-label="Pause schedule for/);
});

test("scheduled report detail: Actions header and Retry aria-label", () => {
  const src = readView("views/church/branch-admin/scheduled_report_detail.ejs");
  assert.match(src, /<th scope="col">Actions<\/th>/);
  assert.match(src, /aria-label="Retry failed run/);
});

test("scheduled broadcasts: Actions header and contextual control names", () => {
  const src = readView("views/church/hq/scheduled_broadcasts.ejs");
  assert.match(src, /<th scope="col">Actions<\/th>/);
  assert.match(src, /aria-label="View scheduled broadcast/);
  assert.doesNotMatch(src, /<th><\/th>/);
});

test("cross-branch chart exposes text alternative without role=img", () => {
  const src = readView("views/church/hq/cross_branch_reports.ejs");
  assert.doesNotMatch(src, /role="img"/);
  assert.match(src, /<figure class="church-hq-bar-chart">/);
  assert.match(src, /<figcaption class="visually-hidden">/);
  assert.match(src, /<th scope="col">Actions<\/th>/);
  assert.match(src, /aria-label="Drill down into/);
});

test("audit trail: Actions header and View aria-label", () => {
  const src = readView("views/church/hq/audit_trail.ejs");
  assert.match(src, /<th scope="col">Actions<\/th>/);
  assert.match(src, /aria-label="View audit event/);
});

test("platform package/pilot/diagnostic errors use flash--error", () => {
  for (const rel of [
    "views/admin/church/organization_plan.ejs",
    "views/admin/church/organization_pilot_readiness.ejs",
    "views/admin/church/organization_support_diagnostic.ejs",
  ]) {
    const src = readView(rel);
    assert.match(src, /flash flash--error" role="alert"/, rel);
  }
});

test("pilot checklist Save controls include contextual aria-label", () => {
  const src = readView("views/admin/church/organization_pilot_readiness.ejs");
  assert.match(src, /ariaLabel: 'Save notes for ' \+ item\.label/);
  assert.match(src, /Incomplete<\/span>/);
  assert.match(src, /flash--error/);
});

test("quota warnings include non-colour band text for screen readers", async () => {
  const html = await renderPartial("views/church/partials/quota_warnings.ejs", {
    quotaWarnings: [
      {
        title: "Members near limit",
        message: "You are using 90% of member seats.",
        band: 90,
        meterKey: "members",
        alertClass: "church-alert--warning",
        role: "status",
      },
    ],
  });
  assert.match(html, /role="status"/);
  assert.match(html, /Usage band 90 percent/);
  assert.match(html, /Members near limit/);
});

test("failure state actions are in a labelled nav", () => {
  const src = readView("views/church/partials/failure_state_card.ejs");
  assert.match(src, /<nav class="church-unavailable__actions" aria-label="Next steps">/);
});

test("scoped portals allow mobile zoom (no maximum-scale=1)", () => {
  for (const rel of [
    "views/church/partials/branch_admin_shell_start.ejs",
    "views/church/partials/hq_shell_start.ejs",
    "views/church/partials/member_shell_start.ejs",
  ]) {
    const src = readView(rel);
    assert.doesNotMatch(src, /maximum-scale\s*=\s*1|user-scalable\s*=\s*no/i, rel);
    assert.match(src, /width=device-width/, rel);
  }
});

test("package usage summary uses semantic headings and status roles", () => {
  const src = readView("views/church/partials/package_usage_summary.ejs");
  assert.match(src, /<h2 class="church-branch-panel__title">Package/);
  assert.match(src, /role="status"/);
  assert.match(src, /<h3 class="church-branch-panel__subtitle">Current usage<\/h3>/);
});

test("keyboard focus styles exist for church buttons and inputs", () => {
  const css = readView("public/church/church.css");
  assert.match(css, /\.church-btn:focus-visible/);
  assert.match(css, /\.church-input:focus/);
  assert.match(css, /\.visually-hidden\s*\{/);
});
