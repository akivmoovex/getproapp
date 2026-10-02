"use strict";

/**
 * V2.05 Task 6 — Unified Publish Workflow (PublishWorkflow).
 * One canonical path for Admin Console Website + inline editor.
 * Does not create a second publishing engine.
 */

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const { PRODUCT_CODE } = require("../src/platform/website/publicWebsiteUrl");
const {
  PUBLISH_WORKFLOW,
  ENTRY,
  CANONICAL_FLOW,
  PRESERVED_CAPABILITIES,
  publish,
  unpublish,
  restore,
  buildPublishWorkflowPaths,
  detectPublishSuccessFromQuery,
  buildPostPublishState,
  safePublishReturnTo,
  buildPublishSuccessRedirect,
  attachPublishWorkflowToHub,
} = require("../src/platform/website/publishWorkflow");
const {
  buildWebsiteManagementHub,
  defaultAcWebsiteHubPaths,
  defaultBbWebsiteHubPaths,
} = require("../src/platform/website/websiteManagementHub");
const publicationOrchestrator = require("../src/platform/website/publicationOrchestrator");

const ROOT = path.join(__dirname, "..");

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), "utf8");
}

describe("V2.05 Unified Publish Workflow Batch6", () => {
  it("FINAL=V205_UNIFIED_PUBLISH_DONE", () => {
    assert.equal(PUBLISH_WORKFLOW.pattern, "PublishWorkflow");
    assert.equal(PUBLISH_WORKFLOW.engine, "publicationOrchestrator");
    assert.equal(PUBLISH_WORKFLOW.separatePublishEngine, false);
    assert.equal(PUBLISH_WORKFLOW.publishPermissionSeparateFromEdit, true);
    assert.ok(PUBLISH_WORKFLOW.entries.includes(ENTRY.ADMIN_CONSOLE));
    assert.ok(PUBLISH_WORKFLOW.entries.includes(ENTRY.WEBSITE_EDITOR));
    assert.equal(publish, publicationOrchestrator.publish);
    assert.equal(unpublish, publicationOrchestrator.unpublish);
    assert.equal(restore, publicationOrchestrator.restore);
    assert.deepEqual(CANONICAL_FLOW, [
      "edit",
      "save_draft",
      "preview",
      "change_manager",
      "publish_readiness",
      "confirm_publish",
      "publish",
      "live_site",
    ]);
    for (const cap of ["unpublish", "version_history", "historical_preview", "restore_as_new"]) {
      assert.ok(PRESERVED_CAPABILITIES.includes(cap), cap);
    }
  });

  it("AC_ADMIN_PUBLISH — Admin Console review GET + confirm POST share orchestrator", () => {
    const paths = buildPublishWorkflowPaths({
      productCode: PRODUCT_CODE.ACTIVECLINIC,
      organizationKey: "demo-clinic",
      canPublish: true,
      entry: ENTRY.ADMIN_CONSOLE,
    });
    assert.equal(paths.reviewPath, "/app/settings/website/publish");
    assert.equal(paths.confirmPath, "/clinics/demo-clinic/website/publish");
    assert.equal(paths.publishPath, paths.reviewPath);
    assert.equal(paths.previewDoesNotPublish, true);

    const hub = buildWebsiteManagementHub({
      productCode: PRODUCT_CODE.ACTIVECLINIC,
      clinicKey: "demo-clinic",
      paths: defaultAcWebsiteHubPaths({
        clinicKey: "demo-clinic",
        actions: {
          editWebsite: "/clinics/demo-clinic?website_edit=1",
          preview: "/clinics/demo-clinic?website_mode=draft",
          publishPath: "/clinics/demo-clinic/website/publish",
        },
      }),
      capabilities: { canEdit: true, canPublish: true },
      draftChangesCount: 1,
    });
    const publishMod = hub.modules.find((m) => m.key === "publish");
    assert.equal(publishMod.href, "/app/settings/website/publish");
    assert.equal(hub.publishWorkflow.reviewPath, "/app/settings/website/publish");
    assert.equal(hub.publishWorkflow.confirmPath, "/clinics/demo-clinic/website/publish");

    const acRoutes = read("src/activeclinic/http/activeClinicWebsiteRoutes.js");
    const acHub = read("views/activeclinic/app/settings-website-content.ejs");
    assert.match(acRoutes, /publishWorkflow/);
    assert.match(acRoutes, /buildPublishSuccessRedirect/);
    assert.match(acHub, /data-ac-website-action="publish"/);
    assert.match(acHub, /\/app\/settings\/website\/publish/);
    assert.match(acHub, /data-gp-publish-workflow="PublishWorkflow"/);
  });

  it("AC_EDITOR_PUBLISH — editor posts confirm path, success + Open Live + counter reset", () => {
    const paths = buildPublishWorkflowPaths({
      productCode: PRODUCT_CODE.ACTIVECLINIC,
      organizationKey: "demo-clinic",
      canPublish: true,
      entry: ENTRY.WEBSITE_EDITOR,
    });
    assert.equal(paths.editorPublishPath, "/clinics/demo-clinic/website/publish");

    const post = buildPostPublishState({
      productCode: PRODUCT_CODE.ACTIVECLINIC,
      organizationKey: "demo-clinic",
      paths,
    });
    assert.equal(post.publishSuccess, true);
    assert.equal(post.unpublishedChangeCount, 0);
    assert.equal(post.openLiveWebsiteLabel, "Open Live Website");
    assert.equal(post.publishSuccessUrl, "/clinics/demo-clinic");

    const chrome = read("views/platform/website-engine/editor-chrome.ejs");
    const attach = read("src/activeclinic/http/attachActiveClinicWebsiteChrome.js");
    assert.match(chrome, /Open Live Website/);
    assert.match(chrome, /data-website-open-live/);
    assert.match(chrome, /publish_entry/);
    assert.match(chrome, /returnTo/);
    assert.match(attach, /detectPublishSuccessFromQuery/);
    assert.match(attach, /buildPostPublishState/);
    assert.match(attach, /publishSuccess/);
    assert.equal(detectPublishSuccessFromQuery({ website: "published" }).publishSuccess, true);
  });

  it("BB_ADMIN_PUBLISH — review vs confirm stay distinct; tile never uses POST URL", () => {
    const paths = buildPublishWorkflowPaths({
      productCode: PRODUCT_CODE.BLESSBOARD,
      organizationKey: "demo-church",
      canPublish: true,
      entry: ENTRY.ADMIN_CONSOLE,
    });
    assert.equal(paths.reviewPath, "/hq/website/publish/review");
    assert.equal(paths.confirmPath, "/hq/website/publish");
    assert.notEqual(paths.reviewPath, paths.confirmPath);

    const hub = buildWebsiteManagementHub({
      productCode: PRODUCT_CODE.BLESSBOARD,
      organizationKey: "demo-church",
      paths: defaultBbWebsiteHubPaths({
        organizationKey: "demo-church",
        actions: {
          editWebsite: "/c/demo-church?website_edit=1",
          preview: "/hq/content/preview/home",
          publishPath: "/hq/website/publish",
        },
      }),
      capabilities: { canEdit: true, canPublish: true },
    });
    assert.equal(hub.publishWorkflow.reviewPath, "/hq/website/publish/review");
    assert.equal(hub.modules.find((m) => m.key === "publish").href, "/hq/website/publish/review");

    const bbHub = read("views/blessboard/v5/hq/website-management.ejs");
    const bbAdmin = read("src/blessboard/http/churchWebsiteAdminRoutes.js");
    assert.match(bbHub, /publish-review/);
    assert.match(bbHub, /publishReviewHref/);
    assert.match(bbAdmin, /publishWorkflow/);
    assert.match(bbAdmin, /publishReviewHref/);
    assert.match(bbAdmin, /confirmPath/);
  });

  it("BB_EDITOR_PUBLISH — instance publish route + success banner", () => {
    const paths = buildPublishWorkflowPaths({
      productCode: PRODUCT_CODE.BLESSBOARD,
      organizationKey: "demo-church",
      canPublish: true,
      entry: ENTRY.WEBSITE_EDITOR,
    });
    assert.equal(paths.editorPublishPath, "/c/demo-church/website/publish");
    assert.equal(paths.confirmPath, "/hq/website/publish");

    const bbEditor = read("src/blessboard/http/blessboardWebsiteEditorRoutes.js");
    const bbChrome = read("src/blessboard/http/attachWebsiteAdminChrome.js");
    assert.match(bbEditor, /publishWorkflow/);
    assert.match(bbEditor, /website_published/);
    assert.match(bbChrome, /publishSuccess/);
    assert.match(bbChrome, /Open Live Website/);
  });

  it("AUTHORIZATION — publish capability separate from edit; unauthorized denied in UI", () => {
    const denied = buildPublishWorkflowPaths({
      productCode: PRODUCT_CODE.ACTIVECLINIC,
      organizationKey: "demo",
      canPublish: false,
      canEdit: true,
    });
    assert.equal(denied.canEdit, true);
    assert.equal(denied.canPublish, false);
    assert.equal(denied.confirmPath, null);
    assert.equal(denied.editorPublishPath, null);
    assert.equal(denied.unpublishPath, null);

    const acHub = read("views/activeclinic/app/settings-website-content.ejs");
    const bbHub = read("views/blessboard/v5/hq/website-management.ejs");
    assert.match(acHub, /publish-denied|Publish requires permission/);
    assert.match(bbHub, /Editing and publishing require additional permission|canPublish/);
  });

  it("draft-only editor denied publish — canPublish gates chrome + hub", () => {
    const shellDenied = attachPublishWorkflowToHub(
      {
        productCode: PRODUCT_CODE.ACTIVECLINIC,
        modules: [{ key: "publish", href: "/x", visible: true }],
      },
      { canPublish: false, clinicKey: "demo", organizationKey: "demo" }
    );
    assert.equal(shellDenied.publishWorkflow.confirmPath, null);

    const chrome = read("views/platform/website-engine/editor-chrome.ejs");
    assert.match(chrome, /shell\.canPublish && \(shell\.publishHref \|\| shell\.publishPath\)/);
  });

  it("preview does not publish", () => {
    const paths = buildPublishWorkflowPaths({
      productCode: PRODUCT_CODE.BLESSBOARD,
      organizationKey: "demo",
      canPublish: true,
    });
    assert.equal(paths.previewDoesNotPublish, true);
    assert.notEqual(paths.previewPath, paths.confirmPath);
    assert.notEqual(paths.previewPath, paths.editorPublishPath);

    const reminder = read("views/platform/website-engine/publishing-reminder.ejs");
    assert.doesNotMatch(reminder, /type="submit"/);
    assert.match(reminder, /data-website-reminder-preview/);
  });

  it("VERSION_HISTORY + CHANGE_COUNTER + restore-as-new preserved", () => {
    const paths = buildPublishWorkflowPaths({
      productCode: PRODUCT_CODE.ACTIVECLINIC,
      organizationKey: "demo",
      canPublish: true,
    });
    assert.ok(paths.historyPath);
    assert.ok(paths.historicalPreviewPath);
    assert.ok(paths.restoreAsNewPath);
    assert.ok(paths.unpublishPath);

    const post = buildPostPublishState({ paths, productCode: PRODUCT_CODE.ACTIVECLINIC });
    assert.equal(post.unpublishedChangeCount, 0);
    assert.equal(post.recalculateUnpublishedCount, true);
    assert.equal(post.versionPreserved, true);

    const contract = read("src/platform/website/websiteManagementFeatureContract.js");
    assert.match(contract, /RESTORE_AS_NEW/);
    assert.match(contract, /VERSION_HISTORY/);
    assert.match(contract, /CONFIRM_PUBLISH/);
  });

  it("tenant isolation — returnTo allow-list rejects cross-tenant paths", () => {
    assert.equal(
      safePublishReturnTo("/clinics/other/website", {
        productCode: "activeclinic",
        organizationKey: "demo",
      }),
      null
    );
    assert.equal(
      safePublishReturnTo("/clinics/demo?website_edit=1", {
        productCode: "activeclinic",
        organizationKey: "demo",
      }),
      "/clinics/demo?website_edit=1"
    );
    assert.equal(
      safePublishReturnTo("https://evil.example/", { productCode: "activeclinic", organizationKey: "demo" }),
      null
    );
    const redirect = buildPublishSuccessRedirect({
      productCode: PRODUCT_CODE.ACTIVECLINIC,
      organizationKey: "demo",
      clinicKey: "demo",
      entry: ENTRY.WEBSITE_EDITOR,
      returnTo: "/clinics/demo?website_edit=1",
    });
    assert.match(redirect, /website=published/);
  });

  it("AC + BB share platform publishing infrastructure (no second engine)", () => {
    const workflow = read("src/platform/website/publishWorkflow.js");
    assert.match(workflow, /publicationOrchestrator/);
    assert.doesNotMatch(workflow, /createSecondPublishEngine|new PublishEngine/);
    assert.equal(PUBLISH_WORKFLOW.separatePublishEngine, false);

    // Product readiness remains product-specific.
    assert.match(read("src/blessboard/services/churchWebsitePublishService.js"), /evaluatePublishReadiness/);
    assert.match(read("src/activeclinic/http/activeClinicWebsiteRoutes.js"), /setClinicWebsiteAvailability/);
  });
});
