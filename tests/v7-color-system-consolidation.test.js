"use strict";

/**
 * V7 color-system consolidation — token contracts after BB+AC cleanup.
 */

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.join(__dirname, "..");

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), "utf8");
}

describe("V7 color system consolidation", () => {
  it("ActiveClinic public tokens stay canonical and separate info from success", () => {
    const tokens = read("public/activeclinic/ac-tokens.css");
    assert.match(tokens, /--acp-primary:\s*#006068/);
    assert.match(tokens, /--acp-focus:\s*var\(--acp-primary\)/);
    assert.match(tokens, /--ac-status-info:\s*#026aa2/);
    assert.match(tokens, /--ac-status-success:\s*#027a48/);
    assert.match(
      tokens,
      /\.ac-status-badge--success,\s*\n\.acp-status-badge--done\s*\{[\s\S]*?--ac-status-success-bg[\s\S]*?--ac-status-success/
    );
    assert.match(
      tokens,
      /\.ac-status-badge--info,\s*\n\.acp-status-badge--info\s*\{[\s\S]*?--ac-status-info-bg[\s\S]*?--ac-status-info/
    );
  });

  it("ActiveClinic platform CSS does not override public primary to #0d9488", () => {
    const platform = read("public/activeclinic/acw-platform.css");
    assert.doesNotMatch(platform, /--acp-primary:\s*#0d9488/);
    assert.doesNotMatch(platform, /--acp-primary:\s*#00685f/);
    assert.doesNotMatch(platform, /#008378/);
  });

  it("ActiveClinic public CSS uses tokens for tenant CTA and focus", () => {
    const css = read("public/activeclinic/ac-public.css");
    assert.doesNotMatch(css, /#0d9488/i);
    assert.doesNotMatch(css, /#1d59c1/i);
    assert.match(css, /\.ac-public-header--tenant \.ac-public-header__cta[\s\S]*var\(--acp-primary\)/);
    assert.match(css, /outline:\s*3px solid var\(--acp-focus\)/);
  });

  it("ActiveClinic branding default primary is canonical teal", () => {
    const branding = read("src/platform/website/branding.js");
    assert.match(branding, /primary:\s*"#006068"/);
    assert.doesNotMatch(branding, /primary:\s*"#0d9488"/);
  });

  it("BlessBoard registration theme uses canonical hover and page background", () => {
    const css = read("public/platform/gp-auth-reg.css");
    assert.match(
      css,
      /--gp-auth-primary-hover:\s*var\(--bb-color-primary-hover,\s*#5341cd\)/
    );
    assert.match(css, /--gp-auth-bg:\s*var\(--bb-color-page,\s*#fbf9f6\)/);
    assert.doesNotMatch(css, /#7d6ff0/);
    assert.doesNotMatch(css, /--bb-color-bg/);
  });

  it("shared website editor keeps platform purple separate from product primaries", () => {
    const editor = read("public/platform/website-inline-edit.css");
    assert.match(editor, /--gp-we-primary:\s*#630ed4/);
    assert.doesNotMatch(editor, /--acp-primary:\s*#/);
    assert.doesNotMatch(editor, /--bb-color-primary:\s*#/);
    assert.doesNotMatch(editor, /#1d59c1/);
  });

  it("ActiveClinic staff primary remains indigo", () => {
    const app = read("public/activeclinic/ac-app.css");
    assert.match(app, /--ac-primary:\s*#003c90/);
  });
});
