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

  it("ActiveClinic patient CSS uses status and neutral tokens (no alert hex drift)", () => {
    const css = read("public/activeclinic/ac-patient.css");
    assert.match(css, /\.ac-patient-alert--error[\s\S]*var\(--ac-status-danger\)/);
    assert.match(css, /\.ac-patient-alert--success[\s\S]*var\(--ac-status-success\)/);
    assert.match(css, /\.ac-patient-honesty[\s\S]*var\(--ac-status-warning-bg\)/);
    assert.doesNotMatch(css, /#c53030|#e53e3e|#276749|#38a169|#fbd38d/);
    assert.doesNotMatch(css, /#0d9488/i);
  });

  it("ActiveClinic V7 CSS tree has no active #0d9488 drift", () => {
    const acDir = path.join(ROOT, "public/activeclinic");
    const files = fs.readdirSync(acDir).filter((f) => f.endsWith(".css"));
    for (const file of files) {
      const content = read(`public/activeclinic/${file}`);
      assert.doesNotMatch(content, /#0d9488/i, `${file} must not contain legacy teal drift`);
    }
  });

  it("legacy theme palette files are marked and isolated from V7 shells", () => {
    assert.match(read("public/theme.css"), /LEGACY_COMPATIBILITY.*#0d9488/s);
    assert.match(read("public/styles.css"), /LEGACY_COMPATIBILITY.*#0d9488/s);
    assert.match(read("public/theme-colors.css"), /LEGACY_COMPATIBILITY.*not loaded by V7/s);
  });

  it("Website Hub documents staff-management context and uses staff primary", () => {
    const css = read("public/activeclinic/website-cms.css");
    assert.match(css, /staff-management surface/);
    assert.match(css, /--ac-mw-primary:\s*var\(--ac-primary/);
  });

  it("BlessBoard church legacy aliases align primary with V5 canonical violet", () => {
    const css = read("public/church/church.css");
    assert.match(css, /--church-primary:\s*#6c5ce7/);
    assert.match(css, /--church-primary-container:\s*#5341cd/);
  });

  it("BlessBoard design tokens define orange decorative vs readable roles", () => {
    const tokens = read("public/blessboard/v5/design-tokens.css");
    assert.match(tokens, /--bb-color-accent:\s*#ff9800/);
    assert.match(tokens, /--bb-color-accent-readable:\s*#c2410c/);
    assert.match(tokens, /Decorative GetPro orange/);
    assert.match(tokens, /Accessible orange for small text/);
  });

  it("BlessBoard HQ admin removes obvious literal violet hover and gradient drift", () => {
    const css = read("public/blessboard/v5/hq-admin.css");
    assert.doesNotMatch(css, /background:\s*#5341cd/);
    assert.doesNotMatch(css, /linear-gradient\(135deg,\s*#6c5ce7\s*0%,\s*#5341cd\s*100%\)/);
    assert.match(css, /--bb-wm-primary:\s*var\(--bb-color-primary\)/);
  });
});
