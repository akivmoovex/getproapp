"use strict";

/**
 * P0 horizontal overflow regression — BlessBoard HQ + ActiveClinic Website Hub + clinic contact.
 * Asserts scrollWidth <= innerWidth on representative DOM fixtures with production CSS inlined.
 */

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.join(__dirname, "..");
const WIDTHS = [320, 360, 375, 390, 430, 768, 1024, 1440];

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), "utf8");
}

function inlineCss(rel) {
  return `<style>${read(rel)}</style>`;
}

function overflowOk(page) {
  return page.evaluate(() => {
    const doc = document.documentElement;
    return {
      scrollWidth: doc.scrollWidth,
      innerWidth: window.innerWidth,
      ok: doc.scrollWidth <= window.innerWidth,
    };
  });
}

function shell(html, cssFiles) {
  const styles = cssFiles.map((f) => inlineCss(f)).join("\n");
  return `<!DOCTYPE html><html><head><meta charset="utf-8">${styles}</head><body>${html}</body></html>`;
}

describe("BB+AC P0 overflow CSS guards", () => {
  it("hq-admin.css constrains filter fields and narrow-desktop filter grid", () => {
    const css = read("public/blessboard/v5/hq-admin.css");
    assert.match(css, /\.bb-hq-field input[\s\S]*width:\s*100%/);
    assert.match(css, /@media \(min-width:\s*900px\) and \(max-width:\s*1100px\)[\s\S]*\.bb-hq-filter/);
    assert.match(css, /\.bb-hq-members[\s\S]*min-width:\s*0/);
    assert.match(css, /\.bb-hq-roles__form[\s\S]*min-width:\s*0/);
  });

  it("website-cms.css clips CMS shell on mobile", () => {
    const css = read("public/activeclinic/website-cms.css");
    assert.match(css, /\.ac-app-body--mw \.ac-mw[\s\S]*overflow-x:\s*clip/);
    assert.match(css, /\[data-ac-website-firstuse-url="1"\][\s\S]*overflow-wrap:\s*anywhere/);
    assert.match(css, /\.ac-mw-hub-meta[\s\S]*overflow-wrap:\s*anywhere/);
    assert.match(css, /\[data-ac-website-last-editor="1"\][\s\S]*overflow-wrap:\s*anywhere/);
  });

  it("ac-public.css constrains clinic contact layout grid children", () => {
    const css = read("public/activeclinic/ac-public.css");
    assert.match(css, /\.acp-contact-layout[\s\S]*min-width:\s*0/);
    assert.match(css, /\.acp-contact-aside \.ac-public-list[\s\S]*min-width:\s*0/);
    assert.match(css, /\.acp-contact-aside \.ac-public-list li[\s\S]*overflow-wrap:\s*anywhere/);
  });
});

