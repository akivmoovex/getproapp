"use strict";

const fs = require("fs");
const path = require("path");
const assert = require("node:assert/strict");
const { describe, it } = require("node:test");
const ejs = require("ejs");

const ROOT = path.join(__dirname, "..");
const {
  isLifeTogetherSectionKey,
  isAboutGallerySlotKey,
  collectAboutGallerySlotUrls,
  ABOUT_GALLERY_SLOT_COUNT,
  LIFE_TOGETHER_SECTION_KEY,
} = require("../src/blessboard/website/aboutSectionImageKeys");
const {
  applyStructuredDraftsToModel,
} = require("../src/blessboard/services/websiteStructuredDraftService");

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), "utf8");
}

describe("v2 BlessBoard About Life Together image isolation", () => {
  it("platform helper separates life_together from gallery_1..3", () => {
    assert.equal(isLifeTogetherSectionKey("life_together"), true);
    assert.equal(isLifeTogetherSectionKey("gallery"), true);
    assert.equal(isLifeTogetherSectionKey("gallery_1"), false);
    assert.equal(isAboutGallerySlotKey("gallery_1"), true);
    assert.equal(isAboutGallerySlotKey("gallery"), false);
    assert.equal(isAboutGallerySlotKey("life_together"), false);
    assert.equal(LIFE_TOGETHER_SECTION_KEY, "life_together");
    assert.equal(ABOUT_GALLERY_SLOT_COUNT, 3);
  });

  it("collectAboutGallerySlotUrls ignores Life Together media and caps at three", () => {
    const urls = collectAboutGallerySlotUrls([
      { sectionKey: "gallery_1", mediaUrl: "/g1.jpg" },
      { sectionKey: "gallery", mediaUrl: "/life.jpg" },
      { sectionKey: "life_together", mediaUrl: "/life2.jpg" },
      { sectionKey: "gallery_2", mediaUrl: "/g2.jpg" },
      { sectionKey: "gallery_3", mediaUrl: "/g3.jpg" },
      { sectionKey: "gallery_4", mediaUrl: "/g4.jpg" },
      { sectionKey: "visitor_cta", mediaUrl: "/visit.jpg" },
    ]);
    assert.deepEqual(urls, ["/g1.jpg", "/g2.jpg", "/g3.jpg"]);
  });

  it("seed and demo pack use canonical life_together section key", () => {
    const seed = read("src/blessboard/services/seedTenantWebsiteTemplateContent.js");
    const demo = read("src/blessboard/services/tenantPublicDemoContent.js");
    assert.match(seed, /sectionKey:\s*"life_together"/);
    assert.match(demo, /sectionKey:\s*"life_together"/);
    assert.match(seed, /sectionKey:\s*`gallery_\$\{index \+ 1\}`/);
  });

  it("about template only pushes gallery_N into the grid", () => {
    const about = read("views/blessboard/v5/public/about.ejs");
    assert.match(about, /gallerySlotMap\[key\] = s\.mediaUrl/);
    assert.match(about, /for \(var gi = 1; gi <= 3; gi \+= 1\)/);
    assert.match(about, /key === 'life_together'/);
    assert.match(about, /editEntityKey: 'about-life-together'/);
    assert.doesNotMatch(
      about,
      /blob\.indexOf\('gallery'\) >= 0 && type === 'image'/
    );
  });

  it("draft overlay updates lifeTogether without growing gallery soft-fill", () => {
    const lifeUrl =
      "https://blessboard.neuniversity.org/media/testing/platform/blessboard/demo/about/about-culture-1.jpg";
    const nextLife =
      "https://blessboard.neuniversity.org/media/testing-v8/blessboard/6fca1e3f-3f17-40f5-8469-366adb5013ca/aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee.png";
    const model = {
      pageKey: "about",
      sections: [
        {
          sectionKey: "gallery_1",
          sectionType: "image",
          mediaUrl: "/g1.jpg",
        },
        {
          sectionKey: "gallery_2",
          sectionType: "image",
          mediaUrl: "/g2.jpg",
        },
        {
          sectionKey: "gallery_3",
          sectionType: "image",
          mediaUrl: "/g3.jpg",
        },
        {
          sectionKey: "gallery",
          sectionType: "gallery",
          heading: "Life Together",
          bodyText: "Fellows",
          mediaUrl: lifeUrl,
        },
      ],
      aboutDemoFallback: {
        gallery: ["/g1.jpg", "/g2.jpg", "/g3.jpg"],
        lifeTogether: {
          sectionKey: "gallery",
          heading: "Life Together",
          mediaUrl: lifeUrl,
        },
      },
    };
    applyStructuredDraftsToModel(model, [
      {
        draftKind: "image",
        pageKey: "about",
        sectionKey: "gallery",
        entityKey: "about-life-together",
        op: "upsert",
        payload: { imageUrl: nextLife, altText: "Life", focal: "center" },
      },
    ]);
    assert.equal(model.aboutDemoFallback.gallery.length, 3);
    assert.deepEqual(model.aboutDemoFallback.gallery, ["/g1.jpg", "/g2.jpg", "/g3.jpg"]);
    assert.equal(model.aboutDemoFallback.lifeTogether.mediaUrl, nextLife);
    const life = model.sections.find((s) => s.sectionKey === "gallery");
    assert.equal(life.mediaUrl, nextLife);
    const grid = collectAboutGallerySlotUrls(model.sections);
    assert.equal(grid.length, 3);
    assert.ok(!grid.includes(nextLife));
  });

  it("renders three grid images after Life Together image change", async () => {
    const aboutPath = path.join(ROOT, "views/blessboard/v5/public/about.ejs");
    const grid = ["/media/g1.jpg", "/media/g2.jpg", "/media/g3.jpg"];
    const html = await ejs.renderFile(
      aboutPath,
      {
        publicName: "QA Church",
        pageTitle: "About",
        hrefFor: (p) => p,
        sections: [
          { sectionKey: "hero", sectionType: "hero", heading: "About", bodyText: "Hi" },
          {
            sectionKey: "gallery",
            sectionType: "gallery",
            heading: "Life Together",
            bodyText: "Body",
            mediaUrl: "/media/life-NEW.jpg",
          },
          { sectionKey: "gallery_1", sectionType: "image", mediaUrl: grid[0] },
          { sectionKey: "gallery_2", sectionType: "image", mediaUrl: grid[1] },
          { sectionKey: "gallery_3", sectionType: "image", mediaUrl: grid[2] },
          {
            sectionKey: "visitor_cta",
            sectionType: "cta",
            heading: "Visit on a Sunday",
            bodyText: "Visit",
            mediaUrl: "/media/visit.jpg",
          },
        ],
        aboutDemoFallback: null,
        websiteAdmin: null,
      },
      { filename: aboutPath, views: [path.join(ROOT, "views")] }
    );
    const galleryChunk = html.match(/data-bb-about-gallery="1"[\s\S]*?<\/section>/)[0];
    const lifeChunk = html.match(/data-bb-about-life-together="1"[\s\S]*?<\/section>/)[0];
    const visitChunk = html.match(/data-bb-about-visit="1"[\s\S]*?<\/section>/)[0];
    const galleryImgs = [...galleryChunk.matchAll(/src="([^"]+)"/g)].map((m) => m[1]);
    assert.equal(galleryImgs.length, 3);
    assert.deepEqual(galleryImgs, grid);
    assert.match(lifeChunk, /life-NEW\.jpg/);
    assert.doesNotMatch(galleryChunk, /life-NEW\.jpg/);
    assert.match(visitChunk, /visit\.jpg/);
    assert.doesNotMatch(visitChunk, /life-NEW\.jpg/);
  });

  it("leadership soft-fill sibling seeding remains for Bug 06 safety", () => {
    const apply = read("src/blessboard/services/websiteDraftApplyService.js");
    const soft = read("src/blessboard/services/websiteSoftFillCollectionService.js");
    assert.match(apply, /isSoftFillEntityKey\("leader"/);
    assert.match(soft, /ensureSoftFillSiblingDrafts/);
  });

  it("homepage ministry/event image forms remain independent (Bugs 10–11)", () => {
    const js = read("public/blessboard/v5/website-structured-edit.js");
    assert.match(js, /buildMinistryForm/);
    assert.match(js, /buildEventForm/);
    assert.match(js, /draftKind: current\.kind/);
  });
});
