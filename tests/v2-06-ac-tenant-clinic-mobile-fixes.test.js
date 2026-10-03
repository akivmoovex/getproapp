"use strict";

/**
 * V2.06 — AC tenant clinic mobile fixes:
 * - clinic-website.ejs unified (no desktop/mobile duplicate content paths)
 * - utility location stays fully legible at 390/360 (DOM Lusaka)
 * - Add Section FAB does not cover body text at ~390
 */

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { chromium } = require("playwright");

const ROOT = path.join(__dirname, "..");

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), "utf8");
}

describe("V2.06 AC tenant clinic mobile fixes", () => {
  it("clinic-website.ejs has one content path (no acw-only desktop/mobile splits)", () => {
    const src = read("views/activeclinic/public/clinic-website.ejs");
    assert.match(src, /Your Clinic, Branded and Online/);
    assert.match(src, /Everything You Need to Get Online/);
    assert.match(src, /Built on ActiveClinic/);
    assert.match(src, /Ready to go digital/);
    assert.doesNotMatch(src, /acw-only-desktop|acw-only-mobile|acw-hero--mobile/);
    assert.doesNotMatch(src, /Branded Clinic Websites, Effortlessly/);
    assert.doesNotMatch(src, /Ready to Elevate Your Practice/);
    assert.equal((src.match(/<section class="acw-hero/g) || []).length, 1);
  });

  it("utility CSS avoids mid-word clip; Add Section CSS clears body on narrow editor", () => {
    const ac = read("public/activeclinic/ac-public.css");
    assert.match(ac, /ac-public-utility__item--location/);
    assert.match(ac, /word-break:\s*keep-all|overflow-wrap:\s*normal/);
    assert.doesNotMatch(
      ac.match(/\.ac-public-utility__value\s*\{[\s\S]*?\}/)[0],
      /overflow-wrap:\s*anywhere/
    );

    const add = read("public/platform/website-add-section.css");
    assert.match(add, /data-website-add-section-open/);
    assert.match(add, /padding-bottom:\s*calc\(7\.75rem/);
    assert.match(add, /\.ac-public-main/);
  });

  it("location Lusaka and Add Section clearance hold at 1440/768/390/360", async () => {
    const acCss = read("public/activeclinic/ac-public.css");
    const addCss = read("public/platform/website-add-section.css");
    const browser = await chromium.launch({ headless: true });
    try {
      for (const width of [1440, 768, 390, 360]) {
        const page = await browser.newPage({ viewport: { width, height: 844 } });
        await page.setContent(
          `<!doctype html><html><head>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<style>
*,*::before,*::after{box-sizing:border-box}
:root{--acp-navy:#0f172a;--acp-primary:#0d9488;--acp-primary-strong:#0f766e;--acp-muted:#475569;
  --acp-surface:#fff;--acp-border:#e2e8f0;--acp-touch:2.75rem;--acp-primary-soft:#ccfbf1;
  --acp-surface-low:#f8fafc;--ac-touch:2.75rem;--acp-ink:#0f172a;--acp-gutter:1rem;--acp-max:72rem;
  --acp-radius:0.75rem;--ac-status-danger:#b91c1c;--ac-status-danger-bg:#fef2f2;--acp-safe-bottom:0px;
  --acp-bottom-nav-h:4rem;--color-brand-primary:#0d9488;--color-text-inverse:#fff;
  --color-text-primary:#0f172a;--color-surface:#fff;--color-border-default:#e2e8f0;
  --color-danger-bg:#fef2f2;--color-danger-border:#fecaca;--color-danger-text:#991b1b;
  --editor-overlay-bg:rgba(15,23,42,.4);--editor-outline:#cbd5e1;--gp-we-toolbar-h:3.5rem;}
body{margin:0;font-family:system-ui,sans-serif}
${acCss}
${addCss}
</style></head>
<body class="ac-public-body gp-website-editor-open" data-website-editing="1">
<div class="ac-public-utility" data-ac-public-utility="1">
  <div class="ac-public-utility__inner">
    <p class="ac-public-utility__item ac-public-utility__item--phone">
      <span class="ac-public-utility__label">Clinic line</span>
      <a class="ac-public-utility__value ac-public-utility__value--emphasis" href="tel:+260971234567">+260 97 123 4567</a>
    </p>
    <p class="ac-public-utility__item ac-public-utility__item--hours">
      <span class="ac-public-utility__label">Hours</span>
      <span class="ac-public-utility__value">Mon–Thu 08:00–17:00 · Fri 08:00–13:00</span>
    </p>
    <p class="ac-public-utility__item ac-public-utility__item--location">
      <span class="ac-public-utility__label">Location</span>
      <a class="ac-public-utility__value" href="/location" data-ac-nav-item="location">Lusaka</a>
    </p>
  </div>
</div>
<main class="ac-public-main" data-website-page-root="1">
  <p data-ac-body-probe="1">Patient-ready clinic body copy that must remain readable above the Add Section control.</p>
  <p>Secondary paragraph for scroll clearance.</p>
  <p>Tertiary paragraph near the end of the content column.</p>
</main>
<button type="button" class="gp-website-editor__add-section" data-website-add-section-open="1" aria-label="Add section">
  <span>Add section</span>
</button>
</body></html>`,
          { waitUntil: "load" }
        );

        const m = await page.evaluate(() => {
          const loc = document.querySelector(
            ".ac-public-utility__item--location .ac-public-utility__value"
          );
          const add = document.querySelector("[data-website-add-section-open]");
          const probe = document.querySelector("[data-ac-body-probe]");
          const text = loc.textContent;
          const node = loc.firstChild;
          const visible = [];
          for (let i = 0; i < text.length; i++) {
            const range = document.createRange();
            range.setStart(node, i);
            range.setEnd(node, i + 1);
            const rr = range.getClientRects()[0];
            if (!rr || rr.width < 0.2) continue;
            const clip = loc.getBoundingClientRect();
            if (
              rr.right > clip.left + 0.5 &&
              rr.left < clip.right - 0.5 &&
              rr.bottom > clip.top + 0.5 &&
              rr.top < clip.bottom - 0.5
            ) {
              visible.push(text[i]);
            }
          }
          const A = probe.getBoundingClientRect();
          const B = add.getBoundingClientRect();
          const ox = Math.max(0, Math.min(A.right, B.right) - Math.max(A.left, B.left));
          const oy = Math.max(0, Math.min(A.bottom, B.bottom) - Math.max(A.top, B.top));
          const main = document.querySelector(".ac-public-main");
          const pb = parseFloat(getComputedStyle(main).paddingBottom) || 0;
          return {
            dom: text.trim(),
            visible: visible.join(""),
            overlapArea: ox * oy,
            paddingBottom: pb,
            overflow: document.documentElement.scrollWidth > window.innerWidth + 1,
          };
        });

        assert.equal(m.dom, "Lusaka", `${width}px location DOM`);
        assert.equal(m.visible, "Lusaka", `${width}px location visible (not aka)`);
        assert.equal(m.overflow, false, `${width}px horizontal overflow`);
        if (width <= 768) {
          assert.ok(m.paddingBottom >= 100, `${width}px main padding-bottom for Add Section`);
        }
        assert.equal(m.overlapArea, 0, `${width}px Add Section overlaps body probe`);
        await page.close();
      }
    } finally {
      await browser.close();
    }
  });
});
