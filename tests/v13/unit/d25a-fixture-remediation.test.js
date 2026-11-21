"use strict";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const {
  buildBlessBoardWebsiteSectionFixture,
  classifyClinicCredentialReuse,
  buildRegressionClinicOperationsPlan,
} = require("../fixtures/v13SyntheticFixtures");

const FIXTURE = path.join(__dirname, "../fixtures/v13SyntheticFixtures.js");

describe("D25A fixture contract remediation", () => {
  it("requires the owning church id before a BlessBoard website section can be built", () => {
    assert.throws(
      () => buildBlessBoardWebsiteSectionFixture({ organizationId: "org-a" }),
      /church id/
    );
    assert.throws(
      () =>
        buildBlessBoardWebsiteSectionFixture({
          organizationId: "org-a",
          churchId: null,
        }),
      /church id/
    );
    assert.throws(
      () =>
        buildBlessBoardWebsiteSectionFixture({
          churchId: "church-a",
        }),
      /organization/
    );
  });

  it("keeps a website section on its own church and marks it unpublished", () => {
    const section = buildBlessBoardWebsiteSectionFixture({
      organizationId: "org-a",
      churchId: "church-a",
      ownerChurchId: "church-a",
      otherChurchId: "church-b",
      branchId: "branch-a",
    });
    assert.equal(section.churchId, "church-a");
    assert.equal(section.organizationId, "org-a");
    assert.equal(section.branchId, "branch-a");
    assert.equal(section.productCode, "blessboard");
    assert.equal(section.type, "plain_text");
    assert.equal(section.published, false);
    assert.equal(Object.hasOwn(section, "churchId"), true);
    assert.throws(
      () =>
        buildBlessBoardWebsiteSectionFixture({
          organizationId: "org-a",
          churchId: "church-b",
          ownerChurchId: "church-a",
        }),
      /owning church/
    );
    assert.throws(
      () =>
        buildBlessBoardWebsiteSectionFixture({
          organizationId: "org-b",
          churchId: "church-b",
          otherChurchId: "church-b",
        }),
      /own church/
    );
  });

  it("treats a matching-password second clinic as identity reuse, not a rejected duplicate", () => {
    const reused = classifyClinicCredentialReuse({
      sameEmail: true,
      passwordMatched: true,
      sameClinic: false,
    });
    assert.equal(reused.classification, "EXPECTED_MULTI_CLINIC_REUSE");
    assert.equal(reused.clinicCreated, true);

    const mismatch = classifyClinicCredentialReuse({
      sameEmail: true,
      passwordMatched: false,
      sameClinic: false,
    });
    assert.equal(mismatch.classification, "REJECTED_PASSWORD_MISMATCH");
    assert.equal(mismatch.clinicCreated, false);

    const same = classifyClinicCredentialReuse({
      sameEmail: true,
      passwordMatched: true,
      sameClinic: true,
    });
    assert.equal(same.classification, "ALREADY_PROVISIONED");
    assert.equal(same.clinicCreated, false);
  });

  it("forces the ActiveClinic fixture attach spec to keep public booking disabled", () => {
    const plan = buildRegressionClinicOperationsPlan();
    assert.equal(plan.publicBookingEnabled, false);
    assert.equal(plan.coupon, null);
    const source = fs.readFileSync(FIXTURE, "utf8");
    assert.match(source, /const spec = \{ \.\.\.clinic, publicBookingEnabled: false \}/);
    assert.match(source, /spec\.publicBookingEnabled !== false/);
    assert.doesNotMatch(source, /public_booking_enabled\s*=\s*true/);
    assert.doesNotMatch(source, /provisionHostedAuthQaClinic/);
  });
});
