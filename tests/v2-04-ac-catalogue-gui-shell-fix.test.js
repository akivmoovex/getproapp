"use strict";

/**
 * V2.04 AC C01/C02 catalogue GUI — Clinic Editor shell collision fix.
 * Focused contracts for nav class separation, rail offset, returnTo, overflow.
 */

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const ejs = require("ejs");

const ROOT = path.join(__dirname, "..");

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), "utf8");
}

function renderCatalogue(tab, returnTo) {
  const tpl = read("views/activeclinic/app/website-cms-catalogue.ejs");
  return ejs.render(
    tpl,
    {
      pageData: {
        cms: {
          tab,
          doctors: [],
          services: [],
          canEdit: true,
          clinicKey: "demo-clinic",
          previewHref: "/clinics/demo-clinic/services",
          returnTo: returnTo || "",
          error: "",
          saved: false,
        },
        cmsNav: {
          active: "catalogue",
          editHref: "/clinics/demo-clinic?website_edit=1&website_mode=draft",
          historyHref: "/app/settings/website/history",
        },
      },
      shell: {
        healthcareOrganization: { publicName: "Demo Clinic" },
        product: { displayName: "ActiveClinic" },
      },
    },
    { filename: path.join(ROOT, "views/activeclinic/app/website-cms-catalogue.ejs") }
  );
}

