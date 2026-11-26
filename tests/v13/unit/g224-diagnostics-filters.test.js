"use strict";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const {
  canAttachLaboratoryResult,
  canAttachRadiologyReport,
  laboratoryQueueTabs,
  radiologyQueueTabs,
  laboratoryDashboardStats,
  radiologyDashboardStats,
} = require("../../../src/activeclinic/services/clinicalOperationsRules");

describe("G224 diagnostics filters", () => {
  it("keeps a received specimen eligible for result entry and hides it from the processing filter", () => {
    assert.equal(canAttachLaboratoryResult("received"), true);
    assert.equal(canAttachLaboratoryResult("resulted"), false);
    assert.equal(canAttachLaboratoryResult("verified"), false);
    const tabs = laboratoryQueueTabs({
      pending_collection: 1,
      collected: 0,
      received: 2,
      processing: 0,
      resulted: 0,
      verified: 0,
      total: 3,
    }, "received");
    const received = tabs.find((tab) => tab.key === "received");
    const processing = tabs.find((tab) => tab.key === "processing");
    assert.equal(received.count, 2);
    assert.equal(received.active, true);
    assert.equal(processing.count, 0);
    assert.equal(tabs.find((tab) => tab.key === "open").count, 3);
    const stats = laboratoryDashboardStats({
      pending_collection: 1,
      collected: 4,
      received: 2,
      processing: 0,
      resulted: 5,
      verified: 6,
      total: 18,
    });
    assert.equal(stats.collected, 4);
    assert.equal(stats.received, 2);
    assert.equal(stats.resulted, 5);
    assert.equal(stats.verified, 6);
  });

  it("counts completed radiology work separately from verified work", () => {
    const tabs = radiologyQueueTabs({
      pending: 1,
      in_progress: 0,
      completed: 3,
      verified: 0,
      total: 4,
    }, "completed");
    assert.equal(tabs.find((tab) => tab.key === "completed").count, 3);
    assert.equal(tabs.find((tab) => tab.key === "verified").count, 0);
    assert.equal(tabs.find((tab) => tab.key === "open").count, 4);
    const stats = radiologyDashboardStats({ completed: 3, pending: 1, total: 4 });
    assert.equal(stats.completed, 3);
    assert.equal(stats.verified, 0);
  });

  it("keeps reported radiology out of the open queue and eligible only before a report exists", () => {
    assert.equal(canAttachRadiologyReport("pending"), true);
    assert.equal(canAttachRadiologyReport("in_progress"), true);
    assert.equal(canAttachRadiologyReport("completed"), true);
    assert.equal(canAttachRadiologyReport("reported"), false);
    assert.equal(canAttachRadiologyReport("verified"), false);
    const tabs = radiologyQueueTabs({
      pending: 1,
      in_progress: 1,
      completed: 1,
      reported: 2,
      verified: 3,
      total: 8,
    }, "reported");
    assert.equal(tabs.find((tab) => tab.key === "open").count, 3);
    assert.equal(tabs.find((tab) => tab.key === "reported").count, 2);
    assert.equal(tabs.find((tab) => tab.key === "reported").active, true);
    const stats = radiologyDashboardStats({
      pending: 1,
      in_progress: 1,
      completed: 1,
      reported: 2,
      verified: 3,
      total: 8,
    });
    assert.equal(stats.reported, 2);
    assert.equal(stats.verified, 3);
  });
});