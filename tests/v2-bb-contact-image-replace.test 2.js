"use strict";

/**
 * V2 Bug 21 — Contact page hero image replacement must render (not discard media).
 */

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), "utf8");
}

describe("v2-bb contact hero image replacement (Bug 21)", () => {
  it("Contact page-hero uses section/draft mediaUrl instead of hardcoding null", () => {
    const ejs = read("views/blessboard/v5/public/contact.ejs");
    assert.match(ejs, /heroMedia:\s*heroMedia/);
    assert.match(ejs, /heroSectionMedia/);
    assert.doesNotMatch(ejs, /heroMedia:\s*null/);
    assert.match(ejs, /editSectionKey:\s*'hero'/);
    assert.match(ejs, /Bug 21/);
  });

  it("structured image drafts update contact soft-fill heroMediaUrl and do not use videoUrl as img src", () => {
    const src = read("src/blessboard/services/websiteStructuredDraftService.js");
    const helper = read("src/blessboard/website/sectionMediaDraftFields.js");
    assert.match(src, /pageKey === "contact" && model\.contactDemoFallback/);
    assert.match(src, /heroMediaUrl: mediaUrl/);
    assert.match(src, /resolveSectionMediaFromDraft/);
    assert.match(helper, /never write a video stream URL into mediaUrl/i);
    assert.match(helper, /Poster only/);
    assert.doesNotMatch(
      src,
      /presentDraftImageUrl\(\s*payload\.imageUrl \|\| payload\.videoUrl \|\| payload\.thumbnailUrl/
    );
  });

  it("attachWebsiteAdminChrome mirrors draft hero media onto contactDemoFallback", () => {
    const src = read("src/blessboard/http/attachWebsiteAdminChrome.js");
    assert.match(src, /contactDemoFallback[\s\S]*heroMediaUrl: model\._draftHeroMediaUrl/);
  });
});
