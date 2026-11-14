"use strict";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");

const { resetPatientPassword, RESULT: RESET } = require(
  "../../../src/activeclinic/services/activeClinicPatientPortalPasswordService"
);
const { registerPatientWithPhoneMatch, RESULT: PORTAL } = require(
  "../../../src/activeclinic/services/activeClinicPatientPortalRegistrationService"
);
const { findPotentialPatientDuplicates } = require(
  "../../../src/activeclinic/services/activeClinicPatientDuplicateService"
);
const { listDepartments, RESULT: DEPT } = require(
  "../../../src/activeclinic/services/activeClinicDepartmentService"
);

const ORG = "11111111-1111-4111-8111-111111111111";
const HCO = "22222222-2222-4222-8222-222222222222";
const OTHER = "33333333-3333-4333-8333-333333333333";
const FOREIGN = "44444444-4444-4444-8444-444444444444";

describe("D72 portal activation and identity", () => {
  it("does not load a reset token from another clinic", async () => {
    const statements = [];
    const result = await resetPatientPassword(
      {
        async query(sql, params) {
          statements.push(sql);
          if (String(sql).includes("organization_id = $2") && params[1] !== ORG) {
            return { rows: [] };
          }
          if (params[1] !== ORG) return { rows: [] };
          return {
            rows: [{
              id: "55555555-5555-4555-8555-555555555555",
              platform_identity_id: FOREIGN,
              organization_id: ORG,
              expires_at: "2000-01-01T00:00:00.000Z",
              consumed_at: null,
              revoked_at: null,
            }],
          };
        },
      },
      { token: "reset-token", newPassword: "long-enough-password", organizationId: OTHER }
    );
    assert.equal(result.code, RESET.TOKEN_INVALID);
    assert.equal(JSON.stringify(result).includes(FOREIGN), false);
    assert.equal(statements.some((sql) => sql.includes("UPDATE")), false);
  });

  it("rejects an expired reset token before it is consumed", async () => {
    const result = await resetPatientPassword(
      {
        async query(sql) {
          if (String(sql).includes("SELECT id")) {
            return {
              rows: [{
                id: "55555555-5555-4555-8555-555555555555",
                platform_identity_id: FOREIGN,
                organization_id: ORG,
                expires_at: "2000-01-01T00:00:00.000Z",
                consumed_at: null,
                revoked_at: null,
              }],
            };
          }
          throw new Error("consume_not_allowed");
        },
      },
      { token: "reset-token", newPassword: "long-enough-password", organizationId: ORG }
    );
    assert.equal(result.code, RESET.TOKEN_EXPIRED);
  });

  it("rejects a second use of a reset token", async () => {
    const result = await resetPatientPassword(
      {
        async query(sql) {
          if (String(sql).includes("SELECT id")) {
            return {
              rows: [{
                id: "55555555-5555-4555-8555-555555555555",
                platform_identity_id: FOREIGN,
                organization_id: ORG,
                expires_at: "2999-01-01T00:00:00.000Z",
                consumed_at: "2026-01-01T00:00:00.000Z",
                revoked_at: null,
              }],
            };
          }
          throw new Error("consume_not_allowed");
        },
      },
      { token: "reset-token", newPassword: "long-enough-password", organizationId: ORG }
    );
    assert.equal(result.code, RESET.TOKEN_ALREADY_USED);
  });

  it("does not return a patient id when phone registration finds nobody", async () => {
    const result = await registerPatientWithPhoneMatch(
      {
        async query(sql) {
          if (String(sql).includes("platform.identities")) return { rows: [] };
          if (String(sql).includes("activeclinic.patients")) return { rows: [] };
          throw new Error(String(sql).slice(0, 80));
        },
      },
      {
        phone: "977000222",
        password: "long-enough-password",
        firstName: "Pat",
        lastName: "Ient",
        deploymentCode: "moovex-platform-testing",
        country: "ZM",
        organizationId: ORG,
        healthcareOrganizationId: HCO,
      }
    );
    assert.equal(result.code, PORTAL.NO_MATCH);
    assert.equal(JSON.stringify(result).includes(FOREIGN), false);
  });

  it("drops a duplicate candidate that belongs to another organization", async () => {
    const result = await findPotentialPatientDuplicates(
      {
        async query() {
          return {
            rows: [{
              id: FOREIGN,
              organization_id: OTHER,
              patient_number: "X",
              first_name: "Other",
              last_name: "Clinic",
              phone_normalized: "+260977000222",
              status: "active",
            }],
          };
        },
      },
      {
        organizationId: ORG,
        healthcareOrganizationId: HCO,
        phoneNormalized: "+260977000222",
      }
    );
    assert.equal(result.ok, true);
    assert.equal(result.matches.length, 0);
    assert.equal(JSON.stringify(result).includes(FOREIGN), false);
  });

  it("does not look up duplicates without an organization", async () => {
    const result = await findPotentialPatientDuplicates(
      { async query() { throw new Error("db_not_allowed"); } },
      { healthcareOrganizationId: HCO, phoneNormalized: "+260977000222" }
    );
    assert.equal(result.ok, false);
    assert.equal(result.matches.length, 0);
  });

  it("rejects a department list with no staff member before a query", async () => {
    const result = await listDepartments(
      { async query() { throw new Error("db_not_allowed"); } },
      { organizationId: ORG }
    );
    assert.equal(result.result, DEPT.INVALID_INPUT);
    assert.deepEqual(result.departments, []);
  });
});
