"use strict";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");

const { createClinicalOrder, RESULT } = require(
  "../../../src/activeclinic/services/activeClinicClinicalService"
);
const { enterLaboratoryResult, RESULT: LAB } = require(
  "../../../src/activeclinic/services/activeClinicDiagnosticsService"
);
const { storedDiagnosticUrgency } = require(
  "../../../src/activeclinic/services/clinicalOperationsRules"
);

function throwingDb() {
  return { async query() { throw new Error("db_not_allowed"); } };
}

describe("G03 laboratory orders", () => {
  it("keeps stored priorities and rejects an unapproved word before a query", async () => {
    assert.equal(storedDiagnosticUrgency(""), "routine");
    assert.equal(storedDiagnosticUrgency("stat"), "stat");
    assert.equal(storedDiagnosticUrgency("high"), null);
    const rejected = await createClinicalOrder(throwingDb(), {
      orderType: "laboratory",
      orderDetails: { test_code: "CBC", urgency: "high" },
    });
    assert.equal(rejected.code, RESULT.INVALID_INPUT);
  });

  it("does not invent an abnormal flag when no approved range is supplied", async () => {
    let component = null;
    const pool = {
      async connect() {
        return {
          async query(sql, params) {
            if (sql === "BEGIN" || sql === "COMMIT" || sql === "ROLLBACK") return { rows: [] };
            if (sql.includes("FROM activeclinic.laboratory_requests")) {
              return { rows: [{ id: "req", patient_id: "pat", status: "received" }] };
            }
            if (sql.includes("INSERT INTO activeclinic.laboratory_results")) {
              return { rows: [{ id: "res" }] };
            }
            if (sql.includes("laboratory_result_components")) {
              component = params;
              return { rows: [] };
            }
            if (sql.includes("SET status = 'resulted'")) return { rowCount: 1, rows: [] };
            throw new Error(sql);
          },
          release() {},
        };
      },
    };
    const result = await enterLaboratoryResult(pool, {
      organizationId: "org",
      healthcareOrganizationId: "hco",
      facilityId: "fac",
      laboratoryRequestId: "req",
      resultSummary: "recorded",
      isCritical: false,
      components: [{ test_name: "Hemoglobin", value_numeric: 7, unit: "g/dL" }],
      actor: { staffId: "staff" },
    });
    assert.equal(result.ok, true);
    assert.equal(component[8], null);
    assert.equal(component[9], null);
    assert.equal(component[12], null);
    assert.equal(LAB.REQUEST_NOT_FOUND, "REQUEST_NOT_FOUND");
  });
});
