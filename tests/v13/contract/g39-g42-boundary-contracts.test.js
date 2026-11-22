"use strict";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const {
  requestPaperDisposal,
} = require("../../../src/activeclinic/services/activeClinicRecordMigrationService");
const {
  areMediaUploadsEnabled,
} = require("../../../src/blessboard/config/mediaUploadsEnabled");

const ROOT = path.join(__dirname, "../../..");

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), "utf8");
}

describe("G39-G42 approved boundaries", () => {
  it("keeps the supported ActiveClinic journey on the existing routes", () => {
    const clinical = read("src/activeclinic/http/activeClinicClinicalRoutes.js");
    const reception = read("src/activeclinic/http/activeClinicReceptionRoutes.js");
    const diagnostics = read("src/activeclinic/http/activeClinicDiagnosticsRoutes.js");
    const pharmacy = read("src/activeclinic/http/activeClinicPharmacyRoutes.js");
    const billing = read("src/activeclinic/http/activeClinicBillingRoutes.js");
    const documents = read("src/activeclinic/http/activeClinicClinicalDocumentRoutes.js");
    const patients = read("src/activeclinic/http/activeClinicPatientRoutes.js");
    for (const needle of [
      '"/app/clinical"',
      '"/app/clinical/start-encounter"',
      '"/app/clinical/encounter/:encounterId/triage"',
      '"/app/clinical/encounter/:encounterId/vitals"',
      '"/app/clinical/encounter/:encounterId/diagnosis"',
      '"/app/clinical/encounter/:encounterId/order/:orderType"',
    ]) {
      assert.match(clinical, new RegExp(needle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
    }
    assert.match(patients, /"\/app\/patients"/);
    assert.match(reception, /"\/app\/reception\/walk-in"/);
    assert.match(diagnostics, /"\/app\/diagnostics\/laboratory\/queue"/);
    assert.match(pharmacy, /"\/app\/pharmacy"/);
    assert.match(billing, /"\/app\/billing"/);
    assert.match(documents, /"\/app\/clinical\/patients\/:patientId\/documents"/);
  });

  it("keeps prescription entry manual and refuses a second full quantity", () => {
    const form = read("views/activeclinic/app/create-prescription-content.ejs");
    const pharmacy = read("src/activeclinic/services/activeClinicPharmacyService.js");
    assert.match(form, /Manual entry only/);
    assert.match(pharmacy, /quantityToDispense > remainingQuantity/);
    assert.match(pharmacy, /activeclinic\.pharmacy\.dispense/);
  });

  it("keeps paper destruction, uploads, and offline writes closed", () => {
    const disposal = requestPaperDisposal();
    assert.equal(disposal.ok, false);
    assert.equal(disposal.code, "legal_approval_required");
    assert.equal(disposal.deleted, false);
    assert.equal(disposal.paperRecordsRetained, true);
    assert.equal(areMediaUploadsEnabled({}), false);
    assert.equal(areMediaUploadsEnabled({ BLESSBOARD_MEDIA_UPLOADS_ENABLED: "yes" }), true);
    const offline = read("src/activeclinic/http/activeClinicAppRoutes.js");
    assert.match(offline, /app\.get\("\/app\/offline"/);
    assert.match(offline, /\.status\(503\)/);
  });

  it("keeps migration 043 additive and unrouted", () => {
    const sql = read("db/migrations/activeclinic/043_record_migration_inventory.sql");
    assert.match(sql, /CREATE TABLE IF NOT EXISTS activeclinic\.record_migration_batches/);
    assert.doesNotMatch(sql, /\b(DELETE FROM|DROP TABLE|TRUNCATE)\b/i);
    const http = read("src/activeclinic/services/activeClinicRecordMigrationService.js");
    const routes = fs
      .readdirSync(path.join(ROOT, "src/activeclinic/http"))
      .filter((name) => name.endsWith(".js"))
      .map((name) => read(`src/activeclinic/http/${name}`))
      .join("\n");
    assert.match(http, /function openMigrationBatch/);
    assert.doesNotMatch(routes, /openMigrationBatch/);
  });
});
