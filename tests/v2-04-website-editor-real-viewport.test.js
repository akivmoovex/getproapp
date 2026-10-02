"use strict";

/**
 * V2.04 — Real iframe responsive viewport for shared website editor (BB + AC).
 * Covers A–L focused checks from the implementation task.
 */

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");

const {
  VIEWPORT_MODE,
  VIEWPORT_FRAME_WIDTHS,
  VIEWPORT_MESSAGE_SOURCE,
  VIEWPORT_MESSAGE_TYPES,
  isWebsiteFrameRequest,
  withWebsiteFrameQuery,
  withoutWebsiteFrameQuery,
  buildEditorViewportFramePath,
  isSameOriginFrameUrl,
  viewportWidthForMode,
  usesIframeViewport,
} = require("../src/platform/website-engine/editorViewportFrame");

const ROOT = path.join(__dirname, "..");

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), "utf8");
}

describe("V2.04 website editor real iframe viewport", () => {
  // A. shared viewport switching
  it("A: shared chrome exposes Desktop/Tablet/Mobile with iframe architecture", () => {
    const chrome = read("views/platform/website-engine/editor-chrome.ejs");
    const js = read("public/platform/website-inline-edit.js");
    assert.match(chrome, /data-website-viewport-architecture="iframe"/);
    assert.match(chrome, /data-website-viewport="desktop"/);
    assert.match(chrome, /data-website-viewport="tablet"/);
    assert.match(chrome, /data-website-viewport="mobile"/);
    assert.match(chrome, /data-website-viewport-stage="1"/);
    assert.match(chrome, /data-website-viewport-frame="1"/);
    assert.match(js, /enterFrameViewport/);
    assert.match(js, /setViewportMode/);
    assert.match(js, /VIEWPORT_WIDTHS = \{ tablet: 768, mobile: 390 \}/);
  });

  // B. iframe URL construction
  it("B: buildEditorViewportFramePath forces edit+draft+frame for tablet/mobile", () => {
    const mobile = buildEditorViewportFramePath("/c/demo-church/about", { mode: "mobile" });
    assert.equal(mobile.ok, true);
    assert.equal(mobile.width, 390);
    assert.equal(mobile.mode, VIEWPORT_MODE.MOBILE);
    assert.match(mobile.path, /website_edit=1/);
    assert.match(mobile.path, /website_mode=draft/);
    assert.match(mobile.path, /website_frame=1/);
    assert.match(mobile.path, /^\/c\/demo-church\/about\?/);

    const tablet = buildEditorViewportFramePath(
      "/clinics/demo-clinic/services?website_edit=1&website_mode=draft&foo=bar",
      { mode: "tablet" }
    );
    assert.equal(tablet.ok, true);
    assert.equal(tablet.width, 768);
    assert.match(tablet.path, /foo=bar/);
    assert.match(tablet.path, /website_frame=1/);
  });

  // C. recursive shell prevention
  it("C: frame mode uses bootstrap without outer editor chrome", () => {
    const bb = read("views/blessboard/v5/partials/website-admin-chrome.ejs");
    const ac = read("views/activeclinic/partials/website-editor-chrome.ejs");
    const bootstrap = read("views/platform/website-engine/editor-frame-bootstrap.ejs");
    assert.match(bb, /wa\.frameMode/);
    assert.match(bb, /editor-frame-bootstrap/);
    assert.match(ac, /websiteFrameMode/);
    assert.match(ac, /editor-frame-bootstrap/);
    assert.match(bootstrap, /data-website-frame-bootstrap="1"/);
    assert.match(bootstrap, /data-website-save-url/);
    assert.doesNotMatch(bootstrap, /data-website-viewport-group/);
    assert.doesNotMatch(bootstrap, /data-website-viewport-stage/);
  });

  // D. query preservation
  it("D: with/withoutWebsiteFrameQuery preserve unrelated query state", () => {
    const withFrame = withWebsiteFrameQuery("/x?website_edit=1&website_mode=draft&branch=north");
    assert.match(withFrame, /website_frame=1/);
    assert.match(withFrame, /branch=north/);
    assert.match(withFrame, /website_edit=1/);
    const stripped = withoutWebsiteFrameQuery(withFrame);
    assert.doesNotMatch(stripped, /website_frame=/);
    assert.match(stripped, /branch=north/);
    assert.match(stripped, /website_edit=1/);
  });

  // E. BB route preservation
  it("E: BB paths keep tenant/page segments in frame URL", () => {
    const built = buildEditorViewportFramePath(
      "https://blessboard.neuniversity.org/c/qa-church/events?website_edit=1&website_mode=draft",
      { mode: "mobile" }
    );
    assert.equal(built.ok, true);
    assert.match(built.path, /^\/c\/qa-church\/events\?/);
    assert.match(built.path, /website_frame=1/);
  });

  // F. AC route preservation
  it("F: AC paths keep clinic/page segments in frame URL", () => {
    const built = buildEditorViewportFramePath(
      "https://activeclinic.neuniversity.org/clinics/qa-clinic/doctors?website_edit=1&website_mode=draft",
      { mode: "tablet" }
    );
    assert.equal(built.ok, true);
    assert.match(built.path, /^\/clinics\/qa-clinic\/doctors\?/);
    assert.match(built.path, /website_frame=1/);
  });

  // G. 390px viewport
  it("G: mobile viewport width is 390", () => {
    assert.equal(VIEWPORT_FRAME_WIDTHS.mobile, 390);
    assert.equal(viewportWidthForMode("mobile"), 390);
    const chrome = read("views/platform/website-engine/editor-chrome.ejs");
    assert.match(chrome, /data-website-viewport="mobile"[\s\S]*?data-website-viewport-width="390"/);
  });

  // H. 768px viewport
  it("H: tablet viewport width is 768", () => {
    assert.equal(VIEWPORT_FRAME_WIDTHS.tablet, 768);
    assert.equal(viewportWidthForMode("tablet"), 768);
    const chrome = read("views/platform/website-engine/editor-chrome.ejs");
    assert.match(chrome, /data-website-viewport="tablet"[\s\S]*?data-website-viewport-width="768"/);
  });

  // I. same-origin enforcement
  it("I: same-origin frame URL checks reject cross-product hosts", () => {
    const bbOrigin = "https://blessboard.neuniversity.org";
    assert.equal(isSameOriginFrameUrl(bbOrigin, "/c/x?website_frame=1"), true);
    assert.equal(
      isSameOriginFrameUrl(bbOrigin, "https://blessboard.neuniversity.org/c/x?website_frame=1"),
      true
    );
    assert.equal(
      isSameOriginFrameUrl(bbOrigin, "https://activeclinic.neuniversity.org/clinics/x"),
      false
    );
    const js = read("public/platform/website-inline-edit.js");
    assert.match(js, /path\.charAt\(0\) !== "\/"/);
    assert.match(js, /ev\.origin !== window\.location\.origin/);
    assert.match(js, /postMessage\(payload, window\.location\.origin\)/);
  });

  // J. editor state preservation
  it("J: frame bootstrap preserves save/media/pending hooks; JS relays dirty/save", () => {
    const bootstrap = read("views/platform/website-engine/editor-frame-bootstrap.ejs");
    const js = read("public/platform/website-inline-edit.js");
    assert.match(bootstrap, /data-website-save-url/);
    assert.match(bootstrap, /data-website-media-url/);
    assert.match(bootstrap, /data-website-pending-count/);
    assert.match(bootstrap, /data-website-discard-url/);
    assert.match(bootstrap, /data-website-unpublish-url/);
    assert.match(js, /DIRTY_STATE_CHANGED/);
    assert.match(js, /CONTENT_CHANGED/);
    assert.match(js, /SAVE_RESULT/);
    assert.match(js, /EDITOR_READY/);
    assert.equal(VIEWPORT_MESSAGE_SOURCE, "gp-website-editor");
    assert.equal(VIEWPORT_MESSAGE_TYPES.EDITOR_READY, "EDITOR_READY");
  });

  // K. no duplicated editor chrome
  it("K: frame request skips outer viewport chrome; desktop stays same-document", () => {
    assert.equal(usesIframeViewport("desktop"), false);
    assert.equal(usesIframeViewport("tablet"), true);
    assert.equal(usesIframeViewport("mobile"), true);
    const desktop = buildEditorViewportFramePath("/c/x?website_edit=1&website_mode=draft&website_frame=1", {
      mode: "desktop",
    });
    assert.equal(desktop.ok, true);
    assert.equal(desktop.width, null);
    assert.doesNotMatch(desktop.path, /website_frame=/);
    assert.equal(isWebsiteFrameRequest({ website_frame: "1" }), true);
    assert.equal(isWebsiteFrameRequest({ website_edit: "1" }), false);
    const js = read("public/platform/website-inline-edit.js");
    assert.match(js, /if \(isFrameDocument\(\)\) return;/);
  });

  // L. viewport change after initial load
  it("L: JS can switch viewport after load; obsolete max-width pinch removed", () => {
    const js = read("public/platform/website-inline-edit.js");
    const css = read("public/platform/website-inline-edit.css");
    assert.match(js, /function setViewportMode/);
    assert.match(js, /exitFrameViewport/);
    assert.match(js, /enterFrameViewport/);
    assert.match(js, /currentViewportMode/);
    assert.doesNotMatch(
      css,
      /body\.gp-website-viewport-mobile[\s\S]{0,120}max-width:\s*390px/
    );
    assert.doesNotMatch(
      css,
      /body\.gp-website-viewport-tablet[\s\S]{0,120}max-width:\s*768px/
    );
    assert.match(css, /\.gp-website-viewport-stage/);
    assert.match(css, /--gp-viewport-frame-width/);
  });

  it("shared platform wiring: BB + AC attach frameMode without product forks", () => {
    const bbAttach = read("src/blessboard/http/attachWebsiteAdminChrome.js");
    const acAttach = read("src/activeclinic/http/attachActiveClinicWebsiteChrome.js");
    const js = read("public/platform/website-inline-edit.js");
    assert.match(bbAttach, /isWebsiteFrameRequest/);
    assert.match(bbAttach, /frameMode/);
    assert.match(acAttach, /isWebsiteFrameRequest/);
    assert.match(acAttach, /websiteFrameMode/);
    assert.match(js, /same-origin iframe/);
    assert.equal(Object.keys(VIEWPORT_MODE).length >= 3, true);
  });
});
