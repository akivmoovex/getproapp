"use strict";

/**
 * BB-01 — Homepage section editing (database-independent contracts).
 *
 * Covers Add Section registry ↔ editor allowlist parity so newly created
 * text_/cta_/image_/story_ sections remain editable (heading/body/image).
 */

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");

const {
  listAddableSectionTypes,
  resolveSectionTypeDefinition,
} = require("../../../src/platform/website/sectionRegistry");
const {
  validateSectionContent,
} = require("../../../src/platform/website/sections/sectionValidation");
const {
  addWebsiteSection,
} = require("../../../src/platform/website/websiteAddSectionService");
const {
  PRODUCT_CODE,
  ensureProductFieldsRegistered,
  resolveEditableField,
  assertEditableMutation,
} = require("../../../src/platform/website/editableFieldSchema");

const ROOT = path.join(__dirname, "../../..");
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), "utf8");

const ADDABLE_PREFIXES = Object.freeze({
  plain_text: "text",
  image: "image",
  image_text: "story",
  cta: "cta",
});

function sampleSectionKey(prefix) {
  return `${prefix}_deadbeef`;
}

describe("BB-01 homepage section contracts", () => {
  it("exposes supported BlessBoard home section types with editor kinds", () => {
    const types = listAddableSectionTypes("blessboard", "home", []);
    const byType = new Map(types.map((t) => [t.type + ":" + (t.keyPrefix || ""), t]));
    assert.ok(types.some((t) => t.type === "plain_text" && t.keyPrefix === "text"));
    assert.ok(types.some((t) => t.type === "image" && t.keyPrefix === "image"));
    assert.ok(types.some((t) => t.type === "image_text" && t.keyPrefix === "story"));
    assert.ok(types.some((t) => t.keyPrefix === "cta"));
    assert.equal(resolveSectionTypeDefinition("blessboard", "plain_text", "home").kind, "text");
    assert.equal(resolveSectionTypeDefinition("blessboard", "image", "home").kind, "image");
    assert.equal(resolveSectionTypeDefinition("blessboard", "image_text", "home").kind, "image_text");
    assert.ok(byType.size >= 4);
  });

  it("resolves new section identifiers to definitions and rejects unsupported types", () => {
    assert.ok(resolveSectionTypeDefinition("blessboard", "plain_text", "home"));
    assert.equal(resolveSectionTypeDefinition("blessboard", "not_a_real_section", "home"), null);
  });

  it("documents image_* and story_* keyPrefix contracts (addable types vs raw key aliases)", () => {
    const types = listAddableSectionTypes("blessboard", "home", []);
    const image = types.find((t) => t.type === "image");
    const story = types.find((t) => t.type === "image_text");
    assert.ok(image);
    assert.ok(story);
    assert.equal(image.keyPrefix, "image");
    assert.equal(story.keyPrefix, "story");
    // Raw aliases image_* / story_* are section keys, not addable type ids.
    assert.equal(resolveSectionTypeDefinition("blessboard", "image_hero", "home"), null);
    assert.equal(resolveSectionTypeDefinition("blessboard", "story_main", "home"), null);
    assert.equal(resolveSectionTypeDefinition("blessboard", "image_", "home"), null);
    assert.equal(resolveSectionTypeDefinition("blessboard", "story_", "home"), null);
  });

  it("maps every addable home section prefix to a valid editor contract", () => {
    ensureProductFieldsRegistered(PRODUCT_CODE.BLESSBOARD);
    const types = listAddableSectionTypes("blessboard", "home", []);
    assert.ok(types.length >= 4);

    for (const type of types) {
      const prefix = type.keyPrefix || ADDABLE_PREFIXES[type.type];
      assert.ok(prefix, `missing keyPrefix for ${type.type}`);
      const sectionKey = sampleSectionKey(prefix);

      for (const fieldKey of ["heading", "bodyText"]) {
        const viaLocator = resolveEditableField({
          productCode: PRODUCT_CODE.BLESSBOARD,
          pageKey: "home",
          sectionKey,
          fieldKey,
        });
        assert.equal(viaLocator.ok, true, `${sectionKey}.${fieldKey} locator`);

        const viaContentKey = resolveEditableField({
          productCode: PRODUCT_CODE.BLESSBOARD,
          contentKey: `home.${sectionKey}.${fieldKey}`,
        });
        assert.equal(
          viaContentKey.ok,
          true,
          `${sectionKey}.${fieldKey} contentKey (DOM camelCase) must resolve — BB-01 regression`
        );
      }

      const imageField = resolveEditableField({
        productCode: PRODUCT_CODE.BLESSBOARD,
        contentKey: `home.${sectionKey}.image`,
      });
      assert.equal(imageField.ok, true, `${sectionKey}.image must be editable`);
      assert.equal(imageField.field.type, "image");
    }
  });

  it("allows text/image/CTA body mutations and rejects unsupported fields safely", () => {
    ensureProductFieldsRegistered(PRODUCT_CODE.BLESSBOARD);

    const textOk = assertEditableMutation({
      productCode: PRODUCT_CODE.BLESSBOARD,
      contentKey: "home.text_deadbeef.bodyText",
      value: "Welcome body",
      grantedPermissions: ["website.edit"],
    });
    assert.equal(textOk.ok, true);
    assert.equal(textOk.value, "Welcome body");

    const imageOk = assertEditableMutation({
      productCode: PRODUCT_CODE.BLESSBOARD,
      contentKey: "home.image_deadbeef.heading",
      value: "Image caption heading",
      grantedPermissions: ["website.edit"],
    });
    assert.equal(imageOk.ok, true);

    const storyImage = assertEditableMutation({
      productCode: PRODUCT_CODE.BLESSBOARD,
      contentKey: "home.story_deadbeef.image",
      value: { src: "https://cdn.test.invalid/bb01-story.png", alt: "Story" },
      grantedPermissions: ["website.edit"],
    });
    assert.equal(storyImage.ok, true);

    const ctaOk = assertEditableMutation({
      productCode: PRODUCT_CODE.BLESSBOARD,
      contentKey: "home.cta_deadbeef.bodyText",
      value: "Join us this Sunday",
      grantedPermissions: ["website.edit"],
    });
    assert.equal(ctaOk.ok, true);

    const ctaLabel = assertEditableMutation({
      productCode: PRODUCT_CODE.BLESSBOARD,
      contentKey: "home.cta_deadbeef.buttonText",
      value: "Plan a visit",
      grantedPermissions: ["website.edit"],
    });
    assert.equal(ctaLabel.ok, true);
    assert.equal(ctaLabel.value, "Plan a visit");

    const ctaUrl = assertEditableMutation({
      productCode: PRODUCT_CODE.BLESSBOARD,
      contentKey: "home.cta_deadbeef.buttonUrl",
      value: "https://example.org/visit",
      grantedPermissions: ["website.edit"],
    });
    assert.equal(ctaUrl.ok, true);
    assert.equal(ctaUrl.value, "https://example.org/visit");

    const relativeUrl = assertEditableMutation({
      productCode: PRODUCT_CODE.BLESSBOARD,
      contentKey: "home.cta_deadbeef.buttonUrl",
      value: "/contact",
      grantedPermissions: ["website.edit"],
    });
    assert.equal(relativeUrl.ok, true);

    for (const unsafe of ["javascript:alert(1)", "data:text/html,hi", "vbscript:msg", "//evil.example/phish"]) {
      const rejected = assertEditableMutation({
        productCode: PRODUCT_CODE.BLESSBOARD,
        contentKey: "home.cta_deadbeef.buttonUrl",
        value: unsafe,
        grantedPermissions: ["website.edit"],
      });
      assert.equal(rejected.ok, false, unsafe);
      assert.equal(rejected.reason, "invalid_url");
    }

    const textButton = resolveEditableField({
      productCode: PRODUCT_CODE.BLESSBOARD,
      contentKey: "home.text_deadbeef.buttonText",
    });
    assert.equal(textButton.ok, false);

    const unsupportedField = resolveEditableField({
      productCode: PRODUCT_CODE.BLESSBOARD,
      contentKey: "home.image_deadbeef.buttonText",
    });
    assert.equal(unsupportedField.ok, false);
    assert.equal(unsupportedField.code, "unknown_content_key");

    const unsupportedPrefix = resolveEditableField({
      productCode: PRODUCT_CODE.BLESSBOARD,
      contentKey: "home.bogus_deadbeef.heading",
    });
    assert.equal(unsupportedPrefix.ok, false);
    assert.equal(unsupportedPrefix.code, "unknown_content_key");
  });

  it("denies unauthorized editing and keeps static section keys compatible", () => {
    ensureProductFieldsRegistered(PRODUCT_CODE.BLESSBOARD);

    const denied = assertEditableMutation({
      productCode: PRODUCT_CODE.BLESSBOARD,
      contentKey: "home.story_deadbeef.heading",
      value: "Nope",
      grantedPermissions: [],
    });
    assert.equal(denied.ok, false);
    assert.equal(denied.code, "forbidden");

    const hero = resolveEditableField({
      productCode: PRODUCT_CODE.BLESSBOARD,
      contentKey: "home.hero.heading",
    });
    assert.equal(hero.ok, true);

    const welcome = resolveEditableField({
      productCode: PRODUCT_CODE.BLESSBOARD,
      pageKey: "home",
      sectionKey: "welcome",
      fieldKey: "heading",
    });
    assert.equal(welcome.ok, true);
  });

  it("home freeform + media partials expose editable controls for dynamic section keys", () => {
    const home = read("views/blessboard/v5/public/home.ejs");
    const media = read("views/blessboard/v5/public/partials/content-block-media.ejs");
    assert.match(home, /isFreeformHomeSection/);
    assert.match(home, /\^\(text\|image\|story\|cta\)_/i);
    assert.match(home, /editFieldKey: 'heading'/);
    assert.match(home, /editFieldKey: 'bodyText'/);
    assert.match(home, /editFieldKey: 'buttonText'/);
    assert.match(home, /editFieldKey: 'buttonUrl'/);
    assert.match(home, /data-bb-home-cta-button="1"/);
    assert.match(home, /https\?:\\\/\\\//);
    assert.match(media, /\^\(text\|cta\|image\|story\)_/i);
  });

  it("validates CTA layout text sections used as promotional bands", () => {
    const types = listAddableSectionTypes("blessboard", "home", []);
    const cta = types.find((t) => t.layout === "cta" || t.keyPrefix === "cta");
    assert.ok(cta, "CTA addable section must be listed for home");
    const content = validateSectionContent({
      productCode: "blessboard",
      sectionType: "plain_text",
      heading: "Take the next step",
      bodyText: "Join us this Sunday",
    });
    assert.equal(content.ok, true);
  });

  it("validates text and image schemas; unsupported content fails safely", () => {
    const text = validateSectionContent({
      productCode: "blessboard",
      sectionType: "plain_text",
      heading: "Welcome",
      bodyText: "Body",
    });
    assert.equal(text.ok, true);

    const image = validateSectionContent({
      productCode: "blessboard",
      sectionType: "image",
      mediaUrl: "https://cdn.test.invalid/bb01.png",
      image: { altText: "BB-01" },
    });
    assert.equal(image.ok, true);

    const badUrl = validateSectionContent({
      productCode: "blessboard",
      sectionType: "image",
      mediaUrl: "https://cdn.test.invalid/bad space.png",
    });
    assert.equal(badUrl.ok, false);

    // Draft image sections may be created without media; editor attaches later.
    const draftImage = validateSectionContent({
      productCode: "blessboard",
      sectionType: "image",
      heading: "No media yet",
    });
    assert.equal(draftImage.ok, true);
  });

  it("addWebsiteSection enforces edit permission and rejects unsupported types", async () => {
    const denied = await addWebsiteSection(
      { query: async () => ({ rows: [] }) },
      {
        productCode: "blessboard",
        pageKey: "home",
        type: "plain_text",
        organizationId: "00000000-0000-4000-8000-000000000001",
        churchId: "00000000-0000-4000-8000-000000000002",
        editorUserId: "00000000-0000-4000-8000-000000000003",
      }
    );
    assert.equal(denied.ok, false);
    assert.equal(denied.code, "forbidden");

    const result = await addWebsiteSection(
      { query: async () => ({ rows: [] }) },
      {
        productCode: "blessboard",
        pageKey: "home",
        type: "totally_unsupported_type",
        organizationId: "00000000-0000-4000-8000-000000000001",
        churchId: "00000000-0000-4000-8000-000000000002",
        editorUserId: "00000000-0000-4000-8000-000000000003",
        grantedPermissions: ["website.edit"],
      }
    );
    assert.equal(result.ok, false);
    assert.equal(result.code, "invalid_section_type");
  });

  it("website editor routes gate add-section behind authenticated product handlers", () => {
    const src = read("src/blessboard/http/blessboardWebsiteEditorRoutes.js");
    assert.match(src, /website\/add-section\/types/);
    assert.match(src, /website\/add-section/);
    assert.match(src, /invalid_section_type/);
    assert.match(src, /handleListAddableSectionTypes|listAddableSectionTypes|addSection/);
    assert.match(src, /resolveEditableField/);
    assert.match(src, /editableFieldSchema/);
  });

  it("content admin section edit routes require content gate", () => {
    const src = read("src/blessboard/http/contentAdminRoutes.js");
    assert.match(src, /pages\/:pageKey\/sections/);
    assert.match(src, /gateContent/);
  });

  it("schema allowlist includes all Add Section key prefixes (BB-01 recurrence guard)", () => {
    const schema = read("src/platform/website/editableFieldSchema.js");
    assert.match(schema, /text\|cta\|image\|story/);
    assert.match(schema, /bodytext/);
    assert.match(schema, /CONTENT_TYPES\.IMAGE/);
  });

  it("regression matrix records local editor repair without closing DB or browser stages", () => {
    const matrix = JSON.parse(read("docs/qa/V213_BB_REGRESSION_MATRIX.json"));
    const issue = matrix.issues.find((row) => row.id === "BB-01");
    const blocker = matrix.releaseBlockers.find((row) => row.id === "BB-01");
    assert.ok(issue);
    assert.ok(blocker);
    assert.match(issue.implementationStatus, /EDITOR_REPAIRED_LOCALLY_UNCOMMITTED/);
    assert.match(issue.implementationStatus, /INTEGRATION_NOT_RUN/);
    assert.match(issue.implementationStatus, /BROWSER_NOT_RUN/);
    assert.equal(blocker.status, "REPAIRED_DB_INDEPENDENT_UNCOMMITTED");
    assert.equal(blocker.releaseBlocker, true);
    assert.notEqual(blocker.status, "CLOSED");
    assert.equal(issue.automatedTests.unit, "tests/v13/unit/bb01-homepage-section-editor.test.js");
  });
});
