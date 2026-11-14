"use strict";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "../../..");

function read(rel) {
  return fs.readFileSync(path.join(root, rel), "utf8");
}

describe("D40 clinical foundation contract", () => {
  it("scopes open encounters, notes, triage, and queue allocation by organization", () => {
    const clinical = read("src/activeclinic/services/activeClinicClinicalService.js");
    const list = clinical.slice(clinical.indexOf("List open encounters"), clinical.indexOf("Get encounter by ID"));
    assert.match(list, /e\.organization_id = \$2/);
    assert.match(clinical, /consultation_notes\s+WHERE id = \$1 AND organization_id = \$2/);
    assert.match(clinical, /triage_assessments\s+WHERE encounter_id = \$1 AND organization_id = \$2/);
    assert.equal(clinical.includes("INSERT INTO activeclinic.consultation_note_amendments"), false);
    const start = clinical.indexOf('actionKey: "activeclinic.encounter.started"');
    assert.doesNotMatch(clinical.slice(start, start + 400), /purpose/);
    assert.equal(/systolic\s*[<>]/.test(clinical), false);
    const queue = read("src/activeclinic/repositories/receptionRepository.js");
    assert.match(queue, /service_points[\s\S]{0,120}organization_id = \$2/);
  });

  it("keeps BlessBoard source free of clinical patient tables", () => {
    const dir = path.join(root, "src/blessboard");
    const hits = [];
    function walk(current) {
      for (const name of fs.readdirSync(current)) {
        if (name.includes(" 2.")) continue;
        const full = path.join(current, name);
        if (fs.statSync(full).isDirectory()) walk(full);
        else if (name.endsWith(".js") && fs.readFileSync(full, "utf8").includes("activeclinic.patients")) {
          hits.push(full);
        }
      }
    }
    walk(dir);
    assert.deepEqual(hits, []);
  });
});
