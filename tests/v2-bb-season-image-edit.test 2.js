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

describe("v2 BlessBoard This Season event image editing", () => {
  it("home events section wires Edit image to authoritative event records", () => {
    const home = read("views/blessboard/v5/public/home.ejs");
    assert.match(home, /data-bb-home-event-cards="1"/);
    assert.match(home, /entity-image-edit-trigger/);
    assert.match(home, /editKind:\s*'event'/);
    assert.match(home, /data-bb-event-id=/);
    assert.match(home, /data-bb-event-image="1"/);
  });

  it("shared entity-image-edit-trigger reuses structured picker dialog title", () => {
    const trigger = read("views/blessboard/v5/partials/entity-image-edit-trigger.ejs");
    assert.match(trigger, /structured-edit-trigger/);
    assert.match(trigger, /editLabel:\s*'Edit image'/);
    assert.match(trigger, /editDialogTitle:\s*'Edit image'/);
  });

  it("event soft-fill apply seeds siblings so one image edit cannot drop others", () => {
    const src = read("src/blessboard/services/websiteDraftApplyService.js");
    assert.match(src, /isSoftFillEntityKey\("event"/);
    assert.match(src, /softFillItemsForKind\("event"/);
    assert.match(src, /SOFT_FILL_COLLECTIONS\.event/);
  });

  it("structured event form includes Upload / Content Library / Replace labels", () => {
    const js = read("public/blessboard/v5/website-structured-edit.js");
    assert.match(js, /buildEventForm/);
    assert.match(js, /Upload from computer|Replace image/);
    assert.match(js, /Choose from Content Library/);
    assert.match(js, /buildImageForm\(\{ imageUrl: p\.imageUrl/);
  });

  it("renders independent Edit image triggers for two season event cards", async () => {
    const homePath = path.join(ROOT, "views/blessboard/v5/public/home.ejs");
    // Render only the event cards fragment via a tiny harness using the same include path.
    const cardTpl = `<% teasers.events.slice(0, 2).forEach(function (event) {
  var _eventKey = String(event.id || ('event-' + (event.title || 'item')));
  var _eventTitleClean = String(event.title || '').replace(/\\s*\\(template example\\)\\s*$/i, '').trim();
%>
<article data-bb-event-card="1" data-bb-event-id="<%= _eventKey %>">
  <div class="bb-tp-edit-media-wrap">
    <%- include('../partials/entity-image-edit-trigger', {
      editKind: 'event',
      editEntityKey: _eventKey,
      editPayload: {
        title: _eventTitleClean,
        summary: event.summary,
        imageUrl: event.imageUrl || '',
        visible: true
      }
    }) %>
  </div>
</article>
<% }) %>`;
    const html = await ejs.render(
      cardTpl,
      {
        websiteAdmin: { editingMode: true },
        teasers: {
          events: [
            {
              id: "demo-event-1",
              title: "Leaders Equipping Weekend (template example)",
              summary: "One",
              imageUrl: "/media/demo/event-1.jpg",
            },
            {
              id: "demo-event-2",
              title: "Sunday Morning Connection (template example)",
              summary: "Two",
              imageUrl: "/media/demo/event-2.jpg",
            },
          ],
        },
      },
      {
        filename: path.join(ROOT, "views/blessboard/v5/public/_season-test.ejs"),
        views: [path.join(ROOT, "views")],
      }
    );
    assert.equal((html.match(/aria-label="Edit image"/g) || []).length, 2);
    assert.match(html, /data-bb-entity="demo-event-1"/);
    assert.match(html, /data-bb-entity="demo-event-2"/);
    assert.match(html, /data-bb-kind="event"/);
    assert.match(html, /data-bb-dialog-title="Edit image"/);
  });
});
