"use strict";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

function read(relativePath) {
  return fs.readFileSync(path.join(__dirname, "../../..", relativePath), "utf8");
}

describe("G07 shared platform source contract", () => {
  it("keeps isolation, recovery, CSRF, and appointment version checks in place", () => {
    const identity = read("src/platform/registration/resolveRegistrationContactIdentity.js");
    const sessions = read("src/platform/session/revokeV5Session.js");
    const appointments = read("src/activeclinic/services/activeClinicAppointmentService.js");
    const routes = read("src/activeclinic/http/activeClinicAppRoutes.js");
    const root = path.join(__dirname, "../../..");

    assert.match(identity, /password_verified_reuse/);
    assert.match(identity, /reject_identity_conflict/);
    assert.match(sessions, /revokeSessionsByPlatformIdentity/);
    assert.match(appointments, /STALE_VERSION/);
    assert.match(routes, /status\(503\)/);
    assert.equal(fs.existsSync(path.join(root, "src/platform/ops/restoreTenant.js")), false);
  });
});
