"use strict";

/**
 * V2.06 — AC auth/registration mobile GUI:
 * - Login "Register clinic" must not clip/overflow at ~375/390
 * - Registration "Continue to Staff Setup" must not overlap country/city
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

function overlapArea(a, b) {
  const x = Math.max(0, Math.min(a.right, b.right) - Math.max(a.left, b.left));
  const y = Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top));
  return x * y;
}

describe("V2.06 AC auth/registration mobile GUI", () => {
  it("AC-local CSS reserves header/register spacing (no shared gp-auth-reg edit required)", () => {
    const auth = read("public/activeclinic/ac-auth.css");
    assert.match(auth, /ac-auth-public-header__link--register/);
    assert.match(auth, /white-space:\s*nowrap/);
    assert.match(auth, /Register clinic|max-width:\s*390px/);

    const acw = read("public/activeclinic/acw-platform.css");
    const mobileActions = acw.match(
      /@media \(max-width: 767px\)[\s\S]*?\.acw-register__actions\s*\{([\s\S]*?)\n  \}/
    );
    assert.ok(mobileActions, "mobile .acw-register__actions block present");
    assert.match(mobileActions[1], /position:\s*static/);
    assert.doesNotMatch(mobileActions[1], /position:\s*sticky|position:\s*fixed/);
    assert.doesNotMatch(mobileActions[1], /margin:\s*0\s+-1\.5rem\s+-1\.5rem/);
  });

  it("login Register clinic + registration actions clear fields at 1440/768/390/375/360", async () => {
    const authCss = read("public/activeclinic/ac-auth.css");
    const acwCss = read("public/activeclinic/acw-platform.css");
    const tokens = read("public/activeclinic/ac-tokens.css");
    const browser = await chromium.launch({ headless: true });
    try {
      for (const width of [1440, 768, 390, 375, 360]) {
        const height = width <= 390 ? 700 : 844;
        const page = await browser.newPage({ viewport: { width, height } });

        await page.setContent(
          `<!doctype html><html><head>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<style>
${tokens}
${authCss}
${acwCss}
:root{--acw-max:80rem;--acp-gutter:1rem;--acp-max:72rem;--acp-navy:#0f172a;--acp-primary:#0d9488;
  --acp-primary-strong:#0f766e;--acp-muted:#475569;--acp-surface:#fff;--acp-border:#e2e8f0;
  --acp-surface-low:#f8fafc;--ac-touch:2.75rem;--color-brand-primary:#0d9488;--color-text-primary:#0f172a;
  --color-text-inverse:#fff;--color-brand-primary-light:#ccfbf1;--color-focus-ring:rgba(13,148,136,.25);
  --acp-bg:#f8fafc;--ac-status-danger:#b91c1c;}
body{margin:0;font-family:Inter,system-ui,sans-serif}
.ac-btn{display:inline-flex;align-items:center;justify-content:center;padding:.65rem 1rem;min-height:44px;
  border:1px solid var(--acp-border);border-radius:.5rem;text-decoration:none;background:#fff}
.ac-btn--primary{background:var(--acp-primary);color:#fff;border:0}
.ac-form-field{display:grid;gap:.35rem;margin-bottom:1rem}
.ac-form-field input,.ac-form-field select,.ac-form-field textarea{
  min-height:44px;width:100%;padding:.5rem .75rem;border:1px solid var(--acp-border);border-radius:.5rem}
.ac-auth-mark{display:inline-block;width:1.75rem;height:1.75rem;border-radius:999px;background:#0d9488}
</style></head>
<body class="ac-auth-body ac-public--platform" data-product="activeclinic">
<header class="ac-auth-public-header" data-ac-auth-public-header="1">
  <a class="ac-auth-public-header__brand" href="/">
    <span class="ac-auth-mark" aria-hidden="true"></span>
    <span class="ac-auth-public-header__name">ActiveClinic</span>
  </a>
  <nav class="ac-auth-public-header__nav" aria-label="Authentication">
    <a class="ac-auth-public-header__link" href="/"><span>Home</span></a>
    <a class="ac-auth-public-header__link ac-auth-public-header__link--register" href="/register-clinic">Register clinic</a>
  </nav>
</header>
<article class="acw-page acw-register acw-register--with-aside gp-reg">
  <div class="acw-register__layout">
    <div class="acw-register__panel gp-reg__panel">
      <div class="acw-register__card gp-reg__card">
        <form class="acw-register__form ac-public-form">
          <div class="acw-register__grid">
            <div class="ac-form-field"><label>Clinic name</label><input value="Demo Clinic"/></div>
            <div class="ac-form-field"><label>Clinic type</label><select><option>Clinic</option></select></div>
          </div>
          <div class="acw-register__grid">
            <div class="ac-form-field" id="country-field">
              <label for="countryCode">Country</label>
              <select id="countryCode" name="countryCode"><option>Zambia (ZM)</option></select>
            </div>
            <div class="ac-form-field" id="city-field">
              <label for="city">City</label>
              <input id="city" name="city" value="Lusaka" placeholder="Start typing a city or town"/>
            </div>
          </div>
          <div class="acw-register__grid">
            <div class="ac-form-field"><label>Address</label><textarea rows="3">1 Street</textarea></div>
          </div>
          <div class="ac-form-field"><label>Notes</label><textarea rows="3">notes</textarea></div>
          <div class="acw-register__actions">
            <a class="ac-btn ac-btn--secondary" href="/">Cancel</a>
            <button type="submit" class="ac-btn ac-btn--primary">Continue to Staff Setup</button>
          </div>
        </form>
      </div>
    </div>
  </div>
</article>
</body></html>`,
          { waitUntil: "load" }
        );

        const m = await page.evaluate(() => {
          const link = document.querySelector(".ac-auth-public-header__link--register");
          const lr = link.getBoundingClientRect();
          const country = document.querySelector("#countryCode");
          const city = document.querySelector("#city");
          const actions = document.querySelector(".acw-register__actions");
          const Ar = actions.getBoundingClientRect();
          const Cr = country.getBoundingClientRect();
          const Cir = city.getBoundingClientRect();
          function ov(a, b) {
            const x = Math.max(0, Math.min(a.right, b.right) - Math.max(a.left, b.left));
            const y = Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top));
            return x * y;
          }
          // Bring country/city into the content band above the action bar.
          const cs = getComputedStyle(actions);
          return {
            registerText: (link.textContent || "").trim(),
            registerClipped:
              lr.right > window.innerWidth + 1 ||
              lr.left < -1 ||
              link.scrollWidth > link.clientWidth + 1,
            overflowX: document.documentElement.scrollWidth > window.innerWidth + 1,
            actionsPos: cs.position,
            overlapCountry: ov(Ar, Cr),
            overlapCity: ov(Ar, Cir),
            actionsAfterCity: Ar.top >= Cir.bottom - 0.5,
          };
        });

        assert.equal(m.registerText, "Register clinic", `${width}px register label`);
        assert.equal(m.registerClipped, false, `${width}px Register clinic clipped`);
        assert.equal(m.overflowX, false, `${width}px horizontal overflow`);
        assert.equal(m.overlapCountry, 0, `${width}px actions overlap country`);
        assert.equal(m.overlapCity, 0, `${width}px actions overlap city`);
        if (width <= 767) {
          assert.equal(m.actionsPos, "static", `${width}px actions in document flow`);
          assert.equal(m.actionsAfterCity, true, `${width}px actions below city`);
        }
        await page.close();
      }
    } finally {
      await browser.close();
    }
  });
});
