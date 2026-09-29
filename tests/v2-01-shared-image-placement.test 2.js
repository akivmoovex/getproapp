"use strict";

/**
 * V2_01 shared IMAGE placement infrastructure:
 * field-scoped crop/zoom/focal metadata on the existing IMAGE contract.
 */

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const ejs = require("ejs");

const {
  validateImagePlacement,
  renderPlacementStyle,
  placementFromImageValue,
  IMAGE_SLOT_REGISTRY,
  PLACEMENT_VERSION,
} = require("../src/platform/website/imagePlacement");
const { validateContentValue, CONTENT_TYPES } = require("../src/platform/website/contentTypes");
const { presentImageValue } = require("../src/platform/media/cdnMediaPresentation");
const {
  PRODUCT_CODE,
  assertEditableMutation,
  ensureProductFieldsRegistered,
  editableValuesEqual,
} = require("../src/platform/website/editableFieldSchema");
const { imageFromWebsiteValue } = require("../src/platform/website/branding");

const ROOT = path.join(__dirname, "..");

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), "utf8");
}

describe("V2_01 shared IMAGE placement", () => {
  it("legacy string and object IMAGE values remain valid without placement", () => {
    const def = { type: CONTENT_TYPES.IMAGE, maxLen: 500, key: "home.hero.image" };
    const asString = validateContentValue(def, "https://cdn.example.com/legacy.jpg");
    assert.equal(asString.ok, true);
    assert.equal(asString.value.src, "https://cdn.example.com/legacy.jpg");
    assert.equal(asString.value.placement, undefined);

    const asObject = validateContentValue(def, {
      mediaId: "99f3284b-1bf8-473c-85f1-a95134ec25c5",
      src: "https://cdn.example.com/legacy.jpg",
      alt: "Legacy",
    });
    assert.equal(asObject.ok, true);
    assert.equal(asObject.value.placement, undefined);

    const presented = presentImageValue(asObject.value, {});
    assert.equal(presented.src, "https://cdn.example.com/legacy.jpg");
    assert.equal(presented.placement, undefined);

    const legacyStyle = renderPlacementStyle(null, {
      contentKey: "home.hero.image",
      fallbackObjectPosition: "center 42%",
    });
    assert.equal(legacyStyle.hasPlacement, false);
    assert.match(legacyStyle.style, /object-position:center 42%/);
  });

  it("accepts image object + valid placement metadata", () => {
    const def = { type: CONTENT_TYPES.IMAGE, maxLen: 500, key: "home.hero.image" };
    const ok = validateContentValue(def, {
      mediaId: "99f3284b-1bf8-473c-85f1-a95134ec25c5",
      src: "https://cdn.example.com/hero.png",
      alt: "Hero",
      placement: {
        v: 1,
        fit: "cover",
        x: 32,
        y: 68,
        zoom: 1.25,
        mobile: { x: 40, y: 20, zoom: 1.1 },
      },
    });
    assert.equal(ok.ok, true, JSON.stringify(ok));
    assert.equal(ok.value.mediaId, "99f3284b-1bf8-473c-85f1-a95134ec25c5");
    assert.equal(ok.value.src, "https://cdn.example.com/hero.png");
    assert.deepEqual(ok.value.placement, {
      v: PLACEMENT_VERSION,
      fit: "cover",
      x: 32,
      y: 68,
      zoom: 1.25,
      mobile: { fit: "cover", x: 40, y: 20, zoom: 1.1 },
    });

    const presented = presentImageValue(ok.value, {});
    assert.ok(presented.placement);
    assert.equal(presented.placement.x, 32);
    assert.equal(presented.placement.mobile.y, 20);

    const style = renderPlacementStyle(presented.placement, { contentKey: "home.hero.image" });
    assert.equal(style.hasPlacement, true);
    assert.match(style.className, /gp-website-image--placed/);
    assert.match(style.style, /--gp-img-x:32%/);
    assert.match(style.style, /--gp-img-mobile-y:20%/);
    assert.match(style.style, /--gp-img-zoom:1\.25/);
  });

  it("rejects invalid placement and client slot overrides", () => {
    const def = { type: CONTENT_TYPES.IMAGE, maxLen: 500, key: "home.hero.image" };
    const badZoom = validateContentValue(def, {
      src: "https://cdn.example.com/a.png",
      placement: { v: 1, zoom: 9 },
    });
    assert.equal(badZoom.ok, false);
    assert.equal(badZoom.code, "invalid_image_placement_zoom");

    const badFocal = validateImagePlacement({ v: 1, x: -1, y: 50 });
    assert.equal(badFocal.ok, false);

    const slotOverride = validateContentValue(def, {
      src: "https://cdn.example.com/a.png",
      placement: { v: 1, x: 50, y: 50, aspectRatio: "16/9", width: 1920 },
    });
    assert.equal(slotOverride.ok, false);
    assert.equal(slotOverride.code, "image_placement_slot_override");

    const logoSeparate = validateContentValue(
      { type: CONTENT_TYPES.IMAGE, maxLen: 500, key: "home.logo" },
      {
        src: "https://cdn.example.com/logo.png",
        placement: { v: 1, x: 50, y: 50, mobile: { x: 10, y: 10 } },
      }
    );
    assert.equal(logoSeparate.ok, false);
    assert.equal(logoSeparate.code, "image_placement_separate_not_supported");
  });

  it("keeps the same media asset independent across image slots", () => {
    const mediaId = "99f3284b-1bf8-473c-85f1-a95134ec25c5";
    const src = "https://cdn.example.com/shared-asset.png";
    const hero = validateContentValue(
      { type: CONTENT_TYPES.IMAGE, maxLen: 500, key: "home.hero.image" },
      { mediaId, src, alt: "Hero", placement: { v: 1, x: 20, y: 80, zoom: 1.4 } }
    );
    const about = validateContentValue(
      { type: CONTENT_TYPES.IMAGE, maxLen: 500, key: "about.story.image" },
      { mediaId, src, alt: "About", placement: { v: 1, x: 70, y: 30, zoom: 1 } }
    );
    assert.equal(hero.ok, true);
    assert.equal(about.ok, true);
    assert.equal(hero.value.mediaId, about.value.mediaId);
    assert.equal(hero.value.src, about.value.src);
    assert.notDeepEqual(hero.value.placement, about.value.placement);
    assert.equal(editableValuesEqual(hero.value, about.value), false);
  });

  it("BB and AC editable mutations accept placement on home.hero.image", () => {
    ensureProductFieldsRegistered(PRODUCT_CODE.BLESSBOARD);
    ensureProductFieldsRegistered(PRODUCT_CODE.ACTIVECLINIC);
    const payload = {
      mediaId: "99f3284b-1bf8-473c-85f1-a95134ec25c5",
      src: "https://cdn.example.com/hero.png",
      alt: "Placed",
      placement: { v: 1, x: 45, y: 55, zoom: 1.2, mobile: { x: 50, y: 40, zoom: 1.05 } },
    };
    for (const productCode of [PRODUCT_CODE.BLESSBOARD, PRODUCT_CODE.ACTIVECLINIC]) {
      const ok = assertEditableMutation({
        productCode,
        contentKey: "home.hero.image",
        value: payload,
        grantedPermissions: ["website.edit"],
      });
      assert.equal(ok.ok, true, `${productCode}: ${JSON.stringify(ok)}`);
      assert.equal(ok.value.placement.x, 45);
      assert.equal(ok.value.placement.mobile.zoom, 1.05);
    }
  });

  it("desktop/mobile framing falls back to base when mobile omitted", () => {
    const style = renderPlacementStyle(
      { v: 1, x: 12, y: 88, zoom: 1.3, fit: "cover" },
      { contentKey: "home.hero.image" }
    );
    assert.equal(style.hasPlacement, true);
    assert.match(style.style, /--gp-img-x:12%/);
    assert.doesNotMatch(style.style, /--gp-img-mobile-x/);
  });

  it("presentImageValue and branding helpers preserve placement through render paths", () => {
    const value = {
      mediaId: "99f3284b-1bf8-473c-85f1-a95134ec25c5",
      src: "https://cdn.example.com/keep.png",
      alt: "Keep",
      placement: { v: 1, x: 33, y: 66, zoom: 1.15 },
    };
    const presented = presentImageValue(value, {});
    assert.deepEqual(presented.placement, {
      v: 1,
      fit: "cover",
      x: 33,
      y: 66,
      zoom: 1.15,
    });
    const fromBrand = imageFromWebsiteValue(value);
    assert.equal(fromBrand.placement.x, 33);
    assert.equal(placementFromImageValue({ src: "https://cdn.example.com/a.png" }), null);
  });

  it("BB and AC image partials apply placement CSS on render", () => {
    const bbPartial = path.join(ROOT, "views/blessboard/v5/partials/editable-image.ejs");
    const acPartial = path.join(ROOT, "views/activeclinic/partials/website-editable-image.ejs");
    const placement = { v: 1, fit: "cover", x: 28, y: 72, zoom: 1.35, mobile: { x: 60, y: 15, zoom: 1.1 } };

    const bbHtml = ejs.render(read("views/blessboard/v5/partials/editable-image.ejs"), {
      websiteAdmin: null,
      imageSrc: "https://cdn.example.com/bb-hero.jpg",
      imageAlt: "BB",
      imageClass: "bb-tp-hero__img",
      contentKey: "home.hero.image",
      imagePlacement: placement,
    }, { filename: bbPartial });
    assert.match(bbHtml, /gp-website-image--placed/);
    assert.match(bbHtml, /--gp-img-x:28%/);
    assert.match(bbHtml, /--gp-img-mobile-x:60%/);
    assert.match(bbHtml, /src="https:\/\/cdn\.example\.com\/bb-hero\.jpg"/);

    const acHtml = ejs.render(read("views/activeclinic/partials/website-editable-image.ejs"), {
      websiteEdit: false,
      contentKey: "home.hero.image",
      imageSrc: "https://cdn.example.com/ac-hero.jpg",
      imageAlt: "AC",
      imageClassName: "ac-tenant-hero__image",
      imagePlacement: placement,
      imagePosition: "center 42%",
    }, { filename: acPartial });
    assert.match(acHtml, /gp-website-image--placed/);
    assert.match(acHtml, /--gp-img-y:72%/);
    assert.match(acHtml, /src="https:\/\/cdn\.example\.com\/ac-hero\.jpg"/);

    const legacyAc = ejs.render(read("views/activeclinic/partials/website-editable-image.ejs"), {
      websiteEdit: false,
      contentKey: "home.hero.image",
      imageSrc: "https://cdn.example.com/legacy.jpg",
      imageAlt: "Legacy",
      imageClassName: "ac-tenant-hero__image",
      imagePosition: "center 42%",
    }, { filename: acPartial });
    assert.doesNotMatch(legacyAc, /gp-website-image--placed/);
    assert.match(legacyAc, /object-position:center 42%/);
  });

  it("shared CSS ships placement rules and slot registry does not invent global 16:9", () => {
    const css = read("public/platform/website-inline-edit.css");
    assert.match(css, /\.gp-website-image--placed/);
    assert.match(css, /--gp-img-mobile-x/);
    assert.equal(IMAGE_SLOT_REGISTRY["home.hero.image"].aspectDesktop, null);
    assert.equal(IMAGE_SLOT_REGISTRY["home.logo"].supportsSeparateFraming, false);
  });

  it("field history restore path stores full IMAGE objects including placement", () => {
    // History restores draft_value JSON as-is; confirm contract survives serialize round-trip.
    const value = {
      mediaId: "99f3284b-1bf8-473c-85f1-a95134ec25c5",
      src: "https://cdn.example.com/hist.png",
      alt: "History",
      placement: { v: 1, x: 10, y: 90, zoom: 1.5 },
    };
    const roundTrip = JSON.parse(JSON.stringify(value));
    const validated = validateContentValue(
      { type: CONTENT_TYPES.IMAGE, maxLen: 500, key: "home.hero.image" },
      roundTrip
    );
    assert.equal(validated.ok, true);
    assert.equal(validated.value.placement.y, 90);
    const restored = validateContentValue(
      { type: CONTENT_TYPES.IMAGE, maxLen: 500, key: "home.hero.image" },
      JSON.parse(JSON.stringify(validated.value))
    );
    assert.equal(restored.ok, true);
    assert.equal(editableValuesEqual(validated.value, restored.value), true);
  });
});
