"use strict";

/**
 * V2 Bug 22 — Shared section image ↔ YouTube conversion rules.
 */

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const {
  resolveSectionMediaFromDraft,
} = require("../src/blessboard/website/sectionMediaDraftFields");

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), "utf8");
}

describe("v2 shared media type conversion (Bug 22)", () => {
  it("image draft never writes videoUrl into mediaUrl and clears active YouTube", () => {
    const resolved = resolveSectionMediaFromDraft({
      draftKind: "image",
      payload: {
        imageUrl: "https://cdn.example/photo.png",
        altText: "Hall",
        focal: "center",
        fit: "cover",
      },
      existingMediaUrl: "https://cdn.example/old-poster.png",
      existingLayout: {
        videoUrl: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
        videoTitle: "Welcome",
        mediaKind: "youtube",
      },
    });
    assert.equal(resolved.mediaUrl, "https://cdn.example/photo.png");
    assert.equal(resolved.layoutPatch.mediaKind, "image");
    assert.equal(resolved.layoutPatch.videoUrl, null);
    assert.equal(resolved.layoutPatch.videoTitle, null);
    assert.equal(
      resolved.layoutPatch.previousVideoUrl,
      "https://www.youtube.com/watch?v=dQw4w9WgXcQ"
    );
    assert.equal(resolved.layoutPatch.previousVideoTitle, "Welcome");
    assert.equal(resolved.layoutPatch.altText, "Hall");
  });

  it("video draft stores YouTube in layoutMetadata and poster only in mediaUrl", () => {
    const resolved = resolveSectionMediaFromDraft({
      draftKind: "video",
      payload: {
        videoUrl: "https://youtu.be/dQw4w9WgXcQ",
        title: "Livestream",
        thumbnailUrl: "https://cdn.example/poster.png",
      },
      existingMediaUrl: "https://cdn.example/photo.png",
      existingLayout: { mediaKind: "image" },
    });
    assert.equal(resolved.mediaUrl, "https://cdn.example/poster.png");
    assert.equal(resolved.layoutPatch.mediaKind, "youtube");
    assert.equal(resolved.layoutPatch.videoUrl, "https://youtu.be/dQw4w9WgXcQ");
    assert.equal(resolved.layoutPatch.videoTitle, "Livestream");
    assert.equal(resolved.layoutPatch.previousImageUrl, "https://cdn.example/photo.png");
  });

  it("video draft without thumbnail does not fall back to the YouTube URL as mediaUrl", () => {
    const resolved = resolveSectionMediaFromDraft({
      draftKind: "video",
      payload: {
        videoUrl: "https://www.youtube.com/watch?v=abc123XYZ01",
        title: "No poster",
      },
      existingMediaUrl: null,
      existingLayout: {},
    });
    assert.equal(resolved.mediaUrl, null);
    assert.equal(resolved.layoutPatch.videoUrl, "https://www.youtube.com/watch?v=abc123XYZ01");
  });

  it("publish apply and draft overlay both require the shared helper", () => {
    const apply = read("src/blessboard/services/websiteDraftApplyService.js");
    const overlay = read("src/blessboard/services/websiteStructuredDraftService.js");
    assert.match(apply, /resolveSectionMediaFromDraft/);
    assert.match(overlay, /resolveSectionMediaFromDraft/);
    assert.doesNotMatch(
      apply,
      /payload\.imageUrl \|\| payload\.videoUrl \|\| payload\.thumbnailUrl/
    );
  });

  it("structured editor exposes Image vs YouTube modes with shared picker actions", () => {
    const js = read("public/blessboard/v5/website-structured-edit.js");
    assert.match(js, /data-bb-media-mode="image"/);
    assert.match(js, /data-bb-media-mode="youtube"/);
    assert.match(js, /Photograph mode/);
    assert.match(js, /YouTube mode/);
    assert.match(js, /Upload from computer/);
    assert.match(js, /Choose from Content Library/);
  });

  it("page-hero and home wire convertible Image + YouTube controls with live videoUrl payload", () => {
    const hero = read("views/blessboard/v5/public/partials/page-hero.ejs");
    const home = read("views/blessboard/v5/public/home.ejs");
    assert.match(hero, /Use photograph \(clears YouTube for this section\)/);
    assert.match(hero, /Use YouTube video/);
    assert.match(hero, /_meta && _meta\.videoUrl/);
    assert.match(home, /hero\.layoutMetadata && hero\.layoutMetadata\.videoUrl/);
    assert.doesNotMatch(home, /editPayload:\s*\{\s*videoUrl:\s*''/);
  });

  it("Bug 16 About gallery isolation helpers remain intact", () => {
    const iso = read("tests/v2-bb-about-image-isolation.test.js");
    assert.match(iso, /isLifeTogetherSectionKey/);
    assert.match(iso, /isAboutGallerySlotKey/);
    assert.match(iso, /gallery_1/);
    const keys = read("src/blessboard/website/aboutSectionImageKeys.js");
    assert.match(keys, /life_together/);
    assert.match(keys, /gallery_/);
  });

  it("ActiveClinic has no page-level convertible video editKind (inventory)", () => {
    const viewsRoot = path.join(ROOT, "views/activeclinic");
    if (!fs.existsSync(viewsRoot)) {
      assert.ok(true, "no activeclinic views");
      return;
    }
    const walk = (dir, acc = []) => {
      for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
        const p = path.join(dir, ent.name);
        if (ent.isDirectory()) walk(p, acc);
        else if (/\.ejs$/.test(ent.name)) acc.push(p);
      }
      return acc;
    };
    const hits = walk(viewsRoot).filter((p) => {
      const src = fs.readFileSync(p, "utf8");
      return /editKind:\s*['"]video['"]/.test(src) || /draftKind:\s*['"]video['"]/.test(src);
    });
    assert.equal(hits.length, 0, `unexpected AC video editKind: ${hits.join(",")}`);
  });
});
