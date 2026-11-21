"use strict";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

function read(relativePath) {
  return fs.readFileSync(path.join(__dirname, "../../..", relativePath), "utf8");
}

describe("G05 records source contract", () => {
  it("adds inventory without deletion and leaves the clinical document contract unchanged", () => {
    const migration = read("db/migrations/activeclinic/043_record_migration_inventory.sql");
    const documents = read("src/activeclinic/services/activeClinicClinicalDocumentService.js");
    const consent = read("src/activeclinic/services/activeClinicPatientConsentService.js");
    const migrationService = read("src/activeclinic/services/activeClinicRecordMigrationService.js");

    assert.match(migration, /record_migration_batches/);
    assert.match(migration, /Digitisation does not authorize destruction of paper records/);
    assert.doesNotMatch(migration, /DELETE FROM/);
    assert.match(documents, /FINAL_IMMUTABLE/);
    assert.equal(/quarantine|legal_hold|page_count|sha256|retention_expiry/.test(documents), false);
    assert.equal(consent.includes("DELETE FROM"), false);
    assert.match(migrationService, /binary_storage_deferred/);
    assert.match(migrationService, /merged: false/);
  });
});
