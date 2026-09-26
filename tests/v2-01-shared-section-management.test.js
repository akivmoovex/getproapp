"use strict";

/**
 * V2.01 shared section management — contract + BB home freeform render + AC gating.
 */

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");

const {
  listSupportedSectionTypes,
  describePageSectionSupport,
  SHARED_OPERATIONS,
} = require("../src/platform/website/sections/sharedSectionContract");
const { PRODUCT_CODE } = require("../src/platform/website/publicWebsiteUrl");

function read(rel) {
  return fs.readFileSync(path.join(__dirname, "..", rel), "utf8");
}

describe("V2_01 shared section management", () => {
  it("exposes a minimal shared section contract for BB and AC registry types only", () => {
    const bb = listSupportedSectionTypes(PRODUCT_CODE.BLESSBOARD);
    const ac = listSupportedSectionTypes(PRODUCT_CODE.ACTIVECLINIC);
    assert.ok(bb.some((t) => t.type === "plain_text" && t.pages.includes("home")));
    assert.ok(bb.some((t) => t.type === "image_text"));
    assert.ok(ac.some((t) => t.type === "text"));
    assert.ok(ac.some((t) => t.type === "services" && t.domainBacked === true));
    assert.ok(SHARED_OPERATIONS.includes("add_section"));
    assert.ok(SHARED_OPERATIONS.includes("move_up"));
    assert.ok(SHARED_OPERATIONS.includes("hide"));
    assert.ok(SHARED_OPERATIONS.includes("remove"));
    assert.equal(
      bb.some((t) => t.type === "magic_carousel"),
      false,
      "must not invent unsupported section types"
    );
  });

  it("marks BB collection pages as item-managed instead of freeform Add Section", () => {
    const leadership = describePageSectionSupport(PRODUCT_CODE.BLESSBOARD, "leadership", []);
    assert.equal(leadership.canAddSection, false);
    assert.equal(leadership.collectionManaged, true);
    assert.equal(leadership.memberAction, "Add leadership member");
    assert.match(leadership.emptyHint, /Add leadership member/i);
    assert.ok(leadership.itemOperations.includes("add_item"));

    const home = describePageSectionSupport(PRODUCT_CODE.BLESSBOARD, "home", []);
    assert.equal(home.canAddSection, true);
    assert.ok(home.addableTypes.some((t) => t.type === "plain_text"));
  });

  it("BB home template renders freeform draft sections with data-section hooks", () => {
    const home = read("views/blessboard/v5/public/home.ejs");
    assert.match(home, /isFreeformHomeSection/);
    assert.match(home, /data-bb-home-freeform/);
    assert.match(home, /homeMiddleRenderOrder\.forEach/);
    assert.match(home, /content-block-media/);
  });

  it("AC chrome gates Add Section URL with describeAddSectionAvailability", () => {
    const chrome = read("src/activeclinic/http/attachActiveClinicWebsiteChrome.js");
    assert.match(chrome, /describeAddSectionAvailability/);
    assert.match(chrome, /canAddSection/);
    assert.match(chrome, /addSectionUrl = addAvail\.canAddSection/);
  });

  it("collection-managed pages surface member-action hint when Add Section is hidden", () => {
    const picker = read("views/platform/website-engine/add-section-picker.ejs");
    assert.match(picker, /data-website-collection-hint/);
    assert.match(picker, /addSectionMemberAction/);
    assert.match(picker, /collectionManaged/);
    const css = read("public/platform/website-add-section.css");
    assert.match(css, /\.gp-website-add-section__collection-hint/);
  });

  it("asset cache bumps reference the section-management build", () => {
    assert.match(
      read("views/blessboard/v5/partials/tenant-public-shell-start.ejs"),
      /website-add-section\.css\?v=v2-theme-infra-1/
    );
    assert.match(
      read("src/activeclinic/http/renderActiveClinicPublic.js"),
      /ASSET_VERSION = "v2-toolbar-parity-2"/
    );
  });
});
