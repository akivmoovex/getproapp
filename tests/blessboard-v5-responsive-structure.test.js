"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { describe, it } = require("node:test");

const root = path.join(__dirname, "..");

function read(rel) {
  return fs.readFileSync(path.join(root, rel), "utf8");
}

describe("blessboard v5 responsive structure — shell clearances", () => {
  const shells = [
    {
      name: "member",
      css: "public/blessboard/v5/member-portal.css",
      main: /\.bb-mp-main\s*\{[^}]*padding:[^}]*6\.5rem/,
      scroll: /\.bb-mp-main\s*\{[^}]*scroll-margin-top:\s*5rem/,
      drawer: /\.bb-mp-drawer__panel\s*\{[^}]*min\(20rem,\s*88vw\)/,
    },
    {
      name: "branch",
      css: "public/blessboard/v5/branch-admin.css",
      main: /\.bb-ba-main\s*\{[^}]*padding:[^}]*5\.5rem/,
      scroll: /\.bb-ba-main\s*\{[^}]*scroll-margin-top:\s*5rem/,
      drawer: /\.bb-ba-drawer__panel\s*\{[^}]*min\(20rem,\s*88vw\)/,
    },
    {
      name: "hq",
      css: "public/blessboard/v5/hq-admin.css",
      main: /\.bb-hq-main\s*\{[^}]*padding:[^}]*5\.5rem/,
      scroll: /\.bb-hq-main\s*\{[^}]*scroll-margin-top:\s*5rem/,
      drawer: /\.bb-hq-drawer__panel\s*\{[^}]*min\(20rem,\s*88vw\)/,
    },
    {
      name: "platform",
      css: "public/blessboard/v5/platform-admin.css",
      main: /\.bb-pa-main\s*\{[^}]*padding:[^}]*5\.5rem/,
      scroll: /\.bb-pa-main\s*\{[^}]*scroll-margin-top:\s*5rem/,
      drawer: /\.bb-pa-drawer__panel\s*\{[^}]*min\(20rem,\s*88vw\)/,
    },
  ];

  for (const shell of shells) {
    it(`${shell.name} main clears bottom chrome and keeps skip scroll-margin`, () => {
      const css = read(shell.css);
      assert.match(css, shell.main);
      assert.match(css, shell.scroll);
      assert.match(css, shell.drawer);
      assert.match(css, /@media \(max-width:\s*320px\)/);
    });
  }

  it("apex and tenant-public mains keep sticky-header scroll-margin", () => {
    const apex = read("public/blessboard/v5/apex.css");
    const tp = read("public/blessboard/v5/tenant-public.css");
    assert.match(apex, /\.bb-apex-main\s*\{[^}]*scroll-margin-top:\s*var\(--bb-header-h/);
    assert.match(tp, /\.bb-tp-main\s*\{[^}]*scroll-margin-top:\s*var\(--bb-header-h/);
    assert.match(apex, /width:\s*min\([^;]*88vw\)/);
    assert.match(tp, /@media \(max-width:\s*320px\)/);
  });
});

