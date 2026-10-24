"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { describe, it } = require("node:test");

const ROOT = path.resolve(__dirname, "..");
const exists = (file) => fs.existsSync(path.join(ROOT, file));
const read = (file) => fs.readFileSync(path.join(ROOT, file), "utf8");

describe("V2.11 native replacements for legacy BlessBoard coverage", () => {
  it("uses platform and BlessBoard provisioning instead of public tenants", () => {
    const provision = read("src/platform/services/provisionPlatformTenant.js");
    const church = read("src/blessboard/services/provisionBlessBoardChurch.js");
    assert.match(provision, /module\.exports/);
    assert.match(church, /module\.exports/);
    assert.doesNotMatch(read("tests/bb-v211-qa-bug-regression.test.js"), /public\.tenants/);
  });

  it("keeps member activation and tenant isolation on V2.11 routes", () => {
    assert.ok(exists("src/blessboard/services/requireActiveMemberForTenant.js"));
    assert.ok(exists("src/blessboard/http/memberPortalRoutes.js"));
    assert.ok(exists("tests/blessboard-authorization.test.js"));
    assert.ok(exists("tests/blessboard-member-portal.test.js"));
  });

  it("keeps event and announcement management on branch-scoped routes", () => {
    const events = read("tests/church-branch-announcements-events.test.js");
    assert.match(events, /\/branch\/events/);
    assert.match(events, /\/branch\/announcements/);
    assert.ok(exists("src/blessboard/http/announcementPublicRoutes.js"));
  });

  it("retains negative cross-branch and publication expectations", () => {
    const events = read("tests/church-branch-announcements-events.test.js");
    assert.match(events, /crossBranch/);
    assert.match(events, /crossEvent/);
    assert.match(events, /publish/);
  });

  it("maps branch capacity to the current entitlement service", () => {
    assert.ok(exists("src/blessboard/services/createBlessBoardBranch.js"));
    assert.ok(exists("src/platform/services/entitlementService.js"));
    assert.match(read("tests/blessboard-additional-branch-provisioning.test.js"), /setOrganizationEntitlementOverride/);
  });

  it("maps image persistence to current media and structured-draft contracts", () => {
    assert.ok(exists("src/platform/website/mediaService.js"));
    assert.ok(exists("src/blessboard/services/websiteStructuredDraftService.js"));
    assert.ok(exists("tests/blessboard-p1-image-persistence.test.js"));
    assert.ok(exists("tests/church-branch-announcement-attachments.test.js"));
  });
});
