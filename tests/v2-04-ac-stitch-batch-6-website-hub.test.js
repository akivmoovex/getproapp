"use strict";

/**
 * V2.04 Batch 6 — AC Stitch website management hub H01–H06.
 * Clinic customer hub (/app/settings/website*) — not Platform Admin.
 */

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");

const mediaContract = require("../src/platform/website/websiteMediaEditingContract");
const versionService = require("../src/platform/website/versionService");
const historyModel = require("../src/platform/website/historyModel");
const {
  STITCH_PROJECT_ID,
  HUB_SCREENS,
  NOT_WIRED_STITCH_CONTROLS,
  UNWIRED_STITCH_CONTROLS,
  PLATFORM_ADMIN_SEPARATION,
  VERSION_ENGINE,
} = require("../src/activeclinic/website/activeClinicStitchWebsiteHub");

const ROOT = path.join(__dirname, "..");

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), "utf8");
}

describe("V2.04 AC Stitch Batch 6 website management hub H01–H06", () => {
  it("registers H01–H06 against frozen Stitch project and existing routes", () => {
    assert.equal(STITCH_PROJECT_ID, "8888814012921999511");
    assert.equal(HUB_SCREENS.length, 6);
    assert.deepEqual(
      HUB_SCREENS.map((s) => s.code),
      ["H01", "H02", "H03", "H04", "H05", "H06"]
    );
    assert.equal(HUB_SCREENS[0].route, "/app/settings/website");
    assert.equal(HUB_SCREENS[1].route, "/app/settings/website/pages");
    assert.equal(HUB_SCREENS[2].route, "/app/settings/website/branding");
    assert.equal(HUB_SCREENS[3].route, "/app/settings/website/media");
    assert.match(HUB_SCREENS[4].route, /\/website\/history/);
    assert.equal(HUB_SCREENS[5].route, "/app/settings/website/settings");
    assert.equal(PLATFORM_ADMIN_SEPARATION, true);
    assert.match(VERSION_ENGINE, /restore-as-new/);
  });

  it("H01 hub template wires status, URL, edit/preview/live, readiness, and H02–H06 tiles", () => {
    const hub = read("views/activeclinic/app/settings-website-content.ejs");
    assert.match(hub, /data-ac-stitch-screen="H01"/);
    assert.match(hub, /data-ac-stitch-screen-mobile="H01-M"/);
    assert.match(hub, /data-ac-website-status/);
    assert.match(hub, /data-ac-website-public-url/);
    assert.match(hub, /data-ac-website-last-published/);
    assert.match(hub, /data-ac-website-action="edit"/);
    assert.match(hub, /data-ac-website-action="preview"/);
    assert.match(hub, /data-ac-website-action="view-live"/);
    assert.match(hub, /ac-mw-firstuse|Website setup/);
    assert.match(hub, /data-ac-stitch-hub-link="H02"/);
    assert.match(hub, /data-ac-stitch-hub-link="H03"/);
    assert.match(hub, /data-ac-stitch-hub-link="H04"/);
    assert.match(hub, /data-ac-stitch-hub-link="H05"/);
    assert.match(hub, /data-ac-stitch-hub-link="H06"/);
    assert.doesNotMatch(hub, /\/platform\/admin|Platform Admin console/);
  });

  it("H02 pages manager uses existing inventory cards (not a second registry)", () => {
    const pages = read("views/activeclinic/app/website-cms-pages.ejs");
    assert.match(pages, /data-ac-stitch-screen="H02"/);
    assert.match(pages, /data-ac-stitch-screen-mobile="H02-M"/);
    assert.match(pages, /cms\.pages/);
    assert.match(pages, /data-ac-page-id/);
    assert.match(pages, /\/app\/settings\/website\/pages/);
    assert.doesNotMatch(pages, /PAGE_REGISTRY|secondPageRegistry|acPageRegistry/);

    const routes = read("src/activeclinic/http/activeClinicWebsiteCmsRoutes.js");
    assert.match(routes, /\/app\/settings\/website\/pages/);
  });

  it("H03 branding uses semantic brand tokens + shared media (no theme bypass)", () => {
    const branding = read("views/activeclinic/app/website-cms-branding.ejs");
    assert.match(branding, /data-ac-stitch-screen="H03"/);
    assert.match(branding, /data-ac-stitch-screen-mobile="H03-M"/);
    assert.match(branding, /name="primaryColor"/);
    assert.match(branding, /name="accentColor"/);
    assert.match(branding, /website-cms-media-field/);
    assert.match(branding, /data-ac-stitch-not-wired="favicon_app_icon"/);
    assert.match(branding, /semantic brand tokens/);

    const brandingPost = read("src/activeclinic/http/activeClinicWebsiteCmsRoutes.js");
    assert.match(brandingPost, /brand\.primary_color|primaryColor/);
    assert.match(brandingPost, /\/app\/settings\/website\/branding/);
  });

  it("H04 media reuses singular shared upload engine", () => {
    assert.equal(mediaContract.SHARED_UPLOAD_ENGINE_COUNT, 1);
    assert.match(mediaContract.SHARED_UPLOAD_ENGINE, /registerWebsiteMedia/);

    const media = read("views/activeclinic/app/website-cms-media.ejs");
    assert.match(media, /data-ac-stitch-screen="H04"/);
    assert.match(media, /data-ac-stitch-screen-mobile="H04-M"/);
    assert.match(media, /data-ac-shared-media-engine="1"/);
    assert.match(media, /cms\.renderLibrary/);

    const routes = read("src/activeclinic/http/activeClinicWebsiteCmsRoutes.js");
    assert.match(routes, /mediaService/);
    assert.match(routes, /\/app\/settings\/website\/media/);
    assert.doesNotMatch(routes, /createActiveClinicMediaEngine|new AcMediaLibrary/);
  });

  it("H05 version history reuses platform restore-as-new engine", () => {
    const history = read("views/activeclinic/tenant/website-history.ejs");
    assert.match(history, /data-ac-stitch-screen="H05"/);
    assert.match(history, /data-ac-stitch-screen-mobile="H05-M"/);
    assert.match(history, /data-ac-restore-as-new="1"/);
    assert.match(history, /historyHtml/);

    const platformHistory = read("views/platform/website/history.ejs");
    assert.match(platformHistory, /restoreHref|data-gp-history-restore/);

    assert.equal(typeof versionService.listWebsiteVersions, "function");
    assert.equal(typeof historyModel.buildHistoryView, "function");
    const sample = historyModel.buildHistoryView({
      versions: [],
      canRestore: true,
      siteLabel: "Demo",
      restoreConfirmTitle: "Restore as new draft?",
    });
    assert.match(String(sample.restoreConfirmTitle || ""), /Restore as new/i);

    const routes = read("src/activeclinic/http/activeClinicWebsiteRoutes.js");
    assert.match(routes, /\/clinics\/:clinicKey\/website\/history/);
    assert.match(routes, /loadHistoryPresentation|renderWebsiteHistory|HISTORY_STYLESHEET/);
  });

  it("H06 settings wires existing fields and marks Stitch-only controls NOT_WIRED", () => {
    const settings = read("views/activeclinic/app/website-cms-settings.ejs");
    assert.match(settings, /data-ac-stitch-screen="H06"/);
    assert.match(settings, /data-ac-stitch-screen-mobile="H06-M"/);
    assert.match(settings, /name="siteName"/);
    assert.match(settings, /name="phone"/);
    assert.match(settings, /name="email"/);
    assert.match(settings, /name="hours"/);
    assert.match(settings, /data-ac-stitch-not-wired="custom_domain"/);
    assert.match(settings, /data-ac-stitch-not-wired="ssl_certificate"/);
    assert.match(settings, /data-ac-stitch-not-wired="maintenance_mode"/);
    assert.match(settings, /data-ac-stitch-not-wired="analytics_embed"/);

    assert.equal(UNWIRED_STITCH_CONTROLS, NOT_WIRED_STITCH_CONTROLS.length);
    assert.equal(UNWIRED_STITCH_CONTROLS, 10);
    for (const item of NOT_WIRED_STITCH_CONTROLS) {
      assert.ok(item.screen === "H03" || item.screen === "H06");
      assert.ok(item.control && item.reason);
    }
  });

  it("HUB_DESKTOP + HUB_MOBILE_390 CSS: no table squeeze, overflow clipped at 390", () => {
    const css = read("public/activeclinic/website-cms.css");
    assert.match(css, /@media \(max-width: 390px\)/);
    assert.match(css, /data-ac-stitch-screen="H02"/);
    assert.match(css, /data-ac-stitch-screen="H03"/);
    assert.match(css, /data-ac-stitch-screen="H04"/);
    assert.match(css, /data-ac-stitch-screen="H05"/);
    assert.match(css, /data-ac-stitch-screen="H06"/);
    assert.match(css, /overflow-x:\s*clip/);
    assert.match(css, /grid-template-columns:\s*1fr/);
    assert.doesNotMatch(css, /data-ac-stitch-screen="H02"[^}]*display:\s*table/);
  });

  it("authorization + Platform Admin separation: clinic hub routes stay under /app/settings/website", () => {
    const settingsRoutes = read("src/activeclinic/http/activeClinicSettingsRoutes.js");
    assert.match(settingsRoutes, /\/app\/settings\/website/);
    assert.match(settingsRoutes, /website\.view|website\.edit/);
    assert.match(settingsRoutes, /settings-website-content/);

    const cmsRoutes = read("src/activeclinic/http/activeClinicWebsiteCmsRoutes.js");
    assert.match(cmsRoutes, /\/app\/settings\/website\/pages/);
    assert.match(cmsRoutes, /\/app\/settings\/website\/branding/);
    assert.match(cmsRoutes, /\/app\/settings\/website\/media/);
    assert.match(cmsRoutes, /\/app\/settings\/website\/settings/);

    const platformAdminHit = /platformAdminWebsiteConsole|\/platform\/admin\/website-hub/;
    assert.doesNotMatch(settingsRoutes, platformAdminHit);
    assert.doesNotMatch(cmsRoutes, platformAdminHit);
    assert.doesNotMatch(read("views/activeclinic/app/settings-website-content.ejs"), platformAdminHit);
  });

  it("nav exposes editor/preview/history links without inventing a second hub", () => {
    const nav = read("views/activeclinic/partials/website-cms-nav.ejs");
    assert.match(nav, /\/app\/settings\/website/);
    assert.match(nav, /cmsNav\.editHref|data-ac-mw-nav="edit"/);
    assert.match(nav, /cmsNav\.historyHref|data-ac-mw-nav="history"/);
    assert.match(nav, /data-ac-mw-nav="publish"/);
    assert.match(nav, /base %>\/publish/);
  });
});
