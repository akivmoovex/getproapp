"use strict";

/**
 * V2.05 QA10 — Direct inline Public Website image upload must open the shared
 * WE01 media/file-picker flow (same engine as Edit Entire Section), with correct
 * section/field identity and draft-only save semantics.
 */

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const ejs = require("ejs");

const ROOT = path.join(__dirname, "..");

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), "utf8");
}

describe("V2.05 QA10 — inline image trigger wiring", () => {
  it("BB editable-image mounts data-website-start with section/field identity", () => {
    const partial = read("views/blessboard/v5/partials/editable-image.ejs");
    assert.match(partial, /data-website-inline="1"/);
    assert.match(partial, /data-website-type="image"/);
    assert.match(partial, /data-website-start="1"/);
    assert.match(partial, /data-website-key=/);
    assert.match(partial, /data-bb-page=/);
    assert.match(partial, /data-bb-section=/);
    assert.match(partial, /data-bb-field=/);
    assert.match(partial, /gp-website-editable__pencil/);
  });

  it("renders correct contentKey / section / field for a hero image slot", () => {
    const html = ejs.render(read("views/blessboard/v5/partials/editable-image.ejs"), {
      websiteAdmin: { editingMode: true },
      editPageKey: "home",
      editSectionKey: "hero",
      editFieldKey: "image",
      contentKey: "home.hero.image",
      imageSrc: "https://cdn.example.com/hero.jpg",
      imageAlt: "Gathering",
      imageClass: "bb-tp-hero__img",
    }, { filename: path.join(ROOT, "views/blessboard/v5/partials/editable-image.ejs") });

    assert.match(html, /data-website-key="home\.hero\.image"/);
    assert.match(html, /data-website-type="image"/);
    assert.match(html, /data-bb-page="home"/);
    assert.match(html, /data-bb-section="hero"/);
    assert.match(html, /data-bb-field="image"/);
    assert.match(html, /data-website-start="1"/);
    assert.match(html, /aria-label="Edit image"/);
  });

  it("home hero mounts editable-image (not a second upload system)", () => {
    const home = read("views/blessboard/v5/public/home.ejs");
    assert.match(home, /editable-image/);
    assert.match(home, /contentKey:\s*'home\.hero\.image'/);
    assert.match(home, /editSectionKey:\s*'hero'/);
    assert.match(home, /editFieldKey:\s*'image'/);
    assert.doesNotMatch(home, /new\s+upload\s+endpoint|secondMediaPicker/i);
  });
});

