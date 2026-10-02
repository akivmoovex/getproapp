"use strict";

/**
 * V2.04 shared platform color theme foundation.
 */

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), "utf8");
}

function exists(rel) {
  return fs.existsSync(path.join(ROOT, rel));
}

const CANONICAL = "src/platform/ui/theme/colors.css";
const RUNTIME = "public/platform/theme/colors.css";
const PARTIAL = "views/platform/partials/head-platform-colors.ejs";

const REQUIRED_SEMANTIC = [
  "--color-background",
  "--color-surface",
  "--color-surface-subtle",
  "--color-surface-elevated",
  "--color-text-primary",
  "--color-text-secondary",
  "--color-text-muted",
  "--color-text-inverse",
  "--color-border-default",
  "--color-border-subtle",
  "--color-border-strong",
  "--color-disabled-bg",
  "--color-disabled-text",
  "--color-disabled-border",
  "--color-success",
  "--color-success-bg",
  "--color-success-border",
  "--color-success-text",
  "--color-warning",
  "--color-warning-bg",
  "--color-warning-border",
  "--color-warning-text",
  "--color-danger",
  "--color-danger-bg",
  "--color-danger-border",
  "--color-danger-text",
  "--color-info",
  "--color-info-bg",
  "--color-info-border",
  "--color-info-text",
  "--color-link",
  "--color-link-hover",
  "--color-focus",
  "--color-focus-ring",
  "--color-selection",
];

const REQUIRED_BRAND = [
  "--color-brand-primary",
  "--color-brand-primary-hover",
  "--color-brand-primary-active",
  "--color-brand-primary-light",
  "--color-brand-accent",
  "--color-brand-on-primary",
];

const REQUIRED_COMPONENT = [
  "--button-primary-bg",
  "--button-primary-bg-hover",
  "--button-primary-bg-active",
  "--button-primary-text",
  "--button-primary-border",
  "--button-secondary-bg",
  "--button-secondary-bg-hover",
  "--button-secondary-text",
  "--button-secondary-border",
  "--button-danger-bg",
  "--button-danger-bg-hover",
  "--button-danger-text",
  "--input-bg",
  "--input-text",
  "--input-placeholder",
  "--input-border",
  "--input-border-hover",
  "--input-border-focus",
  "--input-focus-ring",
  "--input-disabled-bg",
  "--input-disabled-text",
  "--card-bg",
  "--card-border",
  "--card-text",
  "--card-muted-text",
  "--nav-bg",
  "--nav-text",
  "--nav-text-muted",
  "--nav-hover-bg",
  "--nav-hover-text",
  "--nav-active-bg",
  "--nav-active-text",
  "--nav-border",
  "--table-bg",
  "--table-header-bg",
  "--table-header-text",
  "--table-row-hover",
  "--table-border",
  "--modal-bg",
  "--modal-text",
  "--modal-border",
  "--modal-overlay",
  "--badge-success-bg",
  "--badge-success-text",
  "--badge-danger-bg",
  "--badge-danger-text",
];

describe("V2_04 shared platform color theme foundation", () => {
  it("ships canonical colors.css and identical public runtime mirror", () => {
    assert.equal(exists(CANONICAL), true);
    assert.equal(exists(RUNTIME), true);
    assert.equal(read(CANONICAL), read(RUNTIME));
  });

  it("defines required semantic, brand, and component tokens", () => {
    const css = read(CANONICAL);
    for (const token of REQUIRED_SEMANTIC) {
      assert.match(css, new RegExp(`${token.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*:`), `missing ${token}`);
    }
    for (const token of REQUIRED_BRAND) {
      assert.match(css, new RegExp(`${token.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*:`), `missing ${token}`);
    }
    for (const token of REQUIRED_COMPONENT) {
      assert.match(css, new RegExp(`${token.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*:`), `missing ${token}`);
    }
  });

  it("defines BlessBoard and ActiveClinic brand theme selectors with audit brand HEX", () => {
    const css = read(CANONICAL);
    assert.match(css, /\[data-product="blessboard"\]/);
    assert.match(css, /\[data-product="activeclinic"\]/);
    assert.match(css, /\[data-surface="staff"\]/);
    assert.match(css, /#6c5ce7/i);
    assert.match(css, /#006068/i);
    assert.match(css, /#2563eb/i);
    assert.match(css, /#ff9800/i);
    assert.match(css, /#c2410c/i);
  });

  it("loads platform colors via shared partial in BB and AC shells", () => {
    const partial = read(PARTIAL);
    assert.match(partial, /\/platform\/theme\/colors\.css/);

    const bbHead = read("views/blessboard/v5/partials/head-design-system.ejs");
    assert.match(bbHead, /head-platform-colors/);

    const acPublic = read("views/activeclinic/layouts/public-shell.ejs");
    const acAuth = read("views/activeclinic/layouts/auth-shell.ejs");
    const acPatient = read("views/activeclinic/layouts/patient-shell.ejs");
    const acApp = read("views/activeclinic/layouts/app-shell.ejs");
    for (const src of [acPublic, acAuth, acPatient, acApp]) {
      assert.match(src, /head-platform-colors/);
    }
  });

  it("applies preferred data-product selectors on BB and AC bodies", () => {
    assert.match(read("views/blessboard/v5/partials/apex-shell-start.ejs"), /data-product="blessboard"/);
    assert.match(read("views/blessboard/v5/partials/hq-shell-start.ejs"), /data-product="blessboard"/);
    assert.match(read("views/blessboard/v5/apex/login.ejs"), /data-product="blessboard"/);

    assert.match(read("views/activeclinic/layouts/public-shell.ejs"), /data-product="activeclinic"/);
    assert.match(read("views/activeclinic/layouts/auth-shell.ejs"), /data-product="activeclinic"/);
    assert.match(read("views/activeclinic/layouts/app-shell.ejs"), /data-product="activeclinic"/);
    assert.match(read("views/activeclinic/layouts/app-shell.ejs"), /data-surface="staff"/);
    assert.match(read("views/activeclinic/layouts/public-shell.ejs"), /data-surface="public"/);
  });

  it("keeps component tokens wired to brand/semantic vars (no obvious undefined refs in foundation)", () => {
    const css = read(CANONICAL);
    // Spot-check that primary button tokens reference brand tokens, not orphan names.
    assert.match(css, /--button-primary-bg:\s*var\(--color-brand-primary\)/);
    assert.match(css, /--button-primary-text:\s*var\(--color-brand-on-primary\)/);
    assert.match(css, /--input-border-focus:\s*var\(--color-brand-primary\)/);
    assert.match(css, /--badge-danger-text:\s*var\(--color-danger-text\)/);
    assert.match(css, /--color-link:\s*var\(--color-brand-primary\)/);
  });

  it("ships design docs and migration plan", () => {
    assert.equal(exists("docs/design/PLATFORM_COLOR_SYSTEM.md"), true);
    assert.equal(exists("docs/qa/V2_04_COLOR_TOKEN_MIGRATION_PLAN.md"), true);
    const plan = read("docs/qa/V2_04_COLOR_TOKEN_MIGRATION_PLAN.md");
    assert.match(plan, /BATCH 1/);
    assert.match(plan, /BATCH 8/);
    assert.match(plan, /MIGRATION_BATCHES=8/);
  });
});
