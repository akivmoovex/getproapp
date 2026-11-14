"use strict";

const fs = require("fs");
const path = require("path");
const { describe, it } = require("node:test");
const assert = require("node:assert/strict");

const root = path.join(__dirname, "../../..");

describe("D72 identity and facility contracts", () => {
  it("scopes a patient reset token to the clinic before it is consumed", () => {
    const source = fs.readFileSync(
      path.join(root, "src/activeclinic/services/activeClinicPatientPortalPasswordService.js"),
      "utf8"
    );
    const body = source.slice(source.indexOf("async function resetPatientPassword"));
    assert.match(body, /organization_id = \$2/);
    const consumeAt = body.indexOf("markConsumed");
    const passwordAt = body.indexOf("setPlatformIdentityPassword");
    assert.ok(consumeAt > 0 && consumeAt < passwordAt);
  });

  it("keeps a facility lookup inside the caller organization", () => {
    const source = fs.readFileSync(
      path.join(root, "src/activeclinic/services/activeClinicDepartmentService.js"),
      "utf8"
    );
    assert.match(source, /FROM activeclinic\.facilities[\s\S]*organization_id = \$2/);
    assert.equal(source.includes("function mergePatient"), false);
  });
});