describe("V2.05 QA10 — click path reaches shared picker", () => {
  it("shared inline editor binds data-website-start → openField → file input", () => {
    const js = read("public/platform/website-inline-edit.js");
    assert.match(js, /querySelectorAll\("\[data-website-key\]"\)/);
    assert.match(js, /querySelector\("\[data-website-start\]"\)/);
    assert.match(js, /addEventListener\("click"/);
    assert.match(js, /openField\(el,\s*startBtn\)/);
    assert.match(js, /function openField\(/);
    assert.match(js, /function buildImageBody\(/);
    assert.match(
      js,
      /data-website-file="1"/
    );
    assert.match(js, /accept="image\/\*,image\/jpeg,image\/png,image\/webp,image\/gif"/);
    assert.match(js, /Upload from computer|Replace image/);
    assert.match(js, /function uploadImage\(/);
    assert.match(js, /function saveImage\(/);
  });

  it("image save posts draft contentKey/value and never marks publish", () => {
    const js = read("public/platform/website-inline-edit.js");
    assert.match(js, /contentKey:\s*activeField\.getAttribute\("data-website-key"\)/);
    assert.match(js, /Save must not publish/);
    assert.match(js, /out\.published\s*===\s*true/);
    assert.match(js, /markDraftSaved/);
    assert.match(js, /pendingChangeCount/);
  });

  it("field-editor host exists so ImageEditor does not early-return", () => {
    const host = read("views/platform/website-engine/field-editor-host.ejs");
    const overlays = read("views/platform/website-engine/editor-overlays.ejs");
    const shellEnd = read("views/blessboard/v5/partials/tenant-public-shell-end.ejs");
    assert.match(host, /data-website-field-editor="1"/);
    assert.match(overlays, /field-editor-host/);
    assert.match(shellEnd, /editor-overlays/);
    assert.match(shellEnd, /website-inline-edit\.js/);
  });
});

describe("V2.05 QA10 — pointer-events / overlay must not block image trigger", () => {
  it("hero scrim is pointer-events:none so inline image icon remains hittable", () => {
    const tenantCss = read("public/blessboard/v5/tenant-public.css");
    const idx = tenantCss.indexOf(".bb-tp-hero__scrim");
    assert.ok(idx >= 0, "scrim rule missing");
    const block = tenantCss.slice(idx, idx + 280);
    assert.match(block, /pointer-events:\s*none/);
  });

  it("edit-mode overlay lets media-plane image pencils receive clicks", () => {
    const css = read("public/platform/website-inline-edit.css");
    assert.match(css, /QA10 regression/);
    assert.match(
      css,
      /body\.gp-website-editor-open\.bb-tp-body--editing \.bb-tp-hero__inner--overlay \{\s*pointer-events:\s*none;/
    );
    assert.match(
      css,
      /body\.gp-website-editor-open\.bb-tp-body--editing \.bb-tp-hero__scrim \{\s*pointer-events:\s*none;/
    );
    assert.match(
      css,
      /bb-tp-hero__media-plane \.gp-website-editable,\s*body\.gp-website-editor-open\.bb-tp-body--editing \.bb-tp-hero__media-plane \.ac-website-editable \{[\s\S]*?z-index:\s*2;/
    );
    assert.match(css, /\.gp-website-editable__pencil,[\s\S]*?pointer-events:\s*auto/);
    assert.doesNotMatch(css, /keep overlay copy tappable/);
    assert.doesNotMatch(
      css,
      /bb-tp-hero__media-plane \.gp-website-editable \{[\s\S]*?z-index:\s*auto;/
    );
  });

  it("cache-bust stamps include QA10 editor CSS + tenant CSS", () => {
    const shell = read("views/blessboard/v5/partials/tenant-public-shell-start.ejs");
    const model = read("src/blessboard/http/loadTenantPublicPageModel.js");
    assert.match(shell, /website-inline-edit\.css\?v=v205-qa10-1/);
    assert.match(model, /tenant-public\.css\?v=68/);
  });
});

describe("V2.05 QA10 — Edit Entire Section upload path preserved", () => {
  it("structured editor still exposes shared upload/file input for images", () => {
    const se = read("public/blessboard/v5/website-structured-edit.js");
    assert.match(se, /data-bb-se-upload="1"/);
    assert.match(se, /data-bb-upload-from-computer="1"/);
    assert.match(se, /accept="image\/\*/);
    assert.match(se, /function uploadFile\(/);
    assert.match(se, /data-bb-media-upload/);
    assert.match(se, /Upload from computer|Replace image/);
  });

  it("section Edit action still programmatically opens the first field pencil", () => {
    const section = read("public/platform/website-section-actions.js");
    assert.match(section, /function focusSectionEdit/);
    assert.match(
      section,
      /querySelector\("\[data-website-start\], \.gp-website-editable__pencil, \[data-bb-edit-open\]"\)/
    );
    assert.match(section, /pencil\.click/);
  });

  it("does not introduce a second media upload system", () => {
    const inline = read("public/platform/website-inline-edit.js");
    const se = read("public/blessboard/v5/website-structured-edit.js");
    assert.match(inline, /SHARED_EDITOR_ENGINE_COUNT must remain 1/);
    assert.doesNotMatch(inline, /createSecondUpload|alternateMediaPicker|qa10UploadEndpoint/i);
    assert.doesNotMatch(se, /createSecondUpload|alternateMediaPicker|qa10UploadEndpoint/i);
  });
});
