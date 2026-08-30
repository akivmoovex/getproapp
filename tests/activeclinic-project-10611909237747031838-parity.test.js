"use strict";

/**
 * Project 10611909237747031838 parity matrix contract tests.
 */

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const MATRIX_JSON = path.join(
  ROOT,
  "docs/activeclinic/stitch/PROJECT_10611909237747031838_PARITY_MATRIX.json"
);
const LIVE_JSON = path.join(
  ROOT,
  "docs/activeclinic/stitch/_project_10611909237747031838_live_inventory.json"
);

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), "utf8");
}

describe("project 10611909237747031838 parity matrix", () => {
  it("live inventory and matrix account for every current screen", () => {
    const live = JSON.parse(fs.readFileSync(LIVE_JSON, "utf8"));
    const matrix = JSON.parse(fs.readFileSync(MATRIX_JSON, "utf8"));
    assert.equal(live.screens.length, 108);
    assert.equal(matrix.rows.length, 108);
    assert.equal(matrix.summary.currentStitchTotal, 108);
    assert.equal(matrix.summary.actualNotImplemented, 0);
    assert.equal(matrix.summary.screensBelow95, 0);
    assert.equal(matrix.summary.screens95Plus, matrix.summary.canonicalApplicable);
  });

  it("asset versions reflect project 106 closure bump", () => {
    assert.match(read("src/activeclinic/http/renderActiveClinicPublic.js"), /v7-proj106-p5/);
    assert.match(read("src/activeclinic/services/buildActiveClinicShellViewModel.js"), /v7-proj106-2/);
    assert.match(read("src/activeclinic/http/renderActiveClinicPatient.js"), /v7-proj106-pt1/);
  });

  it("primary accounting is non-overlapping and sums to 108", () => {
    const matrix = JSON.parse(fs.readFileSync(MATRIX_JSON, "utf8"));
    const p = matrix.summary.primaryAccounting;
    assert.ok(p);
    assert.equal(p.canonicalApplicable, 92);
    assert.equal(p.productDifference, 9);
    assert.equal(p.duplicate, 7);
    assert.equal(p.naReference, 0);
    assert.equal(p.total, 108);
    assert.equal(
      p.canonicalApplicable + p.productDifference + p.duplicate + p.naReference,
      108
    );
    assert.equal(matrix.summary.naReference, 0);
  });

  it("closure baseline document is locked", () => {
    const closure = read("docs/activeclinic/stitch/PROJECT_10611909237747031838_CLOSURE.md");
    assert.match(closure, /BASELINE_LOCKED/);
    assert.match(closure, /\*\*CANONICAL_APPLICABLE\*\* \| 92/);
    assert.match(closure, /\*\*N_A_REFERENCE\*\* \| 0/);
  });
});
