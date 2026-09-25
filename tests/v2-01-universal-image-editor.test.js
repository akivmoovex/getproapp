"use strict";

/**
 * V2_01 Universal Image Editor UI — client contract + integration assertions.
 * Graphical crop QA also requires hosted browser evidence (see QA doc).
 */

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const ejs = require("ejs");

const {
  validateImagePlacement,
  validateContentValue,
  // content types via validateContentValue
} = (() => {
  const { validateImagePlacement } = require("../src/platform/website/imagePlacement");
  const { validateContentValue, CONTENT_TYPES } = require("../src/platform/website/contentTypes");
  return { validateImagePlacement, validateContentValue, CONTENT_TYPES };
})();
const { CONTENT_TYPES } = require("../src/platform/website/contentTypes");
const {
  PRODUCT_CODE,
  assertEditableMutation,
  ensureProductFieldsRegistered,
} = require("../src/platform/website/editableFieldSchema");

const ROOT = path.join(__dirname, "..");
function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), "utf8");
}

describe("V2_01 universal image editor UI", () => {
  it("shared inline editor exposes Adjust Picture framing controls", () => {
    const js = read("public/platform/website-inline-edit.js");
    assert.match(js, /data-website-adjust/);
    assert.match(js, /Adjust Picture/);
    assert.match(js, /Choose from Image Library/);
    assert.match(js, /Upload from computer/);
    assert.match(js, /data-website-frame-zoom/);
    assert.match(js, /data-website-frame-fit/);
    assert.match(js, /data-website-frame-reset/);
    assert.match(js, /data-website-frame-mode="mobile"/);
    assert.match(js, /serializePlacementForSave/);
    assert.match(js, /pointerdown/);
    assert.match(js, /ArrowLeft/);
    assert.match(js, /maxImageBytes/);
    assert.match(js, /image\/jpeg/);
    assert.match(js, /5 MB/);
    assert.match(js, /value\.placement = placement/);
    assert.doesNotMatch(js, /aspectRatio:\s*["']9\s*\/\s*16/);
  });

  it("framing CSS is touch-friendly and overflow-safe at 390px", () => {
    const css = read("public/platform/website-inline-edit.css");
    assert.match(css, /\.gp-website-framing/);
    assert.match(css, /min-height:\s*44px/);
    assert.match(css, /touch-action:\s*none/);
    assert.match(css, /@media \(max-width:\s*390px\)/);
    assert.match(css, /max-width:\s*100%/);
  });

  it("BB/AC editable image partials expose slot separate + placement attrs", () => {
    const bb = read("views/blessboard/v5/partials/editable-image.ejs");
    const ac = read("views/activeclinic/partials/website-editable-image.ejs");
    assert.match(bb, /data-website-slot-separate/);
    assert.match(bb, /data-website-image-placement/);
    assert.match(ac, /data-website-slot-separate/);
    assert.match(ac, /data-website-image-placement/);

    const bbHtml = ejs.render(bb, {
      websiteAdmin: { editingMode: true },
      imageSrc: "https://cdn.example.com/h.jpg",
      imageAlt: "H",
      contentKey: "home.hero.image",
      imagePlacement: { v: 1, x: 22, y: 78, zoom: 1.3, fit: "cover", mobile: { x: 55, y: 25, zoom: 1.1 } },
    }, { filename: path.join(ROOT, "views/blessboard/v5/partials/editable-image.ejs") });
    assert.match(bbHtml, /data-website-slot-separate="1"/);
    assert.match(bbHtml, /data-website-image-placement=/);
    assert.match(bbHtml, /--gp-img-x:22%/);

    const logoHtml = ejs.render(bb, {
      websiteAdmin: { editingMode: true },
      imageSrc: "https://cdn.example.com/logo.png",
      imageAlt: "L",
      contentKey: "home.logo",
    }, { filename: path.join(ROOT, "views/blessboard/v5/partials/editable-image.ejs") });
    assert.match(logoHtml, /data-website-slot-separate="0"/);
  });

  it("client placement serialization shape validates on server for BB and AC", () => {
    ensureProductFieldsRegistered(PRODUCT_CODE.BLESSBOARD);
    ensureProductFieldsRegistered(PRODUCT_CODE.ACTIVECLINIC);
    const payload = {
      mediaId: "99f3284b-1bf8-473c-85f1-a95134ec25c5",
      src: "https://cdn.example.com/hero.png",
      alt: "Framed",
      placement: { v: 1, fit: "cover", x: 28, y: 72, zoom: 1.35, mobile: { x: 60, y: 15, zoom: 1.1 } },
    };
    for (const productCode of [PRODUCT_CODE.BLESSBOARD, PRODUCT_CODE.ACTIVECLINIC]) {
      const ok = assertEditableMutation({
        productCode,
        contentKey: "home.hero.image",
        value: payload,
        grantedPermissions: ["website.edit"],
      });
      assert.equal(ok.ok, true, JSON.stringify(ok));
      assert.equal(ok.value.placement.mobile.x, 60);
    }

    const checked = validateImagePlacement(payload.placement, { contentKey: "home.hero.image" });
    assert.equal(checked.ok, true);

    const logoMobile = validateContentValue(
      { type: CONTENT_TYPES.IMAGE, maxLen: 500, key: "home.logo" },
      {
        src: "https://cdn.example.com/logo.png",
        placement: { v: 1, x: 50, y: 50, mobile: { x: 10, y: 10 } },
      }
    );
    assert.equal(logoMobile.ok, false);

    const independent = [
      validateContentValue(
        { type: CONTENT_TYPES.IMAGE, maxLen: 500, key: "home.hero.image" },
        { ...payload, alt: "Hero", placement: { v: 1, x: 10, y: 90, zoom: 1.4 } }
      ),
      validateContentValue(
        { type: CONTENT_TYPES.IMAGE, maxLen: 500, key: "about.story.image" },
        { ...payload, alt: "About", placement: { v: 1, x: 80, y: 20, zoom: 1.1 } }
      ),
    ];
    assert.equal(independent[0].ok, true);
    assert.equal(independent[1].ok, true);
    assert.notDeepEqual(independent[0].value.placement, independent[1].value.placement);
    assert.equal(independent[0].value.mediaId, independent[1].value.mediaId);
  });

  it("drag/zoom/reset helpers are present and default placement omits empty framing", () => {
    const js = read("public/platform/website-inline-edit.js");
    assert.match(js, /function placementIsDefault/);
    assert.match(js, /function serializePlacementForSave/);
    assert.match(js, /data-website-frame-reset/);
    assert.match(js, /drag\.frame\.x - dx/);
    // Defaults should not invent placement on save
    assert.match(js, /if \(placement\) value\.placement = placement/);
  });

  it("asset cache bumps reference the B3 editor build", () => {
    assert.match(read("views/blessboard/v5/partials/tenant-public-shell-end.ejs"), /website-inline-edit\.js\?v=v2-img-editor-2/);
    assert.match(read("views/blessboard/v5/partials/tenant-public-shell-start.ejs"), /website-inline-edit\.css\?v=v2-img-editor-2/);
    assert.match(read("src/platform/website/renderWebsiteManagementPage.js"), /v2-img-editor-2/);
    assert.match(read("src/activeclinic/http/renderActiveClinicPublic.js"), /ASSET_VERSION = "v2-theme-c3-1"/);
  });
});
