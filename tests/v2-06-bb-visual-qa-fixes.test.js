"use strict";

/**
 * V2.06 — BlessBoard visual QA fixes (directory search, editor chrome,
 * HQ Announcements icon, sidebar org contrast).
 */

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.join(__dirname, "..");

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), "utf8");
}

describe("V2.06 BB visual QA fixes", () => {
  it("1) directory mobile search stacks via BB-local apex CSS", () => {
    const css = read("public/blessboard/v5/apex.css");
    assert.match(css, /@media \(max-width: 480px\)[\s\S]*bb-apex-directory-search__row/);
    assert.match(css, /grid-template-columns:\s*auto minmax\(0,\s*1fr\)/);
    assert.match(css, /\.bb-apex-directory-search__row\s*\{[^}]*flex-wrap:\s*nowrap/);
  });

  it("2) editor-only chrome stacking, scrim, and buttonUrl containment", () => {
    const css = read("public/platform/website-inline-edit.css");
    assert.match(
      css,
      /body\.gp-website-editor-open\.bb-tp-body--editing \.gp-website-chrome-stack[\s\S]{0,120}z-index:\s*calc\(var\(--gp-we-z-toolbar\)\s*-\s*1\)/
    );
    assert.match(
      css,
      /body\.gp-website-editor-open\.bb-tp-body--editing \.bb-tp-template-banner/
    );
    assert.match(
      css,
      /body\.gp-website-editor-open\.bb-tp-body--editing \.bb-tp-hero__scrim[\s\S]{0,200}linear-gradient/
    );
    assert.match(
      css,
      /\[data-bb-field="buttonUrl"\] \.bb-tp-se-hint/
    );
    // Preview / public paths must not get these editor body selectors alone as public rules.
    assert.doesNotMatch(
      css,
      /\.bb-tp-body--preview \.gp-website-chrome-stack[\s\S]{0,80}z-index:\s*calc\(var\(--gp-we-z-toolbar\)/
    );
  });

  it("3) Announcements uses a subset-safe Material icon (not newspaper)", () => {
    const nav = read("src/blessboard/http/hqAdminNav.js");
    const shell = read("views/blessboard/v5/partials/hq-shell-start.ejs");
    const names = read("public/fonts/material-symbols-icon-names.txt");
    assert.match(nav, /key:\s*"announcements"[\s\S]{0,120}icon:\s*"notifications"/);
    assert.match(shell, /key:\s*'announcements'[\s\S]{0,120}icon:\s*'notifications'/);
    assert.doesNotMatch(nav, /key:\s*"announcements"[\s\S]{0,120}icon:\s*"newspaper"/);
    assert.match(names, /^notifications$/m);
    assert.doesNotMatch(names, /^newspaper$/m);
    // Neighbors remain subset-safe.
    for (const icon of ["language", "campaign", "description", "menu_book"]) {
      assert.match(names, new RegExp(`^${icon}$`, "m"), `${icon} missing from subset`);
      assert.match(nav, new RegExp(`icon:\\s*"${icon}"`));
    }
  });

  it("4) HQ org/branch context uses nav-text-muted on navy rail", () => {
    const foundation = read("public/blessboard/v5/v204-foundation.css");
    const hqCss = read("public/blessboard/v5/hq-admin.css");
    const colors = read("public/platform/theme/colors.css");
    assert.match(hqCss, /\.bb-hq-context\s*\{[^}]*color:\s*var\(--bb-muted\)/);
    assert.match(
      foundation,
      /\[data-product="blessboard"\]\[data-bb-shell="hq-admin"\] \.bb-hq-context[\s\S]*?color:\s*var\(--nav-text-muted\)/
    );
    assert.match(colors, /--nav-text-muted:\s*color-mix\(in srgb,\s*var\(--palette-white\)\s*72%/);
    assert.match(colors, /--nav-bg:\s*var\(--palette-navy-700\)/);
  });
});
