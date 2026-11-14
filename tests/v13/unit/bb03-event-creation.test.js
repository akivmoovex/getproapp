"use strict";

/**
 * BB-03 — database-independent event creation contracts.
 */

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const { validateEventBody } = require("../../../src/church/announcementsEventsValidation");
const { buildEventFields } = require("../../../src/blessboard/services/publicContentAdminService");

describe("BB-03 event creation", () => {
  it("accepts a complete branch event and keeps draft vs publish as caller intent", () => {
    const result = validateEventBody({
      title: "Prayer night",
      description: "Open prayer",
      event_date: "2030-04-12",
      start_time: "6:30 PM",
      end_time: "20:00",
      location: "Chapel",
      visibility: "public",
    });
    assert.equal(result.ok, true);
    assert.equal(result.data.event_date, "2030-04-12");
    assert.equal(result.data.visibility, "public");
    assert.equal(result.data.status, undefined);
  });

  it("normalizes a datetime-local start to UTC and allows a blank end", () => {
    const result = buildEventFields(
      {
        title: "Choir rehearsal",
        startsAt: "2030-04-12T18:30",
        endsAt: "",
        timezone: "UTC",
        status: "draft",
      },
      { partial: false }
    );
    assert.equal(result.ok, true);
    assert.equal(result.fields.startsAt, "2030-04-12T18:30:00.000Z");
    assert.equal(result.fields.endsAt, null);
    assert.equal(result.fields.status, "draft");
  });

  it("rejects a published status that is not in the event allowlist", () => {
    const result = buildEventFields(
      {
        title: "Choir rehearsal",
        startsAt: "2030-04-12T18:30:00.000Z",
        timezone: "UTC",
        status: "secret",
      },
      { partial: false }
    );
    assert.equal(result.ok, false);
    assert.equal(result.reason, "status");
  });
});