describe("BB+AC P0 overflow fixtures", () => {
  it("BlessBoard HQ members filter fits at 1024px with sidebar", async () => {
    const { chromium } = require("playwright");
    const browser = await chromium.launch({ headless: true });
    const html = shell(
      `<div class="bb-hq-app">
        <aside class="bb-hq-sidebar" style="display:flex">nav</aside>
        <div class="bb-hq-frame" style="min-width:0">
          <main class="bb-hq-main" id="bb-hq-main">
            <section class="bb-hq-members">
              <form class="bb-hq-filter bb-hq-members-filter" method="get">
                <div class="bb-hq-field"><label for="q">Search</label><input id="q" name="q" type="search" value="" /></div>
                <div class="bb-hq-field"><label for="status">Status</label><select id="status" name="status"><option>All</option></select></div>
                <div class="bb-hq-field"><label for="branch">Branch</label><select id="branch" name="branch"><option>All branches</option></select></div>
                <div class="bb-hq-filter__actions"><button type="submit" class="bb-hq-btn bb-hq-btn--primary">Filter</button></div>
              </form>
              <section class="bb-hq-panel bb-hq-members-panel">
                <div class="bb-hq-table-wrap bb-hq-members-table-wrap">
                  <table class="bb-hq-table bb-hq-members-table"><thead><tr><th>Member</th><th>Branch</th><th>Phone</th><th>Email</th></tr></thead><tbody><tr><td>Test User</td><td>Lusaka</td><td>+260970000001</td><td>qa@example.test</td></tr></tbody></table>
                </div>
              </section>
            </section>
          </main>
        </div>
      </div>`,
      ["public/blessboard/v5/hq-admin.css"]
    );
    try {
      const page = await browser.newPage({ viewport: { width: 1024, height: 768 } });
      await page.setContent(html, { waitUntil: "load" });
      const m = await overflowOk(page);
      assert.equal(m.ok, true, `members 1024 overflow: scrollWidth=${m.scrollWidth} innerWidth=${m.innerWidth}`);
      await page.close();
    } finally {
      await browser.close();
    }
  });

  it("BlessBoard HQ roles invite form fits at 360px", async () => {
    const { chromium } = require("playwright");
    const browser = await chromium.launch({ headless: true });
    const html = shell(
      `<div class="bb-hq-app"><main class="bb-hq-main" id="bb-hq-main">
        <section class="bb-hq-roles">
          <form method="post" class="bb-hq-roles__form">
            <div class="bb-hq-field"><label for="invite-email">Email</label><input id="invite-email" name="email" type="email" /></div>
            <div class="bb-hq-field"><label for="invite-display-name">Display name</label><input id="invite-display-name" name="display_name" type="text" /></div>
            <div class="bb-hq-field"><label for="invite-role-key">Role</label><select id="invite-role-key" name="role_key"><option>HQ admin</option></select></div>
            <div class="bb-hq-field"><label for="invite-branch">Branch</label><select id="invite-branch" name="branch_key"><option>demo-church-lusaka</option></select></div>
            <p class="bb-hq-roles__form-actions"><button type="submit" class="bb-hq-btn bb-hq-btn--primary">Create invitation</button></p>
          </form>
        </section>
      </main></div>`,
      ["public/blessboard/v5/hq-admin.css"]
    );
    try {
      for (const width of [320, 360, 375, 390, 430]) {
        const page = await browser.newPage({ viewport: { width, height: 844 } });
        await page.setContent(html, { waitUntil: "load" });
        const m = await overflowOk(page);
        assert.equal(m.ok, true, `roles ${width}px overflow: scrollWidth=${m.scrollWidth} innerWidth=${m.innerWidth}`);
        await page.close();
      }
    } finally {
      await browser.close();
    }
  });

  it("ActiveClinic Website Hub first-use block fits at 360px", async () => {
    const { chromium } = require("playwright");
    const browser = await chromium.launch({ headless: true });
    const html = shell(
      `<body class="ac-app-body ac-app-body--mw">
        <div class="ac-content"><section class="ac-mw" data-ac-website-hub="1">
          <div class="ac-mw-editor ac-mw-nav"><header class="ac-mw-editor__top"><a class="ac-mw-editor__brand" href="#">Clinic Editor</a></header></div>
          <section class="ac-mw-firstuse">
            <article class="ac-mw-firstuse__welcome">
              <p class="ac-mw-muted" data-ac-website-firstuse-url="1">Public URL: <code>https://activeclinic.pronline.org/clinics/activeclinic-demo</code> <span>(not live yet)</span></p>
            </article>
          </section>
          <ul class="ac-mw-hub-chips"><li class="ac-mw-hub-chip">Draft changes</li><li class="ac-mw-hub-chip">Not published</li></ul>
        </section></div>
      </body>`,
      ["public/activeclinic/ac-app.css", "public/activeclinic/website-cms.css"]
    );
    try {
      const page = await browser.newPage({ viewport: { width: 360, height: 844 } });
      await page.setContent(html, { waitUntil: "load" });
      const m = await overflowOk(page);
      assert.equal(m.ok, true, `website hub 360 overflow: scrollWidth=${m.scrollWidth} innerWidth=${m.innerWidth}`);
      await page.close();
    } finally {
      await browser.close();
    }
  });

  it("ActiveClinic Website Hub last-editor email and public URL fit on narrow mobile", async () => {
    const { chromium } = require("playwright");
    const browser = await chromium.launch({ headless: true });
    const longUrl = "https://activeclinic.pronline.org/clinics/activeclinic-demo";
    const longEditor = "demo_organization_admin@demo.activeclinic.example";
    const html = shell(
      `<body class="ac-app-body ac-app-body--mw">
        <div class="ac-main-wrap" style="display:flex;min-width:0">
          <main class="ac-content" style="width:100%;max-width:100%;min-width:0;overflow-x:clip">
            <section class="ac-mw ac-settings-website" data-ac-website-hub="1">
              <div class="ac-mw-hub-metrics">
                <article class="ac-mw-hub-metric">
                  <p class="ac-mw-hub-metric__label">Public website URL</p>
                  <p class="ac-mw-hub-metric__value" data-ac-website-public-url="1">
                    <a href="${longUrl}"><code>${longUrl}</code></a>
                  </p>
                </article>
              </div>
              <p class="ac-mw-hub-meta">
                Last updated: <strong>2026-08-27 05:37 UTC</strong>
                · Last editor: <span data-ac-website-last-editor="1">${longEditor}</span>
                · Publish policy: Review before publish
              </p>
            </section>
          </main>
        </div>
      </body>`,
      ["public/activeclinic/ac-app.css", "public/activeclinic/website-cms.css"]
    );
    try {
      for (const width of [320, 360, 390, 430]) {
        const page = await browser.newPage({ viewport: { width, height: 844 } });
        await page.setContent(html, { waitUntil: "load" });
        const m = await page.evaluate(() => {
          const doc = document.documentElement;
          const editor = document.querySelector("[data-ac-website-last-editor=\"1\"]");
          const url = document.querySelector("[data-ac-website-public-url=\"1\"]");
          return {
            scrollWidth: doc.scrollWidth,
            innerWidth: window.innerWidth,
            ok: doc.scrollWidth <= window.innerWidth,
            editorVisible: !!(editor && editor.getBoundingClientRect().height > 0 && (editor.textContent || "").includes("@")),
            urlVisible: !!(url && url.getBoundingClientRect().height > 0 && (url.textContent || "").includes("http")),
            editorRight: editor ? editor.getBoundingClientRect().right : null,
          };
        });
        assert.equal(m.ok, true, `hub ${width}px overflow: scrollWidth=${m.scrollWidth} innerWidth=${m.innerWidth}`);
        assert.equal(m.editorVisible, true, `hub ${width}px last-editor should remain visible`);
        assert.equal(m.urlVisible, true, `hub ${width}px public URL should remain visible`);
        assert.ok(m.editorRight <= width + 0.5, `hub ${width}px editor span right ${m.editorRight} exceeds viewport`);
        await page.close();
      }
    } finally {
      await browser.close();
    }
  });

  it("ActiveClinic clinic contact layout fits at 1024px", async () => {
    const { chromium } = require("playwright");
    const browser = await chromium.launch({ headless: true });
    const html = shell(
      `<body class="ac-public-body ac-public--tenant">
        <main class="ac-public-main"><section class="acp-page acp-contact-layout" style="max-width:75rem;margin:0 auto;padding:0 1.25rem">
          <div class="acp-contact-layout__main"><form class="ac-public-form"><input type="text" name="senderName" style="width:100%" /></form></div>
          <aside class="acp-contact-aside">
            <ul class="ac-public-list">
              <li>Phone: +260 970 000 001 ext. 12345 for after-hours enquiries</li>
              <li>Email: demo_organization_admin@demo.activeclinic.example</li>
            </ul>
          </aside>
        </section></main>
      </body>`,
      ["public/activeclinic/ac-tokens.css", "public/activeclinic/ac-public.css"]
    );
    try {
      const page = await browser.newPage({ viewport: { width: 1024, height: 768 } });
      await page.setContent(html, { waitUntil: "load" });
      const m = await overflowOk(page);
      assert.equal(m.ok, true, `contact 1024 overflow: scrollWidth=${m.scrollWidth} innerWidth=${m.innerWidth}`);
      await page.close();
    } finally {
      await browser.close();
    }
  });

  it("ActiveClinic clinic contact live-equivalent long phone/email fits at 768 and 1024", async () => {
    const { chromium } = require("playwright");
    const browser = await chromium.launch({ headless: true });
    const html = shell(
      `<body class="ac-public-body ac-public--tenant">
        <header class="ac-public-header ac-public-header--tenant">
          <div class="ac-public-header__inner ac-public-header__inner--tenant"><span>Clinic</span></div>
        </header>
        <main class="ac-public-main">
          <section class="ac-public-section acp-page" data-ac-page-section="tenant-contact">
            <header class="acp-page-hero acp-page-hero--compact"><h1>Contact ActiveClinic Demo Centre</h1></header>
            <div class="acp-contact-layout">
              <div class="acp-contact-layout__main">
                <form class="ac-public-form acp-contact-form"><input type="text" name="senderName" /></form>
              </div>
              <aside class="acp-contact-aside">
                <h2>Clinic contact</h2>
                <ul class="ac-public-list">
                  <li>Phone: +260 900 000 101 (demo)</li>
                  <li>Email: demo.centre@activeclinic.example</li>
                </ul>
                <p class="ac-public-actions"><a class="ac-btn ac-btn--secondary" href="#">Location &amp; hours</a></p>
              </aside>
            </div>
          </section>
        </main>
      </body>`,
      ["public/activeclinic/ac-tokens.css", "public/activeclinic/ac-public.css"]
    );
    try {
      for (const width of [320, 360, 390, 430, 768, 1024, 1440]) {
        const page = await browser.newPage({ viewport: { width, height: 900 } });
        await page.setContent(html, { waitUntil: "load" });
        const m = await page.evaluate(() => {
          const doc = document.documentElement;
          const items = [...document.querySelectorAll(".acp-contact-aside .ac-public-list li")].map((li) => {
            const r = li.getBoundingClientRect();
            return {
              text: (li.textContent || "").trim(),
              right: r.right,
              width: r.width,
              visible: r.height > 0,
            };
          });
          return {
            scrollWidth: doc.scrollWidth,
            innerWidth: window.innerWidth,
            ok: doc.scrollWidth <= window.innerWidth,
            items,
          };
        });
        assert.equal(m.ok, true, `contact ${width}px overflow: scrollWidth=${m.scrollWidth} innerWidth=${m.innerWidth}`);
        assert.equal(m.items.length, 2, `contact ${width}px should render phone and email`);
        for (const item of m.items) {
          assert.equal(item.visible, true, `contact ${width}px item should remain visible: ${item.text}`);
          assert.ok(item.right <= width + 0.5, `contact ${width}px item right ${item.right} exceeds viewport`);
        }
        await page.close();
      }
    } finally {
      await browser.close();
    }
  });
});
