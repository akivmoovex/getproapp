"use strict";

/**
 * V2.0 BUG 07 — Leadership is collection-managed; Add section must not offer empty types.
 */

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const {
  listAddableSectionTypes,
  describeAddSectionAvailability,
  BLESSBOARD_COLLECTION_PAGES,
} = require("../src/platform/website/sectionRegistry");
const { PRODUCT_CODE } = require("../src/platform/website/publicWebsiteUrl");
const {
  applyStructuredDraftsToModel,
} = require("../src/blessboard/services/websiteStructuredDraftService");

function read(rel) {
  return fs.readFileSync(path.join(__dirname, "..", rel), "utf8");
}

describe("v2 blessboard leadership section management", () => {
  it("leadership has no addable freeform section types", () => {
    const types = listAddableSectionTypes(PRODUCT_CODE.BLESSBOARD, "leadership", []);
    assert.deepEqual(types, []);
  });

  it("describeAddSectionAvailability marks leadership as collection-managed", () => {
    const avail = describeAddSectionAvailability(PRODUCT_CODE.BLESSBOARD, "leadership", []);
    assert.equal(avail.canAddSection, false);
    assert.equal(avail.collectionManaged, true);
    assert.equal(avail.memberAction, "Add leadership member");
    assert.match(avail.emptyHint, /Add leadership member/i);
    assert.ok(BLESSBOARD_COLLECTION_PAGES.leadership);
  });

  it("ministries/events/sermons follow the same collection-managed rule", () => {
    for (const page of ["ministries", "events", "sermons"]) {
      const avail = describeAddSectionAvailability(PRODUCT_CODE.BLESSBOARD, page, []);
      assert.equal(avail.canAddSection, false, page);
      assert.equal(avail.collectionManaged, true, page);
      assert.ok(avail.memberAction || avail.emptyHint, page);
    }
  });

  it("home still exposes addable section types when empty", () => {
    const avail = describeAddSectionAvailability(PRODUCT_CODE.BLESSBOARD, "home", []);
    assert.equal(avail.canAddSection, true);
    assert.ok(avail.sections.length > 0);
  });

  it("editor chrome and picker hide Add section when unavailable", () => {
    const chrome = read("views/platform/website-engine/editor-chrome.ejs");
    const picker = read("views/platform/website-engine/add-section-picker.ejs");
    const attach = read("src/blessboard/http/attachWebsiteAdminChrome.js");
    const js = read("public/platform/website-add-section.js");
    assert.match(chrome, /data-website-can-add-section/);
    assert.match(picker, /var canAddSection = shell\.canAddSection !== false && Boolean\(shell\.addSectionUrl\)/);
    assert.match(picker, /<% if \(canAddSection\) \{ %>/);
    assert.match(attach, /addSectionUrl: addSectionAvailability\.canAddSection \? addSectionUrl : null/);
    assert.match(js, /data-website-can-add-section/);
    assert.match(js, /openBtn\.hidden = true/);
  });

  it("leadership page exposes Add leadership member CTA (not Add section)", () => {
    const page = read("views/blessboard/v5/public/leadership.ejs");
    assert.match(page, /data-bb-leadership-add-member/);
    assert.match(page, /Add leadership member/);
    assert.match(page, /editEntityKey:\s*'new-leader'/);
    assert.match(page, /new-leader-.*Date\.now/);
    assert.match(page, /Does not replace existing members/);
  });

  it("structured editor mints unique keys for exact new-leader template only", () => {
    const js = read("public/blessboard/v5/website-structured-edit.js");
    assert.match(js, /new-leader/);
    assert.match(js, /entityKey === newKeyPrefix/);
  });

  it("adding two independent leadership members preserves existing set", () => {
    const model = {
      pageKey: "leadership",
      entities: [
        {
          id: "demo-leader-senior",
          displayName: "Senior",
          roleTitle: "Pastor",
          visible: true,
          sortOrder: 10,
        },
        {
          id: "demo-leader-associate",
          displayName: "Associate",
          roleTitle: "Pastor",
          visible: true,
          sortOrder: 20,
        },
      ],
    };
    applyStructuredDraftsToModel(model, [
      {
        draftKind: "leader",
        pageKey: "leadership",
        entityKey: "new-leader-aaa",
        op: "upsert",
        payload: {
          displayName: "New One",
          roleTitle: "Elder",
          biography: "Bio 1",
          visible: true,
          sortOrder: 100,
        },
      },
      {
        draftKind: "leader",
        pageKey: "leadership",
        entityKey: "new-leader-bbb",
        op: "upsert",
        payload: {
          displayName: "New Two",
          roleTitle: "Deacon",
          biography: "Bio 2",
          visible: true,
          sortOrder: 110,
        },
      },
    ]);
    assert.equal(model.entities.length, 4);
    assert.ok(model.entities.some((e) => e.id === "demo-leader-senior"));
    assert.ok(model.entities.some((e) => e.id === "demo-leader-associate"));
    assert.ok(model.entities.some((e) => e.displayName === "New One"));
    assert.ok(model.entities.some((e) => e.displayName === "New Two"));
  });

  it("reusing the same new-leader key would overwrite — unique keys required", () => {
    const model = {
      pageKey: "leadership",
      entities: [
        {
          id: "demo-leader-senior",
          displayName: "Senior",
          roleTitle: "Pastor",
          visible: true,
          sortOrder: 10,
        },
      ],
    };
    applyStructuredDraftsToModel(model, [
      {
        draftKind: "leader",
        pageKey: "leadership",
        entityKey: "new-leader",
        op: "upsert",
        payload: { displayName: "First", roleTitle: "A", visible: true, sortOrder: 100 },
      },
      {
        draftKind: "leader",
        pageKey: "leadership",
        entityKey: "new-leader",
        op: "upsert",
        payload: { displayName: "Second", roleTitle: "B", visible: true, sortOrder: 110 },
      },
    ]);
    assert.equal(model.entities.length, 2);
    assert.equal(
      model.entities.filter((e) => String(e.id) === "new-leader").length,
      1
    );
    assert.equal(
      model.entities.find((e) => String(e.id) === "new-leader").displayName,
      "Second"
    );
  });
});
