"use strict";

/**
 * Website editor / review UI completion: diff builder, Request Changes markup,
 * inline controls, image editor, pricing display, mobile CSS.
 */

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");

const {
  buildWebsiteReviewDiff,
  classifyChange,
  safePublicSrc,
} = require("../src/platform/website/reviewDiff");
const {
  resolvePublicPricingDisplay,
  DEFAULT_INSURANCE_PLACEHOLDER,
} = require("../src/activeclinic/website/publicPricingDisplay");
const { registerActiveClinicWebsiteTemplate } = require("../src/activeclinic/website/activeClinicWebsiteTemplate");

const ROOT = path.join(__dirname, "..");

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), "utf8");
}

describe("website UI completion", () => {
  it("builds an immutable snapshot old/new diff with page/section/field and change types", () => {
    registerActiveClinicWebsiteTemplate();
    const snapshot = {
      values: {
        "home.hero.title": "New title",
        "home.hero.subtitle": "New subtitle that is long enough to be treated as a readable block when it exceeds one hundred and sixty characters in the proposed copy for reviewers.",
        "home.hero.image": {
          src: "/clinics/activeclinic-demo/website/media/11111111-1111-4111-8111-111111111111",
          alt: "New exterior",
          mediaId: "11111111-1111-4111-8111-111111111111",
        },
      },
      visibility: {},
      changes: [
        {
          contentKey: "home.hero.title",
          contentType: "short_text",
          oldValue: "Old title",
          proposedValue: "New title",
        },
        {
          contentKey: "home.hero.subtitle",
          contentType: "long_text",
          oldValue: "Old subtitle",
          proposedValue:
            "New subtitle that is long enough to be treated as a readable block when it exceeds one hundred and sixty characters in the proposed copy for reviewers on the clinic website.",
        },
        {
          contentKey: "home.hero.image",
          contentType: "image",
          oldValue: { src: "/activeclinic/assets/clinic-hero-default.jpg", alt: "Old" },
          proposedValue: {
            src: "/clinics/activeclinic-demo/website/media/11111111-1111-4111-8111-111111111111",
            alt: "New exterior",
            mediaId: "11111111-1111-4111-8111-111111111111",
          },
        },
        {
          contentKey: "about.story.body",
          contentType: "long_text",
          oldValue: "About us",
          proposedValue: null,
        },
        {
          contentKey: "page.pricing.visible",
          contentType: "boolean",
          oldValue: true,
          proposedValue: true,
          oldVisibility: "visible",
          visibility: "hidden",
        },
      ],
    };
    const template = registerActiveClinicWebsiteTemplate();
    const diff = buildWebsiteReviewDiff({ snapshot, template });
    assert.equal(diff.source, "submission_snapshot");
    assert.equal(diff.count, 5);
    const byKey = Object.fromEntries(diff.items.map((i) => [i.contentKey, i]));
    assert.equal(byKey["home.hero.title"].changeType, "changed");
    assert.equal(byKey["home.hero.title"].pageLabel, "Home");
    assert.equal(byKey["home.hero.title"].sectionKey, "hero");
    assert.equal(byKey["home.hero.title"].old.text, "Old title");
    assert.equal(byKey["home.hero.title"].proposed.text, "New title");
    assert.equal(byKey["home.hero.subtitle"].proposed.long, true);
    assert.equal(byKey["home.hero.image"].contentType, "image");
    assert.match(byKey["home.hero.image"].proposed.src, /website\/media\/11111111/);
    assert.equal(byKey["home.hero.image"].proposed.alt, "New exterior");
    assert.equal(byKey["about.story.body"].changeType, "removed");
    assert.equal(byKey["page.pricing.visible"].changeType, "visibility");
    assert.equal(
      classifyChange({ oldValue: null, proposedValue: "Hello" }),
      "added"
    );
  });

  it("does not compare against a mutable live draft and rejects unsafe image URLs", () => {
    const snapshot = {
      changes: [
        {
          contentKey: "home.hero.title",
          contentType: "short_text",
          oldValue: "Published",
          proposedValue: "Submitted snapshot",
        },
        {
          contentKey: "home.hero.image",
          contentType: "image",
          oldValue: { src: "javascript:alert(1)", alt: "x" },
          proposedValue: { src: "https://evil.example/phish.png", alt: "y" },
        },
      ],
    };
    const liveDraft = { "home.hero.title": "UNRELATED LIVE DRAFT" };
    const diff = buildWebsiteReviewDiff({ snapshot });
    const title = diff.items.find((i) => i.contentKey === "home.hero.title");
    assert.equal(title.proposed.text, "Submitted snapshot");
    assert.notEqual(title.proposed.text, liveDraft["home.hero.title"]);
    const image = diff.items.find((i) => i.contentKey === "home.hero.image");
    assert.equal(safePublicSrc("javascript:alert(1)"), null);
    assert.equal(image.old.src, null);
    assert.equal(image.proposed.src, "https://evil.example/phish.png");
  });

  it("review template shows old/new fields and Request Changes using the decision endpoint", () => {
    const review = read("views/blessboard/v5/platform-admin/website-change-review.ejs");
    assert.match(review, /data-website-review-diff="1"/);
    assert.match(review, /data-website-diff-side="old"/);
    assert.match(review, /data-website-diff-side="new"/);
    assert.match(review, /data-website-review-request-changes="1"/);
    assert.match(review, /Request Changes/);
    assert.match(review, /Approve &amp; Publish/);
    assert.match(review, /data-website-review-reject="1"/);
    assert.match(review, /action="\/admin\/website-changes\/<%= s.id %>\/request_changes"/);
    assert.match(review, /action="\/admin\/website-changes\/<%= s.id %>\/approve"/);
    assert.doesNotMatch(review, /<%- item\.(old|proposed)/);
    const css = read("public/blessboard/v5/platform-admin.css");
    assert.match(css, /\.bb-pa-website-diff__compare/);
    assert.match(css, /@media \(max-width:\s*430px\)/);
    const shell = read("views/blessboard/v5/partials/platform-admin-shell-start.ejs");
    assert.match(shell, /platform-admin.css\?v=63/);
  });

  it("inline editor uses accessible check/cross controls and wires image upload", () => {
    const field = read("views/activeclinic/partials/website-editable-field.ejs");
    const image = read("views/activeclinic/partials/website-editable-image.ejs");
    const js = read("public/platform/website-inline-edit.js");
    const css = read("public/platform/website-inline-edit.css");
    const chrome = read("views/activeclinic/partials/website-editor-chrome.ejs");
    const shared = read("views/platform/website-engine/editor-chrome.ejs");
    const attach = read("src/activeclinic/http/attachActiveClinicWebsiteChrome.js");
    assert.match(field, /aria-label="Save field to draft"/);
    assert.match(field, /aria-label="Cancel unsaved edit"/);
    assert.match(field, /Save to draft/);
    assert.match(field, /data-website-input="1"/);
    assert.match(field, /<textarea/);
    assert.match(field, /enterkeyhint="done"/);
    assert.match(field, /enterkeyhint="enter"/);
    assert.doesNotMatch(field, /contenteditable/);
    assert.match(image, /data-website-type="image"/);
    assert.match(image, /data-website-file="1"/);
    assert.match(image, /data-website-alt="1"/);
    assert.match(js, /FormData/);
    assert.match(js, /mediaItemUrl/);
    assert.match(js, /data-website-save-url/);
    assert.match(js, /upload\.onprogress/);
    assert.match(js, /Saved to draft/);
    assert.match(js, /Escape/);
    assert.match(js, /published === true/);
    assert.match(js, /data-website-input/);
    assert.match(js, /scrollIntoView/);
    assert.match(css, /--gp-website-touch:\s*2\.75rem/);
    assert.match(css, /min-width:\s*var\(--gp-website-touch/);
    assert.match(css, /min-height:\s*var\(--gp-website-touch/);
    assert.match(css, /@media \(max-width:\s*430px\)/);
    assert.match(css, /@media \(max-width:\s*360px\)/);
    assert.match(css, /@media \(max-width:\s*767px\)/);
    assert.match(css, /\.gp-website-chrome-stack/);
    assert.match(css, /--gp-keyboard-inset/);
    assert.match(chrome, /platform\/website-engine\/editor-chrome/);
    assert.match(chrome, /data-website-edit-control="1"/);
    assert.match(shared, /data-website-publish-confirm="1"/);
    assert.match(shared, /Preview/);
    assert.match(attach, /Submit for approval/);
    assert.match(chrome, /gp-website-chrome__label-short/);
  });

  it("pricing public display is hybrid and does not invent fees", () => {
    const empty = resolvePublicPricingDisplay({
      patterns: [],
      insuranceIntro: DEFAULT_INSURANCE_PLACEHOLDER,
      pageVisible: true,
    });
    assert.equal(empty.source, "hybrid");
    assert.equal(empty.hasOperationalPrices, false);
    assert.equal(empty.insuranceIntro, null);
    assert.equal(empty.showEmptyHonesty, true);
    const withCopy = resolvePublicPricingDisplay({
      patterns: [],
      insuranceIntro: "We accept selected medical schemes. Contact the clinic for current fees.",
      pageVisible: true,
    });
    assert.ok(withCopy.insuranceIntro);
    const hidden = resolvePublicPricingDisplay({ patterns: [{ displayName: "Consult" }], pageVisible: false });
    assert.equal(hidden.showNav, false);
    const vis = read("src/activeclinic/services/activeClinicPublicVisibilityService.js");
    assert.match(vis, /Never invent or estimate medical fees/);
    const pricingView = read("views/activeclinic/tenant/pricing.ejs");
    assert.match(pricingView, /data-ac-price-state="no-public-prices"/);
    assert.match(pricingView, /data-ac-pricing-source="hybrid"/);
  });
});
