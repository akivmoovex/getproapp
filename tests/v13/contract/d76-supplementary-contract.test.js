"use strict";

const fs = require("fs");
const path = require("path");
const { describe, it } = require("node:test");
const assert = require("node:assert/strict");

const root = path.join(__dirname, "../../..");

describe("D76 supplementary contracts", () => {
  it("binds consent withdrawal to the stored patient and the granted status", () => {
    const source = fs.readFileSync(
      path.join(root, "src/activeclinic/services/activeClinicPatientConsentService.js"),
      "utf8"
    );
    const body = source.slice(source.indexOf("async function withdrawPatientConsent"));
    assert.match(body, /patient_id = \$6/);
    assert.match(body, /AND status = 'granted'/);
    assert.equal(body.includes("representative_id"), false);
    assert.equal(source.includes("legal_hold"), false);
  });

  it("leaves the offline page unable to write and Juflona signing unset", () => {
    const routes = fs.readFileSync(
      path.join(root, "src/activeclinic/http/activeClinicAppRoutes.js"),
      "utf8"
    );
    const offline = routes.slice(routes.indexOf('app.get("/app/offline"'), routes.indexOf('app.get("/app/offline"') + 500);
    assert.match(offline, /status\(503\)/);
    assert.doesNotMatch(offline, /INSERT|BEGIN/);
    const demo = fs.readFileSync(
      path.join(root, "src/activeclinic/services/activeClinicDemoClinicSpec.js"),
      "utf8"
    );
    assert.doesNotMatch(demo, /signingEnabled/);
  });
});
