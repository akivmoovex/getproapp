"use strict";

/**
 * V2.05 Batch 4 — Website content editing contract.
 * Formalizes shared editor patterns on top of the single WE01 engine.
 * Does not create a second editor or media system.
 */

const { PRODUCT_CODE } = require("./publicWebsiteUrl");
const { SHARED_OPERATIONS } = require("./sections/sharedSectionContract");
const { VIDEO_EMBED_EDITOR } = require("./videoEmbedEditor");
const {
  SHARED_EDITOR_ENGINE_COUNT,
  SHARED_EDITOR_ENGINE_PATH,
} = require("./presentation/componentLibrary");

const INLINE_TEXT_EDITOR = Object.freeze({
  pattern: "InlineTextEditor",
  engine: SHARED_EDITOR_ENGINE_PATH,
  hooks: Object.freeze(["data-website-inline", "data-website-key", "editable-field"]),
  modes: Object.freeze(["inline", "structured"]),
  draftOnly: true,
});

const IMAGE_EDITOR = Object.freeze({
  pattern: "ImageEditor",
  engine: "GpUniversalImageEditor",
  runtime: SHARED_EDITOR_ENGINE_PATH,
  mediaField: "/platform/website-media-field.js",
  draftOnly: true,
  inventsMediaSystem: false,
});

const MEDIA_PICKER = Object.freeze({
  pattern: "MediaPicker",
  runtime: "/platform/website-media-field.js",
  libraryRoutes: Object.freeze(["/website/media", "/app/settings/website/media"]),
  supportsUpload: true,
  supportsLibrary: true,
  supportsReplace: true,
  draftOnly: true,
});

const SECTION_MANAGER = Object.freeze({
  pattern: "SectionManager",
  addSectionRuntime: "/platform/website-add-section.js",
  sectionActionsRuntime: "/platform/website-section-actions.js",
  operations: SHARED_OPERATIONS,
  draftOnly: true,
  inventsSchema: false,
});

const SAVE_BAR = Object.freeze({
  pattern: "SaveBar",
  chrome: "views/platform/website-engine/editor-chrome.ejs",
  markers: Object.freeze([
    "data-website-save-url",
    "data-website-save-status",
    "data-website-save-status-label",
  ]),
  autoPublish: false,
  draftFirst: true,
});

const WEBSITE_CONTENT_EDITING = Object.freeze({
  pattern: "WebsiteContentEditing",
  batch: "V2.05_TASK4_WEBSITE_EDITING",
  sharedEditorEngineCount: SHARED_EDITOR_ENGINE_COUNT,
  sharedEditorEnginePath: SHARED_EDITOR_ENGINE_PATH,
  draftFirst: true,
  autoPublish: false,
  newPublishingEngine: false,
  tenantScoped: true,
  branchScopedWhereApplicable: true,
  auditedWhereSupported: true,
  capabilities: Object.freeze([
    "text_edit",
    "image_replace",
    "image_upload",
    "image_library",
    "add_section",
    "edit_section",
    "reorder_section",
    "remove_section",
    "youtube_embed",
    "preview_draft",
    "save_draft",
  ]),
  sharedPatterns: Object.freeze({
    InlineTextEditor: INLINE_TEXT_EDITOR,
    ImageEditor: IMAGE_EDITOR,
    MediaPicker: MEDIA_PICKER,
    SectionManager: SECTION_MANAGER,
    VideoEmbedEditor: VIDEO_EMBED_EDITOR,
    SaveBar: SAVE_BAR,
  }),
});

const CANONICAL_EDITORS = Object.freeze({
  [PRODUCT_CODE.ACTIVECLINIC]: Object.freeze({
    productCode: PRODUCT_CODE.ACTIVECLINIC,
    label: "ActiveClinic clinic website draft editor",
    adminEntry: "/app/settings/website",
    editQuery: Object.freeze({ website_edit: "1", website_mode: "draft" }),
    engine: SHARED_EDITOR_ENGINE_PATH,
    chrome: "views/activeclinic/partials/website-editor-chrome.ejs",
  }),
  [PRODUCT_CODE.BLESSBOARD]: Object.freeze({
    productCode: PRODUCT_CODE.BLESSBOARD,
    label: "BlessBoard church website draft editor",
    adminEntry: "/hq/website",
    editQuery: Object.freeze({ website_edit: "1", website_mode: "draft" }),
    engine: SHARED_EDITOR_ENGINE_PATH,
    structuredEditor: "/blessboard/v5/website-structured-edit.js",
    chrome: "views/blessboard/v5/partials/website-admin-chrome.ejs",
  }),
});

function canonicalEditorForProduct(productCode) {
  const key = String(productCode || "").trim().toLowerCase();
  return CANONICAL_EDITORS[key] || null;
}

function listSharedEditingPatterns() {
  return Object.keys(WEBSITE_CONTENT_EDITING.sharedPatterns);
}

module.exports = {
  WEBSITE_CONTENT_EDITING,
  INLINE_TEXT_EDITOR,
  IMAGE_EDITOR,
  MEDIA_PICKER,
  SECTION_MANAGER,
  SAVE_BAR,
  VIDEO_EMBED_EDITOR,
  CANONICAL_EDITORS,
  canonicalEditorForProduct,
  listSharedEditingPatterns,
};
