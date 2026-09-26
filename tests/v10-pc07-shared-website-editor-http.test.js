"use strict";

/**
 * PC07 — shared website editor HTTP architecture guard.
 */

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), "utf8");
}

describe("PC07 shared website editor HTTP architecture", () => {
  it("platform shared kit exists and exports core handlers", () => {
    const utils = require("../src/platform/website/http/websiteEditorHttpUtils");
    const ops = require("../src/platform/website/http/websiteEditorSharedOperations");
    assert.equal(typeof utils.json, "function");
    assert.equal(typeof utils.clientTenantOverride, "function");
    assert.equal(typeof utils.createWebsiteMediaUpload, "function");
    assert.equal(typeof ops.handleSaveGenericDraft, "function");
    assert.equal(typeof ops.handleRestoreFieldHistory, "function");
    assert.equal(typeof ops.sendStylesEditorPage, "function");
    assert.equal(typeof ops.handleAddWebsiteSection, "function");
  });

  it("BB and AC editor routes import the shared kit (no product-conditional mega-handler)", () => {
    const bb = read("src/blessboard/http/blessboardWebsiteEditorRoutes.js");
    const ac = read("src/activeclinic/http/activeClinicWebsiteRoutes.js");
    assert.match(bb, /website\/http\/websiteEditorHttpUtils/);
    assert.match(bb, /website\/http\/websiteEditorSharedOperations/);
    assert.match(ac, /website\/http\/websiteEditorHttpUtils/);
    assert.match(ac, /website\/http\/websiteEditorSharedOperations/);
    assert.doesNotMatch(bb, /if\s*\(\s*productCode\s*===\s*['\"]activeclinic['\"]/);
    assert.doesNotMatch(ac, /if\s*\(\s*productCode\s*===\s*['\"]blessboard['\"]/);
  });

  it("retains intentional product URL / workflow divergences", () => {
    const bb = read("src/blessboard/http/blessboardWebsiteEditorRoutes.js");
    const ac = read("src/activeclinic/http/activeClinicWebsiteRoutes.js");
    assert.match(ac, /\/website\/unpublish/);
    assert.match(ac, /\/website\/submit/);
    assert.match(ac, /\/website\/edit-session\/finish/);
    assert.doesNotMatch(bb, /\/website\/unpublish(?![a-zA-Z-])/);
    assert.match(bb, /publishChurchWebsite/);
    assert.match(ac, /publishWebsiteDraft/);
  });

  it("product adapter responsibility modules exist", () => {
    assert.equal(
      fs.existsSync(path.join(ROOT, "src/blessboard/website/blessboardWebsiteEditorAdapter.js")),
      true
    );
    assert.equal(
      fs.existsSync(path.join(ROOT, "src/activeclinic/website/activeClinicWebsiteEditorAdapter.js")),
      true
    );
  });
});
