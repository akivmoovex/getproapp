"use strict";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");

const { createClinicalOrder, RESULT } = require(
  "../../../src/activeclinic/services/activeClinicClinicalService"
);
const { acknowledgeCriticalResult, RESULT: LAB } = require(
  "../../../src/activeclinic/services/activeClinicDiagnosticsService"
);
const {
  isStoredOrderType,
  isStoredOrderStatus,
  canAttachLaboratoryResult,
} = require("../../../src/activeclinic/services/clinicalOperationsRules");

function throwingDb() {
  return { async query() { throw new Error("db_not_allowed"); } };
}

describe("D41 clinical operations", () => {
  it("rejects an order type outside the stored check before a query", async () => {
    const result = await createClinicalOrder(throwingDb(), { orderType: "infusion" });
    assert.equal(result.code, RESULT.INVALID_INPUT);
    assert.equal(isStoredOrderType("laboratory"), true);
    assert.equal(isStoredOrderType("prescription"), true);
    assert.equal(isStoredOrderStatus("submitted"), true);
    assert.equal(isStoredOrderStatus("ACKNOWLEDGED"), false);
  });

  it("does not attach a laboratory result to a cancelled or released request", () => {
    assert.equal(canAttachLaboratoryResult("processing"), true);
    assert.equal(canAttachLaboratoryResult("cancelled"), false);
    assert.equal(canAttachLaboratoryResult("rejected"), false);
    assert.equal(canAttachLaboratoryResult("released"), false);
  });

  it("rejects an acknowledgement with no linked result before opening a connection", async () => {
    const result = await acknowledgeCriticalResult(
      { connect() { throw new Error("db_not_allowed"); } },
      {
        organizationId: "11111111-1111-4111-8111-111111111111",
        healthcareOrganizationId: "22222222-2222-4222-8222-222222222222",
        recipientName: "Ward nurse",
        notificationMethod: "phone",
      }
    );
    assert.equal(result.ok, false);
    assert.equal(result.code, LAB.INVALID_INPUT);
  });
});
