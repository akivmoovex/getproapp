"use strict";

/**
 * V2.05 Task 7 — Main Flow Integration.
 * End-to-end chain contract for AC + BB (no second engines).
 *
 * Register → Dashboard → Website → Live Preview → Edit → Save Draft
 * → 5-change PublishNudge → Preview → Change Manager → Publish → Live
 *
 * Desktop 1440 + Mobile 390 viewport markers verified.
 */

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const { PRODUCT_CODE } = require("../src/platform/website/publicWebsiteUrl");
const {
  postAuthDashboardPath,
  POST_AUTH_DASHBOARD,
} = require("../src/platform/auth/postAuthDashboard");
const {
  ADMIN_CONSOLE_SHELL,
  validateAdminConsoleNavOrder,
} = require("../src/platform/admin-console/adminConsoleShell");
const {
  WEBSITE_MANAGEMENT_HUB,
  buildWebsiteManagementHub,
  defaultAcWebsiteHubPaths,
  defaultBbWebsiteHubPaths,
} = require("../src/platform/website/websiteManagementHub");
const {
  WEBSITE_CONTENT_EDITING,
  canonicalEditorForProduct,
} = require("../src/platform/website/websiteContentEditing");
const {
  PUBLISH_NUDGE,
  buildPublishNudge,
  shouldShowPublishNudge,
} = require("../src/platform/website/publishNudge");
const {
  PUBLISH_WORKFLOW,
  ENTRY,
  CANONICAL_FLOW,
  buildPublishWorkflowPaths,
  publish,
} = require("../src/platform/website/publishWorkflow");
const { LIVE_PREVIEW } = require("../src/platform/website/livePreview");
const { VIEWPORT_WIDTHS } = require("../src/platform/website/responsiveViewport");
const publicationOrchestrator = require("../src/platform/website/publicationOrchestrator");

const ROOT = path.join(__dirname, "..");

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), "utf8");
}

const MAIN_FLOW_STEPS = Object.freeze([
  "register",
  "dashboard",
  "website",
  "live_preview",
  "edit",
  "save_draft",
  "publish_nudge_5",
  "preview",
  "change_manager",
  "publish",
  "live_website",
]);

