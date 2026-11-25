"use strict";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const { financialPostingEnabled } = require("../../../src/activeclinic/communityBenefits/flags");

const ROOT = path.join(__dirname, "../../..");

describe("community benefits contracts", () => {
  it("keeps the schema unapplied, posting disabled, and the test actor off the clinic server", () => {
    assert.equal(fs.existsSync(path.join(ROOT, "db/migrations/platform/048_otp_challenges.sql")), false);
    assert.equal(fs.existsSync(path.join(ROOT, "db/migrations/activeclinic/049_community_benefits.sql")), false);
    const sql = fs.readFileSync(path.join(ROOT, "docs/qa/community-benefits/V2132_COMMUNITY_BENEFITS_SCHEMA.sql"), "utf8");
    assert.match(sql, /NOT APPLIED/);
    assert.match(sql, /community_memberships/);
    assert.match(sql, /clinic_acquisitions/);
    assert.equal(financialPostingEnabled(), false);
    const server = fs.readFileSync(path.join(ROOT, "src/activeclinic/http/activeClinicFoundationServer.js"), "utf8");
    assert.match(server, /allowTestActor: false/);
    const nav = fs.readFileSync(path.join(ROOT, "src/activeclinic/services/activeClinicNavigation.js"), "utf8");
    const frozen = nav.slice(nav.indexOf("const NAV_ITEMS"), nav.indexOf("]);", nav.indexOf("const NAV_ITEMS")));
    assert.match(nav, /communityBenefitsEnabled/);
    assert.equal(frozen.includes("community_check_in"), false);
  });
});
