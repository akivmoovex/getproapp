"use strict";

/**
 * V2.01 first additional website themes (C3).
 */

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");

const { PRODUCT_CODE } = require("../src/platform/website/publicWebsiteUrl");
const {
  BB_DEFAULT_ID,
  BB_CONTEMPORARY_FELLOWSHIP_ID,
  AC_DEFAULT_ID,
  AC_FAMILY_WELLNESS_MINT_ID,
  getTheme,
  listSelectableThemesForProduct,
  publicationThemeKeyFor,
} = require("../src/platform/website/themeRegistry");
const { evaluateThemeCompatibility } = require("../src/platform/website/websiteThemeService");

function read(rel) {
  return fs.readFileSync(path.join(__dirname, "..", rel), "utf8");
}

describe("V2_01 first additional website themes", () => {
  it("registers Contemporary Fellowship and Family Wellness Mint as selectable renderers", () => {
    const bb = listSelectableThemesForProduct(PRODUCT_CODE.BLESSBOARD);
    const ac = listSelectableThemesForProduct(PRODUCT_CODE.ACTIVECLINIC);
    assert.equal(bb.length, 2);
    assert.equal(ac.length, 2);
    const fellowship = getTheme(BB_CONTEMPORARY_FELLOWSHIP_ID, PRODUCT_CODE.BLESSBOARD);
    const mint = getTheme(AC_FAMILY_WELLNESS_MINT_ID, PRODUCT_CODE.ACTIVECLINIC);
    assert.equal(fellowship.hasWorkingRenderer, true);
    assert.equal(mint.hasWorkingRenderer, true);
    assert.equal(fellowship.cssClass, "gp-website-theme--bb-contemporary-fellowship");
    assert.equal(mint.cssClass, "gp-website-theme--ac-family-wellness-mint");
    assert.match(fellowship.stylesheetHref, /website-theme-contemporary-fellowship\.css/);
    assert.match(mint.stylesheetHref, /website-theme-family-wellness-mint\.css/);
    assert.equal(getTheme(BB_CONTEMPORARY_FELLOWSHIP_ID, PRODUCT_CODE.ACTIVECLINIC), null);
    assert.equal(getTheme(AC_FAMILY_WELLNESS_MINT_ID, PRODUCT_CODE.BLESSBOARD), null);
  });

  it("keeps default themes as defaults and uses distinct publication theme keys", () => {
    assert.equal(getTheme(BB_DEFAULT_ID, PRODUCT_CODE.BLESSBOARD).isDefault, true);
    assert.equal(getTheme(BB_CONTEMPORARY_FELLOWSHIP_ID, PRODUCT_CODE.BLESSBOARD).isDefault, false);
    assert.equal(publicationThemeKeyFor(BB_DEFAULT_ID, PRODUCT_CODE.BLESSBOARD), "default");
    assert.equal(
      publicationThemeKeyFor(BB_CONTEMPORARY_FELLOWSHIP_ID, PRODUCT_CODE.BLESSBOARD),
      BB_CONTEMPORARY_FELLOWSHIP_ID
    );
    assert.equal(
      publicationThemeKeyFor(AC_FAMILY_WELLNESS_MINT_ID, PRODUCT_CODE.ACTIVECLINIC),
      AC_FAMILY_WELLNESS_MINT_ID
    );
  });

  it("declares theme-specific hero framing without dropping content", () => {
    const fellowship = getTheme(BB_CONTEMPORARY_FELLOWSHIP_ID, PRODUCT_CODE.BLESSBOARD);
    assert.equal(fellowship.imageSlots["home.hero.image"].aspectDesktop, "21 / 9");
    const compat = evaluateThemeCompatibility(fellowship, {
      sectionTypes: ["plain_text", "unsupported_widget"],
      imageContentKeys: ["home.hero.image"],
    });
    assert.equal(compat.dropsContent, false);
    assert.equal(compat.unsupportedSections[0].preserved, true);
  });

  it("ships distinct public CSS packs and shell stylesheet hooks", () => {
    const bbCss = read("public/blessboard/v5/website-theme-contemporary-fellowship.css");
    const acCss = read("public/activeclinic/website-theme-family-wellness-mint.css");
    assert.match(bbCss, /gp-website-theme--bb-contemporary-fellowship/);
    assert.match(bbCss, /#06b6d4|#0f172a/);
    assert.match(bbCss, /21\s*\/\s*9/);
    assert.match(acCss, /gp-website-theme--ac-family-wellness-mint/);
    assert.match(acCss, /#006c4a|#f4fdf8/i);
    assert.match(acCss, /max-width:\s*390px/);
    assert.match(
      read("views/blessboard/v5/partials/tenant-public-shell-start.ejs"),
      /websiteThemeStylesheet/
    );
    assert.match(read("views/activeclinic/layouts/public-shell.ejs"), /websiteThemeStylesheet/);
  });

  it("extends editable theme enums for both products", () => {
    assert.match(
      read("src/blessboard/website/blessboardChurchTemplate.js"),
      /bb\.contemporary-fellowship/
    );
    assert.match(
      read("src/activeclinic/website/activeClinicWebsiteTemplate.js"),
      /ac\.family-wellness-mint/
    );
  });
});
