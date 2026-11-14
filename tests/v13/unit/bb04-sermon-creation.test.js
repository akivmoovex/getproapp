"use strict";

/**
 * BB-04 — database-independent sermon creation contracts.
 */

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const { buildSermonFields } = require("../../../src/blessboard/services/publicContentAdminService");

describe("BB-04 sermon creation", () => {
  it("creates a draft from the required metadata and an optional thumbnail", () => {
    const result = buildSermonFields(
      {
        title: "Living Hope",
        speakerName: "Pastor Ada",
        preachedAt: "2026-07-18",
        summary: "Sunday message",
        imageUrl: "/_bb/media/11111111-1111-4111-8111-111111111111",
        status: "draft",
      },
      { partial: false }
    );
    assert.equal(result.ok, true);
    assert.equal(result.fields.status, "draft");
    assert.equal(result.fields.imageUrl, "/_bb/media/11111111-1111-4111-8111-111111111111");
  });

  it("rejects a missing speaker and an impossible preached date", () => {
    const missingSpeaker = buildSermonFields(
      { title: "Living Hope", preachedAt: "2026-07-18", status: "draft" },
      { partial: false }
    );
    assert.equal(missingSpeaker.ok, false);
    assert.equal(missingSpeaker.reason, "speaker_name");

    const impossible = buildSermonFields(
      {
        title: "Living Hope",
        speakerName: "Pastor Ada",
        preachedAt: "2026-02-31",
        status: "draft",
      },
      { partial: false }
    );
    assert.equal(impossible.ok, false);
    assert.equal(impossible.reason, "preached_at");
  });

  it("leaves an existing sermon's date and thumbnail in place when the edit omits them", () => {
    const result = buildSermonFields({ summary: "Updated notes" }, { partial: true });
    assert.equal(result.ok, true);
    assert.equal(result.fields.summary, "Updated notes");
    assert.equal(Object.prototype.hasOwnProperty.call(result.fields, "preachedAt"), false);
    assert.equal(Object.prototype.hasOwnProperty.call(result.fields, "imageUrl"), false);
    assert.equal(Object.prototype.hasOwnProperty.call(result.fields, "title"), false);
  });
});
