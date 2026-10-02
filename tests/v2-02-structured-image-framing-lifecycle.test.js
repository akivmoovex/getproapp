"use strict";

/**
 * V2.02 structured Category-A image framing lifecycle contract.
 * Asserts mount API + placement persistence path without pixel screenshots.
 */

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");

const {
  validateImagePlacement,
  renderPlacementStyle,
} = require("../src/platform/website/imagePlacement");
const { resolveSectionMediaFromDraft } = require("../src/blessboard/website/sectionMediaDraftFields");
const {
  validateStructuredPayload,
} = require("../src/blessboard/services/websiteStructuredDraftValidation");
const {
  mergeEntityImagePlacement,
  readEntityImagePlacement,
} = require("../src/blessboard/website/entityImagePlacement");
const { structuredImageFramingEnabled } = require("../src/blessboard/website/blessboardStructuredImageFraming");

const ROOT = path.join(__dirname, "..");
function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), "utf8");
}

describe("V2.02 structured Universal Image Editor lifecycle", () => {
  it("platform exposes shared openFraming mount API used by structured editor", () => {
    const inline = read("public/platform/website-inline-edit.js");
    const structured = read("public/blessboard/v5/website-structured-edit.js");
    assert.match(inline, /GpUniversalImageEditor/);
    assert.match(inline, /function openExternalFraming/);
    assert.match(inline, /externalMount/);
    assert.match(structured, /GpUniversalImageEditor/);
    assert.match(structured, /openFraming/);
    assert.match(structured, /data-bb-se-adjust/);
    assert.match(structured, /Adjust Picture/);
    // Category B QR must remain framing-disabled.
    assert.match(structured, /framing:\s*false/);
    assert.equal(structuredImageFramingEnabled("image"), true);
    assert.equal(structuredImageFramingEnabled("leader"), true);
    assert.equal(structuredImageFramingEnabled("giving_method"), false);
    assert.equal(structuredImageFramingEnabled("image", { fieldName: "qrImageUrl" }), false);
  });

  it("structured image draft validates placement via platform validateImagePlacement", () => {
    const bad = validateStructuredPayload(
      "image",
      {
        imageUrl: "https://cdn.example.com/a.jpg",
        altText: "Alt",
        placement: { v: 1, x: -5, y: 50, zoom: 1 },
      },
      "upsert"
    );
    assert.equal(bad.ok, false);

    const good = validateStructuredPayload(
      "image",
      {
        imageUrl: "https://cdn.example.com/a.jpg",
        altText: "Alt",
        placement: { v: 1, x: 22, y: 78, zoom: 1.4, fit: "contain" },
      },
      "upsert"
    );
    assert.equal(good.ok, true);
    assert.deepEqual(good.payload.placement.x, 22);
    assert.equal(good.payload.placement.fit, "contain");
  });

  it("section media draft → layoutMetadata.imagePlacement → renderPlacementStyle", () => {
    const placement = { v: 1, x: 30, y: 70, zoom: 1.25, fit: "cover" };
    const resolved = resolveSectionMediaFromDraft({
      draftKind: "image",
      payload: {
        imageUrl: "https://cdn.example.com/hero.jpg",
        altText: "Hero",
        placement,
      },
      existingMediaUrl: null,
      existingLayout: {},
    });
    assert.equal(resolved.mediaUrl, "https://cdn.example.com/hero.jpg");
    assert.deepEqual(resolved.layoutPatch.imagePlacement, placement);

    const checked = validateImagePlacement(resolved.layoutPatch.imagePlacement);
    assert.equal(checked.ok, true);
    const style = renderPlacementStyle(checked.value);
    assert.equal(style.hasPlacement, true);
    assert.match(style.style, /--gp-img-x:30%/);
    assert.match(style.style, /--gp-img-y:70%/);
    assert.match(style.style, /--gp-img-zoom:1\.25/);
  });

  it("entity placement persists on page layout_metadata map without migration", () => {
    const placement = { v: 1, x: 10, y: 90, zoom: 1.1, fit: "cover" };
    const next = mergeEntityImagePlacement({}, "leader", "leader-1", placement);
    assert.deepEqual(readEntityImagePlacement(next, "leader", "leader-1"), placement);
    const cleared = mergeEntityImagePlacement(next, "leader", "leader-1", null);
    assert.equal(readEntityImagePlacement(cleared, "leader", "leader-1"), null);
  });

  it("replacement preserves placement in structured form (canonical inline rule)", () => {
    const structured = read("public/blessboard/v5/website-structured-edit.js");
    // applySelectedMedia reapplies existing placement to previews — does not wipe it.
    assert.match(structured, /applySelectedMedia/);
    assert.match(structured, /applyPlacementToElement\(img, placement\)/);
    // Remove clears placement.
    assert.match(structured, /placeClear\.value = ""/);
  });
});
