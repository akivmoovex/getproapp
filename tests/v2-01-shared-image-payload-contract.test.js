"use strict";

/**
 * V2_01 shared image payload contract:
 * BB inline-field must accept IMAGE objects `{ mediaId, src, alt }`
 * without coercing them to "[object Object]" / invalid_url.
 */

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");

const {
  PRODUCT_CODE,
  assertEditableMutation,
  readSubmittedEditableValue,
  editableValuesEqual,
  serializeOverlayDraftValue,
  ensureProductFieldsRegistered,
} = require("../src/platform/website/editableFieldSchema");
const { validateContentValue, CONTENT_TYPES } = require("../src/platform/website/contentTypes");

describe("V2_01 shared image payload contract", () => {
  it("readSubmittedEditableValue preserves media objects and string URLs", () => {
    const obj = {
      mediaId: "99f3284b-1bf8-473c-85f1-a95134ec25c5",
      src: "https://cdn.example.com/a.png",
      alt: "Hero",
    };
    assert.deepEqual(readSubmittedEditableValue({ value: obj }), obj);
    assert.equal(
      readSubmittedEditableValue({ value: "https://cdn.example.com/a.png" }),
      "https://cdn.example.com/a.png"
    );
    assert.equal(readSubmittedEditableValue({ value: null }), "");
    assert.equal(readSubmittedEditableValue({}), "");
    // Historical bug: String(object) === "[object Object]" → invalid_url
    assert.notEqual(String(obj), readSubmittedEditableValue({ value: obj }));
  });

  it("IMAGE content type accepts object and string URL shapes", () => {
    const def = { type: CONTENT_TYPES.IMAGE, maxLen: 500 };
    const asObject = validateContentValue(def, {
      mediaId: "99f3284b-1bf8-473c-85f1-a95134ec25c5",
      src: "https://cdn.example.com/hero.png",
      alt: "Alt",
    });
    assert.equal(asObject.ok, true);
    assert.equal(asObject.value.src, "https://cdn.example.com/hero.png");
    assert.equal(asObject.value.alt, "Alt");
    assert.equal(asObject.value.mediaId, "99f3284b-1bf8-473c-85f1-a95134ec25c5");

    const asString = validateContentValue(def, "https://cdn.example.com/hero.png");
    assert.equal(asString.ok, true);
    assert.equal(asString.value.src, "https://cdn.example.com/hero.png");
    assert.equal(asString.value.mediaId, null);

    const coerced = validateContentValue(def, "[object Object]");
    assert.equal(coerced.ok, false);
    assert.equal(coerced.code, "invalid_url");
  });

  it("BlessBoard home.hero.image mutation accepts object payloads", () => {
    ensureProductFieldsRegistered(PRODUCT_CODE.BLESSBOARD);
    const ok = assertEditableMutation({
      productCode: PRODUCT_CODE.BLESSBOARD,
      contentKey: "home.hero.image",
      value: {
        mediaId: "99f3284b-1bf8-473c-85f1-a95134ec25c5",
        src: "https://cdn.example.com/hero.png",
        alt: "V2_01 payload",
      },
      grantedPermissions: ["website.edit"],
    });
    assert.equal(ok.ok, true, JSON.stringify(ok));
    assert.equal(ok.value.alt, "V2_01 payload");
    assert.equal(ok.value.mediaId, "99f3284b-1bf8-473c-85f1-a95134ec25c5");

    const bad = assertEditableMutation({
      productCode: PRODUCT_CODE.BLESSBOARD,
      contentKey: "home.hero.image",
      value: "[object Object]",
      grantedPermissions: ["website.edit"],
    });
    assert.equal(bad.ok, false);
    assert.equal(bad.reason, "invalid_url");
  });

  it("ActiveClinic image keys use content_types object contract", () => {
    ensureProductFieldsRegistered(PRODUCT_CODE.ACTIVECLINIC);
    const fields = fs.readFileSync(
      path.join(__dirname, "../src/activeclinic/http/activeClinicWebsiteRoutes.js"),
      "utf8"
    );
    // AC drafts route must pass body.value through (no String coercion).
    assert.match(fields, /value:\s*req\.body\s*&&\s*req\.body\.value/);
    assert.doesNotMatch(
      fields,
      /const newValue = body\.value != null \? String\(body\.value\)/
    );
  });

  it("BB inline-field route uses readSubmittedEditableValue", () => {
    const src = fs.readFileSync(
      path.join(__dirname, "../src/blessboard/http/contentAdminRoutes.js"),
      "utf8"
    );
    assert.match(src, /readSubmittedEditableValue/);
    assert.doesNotMatch(
      src,
      /const newValue = body\.value != null \? String\(body\.value\)/
    );
  });

  it("overlay serialize/compare helpers round-trip image objects", () => {
    const value = {
      mediaId: "99f3284b-1bf8-473c-85f1-a95134ec25c5",
      src: "https://cdn.example.com/a.png",
      alt: "A",
    };
    const serialized = serializeOverlayDraftValue(value);
    assert.equal(typeof serialized, "string");
    assert.deepEqual(JSON.parse(serialized), value);
    assert.equal(editableValuesEqual(value, { ...value }), true);
    assert.equal(editableValuesEqual(value, { ...value, alt: "B" }), false);
    assert.equal(editableValuesEqual("hello", "hello"), true);
  });
});
