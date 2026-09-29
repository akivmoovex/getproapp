"use strict";

/**
 * V2.04 Batch 7 — BlessBoard public website color token migration.
 */

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");

const BATCH7_FILES = [
  "public/blessboard/v5/apex.css",
  "public/blessboard/v5/tenant-public.css",
  "public/blessboard/v5/website-theme-contemporary-fellowship.css",
];

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), "utf8");
}

function rawGuiColors(text) {
  const hex = /#[0-9a-fA-F]{3,8}\b/;
  const rgb = /rgba?\(/i;
  const found = [];
  for (const line of text.split(/\r?\n/)) {
    const s = line.trim();
    if (/--[a-zA-Z0-9-]+\s*:/.test(s)) continue;
    if (s.startsWith("/*") || s.startsWith("*") || s.startsWith("//")) continue;
    if (hex.test(s) || rgb.test(s)) found.push(s.slice(0, 120));
  }
  return found;
}

describe("V2_04 color migration batch 7 — BlessBoard public", () => {
  it("removes raw HEX/RGB from Batch 7 scannable public CSS", () => {
    for (const rel of BATCH7_FILES) {
      assert.deepEqual(rawGuiColors(read(rel)), [], `${rel} still has raw GUI colors`);
    }
  });

  it("keeps BB public shells on data-product blessboard + platform colors", () => {
    assert.match(read("views/blessboard/v5/partials/apex-shell-start.ejs"), /data-product="blessboard"/);
    assert.match(read("views/blessboard/v5/partials/tenant-public-shell-start.ejs"), /data-product="blessboard"/);
    assert.match(read("views/blessboard/v5/partials/head-design-system.ejs"), /head-platform-colors/);
    assert.match(read("views/blessboard/v5/partials/head-design-system.ejs"), /design-tokens\.css/);
  });

  it("bridges design-tokens BB palette to V2.04 brand/semantic tokens", () => {
    const tok = read("public/blessboard/v5/design-tokens.css");
    assert.match(tok, /--bb-color-primary:\s*var\(--color-brand-primary\)/);
    assert.match(tok, /--bb-color-ink:\s*var\(--color-text-primary\)/);
    assert.match(tok, /--bb-violet:\s*var\(--bb-color-primary\)/);
    assert.match(tok, /--bb-shadow-lg:/);
    assert.doesNotMatch(tok, /--bb-color-primary:\s*#6[Cc]5[Cc][Ee]7/);
  });

  it("does not invent appearance-named public page APIs", () => {
    for (const rel of BATCH7_FILES) {
      assert.doesNotMatch(
        read(rel),
        /--church-home-purple|--sermon-gold|--ministry-green|--giving-blue|--leadership-dark/
      );
    }
  });

  it("preserves tenant brandStyle hook on public shell", () => {
    const shell = read("views/blessboard/v5/partials/tenant-public-shell-start.ejs");
    assert.match(shell, /brandStyle/);
  });

  it("keeps contemporary-fellowship theme as var-def overrides with tokenized properties", () => {
    const theme = read("public/blessboard/v5/website-theme-contemporary-fellowship.css");
    assert.match(theme, /--bb-color-primary:\s*#06b6d4/);
    assert.match(theme, /\.bb-tp-btn[\s\S]*background:\s*var\(--bb-color-primary\)/);
    assert.equal(rawGuiColors(theme).length, 0);
  });
});
