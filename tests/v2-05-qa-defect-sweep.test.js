"use strict";

/**
 * V2.05 QA defect sweep — regression contracts for QA01–QA09 (website + platform).
 */

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.join(__dirname, "..");

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), "utf8");
}

describe("V2.05 QA defect sweep contracts", () => {
  it("QA01: post-registration lands on /hq (not public homepage or website editor detour)", () => {
    const helper = read("tests/helpers/blessboardRegistrationSuccess.js");
    assert.match(helper, /assertChurchReadyHqRedirect/);
    assert.match(helper, /\/hq/);
    assert.match(helper, /register-church\/success/);
    const batch1 = read("tests/v2-05-main-flow-batch1-post-auth-dashboard.test.js");
    assert.match(batch1, /BB registration → session → \/hq dashboard/);
    assert.match(batch1, /assertChurchReadyHqRedirect/);
    assert.doesNotMatch(batch1, /post\.headers\.location.*\/hq\/website/);
  });

  it("QA02: published public sites suppress the soft-fill template banner", () => {
    const model = read("src/blessboard/http/loadTenantPublicPageModel.js");
    assert.match(model, /showPublicTemplateBanner/);
    assert.match(model, /websiteStatus[\s\S]*!==\s*"published"/);
    const shell = read("views/blessboard/v5/partials/tenant-public-shell-start.ejs");
    assert.match(shell, /showPublicTemplateBanner|usedPublicDemoFill/);
    assert.match(shell, /data-bb-template-example="1"/);
    assert.match(shell, /published/);
  });

  it("QA03: mobile image file inputs remain clickable (no pointer-events:none)", () => {
    const mediaCss = read("public/platform/website-media-field.css");
    assert.match(mediaCss, /\.gp-we-media-field__btn input\[type="file"\]/);
    assert.doesNotMatch(
      mediaCss,
      /\.gp-we-media-field__btn input\[type="file"\]\s*\{[^}]*pointer-events:\s*none/
    );
    assert.match(mediaCss, /inset:\s*0/);
    const se = read("public/blessboard/v5/website-structured-edit.js");
    assert.match(se, /accept="image\/\*/);
    const inline = read("public/platform/website-inline-edit.js");
    assert.match(inline, /accept="image\/\*/);
  });

  it("QA04: service times publish regression suite exists", () => {
    const st = read("tests/v2-05-bb-service-times-publish.test.js");
    assert.match(st, /Published snapshot contains changed values|layout_metadata|service_times_v1/);
    assert.match(st, /publishProductWebsite|publishWebsiteDrafts/);
    assert.match(st, /resolvePublicServiceTimesEntries/);
  });

  it("QA06: HQ invite of HQ admin does not require branch; branch admin does", () => {
    const invite = read("src/blessboard/services/inviteBlessBoardStaff.js");
    assert.match(
      invite,
      /isCatalogueBranchRole\(roleKey\) && !branchId && !branchKey[\s\S]*branch_required/
    );
    assert.match(
      invite,
      /organisation_administrator[\s\S]*branchId \|\| branchKey[\s\S]*hq_scope/
    );
    const routes = read("src/blessboard/http/hqRoleAdminRoutes.js");
    assert.match(routes, /Select a branch when inviting a branch admin/);
    assert.match(routes, /branchKey: form\.roleKey === "branch_admin" \? form\.branchKey : null/);
    const staff = read("src/blessboard/http/hqStaffAccessRoutes.js");
    assert.match(staff, /includeIds:\s*true/);
    assert.match(staff, /Select a branch when inviting a branch admin/);
  });

  it("QA05: members list maps FORBIDDEN/INVALID_INPUT distinctly from 503 outage", () => {
    const hq = read("src/blessboard/http/hqMembersAdminRoutes.js");
    assert.match(hq, /You do not have permission to view members/);
    assert.match(hq, /Members could not be loaded for this church/);
    assert.match(hq, /Members are temporarily unavailable/);
    const branch = read("src/blessboard/http/branchRegistrationAdminRoutes.js");
    assert.match(branch, /You do not have permission to view members/);
    assert.match(branch, /Members could not be loaded for this branch/);
  });

  it("QA09: AC + BB password recovery regression suite exists", () => {
    const pw = read("tests/v2-05-password-recovery.test.js");
    assert.match(pw, /forgot-password/);
    assert.match(pw, /BlessBoard|BB apex/);
    assert.match(pw, /ActiveClinic|AC /);
    assert.match(pw, /enumeration-safe/);
  });

  it("QA10: direct inline image upload regression suite exists", () => {
    const qa10 = read("tests/v2-05-qa10-inline-image-upload.test.js");
    assert.match(qa10, /data-website-start/);
    assert.match(qa10, /home\.hero\.image|data-bb-section/);
    assert.match(qa10, /data-website-file/);
    assert.match(qa10, /pointer-events:\s*none/);
    assert.match(qa10, /Edit Entire Section|focusSectionEdit|data-bb-se-upload/);
  });
});
