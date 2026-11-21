"use strict";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const {
  normalizeStructuredSermonPayload,
  normalizeStructuredEventPayload,
} = require("../../../src/blessboard/services/websiteStructuredDraftService");

const ROOT = path.join(__dirname, "../../..");

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), "utf8");
}

describe("D26 and D27 browser workflow contracts", () => {
  it("maps a sermon date onto the preached date the public page reads", () => {
    const sermon = normalizeStructuredSermonPayload({
      title: "New sermon",
      date: "2026-11-21",
      description: "A distinct sermon",
    });
    assert.equal(sermon.title, "New sermon");
    assert.equal(sermon.summary, "A distinct sermon");
    assert.ok(String(sermon.preachedAt).startsWith("2026-11-21"));
    const event = normalizeStructuredEventPayload({
      title: "New event",
      date: "2026-12-01",
      startTime: "09:30",
      description: "Gathering",
    });
    assert.equal(event.summary, "Gathering");
    assert.ok(String(event.startsAt).includes("2026-12-01"));
  });

  it("keeps the theme gallery token as the cookie token", () => {
    const source = read("src/activeclinic/http/activeClinicWebsiteCmsRoutes.js");
    assert.match(source, /options\.csrfToken/);
    assert.match(source, /csrfToken,\s*\n\s*content: "app\/settings-website-themes\.ejs"/);
    const client = read("public/platform/website-theme-gallery.js");
    assert.match(client, /X-CSRF-Token/);
    assert.match(client, /Theme saved to draft/);
  });

  it("shows walk-in guidance when a facility has no service points", () => {
    const page = read("views/activeclinic/app/reception-walk-in-content.ejs");
    assert.match(page, /data-ac-walkin-empty="1"/);
    assert.match(page, /another facility are not listed/);
    assert.match(page, /does not turn on public booking/);
  });

  it("lets a nurse start triage without giving that action to a receptionist", () => {
    const queue = read("views/activeclinic/app/clinical-queue-content.ejs");
    assert.match(queue, /data-ac-action="record-vitals"/);
    assert.match(queue, /Start triage/);
    assert.match(queue, /patient_id=/);
    const routes = read("src/activeclinic/http/activeClinicClinicalRoutes.js");
    assert.match(routes, /requirePermission\(\[PERM\.MANAGE, PERM\.TRIAGE\]\)/);
    const service = read("src/activeclinic/services/activeClinicClinicalService.js");
    assert.match(service, /permissionKey: PERM\.TRIAGE/);
  });

  it("keeps public booking closed and recovery on the testing outbox", () => {
    const booking = read("src/activeclinic/http/activeClinicPublicBookingRoutes.js");
    assert.match(booking, /publicBookingEnabled !== true/);
    assert.match(booking, /Booking not available/);
    const recovery = read("src/activeclinic/services/activeClinicPasswordRecoveryService.js");
    assert.match(recovery, /testing_outbox/);
    assert.doesNotMatch(recovery, /sendSms|twilio|live email/i);
  });

  it("opens add sermon and add event as create actions", () => {
    const sermons = read("views/blessboard/v5/public/sermons.ejs");
    const events = read("views/blessboard/v5/public/events.ejs");
    assert.match(sermons, /editButtonText: 'Add sermon'/);
    assert.match(sermons, /editDialogTitle: 'Add sermon'/);
    assert.match(events, /editButtonText: 'Add event'/);
    assert.doesNotMatch(events, /<span class="bb-tp-se-hint">Add event<\/span>/);
    const editor = read("public/blessboard/v5/website-structured-edit.js");
    assert.match(editor, /preachedAt:/);
    assert.match(editor, /startsAt:/);
    assert.match(editor, /Add sermon/);
  });
});
