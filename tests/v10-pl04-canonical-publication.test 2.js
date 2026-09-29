"use strict";

/**
 * V10 PL04 — Canonical publication entry characterization.
 *
 * platform publicationOrchestrator + BB/AC governance adapters are the only
 * HTTP/workflow publish entry. Compatibility services remain as impl.
 */

const { describe, it, before } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), "utf8");
}

describe("PL04 canonical publication", () => {
  before(() => {
    require("../src/blessboard/bootstrap/registerBlessBoardPlatformContracts").registerBlessBoardPlatformContracts();
    require("../src/activeclinic/bootstrap/registerActiveClinicPlatformContracts").registerActiveClinicPlatformContracts();
  });

  it("orchestrator dispatches BB and AC without merging governance", async () => {
    const orch = require("../src/platform/website/publicationOrchestrator");
    const bb = orch.resolvePublicationGovernance("blessboard");
    const ac = orch.resolvePublicationGovernance("activeclinic");
    assert.equal(typeof bb.publish, "function");
    assert.equal(typeof ac.publish, "function");
    assert.notEqual(bb.publish, ac.publish);
    assert.equal(typeof ac.submit, "undefined");
    const acAdapter = require("../src/activeclinic/website/activeClinicPublicationGovernanceAdapter");
    assert.equal(typeof acAdapter.submit, "function");
  });

  it("authorization gate denies publish without website.publish", async () => {
    const orch = require("../src/platform/website/publicationOrchestrator");
    let calls = 0;
    orch.registerPublicationGovernance("pl04_probe", {
      publish: async () => {
        calls += 1;
        return { ok: true };
      },
    });
    const denied = await orch.publish(null, {
      productCode: "pl04_probe",
      grantedPermissions: ["website.edit"],
      request: {},
    });
    assert.equal(denied.ok, false);
    assert.equal(calls, 0);
  });

  it("platform admin unpublish no longer requires churchWebsitePublishService directly", () => {
    const src = read("src/platform/website/platformAdminWebsitesService.js");
    assert.match(src, /publicationOrchestrator/);
    assert.doesNotMatch(src, /churchWebsitePublishService/);
  });

  it("classic CMS overlay→engine sync remains for BB classic paths", () => {
    const inline = read("src/blessboard/services/websiteInlineDraftService.js");
    const structured = read("src/blessboard/services/websiteStructuredDraftService.js");
    assert.match(inline, /syncDraftToEngine/);
    assert.match(structured, /syncDraftToEngine/);
  });
});
