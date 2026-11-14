"use strict";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const { updatePatientProfile, RESULT } = require(
  "../../../src/activeclinic/services/activeClinicPatientPortalProfileService"
);

const PATIENT = "11111111-1111-4111-8111-111111111111";
const ORG = "22222222-2222-4222-8222-222222222222";

describe("D46 portal profile isolation", () => {
  it("rejects an unusable organization before a query", async () => {
    const result = await updatePatientProfile(
      { async query() { throw new Error("db_not_allowed"); } },
      { patientId: PATIENT, organizationId: "not-an-organization", preferredName: "Pat" }
    );
    assert.equal(result.code, RESULT.INVALID_INPUT);
  });

  it("writes the profile event only for the caller organization", async () => {
    const queries = [];
    const db = {
      async query(sql, params) {
        queries.push({ sql, params });
        if (sql.includes("SELECT id, status")) {
          return { rows: [{ id: PATIENT, status: "active" }], rowCount: 1 };
        }
        if (sql.includes("UPDATE activeclinic.patients")) {
          return { rows: [], rowCount: 1 };
        }
        if (sql.includes("patient_portal_link_events")) {
          return { rows: [], rowCount: 1 };
        }
        throw new Error(sql);
      },
    };
    const result = await updatePatientProfile(db, {
      patientId: PATIENT,
      organizationId: ORG,
      preferredName: "Pat",
    });
    assert.equal(result.ok, true);
    const event = queries.find((query) => query.sql.includes("patient_portal_link_events"));
    assert.match(event.sql, /organization_id = \$2/);
    assert.deepEqual(event.params, [PATIENT, ORG]);
  });
});
