"use strict";

/**
 * V2.04 Phase 2 — platform website lifecycle completeness (availability sync
 * registry + multi-site pending aggregation). No DB required.
 */

const { describe, it, afterEach } = require("node:test");
const assert = require("node:assert/strict");

const {
  ensureProductPlatformContracts,
} = require("../src/startup/ensureProductPlatformContracts");
const registry = require("../src/platform/contracts/productRuntimeRegistry");
const {
  aggregatePendingChangeSummaries,
} = require("../src/platform/website/websiteChangeManagerService");

describe("V2.04 Phase 2 platform lifecycle hooks", () => {
  afterEach(() => {
    // Restore real product handlers after test overrides.
    ensureProductPlatformContracts();
  });

  it("registers and invokes website availability sync without product hard-requires", async () => {
    ensureProductPlatformContracts();
    const calls = [];
    registry.registerWebsiteAvailabilitySync("blessboard", async (_db, instance, status) => {
      calls.push({ product: "blessboard", id: instance.id, status });
    });
    registry.registerWebsiteAvailabilitySync("activeclinic", async (_db, instance, status) => {
      calls.push({ product: "activeclinic", id: instance.id, status });
    });

    await registry.runWebsiteAvailabilitySync(
      {},
      { id: "bb-1", productCode: "blessboard", organizationId: "o1" },
      "PUBLIC"
    );
    await registry.runWebsiteAvailabilitySync(
      {},
      { id: "ac-1", productCode: "activeclinic", organizationId: "o2" },
      "OFFLINE"
    );
    await registry.runWebsiteAvailabilitySync(
      {},
      { id: "x", productCode: "unknown", organizationId: "o3" },
      "PUBLIC"
    );

    assert.equal(calls.length, 2);
    assert.deepEqual(calls[0], { product: "blessboard", id: "bb-1", status: "PUBLIC" });
    assert.deepEqual(calls[1], { product: "activeclinic", id: "ac-1", status: "OFFLINE" });

    const described = registry.describeProductRuntimeContracts();
    assert.ok(described.websiteAvailabilitySyncHandlers.includes("blessboard"));
    assert.ok(described.websiteAvailabilitySyncHandlers.includes("activeclinic"));
  });

  it("aggregates pending change summaries across multiple instance ids", async () => {
    const empty = await aggregatePendingChangeSummaries(
      {},
      { organizationId: "org", instanceIds: [] }
    );
    assert.equal(empty.ok, true);
    assert.equal(empty.pendingChangeCount, 0);
    assert.equal(empty.hasPendingChanges, false);

    const missing = await aggregatePendingChangeSummaries({}, {});
    assert.equal(missing.ok, true);
    assert.equal(missing.pendingChangeCount, 0);
  });
});
