"use strict";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "../../..");

describe("D47 portal contract", () => {
  it("passes the clinic into reset and leaves registration messages unchanged", () => {
    const routes = fs.readFileSync(
      path.join(root, "src/activeclinic/http/activeClinicPatientPortalRoutes.js"),
      "utf8"
    );
    const resetStart = routes.indexOf("const reset = await resetPatientPassword");
    const resetHandler = routes.slice(resetStart, resetStart + 400);
    assert.match(resetHandler, /organizationId: clinic\.organizationId/);
    const registerStart = routes.indexOf('"/clinics/:clinicKey/patient/register"');
    const registerHandler = routes.slice(
      registerStart,
      routes.indexOf('"/clinics/:clinicKey/patient/forgot-password"')
    );
    assert.match(registerHandler, /An account with this phone number already exists/);
    assert.doesNotMatch(registerHandler, /issueAuthenticatedSessionCookie/);
    const service = fs.readFileSync(
      path.join(root, "src/activeclinic/services/activeClinicPatientPortalPasswordService.js"),
      "utf8"
    );
    const resetBody = service.slice(service.indexOf("async function resetPatientPassword"));
    const consumeAt = resetBody.indexOf("markConsumed");
    const passwordAt = resetBody.indexOf("setPlatformIdentityPassword");
    assert.ok(consumeAt > 0 && consumeAt < passwordAt);
  });
});