function stripReturnToNoise(html) {
  return String(html || "")
    .replace(/returnTo=[^"'&\s]*/g, "returnTo=")
    .replace(/\?returnTo=/g, "?")
    .replace(/&returnTo=/g, "&")
    .replace(/\?&/g, "?")
    .replace(/&&+/g, "&")
    .replace(/\?$/g, "")
    .replace(/&$/g, "");
}

describe("V2.04 AC catalogue GUI shell collision fix", () => {
  // 1
  it("1: .ac-mw-editor does not carry nav-only layout role", () => {
    const nav = read("views/activeclinic/partials/website-cms-nav.ejs");
    const css = read("public/activeclinic/website-cms.css");
    assert.match(nav, /class="ac-mw-editor"/);
    assert.doesNotMatch(nav, /class="ac-mw-editor ac-mw-nav"/);
    assert.doesNotMatch(nav, /ac-mw-editor__tab ac-mw-nav__link/);
    assert.match(css, /\.ac-mw-editor\s*\{[^}]*display:\s*block/);
    assert.match(css, /\.ac-mw-nav:not\(\.ac-mw-editor\)/);
  });

  // 2
  it("2: desktop rail remains left (float + rail width variable)", () => {
    const css = read("public/activeclinic/website-cms.css");
    assert.match(css, /--ac-mw-rail-width:\s*14\.5rem/);
    assert.match(css, /\.ac-mw-editor__rail\s*\{[\s\S]*?float:\s*left/);
    assert.match(css, /\.ac-mw-editor__rail\s*\{[\s\S]*?width:\s*var\(--ac-mw-rail-width/);
    const html = renderCatalogue("services", "");
    assert.match(html, /class="ac-mw-editor__rail"/);
    assert.match(html, /ac-mw-editor__top/);
  });

  // 3
  it("3: content offset matches rail via shared CSS variable", () => {
    const css = read("public/activeclinic/website-cms.css");
    assert.match(css, /--ac-mw-content-offset:\s*15\.5rem/);
    assert.match(
      css,
      /\.ac-app-body--mw \.ac-mw > \*:not\(\.ac-mw-editor\):not\(dialog\)\s*\{[^}]*margin-left:\s*var\(--ac-mw-content-offset/
    );
  });

  // 4
  it("4: mobile removes desktop content offset", () => {
    const css = read("public/activeclinic/website-cms.css");
    assert.match(
      css,
      /@media \(max-width: 899px\)[\s\S]*?\.ac-app-body--mw \.ac-mw > \*:not\(\.ac-mw-editor\):not\(dialog\)\s*\{[^}]*margin-left:\s*0/
    );
    assert.match(css, /@media \(max-width: 899px\)[\s\S]*?\.ac-mw-editor__rail\s*\{[\s\S]*?float:\s*none/);
  });

  // 5–8 returnTo
  it("5: Services with returnTo preserves chrome + return links", () => {
    const html = renderCatalogue("services", "/clinics/demo-clinic?website_edit=1");
    assert.match(html, /class="ac-mw-editor"/);
    assert.doesNotMatch(html, /class="ac-mw-editor ac-mw-nav"/);
    assert.match(html, /data-ac-catalogue-tab="services"/);
    assert.match(html, /returnTo=/);
    assert.match(html, /data-ac-catalogue-tab-link="services"/);
  });

  it("6: Services without returnTo preserves chrome identically (layout)", () => {
    const withRt = stripReturnToNoise(renderCatalogue("services", "/clinics/demo-clinic"));
    const without = stripReturnToNoise(renderCatalogue("services", ""));
    assert.match(withRt, /class="ac-mw-editor"/);
    assert.match(without, /class="ac-mw-editor"/);
    assert.equal(withRt.includes("ac-mw-editor ac-mw-nav"), false);
    assert.equal(without.includes("ac-mw-editor ac-mw-nav"), false);
    // Same editor + catalogue markers regardless of returnTo
    for (const marker of [
      'data-ac-website-cms-nav="1"',
      'data-ac-mw-editor="1"',
      'data-ac-catalogue-tab="services"',
      "ac-mw-editor__rail",
      "ac-mw-c-breadcrumb",
    ]) {
      assert.equal(withRt.includes(marker), true, marker);
      assert.equal(without.includes(marker), true, marker);
    }
  });

  it("7: Doctors with returnTo preserves chrome + return links", () => {
    const html = renderCatalogue("doctors", "/clinics/demo-clinic/doctors");
    assert.match(html, /class="ac-mw-editor"/);
    assert.doesNotMatch(html, /class="ac-mw-editor ac-mw-nav"/);
    assert.match(html, /data-ac-catalogue-tab="doctors"/);
    assert.match(html, /returnTo=/);
  });

  it("8: Doctors without returnTo preserves chrome identically (layout)", () => {
    const withRt = stripReturnToNoise(renderCatalogue("doctors", "/clinics/demo"));
    const without = stripReturnToNoise(renderCatalogue("doctors", ""));
    assert.equal(withRt.includes("ac-mw-editor ac-mw-nav"), false);
    assert.equal(without.includes("ac-mw-editor ac-mw-nav"), false);
    assert.match(withRt, /data-ac-catalogue-tab="doctors"/);
    assert.match(without, /data-ac-catalogue-tab="doctors"/);
  });

  // 9
  it("9: no horizontal overflow marker/class regression for MW shell", () => {
    const css = read("public/activeclinic/website-cms.css");
    const shell = read("views/activeclinic/layouts/app-shell.ejs");
    assert.match(css, /\.ac-app-body--mw \.ac-mw[\s\S]*overflow-x:\s*clip/);
    assert.match(css, /\.ac-app-body--mw \.ac-content[\s\S]*overflow-x:\s*clip/);
    // Dual staff page-header suppressed under Clinic Editor shell
    assert.match(shell, /_mwShell/);
    assert.match(shell, /if \(!_mwShell\)/);
    // Topbar stays hidden under --mw (no mobile re-show that stacked dual headers)
    assert.doesNotMatch(
      css,
      /@media \(max-width: 899px\)[\s\S]{0,800}\.ac-app-body--mw \.ac-topbar\s*\{\s*display:\s*flex/
    );
  });

  // 10
  it("10: existing catalogue route/RBAC/privacy source contracts remain intact", () => {
    const routes = read("src/activeclinic/http/activeClinicWebsiteCmsRoutes.js");
    const stitch = read("tests/v2-04-ac-catalogue-c01-c02-stitch-parity.test.js");
    assert.match(routes, /function sanitizeCatalogueReturnTo/);
    assert.match(routes, /catalogueService\.loadCatalogue|loadCatalogue/);
    assert.match(stitch, /E03 doctor image editor integration/);
    assert.match(stitch, /data authority and privacy modules unchanged/);
    const form = read("views/activeclinic/app/website-cms-catalogue-doctor-form.ejs");
    assert.match(form, /data-website-media-field|website-media-field|E03|Adjust Picture|Library/i);
  });
});
