"use strict";

/**
 * BB-03 — New event creation route/form/validation contracts.
 */

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");

const {
  validateEventBody,
  EVENT_VISIBILITIES,
} = require("../../../src/church/announcementsEventsValidation");
const { buildEventFields } = require("../../../src/blessboard/services/publicContentAdminService");

const ROOT = path.join(__dirname, "../../..");
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), "utf8");

describe("BB-03 new event contracts", () => {
  it("GET/POST branch event create routes and CSRF are present", () => {
    const src = read("src/routes/church/branchAdminEvents.js");
    assert.match(src, /router\.get\("\/branch\/events\/new"/);
    assert.match(src, /router\.post\("\/branch\/events"/);
    assert.match(src, /requireChurchSessionCsrf/);
    assert.match(src, /requireChurchBranchAdminSession/);
    assert.match(src, /createEventForBranch/);
    assert.match(src, /organization_id: org\.id/);
    assert.match(src, /branch_id: branch\.id/);
  });

  it("create form posts to /branch/events with required fields", () => {
    const form = read("views/church/branch-admin/event_form.ejs");
    assert.match(form, /method="post"/);
    assert.match(form, /action="<%= isEdit \? '\/branch\/events\/' \+ eventId : '\/branch\/events' %>"/);
    assert.match(form, /name="title"/);
    assert.match(form, /name="event_date"/);
    assert.match(form, /name="visibility"/);
  });

  it("validates required fields and visibility allowlist", () => {
    const bad = validateEventBody({ title: "", event_date: "", visibility: "public" });
    assert.equal(bad.ok, false);

    const good = validateEventBody({
      title: "Sunday Gathering",
      event_date: "2030-01-05",
      start_time: "10:00",
      end_time: "12:00",
      location: "Main hall",
      visibility: "public",
    });
    assert.equal(good.ok, true);
    assert.ok(EVENT_VISIBILITIES.includes("public"));
    assert.ok(EVENT_VISIBILITIES.includes("members"));

    const badVis = validateEventBody({
      title: "X",
      event_date: "2030-01-05",
      visibility: "everyone_everywhere",
    });
    assert.equal(badVis.ok, false);
  });

  it("GET /branch/events/new is registered before the :eventId route", () => {
    const src = read("src/routes/church/branchAdminEvents.js");
    const createAt = src.indexOf('router.get("/branch/events/new"');
    const paramAt = src.indexOf('"/branch/events/:eventId"');
    assert.ok(createAt > 0);
    assert.ok(paramAt > createAt);
  });

  it("branch create form posts to /branch/events with CSRF and save/publish intents", () => {
    const form = read("views/church/branch-admin/event_form.ejs");
    const list = read("views/church/branch-admin/events_management.ejs");
    assert.match(form, /csrf_field/);
    assert.match(form, /name="_intent" value="draft"/);
    assert.match(form, /name="_intent" value="publish"/);
    assert.match(form, /data-bb-submit-lock/);
    assert.match(list, /href="\/branch\/events\/new"/);
    assert.doesNotMatch(form, /name="item_id"/);
  });

  it("rejects invalid dates, impossible clock times, and end before start", () => {
    const badDate = validateEventBody({
      title: "Gathering",
      event_date: "18/07/2026",
      visibility: "public",
    });
    assert.equal(badDate.ok, false);

    const badClock = validateEventBody({
      title: "Gathering",
      event_date: "2030-01-05",
      start_time: "25:00",
      visibility: "members",
    });
    assert.equal(badClock.ok, false);

    const endFirst = validateEventBody({
      title: "Gathering",
      event_date: "2030-01-05",
      start_time: "10:00",
      end_time: "9:00 AM",
      visibility: "public",
    });
    assert.equal(endFirst.ok, false);
    assert.match(endFirst.error, /End time/);
  });

  it("BlessBoard content-admin events create is available, posts create, and keeps CSRF", () => {
    const src = read("src/blessboard/http/contentAdminRoutes.js");
    const page = read("views/blessboard/v5/content-admin/entities.ejs");
    const fields = read("views/blessboard/v5/content-admin/entity-fields.ejs");
    assert.match(src, /events:\s*\{[\s\S]*createFn: createEvent/);
    assert.match(src, /router\.post\(`\$\{p\}\/\$\{routeKey\}`/);
    assert.match(src, /validateCsrfPost/);
    assert.match(src, /gateContent/);
    assert.match(src, /action === "update"/);
    assert.match(src, /createFn\(getPool\(\)/);
    assert.match(src, /if \(!item \|\| item\.churchId !== scope\.churchId\) return false/);
    assert.match(page, /id="bb-ca-entity-create"/);
    assert.match(page, /data-bb-events-form="create"/);
    assert.match(page, /name="action" value="create"/);
    assert.match(page, /name="_csrf"/);
    assert.match(page, /createOpen \|\| isEvents/);
    assert.match(page, /data-bb-submit-lock/);
    assert.match(page, /data-bb-entity-action="new"/);
    assert.match(fields, /name="starts_at" type="datetime-local" required/);
    assert.match(fields, /name="title" type="text" required/);
    const createFormAt = page.indexOf('data-bb-events-form="create"');
    assert.ok(createFormAt > page.indexOf('id="bb-ca-entity-create-form"'));
    assert.doesNotMatch(page.slice(createFormAt, createFormAt + 700), /name="item_id"/);
  });

  it("publication requires confirm, and the public list is published public upcoming only", () => {
    const admin = read("src/blessboard/services/publicContentAdminService.js");
    const repo = read("src/db/pg/church/eventsRepo.js");
    assert.match(admin, /built\.fields\.status === "published"/);
    assert.match(admin, /requirePublishConfirm/);
    assert.match(admin, /reason: "confirm_publish"/);
    assert.match(repo, /e\.status = 'published'/);
    assert.match(repo, /e\.visibility = 'public'/);
    assert.match(repo, /e\.event_date >= CURRENT_DATE/);
    assert.match(repo, /WHERE e\.id = \$1 AND e\.branch_id = \$2/);

    const published = buildEventFields(
      {
        title: "Sunday Gathering",
        startsAt: "2030-01-05T10:00",
        timezone: "UTC",
        status: "published",
      },
      { partial: false }
    );
    assert.equal(published.ok, true);
    assert.equal(published.fields.status, "published");
    assert.equal(published.fields.startsAt, "2030-01-05T10:00:00.000Z");
  });

  it("content-admin create rejects a missing start, a bad instant, and an end before the start", () => {
    const missing = buildEventFields(
      { title: "Gathering", timezone: "UTC", status: "draft" },
      { partial: false }
    );
    assert.equal(missing.ok, false);
    assert.equal(missing.reason, "starts_at");

    const bad = buildEventFields(
      { title: "Gathering", startsAt: "next sunday", timezone: "UTC", status: "draft" },
      { partial: false }
    );
    assert.equal(bad.ok, false);
    assert.equal(bad.reason, "starts_at");

    const order = buildEventFields(
      {
        title: "Gathering",
        startsAt: "2030-01-05T12:00",
        endsAt: "2030-01-05T09:00",
        timezone: "UTC",
        status: "draft",
      },
      { partial: false }
    );
    assert.equal(order.ok, false);
    assert.equal(order.reason, "ends_at");
  });

  it("an update without a new start leaves the existing start untouched", () => {
    const patch = buildEventFields({ title: "Renamed gathering" }, { partial: true });
    assert.equal(patch.ok, true);
    assert.equal(patch.fields.title, "Renamed gathering");
    assert.equal(Object.prototype.hasOwnProperty.call(patch.fields, "startsAt"), false);
  });
});
