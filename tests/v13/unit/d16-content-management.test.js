"use strict";

/**
 * D16 — BlessBoard sermon, event, and announcement contracts.
 * Database-free. Does not upload media or publish a website.
 */

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");

const { normalizePostedAnnouncementStatus } = require("../../../src/blessboard/services/announcementsService");
const { overlayPublishedEntities } = require("../../../src/blessboard/services/websitePublishedSnapshotRead");
const { buildEventFields, buildSermonFields } = require("../../../src/blessboard/services/publicContentAdminService");

const ROOT = path.join(__dirname, "../../..");
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), "utf8");

describe("D16 BlessBoard content", () => {
  it("creates a new sermon and event without replacing the seeded item", () => {
    const editor = read("public/blessboard/v5/website-structured-edit.js");
    assert.match(editor, /openBtn\.setAttribute\("data-bb-entity", newKeyPrefix\)/);
    assert.match(read("views/blessboard/v5/public/sermons.ejs"), /status === 'published'/);
    assert.match(read("views/blessboard/v5/public/events.ejs"), /status === 'published'/);
    assert.match(
      read("views/blessboard/v5/content-admin/entity-fields.ejs"),
      /<textarea id="<%= mode %>_summary" name="summary"/
    );

    const seeded = { id: "11111111-1111-4111-8111-111111111111", title: "Seeded sermon", status: "published" };
    const created = { id: "22222222-2222-4222-8222-222222222222", title: "New sermon", status: "published" };
    const draft = { id: "33333333-3333-4333-8333-333333333333", title: "Draft sermon", status: "draft" };
    const merged = overlayPublishedEntities("sermons", [seeded, created, draft], {
      entities: { sermons: [seeded] },
    });
    assert.deepEqual(
      merged.items.map((item) => item.title),
      ["Seeded sermon", "New sermon"]
    );

    const event = buildEventFields(
      {
        title: "Choir rehearsal",
        summary: "Draft gathering",
        startsAt: "2026-12-01T09:00",
        endsAt: "2026-12-01T11:00",
        timezone: "Africa/Lusaka",
        location: "Main hall",
        status: "draft",
      },
      { partial: false }
    );
    assert.equal(event.ok, true);
    assert.equal(event.fields.status, "draft");
    assert.equal(event.fields.summary, "Draft gathering");

    const sermon = buildSermonFields(
      {
        title: "Living Hope",
        speakerName: "D05 Speaker",
        preachedAt: "2026-07-18",
        status: "published",
      },
      { partial: false }
    );
    assert.equal(sermon.ok, true);
    assert.equal(sermon.fields.title, "Living Hope");
    assert.equal(sermon.fields.status, "published");
  });

  it("publishes the clicked announcement status and keeps the attachment name public", () => {
    assert.equal(normalizePostedAnnouncementStatus(["draft", "published"]), "published");
    assert.equal(normalizePostedAnnouncementStatus(["timed", "draft"]), "scheduled");
    assert.equal(normalizePostedAnnouncementStatus("draft"), "draft");
    assert.equal(normalizePostedAnnouncementStatus("nope"), "nope");

    const form = read("views/blessboard/v5/announcements/admin-form.ejs");
    const list = read("views/blessboard/v5/public/announcements.ejs");
    const detail = read("views/blessboard/v5/public/announcement-detail.ejs");
    const routes = read("src/blessboard/http/announcementAdminRoutes.js");
    assert.match(form, /data-gp-we-media-file/);
    assert.match(form, /data-gp-we-media-status/);
    assert.match(form, /name="audience_public"/);
    assert.match(list, /attachment\.originalFilename/);
    assert.match(detail, /attachment\.originalFilename/);
    assert.match(detail, /attachment\.mediaAssetId/);
    assert.match(routes, /normalizePostedAnnouncementStatus\(body\.status\)/);
    assert.match(routes, /\/media\/upload/);
    assert.match(read("src/blessboard/http/publicMediaRoutes.js"), /mediaAssetVisibleOnPublicAnnouncement/);
  });
});
