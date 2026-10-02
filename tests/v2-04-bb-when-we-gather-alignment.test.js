"use strict";

/**
 * V2.04 — BB desktop "When We Gather" alignment with homepage containers.
 * Desktop ≥900: content wrapper matches .bb-tp-container left/max.
 * Tablet/mobile: platform-public inner stays flush (pre-fix; no layout change).
 */

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.join(__dirname, "..");

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), "utf8");
}

function inlineStyles(...files) {
  return files.map((f) => `<style>${read(f)}</style>`).join("\n");
}

async function withPage(width, height, fn) {
  const { chromium } = require("playwright");
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({ viewport: { width, height } });
    await fn(page);
  } finally {
    await browser.close();
  }
}

const HOME_FIXTURE = `<!DOCTYPE html><html><body class="bb-tp-body">
  <main class="bb-tp-main">
    <section class="bb-tp-service-times bb-tp-service-times--band bb-tp-service-times--platform-public" data-bb-home-service-times="1">
      <div class="bb-tp-service-times__inner">
        <section class="gp-website-pc gp-website-pc--hours bb-tp-platform-bridge bb-tp-service-times-platform" data-gp-website-component="hours">
          <h2 class="gp-website-pc__title">When We Gather</h2>
          <ul class="gp-website-pc__hours-list">
            <li class="gp-website-pc__hours-row">
              <span class="gp-website-pc__hours-label">Sunday Worship</span>
              <span class="gp-website-pc__hours-time">10:00 AM</span>
            </li>
            <li class="gp-website-pc__hours-row">
              <span class="gp-website-pc__hours-label">Wednesday Midweek</span>
              <span class="gp-website-pc__hours-time">7:00 PM</span>
            </li>
          </ul>
        </section>
        <div class="bb-tp-service-times__actions">
          <a class="bb-tp-btn bb-tp-btn--primary" href="/contact">Plan Your Visit</a>
          <a class="bb-tp-btn bb-tp-btn--ghost" href="/contact">Get Directions</a>
        </div>
      </div>
    </section>
    <section class="bb-tp-container bb-tp-home-welcome" data-bb-home-welcome="1">
      <h2 class="bb-tp-section-title">A Place to Belong</h2>
      <p class="bb-tp-body">Welcome copy.</p>
    </section>
    <section class="bb-tp-container bb-tp-home-teaser" data-bb-home-ministries="1">
      <h2 class="bb-tp-section-title">Grow and Serve Together</h2>
      <p class="bb-tp-body">Ministries copy.</p>
    </section>
  </main>
</body></html>`;

const STYLE_FILES = [
  "public/blessboard/v5/design-tokens.css",
  "public/blessboard/v5/tenant-public.css",
  "public/platform/website-presentation-components.css",
];

