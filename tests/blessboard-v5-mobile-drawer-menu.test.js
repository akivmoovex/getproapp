"use strict";

/**
 * Prompt 51 — mobile drawer menu item markup/CSS contracts.
 */

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const ejs = require("ejs");
const { describe, it } = require("node:test");

const root = path.join(__dirname, "..");

function read(rel) {
  return fs.readFileSync(path.join(root, rel), "utf8");
}

function renderPartial(rel, locals) {
  const file = path.join(root, rel);
  return ejs.render(read(rel), locals, { filename: file });
}

describe("blessboard v5 mobile drawer menu item styling (Prompt 51)", () => {
  it("1–7: apex drawer renders semantic list with classes, aria-current, account separation, POST logout", () => {
    const html = renderPartial("views/blessboard/v5/partials/apex-nav-links.ejs", {
      authenticated: true,
      activeNav: "home",
      csrfToken: "test-csrf",
      variant: "drawer",
    });
    assert.match(html, /<ul class="bb-apex-drawer__list">/);
    assert.match(html, /<li class="bb-apex-drawer__item">/);
    assert.match(html, /class="bb-apex-drawer__link is-active"/);
    assert.match(html, /aria-current="page"/);
    assert.doesNotMatch(html, /class=&#34;/);
    assert.doesNotMatch(html, /aria-current=&#34;/);
    assert.match(html, /bb-apex-drawer__account/);
    assert.match(html, /<form class="bb-apex-drawer__logout" method="post" action="\/logout">/);
    // Each marketing link is inside its own list item (no raw adjacent anchors in primary list)
    const list = html.match(/<ul class="bb-apex-drawer__list">[\s\S]*?<\/ul>/)[0];
    assert.doesNotMatch(list, /<\/a>\s*<a /);
    assert.equal((list.match(/<li class="bb-apex-drawer__item">/g) || []).length, 6);
  });

  it("apex shell drawer has header row and scoped nav; CSS version bumped", () => {
    const start = read("views/blessboard/v5/partials/apex-shell-start.ejs");
    assert.match(start, /apex\.css\?v=13/);
    assert.match(start, /bb-apex-drawer__head/);
    assert.match(start, /bb-apex-drawer__nav/);
    assert.match(start, /variant: 'drawer'/);
    const css = read("public/blessboard/v5/apex.css");
    assert.match(css, /\.bb-apex-drawer__list\s*\{/);
    assert.match(css, /\.bb-apex-drawer__link\s*\{[\s\S]*?display:\s*flex/);
    assert.match(css, /\.bb-apex-drawer__link\s*\{[\s\S]*?text-decoration:\s*none/);
    assert.match(css, /\.bb-apex-drawer__link\s*\{[\s\S]*?width:\s*100%/);
    assert.match(css, /\.bb-apex-drawer__link\s*\{[\s\S]*?min-height:\s*var\(--bb-touch-min/);
    assert.match(css, /\.bb-apex-drawer__nav\s*\{[\s\S]*?overflow:\s*auto/);
  });

  it("8: tenant public drawer uses stacked list items", () => {
    const start = read("views/blessboard/v5/partials/tenant-public-shell-start.ejs");
    assert.match(start, /bb-tp-drawer__list/);
    assert.match(start, /bb-tp-drawer__item/);
    assert.match(start, /bb-tp-drawer__link/);
    assert.match(start, /<% if \(activeNav === item\.key\) \{ %>aria-current="page"<% \} %>/);
    assert.doesNotMatch(start, /<%= activeNav === item\.key \? 'aria-current=/);
    const css = read("public/blessboard/v5/tenant-public.css");
    assert.match(css, /\.bb-tp-drawer__list\s*\{[\s\S]*?flex-direction:\s*column/);
  });

  it("9–12: member, branch-admin, HQ, platform-admin drawers use stacked lists", () => {
    const shells = [
      {
        start: "views/blessboard/v5/partials/member-shell-start.ejs",
        css: "public/blessboard/v5/member-portal.css",
        list: "bb-mp-drawer__list",
        item: "bb-mp-drawer__item",
        account: "bb-mp-drawer__account",
        logout: 'method="post" action="/member/logout"',
      },
      {
        start: "views/blessboard/v5/partials/branch-admin-shell-start.ejs",
        css: "public/blessboard/v5/branch-admin.css",
        list: "bb-ba-drawer__list",
        item: "bb-ba-drawer__item",
        account: "bb-ba-drawer__account",
        logout: 'method="post"',
      },
      {
        start: "views/blessboard/v5/partials/hq-shell-start.ejs",
        css: "public/blessboard/v5/hq-admin.css",
        list: "bb-hq-drawer__list",
        item: "bb-hq-drawer__item",
        account: "bb-hq-drawer__account",
        logout: 'method="post" action="/hq/logout"',
      },
      {
        start: "views/blessboard/v5/partials/platform-admin-shell-start.ejs",
        css: "public/blessboard/v5/platform-admin.css",
        list: "bb-pa-drawer__list",
        item: "bb-pa-drawer__item",
        account: "bb-pa-drawer__account",
        logout: 'method="post"',
      },
    ];
    for (const shell of shells) {
      const start = read(shell.start);
      assert.match(start, new RegExp(shell.list));
      assert.match(start, new RegExp(shell.item));
      assert.match(start, new RegExp(shell.account));
      assert.match(start, new RegExp(shell.logout));
      assert.match(start, /<% if \(activeNav === item\.key\) \{ %>aria-current="page"<% \} %>/);
      assert.doesNotMatch(start, /<%= activeNav === item\.key \? 'aria-current=/);
      const css = read(shell.css);
      assert.match(css, new RegExp(`\\.${shell.list}\\s*\\{[\\s\\S]*?flex-direction:\\s*column`));
    }
  });

  it("13–15: drawer link CSS forbids underline and requires flex/full-width/touch height", () => {
    const checks = [
      ["public/blessboard/v5/apex.css", "bb-apex-drawer__link"],
      ["public/blessboard/v5/tenant-public.css", "bb-tp-drawer__link"],
    ];
    for (const [file, cls] of checks) {
      const css = read(file);
      const re = new RegExp(`\\.${cls}\\s*\\{[^}]+\\}`, "m");
      const block = css.match(re);
      assert.ok(block, `${cls} rule missing in ${file}`);
      assert.match(block[0], /display:\s*flex/);
      assert.match(block[0], /text-decoration:\s*none/);
      assert.match(block[0], /width:\s*100%/);
      assert.match(block[0], /min-height:\s*var\(--bb-touch-min/);
    }
  });

  it("16–18: apex drawer layout prevents overflow and close overlap", () => {
    const css = read("public/blessboard/v5/apex.css");
    assert.match(css, /\.bb-apex-drawer__panel\s*\{[\s\S]*?max-width:\s*100vw/);
    assert.match(css, /\.bb-apex-drawer__head\s*\{/);
    assert.match(css, /\.bb-apex-drawer__nav\s*\{[\s\S]*?overflow:\s*auto/);
    const start = read("views/blessboard/v5/partials/apex-shell-start.ejs");
    const headIdx = start.indexOf("bb-apex-drawer__head");
    const navIdx = start.indexOf("bb-apex-drawer__nav");
    assert.ok(headIdx > 0 && navIdx > headIdx, "nav must follow drawer head");
  });

  it("19: desktop apex nav remains a flat link row (not the drawer list)", () => {
    const html = renderPartial("views/blessboard/v5/partials/apex-nav-links.ejs", {
      authenticated: false,
      activeNav: "features",
      csrfToken: "",
      variant: "desktop",
    });
    assert.doesNotMatch(html, /bb-apex-drawer__list/);
    assert.match(html, /class="bb-apex-nav__link is-active"/);
    assert.match(html, /aria-current="page"/);
    assert.doesNotMatch(html, /class=&#34;/);
  });

  it("20: existing burger contract IDs remain intact", () => {
    const start = read("views/blessboard/v5/partials/apex-shell-start.ejs");
    assert.match(start, /id="bb-apex-menu-btn"/);
    assert.match(start, /aria-controls="bb-apex-drawer"/);
    assert.match(start, /id="bb-apex-drawer"/);
    assert.match(start, /bb-shell-burger/);
  });
});
