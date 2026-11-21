"use strict";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");

const {
  normalizeStructuredSermonPayload,
  normalizeStructuredEventPayload,
} = require("../../../src/blessboard/services/websiteStructuredDraftService");
const { resolveOtpProvider } = require(
  "../../../src/blessboard/services/otp/otpProviders"
);
const { areMediaUploadsEnabled } = require(
  "../../../src/blessboard/config/mediaUploadsEnabled"
);

describe("G06 BlessBoard completion", () => {
  it("keeps sermon and event drafts on the fields the public pages read", () => {
    const sermon = normalizeStructuredSermonPayload({
      date: "2026-11-21",
      description: "Sunday message",
    });
    assert.match(sermon.preachedAt, /^2026-11-21T/);
    assert.equal(sermon.summary, "Sunday message");

    const event = normalizeStructuredEventPayload({
      date: "2026-11-21",
      startTime: "09:00",
      endTime: "10:30",
      description: "Gathering",
      location: "Main hall",
    });
    assert.match(event.startsAt, /^2026-11-21T/);
    assert.ok(new Date(event.endsAt).getTime() > new Date(event.startsAt).getTime());
    assert.equal(event.summary, "Gathering");
    assert.equal(event.location, "Main hall");
  });

  it("keeps production OTP and media uploads fail-closed", async () => {
    const provider = resolveOtpProvider({
      DEPLOYMENT_ENV: "production",
      BLESSBOARD_OTP_PROVIDER: "test",
    });
    const sent = await provider.send();
    assert.equal(sent.ok, false);
    assert.equal(sent.reason, "test_provider_forbidden_in_production");
    assert.equal(areMediaUploadsEnabled({}), false);
  });
});
