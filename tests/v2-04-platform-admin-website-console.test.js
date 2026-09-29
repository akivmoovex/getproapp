"use strict";

/**
 * V2.04 Phase 3C — Platform Admin website console completion contracts.
 */

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), "utf8");
}

describe("V2.04 platform admin website console completion", () => {
  it("detail view renders org, hub, editor, audit, media, and diagnostics surfaces", () => {
    const view = read("views/blessboard/v5/platform-admin/organization-website.ejs");
    assert.match(view, /data-action-open-organization="1"/);
    assert.match(view, /data-action-customer-hub="1"/);
    assert.match(view, /data-action-open-editor="1"/);
    assert.match(view, /id="website-audit"/);
    assert.match(view, /data-website-audit="1"/);
    assert.match(view, /id="website-media"/);
    assert.match(view, /data-website-media="1"/);
    assert.match(view, /id="website-diagnostics"/);
    assert.match(view, /data-website-diagnostics="1"/);
    assert.match(view, /Last modification/);
    assert.match(view, /Customer hub/);
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
    assert.doesNotMatch(list, /website-inline-edit\.js/);
  });

  it("action URLs include customer hub and public editor deep-links for both products", () => {
    const service = read("src/platform/website/platformAdminWebsitesService.js");
    assert.match(service, /buildPublicWebsiteSettingsPath/);
    assert.match(service, /buildPublicWebsiteEditPath/);
    assert.match(service, /customerHub/);
    assert.match(service, /openEditor/);
    assert.match(service, /listWebsiteMediaAdminRows/);
    assert.match(service, /buildWebsiteDiagnostics/);
    assert.match(service, /listWebsiteAudit/);
    assert.match(service, /listModerationEvents/);
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
    assert.doesNotMatch(
      detailHandler,
      /productCode === "activeclinic"[\s\S]*listWebsiteMedia/
    );
  });

  it("customer hubs remain product-owned paths", () => {
    const urls = read("src/platform/website/publicWebsiteUrl.js");
    assert.match(urls, /\/app\/settings\/website/);
    assert.match(urls, /\/hq\/website/);
  });
});
