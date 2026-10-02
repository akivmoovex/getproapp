"use strict";

/**
 * V2.04 — product-scoped custom property cascade regression.
 *
 * CSS custom properties inherit *computed* values. Aliases declared on :root
 * that reference --color-brand-primary freeze the :root default (platform violet)
 * and ignore later data-product brand overrides on <body>.
 *
 * Uses Playwright computed-style inspection (not source grep).
 */

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const { chromium } = require("playwright");

const ROOT = path.join(__dirname, "..");

const COLORS = fs.readFileSync(
  path.join(ROOT, "src/platform/ui/theme/colors.css"),
  "utf8"
);
const AC_TOKENS = fs.readFileSync(
  path.join(ROOT, "public/activeclinic/ac-tokens.css"),
  "utf8"
);
const AC_AUTH = fs.readFileSync(
  path.join(ROOT, "public/activeclinic/ac-auth.css"),
  "utf8"
);
const BB_TOKENS = fs.readFileSync(
  path.join(ROOT, "public/blessboard/v5/design-tokens.css"),
  "utf8"
);
const AC_APP = fs.readFileSync(
  path.join(ROOT, "public/activeclinic/ac-app-tokens.css"),
  "utf8"
);

const BB_VIOLET = "#6c5ce7";
const BB_OPS_BLUE = "#2563eb";
const AC_TEAL = "#006068";
const AC_STAFF_BLUE = "#2563eb";

function rgb(hex) {
  const h = hex.replace("#", "");
  const n = parseInt(h, 16);
  return `rgb(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255})`;
}

async function withPage(html, fn) {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    await page.setContent(html);
    return await fn(page);
  } finally {
    await browser.close();
  }
}

describe("V2.04 product token cascade (computed)", () => {
  it("ActiveClinic public primary CTAs resolve teal, not BlessBoard violet", async () => {
    const html = `<!doctype html><html><head>
<style>${COLORS}</style><style>${AC_TOKENS}</style><style>${AC_AUTH}</style>
<style>
  .ac-btn--primary { background: var(--acp-primary); }
  .ac-auth-btn { background: var(--ac-auth-primary); }
  .plat { background: var(--button-primary-bg); }
</style></head>
<body data-product="activeclinic" data-surface="public" class="ac-auth-body ac-public-body">
  <a class="ac-btn--primary" id="cta">Get Started</a>
  <button class="ac-auth-btn" id="login">Log in</button>
  <button class="plat" id="plat">P</button>
</body></html>`;

    await withPage(html, async (page) => {
      const v = await page.evaluate(() => {
        const body = getComputedStyle(document.body);
        const cta = getComputedStyle(document.getElementById("cta"));
        const login = getComputedStyle(document.getElementById("login"));
        const plat = getComputedStyle(document.getElementById("plat"));
        return {
          brand: body.getPropertyValue("--color-brand-primary").trim(),
          acp: body.getPropertyValue("--acp-primary").trim(),
          auth: body.getPropertyValue("--ac-auth-primary").trim(),
          button: body.getPropertyValue("--button-primary-bg").trim(),
          ctaBg: cta.backgroundColor,
          loginBg: login.backgroundColor,
          platBg: plat.backgroundColor,
        };
      });

      assert.equal(v.brand, AC_TEAL);
      assert.equal(v.acp, AC_TEAL);
      assert.equal(v.auth, AC_TEAL);
      assert.equal(v.button, AC_TEAL);
      assert.equal(v.ctaBg, rgb(AC_TEAL));
      assert.equal(v.loginBg, rgb(AC_TEAL));
      assert.equal(v.platBg, rgb(AC_TEAL));
      assert.notEqual(v.acp, BB_VIOLET);
    });
  });

  it("BlessBoard apex/default resolves violet brand and bb-color-primary alias", async () => {
    const html = `<!doctype html><html><head>
<style>${COLORS}</style><style>${BB_TOKENS}</style>
<style>.bb { background: var(--bb-color-primary); }</style></head>
<body data-product="blessboard"><button class="bb" id="b">CTA</button></body></html>`;

    await withPage(html, async (page) => {
      const v = await page.evaluate(() => {
        const body = getComputedStyle(document.body);
        const btn = getComputedStyle(document.getElementById("b"));
        return {
          brand: body.getPropertyValue("--color-brand-primary").trim(),
          bb: body.getPropertyValue("--bb-color-primary").trim(),
          btnBg: btn.backgroundColor,
        };
      });
      assert.equal(v.brand, BB_VIOLET);
      assert.equal(v.bb, BB_VIOLET);
      assert.equal(v.btnBg, rgb(BB_VIOLET));
    });
  });

  it("BlessBoard V2.04 ops shell resolves Sanctuary Modern blue (not violet, not AC teal)", async () => {
    const html = `<!doctype html><html><head>
<style>${COLORS}</style><style>${BB_TOKENS}</style>
<style>.bb { background: var(--bb-color-primary); }</style></head>
<body data-product="blessboard" data-bb-shell="branch-admin"><button class="bb" id="b">CTA</button></body></html>`;

    await withPage(html, async (page) => {
      const v = await page.evaluate(() => {
        const body = getComputedStyle(document.body);
        const btn = getComputedStyle(document.getElementById("b"));
        return {
          brand: body.getPropertyValue("--color-brand-primary").trim(),
          bb: body.getPropertyValue("--bb-color-primary").trim(),
          btnBg: btn.backgroundColor,
          bg: body.getPropertyValue("--color-background").trim(),
          button: body.getPropertyValue("--button-primary-bg").trim(),
        };
      });
      assert.equal(v.brand, BB_OPS_BLUE);
      assert.equal(v.bb, BB_OPS_BLUE);
      assert.equal(v.button, BB_OPS_BLUE);
      assert.equal(v.btnBg, rgb(BB_OPS_BLUE));
      assert.notEqual(v.brand, BB_VIOLET);
      assert.notEqual(v.brand, AC_TEAL);
      assert.match(v.bg, /#f8fafc/i);
    });
  });

  it("ActiveClinic staff surface resolves staff blue through --ac-primary", async () => {
    const html = `<!doctype html><html><head>
<style>${COLORS}</style><style>${AC_APP}</style>
<style>.x { background: var(--ac-primary); display:block; width:10px; height:10px; }</style></head>
<body data-product="activeclinic" data-surface="staff" class="ac-app-body"><span class="x" id="x"></span></body></html>`;

    await withPage(html, async (page) => {
      const v = await page.evaluate(() => {
        const body = getComputedStyle(document.body);
        const el = getComputedStyle(document.getElementById("x"));
        return {
          brand: body.getPropertyValue("--color-brand-primary").trim(),
          acPrimary: body.getPropertyValue("--ac-primary").trim(),
          bg: el.backgroundColor,
        };
      });
      assert.equal(v.brand, AC_STAFF_BLUE);
      assert.equal(v.acPrimary, AC_STAFF_BLUE);
      assert.equal(v.bg, rgb(AC_STAFF_BLUE));
    });
  });
});
