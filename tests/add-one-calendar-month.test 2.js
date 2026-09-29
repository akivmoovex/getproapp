"use strict";

/**
 * UTC one-calendar-month arithmetic for Growth trial ends_at.
 */

const assert = require("node:assert/strict");
const { describe, it } = require("node:test");
const { addOneCalendarMonthUtc } = require("../src/platform/time/addOneCalendarMonth");

describe("addOneCalendarMonthUtc", () => {
  it("January 15 → February 15 (same clock time UTC)", () => {
    const start = new Date(Date.UTC(2026, 0, 15, 12, 30, 45, 123));
    const end = addOneCalendarMonthUtc(start);
    assert.equal(end.toISOString(), "2026-02-15T12:30:45.123Z");
  });

  it("January 31 → last valid day of February (non-leap)", () => {
    const start = new Date(Date.UTC(2026, 0, 31, 8, 0, 0, 0));
    const end = addOneCalendarMonthUtc(start);
    assert.equal(end.toISOString(), "2026-02-28T08:00:00.000Z");
  });

  it("Leap-year January 31 → February 29", () => {
    const start = new Date(Date.UTC(2024, 0, 31, 18, 0, 0, 0));
    const end = addOneCalendarMonthUtc(start);
    assert.equal(end.toISOString(), "2024-02-29T18:00:00.000Z");
  });

  it("March 31 → April 30", () => {
    const start = new Date(Date.UTC(2026, 2, 31, 0, 0, 0, 0));
    const end = addOneCalendarMonthUtc(start);
    assert.equal(end.toISOString(), "2026-04-30T00:00:00.000Z");
  });

  it("December dates roll into the next year", () => {
    const start = new Date(Date.UTC(2026, 11, 20, 9, 15, 0, 0));
    const end = addOneCalendarMonthUtc(start);
    assert.equal(end.toISOString(), "2027-01-20T09:15:00.000Z");
  });

  it("does not use a fixed 30-day duration", () => {
    const start = new Date(Date.UTC(2026, 0, 1, 0, 0, 0, 0));
    const end = addOneCalendarMonthUtc(start);
    const thirtyDays = new Date(start.getTime() + 30 * 24 * 60 * 60 * 1000);
    assert.notEqual(end.toISOString(), thirtyDays.toISOString());
    assert.equal(end.toISOString(), "2026-02-01T00:00:00.000Z");
  });
});
