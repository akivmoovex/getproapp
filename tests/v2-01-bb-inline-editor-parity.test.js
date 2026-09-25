"use strict";

/**
 * V2_01_BB_INLINE_EDITOR_PARITY — static presentation checks for AC-aligned
 * BlessBoard entry chrome, pending-count bridge, and branch preview URLs.
 */

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.join(__dirname, "..");

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), "utf8");
}

describe("V2_01 BB inline editor parity — static", () => {
  it("BB view-mode admin bar exposes Preview + Edit like AC entry chrome", () => {
    const bb = read("views/blessboard/v5/partials/website-admin-chrome.ejs");
    const ac = read("views/activeclinic/partials/website-editor-chrome.ejs");
    assert.match(ac, /data-website-preview="1"/);
    assert.match(ac, /data-website-edit-control="1"/);
    assert.match(bb, /data-website-preview="1"/);
    assert.match(bb, /data-bb-preview-website="1"/);
    assert.match(bb, /data-website-edit-control="1"/);
    assert.match(bb, /data-bb-edit-website="1"/);
    assert.match(bb, /wa\.draftPreviewHref/);
    assert.match(bb, /platform\/website-engine\/editor-chrome/);
  });

  it("BB pending pill prefers max(engine Change Manager, overlay+structured)", () => {
    const attach = read("src/blessboard/http/attachWebsiteAdminChrome.js");
    assert.match(attach, /overlayAndStructuredCount/);
    assert.match(attach, /Math\.max\(engineCount,\s*overlayAndStructuredCount\)/);
    assert.match(attach, /getPendingChangeSummary/);
    assert.match(attach, /countAllWebsiteDrafts/);
  });

  it("structured draft save dual-writes engine snapshot best-effort", () => {
    const svc = read("src/blessboard/services/websiteStructuredDraftService.js");
    assert.match(svc, /syncDraftToEngine/);
    assert.match(svc, /engineSynced/);
    assert.match(svc, /Engine draft sync must not block structured overlay save/);
    // saved:true is only returned after overlay upsert; sync failure never rewrites that contract.
    assert.match(svc, /saved:\s*true/);
    assert.match(svc, /engineSynced\s*=\s*Boolean\(synced\s*&&\s*synced\.ok\)/);
  });

  it("structured draft repository upserts by entity key (no duplicate rows)", () => {
    const repo = read("src/blessboard/repositories/websiteStructuredDraftRepository.js");
    assert.match(repo, /async function upsertStructuredDraft/);
    assert.match(repo, /entity_key\s*=\s*\$3/);
    assert.match(repo, /UPDATE\s+blessboard\.website_structured_drafts/);
  });

  it("branch admin preview URL prefers draft preview path when org key known", () => {
    const {
      resolveWebsiteActionUrls,
    } = require("../src/blessboard/urls/websiteActionUrls");
    const urls = resolveWebsiteActionUrls({
      actor: "branch_admin",
      organizationKey: "demo3",
      branchKey: "main",
    });
    assert.equal(urls.editWebsiteUrl, "/branch-admin/website");
    assert.match(String(urls.previewUrl), /website_mode=draft/);
    assert.doesNotMatch(String(urls.previewUrl), /website_edit=1/);
    assert.equal(urls.previewLabel, "Preview");
  });
});
