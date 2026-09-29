"use strict";

const assert = require("node:assert/strict");
const { describe, it } = require("node:test");
const {
  normalizePlainTextEntities,
  decodeHtmlEntitiesOnce,
} = require("../src/platform/website/plainTextEntities");
const { renderV5Ejs } = require("../src/blessboard/http/v5EjsTemplateCache");

describe("plainTextEntities", () => {
  it("decodes single-encoded apostrophes and ampersands", () => {
    assert.equal(
      normalizePlainTextEntities("Faith in Zambia&#39;s capital"),
      "Faith in Zambia's capital"
    );
    assert.equal(normalizePlainTextEntities("A &amp; B"), "A & B");
  });

  it("collapses double and triple encoding from historical bugs", () => {
    assert.equal(
      normalizePlainTextEntities("Zambia&amp;#39;s capital"),
      "Zambia's capital"
    );
    assert.equal(
      normalizePlainTextEntities("Zambia&amp;amp;#39;s capital"),
      "Zambia's capital"
    );
  });

  it("leaves plain text and URLs unchanged", () => {
    assert.equal(normalizePlainTextEntities("Zambia's capital"), "Zambia's capital");
    assert.equal(
      normalizePlainTextEntities("https://example.test/path?x=1"),
      "https://example.test/path?x=1"
    );
  });

  it("decodeHtmlEntitiesOnce is a single pass", () => {
    assert.equal(decodeHtmlEntitiesOnce("A &amp;amp; B"), "A &amp; B");
  });
});

describe("editable-text attribute escaping", () => {
  it("escapes data-website-value once so apostrophes survive getAttribute", () => {
    const html = renderV5Ejs("partials/editable-text.ejs", {
      websiteAdmin: {
        editingMode: true,
        displayValue(_s, _f, fallback) {
          return fallback;
        },
        publishedValue() {
          return "";
        },
      },
      editPageKey: "home",
      editSectionKey: "hero",
      editFieldKey: "bodyText",
      editValue: "Faith, community and service in Zambia's capital.",
      editTag: "p",
      editClass: "bb-tp-hero__lead",
      editType: "paragraph",
    });

    assert.match(html, /data-website-value="Faith, community and service in Zambia's capital\."/);
    assert.doesNotMatch(html, /data-website-value="[^"]*&amp;#39;/);
    assert.doesNotMatch(html, /data-website-value="[^"]*&amp;amp;/);
    assert.match(html, />Faith, community and service in Zambia&#39;s capital\.</);
    assert.doesNotMatch(html, /Zambia&amp;#39;s/);
  });
});
