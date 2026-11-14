"use strict";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const { runGated } = require("./v13AuthorizedScenarios");
const {
  registerPatientWithPhoneMatch,
} = require("../../../src/activeclinic/services/activeClinicPatientPortalRegistrationService");

describe("D24 patient portal persistence", () => {
  it("keeps PAT-01 database activation behind the write gate", async (t) => {
    const result = await runGated(t, "PAT-01", async (pool) => {
      const denied = await registerPatientWithPhoneMatch(pool, {
        phone: "",
        password: "",
      });
      if (!denied || denied.ok !== false || denied.code !== "invalid_input") {
        throw new Error("PAT-01 invalid registration was not denied");
      }
    });
    assert.equal(result, "NOT_RUN");
  });
});
