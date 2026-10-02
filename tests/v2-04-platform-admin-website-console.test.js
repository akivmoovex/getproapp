"use strict";

/**
 * V2.04 Overnight Step 5 — Platform Admin website governance console.
 */

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), "utf8");
}

const contract = require("../src/platform/website/platformAdminWebsiteConsoleContract");
const {
  buildActionUrls,
} = require("../src/platform/website/platformAdminWebsitesService");
const {
  buildPublicWebsiteSettingsPath,
  buildPublicWebsiteEditPath,
  PRODUCT_CODE,
} = require("../src/platform/website/publicWebsiteUrl");
const {
  PERMISSIONS,
  hasWebsitePermission,
  PLATFORM_ADMIN_PERMISSIONS,
} = require("../src/platform/website/permissions");

describe("V2.04 platform admin website console completion", () => {
  it("records Step 5 PASS contract without duplicate editor/publish engines", () => {
    assert.equal(contract.STEP.id, "v2_04_overnight_step_5");
    assert.equal(contract.STEP.platformAdminWebsiteConsole, "PASS");
    assert.equal(contract.STEP.duplicateEditorEngine, 0);
    assert.equal(contract.STEP.duplicatePublishEngine, 0);
    assert.ok(contract.CAPABILITIES_COMPLETED.includes("customer_editor_deep_link"));
    assert.ok(contract.CAPABILITIES_COMPLETED.includes("audit_events"));
    assert.ok(contract.CAPABILITIES_COMPLETED.includes("media_usage"));
    assert.ok(contract.CAPABILITIES_COMPLETED.includes("moderation_status"));
    assert.ok(contract.CAPABILITIES_COMPLETED.includes("diagnostics"));
    assert.deepEqual(contract.CUSTOMER_HUBS.activeclinic, "/app/settings/website");
    assert.deepEqual(contract.CUSTOMER_HUBS.blessboard, "/hq/website");
  });

  it("detail view renders org, hub, editor, audit, media, moderation, and diagnostics", () => {
    const view = read("views/blessboard/v5/platform-admin/organization-website.ejs");
    assert.match(view, /data-action-open-organization="1"/);
    assert.match(view, /data-action-customer-hub="1"/);
    assert.match(view, /data-action-open-editor="1"/);
    assert.match(view, /id="website-audit"/);
    assert.match(view, /data-website-audit="1"/);
    assert.match(view, /id="website-media"/);
    assert.match(view, /data-website-media="1"/);
    assert.match(view, /id="website-moderation"/);
    assert.match(view, /data-website-moderation-events="1"/);
    assert.match(view, /id="website-diagnostics"/);
    assert.match(view, /data-website-diagnostics="1"/);
    assert.match(view, /Last modification/);
    assert.match(view, /Customer hub/);
    assert.match(view, /Website status/);
    assert.match(view, /Current draft/);
    // Must not embed an inline content editor / second publish engine.
    assert.doesNotMatch(view, /website-inline-edit\.js/);
    assert.doesNotMatch(view, /GpUniversalImageEditor/);
    assert.doesNotMatch(view, /publicationOrchestrator/);
  });

  it("list view links organisation and customer hub without duplicating the editor", () => {
    const list = read("views/blessboard/v5/platform-admin/websites.ejs");
    assert.match(list, /data-action-open-organization="1"/);
    assert.match(list, /data-action-customer-hub="1"/);
    assert.match(list, /data-action-open-editor="1"/);
    assert.match(list, /data-product=/);
    assert.match(list, /data-website-status=/);
    assert.doesNotMatch(list, /website-inline-edit\.js/);
  });

  it("action URLs include customer hub and public editor deep-links for both products", () => {
    const ac = buildActionUrls("demo-clinic", PRODUCT_CODE.ACTIVECLINIC);
    const bb = buildActionUrls("demo-church", PRODUCT_CODE.BLESSBOARD);
    assert.equal(ac.customerHub, "/app/settings/website");
    assert.equal(bb.customerHub, "/hq/website");
    assert.ok(ac.openEditor && ac.openEditor.includes("website_edit"));
    assert.ok(bb.openEditor && bb.openEditor.includes("website_edit"));
    assert.match(ac.organization, /\/admin\/organizations\/demo-clinic$/);
    assert.match(bb.open, /\/admin\/organizations\/demo-church\/website/);
    assert.equal(
      buildPublicWebsiteSettingsPath({ product: PRODUCT_CODE.ACTIVECLINIC }),
      "/app/settings/website"
    );
    assert.equal(
      buildPublicWebsiteSettingsPath({ product: PRODUCT_CODE.BLESSBOARD }),
      "/hq/website"
    );
    assert.ok(buildPublicWebsiteEditPath({ product: PRODUCT_CODE.ACTIVECLINIC, organizationKey: "x" }));
    assert.ok(buildPublicWebsiteEditPath({ product: PRODUCT_CODE.BLESSBOARD, organizationKey: "y" }));
  });

  it("detail route consumes shared detail payload for BB and AC (not AC-only media/audit)", () => {
    const routes = read("src/platform/http/platformWebsiteAdminRoutes.js");
    const detailHandler = routes.slice(
      routes.indexOf('router.get("/admin/organizations/:organizationKey/website"'),
      routes.indexOf("function websiteManagePath")
    );
    assert.match(detailHandler, /detail\.media/);
    assert.match(detailHandler, /detail\.auditEvents/);
    assert.match(detailHandler, /detail\.diagnostics/);
    assert.match(detailHandler, /detail\.moderationEvents/);
    assert.match(detailHandler, /requirePlatformAdmin/);
    assert.doesNotMatch(
      detailHandler,
      /productCode === "activeclinic"[\s\S]*listWebsiteMedia/
    );
  });

  it("governance routes require apex + platform admin and gate dangerous actions by permission", () => {
    const routes = read("src/platform/http/platformWebsiteAdminRoutes.js");
    assert.match(routes, /router\.get\("\/admin\/websites", requireApex, requirePlatformAdmin/);
    assert.match(
      routes,
      /router\.get\("\/admin\/organizations\/:organizationKey\/website", requireApex, requirePlatformAdmin/
    );
    assert.match(routes, /canToggleAvailability\(req\)/);
    assert.match(routes, /canTakeOffline\(req\)/);
    assert.match(routes, /canSuspend\(req\)/);
    assert.match(routes, /PERMISSIONS\.PUBLISH/);
    assert.match(routes, /PERMISSIONS\.TAKE_OFFLINE/);
    assert.match(routes, /PERMISSIONS\.SUSPEND/);
    assert.ok(hasWebsitePermission(PLATFORM_ADMIN_PERMISSIONS, PERMISSIONS.PUBLISH));
    assert.ok(hasWebsitePermission(PLATFORM_ADMIN_PERMISSIONS, PERMISSIONS.TAKE_OFFLINE));
    assert.equal(hasWebsitePermission([], PERMISSIONS.PUBLISH), false);
  });

  it("service reuses lifecycle and publication modules instead of inventing engines", () => {
    const service = read("src/platform/website/platformAdminWebsitesService.js");
    assert.match(service, /lifecycleService/);
    assert.match(service, /publicationService/);
    assert.match(service, /publicationOrchestrator/);
    assert.match(service, /listWebsiteAudit/);
    assert.match(service, /listModerationEvents/);
    assert.match(service, /listWebsiteMediaAdminRows/);
    assert.match(service, /buildWebsiteDiagnostics/);
    assert.doesNotMatch(service, /createInlineEditor|secondPublishEngine/);
  });

  it("customer hubs remain product-owned paths", () => {
    const urls = read("src/platform/website/publicWebsiteUrl.js");
    assert.match(urls, /\/app\/settings\/website/);
    assert.match(urls, /\/hq\/website/);
  });
});
