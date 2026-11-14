"use strict";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");

const {
  acknowledgeCriticalResult,
  RESULT: LAB,
} = require("../../../src/activeclinic/services/activeClinicDiagnosticsService");
const {
  dispensePrescription,
  RESULT: PHARMACY,
} = require("../../../src/activeclinic/services/activeClinicPharmacyService");

function closedPool() {
  return {
    connect() {
      throw new Error("db_not_allowed");
    },
  };
}

describe("D33 clinical operations", () => {
  it("LAB-01-03 rejects an acknowledgement with no recipient before opening a connection", async () => {
    const result = await acknowledgeCriticalResult(closedPool(), {
      organizationId: "11111111-1111-4111-8111-111111111111",
      healthcareOrganizationId: "22222222-2222-4222-8222-222222222222",
      resultId: "33333333-3333-4333-8333-333333333333",
      recipientName: "",
      notificationMethod: "",
    });
    assert.equal(result.ok, false);
    assert.equal(result.code, LAB.INVALID_INPUT);
  });

  it("RX-01-01 rejects an empty dispense before a permission or stock query", async () => {
    const result = await dispensePrescription(closedPool(), {
      staffId: "22222222-2222-4222-8222-222222222222",
      organizationId: "11111111-1111-4111-8111-111111111111",
      prescriptionId: "33333333-3333-4333-8333-333333333333",
      itemDispenses: [],
    });
    assert.equal(result.ok, false);
    assert.equal(result.result, PHARMACY.INVALID_INPUT);
  });
});
