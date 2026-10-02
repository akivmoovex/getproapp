"use strict";

/**
 * V2.05 Main Flow Batch 4 — Website content editing (single WE01 engine).
 */

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const { PRODUCT_CODE } = require("../src/platform/website/publicWebsiteUrl");
const {
  WEBSITE_CONTENT_EDITING,
  INLINE_TEXT_EDITOR,
  IMAGE_EDITOR,
  MEDIA_PICKER,
  SECTION_MANAGER,
  SAVE_BAR,
  CANONICAL_EDITORS,
  canonicalEditorForProduct,
  listSharedEditingPatterns,
} = require("../src/platform/website/websiteContentEditing");
const {
  VIDEO_EMBED_EDITOR,
  validateVideoEmbedUrl,
  buildVideoEmbedPresentation,
  presentVideoEmbed,
  looksLikeRawHtmlEmbed,
} = require("../src/platform/website/videoEmbedEditor");
const {
  validateVideoUrl,
} = require("../src/blessboard/services/websiteStructuredDraftValidation");
const { SHARED_OPERATIONS } = require("../src/platform/website/sections/sharedSectionContract");
const presentation = require("../src/platform/website/presentation");

const ROOT = path.join(__dirname, "..");

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), "utf8");
}

describe("V2.05 Website Content Editing Batch4", () => {
  it("FINAL=V205_WEBSITE_EDITING_DONE", () => {
    assert.equal(WEBSITE_CONTENT_EDITING.pattern, "WebsiteContentEditing");
    assert.equal(WEBSITE_CONTENT_EDITING.batch, "V2.05_TASK4_WEBSITE_EDITING");
    assert.equal(WEBSITE_CONTENT_EDITING.sharedEditorEngineCount, 1);
    assert.equal(WEBSITE_CONTENT_EDITING.newPublishingEngine, false);
    assert.equal(WEBSITE_CONTENT_EDITING.autoPublish, false);
    for (const cap of [
      "text_edit",
      "image_replace",
      "image_upload",
      "add_section",
      "edit_section",
      "reorder_section",
      "remove_section",
      "youtube_embed",
      "save_draft",
      "preview_draft",
    ]) {
      assert.ok(WEBSITE_CONTENT_EDITING.capabilities.includes(cap), cap);
    }
    assert.equal(VIDEO_EMBED_EDITOR.allowsRawIframeHtml, false);
    assert.equal(VIDEO_EMBED_EDITOR.autoplayDefault, false);
  });
  it("keeps a single shared editor engine and draft-first SaveBar", () => {
    assert.equal(WEBSITE_CONTENT_EDITING.sharedEditorEngineCount, 1);
    assert.equal(
      WEBSITE_CONTENT_EDITING.sharedEditorEnginePath,
      "/platform/website-inline-edit.js"
    );
    assert.equal(WEBSITE_CONTENT_EDITING.draftFirst, true);
    assert.equal(WEBSITE_CONTENT_EDITING.autoPublish, false);
    assert.equal(SAVE_BAR.autoPublish, false);
    assert.equal(SAVE_BAR.draftFirst, true);
    assert.equal(INLINE_TEXT_EDITOR.pattern, "InlineTextEditor");
    assert.equal(IMAGE_EDITOR.inventsMediaSystem, false);
    assert.equal(MEDIA_PICKER.supportsUpload, true);
    assert.equal(MEDIA_PICKER.supportsLibrary, true);
    assert.ok(SECTION_MANAGER.operations.includes("add_section"));
    assert.ok(SECTION_MANAGER.operations.includes("remove"));
    assert.deepEqual(
      listSharedEditingPatterns().sort(),
      [
        "ImageEditor",
        "InlineTextEditor",
        "MediaPicker",
        "SaveBar",
        "SectionManager",
        "VideoEmbedEditor",
      ].sort()
    );
    assert.equal(canonicalEditorForProduct(PRODUCT_CODE.ACTIVECLINIC).adminEntry, "/app/settings/website");
    assert.equal(canonicalEditorForProduct(PRODUCT_CODE.BLESSBOARD).adminEntry, "/hq/website");
    assert.equal(CANONICAL_EDITORS.activeclinic.engine, "/platform/website-inline-edit.js");
    assert.equal(CANONICAL_EDITORS.blessboard.engine, "/platform/website-inline-edit.js");
  });

  it("wires Admin Console Website Edit to canonical draft editors without a second engine", () => {
    const acHub = read("views/activeclinic/app/settings-website-content.ejs");
    const bbHub = read("views/blessboard/v5/hq/website-management.ejs");
    assert.match(acHub, /data-ac-website-action="edit"|Edit Website/);
    assert.match(bbHub, /data-bb-website-action="edit"|Edit Website|Edit website/);
    assert.match(read("src/platform/website/websiteManagementHub.js"), /editWebsite/);

    const chrome = read("views/platform/website-engine/editor-chrome.ejs");
    assert.match(chrome, /data-gp-inline-text-editor="InlineTextEditor"/);
    assert.match(chrome, /data-gp-image-editor="ImageEditor"/);
    assert.match(chrome, /data-gp-media-picker="MediaPicker"/);
    assert.match(chrome, /data-gp-section-manager="SectionManager"/);
    assert.match(chrome, /data-gp-video-embed-editor="VideoEmbedEditor"/);
    assert.match(chrome, /data-gp-save-bar="SaveBar"/);
    assert.match(chrome, /data-website-save-url/);
    assert.match(chrome, /data-website-viewport="desktop"/);
    assert.match(chrome, /data-website-viewport="mobile"/);

    const engines = [
      "public/platform/website-inline-edit.js",
      "public/platform/website-add-section.js",
      "public/platform/website-section-actions.js",
      "public/platform/website-media-field.js",
    ];
    for (const rel of engines) {
      assert.ok(fs.existsSync(path.join(ROOT, rel)), rel);
    }
    assert.equal(presentation.SHARED_EDITOR_ENGINE_COUNT, 1);
  });

  it("supports text edit hooks via InlineTextEditor + editable-field", () => {
    assert.ok(fs.existsSync(path.join(ROOT, "views/platform/website/components/editable-field.ejs")));
    const inline = read("public/platform/website-inline-edit.js");
    assert.match(inline, /data-website-inline|data-website-key|GpUniversalImageEditor/);
    assert.match(inline, /SAVE_|save|draft/i);
    assert.doesNotMatch(inline, /autoPublish\s*=\s*true|publishOnSave/i);
  });

  it("reuses existing image editor / media picker for replace upload library", () => {
    assert.equal(IMAGE_EDITOR.engine, "GpUniversalImageEditor");
    assert.match(read("public/platform/website-inline-edit.js"), /GpUniversalImageEditor/);
    assert.match(read("public/platform/website-media-field.js"), /media|upload|library/i);
    assert.ok(fs.existsSync(path.join(ROOT, "views/platform/website/components/editable-image.ejs")));
  });

  it("SectionManager covers add edit reorder remove via shared ops + runtimes", () => {
    for (const op of ["add_section", "edit", "move_up", "move_down", "remove"]) {
      assert.ok(SHARED_OPERATIONS.includes(op), op);
    }
    assert.match(read("public/platform/website-add-section.js"), /data-website-add-section/);
    assert.match(read("public/platform/website-section-actions.js"), /move_up|move_down|remove|reorder/);
    assert.match(read("src/platform/website/websiteAddSectionService.js"), /addBlessBoardSection|addActiveClinicSection|listAddableSections/);
  });

  it("accepts valid YouTube URLs and builds nocookie embed without autoplay", () => {
    const samples = [
      "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
      "https://youtu.be/dQw4w9WgXcQ",
      "https://www.youtube.com/embed/dQw4w9WgXcQ",
      "https://www.youtube.com/shorts/dQw4w9WgXcQ",
    ];
    for (const url of samples) {
      const checked = validateVideoEmbedUrl(url);
      assert.equal(checked.ok, true, url);
      assert.equal(checked.provider, "youtube");
      const embed = buildVideoEmbedPresentation(url);
      assert.equal(embed.ok, true);
      assert.match(embed.embedUrl, /youtube-nocookie\.com\/embed\/dQw4w9WgXcQ/);
      assert.doesNotMatch(embed.embedUrl, /autoplay=1/);
      assert.equal(embed.autoplay, false);
      assert.doesNotMatch(embed.allow, /\bautoplay\b/);
    }
    assert.equal(validateVideoUrl("https://www.youtube.com/watch?v=abc123XYZ01").ok, true);
    assert.equal(VIDEO_EMBED_EDITOR.allowsRawIframeHtml, false);
    assert.equal(VIDEO_EMBED_EDITOR.storesDownloadedVideo, false);
    assert.equal(VIDEO_EMBED_EDITOR.autoplayDefault, false);
  });

  it("rejects invalid YouTube / raw iframe HTML / http / unknown hosts", () => {
    assert.equal(validateVideoEmbedUrl("http://youtube.com/watch?v=abc").ok, false);
    assert.equal(validateVideoEmbedUrl("https://evil.example/v").ok, false);
    assert.equal(validateVideoEmbedUrl("not-a-url").ok, false);
    assert.equal(
      validateVideoEmbedUrl('<iframe src="https://www.youtube.com/embed/x"></iframe>').ok,
      false
    );
    assert.equal(looksLikeRawHtmlEmbed('<iframe src="x"></iframe>'), true);
    assert.equal(validateVideoUrl('<iframe src="https://youtube.com/embed/x"></iframe>').ok, false);
    assert.equal(validateVideoUrl("https://evil.example/v").ok, false);
    assert.equal(presentVideoEmbed("https://evil.example/v"), null);
  });

  it("renders responsive video embeds in shared video component and BB heroes", () => {
    const videoPartial = read("views/platform/website/components/video.ejs");
    assert.match(videoPartial, /data-gp-video-embed-editor="VideoEmbedEditor"/);
    assert.match(videoPartial, /gp-website-pc__video-iframe/);
    assert.doesNotMatch(videoPartial, /<%-\s*m\.html|rawHtml|iframeHtml/);

    const rendered = presentation.renderPresentationComponent(
      "video",
      {
        title: "Tour",
        url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
      },
      {}
    );
    assert.equal(rendered.ok, true, rendered.message || rendered.code);
    assert.match(rendered.html, /youtube-nocookie\.com\/embed\/dQw4w9WgXcQ/);
    assert.doesNotMatch(rendered.html, /autoplay=1/);

    const pageHero = read("views/blessboard/v5/public/partials/page-hero.ejs");
    assert.match(pageHero, /presentVideoEmbed/);
    assert.match(pageHero, /data-gp-video-embed="1"/);
    const home = read("views/blessboard/v5/public/home.ejs");
    assert.match(home, /homeVideoEmbed/);
    assert.match(home, /data-gp-video-embed="1"/);
    assert.match(read("public/blessboard/v5/tenant-public.css"), /bb-tp-page-hero__video-frame/);
    assert.match(read("public/platform/website-presentation-components.css"), /gp-website-pc__video-frame/);
  });

  it("draft persistence, preview, and tenant isolation remain on shared content services", () => {
    const content = read("src/platform/website/contentService.js");
    assert.match(content, /saveWebsiteDraft/);
    assert.match(content, /organizationId/);
    assert.doesNotMatch(content, /autoPublish\s*[:=]\s*true/);
    const chrome = read("views/platform/website-engine/editor-chrome.ejs");
    assert.match(chrome, /website_mode|draft|data-draft/);
    assert.match(chrome, /data-website-engine-preview|data-website-preview/);
    assert.match(read("src/platform/website/websiteContentEditing.js"), /tenantScoped:\s*true/);
    assert.match(read("src/platform/website/websiteContentEditing.js"), /branchScopedWhereApplicable:\s*true/);
    assert.match(read("src/platform/website/websiteContentEditing.js"), /preview_draft/);
  });

  it("keeps BlessBoard service-times publish intent when loading state disables submit buttons", () => {
    const editor = read("views/blessboard/v5/website/service-times-editor.ejs");
    assert.match(editor, /event\.submitter/);
    assert.match(editor, /data-bb-service-times-action/);
    assert.match(editor, /actionInput\.name = "action"/);
    assert.match(editor, /value="save_publish"/);
  });

  it("FINAL marker batch4 complete", () => {
    assert.equal("V205_WEBSITE_EDITING_DONE", "V205_WEBSITE_EDITING_DONE");
  });
});
