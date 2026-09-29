"use strict";

/**
 * V2.04 Batch 1 — shared platform components color token migration.
 */

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");

const BATCH1_FILES = [
  "public/platform/gp-ops-shared.css",
  "public/platform/gp-auth-reg.css",
  "public/platform/forms-builder.css",
  "public/platform/announcements.css",
  "public/platform/phone-field.css",
  "public/platform/location-autocomplete.css",
  "public/platform/release-notes-center.css",
];

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), "utf8");
}

describe("V2_04 color migration batch 1 — shared platform components", () => {
  it("removes raw HEX/RGB literals from Batch 1 shared component CSS", () => {
    const hex = /#[0-9a-fA-F]{3,8}\b/;
    const rgb = /rgba?\(/i;
    for (const rel of BATCH1_FILES) {
      const css = read(rel);
      assert.equal(hex.test(css), false, `${rel} still contains HEX`);
      assert.equal(rgb.test(css), false, `${rel} still contains rgb()/rgba()`);
    }
  });

  it("wires shared buttons/inputs/badges to V2.04 semantic component tokens", () => {
    const ops = read("public/platform/gp-ops-shared.css");
    assert.match(ops, /--button-primary-bg/);
    assert.match(ops, /--button-primary-bg-hover/);
    assert.match(ops, /--button-primary-text/);
    assert.match(ops, /--input-border/);
    assert.match(ops, /--input-border-focus/);
    assert.match(ops, /--badge-success-bg/);
    assert.match(ops, /--badge-danger-text/);
    assert.match(ops, /--nav-active-bg/);
    assert.match(ops, /--card-bg/);
    assert.match(ops, /--table-row-hover/);
    // product-agnostic brand inheritance
    assert.match(ops, /--color-brand-primary/);
    assert.doesNotMatch(ops, /--bb-button/);
    assert.doesNotMatch(ops, /--ac-button/);
  });

  it("maps auth-reg / forms / announcements product chrome to brand tokens", () => {
    const auth = read("public/platform/gp-auth-reg.css");
    assert.match(auth, /--gp-auth-primary:\s*var\(--color-brand-primary\)/);
    assert.match(auth, /data-gp-product="blessboard"/);
    assert.match(auth, /data-gp-product="activeclinic"/);
    assert.match(auth, /data-product="blessboard"/);
    assert.match(auth, /data-product="activeclinic"/);

    const forms = read("public/platform/forms-builder.css");
    assert.match(forms, /--mx-forms-accent:\s*var\(--color-brand-primary\)/);
    assert.match(forms, /--badge-success-bg/);

    const ann = read("public/platform/announcements.css");
    assert.match(ann, /--mx-ann-accent:\s*var\(--color-brand-primary\)/);
    assert.match(ann, /--color-danger-bg/);
  });

  it("keeps platform colors partial loading for BB and AC shells", () => {
    assert.match(read("views/blessboard/v5/partials/head-design-system.ejs"), /head-platform-colors/);
    assert.match(read("views/activeclinic/layouts/app-shell.ejs"), /head-platform-colors/);
    assert.match(read("views/activeclinic/layouts/auth-shell.ejs"), /head-platform-colors/);
  });
});
