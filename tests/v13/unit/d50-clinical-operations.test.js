"use strict";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const { collectSpecimen, RESULT } = require(
  "../../../src/activeclinic/services/activeClinicDiagnosticsService"
);

describe("D50 laboratory status integrity", () => {
  it("does not mark a request collected when the pending row is no longer in the organization", async () => {
    const seen = [];
    const pool = {
      async connect() {
        return {
          async query(sql) {
            seen.push(sql);
            if (sql === "BEGIN" || sql === "ROLLBACK" || sql === "COMMIT") return { rows: [] };
            if (sql.includes("SELECT id, patient_id, status")) {
              return { rows: [{ id: "req", patient_id: "pat", status: "pending_collection" }] };
            }
            if (sql.includes("INSERT INTO activeclinic.specimens")) return { rows: [{ id: "spec" }] };
            if (sql.includes("specimen_events")) return { rows: [] };
            if (sql.includes("SET status = 'collected'")) return { rowCount: 0, rows: [] };
            throw new Error(sql);
          },
          release() {},
        };
      },
    };
    const result = await collectSpecimen(pool, {
      organizationId: "org",
      healthcareOrganizationId: "hco",
      facilityId: "fac",
      laboratoryRequestId: "req",
      specimenType: "blood",
      actor: { staffId: "staff" },
    });
    assert.equal(result.code, RESULT.INVALID_STATUS);
    const update = seen.find((sql) => sql.includes("SET status = 'collected'"));
    assert.match(update, /organization_id = \$2/);
    assert.match(update, /status = 'pending_collection'/);
    assert.equal(seen.includes("COMMIT"), false);
  });
});
