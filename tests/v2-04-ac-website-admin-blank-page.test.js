"use strict";

/**
 * V2.04 AC Website Settings admin routes — blank-page regression contracts.
 * Enumerates canonical GET routes and asserts semantic page markers + shell.
 */

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), "utf8");
}

/** Canonical staff Website Settings GET routes → expected content marker. */
const WEBSITE_ADMIN_ROUTE_MARKERS = Object.freeze([
  { route: "/app/settings/website", marker: /data-ac-website-hub|data-ac-page-section="website|settings-website/ },
  { route: "/app/settings/website/pages", marker: /data-ac-page-section="website-pages"/ },
  { route: "/app/settings/website/sections", marker: /data-ac-page-section="website-sections"|data-ac-mw-screen="sections"/ },
  { route: "/app/settings/website/navigation", marker: /data-ac-page-section="website-navigation"|data-ac-mw-screen="navigation"/ },
  { route: "/app/settings/website/media", marker: /data-ac-page-section="website-media"|data-ac-mw-screen="media"/ },
  { route: "/app/settings/website/settings", marker: /data-ac-page-section="website-settings"/ },
  { route: "/app/settings/website/branding", marker: /data-ac-page-section="website-branding"/ },
  { route: "/app/settings/website/chrome", marker: /data-ac-page-section="website-chrome"|data-ac-mw-screen="chrome"/ },
  { route: "/app/settings/website/seo", marker: /data-ac-page-section="website-seo"|data-ac-mw-screen="seo"/ },
  { route: "/app/settings/website/catalogue", marker: /data-ac-page-section="website-catalogue"/ },
  { route: "/app/settings/website/library", marker: /data-ac-page-section="website-library"|data-ac-mw-screen="library"/ },
  { route: "/app/settings/website/publish", marker: /data-ac-page-section="website-publish"/ },
]);

describe("V2.04 AC website admin blank-page regression", () => {
  it("registers every canonical Website Settings GET route", () => {
    const cms = read("src/activeclinic/http/activeClinicWebsiteCmsRoutes.js");
    const settings = read("src/activeclinic/http/activeClinicSettingsRoutes.js");
    const combined = cms + "\n" + settings;
    for (const row of WEBSITE_ADMIN_ROUTE_MARKERS) {
      const escaped = row.route.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      assert.match(
        combined,
        new RegExp(`["']${escaped}["']`),
        `missing route registration: ${row.route}`
      );
    }
  });

  it("each canonical CMS template has a meaningful page marker (not blank shell)", () => {
    const templates = {
      "/app/settings/website/pages": "views/activeclinic/app/website-cms-pages.ejs",
      "/app/settings/website/sections": "views/activeclinic/app/website-cms-sections.ejs",
      "/app/settings/website/navigation": "views/activeclinic/app/website-cms-navigation.ejs",
      "/app/settings/website/media": "views/activeclinic/app/website-cms-media.ejs",
      "/app/settings/website/settings": "views/activeclinic/app/website-cms-settings.ejs",
      "/app/settings/website/branding": "views/activeclinic/app/website-cms-branding.ejs",
      "/app/settings/website/chrome": "views/activeclinic/app/website-cms-chrome.ejs",
      "/app/settings/website/seo": "views/activeclinic/app/website-cms-seo.ejs",
      "/app/settings/website/catalogue": "views/activeclinic/app/website-cms-catalogue.ejs",
      "/app/settings/website/library": "views/activeclinic/app/website-cms-library.ejs",
      "/app/settings/website/publish": "views/activeclinic/app/website-cms-publish.ejs",
    };
    for (const [route, tpl] of Object.entries(templates)) {
      const html = read(tpl);
      const row = WEBSITE_ADMIN_ROUTE_MARKERS.find((r) => r.route === route);
      assert.ok(row, route);
      assert.match(html, row.marker, `${route} missing marker`);
      assert.match(html, /website-cms-nav|ac-mw-editor/, `${route} missing Clinic Editor chrome`);
      assert.match(html, /<h[12][^>]*>[\s\S]{3,}?<\/h[12]>/, `${route} missing heading`);
    }
  });

  it("Clinic Editor root does not reuse pill-nav flex class (shared blank/distortion root)", () => {
    const nav = read("views/activeclinic/partials/website-cms-nav.ejs");
    const css = read("public/activeclinic/website-cms.css");
    assert.match(nav, /class="ac-mw-editor"/);
    assert.doesNotMatch(nav, /class="ac-mw-editor ac-mw-nav"/);
    assert.match(css, /\.ac-mw-editor\s*\{[^}]*display:\s*block/);
  });

  it("fail if a new /app/settings/website GET appears without a matrix marker", () => {
    const cms = read("src/activeclinic/http/activeClinicWebsiteCmsRoutes.js");
    const gets = [...cms.matchAll(/app\.get\(\s*\n?\s*["']([^"']+)["']/g)].map((m) => m[1]);
    const websiteGets = gets.filter(
      (p) => p.startsWith("/app/settings/website") && !p.includes(":")
    );
    const known = new Set(WEBSITE_ADMIN_ROUTE_MARKERS.map((r) => r.route));
    // Allow nested static paths covered by forms elsewhere.
    const allowExtra = new Set([
      "/app/settings/website/pages/new",
      "/app/settings/website/catalogue/doctors",
      "/app/settings/website/catalogue/services",
      "/app/settings/website/catalogue/doctors/new",
      "/app/settings/website/catalogue/services/new",
      "/app/settings/website/library/new",
    ]);
    for (const route of websiteGets) {
      assert.ok(
        known.has(route) || allowExtra.has(route),
        `untracked website admin GET route needs matrix entry: ${route}`
      );
    }
  });
});

module.exports = { WEBSITE_ADMIN_ROUTE_MARKERS };
