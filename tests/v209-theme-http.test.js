"use strict";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const {
  statusForThemeCode,
  previewCompatibility,
  renderStandaloneThemeGalleryPage,
  THEME_GALLERY_STYLESHEET,
  THEME_GALLERY_SCRIPT,
} = require("../src/platform/website/websiteThemeHttp");
const { PRODUCT_CODE } = require("../src/platform/website/publicWebsiteUrl");
const { BB_DEFAULT_ID } = require("../src/platform/website/themeRegistry");

describe("V2.09 shared theme HTTP helpers", () => {
  it("maps theme mutation outcomes to safe HTTP statuses", () => {
    assert.equal(statusForThemeCode("forbidden"), 403);
    assert.equal(statusForThemeCode("website_instance_not_found"), 404);
    assert.equal(statusForThemeCode("invalid_theme"), 400);
    assert.equal(statusForThemeCode("theme_product_mismatch"), 400);
    assert.equal(statusForThemeCode("theme_renderer_unavailable"), 400);
    assert.equal(statusForThemeCode("unexpected"), 400);
  });

  it("accepts a valid product theme and rejects invalid/cross-product IDs", () => {
    assert.equal(previewCompatibility(PRODUCT_CODE.BLESSBOARD, BB_DEFAULT_ID).ok, true);
    assert.equal(
      previewCompatibility(PRODUCT_CODE.BLESSBOARD, "ac.default").code,
      "invalid_theme"
    );
    assert.equal(
      previewCompatibility(PRODUCT_CODE.BLESSBOARD, "not-a-theme").code,
      "invalid_theme"
    );
  });

  it("preserves compatibility warnings without dropping content", () => {
    const result = previewCompatibility(
      PRODUCT_CODE.BLESSBOARD,
      BB_DEFAULT_ID,
      ["plain_text", "unsupported_section"],
      ["home.hero.image", "unknown.slot"]
    );
    assert.equal(result.ok, true);
    assert.equal(result.dropsContent, false);
    assert.equal(result.unsupportedSections[0].preserved, true);
    assert.equal(result.imageFlags[1].preserved, true);
  });

  it("renders a standalone gallery with both shared assets", () => {
    const rendered = renderStandaloneThemeGalleryPage({
      page: {
        pageTitle: "Choose theme",
        productCode: PRODUCT_CODE.BLESSBOARD,
        siteLabel: "Test church",
        backHref: "/c/test",
        backLabel: "Back",
        csrfToken: "token",
      },
      bodyHtml: "<div data-gp-website-theme-gallery>Gallery</div>",
    });
    assert.match(rendered, /data-gp-website-theme-gallery/);
    assert.match(rendered, new RegExp(THEME_GALLERY_STYLESHEET.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
    assert.match(rendered, new RegExp(THEME_GALLERY_SCRIPT.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  });

  it("does not represent preview or selection helpers as publication", () => {
    const httpSource = require("fs").readFileSync(
      require("path").join(__dirname, "../src/platform/website/websiteThemeHttp.js"),
      "utf8"
    );
    assert.match(httpSource, /published:\s*false/);
    assert.doesNotMatch(httpSource, /publishWebsiteDraft/);
  });
});
