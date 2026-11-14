"use strict";

/**
 * BB-01 unit coverage — editor contract for newly created homepage sections.
 * Database-independent; does not write.
 */

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");

const {
  PRODUCT_CODE,
  ensureProductFieldsRegistered,
  resolveEditableField,
  assertEditableMutation,
} = require("../../../src/platform/website/editableFieldSchema");
const { listAddableSectionTypes } = require("../../../src/platform/website/sectionRegistry");

describe("BB-01 homepage section editor unit", () => {
  it("prevents the original missing-controls condition for every addable prefix", () => {
    ensureProductFieldsRegistered(PRODUCT_CODE.BLESSBOARD);
    const types = listAddableSectionTypes("blessboard", "home", []);
    const prefixes = [...new Set(types.map((t) => t.keyPrefix).filter(Boolean))];
    assert.deepEqual(prefixes.sort(), ["cta", "image", "story", "text"]);

    for (const prefix of prefixes) {
      const sectionKey = `${prefix}_aabb01`;
      for (const field of ["heading", "bodyText", "image"]) {
        const resolved = resolveEditableField({
          productCode: PRODUCT_CODE.BLESSBOARD,
          contentKey: `home.${sectionKey}.${field}`,
        });
        assert.equal(
          resolved.ok,
          true,
          `missing editor for home.${sectionKey}.${field} — BB-01 must not recur`
        );
      }
    }
  });

  it("rejects cross-prefix spoofing and empty permissions", () => {
    ensureProductFieldsRegistered(PRODUCT_CODE.BLESSBOARD);

    assert.equal(
      resolveEditableField({
        productCode: PRODUCT_CODE.BLESSBOARD,
        contentKey: "home.other_deadbeef.heading",
      }).code,
      "unknown_content_key"
    );

    const denied = assertEditableMutation({
      productCode: PRODUCT_CODE.BLESSBOARD,
      contentKey: "home.image_aabb01.heading",
      value: "x",
      grantedPermissions: ["website.view"],
    });
    assert.equal(denied.ok, false);
    assert.equal(denied.code, "forbidden");
  });

  it("edits a CTA button label and accepts only a safe destination", () => {
    ensureProductFieldsRegistered(PRODUCT_CODE.BLESSBOARD);
    const label = assertEditableMutation({
      productCode: PRODUCT_CODE.BLESSBOARD,
      contentKey: "home.cta_aabb01.buttonText",
      value: "Visit",
      grantedPermissions: ["website.edit"],
    });
    assert.equal(label.ok, true);
    assert.equal(label.field.storage.fieldKey, "buttonText");

    const url = assertEditableMutation({
      productCode: PRODUCT_CODE.BLESSBOARD,
      contentKey: "home.cta_aabb01.buttonUrl",
      value: "/events",
      grantedPermissions: ["website.edit"],
    });
    assert.equal(url.ok, true);
    assert.equal(url.field.type, "url");

    const script = assertEditableMutation({
      productCode: PRODUCT_CODE.BLESSBOARD,
      contentKey: "home.cta_aabb01.buttonUrl",
      value: "javascript:alert(document.cookie)",
      grantedPermissions: ["website.edit"],
    });
    assert.equal(script.ok, false);
    assert.equal(
      resolveEditableField({
        productCode: PRODUCT_CODE.BLESSBOARD,
        contentKey: "home.story_aabb01.buttonUrl",
      }).ok,
      false
    );
  });

  it("tenant isolation remains the product save-path concern (schema does not bind tenant)", () => {
    ensureProductFieldsRegistered(PRODUCT_CODE.BLESSBOARD);
    const field = resolveEditableField({
      productCode: PRODUCT_CODE.BLESSBOARD,
      contentKey: "home.story_aabb01.bodyText",
    });
    assert.equal(field.ok, true);
    assert.equal(field.field.storage.kind, "blessboard_inline");
    assert.equal(field.field.storage.sectionKey, "story_aabb01");
    // Schema authorizes field shape only; church/org checks stay in editor routes/services.
    assert.equal(field.field.storage.organizationId, undefined);
  });
});
