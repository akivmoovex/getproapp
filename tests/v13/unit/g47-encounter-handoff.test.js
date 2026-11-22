"use strict";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const {
  selectEncounterHandoffLinks,
} = require("../../../src/activeclinic/services/encounterHandoffLinks");

describe("encounter department handoff", () => {
  it("shows a department only when that permission was granted", () => {
    const links = selectEncounterHandoffLinks([
      "activeclinic.reception.view",
      "activeclinic.diagnostics.view",
    ]);
    assert.equal(links.reception, "/app/reception");
    assert.equal(links.laboratory, "/app/diagnostics/laboratory/queue");
    assert.equal(links.pharmacy, undefined);
    assert.equal(links.billing, undefined);
  });

  it("accepts the laboratory permission on its own", () => {
    const links = selectEncounterHandoffLinks(["activeclinic.lab.view"]);
    assert.equal(links.laboratory, "/app/diagnostics/laboratory/queue");
    assert.equal(Object.keys(links).length, 1);
  });

  it("hides every department when no permission was granted", () => {
    assert.deepEqual(selectEncounterHandoffLinks([]), {});
    assert.deepEqual(selectEncounterHandoffLinks(null), {});
  });

  it("renders those links only from the granted fields", () => {
    const view = fs.readFileSync(
      path.join(
        __dirname,
        "../../../views/activeclinic/app/consultation-workspace-content.ejs"
      ),
      "utf8"
    );
    assert.match(view, /if \(links\.reception\)/);
    assert.match(view, /if \(links\.laboratory\)/);
    assert.match(view, /if \(links\.pharmacy\)/);
    assert.match(view, /if \(links\.billing\)/);
    assert.match(view, /data-ac-action="reception"/);
  });
});
