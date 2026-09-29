"use strict";

/**
 * Focused tests: registration applications list filter normalization,
 * including the reported empty-query URL with visible_status=new.
 */

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const {
  normalizeListFilters,
} = require("../src/blessboard/services/registrationApplicationsAdminService");
const {
  applyVisibleStatusQuery,
} = require("../src/blessboard/services/registrationQueuePresentation");
const {
  QUEUES,
  queueFilterSpec,
} = require("../src/blessboard/services/registrationOperatorPresenter");

const REPORTED_QUERY = Object.freeze({
  q: "",
  visible_status: "new",
  selected_plan: "",
  limit: "25",
  queue: "",
  application_status: "",
  provisioning_status: "",
  follow_up_status: "",
  from: "",
  to: "",
  support_requested: "",
  requires_review: "",
  overdue_follow_up: "",
  linked: "all",
});

describe("registration applications filter normalization", () => {
  it("allows phase5_new in queueFilterSpec (visible_status=new)", () => {
    assert.equal(queueFilterSpec("phase5_new"), QUEUES.PHASE5_NEW);
    assert.equal(queueFilterSpec(""), null);
    assert.equal(queueFilterSpec("not-a-real-queue"), null);
  });

  it("reported empty-filter URL normalizes to 200-safe filters", () => {
    const mapped = applyVisibleStatusQuery({ ...REPORTED_QUERY });
    assert.equal(mapped.queue, "phase5_new");
    const result = normalizeListFilters(mapped);
    assert.equal(result.ok, true, result.reason || "expected ok");
    assert.equal(result.value.queue, "phase5_new");
    assert.equal(result.value.linked, "all");
    assert.equal(result.value.search, null);
    assert.equal(result.value.selectedPlan, null);
    assert.equal(result.value.applicationStatus, null);
    assert.equal(result.value.provisioningStatus, null);
    assert.equal(result.value.followUpStatus, null);
    assert.equal(result.value.createdFrom, null);
    assert.equal(result.value.createdToExclusive, null);
    assert.equal(result.value.supportRequested, null);
    assert.equal(result.value.requiresReview, null);
    assert.equal(result.value.overdueFollowUp, null);
    assert.equal(result.value.limit, 25);
  });

  it("empty query string normalizes with defaults", () => {
    const result = normalizeListFilters({});
    assert.equal(result.ok, true);
    assert.equal(result.value.queue, null);
    assert.equal(result.value.linked, "all");
  });

  it("linked=all / true / false map safely", () => {
    assert.equal(normalizeListFilters({ linked: "all" }).value.linked, "all");
    assert.equal(normalizeListFilters({ linked: "linked" }).value.linked, "linked");
    assert.equal(normalizeListFilters({ linked: "unlinked" }).value.linked, "unlinked");
    assert.equal(normalizeListFilters({ linked: "true" }).value.linked, "all");
    assert.equal(normalizeListFilters({ linked: "false" }).value.linked, "all");
  });

  it("empty booleans stay unset; invalid booleans fail controlled", () => {
    const empty = normalizeListFilters({
      support_requested: "",
      requires_review: "",
      overdue_follow_up: "",
    });
    assert.equal(empty.ok, true);
    assert.equal(empty.value.supportRequested, null);
    assert.equal(normalizeListFilters({ support_requested: "yes" }).value.supportRequested, true);
    assert.equal(normalizeListFilters({ support_requested: "no" }).value.supportRequested, false);
    assert.equal(normalizeListFilters({ support_requested: "maybe" }).ok, false);
  });

  it("empty dates ignored; invalid dates fail controlled", () => {
    assert.equal(normalizeListFilters({ from: "", to: "" }).ok, true);
    assert.equal(normalizeListFilters({ from: "2026-01-01", to: "2026-01-31" }).ok, true);
    assert.equal(normalizeListFilters({ from: "not-a-date" }).ok, false);
  });

  it("invalid limit snaps to nearest allowed", () => {
    const result = normalizeListFilters({ limit: "999" });
    assert.equal(result.ok, true);
    assert.ok([10, 25, 50, 100].includes(result.value.limit));
  });

  it("unknown application_status is ignored rather than 500", () => {
    const result = normalizeListFilters({ application_status: "not-real" });
    assert.equal(result.ok, true);
    assert.equal(result.value.applicationStatus, null);
  });
});
