"use strict";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "../../..");

describe("D51 document contract", () => {
  it("keeps withdrawal, signing, and offline writes inside the existing limits", () => {
    const consent = fs.readFileSync(
      path.join(root, "src/activeclinic/services/activeClinicPatientConsentService.js"),
      "utf8"
    );
    const withdraw = consent.slice(consent.indexOf("async function withdrawPatientConsent"));
    assert.match(withdraw, /AND status = 'granted'/);
    const updateAt = withdraw.indexOf("SET status = 'withdrawn'");
    const eventAt = withdraw.indexOf("patient_consent_events");
    const missAt = withdraw.indexOf("if (!next)");
    assert.ok(updateAt > 0 && missAt > updateAt && missAt < eventAt);
    const documents = fs.readFileSync(
      path.join(root, "src/activeclinic/services/activeClinicClinicalDocumentService.js"),
      "utf8"
    );
    assert.equal(/quarantine|legal_hold|page_count|sha256/.test(documents), false);
    const demo = fs.readFileSync(
      path.join(root, "src/activeclinic/services/activeClinicDemoClinicSpec.js"),
      "utf8"
    );
    assert.doesNotMatch(demo, /signingEnabled|patientDisplay|twoScreen/);
    assert.equal(fs.existsSync(path.join(root, "src/platform/ops/restoreTenant.js")), false);
    const routes = fs.readFileSync(
      path.join(root, "src/activeclinic/http/activeClinicAppRoutes.js"),
      "utf8"
    );
    const offline = routes.slice(routes.indexOf('app.get("/app/offline"'), routes.indexOf('app.get("/app/offline"') + 500);
    assert.match(offline, /status\(503\)/);
    assert.doesNotMatch(offline, /INSERT|BEGIN/);
  });
});
