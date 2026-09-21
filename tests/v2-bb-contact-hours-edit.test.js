"use strict";

/**
 * V2 Bug 20 — Contact opening hours editability + Bug 18 values key regression.
 */

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), "utf8");
}

describe("v2-bb contact opening hours (Bug 20)", () => {
  it("Contact hours section exposes data-section and shared text pencils", () => {
    const ejs = read("views/blessboard/v5/public/contact.ejs");
    assert.match(ejs, /data-bb-contact-hours="1"/);
    assert.match(ejs, /data-section="<%= \(officeHoursSection && officeHoursSection\.sectionKey\) \|\| 'office_hours' %>"/);
    assert.match(ejs, /editSectionKey:\s*'office_hours'/);
    assert.match(ejs, /editFieldKey:\s*'bodyText'/);
    assert.match(ejs, /Edit opening hours/);
    assert.match(ejs, /demoFb\.officeHoursBody/);
    assert.doesNotMatch(ejs, /demoFb && !officeHoursSection \? demoFb\.officeHoursBody/);
  });

  it("office_hours fields are registered for BlessBoard inline editing", () => {
    const {
      ensureProductFieldsRegistered,
      hasEditableField,
      resolveEditableField,
      PRODUCT_CODE,
    } = require("../src/platform/website/editableFieldSchema");
    ensureProductFieldsRegistered(PRODUCT_CODE.BLESSBOARD);
    assert.equal(hasEditableField(PRODUCT_CODE.BLESSBOARD, "contact.office_hours.body_text"), true);
    assert.equal(hasEditableField(PRODUCT_CODE.BLESSBOARD, "contact.office_hours.bodyText"), true);
    assert.equal(hasEditableField(PRODUCT_CODE.BLESSBOARD, "contact.office_hours.heading"), true);
    const camel = resolveEditableField({
      productCode: PRODUCT_CODE.BLESSBOARD,
      contentKey: "contact.office_hours.bodyText",
    });
    assert.equal(camel.ok, true);
    assert.equal(camel.field.storage.fieldKey, "bodyText");
  });
});

describe("v2-bb about values content keys (Bug 18 regression)", () => {
  it("does not emit editors for aggregate about.values.bodyText cards", () => {
    const ejs = read("views/blessboard/v5/public/about.ejs");
    assert.match(ejs, /Aggregate "values" section is the group heading only/);
    assert.match(ejs, /value_presence\|value_integrity\|value_compassion\|value_discipleship/);
    assert.match(ejs, /unknown_content_key/);
  });

  it("allowlists registered value card keys and rejects unknown aggregate body", () => {
    const {
      ensureProductFieldsRegistered,
      hasEditableField,
      resolveEditableField,
      PRODUCT_CODE,
    } = require("../src/platform/website/editableFieldSchema");
    ensureProductFieldsRegistered(PRODUCT_CODE.BLESSBOARD);
    assert.equal(hasEditableField(PRODUCT_CODE.BLESSBOARD, "about.value_presence.body_text"), true);
    assert.equal(hasEditableField(PRODUCT_CODE.BLESSBOARD, "about.value_presence.bodyText"), true);
    assert.equal(hasEditableField(PRODUCT_CODE.BLESSBOARD, "about.values.heading"), true);
    assert.equal(hasEditableField(PRODUCT_CODE.BLESSBOARD, "about.values.body_text"), false);
    assert.equal(hasEditableField(PRODUCT_CODE.BLESSBOARD, "about.values.bodyText"), false);
    const unknown = resolveEditableField({
      productCode: PRODUCT_CODE.BLESSBOARD,
      contentKey: "about.not_a_real_value.bodyText",
    });
    assert.equal(unknown.ok, false);
    assert.equal(unknown.code, "unknown_content_key");
    const aggregateBody = resolveEditableField({
      productCode: PRODUCT_CODE.BLESSBOARD,
      contentKey: "about.values.bodyText",
    });
    assert.equal(aggregateBody.ok, false);
    assert.equal(aggregateBody.code, "unknown_content_key");
  });
});
