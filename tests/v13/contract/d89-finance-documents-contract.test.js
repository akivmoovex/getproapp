"use strict";

const fs = require("fs");
const path = require("path");
const { describe, it } = require("node:test");
const assert = require("node:assert/strict");

const root = path.join(__dirname, "../../..");

function read(rel) {
  return fs.readFileSync(path.join(root, rel), "utf8");
}

describe("D89 finance, document, and consent contracts", () => {
  it("keeps payment reversal and document scope on the current contract", () => {
    const billing = read("src/activeclinic/services/activeClinicBillingService.js");
    const documents = read("src/activeclinic/services/activeClinicClinicalDocumentService.js");
    const repo = read("src/activeclinic/repositories/clinicalDocumentRepository.js");
    assert.match(billing, /PAYMENT_REVERSE: "activeclinic.payment.reverse"/);
    assert.match(billing, /duplicate_submission/);
    assert.match(billing, /already_reversed/);
    assert.equal(billing.includes("activeclinic.payment.reverse.facility"), false);
    assert.match(documents, /clinical_attachment/);
    assert.equal(documents.includes("sha256"), false);
    assert.equal(documents.includes("mergePatient"), false);
    assert.match(repo, /facility_id = \$9/);
    assert.match(repo, /facility_id = \$5/);
  });

  it("keeps withdrawal bound to the patient and the granted row", () => {
    const consent = read("src/activeclinic/services/activeClinicPatientConsentService.js");
    assert.match(consent, /patient_id = \$6/);
    assert.match(consent, /status = 'granted'/);
    assert.match(consent, /"treatment"/);
    assert.match(consent, /"data_processing"/);
    assert.equal(consent.includes("research_use_of_images"), false);
    assert.equal(consent.includes("representative_id"), false);
    assert.equal(consent.includes("DELETE FROM"), false);
    assert.equal(consent.includes("legal_hold"), false);
  });
});
