"use strict";

/**
 * V2.04 Phase 1 — BB Stitch shared UI primitives.
 * Platform gp-ops stays product-neutral; BB wrappers may carry Church ID wording.
 */

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const ejs = require("ejs");

const ROOT = path.resolve(__dirname, "..");
const PLATFORM_PARTIALS = path.join(ROOT, "views/platform/partials");
const BB_V204 = path.join(ROOT, "views/blessboard/v5/partials/v204");

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), "utf8");
}

function renderPartial(absPath, locals) {
  return ejs.render(fs.readFileSync(absPath, "utf8"), locals || {}, {
    filename: absPath,
    views: [path.dirname(absPath), PLATFORM_PARTIALS],
  });
}

const NEW_PLATFORM_PARTIALS = [
  "gp-ops-page-header.ejs",
  "gp-ops-form-section.ejs",
  "gp-ops-field.ejs",
  "gp-ops-search-input.ejs",
  "gp-ops-banner.ejs",
  "gp-ops-match-card.ejs",
  "gp-ops-confirm-dialog.ejs",
  "gp-ops-loading-state.ejs",
  "gp-ops-success-state.ejs",
];

const REUSED_PLATFORM_PARTIALS = [
  "gp-ops-status-badge.ejs",
  "gp-ops-filter-bar.ejs",
  "gp-ops-status-tabs.ejs",
  "gp-ops-empty-state.ejs",
  "gp-ops-timeline.ejs",
  "gp-ops-card.ejs",
  "phone-field.ejs",
];

const BB_WRAPPERS = [
  "page-header.ejs",
  "status-chip.ejs",
  "duplicate-warning-banner.ejs",
  "person-match-card.ejs",
  "confirm-dialog.ejs",
  "empty-state.ejs",
  "loading-state.ejs",
  "success-state.ejs",
  "form-section.ejs",
  "field.ejs",
  "audit-timeline.ejs",
  "filter-bar.ejs",
];

const FORBIDDEN_PLATFORM_SEMANTICS =
  /Church ID|church id|ministry|member_number|portal_status|membership_status|Sacred Modernity/i;