describe("blessboard v5 responsive structure — text and dialogs", () => {
  it("tenant-auth brand truncates long church names in the header", () => {
    const css = read("public/blessboard/v5/tenant-auth.css");
    assert.match(css, /\.bb-auth-brand\s*\{[^}]*min-width:\s*0/);
    assert.match(css, /\.bb-auth-brand\s*>\s*span\s*\{[^}]*min-width:\s*0/);
    assert.match(css, /\.bb-auth-brand__name\s*\{[^}]*display:\s*block[^}]*min-width:\s*0/);
    assert.match(css, /\.bb-auth-brand__name\s*\{[^}]*text-overflow:\s*ellipsis/);
    assert.match(css, /@media \(max-width:\s*320px\)/);
  });

  it("announcement definition lists stack under 900px", () => {
    const ba = read("public/blessboard/v5/branch-admin.css");
    const hq = read("public/blessboard/v5/hq-admin.css");
    assert.match(ba, /@media \(max-width:\s*899px\)\s*\{[^}]*\.bb-ann-dl div[^}]*grid-template-columns:\s*minmax\(0,\s*1fr\)/);
    assert.match(hq, /@media \(max-width:\s*899px\)\s*\{[^}]*\.bb-ann-dl div[^}]*grid-template-columns:\s*minmax\(0,\s*1fr\)/);
  });

  it("design-system page header allows long titles to wrap", () => {
    const css = read("public/blessboard/v5/design-system.css");
    assert.match(css, /\.bb-ds-page-header__copy\s*\{[^}]*min-width:\s*0/);
    assert.match(css, /\.bb-ds-page-header__title\s*\{[^}]*overflow-wrap:\s*anywhere/);
    assert.match(css, /\.bb-ds-modal__panel\s*\{[^}]*width:\s*min\(100%,\s*28rem\)/);
    assert.match(css, /\.bb-ds-modal__panel\s*\{[^}]*max-height:\s*min\(90vh/);
  });

  it("media picker dialogs avoid sole 100vw width and keep max-height", () => {
    const css = read("public/blessboard/v5/media-picker.css");
    assert.match(css, /\.bb-media-picker-dialog\s*\{[^}]*width:\s*min\(42rem,\s*calc\(100%\s*-\s*1\.5rem\)\)/);
    assert.match(css, /\.bb-media-picker-dialog\s*\{[^}]*max-width:\s*calc\(100vw\s*-\s*1\.5rem\)/);
    assert.match(css, /\.bb-media-confirm\s*\{[^}]*width:\s*min\(26rem,\s*calc\(100%\s*-\s*1\.5rem\)\)/);
    assert.match(css, /\.bb-media-picker-dialog\s*\{[^}]*max-height:\s*min\(90vh/);
    assert.doesNotMatch(css, /width:\s*100vw\s*;/);
  });

  it("portal page-head titles wrap long entity names", () => {
    const ba = read("public/blessboard/v5/branch-admin.css");
    const hq = read("public/blessboard/v5/hq-admin.css");
    const pa = read("public/blessboard/v5/platform-admin.css");
    const mp = read("public/blessboard/v5/member-portal.css");
    assert.match(ba, /\.bb-ba-page-head__title[^}]*overflow-wrap:\s*anywhere/);
    assert.match(hq, /\.bb-hq-page-head__title\s*\{[^}]*overflow-wrap:\s*anywhere/);
    assert.match(pa, /\.bb-pa-page-head__title\s*\{[^}]*overflow-wrap:\s*anywhere/);
    assert.match(mp, /\.bb-mp-page-head__title\s*\{[^}]*overflow-wrap:\s*anywhere/);
  });
});

describe("blessboard v5 responsive structure — viewport CSS hygiene", () => {
  it("V5 CSS has no bare 100vw/100vh as sole width/height assignments", () => {
    const dir = path.join(root, "public/blessboard/v5");
    for (const name of fs.readdirSync(dir)) {
      if (!name.endsWith(".css")) continue;
      const css = fs.readFileSync(path.join(dir, name), "utf8");
      assert.doesNotMatch(css, /(?:^|[^\w-])width:\s*100vw\s*;/m, name);
      assert.doesNotMatch(css, /(?:^|[^\w-])height:\s*100vw\s*;/m, name);
    }
  });

  it("documents both marketing (768) and shell (900) breakpoint families", () => {
    const tokens = read("public/blessboard/v5/design-tokens.css");
    assert.match(tokens, /--bb-bp-md:\s*768px/);
    assert.match(tokens, /--bb-bp-lg:\s*900px/);
    assert.match(tokens, /699\/700|shell drawer\/nav:\s*899\/900/);
    assert.match(read("public/blessboard/v5/apex.css"), /@media \(min-width:\s*768px\)/);
    assert.match(read("public/blessboard/v5/member-portal.css"), /@media \(min-width:\s*900px\)/);
    assert.match(read("public/blessboard/v5/member-portal.css"), /@media \(max-width:\s*699px\)/);
  });
});
