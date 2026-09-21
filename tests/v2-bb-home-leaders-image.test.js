"use strict";

const fs = require("fs");
const path = require("path");
const assert = require("node:assert/strict");
const { describe, it } = require("node:test");
const ejs = require("ejs");

const ROOT = path.join(__dirname, "..");
const cardPath = path.join(ROOT, "views/blessboard/v5/public/partials/leader-card.ejs");

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), "utf8");
}

describe("v2 BlessBoard homepage pastor image editing", () => {
  it("home Pastors and Leaders reuses shared leader-card (homepage + Leadership)", () => {
    const home = read("views/blessboard/v5/public/home.ejs");
    assert.match(home, /data-bb-home-leader-cards="1"/);
    assert.match(home, /partials\/leader-card/);
  });

  it("leader-card exposes Edit image on media with independent entity keys", () => {
    const card = read("views/blessboard/v5/public/partials/leader-card.ejs");
    assert.match(card, /entity-image-edit-trigger/);
    assert.match(card, /editKind:\s*'leader'/);
    assert.match(card, /data-bb-leader-image="1"/);
    assert.match(card, /bb-tp-edit-media-wrap/);
    assert.match(card, /editButtonText:\s*'Edit details'/);
  });

  it("structured editor hydrates upload/library URLs from media.publicSrc (shared CDN DTO)", () => {
    const js = read("public/blessboard/v5/website-structured-edit.js");
    assert.match(js, /result\.data\.media \|\| result\.data\.asset/);
    assert.match(js, /media\.publicSrc/);
    assert.match(js, /media\.deliveryPath/);
    assert.match(js, /result\.data\.assets \|\| result\.data\.media/);
    assert.match(js, /a\.deliveryPath \|\| a\.publicSrc \|\| a\.previewUrl/);
    assert.match(js, /buildLeaderForm/);
    assert.match(js, /Upload from computer|Replace image/);
    assert.match(js, /Choose from Content Library/);
  });

  it("leadership soft-fill sibling seeding remains for Bug 06 safety", () => {
    const apply = read("src/blessboard/services/websiteDraftApplyService.js");
    const soft = read("src/blessboard/services/websiteSoftFillCollectionService.js");
    assert.match(apply, /isSoftFillEntityKey\("leader"/);
    assert.match(soft, /ensureSoftFillSiblingDrafts/);
    assert.match(soft, /idPrefix:\s*"demo-leader-"/);
  });

  it("renders independent Edit image for first, middle and last homepage pastors", async () => {
    const leaders = [
      {
        id: "demo-leader-senior",
        displayName: "Pastor One (template example)",
        roleTitle: "Senior Pastor",
        biography: "Bio one",
        imageUrl: "/media/demo/l1.jpg",
      },
      {
        id: "demo-leader-associate",
        displayName: "Pastor Two (template example)",
        roleTitle: "Associate Pastor",
        biography: "Bio two",
        imageUrl: "/media/demo/l2.jpg",
      },
      {
        id: "demo-leader-ministries",
        displayName: "Pastor Three (template example)",
        roleTitle: "Director",
        biography: "Bio three",
        imageUrl: "/media/demo/l3.jpg",
      },
    ];
    const parts = [];
    for (const leader of leaders) {
      parts.push(
        await ejs.renderFile(
          cardPath,
          { leader, featured: false, bioMax: 120, websiteAdmin: { editingMode: true } },
          { filename: cardPath, views: [path.join(ROOT, "views")] }
        )
      );
    }
    const html = parts.join("\n");
    assert.equal((html.match(/aria-label="Edit image"/g) || []).length, 3);
    assert.equal((html.match(/data-bb-kind="leader"/g) || []).length, 6);
    assert.match(html, /data-bb-entity="demo-leader-senior"/);
    assert.match(html, /data-bb-entity="demo-leader-associate"/);
    assert.match(html, /data-bb-entity="demo-leader-ministries"/);
    assert.match(html, /data-bb-dialog-title="Edit image"/);
    assert.match(html, /data-bb-leader-image="1"/);

    const publicCard = await ejs.renderFile(
      cardPath,
      {
        leader: leaders[0],
        featured: false,
        bioMax: 120,
        websiteAdmin: { editingMode: false },
      },
      { filename: cardPath, views: [path.join(ROOT, "views")] }
    );
    assert.doesNotMatch(publicCard, /data-bb-structured-open/);
    assert.doesNotMatch(publicCard, /aria-label="Edit image"/);
  });
});