describe("V2.04 BB When We Gather desktop alignment", () => {
  it("source: public path wraps platform hours + CTAs in shared __inner", () => {
    const partial = read("views/blessboard/v5/public/partials/service-times-block.ejs");
    assert.match(partial, /platform\/website\/components\/hours/);
    assert.match(partial, /bb-tp-service-times--platform-public/);
    assert.match(partial, /bb-tp-service-times__inner/);
    assert.match(partial, /Plan Your Visit/);
    assert.match(partial, /Get Directions/);
    // Public non-edit branch: band → __inner → hours + actions (before edit-mode else)
    const publicStart = partial.indexOf("<% if (!_editing) { %>");
    const editStart = partial.indexOf("aria-labelledby=\"bb-tp-service-times-heading\"");
    assert.ok(publicStart >= 0 && editStart > publicStart);
    const publicBlock = partial.slice(publicStart, editStart);
    const innerOpen = publicBlock.indexOf('class="bb-tp-service-times__inner"');
    const actionsOpen = publicBlock.indexOf('class="bb-tp-service-times__actions"');
    assert.ok(innerOpen > 0, "__inner present on public path");
    assert.ok(actionsOpen > innerOpen, "actions nested after __inner open");
    assert.match(publicBlock, /bb-tp-service-times--platform-public/);
  });

  it("source: desktop uses shared max-width; tablet/mobile platform-public stays flush", () => {
    const css = read("public/blessboard/v5/tenant-public.css");
    assert.match(css, /\.bb-tp-service-times__inner[\s\S]*max-width:\s*var\(--bb-max\)/);
    assert.match(
      css,
      /\.bb-tp-service-times--platform-public\s*>\s*\.bb-tp-service-times__inner[\s\S]*padding-left:\s*0/
    );
    assert.match(
      css,
      /@media \(max-width:\s*899px\)[\s\S]*\.bb-tp-service-times--platform-public\s*>\s*\.bb-tp-service-times__inner[\s\S]*max-width:\s*none/
    );
  });

  it("desktop 1440: When We Gather content left edge matches welcome/ministries containers", async () => {
    await withPage(1440, 900, async (page) => {
      await page.setContent(HOME_FIXTURE + inlineStyles(...STYLE_FILES));
      const edges = await page.evaluate(() => {
        const left = (sel) => {
          const el = document.querySelector(sel);
          return el ? Math.round(el.getBoundingClientRect().left) : null;
        };
        return {
          gatherInner: left(".bb-tp-service-times--platform-public > .bb-tp-service-times__inner"),
          gatherTitle: left(".bb-tp-service-times--platform-public .gp-website-pc__title"),
          gatherActions: left(".bb-tp-service-times--platform-public .bb-tp-service-times__actions a"),
          welcome: left(".bb-tp-home-welcome"),
          welcomeTitle: left(".bb-tp-home-welcome .bb-tp-section-title"),
          ministries: left(".bb-tp-home-teaser"),
          ministriesTitle: left(".bb-tp-home-teaser .bb-tp-section-title"),
          band: left(".bb-tp-service-times--platform-public"),
        };
      });
      // Shared content shell max-width band (home sections sit on the container edge)
      assert.equal(edges.welcome, 80, JSON.stringify(edges));
      assert.equal(edges.ministries, 80, JSON.stringify(edges));
      assert.equal(edges.gatherInner, 80, JSON.stringify(edges));
      assert.equal(edges.gatherTitle, edges.welcomeTitle, JSON.stringify(edges));
      assert.equal(edges.gatherTitle, edges.ministriesTitle, JSON.stringify(edges));
      assert.equal(edges.gatherActions, edges.welcomeTitle, JSON.stringify(edges));
      assert.equal(edges.gatherTitle, 80, JSON.stringify(edges));
      // Band itself may be full-bleed (left 0); content is what must align.
      assert.equal(edges.band, 0, JSON.stringify(edges));
    });
  });

  it("tablet 820: platform-public content stays flush (no new inset regression)", async () => {
    await withPage(820, 1024, async (page) => {
      await page.setContent(HOME_FIXTURE + inlineStyles(...STYLE_FILES));
      const edges = await page.evaluate(() => {
        const left = (sel) => Math.round(document.querySelector(sel).getBoundingClientRect().left);
        return {
          gatherTitle: left(".bb-tp-service-times--platform-public .gp-website-pc__title"),
          gatherActions: left(".bb-tp-service-times--platform-public .bb-tp-service-times__actions a"),
          gatherInner: left(".bb-tp-service-times--platform-public > .bb-tp-service-times__inner"),
          welcomeTitle: left(".bb-tp-home-welcome .bb-tp-section-title"),
        };
      });
      assert.equal(edges.gatherInner, 0, JSON.stringify(edges));
      assert.equal(edges.gatherTitle, 0, JSON.stringify(edges));
      assert.equal(edges.gatherActions, 0, JSON.stringify(edges));
      // Home welcome currently also flush (padding: 2rem 0 resets horizontal gutter).
      assert.equal(edges.welcomeTitle, 0, JSON.stringify(edges));
    });
  });

  it("mobile 390: platform-public content stays flush (no new inset regression)", async () => {
    await withPage(390, 844, async (page) => {
      await page.setContent(HOME_FIXTURE + inlineStyles(...STYLE_FILES));
      const edges = await page.evaluate(() => {
        const left = (sel) => Math.round(document.querySelector(sel).getBoundingClientRect().left);
        return {
          gatherTitle: left(".bb-tp-service-times--platform-public .gp-website-pc__title"),
          gatherActions: left(".bb-tp-service-times--platform-public .bb-tp-service-times__actions a"),
          gatherInner: left(".bb-tp-service-times--platform-public > .bb-tp-service-times__inner"),
          welcomeTitle: left(".bb-tp-home-welcome .bb-tp-section-title"),
        };
      });
      assert.equal(edges.gatherInner, 0, JSON.stringify(edges));
      assert.equal(edges.gatherTitle, 0, JSON.stringify(edges));
      assert.equal(edges.gatherActions, 0, JSON.stringify(edges));
      assert.equal(edges.welcomeTitle, 0, JSON.stringify(edges));
    });
  });
});
