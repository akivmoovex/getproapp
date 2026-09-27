"use strict";

/**
 * V10 PC11 — Classic CMS convergence architecture guard.
 *
 * Platform owns generic CMS mechanisms; products retain catalogues,
 * templates, content semantics, permissions, and UX.
 */

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), "utf8");
}

describe("PC11 platform CMS convergence", () => {
  it("platform shared CMS mechanisms exist", () => {
    const folders = require("../src/platform/website/http/websiteCmsFolderHttp");
    const ordered = require("../src/platform/website/cmsOrderedListDraft");
    const content = require("../src/platform/website/contentService");
    const utils = require("../src/platform/website/http/websiteEditorHttpUtils");
    assert.equal(typeof folders.folderNoticeMessage, "function");
    assert.equal(typeof folders.folderRedirect, "function");
    assert.equal(typeof ordered.reorderByIds, "function");
    assert.equal(typeof ordered.removeById, "function");
    assert.equal(typeof ordered.upsertById, "function");
    assert.equal(typeof content.saveWebsiteDraftEntries, "function");
    assert.equal(typeof utils.wantsHtml, "function");
  });

  it("BB and AC classic CMS adapters exist without product forests", () => {
    const bb = require("../src/blessboard/website/blessboardClassicCmsAdapter");
    const ac = require("../src/activeclinic/website/activeClinicCmsAdapter");
    assert.equal(bb.classicCmsProductCode(), "blessboard");
    assert.equal(ac.classicCmsProductCode(), "activeclinic");
    assert.equal(typeof bb.folderNoticeMessage, "function");
    assert.equal(typeof ac.folderNoticeMessage, "function");
    assert.equal(typeof ac.reorderByIds, "function");
    const folderHttp = read("src/platform/website/http/websiteCmsFolderHttp.js");
    const ordered = read("src/platform/website/cmsOrderedListDraft.js");
    assert.doesNotMatch(folderHttp, /productCode\s*===\s*['\"]blessboard['\"]/);
    assert.doesNotMatch(folderHttp, /productCode\s*===\s*['\"]activeclinic['\"]/);
    assert.doesNotMatch(ordered, /productCode\s*===\s*['\"]blessboard['\"]/);
    assert.doesNotMatch(ordered, /productCode\s*===\s*['\"]activeclinic['\"]/);
  });

  it("product CMS routes consume shared folder helpers", () => {
    const bb = read("src/blessboard/http/contentAdminRoutes.js");
    const ac = read("src/activeclinic/http/activeClinicWebsiteCmsRoutes.js");
    assert.match(bb, /blessboardClassicCmsAdapter/);
    assert.match(ac, /activeClinicCmsAdapter/);
    assert.match(bb, /websiteEditorHttpUtils/);
    assert.doesNotMatch(bb, /function folderNoticeMessage\s*\(/);
    assert.doesNotMatch(ac, /function folderNoticeMessage\s*\(/);
    assert.doesNotMatch(bb, /function wantsHtml\s*\(/);
  });

  it("AC CMS service uses ordered-list + batch draft helpers", () => {
    const svc = read("src/activeclinic/website/clinicWebsiteCmsService.js");
    assert.match(svc, /cmsOrderedListDraft/);
    assert.match(svc, /reorderByIds/);
    assert.match(svc, /saveWebsiteDraftEntries/);
  });

  it("retains product catalogues and divergent CMS models (no universal merge)", () => {
    assert.equal(
      fs.existsSync(path.join(ROOT, "src/blessboard/services/websiteStructuredDraftService.js")),
      true
    );
    assert.equal(
      fs.existsSync(path.join(ROOT, "src/blessboard/services/publicContentAdminService.js")),
      true
    );
    assert.equal(
      fs.existsSync(path.join(ROOT, "src/activeclinic/website/clinicWebsiteCms.js")),
      true
    );
    const bb = read("src/blessboard/http/contentAdminRoutes.js");
    const acCms = read("src/activeclinic/website/clinicWebsiteCms.js");
    assert.match(bb, /ENTITY_ROUTES|createLeader|createMinistry|createSermon/);
    assert.match(acCms, /PAGE_TEMPLATES|SECTION_TYPES|BLOCK_TYPES/);
    assert.doesNotMatch(bb, /if\s*\(\s*productCode\s*===\s*['\"]activeclinic['\"]/);
    assert.doesNotMatch(
      read("src/activeclinic/http/activeClinicWebsiteCmsRoutes.js"),
      /if\s*\(\s*productCode\s*===\s*['\"]blessboard['\"]/
    );
  });

  it("ordered-list mutators preserve sort_order string contract", () => {
    const { reorderByIds, removeById, upsertById } = require("../src/platform/website/cmsOrderedListDraft");
    const items = [
      { id: "a", sort_order: "0", title: "A" },
      { id: "b", sort_order: "1", title: "B" },
      { id: "c", sort_order: "2", title: "C" },
    ];
    const reordered = reorderByIds(items, ["c", "a"]);
    assert.deepEqual(
      reordered.map((row) => ({ id: row.id, sort_order: row.sort_order })),
      [
        { id: "c", sort_order: "0" },
        { id: "a", sort_order: "1" },
        { id: "b", sort_order: "2" },
      ]
    );
    assert.deepEqual(
      removeById(items, "b").map((row) => row.id),
      ["a", "c"]
    );
    const upserted = upsertById(items, { id: "b", sort_order: "9", title: "B2" });
    assert.equal(upserted.find((row) => row.id === "b").title, "B2");
  });
});
