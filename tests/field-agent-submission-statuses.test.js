"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const {
  canTransition,
  OPEN_PIPELINE_STATUSES,
  STATUSES,
  normalizeStatus,
} = require("../src/fieldAgent/fieldAgentSubmissionStatuses");

test("normalizeStatus accepts all canonical values", () => {
  assert.equal(normalizeStatus("PENDING"), "pending");
  assert.equal(normalizeStatus("Info_Needed"), "info_needed");
  assert.equal(normalizeStatus("bad"), null);
});

test("OPEN_PIPELINE_STATUSES includes pending, info_needed, approved, appealed", () => {
  assert.ok(OPEN_PIPELINE_STATUSES.includes("pending"));
  assert.ok(OPEN_PIPELINE_STATUSES.includes("info_needed"));
  assert.ok(OPEN_PIPELINE_STATUSES.includes("approved"));
  assert.ok(OPEN_PIPELINE_STATUSES.includes("appealed"));
  assert.equal(OPEN_PIPELINE_STATUSES.includes("rejected"), false);
});

test("canTransition reflects documented moderation paths", () => {
  assert.equal(canTransition("pending", "approved"), true);
  assert.equal(canTransition("pending", "rejected"), true);
  assert.equal(canTransition("pending", "info_needed"), true);
  assert.equal(canTransition("info_needed", "approved"), true);
  assert.equal(canTransition("rejected", "appealed"), true);
  assert.equal(canTransition("appealed", "approved"), true);
  assert.equal(canTransition("appealed", "info_needed"), true);
  assert.equal(canTransition("approved", "rejected"), false);
});

test("STATUSES constants are stable strings", () => {
  assert.equal(STATUSES.INFO_NEEDED, "info_needed");
  assert.equal(STATUSES.APPEALED, "appealed");
});
