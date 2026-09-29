"use strict";

/**
 * V2.04 Batch 5 — website editor color token migration (BB + AC shared chrome).
 */

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");

const BATCH5_CSS = [
  "public/platform/website-inline-edit.css",
  "public/platform/website-change-manager-ui.css",
  "public/platform/website-theme-gallery.css",
  "public/platform/website-history.css",
  "public/platform/website-scope-list.css",
  "public/platform/website-media-field.css",
  "public/platform/website-styles.css",
  "public/platform/website-add-section.css",
  "public/platform/website-version-preview.css",
];

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), "utf8");
}

function rawGuiColors(css) {
  const hex = /#[0-9a-fA-F]{3,8}\b/;
  const rgb = /rgba?\(/i;
  const colors = new Set();
  for (const line of css.split(/\r?\n/)) {
    const s = line.trim();
    if (/--[a-zA-Z0-9-]+\s*:/.test(s)) continue;
    if (s.startsWith("/*") || s.startsWith("*") || s.startsWith("//")) continue;
    const hm = s.match(hex);
    if (hm) colors.add(hm[0].toLowerCase());
    if (rgb.test(s)) colors.add("rgb");
  }
  return colors;
}

describe("V2_04 color migration batch 5 — website editors", () => {
  it("removes raw HEX/RGB from Batch 5 editor CSS chrome", () => {
    for (const rel of BATCH5_CSS) {
      const left = [...rawGuiColors(read(rel))];
      assert.deepEqual(left, [], `${rel} still has raw GUI colors: ${left.join(", ")}`);
    }
  });

  it("maps editor alias roots to V2.04 editor/platform tokens", () => {
    const we = read("public/platform/website-inline-edit.css");
    assert.match(we, /--gp-we-primary:\s*var\(--color-brand-primary\)/);
    assert.match(we, /--gp-we-toolbar-bg:\s*var\(--editor-toolbar-bg\)/);
    assert.match(we, /--gp-we-error:\s*var\(--color-danger-text\)/);
    assert.doesNotMatch(we, /--gp-we-primary:\s*#/);

    const cm = read("public/platform/website-change-manager-ui.css");
    assert.match(cm, /--gp-cm-primary:\s*var\(--color-brand-primary\)/);
    assert.match(cm, /--gp-cm-success:\s*var\(--color-success-text\)/);
    assert.doesNotMatch(cm, /--gp-cm-primary:\s*#004357/);
  });

  it("ships editor component tokens in the platform color foundation", () => {
    const css = read("src/platform/ui/theme/colors.css");
    for (const tok of [
      "--editor-toolbar-bg",
      "--editor-selection-border",
      "--editor-edit-control-bg",
      "--editor-overlay-bg",
      "--editor-preview-banner-bg",
    ]) {
      assert.match(css, new RegExp(`${tok}\\s*:`));
    }
    assert.equal(read("src/platform/ui/theme/colors.css"), read("public/platform/theme/colors.css"));
  });

  it("does not invent appearance-named editor APIs", () => {
    for (const rel of BATCH5_CSS) {
      assert.doesNotMatch(read(rel), /--bb-editor-blue|--ac-editor-blue|--editor-purple|--church-green/);
    }
  });

  it("retains tenant branding placeholders as content colors (not editor chrome)", () => {
    assert.match(read("views/blessboard/v5/hq/website-branding.ejs"), /#6c5ce7/);
    assert.match(read("views/activeclinic/app/website-cms-branding.ejs"), /#006068/);
  });
});
