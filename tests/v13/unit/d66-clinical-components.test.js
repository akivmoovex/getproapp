"use strict";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");

const {
  enterRadiologyReport,
  verifyLaboratoryResult,
  RESULT,
} = require("../../../src/activeclinic/services/activeClinicDiagnosticsService");
const { dispensePrescription, RESULT: PHARMACY } = require(
  "../../../src/activeclinic/services/activeClinicPharmacyService"
);
const { isClosedDiagnosticStatus } = require(
  "../../../src/activeclinic/services/clinicalOperationsRules"
);

const ORG = "11111111-1111-4111-8111-111111111111";
const HCO = "22222222-2222-4222-8222-222222222222";
const FACILITY = "33333333-3333-4333-8333-333333333333";
const REQUEST = "44444444-4444-4444-8444-444444444444";
const RESULT_ID = "55555555-5555-4555-8555-555555555555";
const AUTHOR = "66666666-6666-4666-8666-666666666666";
const OTHER = "77777777-7777-4777-8777-777777777777";

function scriptedPool(handler) {
  const statements = [];
  const client = {
    async query(sql, params) {
      statements.push(String(sql));
      return handler(String(sql), params || [], statements);
    },
    release() {},
  };
  return {
    statements,
    async connect() {
      return client;
    },
  };
}

describe("D66 diagnostic writes", () => {
  it("reports a radiology request only inside the caller organization", async () => {
    const pool = scriptedPool((sql) => {
      if (sql === "BEGIN" || sql === "COMMIT" || sql === "ROLLBACK") return { rows: [] };
      if (sql.includes("FROM activeclinic.radiology_requests")) {
        return { rows: [{ id: REQUEST, patient_id: OTHER, status: "pending" }] };
      }
      if (sql.includes("INSERT INTO activeclinic.radiology_reports")) {
        return { rows: [{ id: RESULT_ID }] };
      }
      if (sql.includes("UPDATE activeclinic.radiology_requests")) {
        assert.match(sql, /organization_id = \$2/);
        assert.match(sql, /healthcare_organization_id = \$3/);
        assert.match(sql, /facility_id = \$4/);
        return { rows: [], rowCount: 1 };
      }
      throw new Error(sql.slice(0, 120));
    });
    const result = await enterRadiologyReport(pool, {
      organizationId: ORG,
      healthcareOrganizationId: HCO,
      facilityId: FACILITY,
      radiologyRequestId: REQUEST,
      findings: "seen",
      impression: "clear",
      technique: "plain",
      isCritical: false,
      actor: { staffId: AUTHOR },
    });
    assert.equal(result.ok, true);
    assert.equal(pool.statements.includes("ROLLBACK"), false);
  });

  it("rolls back when the radiology request update misses the caller organization", async () => {
    const pool = scriptedPool((sql) => {
      if (sql === "BEGIN" || sql === "ROLLBACK") return { rows: [] };
      if (sql.includes("FROM activeclinic.radiology_requests")) {
        return { rows: [{ id: REQUEST, patient_id: OTHER, status: "pending" }] };
      }
      if (sql.includes("INSERT INTO activeclinic.radiology_reports")) {
        return { rows: [{ id: RESULT_ID }] };
      }
      if (sql.includes("UPDATE activeclinic.radiology_requests")) return { rows: [], rowCount: 0 };
      throw new Error(sql.slice(0, 120));
    });
    const result = await enterRadiologyReport(pool, {
      organizationId: ORG,
      healthcareOrganizationId: HCO,
      facilityId: FACILITY,
      radiologyRequestId: REQUEST,
      findings: "seen",
      impression: "clear",
      technique: "plain",
      isCritical: false,
      actor: { staffId: AUTHOR },
    });
    assert.equal(result.ok, false);
    assert.equal(result.code, RESULT.REQUEST_NOT_FOUND);
    assert.equal(pool.statements.includes("COMMIT"), false);
    assert.equal(pool.statements.includes("ROLLBACK"), true);
  });

  it("does not verify a closed laboratory result or the entering staff member", async () => {
    assert.equal(isClosedDiagnosticStatus("verified"), true);
    assert.equal(isClosedDiagnosticStatus("released"), true);
    assert.equal(isClosedDiagnosticStatus("resulted"), false);

    const closed = scriptedPool((sql) => {
      if (sql === "BEGIN" || sql === "ROLLBACK") return { rows: [] };
      if (sql.includes("FROM activeclinic.laboratory_results")) {
        return { rows: [{ id: RESULT_ID, status: "verified", entered_by_staff_id: AUTHOR }] };
      }
      throw new Error(sql.slice(0, 120));
    });
    const closedResult = await verifyLaboratoryResult(closed, {
      organizationId: ORG,
      healthcareOrganizationId: HCO,
      laboratoryResultId: RESULT_ID,
      actor: { staffId: OTHER },
    });
    assert.equal(closedResult.code, RESULT.ALREADY_VERIFIED);
    assert.equal(closed.statements.some((sql) => sql.startsWith("UPDATE")), false);

    const own = scriptedPool((sql) => {
      if (sql === "BEGIN" || sql === "ROLLBACK") return { rows: [] };
      if (sql.includes("FROM activeclinic.laboratory_results")) {
        return { rows: [{ id: RESULT_ID, status: "resulted", entered_by_staff_id: AUTHOR }] };
      }
      throw new Error(sql.slice(0, 120));
    });
    const ownResult = await verifyLaboratoryResult(own, {
      organizationId: ORG,
      healthcareOrganizationId: HCO,
      laboratoryResultId: RESULT_ID,
      actor: { staffId: AUTHOR },
    });
    assert.equal(ownResult.code, RESULT.ACCESS_DENIED);
    assert.equal(own.statements.some((sql) => sql.startsWith("UPDATE")), false);
  });

  it("rolls back a laboratory verify that no longer matches the open result", async () => {
    const pool = scriptedPool((sql) => {
      if (sql === "BEGIN" || sql === "ROLLBACK") return { rows: [] };
      if (sql.includes("FROM activeclinic.laboratory_results")) {
        return { rows: [{ id: RESULT_ID, status: "resulted", entered_by_staff_id: AUTHOR }] };
      }
      if (sql.includes("UPDATE activeclinic.laboratory_results")) {
        assert.match(sql, /organization_id = \$3/);
        assert.match(sql, /status NOT IN \('verified', 'released'\)/);
        return { rows: [], rowCount: 0 };
      }
      throw new Error(sql.slice(0, 120));
    });
    const result = await verifyLaboratoryResult(pool, {
      organizationId: ORG,
      healthcareOrganizationId: HCO,
      laboratoryResultId: RESULT_ID,
      actor: { staffId: OTHER },
    });
    assert.equal(result.code, RESULT.INVALID_STATUS);
    assert.equal(pool.statements.includes("COMMIT"), false);
  });
});

describe("D66 dispense authorization", () => {
  it("denies a dispense when the clinic product is not active", async () => {
    let connections = 0;
    const result = await dispensePrescription(
      {
        async query() {
          return { rows: [] };
        },
        async connect() {
          connections += 1;
          throw new Error("connect_not_allowed");
        },
      },
      {
        staffId: AUTHOR,
        organizationId: ORG,
        prescriptionId: REQUEST,
        itemDispenses: [{ prescriptionItemId: RESULT_ID, quantityToDispense: 1, batchId: OTHER }],
      }
    );
    assert.equal(result.result, PHARMACY.ACCESS_DENIED);
    assert.equal(connections, 0);
  });
});
