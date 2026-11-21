"use strict";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");

const {
  classifyRecordOrigin,
  reviewMigrationPatientMatch,
  declareMigrationFile,
  selectRetentionCategory,
  requestPaperDisposal,
  openMigrationBatch,
  RESULT,
} = require("../../../src/activeclinic/services/activeClinicRecordMigrationService");

const ORG = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

describe("G05 record migration", () => {
  it("keeps uncertain matches unmerged and refuses paper destruction", () => {
    const review = reviewMigrationPatientMatch([
      { strength: "moderate", patientId: ORG },
      { strength: "strong", patientId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb" },
    ]);
    assert.equal(review.status, "review_required");
    assert.equal(review.merged, false);
    assert.equal(review.patientId, null);
    const disposal = requestPaperDisposal({ elapsedDays: 3650 });
    assert.equal(disposal.code, RESULT.LEGAL_APPROVAL_REQUIRED);
    assert.equal(disposal.paperRecordsRetained, true);
    assert.equal(disposal.deleted, false);
    assert.equal(classifyRecordOrigin("imported"), "imported");
    assert.equal(classifyRecordOrigin("scanned"), null);
  });

  it("does not store file bytes or invent a retention category", async () => {
    const refused = declareMigrationFile({
      filename: "scan.pdf",
      declaredMediaType: "application/pdf",
      declaredByteSize: 1200,
      bytes: Buffer.from("not-a-patient"),
    });
    assert.equal(refused.code, RESULT.BINARY_STORAGE_DEFERRED);
    assert.equal(refused.stored, false);
    const unapproved = selectRetentionCategory("adult-chart", []);
    assert.equal(unapproved.code, RESULT.CATEGORY_NOT_APPROVED);
    assert.equal(unapproved.deletesOnElapsedTime, false);
    const queries = [];
    const opened = await openMigrationBatch(
      {
        async query(sql) {
          queries.push(sql);
          return { rows: [{ id: ORG }] };
        },
      },
      {
        organizationId: ORG,
        healthcareOrganizationId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
        facilityId: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
        openedByStaffId: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
        sourceLabel: "Ward cabinet A",
      }
    );
    assert.equal(opened.ok, true);
    assert.match(queries[0], /organization_id/);
    assert.equal(/DELETE/i.test(queries[0]), false);
  });
});
