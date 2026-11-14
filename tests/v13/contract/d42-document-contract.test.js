"use strict";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "../../..");

function read(rel) {
  return fs.readFileSync(path.join(root, rel), "utf8");
}

describe("D42 document contract", () => {
  it("keeps document reads and events inside the organization and leaves quarantine out", () => {
    const service = read("src/activeclinic/services/activeClinicClinicalDocumentService.js");
    const repo = read("src/activeclinic/repositories/clinicalDocumentRepository.js");
    assert.equal(/quarantine|legal_hold|page_count|sha256/.test(service), false);
    assert.match(repo, /p\.organization_id = d\.organization_id/);
    assert.match(repo, /f\.organization_id = d\.organization_id/);
    assert.match(repo, /FROM activeclinic\.clinical_documents d/);
    assert.match(repo, /d\.organization_id = \$1/);
    assert.equal(fs.existsSync(path.join(root, "src/platform/ops/restoreTenant.js")), false);
    const routes = read("src/activeclinic/http/activeClinicAppRoutes.js");
    const offline = routes.slice(routes.indexOf('app.get("/app/offline"'), routes.indexOf('app.get("/app/offline"') + 500);
    assert.match(offline, /status\(503\)/);
    assert.doesNotMatch(offline, /INSERT|BEGIN/);
    const demo = read("src/activeclinic/services/activeClinicDemoClinicSpec.js");
    assert.doesNotMatch(demo, /signingEnabled|patientDisplay|twoScreen/);
  });
});
