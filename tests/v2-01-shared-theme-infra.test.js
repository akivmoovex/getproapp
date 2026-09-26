"use strict";

/**
 * V2.01 shared website theme infrastructure (C1).
 */

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");

const { PRODUCT_CODE } = require("../src/platform/website/publicWebsiteUrl");
const {
  THEME_CONTENT_KEY,
  BB_DEFAULT_ID,
  AC_DEFAULT_ID,
  listThemesForProduct,
  getTheme,
  normalizeThemeId,
  defaultThemeIdForProduct,
  publicationThemeKeyFor,
  enumValuesForProduct,
} = require("../src/platform/website/themeRegistry");
const {
  evaluateThemeCompatibility,
  presentThemeAttrs,
} = require("../src/platform/website/websiteThemeService");
const { IMAGE_SLOT_REGISTRY } = require("../src/platform/website/imagePlacement");
const { PERMISSIONS } = require("../src/platform/website/permissions");

function read(rel) {
  return fs.readFileSync(path.join(__dirname, "..", rel), "utf8");
}

describe("V2_01 shared website theme infrastructure", () => {
  it("isolates BB and AC theme collections (no cross-product exposure)", () => {
    const bb = listThemesForProduct(PRODUCT_CODE.BLESSBOARD);
    const ac = listThemesForProduct(PRODUCT_CODE.ACTIVECLINIC);
    assert.equal(bb.length, 2);
    assert.equal(ac.length, 2);
    assert.ok(bb.some((t) => t.id === BB_DEFAULT_ID));
    assert.ok(ac.some((t) => t.id === AC_DEFAULT_ID));
    assert.equal(getTheme(AC_DEFAULT_ID, PRODUCT_CODE.BLESSBOARD), null);
    assert.equal(getTheme(BB_DEFAULT_ID, PRODUCT_CODE.ACTIVECLINIC), null);
    assert.deepEqual(enumValuesForProduct(PRODUCT_CODE.BLESSBOARD), [
      BB_DEFAULT_ID,
      "bb.contemporary-fellowship",
    ]);
    assert.deepEqual(enumValuesForProduct(PRODUCT_CODE.ACTIVECLINIC), [
      AC_DEFAULT_ID,
      "ac.family-wellness-mint",
    ]);
  });

  it("preserves current public layouts as product default themes", () => {
    assert.equal(defaultThemeIdForProduct(PRODUCT_CODE.BLESSBOARD), BB_DEFAULT_ID);
    assert.equal(defaultThemeIdForProduct(PRODUCT_CODE.ACTIVECLINIC), AC_DEFAULT_ID);
    const bb = getTheme(BB_DEFAULT_ID, PRODUCT_CODE.BLESSBOARD);
    const ac = getTheme(AC_DEFAULT_ID, PRODUCT_CODE.ACTIVECLINIC);
    assert.equal(bb.engineTemplateId, "blessboard_church");
    assert.equal(ac.engineTemplateId, "activeclinic_clinic");
    assert.equal(bb.isDefault, true);
    assert.equal(ac.isDefault, true);
    assert.equal(normalizeThemeId("default", PRODUCT_CODE.BLESSBOARD), BB_DEFAULT_ID);
    assert.equal(publicationThemeKeyFor(BB_DEFAULT_ID, PRODUCT_CODE.BLESSBOARD), "default");
  });

  it("declares supported sections and B2/B3 image slots without dropping content", () => {
    const bb = getTheme(BB_DEFAULT_ID, PRODUCT_CODE.BLESSBOARD);
    assert.ok(bb.sectionTypes.includes("plain_text"));
    assert.ok(bb.imageSlots["home.hero.image"]);
    assert.equal(
      bb.imageSlots["home.hero.image"].supportsSeparateFraming,
      IMAGE_SLOT_REGISTRY["home.hero.image"].supportsSeparateFraming
    );
    const compat = evaluateThemeCompatibility(bb, {
      sectionTypes: ["plain_text", "magic_carousel"],
      imageContentKeys: ["home.hero.image", "unknown.slot"],
    });
    assert.equal(compat.dropsContent, false);
    assert.equal(compat.unsupportedSections.length, 1);
    assert.equal(compat.unsupportedSections[0].type, "magic_carousel");
    assert.equal(compat.unsupportedSections[0].preserved, true);
    assert.ok(compat.imageFlags.some((f) => f.contentKey === "unknown.slot" && f.preserved));
  });

  it("persists theme via site.theme_id draft key and rejects cross-product saves", async () => {
    assert.equal(THEME_CONTENT_KEY, "site.theme_id");
    const { saveWebsiteThemeDraft } = require("../src/platform/website/websiteThemeService");
    const denied = await saveWebsiteThemeDraft(
      { query: async () => ({ rows: [] }) },
      {
        organizationId: "00000000-0000-4000-8000-000000000001",
        productCode: PRODUCT_CODE.BLESSBOARD,
        themeId: AC_DEFAULT_ID,
        grantedPermissions: [PERMISSIONS.EDIT],
      }
    );
    assert.equal(denied.ok, false);
    assert.equal(denied.code, "invalid_theme");
    assert.equal(denied.published, false);

    const forbidden = await saveWebsiteThemeDraft(
      { query: async () => ({ rows: [] }) },
      {
        organizationId: "00000000-0000-4000-8000-000000000001",
        productCode: PRODUCT_CODE.BLESSBOARD,
        themeId: BB_DEFAULT_ID,
        grantedPermissions: [],
      }
    );
    assert.equal(forbidden.ok, false);
    assert.equal(forbidden.code, "forbidden");
    assert.equal(forbidden.published, false);
  });

  it("registers site.theme_id on BB and AC templates as editable ENUM fields", () => {
    const bb = read("src/blessboard/website/blessboardChurchTemplate.js");
    const ac = read("src/activeclinic/website/activeClinicWebsiteTemplate.js");
    assert.match(bb, /"site\.theme_id"/);
    assert.match(bb, /bb\.default/);
    assert.match(ac, /"site\.theme_id"/);
    assert.match(ac, /ac\.default/);
    assert.match(bb, /registerThemeEditableField/);
  });

  it("wires draft theme APIs and draft/live presentation attrs on public shells", () => {
    const bbRoutes = read("src/blessboard/http/blessboardWebsiteEditorRoutes.js");
    const acRoutes = read("src/activeclinic/http/activeClinicWebsiteRoutes.js");
    assert.match(bbRoutes, /\/website\/theme/);
    assert.match(acRoutes, /\/website\/theme/);
    assert.match(bbRoutes, /saveThemeDraftHttp/);
    assert.match(acRoutes, /saveThemeDraftHttp/);
    assert.match(bbRoutes, /published:\s*false/);

    const bbShell = read("views/blessboard/v5/partials/tenant-public-shell-start.ejs");
    const acShell = read("views/activeclinic/layouts/public-shell.ejs");
    assert.match(bbShell, /data-website-theme-id/);
    assert.match(acShell, /data-website-theme-id/);
    assert.match(bbShell, /websiteThemeClass/);
    assert.match(acShell, /websiteThemeClass/);

    const attrs = presentThemeAttrs({
      themeId: BB_DEFAULT_ID,
      productCode: PRODUCT_CODE.BLESSBOARD,
      cssClass: "gp-website-theme--bb-default",
      legacyFallback: true,
    });
    assert.equal(attrs.websiteThemeId, BB_DEFAULT_ID);
    assert.equal(attrs.websiteThemeLegacyFallback, true);
  });

  it("mirrors published theme into BB publication theme_key without auto-publish", () => {
    const pub = read("src/blessboard/services/websitePublicationVersionService.js");
    assert.match(pub, /loadWebsiteThemeState/);
    assert.match(pub, /publicationThemeKey/);
    assert.match(pub, /preferDraft:\s*false/);
    const service = read("src/platform/website/websiteThemeService.js");
    assert.match(service, /published:\s*false/);
    assert.doesNotMatch(service, /publishWebsite|auto.?publish/i);
  });

  it("scopes theme selection to HQ/branch website instance path builders", () => {
    const {
      buildPublicWebsiteThemePath,
    } = require("../src/platform/website/publicWebsiteUrl");
    const bb = buildPublicWebsiteThemePath({
      product: PRODUCT_CODE.BLESSBOARD,
      organizationKey: "demo-church",
    });
    const ac = buildPublicWebsiteThemePath({
      product: PRODUCT_CODE.ACTIVECLINIC,
      organizationKey: "demo-clinic",
    });
    assert.match(bb, /\/c\/demo-church\/website\/theme/);
    assert.match(ac, /\/clinics\/demo-clinic\/website\/theme/);
    assert.notEqual(bb, ac);
  });

  it("bumps asset cache for theme infra presentation", () => {
    assert.match(
      read("views/blessboard/v5/partials/tenant-public-shell-start.ejs"),
      /website-add-section\.css\?v=v2-theme-infra-1/
    );
    assert.match(
      read("src/activeclinic/http/renderActiveClinicPublic.js"),
      /ASSET_VERSION = "v2-toolbar-parity-1"/
    );
  });
});
