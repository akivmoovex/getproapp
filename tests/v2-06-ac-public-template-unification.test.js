"use strict";

/**
 * V2.06 — ActiveClinic public template unification:
 * one canonical content path per marketing/directory page (no alternate mobile copy).
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

const PAGES = [
  {
    file: "views/activeclinic/public/home.ejs",
    canonical: /Healthcare Precision/,
    forbidden: [/Connecting Care/, /Modern Healthcare Delivery/, /Get Started/, /Explore Features/],
    cta: [/Find a Clinic/, /Register Your Clinic/],
  },
  {
    file: "views/activeclinic/public/for-clinics.ejs",
    canonical: /Empowering Your Practice/,
    forbidden: [/Streamline your clinical operations/, /Book a Demo/],
    cta: [/Register Your Clinic/, /See How It Works/],
  },
  {
    file: "views/activeclinic/public/for-patients.ejs",
    canonical: /Take control of your healthcare journey/,
    forbidden: [/Your Health, Guided by Data/],
    cta: [/Find a Clinic Near You/],
  },
  {
    file: "views/activeclinic/public/features.ejs",
    canonical: /Comprehensive Platform Capabilities/,
    forbidden: [/Discover how our integrated tools streamline operations/],
    cta: [/Learn about integrations/],
  },
  {
    file: "views/activeclinic/public/clinics-directory.ejs",
    canonical: /Find Your Care/,
    forbidden: [/acw-only-mobile/, /acw-search--compact/, /data-ac-directory-search-mobile/],
    cta: [/Search Directory/],
  },
  {
    file: "views/activeclinic/public/clinic-website.ejs",
    canonical: /Your Clinic, Branded and Online/,
    forbidden: [/Branded Clinic Websites, Effortlessly/, /100% Brandable/, /Ready to Elevate Your Practice/],
    cta: [/Start Building Your Site/, /Register Your Clinic/],
  },
];

describe("V2.06 AC public template unification", () => {
  it("each in-scope page keeps one canonical copy path (no mobile-only alternate heroes)", () => {
    for (const page of PAGES) {
      const src = read(page.file);
      assert.match(src, page.canonical, `${page.file} missing canonical headline`);
      assert.doesNotMatch(src, /acw-only-desktop|acw-only-mobile|hero-mobile/, `${page.file} still splits desktop/mobile content`);
      for (const bad of page.forbidden) {
        assert.doesNotMatch(src, bad, `${page.file} still has alternate copy ${bad}`);
      }
      for (const cta of page.cta) {
        assert.match(src, cta, `${page.file} missing CTA ${cta}`);
      }
    }
  });

  it("/clinics exposes the three search fields in the single form", () => {
    const src = read("views/activeclinic/public/clinics-directory.ejs");
    assert.match(src, /name="q"/);
    assert.match(src, /name="location"/);
    assert.match(src, /name="service"/);
    assert.match(src, /data-ac-directory-search="1"/);
    assert.equal((src.match(/<form[\s\S]*?<\/form>/g) || []).length, 1);
    assert.match(src, /data-ac-filter-open/);
  });

  it("no server-side UA/device content switch for these routes", () => {
    const routes = read("src/activeclinic/http/activeClinicPublicRoutes.js");
    assert.match(routes, /renderPublicView\("public\/home"/);
    assert.match(routes, /renderPublicView\("public\/for-clinics"/);
    assert.match(routes, /renderPublicView\("public\/for-patients"/);
    assert.match(routes, /renderPublicView\("public\/features"/);
    assert.match(routes, /renderPublicView\("public\/clinics-directory"/);
    assert.doesNotMatch(
      routes,
      /user-agent[\s\S]{0,120}(mobile|isMobile|device).*renderPublicView\("public\/(home|for-clinics|for-patients|features|clinics-directory)"/i
    );
  });

  it("canonical headlines remain visible at desktop and mobile viewports", async () => {
    const css = read("public/activeclinic/acw-platform.css");
    function stripEjs(rel, img = true) {
      return read(rel)
        .replace(
          /<%- include\([\s\S]*?\) %>/g,
          img ? '<img class="acp-hero__image" alt="" width="960" height="600" style="max-width:100%;height:auto"/>' : ""
        )
        .replace(/<%[=-]?[\s\S]*?%>/g, "");
    }

    const shells = [
      {
        name: "home",
        body: stripEjs("views/activeclinic/public/home.ejs"),
        h1: '[data-ac-acw-screen="ACW01"] h1',
        expect: /Healthcare Precision/,
        heroCountSel: '[data-ac-acw-screen="ACW01"] .acw-hero',
      },
      {
        name: "for-clinics",
        body: stripEjs("views/activeclinic/public/for-clinics.ejs"),
        h1: '[data-ac-acw-screen="ACW03-01"] h1',
        expect: /Empowering Your Practice/,
      },
      {
        name: "for-patients",
        body: stripEjs("views/activeclinic/public/for-patients.ejs"),
        h1: '[data-ac-acw-screen="ACW05"] h1',
        expect: /Take control of your healthcare journey/,
      },
      {
        name: "features",
        body: stripEjs("views/activeclinic/public/features.ejs", false),
        h1: '[data-ac-acw-screen="ACW03-03"] h1',
        expect: /Comprehensive Platform Capabilities/,
      },
      {
        name: "clinics",
        body: `<section class="acw-page acw-directory" data-ac-acw-screen="ACW02">
  <header class="acw-directory-hero"><div class="acw-directory-hero__inner">
    <h1>Find Your Care</h1>
    <p class="acw-directory-lede">Search our network of verified healthcare professionals to find the right clinic for your needs.</p>
    <form class="acw-search" data-ac-directory-search="1">
      <div class="acw-search__field"><label for="q">Clinic name</label><div class="acw-search__control"><input id="q" name="q"/></div></div>
      <div class="acw-search__field"><label for="location">Location</label><div class="acw-search__control"><input id="location" name="location"/></div></div>
      <div class="acw-search__field"><label for="service">Service</label><div class="acw-search__control"><input id="service" name="service"/></div></div>
      <div class="acw-search__actions">
        <button type="submit" class="ac-btn ac-btn--primary acw-search__submit">Search Directory</button>
        <button type="button" class="acw-search__filter-btn" data-ac-filter-open>Filters</button>
      </div>
    </form>
  </div></header>
</section>`,
        h1: '[data-ac-acw-screen="ACW02"] h1',
        expect: /Find Your Care/,
        checkSearch: true,
      },
    ];

    const browser = await chromium.launch({ headless: true });
    try {
      for (const width of [1440, 1024, 768, 390, 360]) {
        for (const shell of shells) {
          const page = await browser.newPage({ viewport: { width, height: 900 } });
          const html = `<!doctype html><html><head>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<style>
*,*::before,*::after{box-sizing:border-box}
:root { --acp-navy:#0f172a; --acp-primary:#0d9488; --acp-primary-strong:#0f766e;
  --acp-muted:#475569; --acp-surface:#fff; --acp-border:#e2e8f0; --acp-touch:2.75rem;
  --acp-primary-soft:#ccfbf1; --acp-surface-low:#f8fafc; --ac-touch:2.75rem;
  --color-brand-primary-light:#ecfeff; --color-text-inverse:#fff; --acw-max:80rem; }
body { margin:0; font-family: system-ui,sans-serif; overflow-x:clip; }
.ac-btn { display:inline-flex; align-items:center; justify-content:center; padding:0.65rem 1rem; }
.ac-public-actions { display:flex; flex-wrap:wrap; gap:0.75rem; }
.material-symbols-outlined { font-family: inherit; }
${css}
</style></head><body class="ac-public--platform">${shell.body}</body></html>`;
          await page.setContent(html, { waitUntil: "load" });
          const m = await page.evaluate((cfg) => {
            const el = document.querySelector(cfg.h1);
            const cs = el ? getComputedStyle(el) : null;
            const r = el ? el.getBoundingClientRect() : null;
            const visible =
              !!(el && cs && r && cs.display !== "none" && cs.visibility !== "hidden" && r.width > 0 && r.height > 0);
            const form = document.querySelector("[data-ac-directory-search]");
            const fields = form
              ? ["q", "location", "service"].map((n) => {
                  const input = form.querySelector(`[name="${n}"]`);
                  const ir = input ? input.getBoundingClientRect() : null;
                  return { name: n, visible: !!(input && ir && ir.width > 0 && ir.height > 0) };
                })
              : [];
            return {
              overflow: document.documentElement.scrollWidth > window.innerWidth + 1,
              visible,
              text: el ? (el.textContent || "").trim() : "",
              heroCount: cfg.heroCountSel
                ? document.querySelectorAll(cfg.heroCountSel).length
                : null,
              fields,
            };
          }, {
            h1: shell.h1,
            heroCountSel: shell.heroCountSel || null,
          });

          assert.equal(m.overflow, false, `${shell.name}@${width}px horizontal overflow`);
          assert.equal(m.visible, true, `${shell.name}@${width}px h1 visible`);
          assert.match(m.text, shell.expect);
          if (shell.heroCountSel != null) {
            assert.equal(m.heroCount, 1, `${shell.name}@${width}px one hero`);
          }
          if (shell.checkSearch) {
            for (const f of m.fields) {
              assert.equal(f.visible, true, `${shell.name}@${width}px field ${f.name}`);
            }
          }
          await page.close();
        }
      }
    } finally {
      await browser.close();
    }
  });
});
