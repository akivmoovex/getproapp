"use strict";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");

const { createClinicalOrder, RESULT } = require(
  "../../../src/activeclinic/services/activeClinicClinicalService"
);
const {
  prescriptionDosageInstructions,
  positiveDispenseQuantity,
} = require("../../../src/activeclinic/services/clinicalOperationsRules");
const { dispensePrescription, RESULT: PHARMACY } = require(
  "../../../src/activeclinic/services/activeClinicPharmacyService"
);

function throwingDb() {
  return { async query() { throw new Error("db_not_allowed"); } };
}

describe("G04 pharmacy and billing contracts", () => {
  it("requires the entered dose fields and does not invent a quantity", async () => {
    const dosage = prescriptionDosageInstructions({
      drug_name: "Amoxicillin",
      dose: "500mg",
      route: "Oral",
      frequency: "twice daily",
      duration: "7 days",
    });
    assert.match(dosage, /Dose: 500mg/);
    assert.match(dosage, /Route: Oral/);
    assert.equal(dosage.includes("ZMW"), false);
    assert.equal(positiveDispenseQuantity("14 tablets"), null);
    assert.equal(positiveDispenseQuantity(14), 14);
    const rejected = await createClinicalOrder(throwingDb(), {
      orderType: "prescription",
      orderDetails: { drug_name: "Amoxicillin" },
    });
    assert.equal(rejected.code, RESULT.INVALID_INPUT);
  });

  it("denies dispensing before a query when the actor is missing", async () => {
    const pool = { async connect() { throw new Error("db_not_allowed"); } };
    const denied = await dispensePrescription(pool, {
      organizationId: "org",
      prescriptionId: "rx",
      itemDispenses: [{ prescriptionItemId: "item", quantityToDispense: 1 }],
    });
    assert.equal(denied.result, PHARMACY.INVALID_INPUT);
  });
});
