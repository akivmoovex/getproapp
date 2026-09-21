"use strict";

const fs = require("fs");
const path = require("path");
const assert = require("node:assert/strict");
const { describe, it } = require("node:test");
const ejs = require("ejs");

const ROOT = path.join(__dirname, "..");
const contentCardPath = path.join(
  ROOT,
  "views/blessboard/v5/public/partials/content-card.ejs"
);

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), "utf8");
}

async function renderCard(locals) {
  return ejs.renderFile(contentCardPath, locals, {
    filename: contentCardPath,
    views: [path.join(ROOT, "views")],
  });
}

describe("v2 BlessBoard home ministry image editing", () => {
  it("home ministries pass cardMinistry into content-card", () => {
    const home = read("views/blessboard/v5/public/home.ejs");
    assert.match(home, /data-bb-home-ministry-cards="1"/);
    assert.match(home, /cardMinistry:\s*m/);
  });

  it("ministries page media exposes Edit image with distinct entity keys", () => {
    const src = read("views/blessboard/v5/public/ministries.ejs");
    assert.match(src, /editLabel:\s*'Edit image'/);
    assert.match(src, /editDialogTitle:\s*'Edit image'/);
    assert.match(src, /data-bb-ministry-image="1"/);
    assert.match(src, /bb-tp-edit-media-wrap/);
  });

  it("structured editor honors dialog title override and shared picker labels", () => {
    const js = read("public/blessboard/v5/website-structured-edit.js");
    assert.match(js, /data-bb-dialog-title/);
    assert.match(js, /cfg\.dialogTitle/);
    assert.match(js, /Upload from computer|Replace image/);
    assert.match(js, /Choose from Content Library/);
    assert.match(js, /buildMinistryForm/);
  });

  it("ministry soft-fill apply seeds siblings so one image edit cannot drop others", () => {
    const src = read("src/blessboard/services/websiteDraftApplyService.js");
    assert.match(src, /isSoftFillEntityKey\("ministry"/);
    assert.match(src, /softFillItemsForKind\("ministry"/);
    assert.match(src, /SOFT_FILL_COLLECTIONS\.ministry/);
  });

  it("renders Edit image once per ministry with independent entity keys", async () => {
    const ministries = [
      {
        id: "demo-ministry-kids",
        name: "Children’s Ministry (template example)",
        summary: "Kids",
        imageUrl: "/church/images/homepage/mobile-ministry-children.jpg",
      },
      {
        id: "demo-ministry-youth",
        name: "Youth Ministry (template example)",
        summary: "Youth",
        imageUrl: "/church/images/homepage/mobile-ministry-youth.jpg",
      },
      {
        id: "demo-ministry-women",
        name: "Women’s Fellowship (template example)",
        summary: "Women",
        imageUrl: "/church/images/homepage/mobile-ministry-worship.jpg",
      },
    ];
    const websiteAdmin = { editingMode: true };
    const htmlParts = [];
    for (const m of ministries) {
      htmlParts.push(
        await renderCard({
          websiteAdmin,
          cardTitle: m.name,
          cardSummary: m.summary,
          cardImage: m.imageUrl,
          cardImageAlt: m.name,
          cardHref: "/ministries",
          cardCta: `Explore ${m.name}`,
          cardIcon: "groups",
          cardMinistry: m,
        })
      );
    }
    const html = htmlParts.join("\n");
    assert.equal((html.match(/aria-label="Edit image"/g) || []).length, 3);
    assert.equal((html.match(/data-bb-kind="ministry"/g) || []).length, 3);
    assert.match(html, /data-bb-entity="demo-ministry-kids"/);
    assert.match(html, /data-bb-entity="demo-ministry-youth"/);
    assert.match(html, /data-bb-entity="demo-ministry-women"/);
    assert.match(html, /data-bb-dialog-title="Edit image"/);
    assert.match(html, /Upload from computer|Replace image|imageUrl/);
    // Public (non-editing) cards stay plain anchors without pencils.
    const publicCard = await renderCard({
      websiteAdmin: { editingMode: false },
      cardTitle: ministries[0].name,
      cardSummary: ministries[0].summary,
      cardImage: ministries[0].imageUrl,
      cardHref: "/ministries",
      cardCta: "Explore",
      cardMinistry: ministries[0],
    });
    assert.doesNotMatch(publicCard, /data-bb-structured-open/);
    assert.match(publicCard, /<a[\s\S]*bb-tp-content-card/);
  });
});