describe("V2.05 Main Flow Integration Task7", () => {
  it("FINAL=V205_MAIN_FLOW_INTEGRATION_DONE", () => {
    assert.deepEqual(MAIN_FLOW_STEPS, [
      "register",
      "dashboard",
      "website",
      "live_preview",
      "edit",
      "save_draft",
      "publish_nudge_5",
      "preview",
      "change_manager",
      "publish",
      "live_website",
    ]);
    assert.equal(POST_AUTH_DASHBOARD.activeclinic, "/app");
    assert.equal(POST_AUTH_DASHBOARD.blessboard, "/hq");
    assert.equal(WEBSITE_MANAGEMENT_HUB.pattern, "WebsiteManagementHub");
    assert.equal(WEBSITE_CONTENT_EDITING.draftFirst, true);
    assert.equal(WEBSITE_CONTENT_EDITING.autoPublish, false);
    assert.equal(PUBLISH_NUDGE.threshold, 5);
    assert.equal(PUBLISH_WORKFLOW.engine, "publicationOrchestrator");
    assert.equal(PUBLISH_WORKFLOW.separatePublishEngine, false);
    assert.equal(publish, publicationOrchestrator.publish);
  });

  it("AC chain — Register → /app → Website hub → edit/preview/CM/publish/live", () => {
    assert.equal(postAuthDashboardPath("activeclinic"), "/app");
    assert.equal(WEBSITE_MANAGEMENT_HUB.adminRoutes.activeclinic, "/app/settings/website");

    const order = validateAdminConsoleNavOrder([
      { slot: "dashboard", href: "/app", label: "Dashboard" },
      { slot: "website", href: "/app/settings/website", label: "Website" },
    ]);
    assert.equal(order.ok, true);
    assert.equal(order.dashboardFirst, true);
    assert.equal(order.websiteSecond, true);
    assert.equal(ADMIN_CONSOLE_SHELL.websiteSlotOrder, 2);

    const paths = defaultAcWebsiteHubPaths({
      clinicKey: "demo-clinic",
      actions: {
        editWebsite: "/clinics/demo-clinic?website_edit=1",
        preview: "/clinics/demo-clinic?website_mode=draft",
        history: "/clinics/demo-clinic/website/history",
      },
    });
    assert.equal(paths.edit, "/clinics/demo-clinic?website_edit=1");
    assert.equal(paths.preview, "/clinics/demo-clinic?website_mode=draft");
    assert.equal(paths.changeManager, "/clinics/demo-clinic/website/unpublished-changes");
    assert.notEqual(paths.changeManager, paths.edit, "Change Manager must not alias Edit");
    assert.equal(paths.publish, "/app/settings/website/publish");
    assert.equal(paths.publishConfirm, "/clinics/demo-clinic/website/publish");

    const hub = buildWebsiteManagementHub({
      productCode: PRODUCT_CODE.ACTIVECLINIC,
      paths,
      capabilities: { canEdit: true, canPublish: true },
      draftChangesCount: 5,
      liveAvailable: true,
      exists: true,
      publicUrl: "/clinics/demo-clinic",
      clinicKey: "demo-clinic",
      organizationKey: "demo-clinic",
    });
    const cm = hub.modules.find((m) => m.key === "changeManager");
    const edit = hub.modules.find((m) => m.key === "edit");
    const publish = hub.modules.find((m) => m.key === "publish");
    const preview = hub.modules.find((m) => m.key === "preview");
    assert.ok(cm && cm.href.includes("unpublished-changes"));
    assert.ok(edit && edit.href.includes("website_edit=1"));
    assert.ok(preview && String(preview.href).includes("draft"));
    assert.equal(publish.href, "/app/settings/website/publish");
    assert.ok(hub.publishNudge);
    assert.equal(hub.publishNudge.visible, true);
    assert.equal(hub.publishWorkflow.engine, "publicationOrchestrator");
    assert.equal(hub.publishWorkflow.livePath || hub.status.publicUrl, "/clinics/demo-clinic");
    assert.ok(
      String(hub.publishNudge.actions.reviewChanges.href || "").includes("unpublished-changes")
    );

    const editor = canonicalEditorForProduct(PRODUCT_CODE.ACTIVECLINIC);
    assert.equal(editor.adminEntry, "/app/settings/website");
    assert.equal(editor.editQuery.website_mode, "draft");
    assert.ok(WEBSITE_CONTENT_EDITING.capabilities.includes("save_draft"));
    assert.ok(WEBSITE_CONTENT_EDITING.capabilities.includes("youtube_embed"));

    assert.equal(shouldShowPublishNudge(5), true);
    assert.equal(shouldShowPublishNudge(4), false);
    const nudge = buildPublishNudge({
      unpublishedChangeCount: 5,
      productCode: PRODUCT_CODE.ACTIVECLINIC,
      canPublish: true,
      reviewHref: paths.changeManager,
      publishHref: paths.publish,
      previewHref: paths.preview,
    });
    assert.equal(nudge.visible, true);
    assert.equal(nudge.forcesPublish, false);
    assert.ok(String(nudge.actions.reviewChanges.href || "").includes("unpublished-changes"));

    const wf = buildPublishWorkflowPaths({
      productCode: PRODUCT_CODE.ACTIVECLINIC,
      organizationKey: "demo-clinic",
      canPublish: true,
      entry: ENTRY.ADMIN_CONSOLE,
      previewPath: paths.preview,
      editPath: paths.edit,
      changeManagerPath: paths.changeManager,
      livePath: "/clinics/demo-clinic",
    });
    assert.deepEqual(wf.canonicalFlow.slice(0, 4), CANONICAL_FLOW.slice(0, 4));
    assert.equal(wf.previewDoesNotPublish, true);
    assert.notEqual(wf.previewPath, wf.confirmPath);
    assert.equal(wf.changeManagerPath, paths.changeManager);
    assert.equal(wf.reviewPath, paths.publish);
    assert.equal(wf.confirmPath, paths.publishConfirm);
    assert.equal(wf.openLiveWebsitePath, "/clinics/demo-clinic");
  });

  it("BB chain — Register → /hq → Website hub → edit/preview/CM/publish/live", () => {
    assert.equal(postAuthDashboardPath("blessboard"), "/hq");
    assert.equal(WEBSITE_MANAGEMENT_HUB.adminRoutes.blessboard, "/hq/website");

    const order = validateAdminConsoleNavOrder([
      { slot: "dashboard", href: "/hq", label: "Dashboard" },
      { slot: "website", href: "/hq/website", label: "Website" },
    ]);
    assert.equal(order.ok, true);

    const paths = defaultBbWebsiteHubPaths({
      organizationKey: "demo-church",
      actions: {
        editWebsite: "/c/demo-church?website_edit=1",
        preview: "/hq/content/preview/home",
        history: "/hq/website/publishing-history",
      },
    });
    assert.equal(paths.edit, "/c/demo-church?website_edit=1");
    assert.equal(paths.changeManager, "/hq/content/draft-changes");
    assert.notEqual(paths.changeManager, paths.edit);
    assert.equal(paths.publish, "/hq/website/publish/review");
    assert.equal(paths.publishConfirm, "/hq/website/publish");

    const hub = buildWebsiteManagementHub({
      productCode: PRODUCT_CODE.BLESSBOARD,
      paths,
      capabilities: { canEdit: true, canPublish: true },
      draftChangesCount: 5,
      liveAvailable: true,
      exists: true,
      publicUrl: "/c/demo-church",
      organizationKey: "demo-church",
    });
    assert.ok(hub.modules.some((m) => m.key === "changeManager" && m.href === "/hq/content/draft-changes"));
    assert.ok(hub.publishNudge && hub.publishNudge.visible === true);
    assert.equal(hub.publishWorkflow.engine, "publicationOrchestrator");

    const editor = canonicalEditorForProduct(PRODUCT_CODE.BLESSBOARD);
    assert.equal(editor.adminEntry, "/hq/website");
    assert.equal(editor.editQuery.website_edit, "1");

    const wf = buildPublishWorkflowPaths({
      productCode: PRODUCT_CODE.BLESSBOARD,
      organizationKey: "demo-church",
      canPublish: true,
      entry: ENTRY.ADMIN_CONSOLE,
      previewPath: paths.preview,
      changeManagerPath: paths.changeManager,
      livePath: "/c/demo-church",
    });
    assert.equal(wf.changeManagerPath, "/hq/content/draft-changes");
    assert.equal(wf.reviewPath, "/hq/website/publish/review");
    assert.equal(wf.confirmPath, "/hq/website/publish");
    assert.equal(wf.openLiveWebsitePath, "/c/demo-church");
    assert.equal(wf.previewDoesNotPublish, true);
  });

  it("desktop 1440 + mobile 390 — admin shell + live preview iframe architecture", () => {
    assert.deepEqual(VIEWPORT_WIDTHS, { desktop: 1440, tablet: 768, mobile: 390 });
    assert.deepEqual(LIVE_PREVIEW.widths, { desktop: 1440, tablet: 768, mobile: 390 });
    assert.deepEqual(WEBSITE_MANAGEMENT_HUB.previewWidths, {
      desktop: 1440,
      tablet: 768,
      mobile: 390,
    });
    assert.equal(LIVE_PREVIEW.architecture, "iframe");

    const shellCss = read("public/platform/admin-console-shell.css");
    assert.match(shellCss, /--gp-admin-desktop-px:\s*1440/);
    assert.match(shellCss, /--gp-admin-mobile-px:\s*390/);

    const editorJs = read("public/platform/website-inline-edit.js");
    assert.match(editorJs, /VIEWPORT_WIDTHS = \{ desktop: 1440, tablet: 768, mobile: 390 \}/);
    assert.match(editorJs, /website_frame=1/);

    const chrome = read("views/platform/website-engine/editor-chrome.ejs");
    assert.match(chrome, /data-website-viewport="desktop"/);
    assert.match(chrome, /data-website-viewport="mobile"/);
    assert.match(chrome, /data-website-viewport-width="1440"/);
    assert.match(chrome, /data-website-viewport-width="390"/);
  });

  it("unified engine — one editor, one publish orchestrator, draft-first", () => {
    assert.equal(WEBSITE_CONTENT_EDITING.sharedEditorEngineCount, 1);
    assert.equal(WEBSITE_CONTENT_EDITING.newPublishingEngine, false);
    assert.equal(PUBLISH_WORKFLOW.separatePublishEngine, false);
    assert.equal(publish, publicationOrchestrator.publish);
    assert.equal(typeof publicationOrchestrator.publish, "function");
    assert.ok(CANONICAL_FLOW.includes("change_manager"));
    assert.ok(CANONICAL_FLOW.includes("live_site"));
  });
});
