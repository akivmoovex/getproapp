"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { describe, it } = require("node:test");

const root = path.join(__dirname, "..");

function read(rel) {
  return fs.readFileSync(path.join(root, rel), "utf8");
}

describe("blessboard v5 server query audit — member dashboard", () => {
  it("dashboard previews skip attachment and event-registration N+1 work", () => {
    const routes = read("src/blessboard/http/memberPortalRoutes.js");
    assert.match(routes, /includeAttachments:\s*false/);
    assert.match(routes, /includeRegistrationStats:\s*false/);
    assert.match(routes, /upcomingOnly:\s*true/);
    assert.match(routes, /limit:\s*DASHBOARD_PREVIEW_LIMIT/);

    const ann = read("src/blessboard/services/announcementsService.js");
    assert.match(ann, /includeAttachments === false/);
    assert.match(ann, /attachments:\s*\[\]/);

    const part = read("src/blessboard/services/participationService.js");
    assert.match(part, /includeRegistrationStats === false/);
    assert.match(part, /upcomingOnly/);

    const repo = read("src/blessboard/repositories/participationRepository.js");
    assert.match(repo, /starts_at >= NOW\(\)/);
    assert.match(repo, /LIMIT \$/);
  });

  it("full member event/announcement lists still enrich by default", () => {
    const ann = read("src/blessboard/services/announcementsService.js");
    assert.match(ann, /listAttachments\(client,\s*item\.id\)/);
    const part = read("src/blessboard/services/participationService.js");
    assert.match(part, /findEventRegistration\(client,\s*memberId,\s*event\.id\)/);
    assert.match(part, /countActiveEventRegistrations\(client,\s*event\.id\)/);
  });
});

describe("blessboard v5 server query audit — render and HQ reports", () => {
  it("shared EJS template cache avoids per-request readFileSync for audited shells", () => {
    const cache = read("src/blessboard/http/v5EjsTemplateCache.js");
    assert.match(cache, /TEMPLATE_CACHE/);
    assert.match(cache, /readFileSync/);
    assert.match(cache, /function renderV5Ejs/);

    for (const rel of [
      "src/blessboard/http/memberPortalRoutes.js",
      "src/blessboard/http/branchAdminRoutes.js",
      "src/blessboard/http/hqAdminRoutes.js",
      "src/blessboard/http/hqReportsRoutes.js",
      "src/platform/http/platformAdminRoutes.js",
      "src/blessboard/http/renderApexMarketing.js",
      "src/blessboard/http/renderTenantLandingPage.js",
    ]) {
      const src = read(rel);
      assert.match(src, /renderV5Ejs|v5EjsTemplateCache/, rel);
      assert.doesNotMatch(src, /readFileSync\(filename,\s*"utf8"\)/, rel);
    }
  });

  it("HQ report routes load branch lists in parallel with summaries via pool", () => {
    const routes = read("src/blessboard/http/hqReportsRoutes.js");
    assert.match(routes, /Promise\.all\(\[/);
    assert.match(routes, /getHqOperationalReport/);
    assert.match(routes, /getMonthlyAttendanceSummary/);
    assert.match(routes, /getMonthlyGivingSummary/);
    assert.match(routes, /listBlessBoardBranches/);
  });

  it("tenant public home and media list remain free of HTML binary media loads", () => {
    const homeLoader = read("src/blessboard/http/loadTenantPublicPageModel.js");
    assert.doesNotMatch(homeLoader, /loadMediaBytes|readFileSync\([^)]*media/i);
    const mediaRoutes = read("src/blessboard/http/contentAdminRoutes.js");
    assert.match(mediaRoutes, /media\/:assetId|\/media\//);
    assert.match(read("src/blessboard/media/mediaAssetsRepository.js"), /LIMIT/);
  });
});
