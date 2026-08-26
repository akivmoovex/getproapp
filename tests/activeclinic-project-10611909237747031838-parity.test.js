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
    assert.match(read("src/activeclinic/http/renderActiveClinicPublic.js"), /v7-proj106-p1/);
    assert.match(read("src/activeclinic/services/buildActiveClinicShellViewModel.js"), /v7-proj106-1/);
    assert.match(read("src/activeclinic/http/renderActiveClinicPatient.js"), /v7-proj106-pt1/);
  });

  it("product differences and duplicates are explicitly classified", () => {
    const matrix = JSON.parse(fs.readFileSync(MATRIX_JSON, "utf8"));
    assert.equal(matrix.summary.productDifferences, 9);
    assert.equal(matrix.summary.duplicates, 7);
    const mf11 = matrix.rows.filter((r) => r.family === "MF11");
    assert.equal(mf11.length, 4);
    mf11.forEach((r) => {
      assert.equal(r.classification, "PRODUCT_DECISION_DIFFERENCE");
    });
    const legacy = matrix.rows.filter((r) => r.family === "AUTH_LEGACY");
    assert.equal(legacy.length, 7);
    legacy.forEach((r) => {
      assert.equal(r.classification, "DUPLICATE_STITCH_VARIANT");
    });
  });
});
