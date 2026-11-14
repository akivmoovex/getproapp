"use strict";

/**
 * BB-02 — Announcement upload, ownership, publish visibility contracts.
 */

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");

const {
  ALLOWED_MIME,
  REJECTED_MIME,
  VISIBILITY,
} = require("../../../src/blessboard/media/mediaConstants");
const {
  publicAnnouncementImageDto,
} = require("../../../src/blessboard/services/announcementsService");

const ROOT = path.join(__dirname, "../../..");
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), "utf8");

describe("BB-02 announcement media and visibility contracts", () => {
  it("upload allowlist accepts images/pdf and rejects dangerous MIME types", () => {
    assert.ok(ALLOWED_MIME.has("image/jpeg"));
    assert.ok(ALLOWED_MIME.has("image/png"));
    assert.ok(ALLOWED_MIME.has("application/pdf"));
    assert.ok(REJECTED_MIME.has("image/svg+xml"));
    assert.ok(REJECTED_MIME.has("text/html"));
    assert.ok(REJECTED_MIME.has("application/javascript"));
  });

  it("announcement admin form exposes attachment + audience_public + CSRF", () => {
    const form = read("views/blessboard/v5/announcements/admin-form.ejs");
    assert.match(form, /name="_csrf"/);
    assert.match(form, /name="media_asset_id"/);
    assert.match(form, /name="audience_public"/);
    assert.match(form, /name="status"/);
    assert.match(form, /data-bb-ann-section="attachments"/);
  });

  it("admin routes mount create/publish and church-scoped media ownership errors", () => {
    const src = read("src/blessboard/http/announcementAdminRoutes.js");
    assert.match(src, /\$\{mountPrefix\}\/new/);
    assert.match(src, /\$\{mountPrefix\}\/:id\/publish/);
    assert.match(src, /media_asset/);
    assert.match(src, /That attachment is unavailable for this church/);
    assert.match(src, /audience_public/);
    assert.match(src, /\$\{mountPrefix\}\/media\/upload/);
    assert.match(src, /\$\{mountPrefix\}\/media`/);
    assert.match(src, /\$\{mountPrefix\}\/media\/:assetId`/);
    const mediaIdx = src.indexOf("${mountPrefix}/media`");
    const idIdx = src.indexOf("${mountPrefix}/:id`");
    assert.ok(mediaIdx > 0 && idIdx > mediaIdx, "media library must be registered before /:id");
  });

  it("public image DTO keeps owning-church active images and uses /_bb/media", () => {
    const churchId = "church-a";
    const assetId = "11111111-1111-4111-8111-111111111111";
    const rows = publicAnnouncementImageDto(
      [
        {
          churchId,
          mediaAssetId: assetId,
          visibility: VISIBILITY.PRIVATE,
          mediaStatus: "active",
          storageKey: "a/b.jpg",
          mimeType: "image/jpeg",
          altText: "ok",
          originalFilename: "ok.jpg",
        },
        {
          churchId: "other-church",
          mediaAssetId: "22222222-2222-4222-8222-222222222222",
          visibility: VISIBILITY.PUBLIC,
          mediaStatus: "active",
          storageKey: "x/y.jpg",
          mimeType: "image/jpeg",
        },
        {
          churchId,
          mediaAssetId: "33333333-3333-4333-8333-333333333333",
          visibility: VISIBILITY.PUBLIC,
          mediaStatus: "archived",
          storageKey: "old.jpg",
          mimeType: "image/jpeg",
        },
        {
          churchId,
          mediaAssetId: "44444444-4444-4444-8444-444444444444",
          visibility: VISIBILITY.PRIVATE,
          mediaStatus: "active",
          mimeType: "application/pdf",
          originalFilename: "note.pdf",
        },
      ],
      churchId,
      { NODE_ENV: "test" }
    );
    assert.equal(rows.length, 2);
    const image = rows.find((row) => row.mimeType === "image/jpeg");
    assert.ok(image);
    assert.equal(image.originalFilename, "ok.jpg");
    assert.equal(image.imageUrl, `/_bb/media/${assetId}`);
    assert.equal(image.imageSource, "public_attachment");
    const pdf = rows.find((row) => row.mimeType === "application/pdf");
    assert.equal(pdf.imageUrl, null);
    assert.equal(pdf.imageSource, null);
  });

  it("public announcement routes exist for tenant and path-mode visitors", () => {
    const pub = read("src/blessboard/http/announcementPublicRoutes.js");
    const pathPub = read("src/blessboard/http/pathPublicChurchActionRoutes.js");
    assert.match(pub, /router\.get\("\/announcements\/:id"/);
    assert.match(pathPub, /\/c\/:organizationKey\/announcements\/:id/);
  });

  it("church-wide public query includes branch announcements; other churches stay excluded", () => {
    const repo = read("src/blessboard/repositories/announcementsRepository.js");
    const pub = repo.slice(repo.indexOf("async function listPublicWebsiteAnnouncements"));
    assert.match(pub, /Church-wide public site includes every branch/);
    assert.match(pub, /a\.church_id = \$1/);
    assert.match(pub, /audience_key = 'public'/);
    assert.doesNotMatch(pub.split("const branchClause")[1].slice(0, 400), /: "a\.branch_id IS NULL"/);
    const detail = read("src/blessboard/services/announcementsService.js");
    assert.match(detail, /Selected branch site: church-wide rows stay visible/);
    assert.match(detail, /mediaAssetVisibleOnPublicAnnouncement/);
    const media = read("src/blessboard/http/publicMediaRoutes.js");
    assert.match(media, /mediaAssetVisibleOnPublicAnnouncement/);
    assert.match(media, /loaded\.reason === "private"/);
  });

  it("draft announcements are not auto-promoted to published on classic create POST", () => {
    const src = read("src/blessboard/http/announcementAdminRoutes.js");
    assert.match(src, /status: body\.status \|\| "draft"/);
    assert.match(src, /enforcePublishConfirm|confirm_publish|confirmPublish/);
  });
});
