"use strict";

/**
 * V2.01 shared Website Theme Gallery (C2).
 */

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");

const { PRODUCT_CODE } = require("../src/platform/website/publicWebsiteUrl");
const {
  listSelectableThemesForProduct,
  listThemesForProduct,
  BB_DEFAULT_ID,
  AC_DEFAULT_ID,
} = require("../src/platform/website/themeRegistry");
const {
  buildThemeGalleryPageView,
  THEME_PREVIEW_QUERY,
} = require("../src/platform/website/themeGalleryPageModel");
const { renderWebsiteThemeGalleryPage } = require("../src/platform/website/renderWebsiteThemeGallery");
const { THEME_PREVIEW_QUERY: SERVICE_PREVIEW_Q } = require("../src/platform/website/websiteThemeService");

function read(rel) {
  return fs.readFileSync(path.join(__dirname, "..", rel), "utf8");
}

describe("V2_01 shared website theme gallery", () => {
  it("lists only product-filtered themes with working renderers", () => {
    const bb = listSelectableThemesForProduct(PRODUCT_CODE.BLESSBOARD);
    const ac = listSelectableThemesForProduct(PRODUCT_CODE.ACTIVECLINIC);
    assert.equal(bb.length, 1);
    assert.equal(ac.length, 1);
    assert.equal(bb[0].id, BB_DEFAULT_ID);
    assert.equal(ac[0].id, AC_DEFAULT_ID);
    assert.equal(bb[0].hasWorkingRenderer, true);
    assert.equal(
      listThemesForProduct(PRODUCT_CODE.BLESSBOARD).some((t) => t.id === AC_DEFAULT_ID),
      false
    );
  });

  it("builds gallery cards with current/draft status and preview/select actions", () => {
    const page = buildThemeGalleryPageView({
      productCode: PRODUCT_CODE.BLESSBOARD,
      themes: listSelectableThemesForProduct(PRODUCT_CODE.BLESSBOARD),
      draftThemeId: BB_DEFAULT_ID,
      publishedThemeId: BB_DEFAULT_ID,
      themeApiUrl: "/c/demo/website/theme",
      previewHrefBase: "/c/demo",
      editHref: "/c/demo?website_edit=1",
      csrfToken: "tok",
    });
    assert.equal(page.themes.length, 1);
    assert.equal(page.themes[0].isDraft, true);
    assert.equal(page.themes[0].isLive, true);
    assert.match(page.themes[0].previewHref, new RegExp(THEME_PREVIEW_QUERY));
    assert.match(page.themes[0].previewHref, /website_mode=draft/);
    assert.equal(page.singleThemeOnly, true);
    assert.equal(SERVICE_PREVIEW_Q, "website_theme_preview");
  });

  it("renders shared gallery markup for BB and AC product labels without cross-product cards", () => {
    const bbPage = buildThemeGalleryPageView({
      productCode: PRODUCT_CODE.BLESSBOARD,
      themes: listSelectableThemesForProduct(PRODUCT_CODE.BLESSBOARD),
      draftThemeId: BB_DEFAULT_ID,
      publishedThemeId: BB_DEFAULT_ID,
      themeApiUrl: "/c/x/website/theme",
      previewHrefBase: "/c/x",
      editHref: "/c/x?website_edit=1",
      csrfToken: "a",
    });
    const acPage = buildThemeGalleryPageView({
      productCode: PRODUCT_CODE.ACTIVECLINIC,
      themes: listSelectableThemesForProduct(PRODUCT_CODE.ACTIVECLINIC),
      draftThemeId: AC_DEFAULT_ID,
      publishedThemeId: AC_DEFAULT_ID,
      themeApiUrl: "/clinics/x/website/theme",
      previewHrefBase: "/clinics/x",
      editHref: "/clinics/x?website_edit=1",
      csrfToken: "b",
    });
    const bbHtml = renderWebsiteThemeGalleryPage(bbPage);
    const acHtml = renderWebsiteThemeGalleryPage(acPage);
    assert.match(bbHtml, /data-gp-website-theme-gallery/);
    assert.match(bbHtml, /BlessBoard Classic/);
    assert.match(bbHtml, /Preview Theme/);
    assert.match(bbHtml, /Selected in draft|Select Theme/);
    assert.doesNotMatch(bbHtml, /ac\.default/);
    assert.match(acHtml, /ActiveClinic Classic/);
    assert.doesNotMatch(acHtml, /bb\.default/);
    assert.match(bbHtml, /Website Options/);
    assert.match(read("public/platform/website-theme-gallery.css"), /max-width:\s*390px/);
    assert.match(read("public/platform/website-theme-gallery.js"), /themeId/);
  });

  it("wires gallery routes and Choose Theme menu for BB and AC", () => {
    const bbRoutes = read("src/blessboard/http/blessboardWebsiteEditorRoutes.js");
    const acRoutes = read("src/activeclinic/http/activeClinicWebsiteRoutes.js");
    assert.match(bbRoutes, /\/website\/themes/);
    assert.match(acRoutes, /\/website\/themes/);
    assert.match(bbRoutes, /loadThemeGalleryPresentation/);
    assert.match(acRoutes, /loadThemeGalleryPresentation/);
    assert.match(read("src/blessboard/http/attachWebsiteAdminChrome.js"), /Choose Theme/);
    assert.match(read("src/activeclinic/http/attachActiveClinicWebsiteChrome.js"), /Choose Theme/);
    assert.match(read("src/platform/website/publicWebsiteUrl.js"), /buildPublicWebsiteThemesPath/);
  });

  it("keeps theme selection draft-only and supports authorized preview query overlay", () => {
    const service = read("src/platform/website/websiteThemeService.js");
    assert.match(service, /THEME_PREVIEW_QUERY/);
    assert.match(service, /previewOnly/);
    assert.match(service, /published:\s*false/);
    assert.match(service, /hasWorkingRenderer/);
    const http = read("src/platform/website/websiteThemeHttp.js");
    assert.match(http, /renderStandaloneThemeGalleryPage/);
    assert.match(http, /selectable/);
  });

  it("surfaces compatibility warnings and Adjust Picture link in gallery template", () => {
    const tpl = read("views/platform/website/theme-gallery-page.ejs");
    assert.match(tpl, /data-theme-compat/);
    assert.match(tpl, /Adjust Picture/);
    assert.match(tpl, /preserved for review/);
    const page = buildThemeGalleryPageView({
      productCode: PRODUCT_CODE.BLESSBOARD,
      themes: listSelectableThemesForProduct(PRODUCT_CODE.BLESSBOARD),
      draftThemeId: BB_DEFAULT_ID,
      publishedThemeId: BB_DEFAULT_ID,
    });
    assert.match(page.safetyNote, /does not rewrite/i);
  });

  it("documents single-theme C2 limitation in gallery UI", () => {
    const tpl = read("views/platform/website/theme-gallery-page.ejs");
    assert.match(tpl, /data-theme-gallery-single/);
    assert.match(tpl, /One implemented theme/);
  });
});
