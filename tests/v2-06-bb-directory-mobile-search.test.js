"use strict";

/**
 * V2.06 P2 — BB /directory mobile search: usable input + Search button layout.
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

function buildHtml() {
  const css = read("public/blessboard/v5/apex.css");
  return `<!doctype html><html><head>
<style>
:root {
  --bb-color-border: #c9cdd4;
  --bb-color-muted: #5b6470;
  --bb-color-primary: #0f766e;
  --color-surface: #fff;
  --bb-radius-md: 0.75rem;
}
body { margin: 0; font-family: system-ui, sans-serif; }
.bb-apex-container { max-width: 72rem; margin: 0 auto; padding: 0 1.25rem; }
.bb-apex-btn {
  display: inline-flex; align-items: center; justify-content: center;
  padding: 0.65rem 1.1rem; border-radius: 999px; border: 0; font: inherit; font-weight: 600;
}
.bb-apex-btn--primary { background: var(--bb-color-primary); color: #fff; }
.material-symbols-outlined { font-size: 1.35rem; line-height: 1; }
${css}
</style></head>
<body class="bb-apex-body">
<section class="bb-apex-section"><div class="bb-apex-container">
<form class="bb-apex-directory-search" method="get" action="/directory" role="search">
  <label class="bb-apex-sr-only" for="bb-directory-q">Search churches</label>
  <div class="bb-apex-directory-search__row">
    <span class="material-symbols-outlined" aria-hidden="true">search</span>
    <input id="bb-directory-q" name="q" type="search"
      placeholder="Search by church name, city, or location" maxlength="80" autocomplete="off"/>
    <button class="bb-apex-btn bb-apex-btn--primary" type="submit">Search</button>
  </div>
</form>
</div></section>
</body></html>`;
}

describe("V2.06 BB directory mobile search", () => {
  it("is BB-local apex CSS (not shared gp-search-bar)", () => {
    const ejs = read("views/blessboard/v5/apex/directory.ejs");
    const css = read("public/blessboard/v5/apex.css");
    assert.match(ejs, /bb-apex-directory-search__row/);
    assert.doesNotMatch(ejs, /gp-search-bar/);
    assert.match(css, /@media \(max-width: 480px\)[\s\S]*bb-apex-directory-search__row/);
    assert.match(css, /grid-template-columns:\s*auto minmax\(0,\s*1fr\)/);
  });

  it("desktop unchanged; mobile stacks cleanly without overflow/overlap", async () => {
    const html = buildHtml();
    const browser = await chromium.launch({ headless: true });
    try {
      for (const width of [1440, 768, 390, 360]) {
        const page = await browser.newPage({ viewport: { width, height: 800 } });
        await page.setContent(html, { waitUntil: "load" });
        const m = await page.evaluate(() => {
          const input = document.querySelector("#bb-directory-q");
          const btn = document.querySelector(".bb-apex-directory-search__row .bb-apex-btn");
          const row = document.querySelector(".bb-apex-directory-search__row");
          const ir = input.getBoundingClientRect();
          const br = btn.getBoundingClientRect();
          const rr = row.getBoundingClientRect();
          const overlap = !(
            br.left >= ir.right - 1 ||
            br.right <= ir.left + 1 ||
            br.top >= ir.bottom - 1 ||
            br.bottom <= ir.top + 1
          );
          return {
            overflow: document.documentElement.scrollWidth > window.innerWidth + 1,
            scrollW: document.documentElement.scrollWidth,
            inputW: ir.width,
            btnW: br.width,
            rowW: rr.width,
            btnRightOfInput: br.left >= ir.right - 2,
            stacked: br.top > ir.bottom - 2,
            overlap,
            btnInsideInput:
              br.left >= ir.left &&
              br.right <= ir.right &&
              br.top >= ir.top &&
              br.bottom <= ir.bottom,
            display: getComputedStyle(row).display,
          };
        });

        assert.equal(m.overflow, false, `${width}px horizontal overflow (${m.scrollW})`);
        assert.equal(m.overlap, false, `${width}px button overlaps input`);
        assert.equal(m.btnInsideInput, false, `${width}px button inside input`);
        assert.ok(m.inputW > 120, `${width}px input too narrow: ${m.inputW}`);

        if (width >= 768) {
          assert.equal(m.btnRightOfInput, true, `${width}px Search should sit to the right of input`);
          assert.equal(m.stacked, false, `${width}px must not stack`);
          assert.equal(m.display, "flex", `${width}px desktop row stays flex`);
          assert.ok(m.btnW < m.rowW * 0.5, `${width}px button should stay compact`);
        } else {
          assert.equal(m.stacked, true, `${width}px should stack Search below input`);
          assert.equal(m.display, "grid", `${width}px mobile uses stacked grid`);
          // Full grid width (row padding excluded from button box).
          assert.ok(
            m.btnW >= m.rowW * 0.85 && m.btnW >= m.inputW,
            `${width}px Search button should span the stacked row (btn=${m.btnW} row=${m.rowW} input=${m.inputW})`
          );
          // Input shares row with icon only — must be most of the row.
          assert.ok(
            m.inputW >= m.rowW * 0.65,
            `${width}px input should use most of the row (input=${m.inputW} row=${m.rowW})`
          );
        }
        await page.close();
      }
    } finally {
      await browser.close();
    }
  });
});
