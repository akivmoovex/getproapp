"use strict";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");

describe("G300 clinical print identity", () => {
  it("binds SOAP and referral print regions to patient identity and documented complaint", () => {
    const template = fs.readFileSync(
      path.join(__dirname, "../../../views/activeclinic/app/consultation-workspace-content.ejs"),
      "utf8"
    );
    assert.match(template, /data-ac-print-region="soap"/);
    assert.match(template, /data-ac-print-patient-number="1"/);
    assert.match(template, /data-ac-print-chief-complaint="1"/);
    assert.match(template, /data-ac-print-region="referral"/);
    assert.match(template, /data-ac-print="soap"/);
    assert.match(template, /data-ac-print="referral"/);
  });

  it("keeps prescription and patient-card print markers without inventing signed diagnoses", () => {
    const rx = fs.readFileSync(
      path.join(__dirname, "../../../views/activeclinic/app/pharmacy-prescription-detail-content.ejs"),
      "utf8"
    );
    const card = fs.readFileSync(
      path.join(__dirname, "../../../views/activeclinic/app/patient-print-card-content.ejs"),
      "utf8"
    );
    assert.match(rx, /data-ac-print-region="prescription"/);
    assert.match(card, /data-ac-print-patient-name="1"/);
    assert.equal(/ICD-10 auto|invented diagnosis/i.test(rx + card), false);
  });
});
