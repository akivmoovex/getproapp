"use strict";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const {
  validateImagePlacement,
  renderPlacementStyle,
  objectPositionFromPlacement,
} = require("../src/platform/website/imagePlacement");
const {
  PRODUCT_CODE,
  isPublicOrganizationKey,
  buildPublicWebsiteAdminPath,
  buildPublicWebsiteThemePath,
} = require("../src/platform/website/publicWebsiteUrl");
const {
  loadWebsiteThemeState,
  saveWebsiteThemeDraft,
} = require("../src/platform/website/websiteThemeService");

describe("V2.09 theme boundary coverage", () => {
  it("accepts minimum and maximum focal coordinates and zoom", () => {
    const result = validateImagePlacement({ x: 0, y: 100, zoom: 3 });
    assert.equal(result.ok, true);
    assert.deepEqual(result.value, { v: 1, fit: "cover", x: 0, y: 100, zoom: 3 });
  });

  it("rejects out-of-range framing and invalid placement shapes", () => {
    assert.equal(validateImagePlacement({ x: -1 }).code, "invalid_image_placement_focal");
    assert.equal(validateImagePlacement({ y: 101 }).code, "invalid_image_placement_focal");
    assert.equal(validateImagePlacement({ zoom: 0 }).code, "invalid_image_placement_zoom");
    assert.equal(validateImagePlacement([]).code, "invalid_image_placement");
  });

  it("supports base-only framing and mobile fallback defaults", () => {
    const result = validateImagePlacement({ fit: "contain", mobile: { x: 25 } }, {
      contentKey: "home.hero.image",
    });
    assert.equal(result.ok, true);
    assert.deepEqual(result.value.mobile, { fit: "contain", x: 25, y: 50, zoom: 1 });
  });

  it("rejects unsupported desktop/mobile and slot overrides", () => {
    assert.equal(
      validateImagePlacement({ mobile: { x: 50 } }, { contentKey: "home.logo" }).code,
      "image_placement_separate_not_supported"
    );
    assert.equal(validateImagePlacement({ desktop: {} }).code, "invalid_image_placement");
    assert.equal(validateImagePlacement({ width: 10 }).code, "image_placement_slot_override");
  });

  it("uses safe rendering and object-position fallbacks for invalid placement", () => {
    assert.equal(objectPositionFromPlacement({ x: -1 }, "left top"), "left top");
    const rendered = renderPlacementStyle(null, { fallbackObjectFit: "contain" });
    assert.equal(rendered.hasPlacement, false);
    assert.match(rendered.style, /object-fit:contain/);
  });

  it("rejects malformed tenant identifiers and unknown products", () => {
    assert.equal(isPublicOrganizationKey("valid-tenant_1"), true);
    assert.equal(isPublicOrganizationKey("../other"), false);
    assert.equal(isPublicOrganizationKey(""), false);
    assert.equal(isPublicOrganizationKey("Tenant With Spaces"), false);
    assert.equal(buildPublicWebsiteThemePath({
      product: "unknown",
      organizationKey: "tenant",
    }), null);
  });

  it("builds product-scoped admin and theme paths canonically", () => {
    assert.match(buildPublicWebsiteAdminPath({
      product: PRODUCT_CODE.BLESSBOARD,
      organizationKey: "demo",
    }), /\/admin\/organizations\/demo/);
    assert.match(buildPublicWebsiteThemePath({
      product: PRODUCT_CODE.ACTIVECLINIC,
      organizationKey: "clinic",
    }), /\/clinics\/clinic\/website\/theme/);
  });

  it("rejects invalid theme state inputs before database access", async () => {
    const db = { query: async () => { throw new Error("database should not be queried"); } };
    assert.equal((await loadWebsiteThemeState(db, {})).code, "invalid_input");
    assert.equal(
      (await loadWebsiteThemeState(db, { organizationId: "org", productCode: "unknown" })).code,
      "invalid_product"
    );
    assert.equal(
      (await saveWebsiteThemeDraft(db, {
        organizationId: "org",
        productCode: PRODUCT_CODE.BLESSBOARD,
        themeId: "bb.default",
        grantedPermissions: [],
      })).code,
      "forbidden"
    );
  });

  it("rejects invalid, cross-product, and missing-instance theme saves", async () => {
    const db = { query: async () => ({ rows: [] }) };
    const base = { organizationId: "org", grantedPermissions: ["website.edit"] };
    assert.equal(
      (await saveWebsiteThemeDraft(db, {
        ...base, productCode: PRODUCT_CODE.BLESSBOARD, themeId: "not-a-theme",
      })).code,
      "invalid_theme"
    );
    assert.equal(
      (await saveWebsiteThemeDraft(db, {
        ...base, productCode: PRODUCT_CODE.BLESSBOARD, themeId: "ac.default",
      })).code,
      "invalid_theme"
    );
    assert.equal(
      (await saveWebsiteThemeDraft(db, {
        ...base, productCode: PRODUCT_CODE.BLESSBOARD, themeId: "bb.default",
      })).code,
      "website_instance_not_found"
    );
  });
});
