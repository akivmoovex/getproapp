"use strict";

/**
 * V2.0 BUG 17 — BlessBoard ministry leader photo upload contracts.
 */

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), "utf8");
}

describe("v2 bb ministry leader image upload contracts", () => {
  it("leadership entity fields use shared platform media field with clear actions", () => {
    const fields = read("views/blessboard/v5/content-admin/entity-fields.ejs");
    assert.match(fields, /data-bb-leadership-photo="1"/);
    assert.match(fields, /platform\/website\/partials\/media-field/);
    assert.match(fields, /Upload from computer/);
    assert.match(fields, /Choose from Content Library/);
    assert.match(fields, /srcName:\s*'image_url'/);
    assert.match(fields, /websiteMediaListUrl/);
    // Must not wire leadership photos through the kill-switched content media upload.
    const leadershipBlock = fields.slice(
      fields.indexOf("entityKind === 'leadership'"),
      fields.indexOf("entityKind === 'ministries'")
    );
    assert.doesNotMatch(leadershipBlock, /media-upload/);
    assert.doesNotMatch(leadershipBlock, /\/media\/upload/);
  });

  it("entities admin loads shared website media assets for image-bearing entities", () => {
    const entities = read("views/blessboard/v5/content-admin/entities.ejs");
    assert.match(entities, /_useSharedWebsiteMedia/);
    assert.match(entities, /entityKind === 'leadership'/);
    assert.match(entities, /loadSharedWebsiteMedia:\s*_useSharedWebsiteMedia/);
    assert.match(entities, /platform\/website\/partials\/media-picker-dialog/);
  });

  it("content admin resolves shared /c/{org}/website/media list URL", () => {
    const routes = read("src/blessboard/http/contentAdminRoutes.js");
    assert.match(routes, /function websiteMediaListUrlForReq/);
    assert.match(routes, /\/c\/\$\{encodeURIComponent\(String\(orgKey\)\)\}\/website\/media/);
    assert.match(routes, /websiteMediaListUrl:\s*websiteMediaListUrlForReq\(req\)/);
  });

  it("branch admin shell can load shared website media field assets", () => {
    const start = read("views/blessboard/v5/partials/branch-admin-shell-start.ejs");
    const end = read("views/blessboard/v5/partials/branch-admin-shell-end.ejs");
    assert.match(start, /loadSharedWebsiteMedia/);
    assert.match(start, /website-media-field\.css\?v=v2-media-parity-1/);
    assert.match(end, /website-media-field\.js\?v=v2-media-parity-1/);
  });

  it("structured leader editor keeps Upload from computer and Content Library", () => {
    const js = read("public/blessboard/v5/website-structured-edit.js");
    assert.match(js, /function buildLeaderForm/);
    assert.match(js, /Upload from computer/);
    assert.match(js, /Choose from Content Library/);
    assert.match(js, /media\.publicSrc/);
  });

  it("shared platform media field posts to existing media endpoint with CSRF", () => {
    const js = read("public/platform/website-media-field.js");
    assert.match(js, /FormData/);
    assert.match(js, /_csrf/);
    assert.match(js, /media\.publicSrc/);
    assert.doesNotMatch(js, /hq\/content\/media\/upload/);
  });
});
