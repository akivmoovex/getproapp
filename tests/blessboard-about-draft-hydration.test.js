"use strict";

/**
 * About draft hydration contract:
 * Frozen demo fallbacks must not discard draft overlays / data-draft state.
 */

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const {
  applyDraftsToSections,
  displayWithDraft,
} = require("../src/blessboard/services/websiteInlineDraftService");

const ROOT = path.join(__dirname, "..");

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), "utf8");
}

describe("blessboard about draft hydration", () => {
  it("chrome thaws frozen demo fallbacks and does not zero draftCount on soft-fill errors", () => {
    const chrome = read("src/blessboard/http/attachWebsiteAdminChrome.js");
    assert.match(chrome, /thawDemoFallback/);
    assert.match(chrome, /Soft-fill is best-effort/);
    assert.doesNotMatch(
      chrome,
      /catch\s*\{[^}]*draftCount\s*=\s*0/s,
      "outer catch must not wipe draftCount after a successful count"
    );
  });

  it("mutating Object.freeze aboutDemoFallback throws without thaw (root-cause guard)", () => {
    "use strict";
    const aboutDemoFallback = Object.freeze({
      story: Object.freeze({
        heading: "How We Began — and Why We Gather",
        bodyText: "demo",
      }),
    });
    assert.throws(() => {
      aboutDemoFallback.story = {
        ...aboutDemoFallback.story,
        heading: "DRAFT MARKER",
      };
    }, /read only property|Cannot assign/i);
  });

  it("thawed aboutDemoFallback accepts story heading overlay", () => {
    const frozen = Object.freeze({
      story: Object.freeze({
        heading: "How We Began — and Why We Gather",
        bodyText: "demo",
      }),
      values: [{ sectionKey: "value_presence", heading: "A", bodyText: "B" }],
    });
    const overlayMap = new Map([["story::heading", "HYDRATE MARKER"]]);
    const aboutDemoFallback = { ...frozen };
    const block = aboutDemoFallback.story;
    const h = overlayMap.get("story::heading");
    aboutDemoFallback.story = {
      ...block,
      heading: h !== undefined ? h : block.heading,
    };
    assert.equal(aboutDemoFallback.story.heading, "HYDRATE MARKER");
    assert.equal(frozen.story.heading, "How We Began — and Why We Gather");
  });

  it("applyDraftsToSections + displayWithDraft preserve story draft over CMS/demo fallback", () => {
    const overlayMap = new Map([["story::heading", "HYDRATE MARKER"]]);
    const sections = applyDraftsToSections(
      [
        {
          sectionKey: "story",
          heading: "Published story",
          bodyText: "Body",
        },
      ],
      overlayMap
    );
    assert.equal(sections[0].heading, "HYDRATE MARKER");
    const overrides = Object.create(null);
    for (const [k, v] of overlayMap.entries()) overrides[k] = v;
    assert.equal(
      displayWithDraft(overrides, "story", "heading", "How We Began — and Why We Gather"),
      "HYDRATE MARKER"
    );
    assert.equal(
      displayWithDraft(Object.create(null), "story", "heading", "How We Began — and Why We Gather"),
      "How We Began — and Why We Gather"
    );
  });

  it("about template binds story edit keys to the real sectionKey", () => {
    const about = read("views/blessboard/v5/public/about.ejs");
    assert.match(
      about,
      /storyKey\s*=\s*section\.sectionKey\s*\|\|/
    );
    assert.doesNotMatch(
      about,
      /storyKey\s*=\s*idx\s*===\s*0\s*\?\s*'story'/
    );
  });
});
