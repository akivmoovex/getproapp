"use strict";

/**
 * V2.04 Wave 1 — RB-ENG-03 / RB-ENG-04 focused proofs:
 * - Universal IMAGE payload accepts WE01 `{src}` and BB structured aliases
 * - BB page-hero / welcome / about photo surfaces mount shared editable-image pencils
 * - Editor drafts route dual-writes object payloads (no string-only overlay skip)
 */

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");

const {
  PRODUCT_CODE,
  assertEditableMutation,
  ensureProductFieldsRegistered,
} = require("../src/platform/website/editableFieldSchema");
const {
  validateContentValue,
  CONTENT_TYPES,
  imageSrcFromCandidate,
} = require("../src/platform/website/contentTypes");

const ROOT = path.join(__dirname, "..");

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), "utf8");
}

describe("V2.04 Wave1 RB-ENG-04 universal image payload", () => {
  it("imageSrcFromCandidate accepts WE01 and BB structured aliases", () => {
    assert.equal(imageSrcFromCandidate({ src: "https://cdn.example.com/a.png" }), "https://cdn.example.com/a.png");
    assert.equal(imageSrcFromCandidate({ url: "https://cdn.example.com/b.png" }), "https://cdn.example.com/b.png");
    assert.equal(imageSrcFromCandidate({ imageUrl: "https://cdn.example.com/c.png" }), "https://cdn.example.com/c.png");
    assert.equal(imageSrcFromCandidate({ image: "https://cdn.example.com/d.png" }), "https://cdn.example.com/d.png");
    assert.equal(imageSrcFromCandidate({ mediaUrl: "https://cdn.example.com/e.png" }), "https://cdn.example.com/e.png");
    assert.equal(imageSrcFromCandidate(null), "");
  });

  it("IMAGE content type accepts imageUrl / mediaUrl object shapes", () => {
    const def = { type: CONTENT_TYPES.IMAGE, maxLen: 500 };
    for (const key of ["imageUrl", "mediaUrl", "image"]) {
      const payload = { [key]: "https://cdn.example.com/hero.png", alt: "Alt" };
      const ok = validateContentValue(def, payload);
      assert.equal(ok.ok, true, key + " " + JSON.stringify(ok));
      assert.equal(ok.value.src, "https://cdn.example.com/hero.png");
      assert.equal(ok.value.alt, "Alt");
    }
  });

  it("BlessBoard about.hero.image and home.welcome.image accept object payloads", () => {
    ensureProductFieldsRegistered(PRODUCT_CODE.BLESSBOARD);
    for (const contentKey of ["about.hero.image", "home.welcome.image", "about.story.image"]) {
      const ok = assertEditableMutation({
        productCode: PRODUCT_CODE.BLESSBOARD,
        contentKey,
        value: {
          mediaId: "99f3284b-1bf8-473c-85f1-a95134ec25c5",
          src: "https://cdn.example.com/hero.png",
          alt: "Wave1",
        },
        grantedPermissions: ["website.edit"],
      });
      assert.equal(ok.ok, true, contentKey + " " + JSON.stringify(ok));
    }
  });

  it("editor drafts route dual-writes object image payloads", () => {
    const src = read("src/blessboard/http/blessboardWebsiteEditorRoutes.js");
    assert.match(src, /readSubmittedEditableValue/);
    assert.match(src, /dualWriteOverlay/);
    assert.match(src, /typeof value === "object"/);
    assert.doesNotMatch(
      src,
      /if \(typeof value === "string"\) \{\s*const locator =/
    );
  });
});

describe("V2.04 Wave1 RB-ENG-03 BB public inline image pencils", () => {
  it("page-hero mounts editable-image for photographs", () => {
    const hero = read("views/blessboard/v5/public/partials/page-hero.ejs");
    assert.match(hero, /editable-image/);
    assert.match(hero, /contentKey:\s*_pageKey \+ '\.' \+ _sectionKey \+ '\.image'/);
    assert.match(hero, /editKind:\s*'video'/);
    assert.doesNotMatch(hero, /editKind:\s*'image'/);
  });

  it("home welcome + about photo surfaces mount editable-image", () => {
    const home = read("views/blessboard/v5/public/home.ejs");
    assert.match(home, /contentKey:\s*'home\.welcome\.image'/);
    assert.match(home, /editable-image/);

    const about = read("views/blessboard/v5/public/about.ejs");
    for (const key of [
      "about.story.image",
      "about.community.image",
      "about.visitor_cta.image",
    ]) {
      assert.match(about, new RegExp(key.replace(/\./g, "\\.")));
    }
    assert.match(about, /editable-image/);
  });

  it("registered inline IMAGE fields cover page heroes and about photos", () => {
    ensureProductFieldsRegistered(PRODUCT_CODE.BLESSBOARD);
    const keys = [
      "about.hero.image",
      "leadership.hero.image",
      "ministries.hero.image",
      "events.hero.image",
      "sermons.hero.image",
      "giving.hero.image",
      "contact.hero.image",
      "home.welcome.image",
      "about.story.image",
      "about.community.image",
      "about.life_together.image",
      "about.visitor_cta.image",
      "about.gallery_1.image",
      "about.gallery_2.image",
      "about.gallery_3.image",
    ];
    for (const contentKey of keys) {
      const ok = assertEditableMutation({
        productCode: PRODUCT_CODE.BLESSBOARD,
        contentKey,
        value: "https://cdn.example.com/x.png",
        grantedPermissions: ["website.edit"],
      });
      assert.equal(ok.ok, true, contentKey + " " + JSON.stringify(ok));
    }
  });
});
