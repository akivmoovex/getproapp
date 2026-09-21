"use strict";

const fs = require("fs");
const path = require("path");
const assert = require("node:assert/strict");
const { describe, it } = require("node:test");
const ejs = require("ejs");

const ROOT = path.join(__dirname, "..");

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), "utf8");
}

describe("v2 BlessBoard About default Life Together and Visit images", () => {
  it("demo pack defines independent Life Together and Visit media (not gallery grid)", () => {
    const demo = read("src/blessboard/services/tenantPublicDemoContent.js");
    assert.match(demo, /aboutLifeTogether:\s*"\/church\/images\/about\/about-culture-1\.jpg"/);
    assert.match(demo, /aboutVisitSunday:\s*"\/church\/images\/about\/about-branch-building\.jpg"/);
    assert.match(demo, /lifeTogether:\s*Object\.freeze\(\{/);
    assert.match(demo, /mediaUrl:\s*MEDIA\.aboutLifeTogether/);
    assert.match(demo, /visitorCtaMediaUrl:\s*MEDIA\.aboutVisitSunday/);
    assert.match(demo, /gallery:\s*Object\.freeze\(\[MEDIA\.aboutGallery1/);
    assert.doesNotMatch(demo, /aboutLifeTogether:\s*MEDIA\.aboutGallery/);
    assert.doesNotMatch(demo, /aboutVisitSunday:\s*MEDIA\.aboutGallery/);
  });

  it("marketing CDN map includes approved About culture and branch assets", () => {
    const map = read("src/platform/media/platformMarketingAssets.js");
    assert.match(map, /about\/about-culture-1\.jpg/);
    assert.match(map, /about\/about-branch-building\.jpg/);
  });

  it("new-church seed writes independent mediaUrl for gallery and visitor_cta", () => {
    const seed = read("src/blessboard/services/seedTenantWebsiteTemplateContent.js");
    assert.match(seed, /sectionKey:\s*"gallery"/);
    assert.match(seed, /mediaUrl:\s*pack\.about\.lifeTogether\.mediaUrl/);
    assert.match(seed, /sectionKey:\s*"visitor_cta"/);
    assert.match(seed, /mediaUrl:\s*pack\.about\.visitorCtaMediaUrl/);
    assert.match(seed, /sectionKey:\s*`gallery_\$\{index \+ 1\}`/);
  });

  it("about template classifies Life Together and Visit separately from gallery grid", () => {
    const about = read("views/blessboard/v5/public/about.ejs");
    assert.match(about, /return 'lifeTogether'/);
    assert.match(about, /return 'visitor'/);
    assert.match(about, /data-bb-about-life-together="1"/);
    assert.match(about, /data-bb-about-visit="1"/);
    assert.match(about, /data-bb-about-life-together-image="1"/);
    assert.match(about, /data-bb-about-visit-image="1"/);
    assert.match(about, /Soft-fill missing images only/);
    assert.match(about, /gallery_heading/);
  });

  it("soft-fill aboutDemoFallback hydrates lifeTogether and visitor media via CDN presenter", () => {
    const model = read("src/blessboard/http/loadTenantPublicPageModel.js");
    assert.match(model, /lifeTogether:\s*Object\.freeze\(\{/);
    assert.match(model, /visitorCtaMediaUrl:\s*publicDemo\.mediaOrFallback/);
    assert.match(model, /mediaOrFallback\(demoPack\.about\.lifeTogether\.mediaUrl\)/);
  });

  it("renders Life Together and Visit images without binding to gallery grid urls", async () => {
    const aboutPath = path.join(ROOT, "views/blessboard/v5/public/about.ejs");
    const galleryUrls = [
      "/media/demo/gallery-1.jpg",
      "/media/demo/gallery-2.jpg",
      "/media/demo/gallery-3.jpg",
    ];
    const html = await ejs.renderFile(
      aboutPath,
      {
        publicName: "QA Church",
        pageTitle: "About",
        hrefFor: (p) => p,
        sections: [
          {
            sectionKey: "hero",
            sectionType: "hero",
            heading: "About",
            bodyText: "Hello",
            mediaUrl: "/media/demo/hero.jpg",
          },
          {
            sectionKey: "gallery",
            sectionType: "gallery",
            heading: "Life Together",
            bodyText: "Fellowship copy",
            mediaUrl: "/media/demo/life-together.jpg",
          },
          {
            sectionKey: "gallery_1",
            sectionType: "image",
            mediaUrl: galleryUrls[0],
          },
          {
            sectionKey: "gallery_2",
            sectionType: "image",
            mediaUrl: galleryUrls[1],
          },
          {
            sectionKey: "gallery_3",
            sectionType: "image",
            mediaUrl: galleryUrls[2],
          },
          {
            sectionKey: "visitor_cta",
            sectionType: "cta",
            heading: "Visit on a Sunday",
            bodyText: "Come visit",
            mediaUrl: "/media/demo/visit-sunday.jpg",
          },
        ],
        aboutDemoFallback: null,
        websiteAdmin: null,
      },
      { filename: aboutPath, views: [path.join(ROOT, "views")] }
    );
    assert.match(html, /data-bb-about-life-together-image="1"/);
    assert.match(html, /src="\/media\/demo\/life-together\.jpg"/);
    assert.match(html, /data-bb-about-visit-image="1"/);
    assert.match(html, /src="\/media\/demo\/visit-sunday\.jpg"/);
    assert.match(html, /data-bb-about-gallery="1"/);
    for (const url of galleryUrls) {
      assert.match(html, new RegExp(url.replace(/\//g, "\\/")));
    }
    // Life Together / Visit must not reuse gallery_1 as their featured src exclusively.
    const lifeChunk = html.match(
      /data-bb-about-life-together="1"[\s\S]*?<\/section>/
    )[0];
    const visitChunk = html.match(/data-bb-about-visit="1"[\s\S]*?<\/section>/)[0];
    assert.doesNotMatch(lifeChunk, /gallery-1\.jpg/);
    assert.doesNotMatch(visitChunk, /gallery-1\.jpg/);
    assert.match(lifeChunk, /life-together\.jpg/);
    assert.match(visitChunk, /visit-sunday\.jpg/);
  });

  it("preserves customized Life Together media and only soft-fills when absent", async () => {
    const aboutPath = path.join(ROOT, "views/blessboard/v5/public/about.ejs");
    const html = await ejs.renderFile(
      aboutPath,
      {
        publicName: "Custom Church",
        pageTitle: "About",
        hrefFor: (p) => p,
        sections: [
          {
            sectionKey: "hero",
            sectionType: "hero",
            heading: "About",
            bodyText: "Hello",
          },
          {
            sectionKey: "gallery",
            sectionType: "gallery",
            heading: "Life Together",
            bodyText: "Custom fellowship",
            mediaUrl: "/media/custom/life.jpg",
          },
          {
            sectionKey: "visitor_cta",
            sectionType: "cta",
            heading: "Visit on a Sunday",
            bodyText: "Custom visit",
            mediaUrl: null,
          },
        ],
        aboutDemoFallback: {
          lifeTogether: {
            heading: "Life Together",
            bodyText: "Fallback",
            mediaUrl: "/media/demo/life-together.jpg",
          },
          visitorCtaHeading: "Visit on a Sunday",
          visitorCtaBody: "Fallback visit",
          visitorCtaMediaUrl: "/media/demo/visit-sunday.jpg",
          gallery: [],
        },
        websiteAdmin: null,
      },
      { filename: aboutPath, views: [path.join(ROOT, "views")] }
    );
    assert.match(html, /src="\/media\/custom\/life\.jpg"/);
    assert.doesNotMatch(
      html.match(/data-bb-about-life-together="1"[\s\S]*?<\/section>/)[0],
      /life-together\.jpg/
    );
    assert.match(html, /src="\/media\/demo\/visit-sunday\.jpg"/);
  });
});
