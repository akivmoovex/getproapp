"use strict";

const assert = require("node:assert/strict");
const { describe, it } = require("node:test");
const {
  listAddableSectionTypes,
  resolveSectionTypeDefinition,
} = require("../src/platform/website/sectionRegistry");
const {
  validateSectionContent,
} = require("../src/platform/website/sections/sectionValidation");

describe("BB-V211-005 Add Section image support", () => {
  it("exposes text, image-only, and image-with-text types for BlessBoard", () => {
    const types = listAddableSectionTypes("blessboard", "home", []);
    assert.deepEqual(
      [...new Set(types.filter((item) => ["plain_text", "image", "image_text"].includes(item.type))
        .map((item) => item.type))],
      ["plain_text", "image", "image_text"]
    );
  });

  it("resolves image definitions on supported pages", () => {
    assert.equal(resolveSectionTypeDefinition("blessboard", "image", "home").kind, "image");
    assert.equal(resolveSectionTypeDefinition("blessboard", "image_text", "about").kind, "image_text");
  });

  it("validates image-only and text-with-image content", () => {
    const image = validateSectionContent({
      productCode: "blessboard",
      sectionType: "image",
      mediaUrl: "https://cdn.test.invalid/qa67.png",
      image: { altText: "Synthetic QA image" },
    });
    const imageText = validateSectionContent({
      productCode: "blessboard",
      sectionType: "image_text",
      heading: "QA story",
      bodyText: "Safe body",
      mediaUrl: "https://cdn.test.invalid/qa67.png",
    });
    assert.equal(image.ok, true);
    assert.equal(image.payload.mediaUrl, "https://cdn.test.invalid/qa67.png");
    assert.equal(imageText.ok, true);
    assert.equal(imageText.payload.bodyText, "Safe body");
  });

  it("preserves text-only validation and normalizes optional media", () => {
    const text = validateSectionContent({
      productCode: "blessboard",
      sectionType: "plain_text",
      heading: "Text",
      bodyText: "Existing behavior",
    });
    assert.equal(text.ok, true);
  });
});
