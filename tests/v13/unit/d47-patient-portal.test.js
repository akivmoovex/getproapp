"use strict";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const { resetPatientPassword, RESULT } = require(
  "../../../src/activeclinic/services/activeClinicPatientPortalPasswordService"
);
const { registerPatientWithPhoneMatch } = require(
  "../../../src/activeclinic/services/activeClinicPatientPortalRegistrationService"
);

const ORG = "11111111-1111-4111-8111-111111111111";
const OTHER = "22222222-2222-4222-8222-222222222222";

function tokenRow(organizationId) {
  return {
    id: "33333333-3333-4333-8333-333333333333",
    platform_identity_id: "44444444-4444-4444-8444-444444444444",
    organization_id: organizationId,
    expires_at: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
    consumed_at: null,
    revoked_at: null,
  };
}

describe("D47 portal reset isolation", () => {
  it("rejects a reset with no clinic before a query", async () => {
    const result = await resetPatientPassword(
      { async query() { throw new Error("db_not_allowed"); } },
      { token: "abc", newPassword: "long-enough-password" }
    );
    assert.equal(result.code, RESULT.INVALID_INPUT);
  });

  it("does not reset a token that belongs to another clinic", async () => {
    const queries = [];
    const result = await resetPatientPassword(
      {
        async query(sql, params) {
          queries.push(sql);
          assert.equal(params[0].length, 64);
          return { rows: [tokenRow(OTHER)] };
        },
      },
      { token: "clinic-token", newPassword: "long-enough-password", organizationId: ORG }
    );
    assert.equal(result.code, RESULT.TOKEN_INVALID);
    assert.equal(queries.length, 1);
  });

  it("does not change the password when the one-time consume loses", async () => {
    const queries = [];
    const result = await resetPatientPassword(
      {
        async query(sql) {
          queries.push(sql);
          if (sql.includes("SELECT id")) return { rows: [tokenRow(ORG)] };
          if (sql.includes("consumed_at IS NULL")) return { rows: [] };
          throw new Error(sql);
        },
      },
      { token: "clinic-token", newPassword: "long-enough-password", organizationId: ORG }
    );
    assert.equal(result.code, RESULT.TOKEN_ALREADY_USED);
    assert.equal(queries.some((sql) => sql.includes("platform.identities")), false);
  });

  it("rejects phone registration without a clinic before a patient query", async () => {
    const result = await registerPatientWithPhoneMatch(
      { async query() { throw new Error("db_not_allowed"); } },
      {
        phone: "0977000111",
        password: "long-enough-password",
        firstName: "Pat",
        lastName: "Ient",
        deploymentCode: "activeclinic",
        organizationId: "not-a-clinic",
        healthcareOrganizationId: ORG,
      }
    );
    assert.equal(result.code, "invalid_input");
  });
});
