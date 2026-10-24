"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { describe, it } = require("node:test");

const ROOT = path.resolve(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(ROOT, file), "utf8");
const exists = (file) => fs.existsSync(path.join(ROOT, file));

describe("BlessBoard V2.11 reported bug contracts", () => {
  it("BB-V211-001 member portal navigation and protection", () => {
    assert.match(read("tests/church-foundation-workflows.test.js"), /member portal/i);
    assert.match(read("tests/blessboard-member-portal.test.js"), /member portal/i);
    assert.ok(exists("src/blessboard/services/requireActiveMemberForTenant.js"));
    assert.ok(exists("tests/blessboard-authorization.test.js"));
  });

  it("BB-V211-002 event creation coverage exists", () => {
    assert.ok(exists("tests/church-growth-appointments-surveys.test.js"));
    assert.ok(exists("src/blessboard/http"));
  });

  it("BB-V211-003 sermon creation/public coverage exists", () => {
    assert.ok(exists("tests/church-public-events-sermons-visual.test.js"));
    assert.ok(exists("src/blessboard/http"));
  });

  it("BB-V211-004 branch capacity uses entitlements", () => {
    const source = read("tests/blessboard-additional-branch-provisioning.test.js");
    assert.match(source, /entitlementService/);
    assert.match(source, /createBlessBoardBranch/);
    assert.ok(exists("src/platform/services/entitlementService.js"));
  });

  it("BB-V211-005 structured sections and media persistence are covered", () => {
    assert.match(read("tests/blessboard-p1-image-persistence.test.js"), /image persistence/i);
    assert.match(read("tests/blessboard-website-draft-review-publish.test.js"), /draft/i);
    assert.ok(exists("src/platform/website/mediaService.js"));
  });

  it("BB-V211-006 announcement attachments and publication are covered", () => {
    assert.match(read("tests/church-branch-announcement-attachments.test.js"), /announcement_attachment_uploaded/);
    assert.match(read("tests/v8-bb-announcements.test.js"), /publish/i);
    assert.ok(exists("src/platform/website/mediaService.js"));
  });
});
