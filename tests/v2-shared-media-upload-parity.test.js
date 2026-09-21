"use strict";

/**
 * Contract tests for shared platform media field / picker parity.
 */

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), "utf8");
}

describe("v2 shared media upload parity contracts", () => {
  it("ships shared platform media field assets", () => {
    assert.ok(fs.existsSync(path.join(ROOT, "public/platform/website-media-field.js")));
    assert.ok(fs.existsSync(path.join(ROOT, "public/platform/website-media-field.css")));
    assert.ok(fs.existsSync(path.join(ROOT, "views/platform/website/partials/media-field.ejs")));
    assert.ok(fs.existsSync(path.join(ROOT, "views/platform/website/partials/media-picker-dialog.ejs")));
  });

  it("inline editor action labels match Content Library wording for both products", () => {
    const js = read("public/platform/website-inline-edit.js");
    assert.match(js, /Upload from computer/);
    assert.match(js, /Choose from Content Library/);
    assert.match(js, /Replace image/);
    assert.match(js, /Remove image/);
    // currentSrc must be resolved before building the action label
    const idxSrc = js.indexOf('var currentSrc = canvasImg');
    const idxUpload = js.indexOf('"Upload from computer"');
    assert.ok(idxSrc > 0 && idxUpload > idxSrc);
  });

  it("ActiveClinic app shell loads shared media field assets", () => {
    const shell = read("views/activeclinic/layouts/app-shell.ejs");
    assert.match(shell, /\/platform\/website-media-field\.css/);
    assert.match(shell, /\/platform\/website-media-field\.js/);
  });

  it("BlessBoard HQ branding uses shared media field with identical action labels", () => {
    const branding = read("views/blessboard/v5/hq/website-branding.ejs");
    const hqStart = read("views/blessboard/v5/partials/hq-shell-start.ejs");
    const hqEnd = read("views/blessboard/v5/partials/hq-shell-end.ejs");
    assert.match(branding, /platform\/website\/partials\/media-field/);
    assert.match(branding, /platform\/website\/partials\/media-picker-dialog/);
    assert.match(branding, /loadSharedWebsiteMedia:\s*true/);
    assert.match(hqStart, /website-media-field\.css\?v=v2-media-parity-1/);
    assert.match(hqEnd, /website-media-field\.js\?v=v2-media-parity-1/);
    assert.match(read("views/platform/website/partials/media-field.ejs"), /Upload from computer/);
    assert.match(read("views/platform/website/partials/media-field.ejs"), /Choose from Content Library/);
    assert.match(read("views/platform/website/partials/media-field.ejs"), /Replace image/);
    assert.match(read("views/platform/website/partials/media-field.ejs"), /Remove image/);
  });

  it("BlessBoard public editor cache bust includes media parity assets", () => {
    const start = read("views/blessboard/v5/partials/tenant-public-shell-start.ejs");
    const end = read("views/blessboard/v5/partials/tenant-public-shell-end.ejs");
    assert.match(start, /website-inline-edit\.css\?v=v2-media-parity-1/);
    assert.match(end, /website-inline-edit\.js\?v=v2-media-parity-1/);
  });

  it("BlessBoard structured edit and branding skip duplicate upload handlers when shared field is present", () => {
    const structured = read("public/blessboard/v5/website-structured-edit.js");
    const brandingJs = read("public/blessboard/v5/website-branding.js");
    assert.match(structured, /Upload from computer/);
    assert.match(structured, /Choose from Content Library/);
    assert.match(brandingJs, /usesSharedMediaField/);
    assert.match(brandingJs, /data-gp-we-media-field/);
  });

  it("shared picker uploads via FormData to existing media endpoint without second storage system", () => {
    const js = read("public/platform/website-media-field.js");
    assert.match(js, /FormData/);
    assert.match(js, /mediaKind/);
    assert.match(js, /_csrf/);
    assert.doesNotMatch(js, /unsplash|pexels|cloudinary|s3\.amazonaws/i);
  });
});
