"use strict";

/**
 * BlessBoard login — mobile horizontal overflow regression.
 */

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { renderLoginPage } = require("../src/blessboard/http/renderTenantLandingPage");

const ROOT = path.join(__dirname, "..");

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), "utf8");
}

function loginFixtureHtml() {
  const body = renderLoginPage({ csrfToken: "test-csrf" });
  return body.replace(/<link rel="stylesheet" href="([^"]+)"/g, (_, href) => {
    const filePath = href.startsWith("/") ? path.join(ROOT, "public", href.slice(1)) : href;
    if (!fs.existsSync(filePath)) return `<style>/* missing ${href} */</style>`;
    return `<style>${fs.readFileSync(filePath, "utf8")}</style>`;
  });
}

describe("BlessBoard login mobile overflow", () => {
  it("auth shell stacks mobile feature panel above login card", () => {
    const css = read("public/blessboard/v5/tenant-auth.css");
    assert.match(css, /\.bb-auth-main__body[\s\S]*flex-direction:\s*column/);
  });

  it("has no horizontal overflow at common mobile widths", async () => {
    const { chromium } = require("playwright");
    const browser = await chromium.launch({ headless: true });
    const widths = [320, 360, 390, 430];
    try {
      for (const width of widths) {
        const page = await browser.newPage({ viewport: { width, height: 844 } });
        await page.setContent(loginFixtureHtml(), { waitUntil: "load" });
        const metrics = await page.evaluate(() => {
          const doc = document.documentElement;
          return {
            scrollWidth: doc.scrollWidth,
            innerWidth: window.innerWidth,
            formVisible: Boolean(document.querySelector("#bb-auth-login-form")),
            submitVisible: Boolean(document.querySelector('button[type="submit"]')),
            homeLinkVisible: Boolean(document.querySelector(".bb-auth-main__header-link")),
          };
        });
        assert.ok(
          metrics.scrollWidth <= metrics.innerWidth,
          `${width}px overflow: scrollWidth=${metrics.scrollWidth} innerWidth=${metrics.innerWidth}`
        );
        assert.equal(metrics.formVisible, true, `${width}px login form missing`);
        assert.equal(metrics.submitVisible, true, `${width}px submit button missing`);
        assert.equal(metrics.homeLinkVisible, true, `${width}px home link missing`);
        await page.close();
      }
    } finally {
      await browser.close();
    }
  });

  it("all active BlessBoard V5 auth templates reference tenant-auth.css v=15", () => {
    const templates = [
      "views/blessboard/v5/apex/login.ejs",
      "views/blessboard/v5/apex/forgot-password.ejs",
      "views/blessboard/v5/apex/reset-password.ejs",
      "views/blessboard/v5/apex/auth-error.ejs",
      "views/blessboard/v5/public/register.ejs",
      "views/blessboard/v5/public/register-submitted.ejs",
    ];
    for (const rel of templates) {
      const html = read(rel);
      assert.match(html, /tenant-auth\.css\?v=15/, `${rel} must use tenant-auth.css v=15`);
      assert.doesNotMatch(html, /tenant-auth\.css\?v=14/, `${rel} must not reference stale v=14`);
    }
  });

  it("COLOR_CHANGES: none — layout-only auth shell adjustments", () => {
    const tenantAuth = read("public/blessboard/v5/tenant-auth.css");
    const gpAuth = read("public/platform/gp-auth-reg.css");
    assert.match(tenantAuth, /--bb-auth-violet:\s*var\(--bb-color-primary/);
    assert.match(tenantAuth, /\.bb-auth-main__body[\s\S]*?flex-direction:\s*column[\s\S]*?min-width:\s*0/);
    assert.match(gpAuth, /\.gp-auth-feature-panel__mobile[\s\S]*?width:\s*100%[\s\S]*?min-width:\s*0/);
  });
});
