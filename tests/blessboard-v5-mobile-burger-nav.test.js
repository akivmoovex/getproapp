"use strict";

/**
 * Cross-shell V5 mobile burger navigation — markup contracts.
 */

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { describe, it } = require("node:test");

const root = path.join(__dirname, "..");

function read(rel) {
  return fs.readFileSync(path.join(root, rel), "utf8");
}

const shells = [
  {
    name: "apex",
    start: "views/blessboard/v5/partials/apex-shell-start.ejs",
    end: "views/blessboard/v5/partials/apex-shell-end.ejs",
    css: "public/blessboard/v5/apex.css",
    js: "public/blessboard/v5/apex.js",
    toggleId: "bb-apex-menu-btn",
    drawerId: "bb-apex-drawer",
    usesShellNav: false,
  },
  {
    name: "tenant-public",
    start: "views/blessboard/v5/partials/tenant-public-shell-start.ejs",
    end: "views/blessboard/v5/partials/tenant-public-shell-end.ejs",
    css: "public/blessboard/v5/tenant-public.css",
    js: "public/blessboard/v5/tenant-public.js",
    toggleId: "bb-tp-menu-btn",
    drawerId: "bb-tp-drawer",
    usesShellNav: false,
  },
  {
    name: "member",
    start: "views/blessboard/v5/partials/member-shell-start.ejs",
    end: "views/blessboard/v5/partials/member-shell-end.ejs",
    css: "public/blessboard/v5/member-portal.css",
    js: "public/blessboard/v5/member-portal.js",
    toggleId: "bb-mp-menu-btn",
    drawerId: "bb-mp-drawer",
    usesShellNav: true,
  },
  {
    name: "branch-admin",
    start: "views/blessboard/v5/partials/branch-admin-shell-start.ejs",
    end: "views/blessboard/v5/partials/branch-admin-shell-end.ejs",
    css: "public/blessboard/v5/branch-admin.css",
    js: "public/blessboard/v5/branch-admin.js",
    toggleId: "bb-ba-menu-btn",
    drawerId: "bb-ba-drawer",
    usesShellNav: true,
  },
  {
    name: "hq",
    start: "views/blessboard/v5/partials/hq-shell-start.ejs",
    end: "views/blessboard/v5/partials/hq-shell-end.ejs",
    css: "public/blessboard/v5/hq-admin.css",
    js: "public/blessboard/v5/hq-admin.js",
    toggleId: "bb-hq-menu-btn",
    drawerId: "bb-hq-drawer",
    usesShellNav: true,
  },
  {
    name: "platform-admin",
    start: "views/blessboard/v5/partials/platform-admin-shell-start.ejs",
    end: "views/blessboard/v5/partials/platform-admin-shell-end.ejs",
    css: "public/blessboard/v5/platform-admin.css",
    js: null,
    toggleId: "bb-pa-menu-btn",
    drawerId: "bb-pa-drawer",
    usesShellNav: true,
  },
];

describe("blessboard v5 cross-shell mobile burger contracts", () => {
  for (const shell of shells) {
    it(`${shell.name} exposes one burger control wired to a drawer`, () => {
      const start = read(shell.start);
      const end = read(shell.end);
      const css = read(shell.css);
      assert.match(start, new RegExp(`id="${shell.toggleId}"`));
      assert.match(start, new RegExp(`aria-controls="${shell.drawerId}"`));
      assert.match(start, /aria-expanded="false"/);
      assert.match(start, /aria-label="Open navigation"/);
      assert.match(start, /bb-shell-burger/);
      assert.match(start, new RegExp(`id="${shell.drawerId}"`));
      assert.equal((start.match(new RegExp(`id="${shell.toggleId}"`, "g")) || []).length, 1);
      assert.doesNotMatch(end, /data-bb-nav="mobile-tabs"/);
      assert.match(css, /@media \(min-width:\s*900px\)/);
      if (shell.usesShellNav) {
        assert.match(end, /shell-nav\.js\?v=3/);
        assert.match(read("public/blessboard/v5/shell-nav.js"), /matchMedia/);
        assert.match(read("public/blessboard/v5/shell-nav.js"), /closeOnNavigate/);
      }
      if (shell.js) {
        const js = read(shell.js);
        assert.match(js, /Escape|matchMedia|Close navigation|Open navigation/);
      }
    });
  }

  it("portal CSS hides legacy bottom tab strips", () => {
    for (const prefix of ["bb-mp", "bb-hq", "bb-ba", "bb-pa"]) {
      const css = read(
        prefix === "bb-mp"
          ? "public/blessboard/v5/member-portal.css"
          : prefix === "bb-hq"
            ? "public/blessboard/v5/hq-admin.css"
            : prefix === "bb-ba"
              ? "public/blessboard/v5/branch-admin.css"
              : "public/blessboard/v5/platform-admin.css"
      );
      assert.match(css, new RegExp(`\\.${prefix}-bottom\\s*\\{[^}]*display:\\s*none\\s*!important`));
    }
  });

  it("shared design-system ships burger primitives", () => {
    const css = read("public/blessboard/v5/design-system.css");
    assert.match(css, /\.bb-shell-burger\b/);
    assert.match(css, /\.bb-shell-burger__bar\b/);
    assert.match(css, /\.bb-shell-sr-only\b/);
  });
});
