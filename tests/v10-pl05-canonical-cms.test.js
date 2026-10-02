"use strict";

/**
 * V10 PL05 — Canonical CMS characterization.
 *
 * Platform owns shared CMS mechanisms; BB/AC retain product catalogues.
 * V2.03 BB editor: engine-primary writes; classic overlay dual-write retained
 * until PL06 (public live still needs classic projection).
 */

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), "utf8");
}

describe("PL05 canonical CMS", () => {
  it("platform CMS mechanisms remain product-neutral", () => {
    const folderHttp = read("src/platform/website/http/websiteCmsFolderHttp.js");
    const ordered = read("src/platform/website/cmsOrderedListDraft.js");
    assert.doesNotMatch(folderHttp, /productCode\s*===\s*['\"]blessboard['\"]/);
    assert.doesNotMatch(folderHttp, /productCode\s*===\s*['\"]activeclinic['\"]/);
    assert.doesNotMatch(ordered, /if\s*\(\s*productCode/);
  });

  it("BB V2.03 editor writes engine first; overlay dual-write retained for public parity", () => {
    const routes = read("src/blessboard/http/blessboardWebsiteEditorRoutes.js");
    assert.match(routes, /saveFieldDraft|saveWebsiteDraft/);
    assert.match(routes, /saveInlineFieldDraft/);
    assert.match(routes, /overlay dual-write is compatibility-only/);
  });

  it("AC CMS service uses platform ordered-list directly (not via adapter re-export)", () => {
    const svc = read("src/activeclinic/website/clinicWebsiteCmsService.js");
    const adapter = require("../src/activeclinic/website/activeClinicCmsAdapter");
    assert.match(svc, /require\(["']\.\.\/\.\.\/platform\/website\/cmsOrderedListDraft["']\)/);
    assert.equal(typeof adapter.reorderByIds, "undefined");
    assert.equal(typeof adapter.folderNoticeMessage, "function");
  });

  it("does not invent a universal product content schema", () => {
    assert.equal(
      fs.existsSync(path.join(ROOT, "src/blessboard/services/websiteStructuredDraftService.js")),
      true
    );
    assert.equal(
      fs.existsSync(path.join(ROOT, "src/activeclinic/website/clinicWebsiteCms.js")),
      true
    );
    const bb = read("src/blessboard/http/contentAdminRoutes.js");
    const ac = read("src/activeclinic/website/clinicWebsiteCms.js");
    assert.match(bb, /ENTITY_ROUTES|createLeader|createMinistry/);
    assert.match(ac, /SECTION_TYPES|BLOCK_TYPES/);
  });

  it("classic BB overlay→engine sync retained for classic CMS paths", () => {
    const inline = read("src/blessboard/services/websiteInlineDraftService.js");
    assert.match(inline, /syncDraftToEngine/);
  });
});
