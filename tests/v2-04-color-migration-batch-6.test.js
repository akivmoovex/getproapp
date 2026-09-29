"use strict";

/**
 * V2.04 Batch 6 — ActiveClinic public website color token migration.
 */

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");

const BATCH6_FILES = [
  "public/activeclinic/ac-public.css",
  "public/activeclinic/acw-platform.css",
  "public/activeclinic/ac-patient.css",
  "public/activeclinic/website-theme-family-wellness-mint.css",
  "views/activeclinic/app/patient-print-card-content.ejs",
  "public/activeclinic/ac-patient.js",
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

describe("V2_04 color migration batch 6 — ActiveClinic public", () => {
  it("removes raw HEX/RGB from Batch 6 scannable public CSS/JS/EJS", () => {
    for (const rel of BATCH6_FILES) {
      assert.deepEqual(rawGuiColors(read(rel)), [], `${rel} still has raw GUI colors`);
    }
  });

  it("bridges ac-tokens public palette to V2.04 brand/semantic tokens", () => {
    const tok = read("public/activeclinic/ac-tokens.css");
    assert.match(tok, /--acp-primary:\s*var\(--color-brand-primary\)/);
    assert.match(tok, /--acp-primary-strong:\s*var\(--color-brand-primary-active\)/);
    assert.match(tok, /--acp-ink:\s*var\(--color-text-primary\)/);
    assert.match(tok, /--ac-status-success:\s*var\(--color-success-text\)/);
    assert.doesNotMatch(tok, /--acp-primary:\s*#006068/);
  });

  it("keeps public/patient shells on data-product activeclinic + public surface", () => {
    assert.match(read("views/activeclinic/layouts/public-shell.ejs"), /data-product="activeclinic"/);
    assert.match(read("views/activeclinic/layouts/public-shell.ejs"), /data-surface="public"/);
    assert.match(read("views/activeclinic/layouts/patient-shell.ejs"), /data-surface="public"/);
    assert.match(read("views/activeclinic/layouts/public-shell.ejs"), /head-platform-colors/);
  });

  it("does not invent appearance-named public APIs", () => {
    for (const rel of BATCH6_FILES) {
      assert.doesNotMatch(read(rel), /--clinic-home-blue|--doctor-card-blue|--ac-public-dark-blue/);
    }
  });

  it("preserves tenant brand override hook on public shell", () => {
    const shell = read("views/activeclinic/layouts/public-shell.ejs");
    assert.match(shell, /--acp-primary:/);
    assert.match(shell, /clinic\.brandPrimary/);
  });
});
