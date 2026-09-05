"use strict";

/**
 * V7 layout-family horizontal contract — tokens, classes, and measured geometry.
 * Source of truth: layout alignment audit (Wave 1) + product layout families.
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

function leftOf(page, selector) {
  return page.evaluate((sel) => {
    const el = document.querySelector(sel);
    if (!el) return null;
    return Math.round(el.getBoundingClientRect().left * 10) / 10;
  }, selector);
}

describe("V7 layout family — token and class contracts", () => {
  it("ActiveClinic clinic mini-site uses --acp-max and --acp-gutter primitives", () => {
    const tokens = read("public/activeclinic/ac-tokens.css");
    const css = read("public/activeclinic/ac-public.css");
    assert.match(tokens, /--acp-max:\s*75rem/);
    assert.match(tokens, /--acp-gutter:/);
    assert.match(css, /body\.ac-public--tenant \.acp-page[\s\S]*max-width:\s*var\(--acp-max\)/);
    assert.match(css, /padding-inline:\s*var\(--acp-gutter\)/);
    assert.match(css, /@media \(max-width:\s*767px\)[\s\S]*--acp-gutter:\s*1rem/);
  });

  it("ActiveClinic platform public uses --acw-max band", () => {
    const css = read("public/activeclinic/acw-platform.css");
    assert.match(css, /--acw-max:\s*80rem/);
    assert.match(css, /max-width:\s*var\(--acw-max\)/);
  });

  it("ActiveClinic staff app uses sidebar + content max tokens", () => {
    const css = read("public/activeclinic/ac-app.css");
    assert.match(css, /--ac-sidebar-w:\s*16\.5rem/);
    assert.match(css, /--ac-content-max:\s*72rem/);
    assert.match(css, /max-width:\s*var\(--ac-content-max\)/);
  });

  it("ActiveClinic Website Hub is a separate CMS shell family", () => {
    const css = read("public/activeclinic/website-cms.css");
    assert.match(css, /Layout family:\s*AC Website Hub \(INTENTIONAL_EXCEPTION\)/);
    assert.match(css, /\.ac-app-body--mw \.ac-content[\s\S]*max-width:\s*none/);
  });

  it("BlessBoard public + church mini-site use --bb-max and gutter tokens", () => {
    const tokens = read("public/blessboard/v5/design-tokens.css");
    const tp = read("public/blessboard/v5/tenant-public.css");
    const apex = read("public/blessboard/v5/apex.css");
    assert.match(tokens, /--bb-max:\s*80rem/);
    assert.match(tokens, /--bb-gutter-mobile:\s*1rem/);
    assert.match(tp, /\.bb-tp-container[\s\S]*max-width:\s*var\(--bb-max\)/);
    assert.match(apex, /max-width:\s*var\(--bb-max/);
  });

  it("BlessBoard HQ and branch admin share shell content max + sidebar width tokens", () => {
    const tokens = read("public/blessboard/v5/design-tokens.css");
    const hq = read("public/blessboard/v5/hq-admin.css");
    const ba = read("public/blessboard/v5/branch-admin.css");
    assert.match(tokens, /--bb-shell-content-max:\s*64rem/);
    assert.match(tokens, /--bb-sidebar-w:\s*16\.5rem/);
    assert.match(hq, /max-width:\s*var\(--bb-shell-content-max/);
    assert.match(hq, /grid-template-columns:\s*var\(--bb-sidebar-w/);
    assert.match(ba, /max-width:\s*var\(--bb-shell-content-max/);
    assert.match(ba, /grid-template-columns:\s*var\(--bb-sidebar-w/);
  });

  it("auth families use narrow max-width bands", () => {
    const bb = read("public/blessboard/v5/design-tokens.css");
    const acAuth = read("public/activeclinic/ac-auth.css");
    assert.match(bb, /--bb-max-narrow:\s*40rem/);
    assert.match(acAuth, /\.ac-auth-card--single[\s\S]*max-width:\s*24rem/);
  });
});

describe("V7 layout family — measured geometry", () => {
  it("AC clinic mini-site shares 120px band edges at 1440 across page types", async () => {
    await withPage(1440, 900, async (page) => {
      const html = `<!DOCTYPE html><html><body class="ac-public-body ac-public--tenant">
        <header class="ac-public-header ac-public-header--tenant"><div class="ac-public-header__inner ac-public-header__inner--tenant">H</div></header>
        <main class="ac-public-main">
          <section class="ac-tenant-hero"><h1>Home</h1></section>
          <section class="ac-public-section ac-tenant-services-grid"><h2>Services</h2></section>
          <article class="acp-page"><header class="acp-page-hero"><h1>About</h1></header></article>
          <article class="acp-page acp-contact-layout"><header class="acp-page-hero"><h1>Contact</h1></header></article>
        </main>
      </body></html>`;
      await page.setContent(html + inlineStyles("public/activeclinic/ac-tokens.css", "public/activeclinic/ac-public.css"));
      const edges = await page.evaluate(() => {
        const left = (sel) => Math.round(document.querySelector(sel).getBoundingClientRect().left);
        return {
          header: left(".ac-public-header__inner"),
          hero: left(".ac-tenant-hero"),
          services: left(".ac-tenant-services-grid"),
          about: left(".acp-page"),
          contact: left(".acp-contact-layout"),
        };
      });
      const vals = Object.values(edges);
      assert.ok(vals.every((v) => v === 120), JSON.stringify(edges));
    });
  });

  it("AC clinic mini-site uses 16px inner h1 gutter at 390", async () => {
    await withPage(390, 844, async (page) => {
      const html = `<!DOCTYPE html><html><body class="ac-public-body ac-public--tenant">
        <main class="ac-public-main">
          <article class="acp-page"><header class="acp-page-hero"><h1>About</h1></header></article>
        </main>
      </body></html>`;
      await page.setContent(html + inlineStyles("public/activeclinic/ac-tokens.css", "public/activeclinic/ac-public.css"));
      const h1Left = await leftOf(page, ".acp-page-hero h1");
      assert.equal(h1Left, 16);
    });
  });

  it("BB church inner pages share 80px container band at 1440", async () => {
    await withPage(1440, 900, async (page) => {
      const html = `<!DOCTYPE html><html><body class="bb-tp-body">
        <header class="bb-tp-header"><div class="bb-tp-header__inner">H</div></header>
        <main class="bb-tp-main">
          <div class="bb-tp-container bb-tp-page-about"><h1>About</h1></div>
          <div class="bb-tp-container bb-tp-page-leadership"><h1>Leadership</h1></div>
        </main>
      </body></html>`;
      await page.setContent(html + inlineStyles("public/blessboard/v5/design-tokens.css", "public/blessboard/v5/tenant-public.css"));
      const edges = await page.evaluate(() => {
        const left = (sel) => Math.round(document.querySelector(sel).getBoundingClientRect().left);
        return {
          header: left(".bb-tp-header__inner"),
          about: left(".bb-tp-page-about"),
          leadership: left(".bb-tp-page-leadership"),
        };
      });
      assert.equal(edges.header, 80);
      assert.equal(edges.about, 80);
      assert.equal(edges.leadership, 80);
    });
  });

  it("BB church inner pages use 16px h1 gutter at 390", async () => {
    await withPage(390, 844, async (page) => {
      const html = `<!DOCTYPE html><html><body class="bb-tp-body">
        <main class="bb-tp-main"><div class="bb-tp-container"><h1>About</h1></div></main>
      </body></html>`;
      await page.setContent(html + inlineStyles("public/blessboard/v5/design-tokens.css", "public/blessboard/v5/tenant-public.css"));
      const h1Left = await leftOf(page, "main h1");
      assert.equal(h1Left, 16);
    });
  });

  it("AC staff shell sibling pages share .ac-content left at 1440", async () => {
    await withPage(1440, 900, async (page) => {
      const shell = (label) => `<div class="ac-app"><aside class="ac-sidebar" style="display:flex">Nav</aside><div class="ac-main-wrap"><main class="ac-content"><h1>${label}</h1></main></div></div>`;
      await page.setContent(`<!DOCTYPE html><html><body class="ac-app-body">${shell("Dashboard")}</body></html>` + inlineStyles("public/activeclinic/ac-app.css"));
      const dashLeft = await leftOf(page, ".ac-content");
      await page.setContent(`<!DOCTYPE html><html><body class="ac-app-body">${shell("Patients")}</body></html>` + inlineStyles("public/activeclinic/ac-app.css"));
      const patientsLeft = await leftOf(page, ".ac-content");
      assert.equal(dashLeft, patientsLeft);
      assert.ok(dashLeft > 200, `staff content should clear sidebar, got ${dashLeft}`);
    });
  });

  it("BB HQ shell sibling pages share .bb-hq-main band left at 1440", async () => {
    await withPage(1440, 900, async (page) => {
      const shell = (label) => `<div class="bb-hq-app"><aside class="bb-hq-sidebar" style="display:flex">Nav</aside><div class="bb-hq-frame"><main class="bb-hq-main"><h1>${label}</h1></main></div></div>`;
      await page.setContent(`<!DOCTYPE html><html><body class="bb-hq-body">${shell("Dashboard")}</body></html>` + inlineStyles("public/blessboard/v5/design-tokens.css", "public/blessboard/v5/hq-admin.css"));
      const dashLeft = await leftOf(page, ".bb-hq-main");
      await page.setContent(`<!DOCTYPE html><html><body class="bb-hq-body">${shell("Members")}</body></html>` + inlineStyles("public/blessboard/v5/design-tokens.css", "public/blessboard/v5/hq-admin.css"));
      const membersLeft = await leftOf(page, ".bb-hq-main");
      assert.equal(dashLeft, membersLeft);
    });
  });
});
