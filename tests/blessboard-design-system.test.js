"use strict";

/**
 * BlessBoard V5 design-system foundation — template structure + asset presence.
 * No HTTP / DB. Does not redesign pages.
 */

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { describe, it } = require("node:test");
const ejs = require("ejs");

const ROOT = path.join(__dirname, "..");
const PUBLIC_V5 = path.join(ROOT, "public", "blessboard", "v5");
const PARTIALS = path.join(ROOT, "views", "blessboard", "v5", "partials");

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), "utf8");
}

function existsPublic(name) {
  return fs.existsSync(path.join(PUBLIC_V5, name));
}

describe("blessboard v5 design system", () => {
  it("ships design-tokens and design-system CSS/JS", () => {
    assert.equal(existsPublic("design-tokens.css"), true);
    assert.equal(existsPublic("design-system.css"), true);
    assert.equal(existsPublic("design-system.js"), true);
  });

  it("defines canonical primary and Hanken font token", () => {
    const tokens = read("public/blessboard/v5/design-tokens.css");
    assert.match(tokens, /--bb-color-primary:\s*#6c5ce7/i);
    assert.match(tokens, /--bb-color-accent:\s*#ff9800/i);
    assert.match(tokens, /--bb-font-sans:.*"Hanken Grotesk"/);
    assert.match(tokens, /--bb-max:\s*80rem/);
    assert.match(tokens, /--bb-control-h:\s*3rem/);
    assert.match(tokens, /prefers-reduced-motion|@media \(max-width: 767px\)/);
    // Legacy aliases for existing shells
    assert.match(tokens, /--bb-violet:\s*var\(--bb-color-primary/);
  });

  it("provides shared component primitives and reduced-motion support", () => {
    const css = read("public/blessboard/v5/design-system.css");
    for (const sel of [
      ".bb-ds-btn",
      ".bb-ds-input",
      ".bb-ds-badge",
      ".bb-ds-card",
      ".bb-ds-alert",
      ".bb-ds-empty",
      ".bb-ds-table",
      ".bb-ds-pagination",
      ".bb-ds-modal",
      ".bb-ds-drawer",
      ".bb-ds-nav",
      ":focus-visible",
      "prefers-reduced-motion",
    ]) {
      assert.match(css, new RegExp(sel.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
    }
  });

  it("keeps design-system.js free of inline handlers and network calls", () => {
    const js = read("public/blessboard/v5/design-system.js");
    assert.doesNotMatch(js, /fetch\s*\(/);
    assert.doesNotMatch(js, /XMLHttpRequest/);
    assert.match(js, /data-bb-ds-drawer/);
    assert.match(js, /data-bb-ds-modal/);
    assert.match(js, /Escape/);
  });

  it("exposes required shared partials", () => {
    const required = [
      "head-design-system.ejs",
      "icon.ejs",
      "form-errors.ejs",
      "empty-state.ejs",
      "flash-message.ejs",
      "pagination.ejs",
      "loading-state.ejs",
      "error-state.ejs",
      "success-state.ejs",
      "confirm-state.ejs",
    ];
    for (const name of required) {
      assert.equal(fs.existsSync(path.join(PARTIALS, name)), true, name);
    }
  });

  it("wires head-design-system into V5 shells without removing shell CSS", () => {
    const shells = [
      "views/blessboard/v5/partials/tenant-public-shell-start.ejs",
      "views/blessboard/v5/partials/member-shell-start.ejs",
      "views/blessboard/v5/partials/hq-shell-start.ejs",
      "views/blessboard/v5/partials/branch-admin-shell-start.ejs",
      "views/blessboard/v5/partials/platform-admin-shell-start.ejs",
    ];
    for (const rel of shells) {
      const src = read(rel);
      assert.match(src, /head-design-system/);
    }
    const head = read("views/blessboard/v5/partials/head-design-system.ejs");
    assert.match(head, /design-tokens\.css/);
    assert.match(head, /design-system\.css/);
    assert.match(head, /Hanken\+Grotesk/);
    assert.match(read("views/blessboard/v5/partials/tenant-public-shell-start.ejs"), /tenant-public\.css/);
    assert.match(read("views/blessboard/v5/partials/member-shell-start.ejs"), /member-portal\.css/);
  });

  it("does not redeclare duplicate brand hex :root blocks in shell CSS", () => {
    const shells = [
      "public/blessboard/v5/tenant-public.css",
      "public/blessboard/v5/member-portal.css",
      "public/blessboard/v5/hq-admin.css",
      "public/blessboard/v5/branch-admin.css",
      "public/blessboard/v5/platform-admin.css",
    ];
    for (const rel of shells) {
      const src = read(rel);
      assert.doesNotMatch(src, /:root\s*\{[^}]*--bb-violet:\s*#6c5ce7/i, rel);
    }
  });

  it("renders form-errors, empty-state, flash, and pagination partials", () => {
    const render = (name, data) =>
      ejs.render(fs.readFileSync(path.join(PARTIALS, name), "utf8"), data, {
        filename: path.join(PARTIALS, name),
      });

    const errors = render("form-errors.ejs", { error: "Invalid input" });
    assert.match(errors, /role="alert"/);
    assert.match(errors, /Invalid input/);
    assert.match(errors, /bb-ds-alert--error/);

    const empty = render("empty-state.ejs", {
      title: "No rows",
      body: "Try again later",
      icon: "inbox",
      actionHref: "/contact",
      actionLabel: "Contact",
    });
    assert.match(empty, /No rows/);
    assert.match(empty, /bb-ds-empty/);
    assert.match(empty, /href="\/contact"/);

    const flash = render("flash-message.ejs", {
      type: "success",
      message: "Saved",
    });
    assert.match(flash, /role="status"/);
    assert.match(flash, /Saved/);

    const pages = render("pagination.ejs", {
      page: 2,
      totalPages: 4,
      baseHref: "/branch-admin/registrations",
    });
    assert.match(pages, /aria-label="Pagination"/);
    assert.match(pages, /aria-current="page"/);
    assert.match(pages, /page=1/);
    assert.match(pages, /page=3/);
  });
});
