"use strict";

/**
 * V2.0 BUG 06 — Editing one leadership member must not delete siblings.
 */

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const {
  applyStructuredDraftsToModel,
} = require("../src/blessboard/services/websiteStructuredDraftService");
const {
  softFillItemsForKind,
  isSoftFillEntityKey,
  assertCollectionPreserved,
  ensureSoftFillSiblingDrafts,
} = require("../src/blessboard/services/websiteSoftFillCollectionService");

describe("v2 blessboard leadership collection preservation", () => {
  it("soft-fill entity keys are detected for leadership collections", () => {
    assert.equal(isSoftFillEntityKey("leader", "demo-leader-senior"), true);
    assert.equal(isSoftFillEntityKey("leader", "demo-leader-associate"), true);
    assert.equal(isSoftFillEntityKey("leader", "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee"), false);
    assert.equal(isSoftFillEntityKey("ministry", "demo-ministry-kids"), true);
  });

  it("editing one soft-fill leader keeps all other soft-fill members", () => {
    const soft = softFillItemsForKind("leader", "Test Church");
    assert.ok(soft.length >= 3);
    const model = {
      pageKey: "leadership",
      entities: soft.map((l) => ({ ...l })),
    };
    const before = model.entities.length;
    applyStructuredDraftsToModel(model, [
      {
        draftKind: "leader",
        pageKey: "leadership",
        entityKey: "demo-leader-senior",
        op: "upsert",
        payload: {
          displayName: "Pastor Renamed One",
          roleTitle: "Senior Pastor",
          biography: "Updated",
          imageUrl: soft[0].imageUrl,
          visible: true,
          seniorLeader: true,
          sortOrder: 10,
        },
      },
    ]);
    const check = assertCollectionPreserved(
      soft,
      model.entities,
      "demo-leader-senior",
      "upsert",
      true
    );
    assert.equal(check.ok, true, `before=${check.before} after=${check.after}`);
    assert.equal(model.entities.length, before);
    assert.equal(model.entities[0].displayName, "Pastor Renamed One");
    assert.ok(model.entities.some((e) => e.id === "demo-leader-associate"));
    assert.ok(model.entities.some((e) => e.id === "demo-leader-ministries"));
  });

  it("editing second and third soft-fill leaders independently preserves the set", () => {
    const soft = softFillItemsForKind("leader", "Test Church");
    const model = { pageKey: "leadership", entities: soft.map((l) => ({ ...l })) };
    applyStructuredDraftsToModel(model, [
      {
        draftKind: "leader",
        pageKey: "leadership",
        entityKey: "demo-leader-associate",
        op: "upsert",
        payload: {
          displayName: "Associate Renamed",
          roleTitle: "Associate Pastor",
          biography: "Bio 2",
          visible: true,
          sortOrder: 20,
        },
      },
      {
        draftKind: "leader",
        pageKey: "leadership",
        entityKey: "demo-leader-ministries",
        op: "upsert",
        payload: {
          displayName: "Director Renamed",
          roleTitle: "Director",
          biography: "Bio 3",
          visible: true,
          sortOrder: 30,
        },
      },
    ]);
    assert.equal(model.entities.length, soft.length);
    assert.equal(
      model.entities.find((e) => e.id === "demo-leader-associate").displayName,
      "Associate Renamed"
    );
    assert.equal(
      model.entities.find((e) => e.id === "demo-leader-ministries").displayName,
      "Director Renamed"
    );
    assert.equal(
      model.entities.find((e) => e.id === "demo-leader-senior").displayName,
      soft[0].displayName
    );
  });

  it("real UUID leader upsert updates only that member", () => {
    const leaders = [
      { id: "11111111-1111-4111-8111-111111111111", displayName: "A", roleTitle: "P1", sortOrder: 10 },
      { id: "22222222-2222-4222-8222-222222222222", displayName: "B", roleTitle: "P2", sortOrder: 20 },
      { id: "33333333-3333-4333-8333-333333333333", displayName: "C", roleTitle: "P3", sortOrder: 30 },
    ];
    const model = { pageKey: "leadership", entities: leaders.map((l) => ({ ...l })) };
    applyStructuredDraftsToModel(model, [
      {
        draftKind: "leader",
        pageKey: "leadership",
        entityKey: "22222222-2222-4222-8222-222222222222",
        op: "upsert",
        payload: {
          displayName: "B Edited",
          roleTitle: "P2",
          biography: "x",
          visible: true,
          sortOrder: 20,
        },
      },
    ]);
    assert.equal(model.entities.length, 3);
    assert.equal(model.entities[0].displayName, "A");
    assert.equal(model.entities[1].displayName, "B Edited");
    assert.equal(model.entities[2].displayName, "C");
  });

  it("exports ensureSoftFillSiblingDrafts for empty CMS scopes", () => {
    assert.equal(typeof ensureSoftFillSiblingDrafts, "function");
  });
});