describe("V2.04 BB shared UI primitives", () => {
  it("ships new + reused platform partials and dialog helper", () => {
    for (const name of NEW_PLATFORM_PARTIALS.concat(REUSED_PLATFORM_PARTIALS)) {
      assert.ok(
        fs.existsSync(path.join(PLATFORM_PARTIALS, name)),
        `missing platform partial ${name}`
      );
    }
    assert.ok(fs.existsSync(path.join(ROOT, "public/platform/gp-ops-shared.css")));
    assert.ok(fs.existsSync(path.join(ROOT, "public/platform/gp-ops-dialog.js")));
    const dialogJs = read("public/platform/gp-ops-dialog.js");
    assert.match(dialogJs, /GpOpsDialog/);
    assert.match(dialogJs, /data-gp-ops-dialog/);
    assert.doesNotMatch(dialogJs, FORBIDDEN_PLATFORM_SEMANTICS);
  });

  it("platform CSS covers new primitives with theme tokens (no BB violet hardcode)", () => {
    const css = read("public/platform/gp-ops-shared.css");
    for (const sel of [
      ".gp-ops-page-header",
      ".gp-ops-form-section",
      ".gp-ops-field",
      ".gp-ops-search",
      ".gp-ops-banner",
      ".gp-ops-match-card",
      ".gp-ops-dialog",
      ".gp-ops-state",
      ".gp-ops-spinner",
    ]) {
      assert.match(css, new RegExp(sel.replace(".", "\\.")));
    }
    assert.match(css, /var\(--color-warning-bg\)/);
    assert.match(css, /var\(--modal-overlay\)/);
    assert.match(css, /var\(--color-brand-primary\)/);
    assert.doesNotMatch(css, /#6C5CE7/i);
    assert.doesNotMatch(css, /Hanken Grotesk/);
    assert.doesNotMatch(css, FORBIDDEN_PLATFORM_SEMANTICS);
  });

  it("ships BB V2.04 Sanctuary Modern foundation scoped to ops shells", () => {
    const foundation = read("public/blessboard/v5/v204-foundation.css");
    assert.match(foundation, /data-bb-shell="branch-admin"/);
    assert.match(foundation, /Sanctuary Modern/);
    assert.match(foundation, /--gp-ops-primary:\s*var\(--color-brand-primary\)/);
    assert.doesNotMatch(foundation, /#6[cC]5[cC][eE]7/);
    const tokens = read("public/blessboard/v5/design-tokens.css");
    assert.match(tokens, /Plus Jakarta Sans/);
    assert.match(tokens, /JetBrains Mono/);
  });

  it("platform partials stay free of BB/AC domain wording", () => {
    for (const name of NEW_PLATFORM_PARTIALS.concat([
      "gp-ops-status-badge.ejs",
      "gp-ops-empty-state.ejs",
      "gp-ops-timeline.ejs",
      "gp-ops-filter-bar.ejs",
    ])) {
      const src = read(`views/platform/partials/${name}`);
      assert.doesNotMatch(src, FORBIDDEN_PLATFORM_SEMANTICS, name);
    }
  });

  it("renders match card, banner, field error, confirm dialog, and states", () => {
    const match = renderPartial(path.join(PLATFORM_PARTIALS, "gp-ops-match-card.ejs"), {
      title: "Possible match",
      scoreLabel: "High",
      tone: "warning",
      fields: [
        { label: "Phone", value: "+1 555", highlight: true },
        { label: "Email", value: "a@example.com" },
      ],
      actionsHtml: '<button type="button" class="gp-ops-btn gp-ops-btn--primary">Use existing</button>',
    });
    assert.match(match, /data-gp-ops="match-card"/);
    assert.match(match, /is-highlight/);
    assert.match(match, /Possible match/);
    assert.doesNotMatch(match, /Church ID/i);

    const banner = renderPartial(path.join(PLATFORM_PARTIALS, "gp-ops-banner.ejs"), {
      tone: "warning",
      title: "Review required",
      body: "Verify identity before creating a record.",
    });
    assert.match(banner, /gp-ops-banner--warning/);
    assert.match(banner, /Review required/);

    const field = renderPartial(path.join(PLATFORM_PARTIALS, "gp-ops-field.ejs"), {
      name: "given_name",
      label: "Given name",
      error: "Required",
      required: true,
      controlHtml: '<input class="gp-ops-input" id="gp-ops-field-given_name" name="given_name" />',
    });
    assert.match(field, /is-invalid/);
    assert.match(field, /role="alert"/);
    assert.match(field, /Required/);

    const dialog = renderPartial(path.join(PLATFORM_PARTIALS, "gp-ops-confirm-dialog.ejs"), {
      id: "gp-confirm-test",
      title: "Confirm action?",
      body: "This cannot be undone.",
      actionsHtml: '<button type="button" class="gp-ops-btn" data-gp-ops-dialog-close>Cancel</button>',
    });
    assert.match(dialog, /data-gp-ops="confirm-dialog"/);
    assert.match(dialog, /hidden/);

    const loading = renderPartial(path.join(PLATFORM_PARTIALS, "gp-ops-loading-state.ejs"), {
      title: "Loading",
    });
    assert.match(loading, /gp-ops-spinner/);

    const success = renderPartial(path.join(PLATFORM_PARTIALS, "gp-ops-success-state.ejs"), {
      title: "Created",
      actionHref: "/continue",
      actionLabel: "Open",
    });
    assert.match(success, /data-gp-ops="success-state"/);
    assert.match(success, /href="\/continue"/);
  });

  it("BB wrappers exist and duplicate banner may carry Church ID wording", () => {
    for (const name of BB_WRAPPERS) {
      assert.ok(fs.existsSync(path.join(BB_V204, name)), `missing BB wrapper ${name}`);
      const src = read(`views/blessboard/v5/partials/v204/${name}`);
      assert.match(src, /platform\/partials\/gp-ops-/);
    }
    const dup = read("views/blessboard/v5/partials/v204/duplicate-warning-banner.ejs");
    assert.match(dup, /Church ID/);
    assert.match(dup, /gp-ops-banner/);
  });

  it("BB wrappers render through platform without rewriting AC shells", () => {
    const header = renderPartial(path.join(BB_V204, "page-header.ejs"), {
      title: "Members",
      subtitle: "Directory",
    });
    assert.match(header, /data-gp-ops="page-header"/);
    assert.match(header, /Members/);

    const chip = renderPartial(path.join(BB_V204, "status-chip.ejs"), {
      label: "Active",
      tone: "success",
    });
    assert.match(chip, /gp-ops-badge--success/);

    const dup = renderPartial(path.join(BB_V204, "duplicate-warning-banner.ejs"), {});
    assert.match(dup, /Church ID/);
    assert.match(dup, /gp-ops-banner--warning/);

    const acShell = read("views/activeclinic/layouts/app-shell.ejs");
    assert.match(acShell, /gp-ops-shared\.css/);
    assert.doesNotMatch(acShell, /partials\/v204\//);
    assert.doesNotMatch(acShell, /#6C5CE7/i);
  });

  it("BB HQ/branch shells keep gp-ops opt-in (preserve default AC/BB isolation)", () => {
    const hqStart = read("views/blessboard/v5/partials/hq-shell-start.ejs");
    const baStart = read("views/blessboard/v5/partials/branch-admin-shell-start.ejs");
    const hqEnd = read("views/blessboard/v5/partials/hq-shell-end.ejs");
    const baEnd = read("views/blessboard/v5/partials/branch-admin-shell-end.ejs");

    for (const src of [hqStart, baStart]) {
      assert.match(src, /loadGpOpsAssets/);
      assert.match(src, /gp-ops-shared\.css/);
      assert.match(src, /if \(typeof loadGpOpsAssets/);
    }
    for (const src of [hqEnd, baEnd]) {
      assert.match(src, /gp-ops-dialog\.js/);
      assert.match(src, /loadGpOpsAssets/);
    }
  });
});
