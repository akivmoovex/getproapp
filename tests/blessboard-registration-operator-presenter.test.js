"use strict";

/**
 * Prompt 48 — operator presenter + queue mapping for registration applications.
 */

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const {
  presentRegistrationOperatorView,
  QUEUES,
  ACTIONS,
  DISPLAY,
} = require("../src/blessboard/services/registrationOperatorPresenter");

describe("registration operator presenter", () => {
  it("1. auto-provisioned Foundation displays Provisioned", () => {
    const view = presentRegistrationOperatorView({
      selected_plan: "foundation",
      application_status: "closed",
      provisioning_status: "provisioned",
      organization_key: "grace-chapel",
    });
    assert.equal(view.displayStatus, DISPLAY.PROVISIONED);
    assert.equal(view.queue, QUEUES.PROVISIONED);
    assert.equal(view.recommendedAction, ACTIONS.VIEW_ORGANIZATION);
    assert.match(view.explanation, /Foundation/i);
  });

  it("2. auto-provisioned Growth displays Provisioned with Growth Trial", () => {
    const view = presentRegistrationOperatorView({
      selected_plan: "growth",
      application_status: "closed",
      provisioning_status: "provisioned",
      organization_key: "growth-church",
      subscriptionStatus: "trialing",
    });
    assert.match(view.displayStatus, /Provisioned/);
    assert.match(view.displayStatus, /Growth Trial/i);
    assert.equal(view.queue, QUEUES.PROVISIONED);
  });

  it("3. Foundation duplicate review displays Needs review", () => {
    const view = presentRegistrationOperatorView({
      selected_plan: "foundation",
      application_status: "duplicate_review",
      provisioning_status: "not_started",
    });
    assert.equal(view.displayStatus, DISPLAY.NEEDS_REVIEW);
    assert.equal(view.queue, QUEUES.NEEDS_REVIEW);
    assert.equal(view.recommendedAction, ACTIONS.APPROVE_AND_PROVISION);
  });

  it("4. Growth held for review displays Needs review", () => {
    const view = presentRegistrationOperatorView({
      selected_plan: "growth",
      application_status: "submitted",
      provisioning_status: "not_started",
    });
    assert.equal(view.displayStatus, DISPLAY.NEEDS_REVIEW);
    assert.equal(view.recommendedAction, ACTIONS.APPROVE_AND_PROVISION);
  });

  it("5. provisioning failure displays Retry provisioning", () => {
    const view = presentRegistrationOperatorView({
      selected_plan: "foundation",
      application_status: "submitted",
      provisioning_status: "provisioning_failed",
    });
    assert.equal(view.displayStatus, DISPLAY.PROVISIONING_FAILED);
    assert.equal(view.queue, QUEUES.PROVISIONING_FAILED);
    assert.equal(view.recommendedAction, ACTIONS.RETRY_PROVISIONING);
  });

  it("6. Network new application displays Network validation", () => {
    const view = presentRegistrationOperatorView({
      selected_plan: "network",
      application_status: "submitted",
      provisioning_status: "not_started",
      follow_up_status: "validation_pending",
      support_requested: true,
    });
    assert.equal(view.displayStatus, DISPLAY.NETWORK_VALIDATION);
    assert.equal(view.queue, QUEUES.NETWORK_VALIDATION);
  });

  it("7. Network validation complete displays Ready for approval", () => {
    const view = presentRegistrationOperatorView({
      selected_plan: "network",
      application_status: "submitted",
      provisioning_status: "not_started",
      follow_up_status: "approved_for_provision",
      support_requested: true,
    });
    assert.equal(view.displayStatus, DISPLAY.READY_FOR_APPROVAL);
    assert.equal(view.queue, QUEUES.NETWORK_READY);
    assert.equal(view.recommendedAction, ACTIONS.APPROVE_NETWORK_ORGANIZATION);
  });

  it("14. raw internal statuses are not used as the primary UI label", () => {
    const view = presentRegistrationOperatorView({
      selected_plan: "foundation",
      application_status: "duplicate_review",
      provisioning_status: "not_started",
      follow_up_status: "validation_in_progress",
    });
    assert.notEqual(view.displayStatus, "duplicate_review");
    assert.notEqual(view.displayStatus, "not_started");
    assert.notEqual(view.displayStatus, "validation_in_progress");
  });
});

describe("registration operator UI contracts", () => {
  const root = path.join(__dirname, "..");
  function read(rel) {
    return fs.readFileSync(path.join(root, rel), "utf8");
  }

  it("15. dashboard cards link to filtered queues", () => {
    const dash = read("views/blessboard/v5/platform-admin/dashboard.ejs");
    assert.match(dash, /queue=needs_review/);
    assert.match(dash, /queue=provisioning_failed/);
    assert.match(dash, /queue=network_validation/);
    assert.match(dash, /queue=network_ready/);
    assert.match(dash, /queue=provisioned/);
  });

  it("16. list uses mobile cards and operator display status", () => {
    const list = read("views/blessboard/v5/platform-admin/registration-applications.ejs");
    assert.match(list, /data-bb-pa-reg-cards="1"/);
    assert.match(list, /data-bb-pa-display-status/);
    assert.match(list, /data-bb-pa-reg-guide="1"/);
    assert.match(list, /How registration works/);
    assert.doesNotMatch(list, /labelStatus\(row\.applicationStatus\)/);
  });

  it("17. technical details are collapsed by default", () => {
    const detail = read("views/blessboard/v5/platform-admin/registration-application-detail.ejs");
    assert.match(detail, /data-bb-pa-tech-details/);
    assert.match(detail, /<details[^>]*data-bb-pa-tech-details/);
    assert.doesNotMatch(detail, /<details[^>]*\bopen\b[^>]*data-bb-pa-tech-details/);
    assert.match(detail, /data-bb-pa-display-status="1"/);
    assert.match(detail, /mark-validation-complete/);
    assert.match(detail, /Approve and create organization|Approve and provision/);
  });
});
