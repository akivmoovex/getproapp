"use strict";

/**
 * V10 PC10 — Platform publication convergence architecture guard.
 *
 * Shape:
 *   platform publicationOrchestrator (authz + dispatch + soft TX)
 *     + BB publication governance adapter
 *     + AC publication governance adapter
 *
 * Compatibility services remain; workflows stay product-shaped.
 */

const { describe, it, before } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), "utf8");
}

describe("PC10 platform publication convergence", () => {
  before(() => {
    require("../src/blessboard/bootstrap/registerBlessBoardPlatformContracts").registerBlessBoardPlatformContracts();
    require("../src/activeclinic/bootstrap/registerActiveClinicPlatformContracts").registerActiveClinicPlatformContracts();
  });

  it("platform shared publication surface exists", () => {
    const orch = require("../src/platform/website/publicationOrchestrator");
    const tx = require("../src/platform/website/publicationTransaction");
    assert.equal(typeof orch.publish, "function");
    assert.equal(typeof orch.unpublish, "function");
    assert.equal(typeof orch.restore, "function");
    assert.equal(typeof orch.invokePublicationAuthorization, "function");
    assert.equal(typeof orch.createPublicationVersion, "function");
    assert.equal(typeof orch.runSoftSavepoint, "function");
    assert.equal(typeof tx.runSoftSavepoint, "function");
    assert.equal(orch.runSoftSavepoint, tx.runSoftSavepoint);
  });

  it("BB and AC governance adapters exist and expose product workflows", () => {
    const bb = require("../src/blessboard/website/blessboardPublicationGovernanceAdapter");
    const ac = require("../src/activeclinic/website/activeClinicPublicationGovernanceAdapter");
    assert.equal(bb.PRODUCT_CODE, "blessboard");
    assert.equal(ac.PRODUCT_CODE, "activeclinic");
    assert.equal(typeof bb.publish, "function");
    assert.equal(typeof bb.unpublish, "function");
    assert.equal(typeof bb.restore, "function");
    assert.equal(typeof ac.publish, "function");
    assert.equal(typeof ac.unpublish, "function");
    assert.equal(typeof ac.restore, "function");
    assert.equal(typeof ac.submit, "function");
    assert.equal(typeof bb.submit, "undefined");
  });

  it("bootstraps register lifecycle through governance adapters", () => {
    const bbBoot = read("src/blessboard/bootstrap/registerBlessBoardPlatformContracts.js");
    const acBoot = read("src/activeclinic/bootstrap/registerActiveClinicPlatformContracts.js");
    assert.match(bbBoot, /blessboardPublicationGovernanceAdapter/);
    assert.match(bbBoot, /registerPublicationGovernance/);
    assert.match(acBoot, /activeClinicPublicationGovernanceAdapter/);
    assert.match(acBoot, /registerPublicationGovernance/);
    assert.doesNotMatch(bbBoot, /if\s*\(\s*productCode\s*===\s*['\"]activeclinic['\"]/);
    assert.doesNotMatch(acBoot, /if\s*\(\s*productCode\s*===\s*['\"]blessboard['\"]/);
  });

  it("lifecycle resolves publish/unpublish/restore for both products via adapters", () => {
    const orch = require("../src/platform/website/publicationOrchestrator");
    for (const code of ["blessboard", "activeclinic"]) {
      const handlers = orch.resolvePublicationGovernance(code);
      assert.equal(typeof handlers.publish, "function", code);
      assert.equal(typeof handlers.unpublish, "function", code);
      assert.equal(typeof handlers.restore, "function", code);
    }
  });

  it("retains implementation services behind adapters (no premature deletes)", () => {
    assert.equal(
      fs.existsSync(path.join(ROOT, "src/blessboard/services/churchWebsitePublishService.js")),
      true
    );
    assert.equal(
      fs.existsSync(path.join(ROOT, "src/platform/website/publicationService.js")),
      true
    );
    assert.equal(
      fs.existsSync(path.join(ROOT, "src/platform/website/submissionService.js")),
      true
    );
  });

  it("HTTP publish/unpublish entry points use publicationOrchestrator (PL04) via PublishWorkflow facade", () => {
    const bbEditor = read("src/blessboard/http/blessboardWebsiteEditorRoutes.js");
    const bbAdmin = read("src/blessboard/http/churchWebsiteAdminRoutes.js");
    const acRoutes = read("src/activeclinic/http/activeClinicWebsiteRoutes.js");
    const draftPublish = read("src/blessboard/services/websiteDraftPublishService.js");
    const changeSub = read("src/blessboard/services/websiteChangeSubmissionService.js");
    const workflow = read("src/platform/website/publishWorkflow.js");
    assert.match(workflow, /publicationOrchestrator/);
    assert.match(workflow, /PublishWorkflow/);
    assert.match(bbEditor, /publicationOrchestrator|publishWorkflow/);
    assert.match(bbAdmin, /publicationOrchestrator|publishWorkflow/);
    assert.match(acRoutes, /publicationOrchestrator|publishWorkflow/);
    assert.match(draftPublish, /publicationOrchestrator/);
    assert.match(changeSub, /publicationOrchestrator/);
    assert.doesNotMatch(bbEditor, /require\([^\)]*churchWebsitePublishService/);
    assert.doesNotMatch(acRoutes, /publicationService\.publishWebsiteDraft/);
    assert.doesNotMatch(acRoutes, /publicationService\.unpublishWebsite/);
    assert.match(acRoutes, /\/website\/submit/);
    assert.match(acRoutes, /\/website\/unpublish/);
  });

  it("church publish and engine bridge use platform soft savepoint helper", () => {
    const church = read("src/blessboard/services/churchWebsitePublishService.js");
    const bridge = read("src/platform/website-engine/blessboardBridge.js");
    assert.match(church, /publicationTransaction/);
    assert.match(church, /runSoftSavepoint/);
    assert.match(bridge, /publicationTransaction/);
    assert.match(bridge, /runSoftSavepoint/);
    assert.doesNotMatch(church, /SAVEPOINT bb_publish_engine_project/);
    assert.doesNotMatch(bridge, /SAVEPOINT bb_engine_seo_project/);
  });

  it("publicationOrchestrator has no product-conditional forest", () => {
    const orch = read("src/platform/website/publicationOrchestrator.js");
    assert.doesNotMatch(orch, /productCode\s*===\s*['\"]blessboard['\"]/);
    assert.doesNotMatch(orch, /productCode\s*===\s*['\"]activeclinic['\"]/);
    assert.doesNotMatch(orch, /if\s*\(\s*isBlessBoard/);
    assert.doesNotMatch(orch, /if\s*\(\s*isActiveClinic/);
  });

  it("authorization gate still blocks publish without website.publish", async () => {
    const orch = require("../src/platform/website/publicationOrchestrator");
    let calls = 0;
    orch.registerPublicationGovernance("pc10_probe", {
      publish: async () => {
        calls += 1;
        return { ok: true };
      },
    });
    const denied = await orch.publish(null, {
      productCode: "pc10_probe",
      grantedPermissions: ["website.edit"],
      request: {},
    });
    assert.equal(denied.ok, false);
    assert.equal(denied.stage, orch.STAGE.PERMISSION);
    assert.equal(calls, 0);
    const allowed = await orch.publish(null, {
      productCode: "pc10_probe",
      grantedPermissions: ["website.publish"],
      request: {},
    });
    assert.equal(allowed.ok, true);
    assert.equal(calls, 1);
  });
});
