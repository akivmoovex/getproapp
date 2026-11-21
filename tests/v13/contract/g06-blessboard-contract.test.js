"use strict";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

function read(relativePath) {
  return fs.readFileSync(path.join(__dirname, "../../..", relativePath), "utf8");
}

describe("G06 BlessBoard source contract", () => {
  it("keeps membership, website, announcements, and recovery on the current contracts", () => {
    const member = read("src/blessboard/services/blessBoardStaffAddMemberFormService.js");
    const memberRoutes = read("src/blessboard/http/hqMembersAdminRoutes.js");
    const themes = read("src/platform/website/websiteThemeService.js");
    const sermons = read("views/blessboard/v5/public/sermons.ejs");
    const events = read("views/blessboard/v5/public/events.ejs");
    const announcements = read("src/blessboard/repositories/announcementsRepository.js");
    const otp = read("src/blessboard/services/otp/blessBoardOtpService.js");
    const portal = read("src/blessboard/services/membershipPortalLifecycle.js");

    assert.match(member, /address_line_1/);
    assert.match(member, /next_of_kin_name/);
    assert.match(member, /duplicateOverride/);
    assert.match(memberRoutes, /members\.create/);
    assert.match(themes, /invalid_theme/);
    assert.match(sermons, /Add sermon/);
    assert.match(events, /Add event/);
    assert.match(announcements, /audience_key = 'public'/);
    assert.match(announcements, /is_pinned DESC/);
    assert.match(otp, /already_used/);
    assert.match(otp, /expired/);
    assert.match(portal, /NOT_ACTIVATED/);
  });
});
