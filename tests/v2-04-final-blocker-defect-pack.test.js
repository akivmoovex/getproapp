"use strict";

/**
 * V2.04 final blocker defect regression pack (RB-QA-01 / RB-QA-02).
 * Asserts the three proven defect fixes without hosted deploy.
 */

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.join(__dirname, "..");

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), "utf8");
}

describe("DEF-BB-ADD-MEMBER-BRANCH-ID", () => {
  it("listBlessBoardBranches can include branch ids for staff assignment forms", () => {
    const src = read("src/blessboard/services/listBlessBoardBranches.js");
    assert.match(src, /includeIds/);
    assert.match(src, /dto\.id\s*=\s*String\(row\.id\)/);
  });

  it("Add Member routes request includeIds and clear stale branch_id errors", () => {
    const routes = read("src/blessboard/http/branchRegistrationAdminRoutes.js");
    assert.match(routes, /includeIds:\s*true/);
    assert.match(routes, /field === "branch_id"/);
    assert.match(routes, /parsed\.ok = \(parsed\.fieldErrors \|\| \[\]\)\.length === 0/);
  });

  it("member-add template binds option value from branch id", () => {
    const view = read("views/blessboard/v5/branch-admin/member-add.ejs");
    assert.match(view, /b\.id\s*\|\|\s*b\.branchId/);
    assert.match(view, /name="branch_id"/);
  });
});

describe("DEF-BB-MEMBER-PORTAL-ROUTES", () => {
  it("member auth + portal use unlessTenant apex gate", () => {
    const auth = read("src/blessboard/http/memberPortalAuthRoutes.js");
    const portal = read("src/blessboard/http/memberPortalRoutes.js");
    assert.match(auth, /mode:\s*"unlessTenant"/);
    assert.match(portal, /mode:\s*"unlessTenant"/);
    assert.doesNotMatch(auth, /function rejectApex\(req,\s*res,\s*next\)\s*\{\s*if \(isApexHost\(req\)\)/);
  });

  it("path-mounted /c/:organizationKey member routes are wired", () => {
    const server = read("src/platform/http/v5FoundationServer.js");
    const mw = read("src/blessboard/http/pathMemberTenantMiddleware.js");
    assert.match(server, /createPathMemberTenantMiddleware/);
    assert.match(server, /\/c\/:organizationKey/);
    assert.match(mw, /pathOnly\.startsWith\("\/member\/"\)/);
    assert.match(mw, /buildBlessBoardTenantContext/);
  });
});

describe("DEF-BB-WEBSITE-RESTORE", () => {
  it("history model allows restore of live published versions", () => {
    const { buildHistoryView } = require("../src/platform/website/historyModel");
    const view = buildHistoryView({
      canRestore: true,
      versions: [
        {
          id: "11111111-1111-4111-8111-111111111111",
          versionNumber: 1,
          status: "published",
          publishedAt: new Date().toISOString(),
          changeCount: 2,
        },
      ],
      previewHrefFor: (id) => `/c/demo/website/versions/${id}`,
      restoreHrefFor: (id) => `/c/demo/website/versions/${id}/restore`,
    });
    assert.equal(view.versions.length, 1);
    assert.equal(view.versions[0].isLive, true);
    assert.equal(view.versions[0].canRestore, true);
    assert.match(view.versions[0].restoreHref, /\/restore$/);
  });

  it("classic HQ restore redirects to engine history when prepare fails", () => {
    const routes = read("src/blessboard/http/websitePublicationVersionAdminRoutes.js");
    assert.match(routes, /engineHistoryPathForTenant/);
    assert.match(routes, /buildPublicWebsiteHistoryPath/);
    assert.match(routes, /version-history\/:versionId\/restore/);
    assert.match(routes, /prepareVersionRestore[\s\S]*engineHistoryPathForTenant/);
    assert.match(routes, /res\.redirect\(302,\s*engineHistory\)/);
  });

  it("BB_HISTORY contract points at engine history path", () => {
    const contract = read("src/platform/website/websiteManagementFeatureContract.js");
    assert.match(contract, /featureId:\s*"BB_HISTORY"/);
    assert.match(contract, /route:\s*"\/c\/:organizationKey\/website\/history"/);
  });
});
