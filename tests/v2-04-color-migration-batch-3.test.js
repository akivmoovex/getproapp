"use strict";

/**
 * V2.04 Batch 3 — ActiveClinic staff application color token migration.
 */

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");

const BATCH3_SCANNABLE = [
  "public/activeclinic/ac-app.css",
  "public/activeclinic/ac-urp.css",
  "public/activeclinic/website-cms.css",
];

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), "utf8");
}

describe("V2_04 color migration batch 3 — ActiveClinic staff", () => {
  it("removes raw HEX/RGB literals from Batch 3 scannable staff CSS", () => {
    const hex = /#[0-9a-fA-F]{3,8}\b/;
    const rgb = /rgba?\(/i;
    for (const rel of BATCH3_SCANNABLE) {
      const css = read(rel);
      const lines = css.split(/\r?\n/);
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const t = line.trim();
        if (/^\s*--[\w-]+\s*:/.test(line)) continue;
        if (t.startsWith("/*") || t.startsWith("*") || t.startsWith("//")) continue;
        assert.equal(hex.test(line), false, `${rel}:${i + 1} HEX: ${t.slice(0, 100)}`);
        assert.equal(rgb.test(line), false, `${rel}:${i + 1} RGB: ${t.slice(0, 100)}`);
      }
    }
  });

  it("bridges ac-app-tokens to V2.04 brand and semantic tokens", () => {
    const tok = read("public/activeclinic/ac-app-tokens.css");
    assert.match(tok, /--ac-primary:\s*var\(--color-brand-primary\)/);
    assert.match(tok, /--ac-success:\s*var\(--color-success-text\)/);
    assert.match(tok, /--ac-danger:\s*var\(--color-danger-text\)/);
    assert.match(tok, /--status-encounter-with-practitioner/);
    assert.match(tok, /--ac-website-preview-primary:\s*var\(--palette-teal-700\)/);
    assert.doesNotMatch(tok, /--ac-primary:\s*#2563eb/i);
  });

  it("maps staff operational statuses without inventing appearance-named APIs", () => {
    const app = read("public/activeclinic/ac-app.css");
    assert.match(app, /data-ac-status="with_practitioner"[\s\S]*--status-encounter-with-practitioner/);
    assert.match(app, /data-ac-status="requested"[\s\S]*--status-appointment-requested/);
    assert.doesNotMatch(app, /--clinic-green|--medical-red|--light-blue-2/);
  });

  it("keeps AC staff shell on platform colors with staff surface selector", () => {
    const shell = read("views/activeclinic/layouts/app-shell.ejs");
    assert.match(shell, /head-platform-colors/);
    assert.match(shell, /data-product="activeclinic"/);
    assert.match(shell, /data-surface="staff"/);
    assert.match(shell, /ac-app-tokens\.css/);
  });

  it("does not migrate BlessBoard product CSS in this batch", () => {
    // Guard: Batch 3 commit scope should not touch BB admin skins
    assert.equal(fs.existsSync(path.join(ROOT, "public/blessboard/v5/hq-admin.css")), true);
  });
});
