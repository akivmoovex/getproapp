"use strict";

/**
 * Prompt 11D — phone-first invitation sharing (manual WhatsApp, copy, email fallback).
 */

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const {
  buildWhatsAppShareUrl,
  buildInviteShareMessage,
} = require("../src/platform/services/createScopedTeamMemberService");

describe("blessboard phone-first invitation sharing (11D)", () => {
  it("builds encoded WhatsApp share URL without password or raw UUID noise beyond invite URL", () => {
    const invitationUrl =
      "https://blessboard.org/accept-invitation?token=one-time-token-value";
    const message = buildInviteShareMessage({
      firstName: "Chipo",
      churchName: "Kitwe Central",
      roleLabel: "Branch Administrator",
      invitationUrl,
      expiresAt: "2030-01-15T00:00:00.000Z",
    });
    assert.match(message, /Hello Chipo/);
    assert.match(message, /Kitwe Central/);
    assert.match(message, /Open this secure invitation:/);
    assert.match(message, /2030-01-15/);
    assert.doesNotMatch(message, /password/i);

    const url = buildWhatsAppShareUrl({
      phoneE164: "+260971234567",
      message,
    });
    assert.match(url, /^https:\/\/wa\.me\/260971234567\?text=/);
    assert.ok(url.includes(encodeURIComponent("Open this secure invitation:")));
    assert.doesNotMatch(url, /\+/); // + stripped from phone digits in wa.me path
  });

  it("result screens prioritize WhatsApp then Copy then optional email", () => {
    const files = [
      "views/blessboard/v5/hq/staff-access-invite-result.ejs",
      "views/blessboard/v5/platform-admin/team-invite-result.ejs",
    ];
    for (const rel of files) {
      const html = fs.readFileSync(path.join(__dirname, "..", rel), "utf8");
      const wa = html.indexOf("Share on WhatsApp");
      const copy = html.indexOf("Copy link");
      const email = html.indexOf("Send by email");
      assert.ok(wa >= 0, `${rel} missing WhatsApp`);
      assert.ok(copy >= 0, `${rel} missing Copy`);
      assert.ok(wa < copy, `${rel} WhatsApp should precede Copy`);
      assert.ok(email > copy, `${rel} email should follow Copy`);
      assert.match(html, /Invitation link copied/);
      assert.match(html, /does not send WhatsApp messages automatically/i);
      assert.match(html, /navigator\.clipboard|execCommand\('copy'\)/);
    }
  });

  it("hides email action markup when no address (HQ result uses hasEmail guard)", () => {
    const hq = fs.readFileSync(
      path.join(__dirname, "..", "views/blessboard/v5/hq/staff-access-invite-result.ejs"),
      "utf8"
    );
    assert.match(hq, /if \(hasEmail\)/);
    assert.doesNotMatch(hq, /email-invite-disabled/);
  });
});
