"use strict";

/**
 * V2.04 Batch 4 — BlessBoard management + member application color migration.
 */

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");

const BATCH4_SCANNABLE = [
  "public/blessboard/v5/platform-admin.css",
  "public/blessboard/v5/hq-admin.css",
  "public/blessboard/v5/branch-admin.css",
  "public/blessboard/v5/member-portal.css",
  "public/blessboard/v5/media-picker.css",
  "public/blessboard/v5/bb-urp.css",
  "public/church/church.css",
];

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), "utf8");
}

function nonVarDefLines(css) {
  return css.split(/\r?\n/).filter((line) => {
    const t = line.trim();
    if (/^\s*--[\w-]+\s*:/.test(line)) return false;
    if (t.startsWith("/*") || t.startsWith("*") || t.startsWith("//")) return false;
    return true;
  });
}

describe("V2_04 color migration batch 4 — BlessBoard management/member", () => {
  it("removes raw HEX/RGB literals from Batch 4 scannable application CSS", () => {
    const hex = /#[0-9a-fA-F]{3,8}\b/;
    const rgb = /rgba?\(/i;
    for (const rel of BATCH4_SCANNABLE) {
      for (const line of nonVarDefLines(read(rel))) {
        assert.equal(hex.test(line), false, `${rel} HEX: ${line.trim().slice(0, 100)}`);
        assert.equal(rgb.test(line), false, `${rel} RGB: ${line.trim().slice(0, 100)}`);
      }
    }
  });

  it("bridges design-tokens and church aliases to V2.04 platform brand tokens", () => {
    const tok = read("public/blessboard/v5/design-tokens.css");
    assert.match(tok, /--bb-color-primary:\s*var\(--color-brand-primary\)/);
    assert.match(tok, /--bb-color-error:\s*var\(--color-danger-text\)/);
    assert.match(tok, /--status-published-bg:\s*var\(--badge-success-bg\)/);
    assert.doesNotMatch(tok, /--bb-color-primary:\s*#6c5ce7/i);

    const church = read("public/church/church.css");
    assert.match(church, /--church-primary:\s*var\(--color-brand-primary\)/);
    assert.match(church, /--church-surface:\s*var\(--color-background\)/);
    assert.match(church, /--church-error:\s*var\(--color-danger-text\)/);
  });

  it("keeps BB product selectors on management shells", () => {
    assert.match(read("views/blessboard/v5/partials/hq-shell-start.ejs"), /data-product="blessboard"/);
    assert.match(read("views/blessboard/v5/partials/head-design-system.ejs"), /head-platform-colors/);
    assert.match(read("views/church/partials/hq_shell_start.ejs"), /data-product="blessboard"/);
  });

  it("does not invent appearance-named color APIs", () => {
    for (const rel of BATCH4_SCANNABLE) {
      assert.doesNotMatch(read(rel), /--church-green|--sermon-blue|--bb-gold-2/);
    }
  });
});
