"use strict";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "../../..");

function read(rel) {
  return fs.readFileSync(path.join(root, rel), "utf8");
}

describe("D52 supplementary characterization", () => {
  it("keeps the eight ACX items outside new runtime behavior", () => {
    const consent = read("src/activeclinic/services/activeClinicPatientConsentService.js");
    assert.match(consent, /"treatment"/);
    assert.equal(consent.includes("research_use_of_images"), false);
    assert.equal(consent.includes("representativeId"), false);
    const pharmacy = read("src/activeclinic/services/activeClinicPharmacyService.js");
    assert.equal(/allergy/i.test(pharmacy), false);
    assert.equal(pharmacy.includes("function approveSubstitution"), false);
    for (const rel of [
      "src/activeclinic/services/activeClinicClinicalService.js",
      "src/activeclinic/services/activeClinicBillingService.js",
      "src/activeclinic/services/activeClinicDiagnosticsService.js",
    ]) {
      assert.equal(read(rel).includes("outbox"), false, rel);
    }
    const routes = read("src/activeclinic/http/activeClinicAppRoutes.js");
    assert.equal(routes.includes("/api/v1/"), false);
    const demo = read("src/activeclinic/services/activeClinicDemoClinicSpec.js");
    assert.doesNotMatch(demo, /signingEnabled|rpoHours|rtoMinutes/);
  });
});
