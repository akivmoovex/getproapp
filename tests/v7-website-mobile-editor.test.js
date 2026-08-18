"use strict";

/**
 * Unified website editor mobile QA: shared chrome stack, touch targets,
 * keyboard/input contract, preview + publish confirmation. Source assertions
 * so both products stay on one layout contract without product CSS forks.
 */

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), "utf8");
}

describe("v7 unified website editor mobile QA", () => {
  it("shared CSS keeps a single chrome stack, 44px touch targets, and keyboard inset", () => {
    const css = read("public/platform/website-inline-edit.css");
    assert.match(css, /\.gp-website-chrome-stack/);
    assert.match(css, /--gp-website-touch:\s*2\.75rem/);
    assert.match(css, /--gp-keyboard-inset/);
    assert.match(css, /scroll-padding-top/);
    assert.match(css, /scroll-margin-top/);
    assert.match(css, /font-size:\s*1rem/);
    assert.match(css, /env\(safe-area-inset-bottom/);
    assert.match(css, /env\(safe-area-inset-top/);
    assert.doesNotMatch(
      css,
      /@media \(max-width:\s*430px\)[\s\S]{0,280}\.ac-website-chrome__actions[\s\S]{0,80}width:\s*100%/
    );
    assert.match(css, /\.gp-website-chrome-stack \.bb-tp-header/);
    assert.match(css, /\.gp-website-chrome-stack \.ac-public-header/);
    assert.match(css, /body\.ac-public-body:has\(\.gp-website-chrome-stack\) \.ac-public-header/);
    assert.match(css, /\.bb-tp-inline-edit__actions/);
    assert.match(css, /flex-direction:\s*row/);
    assert.match(css, /--acp-bottom-nav-h/);
  });

  it("shared mobile JS syncs visualViewport and confirms publish", () => {
    const js = read("public/platform/website-editor-mobile.js");
    assert.match(js, /visualViewport/);
    assert.match(js, /--gp-keyboard-inset/);
    assert.match(js, /gp-website-field-editing/);
    assert.match(js, /scrollIntoView/);
    assert.match(js, /data-website-publish-confirm/);
    assert.match(js, /window\.confirm/);
    assert.match(js, /data-bb-inline-edit/);
    assert.match(js, /data-website-start/);
  });

  it("ActiveClinic and BlessBoard shells load the shared editor assets and stack", () => {
    const acShell = read("views/activeclinic/layouts/public-shell.ejs");
    const bbStart = read("views/blessboard/v5/partials/tenant-public-shell-start.ejs");
    const bbEnd = read("views/blessboard/v5/partials/tenant-public-shell-end.ejs");
    assert.match(acShell, /viewport-fit=cover/);
    assert.match(acShell, /data-website-chrome-stack="1"/);
    assert.match(acShell, /website-inline-edit\.css/);
    assert.match(acShell, /website-editor-mobile\.js/);
    assert.match(acShell, /ac-mobile-bottom-nav/);
    assert.match(bbStart, /viewport-fit=cover/);
    assert.match(bbStart, /data-website-chrome-stack="1"/);
    assert.match(bbStart, /website-inline-edit\.css/);
    assert.match(bbStart, /bb-tp-menu-btn/);
    assert.match(bbStart, /bb-tp-drawer-overlay/);
    assert.match(bbEnd, /website-editor-mobile\.js/);
    assert.doesNotMatch(acShell, /blessboard\/v5\/tenant-public\.css/);
    assert.doesNotMatch(bbStart, /ac-public\.css/);
  });

  it("field types keep pencil / text / image / check / cancel usable on a phone", () => {
    const acField = read("views/activeclinic/partials/website-editable-field.ejs");
    const acImage = read("views/activeclinic/partials/website-editable-image.ejs");
    const bbField = read("views/blessboard/v5/partials/editable-text.ejs");
    const acChrome = read("views/activeclinic/partials/website-editor-chrome.ejs");
    const bbChrome = read("views/blessboard/v5/partials/website-admin-chrome.ejs");
    assert.match(acField, /data-website-start="1"/);
    assert.match(acField, /data-website-save="1"/);
    assert.match(acField, /data-website-cancel="1"/);
    assert.match(acField, /enterkeyhint="done"/);
    assert.match(acField, /enterkeyhint="enter"/);
    assert.match(acImage, /data-website-type="image"/);
    assert.match(acImage, /data-website-file="1"/);
    assert.match(acImage, /enterkeyhint="done"/);
    assert.match(bbField, /data-bb-inline-start="1"/);
    assert.match(bbField, /data-bb-inline-save="1"/);
    assert.match(bbField, /data-bb-inline-cancel="1"/);
    assert.match(bbField, /enterkeyhint="done"/);
    assert.match(bbField, /enterkeyhint="enter"/);
    assert.match(acChrome, /data-website-edit-control="1"/);
    assert.match(acChrome, /data-website-preview="1"/);
    assert.match(acChrome, /data-website-publish-confirm="1"/);
    assert.match(acChrome, /gp-website-chrome__label-short/);
    assert.match(bbChrome, /data-bb-edit-website="1"/);
    assert.match(bbChrome, /data-bb-edit-toolbar="1"/);
    assert.match(bbChrome, /bb-tp-btn--touch/);
    assert.match(bbChrome, /bb-tp-btn__label-short/);
  });

  it("preview and publish confirmation stay reachable from editor chrome and review", () => {
    const acChrome = read("views/activeclinic/partials/website-editor-chrome.ejs");
    const acSettings = read("views/activeclinic/app/settings-website-content.ejs");
    const bbReview = read("views/blessboard/v5/content-admin/website-publish-review.ejs");
    assert.match(acChrome, /websitePreviewUrl/);
    assert.match(acChrome, /Publish this website\? Public visitors will see the current draft\./);
    assert.match(acSettings, /data-ac-website-action="preview"/);
    assert.match(acSettings, /onsubmit="return confirm\(/);
    assert.match(bbReview, /data-bb-preview-website="1"/);
    assert.match(bbReview, /data-bb-website-publish-review="1"/);
    assert.match(bbReview, /acknowledge_public/);
    assert.match(bbReview, /data-bb-stitch-screen-mobile="Phase 7 - Website Publish Review - Mobile"/);
    assert.match(bbReview, /data-bb-continue-editing="1"/);
  });
});
