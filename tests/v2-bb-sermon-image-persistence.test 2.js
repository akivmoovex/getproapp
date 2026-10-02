"use strict";

/**
 * V2 Bug 19 — sermon thumbnail durability + universal image editor contracts.
 */

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), "utf8");
}

describe("v2-bb sermon thumbnail durable persistence (Bug 19)", () => {
  it("additive migration adds blessboard.sermons.image_url", () => {
    const sql = read("db/migrations/blessboard/113_sermon_thumbnail_image_url.sql");
    assert.match(sql, /ADD COLUMN IF NOT EXISTS image_url/);
    assert.match(sql, /sermons_image_url_len/);
    assert.doesNotMatch(sql, /DROP COLUMN/i);
  });

  it("publicContentRepository maps and writes sermon imageUrl", () => {
    const src = read("src/blessboard/repositories/publicContentRepository.js");
    assert.match(src, /SERMON_COLS[\s\S]*image_url/);
    assert.match(src, /imageUrl:\s*row\.image_url/);
    assert.match(src, /image_url,\s*status/);
    assert.match(src, /image_url = COALESCE\(\$8, image_url\)/);
    assert.match(src, /fields\.imageUrl/);
  });

  it("websiteDraftApplyService persists payload.imageUrl for sermons", () => {
    const src = read("src/blessboard/services/websiteDraftApplyService.js");
    const sermonBlock = src.slice(src.indexOf('if (kind === "sermon")'), src.indexOf('if (kind === "giving_method")'));
    assert.match(sermonBlock, /imageUrl:\s*payload\.imageUrl/);
  });

  it("content-admin sermons expose shared media-field for thumbnail and document upload for resources", () => {
    const ejs = read("views/blessboard/v5/content-admin/entity-fields.ejs");
    assert.match(ejs, /data-bb-entity-photo="sermon"/);
    assert.match(ejs, /srcName:\s*'image_url'/);
    assert.match(ejs, /allowDocuments:\s*true/);
    const routes = read("src/blessboard/http/contentAdminRoutes.js");
    assert.match(routes, /case "sermons":[\s\S]*imageUrl:\s*body\.image_url/);
  });

  it("structured editor prefers Hostinger publicSrc over legacy deliveryPath", () => {
    const js = read("public/blessboard/v5/website-structured-edit.js");
    assert.match(
      js,
      /media\.publicSrc \|\|\s*media\.previewUrl \|\|\s*result\.data\.deliveryPath/
    );
    assert.match(js, /a\.publicSrc \|\| a\.previewUrl \|\| a\.deliveryPath/);
    assert.doesNotMatch(
      js,
      /var path =\s*result\.data\.deliveryPath \|\|\s*media\.publicSrc/
    );
  });
});
