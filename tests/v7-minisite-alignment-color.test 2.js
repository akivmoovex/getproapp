"use strict";

/**
 * V7 Mini-Website Bug Fix 05 — alignment grid + product color token contracts.
 */

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.join(__dirname, "..");

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), "utf8");
}

describe("V7 minisite alignment + color system", () => {
  it("ActiveClinic tenant pages share canonical content grid primitive", () => {
    const css = read("public/activeclinic/ac-public.css");
    assert.match(css, /body\.ac-public--tenant \.ac-public-section/);
    assert.match(css, /body\.ac-public--tenant \.acp-page/);
    assert.match(css, /max-width:\s*var\(--acp-max\)/);
    assert.match(css, /padding-inline:\s*var\(--acp-gutter\)/);
    assert.match(css, /\.ac-public-header__inner[\s\S]*padding:\s*0\.85rem var\(--acp-gutter\)/);
    assert.match(css, /\.ac-tenant-hero[\s\S]*padding:\s*2\.5rem var\(--acp-gutter\)/);
  });

  it("BlessBoard tenant public bands use unified desktop gutter", () => {
    const css = read("public/blessboard/v5/tenant-public.css");
    assert.match(css, /\.bb-tp-hero__inner--overlay[\s\S]*padding:\s*2\.25rem var\(--bb-gutter\)/);
    assert.match(css, /\.bb-tp-service-times__inner[\s\S]*padding:\s*0 var\(--bb-gutter\)/);
    assert.match(css, /\.bb-tp-hero__inner--overlay[\s\S]*padding-left:\s*var\(--bb-gutter-mobile/);
  });

  it("product semantic token aliases exist for both products", () => {
    const ac = read("public/activeclinic/ac-tokens.css");
    const bb = read("public/blessboard/v5/design-tokens.css");
    assert.match(ac, /--product-primary:\s*var\(--acp-primary\)/);
    assert.match(bb, /--product-primary:\s*var\(--bb-color-primary\)/);
    assert.match(ac, /--product-muted:\s*var\(--acp-muted\)/);
    assert.match(bb, /--product-muted:\s*var\(--bb-color-muted\)/);
  });

  it("shared website editor retains platform tokens separate from product UI", () => {
    const editor = read("public/platform/website-inline-edit.css");
    assert.match(editor, /--gp-we-primary/);
    assert.doesNotMatch(editor, /--acp-primary:\s*#/);
    assert.doesNotMatch(editor, /--bb-color-primary:\s*#/);
  });

  it("ActiveClinic tenant drift colors replaced with semantic tokens", () => {
    const css = read("public/activeclinic/ac-public.css");
    assert.match(css, /\.ac-tenant-section-link[\s\S]*color:\s*var\(--acp-muted\)/);
    assert.match(css, /\.acp-page-hero h1[\s\S]*color:\s*var\(--acp-navy\)/);
    assert.match(css, /\.ac-tenant-hours-card[\s\S]*border:\s*1px solid var\(--acp-border\)/);
  });

  it("Chromium measures consistent tenant section left edges at 1440px", async () => {
    const { chromium } = require("playwright");
    const browser = await chromium.launch({ headless: true });
    try {
      const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
      const html = `<!DOCTYPE html><html><head></head><body class="ac-public-body ac-public--tenant">
        <header class="ac-public-header ac-public-header--tenant"><div class="ac-public-header__inner ac-public-header__inner--tenant"><span>Clinic</span></div></header>
        <main class="ac-public-main">
          <section class="ac-tenant-hero"><h1>Hero</h1></section>
          <section class="ac-public-section ac-tenant-services-grid"><h2>Services</h2></section>
          <article class="acp-page"><h1>About</h1></article>
        </main>
        <footer class="ac-public-footer ac-public-footer--tenant"><div class="ac-public-footer__inner ac-public-footer__inner--tenant">Footer</div></footer>
      </body></html>`;
      await page.setContent(html, { waitUntil: "load" });
      await page.addStyleTag({ content: read("public/activeclinic/ac-tokens.css") });
      await page.addStyleTag({ content: read("public/activeclinic/ac-public.css") });
      const edges = await page.evaluate(() => {
        const sectionLeft = (sel) => {
          const el = document.querySelector(sel);
          if (!el) return null;
          return Math.round(el.getBoundingClientRect().left);
        };
        const contentLeft = (sel, childSel) => {
          const el = document.querySelector(sel);
          const child = childSel ? el && el.querySelector(childSel) : el;
          if (!child) return null;
          return Math.round(child.getBoundingClientRect().left);
        };
        return {
          header: sectionLeft(".ac-public-header__inner"),
          heroSection: sectionLeft(".ac-tenant-hero"),
          servicesSection: sectionLeft(".ac-tenant-services-grid"),
          aboutSection: sectionLeft(".acp-page"),
          footer: sectionLeft(".ac-public-footer__inner--tenant"),
          heroHeading: contentLeft(".ac-tenant-hero", "h1"),
          servicesHeading: contentLeft(".ac-tenant-services-grid", "h2"),
          aboutHeading: contentLeft(".acp-page", "h1"),
        };
      });
      const bandEdges = [
        edges.header,
        edges.heroSection,
        edges.servicesSection,
        edges.aboutSection,
        edges.footer,
      ].filter((v) => v != null);
      const contentEdges = [edges.heroHeading, edges.servicesHeading, edges.aboutHeading].filter((v) => v != null);
      const bandSpread = Math.max(...bandEdges) - Math.min(...bandEdges);
      const contentSpread = Math.max(...contentEdges) - Math.min(...contentEdges);
      assert.ok(bandSpread <= 2, `section bands diverged: ${JSON.stringify(edges)}`);
      assert.ok(contentSpread <= 2, `content edges diverged: ${JSON.stringify(edges)}`);
    } finally {
      await browser.close();
    }
  });
});
