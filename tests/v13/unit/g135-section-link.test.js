"use strict";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const { safeSectionLink } = require("../../../src/activeclinic/website/clinicWebsiteCms");

describe("G135 section links", () => {
  it("rejects scriptable section addresses and keeps an ordinary https address", () => {
    assert.equal(safeSectionLink("javascript:alert(1)"), null);
    assert.equal(safeSectionLink("data:text/html,hi"), null);
    assert.equal(safeSectionLink("//example.invalid"), null);
    assert.equal(safeSectionLink(""), "");
    assert.equal(
      safeSectionLink("https://example.invalid/v13-synthetic-section.png"),
      "https://example.invalid/v13-synthetic-section.png"
    );
  });
});
