"use strict";

/**
 * V7 shared website engine: authored media alt text must reach public rendering.
 *
 * The classic CMS and visual editor both persist alt text into
 * page_sections.layout_metadata.altText, and the public page model already
 * allowlists altText. Public templates previously discarded it by hardcoding
 * alt="" on CMS section images, so published alt text was never rendered.
 */

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");

const PUBLIC_DIR = path.join(__dirname, "..", "views", "blessboard", "v5", "public");
const MODEL = path.join(__dirname, "..", "src", "blessboard", "http", "loadTenantPublicPageModel.js");

function readPublicTemplates() {
  const out = [];
  for (const entry of fs.readdirSync(PUBLIC_DIR)) {
    const full = path.join(PUBLIC_DIR, entry);
    if (fs.statSync(full).isFile() && entry.endsWith(".ejs")) {
      out.push({ name: entry, source: fs.readFileSync(full, "utf8") });
    }
  }
  return out;
}

describe("V7 public media alt text rendering", () => {
  it("exposes altText through the public page model sanitizer", () => {
    const source = fs.readFileSync(MODEL, "utf8");
    assert.match(
      source,
      /if \(meta\.altText != null\) out\.altText = String\(meta\.altText\)/,
      "public page model must allowlist layout_metadata.altText"
    );
  });

  it("never renders a CMS section image with a hardcoded empty alt attribute", () => {
    const offenders = [];
    for (const { name, source } of readPublicTemplates()) {
      const re = /<img[^>]*src="<%=\s*(section|communitySection|welcomeMedia)[^"]*%>"[^>]*alt=""/g;
      if (re.test(source)) offenders.push(name);
    }
    assert.deepEqual(
      offenders,
      [],
      `CMS section images must bind alt to authored alt text, not alt="": ${offenders.join(", ")}`
    );
  });

  it("binds CMS section image alt attributes to layoutMetadata.altText", () => {
    const bound = [];
    for (const { name, source } of readPublicTemplates()) {
      if (/alt="<%=\s*\((section|communitySection)\.layoutMetadata && \1\.layoutMetadata\.altText\)/.test(source)) {
        bound.push(name);
      }
    }
    assert.ok(
      bound.length >= 8,
      `expected the shared section-image alt binding across public templates, found ${bound.length}: ${bound.join(", ")}`
    );
  });

  it("renders the home welcome image alt from authored alt text", () => {
    const source = fs.readFileSync(path.join(PUBLIC_DIR, "home.ejs"), "utf8");
    assert.match(
      source,
      /var welcomeMediaAlt = \(welcomeSection && welcomeSection\.layoutMetadata && welcomeSection\.layoutMetadata\.altText\) \|\| ''/,
      "home.ejs must derive welcomeMediaAlt from the welcome section metadata"
    );
    assert.match(
      source,
      /src="<%= welcomeMedia %>" alt="<%= welcomeMediaAlt %>"/,
      "home welcome image must render the authored alt text"
    );
  });

  it("prefers authored hero alt text over the generated fallback", () => {
    const source = fs.readFileSync(path.join(PUBLIC_DIR, "partials", "page-hero.ejs"), "utf8");
    assert.match(
      source,
      /if \(_meta\.altText\) _mediaAlt = _meta\.altText;/,
      "page-hero must prefer authored altText from hero layout metadata"
    );
    assert.match(source, /alt="<%= _mediaAlt %>"/, "page-hero must render the resolved alt text");
  });

  it("round-trips authored alt text back into the inline image editor payload", () => {
    const offenders = [];
    for (const { name, source } of readPublicTemplates()) {
      if (/editKind: 'image'/.test(source) && /altText: ''/.test(source)) offenders.push(name);
    }
    assert.deepEqual(
      offenders,
      [],
      `inline image editors must seed altText from stored metadata: ${offenders.join(", ")}`
    );
  });
});
