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

describe("v2 BlessBoard homepage pastor text editing", () => {
  it("home Pastors and Leaders wires shared leader-card Edit details", () => {
    const home = read("views/blessboard/v5/public/home.ejs");
    assert.match(home, /data-bb-home-leader-cards="1"/);
    assert.match(home, /partials\/leader-card/);
  });

  it("leader-card exposes visible Edit details for name, title and biography", () => {
    const card = read("views/blessboard/v5/public/partials/leader-card.ejs");
    assert.match(card, /editButtonText:\s*'Edit details'/);
    assert.match(card, /editDialogTitle:\s*'Edit details'/);
    assert.match(card, /editKind:\s*'leader'/);
    assert.match(card, /displayName:\s*_nameClean/);
    assert.match(card, /roleTitle:\s*_roleClean/);
    assert.match(card, /biography:\s*_bioClean/);
    assert.match(card, /data-bb-leader-card="1"/);
    assert.match(card, /data-bb-leader-role="1"/);
    assert.match(card, /data-bb-leader-bio="1"/);
  });

  it("structured edit trigger supports labeled Edit details CTA", () => {
    const trigger = read("views/blessboard/v5/partials/structured-edit-trigger.ejs");
    assert.match(trigger, /editButtonText/);
    assert.match(trigger, /data-bb-edit-details="1"/);
    assert.match(trigger, /bb-tp-structured-edit-cta/);
  });

  it("leadership soft-fill sibling seeding remains for Bug 06 safety", () => {
    const apply = read("src/blessboard/services/websiteDraftApplyService.js");
    const soft = read("src/blessboard/services/websiteSoftFillCollectionService.js");
    assert.match(apply, /isSoftFillEntityKey\("leader"/);
    assert.match(soft, /ensureSoftFillSiblingDrafts/);
    assert.match(soft, /idPrefix:\s*"demo-leader-"/);
  });

  it("renders independent Edit details for first, middle and last homepage pastors", async () => {
    const cardPath = path.join(ROOT, "views/blessboard/v5/public/partials/leader-card.ejs");
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
    assert.equal((html.match(/data-bb-edit-details="1"/g) || []).length, 3);
    assert.equal((html.match(/aria-label="Edit details"/g) || []).length, 3);
    assert.match(html, /data-bb-entity="demo-leader-senior"/);
    assert.match(html, /data-bb-entity="demo-leader-associate"/);
    assert.match(html, /data-bb-entity="demo-leader-ministries"/);
    assert.match(html, /Edit details/);
    assert.match(html, /data-bb-dialog-title="Edit details"/);
    // Public mode has no edit CTA
    const publicCard = await ejs.renderFile(
      cardPath,
      { leader: leaders[0], featured: false, websiteAdmin: { editingMode: false } },
      { filename: cardPath, views: [path.join(ROOT, "views")] }
    );
    assert.doesNotMatch(publicCard, /data-bb-edit-details/);
  });
});
