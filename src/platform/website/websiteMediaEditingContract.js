"use strict";

/**
 * V2.04 Overnight Step 4 — website media editing consolidation contract.
 *
 * Website (tenant) media for BlessBoard + ActiveClinic consolidates on:
 *   platform.website_media
 *   platform.website_media_usages
 *   platform.media_folders (organization-scoped)
 *   mediaService (upload / select / replace / remove / alt / persistence)
 *   GpUniversalImageEditor via website-inline-edit.js + website-media-field.js
 *   imagePlacement.js (placement / framing state)
 *
 * Product-specific domain media may remain outside this contract.
 */

const SHARED_UPLOAD_ENGINE_COUNT = 1;
const SHARED_UPLOAD_ENGINE = "platform/website/mediaService.registerWebsiteMedia";
const SHARED_IMAGE_EDITOR_ENGINE = "GpUniversalImageEditor (website-inline-edit.js + website-media-field.js)";
const SHARED_IMAGE_EDITOR_ENGINE_COUNT = 1;

/**
 * Remaining gaps that are intentionally product-specific (not website-engine duplicates).
 */
const PRODUCT_SPECIFIC_REMAINING = Object.freeze([
  Object.freeze({
    id: "bb.operational.media_assets",
    product: "blessboard",
    surface: "content-admin operational library",
    table: "blessboard.media_assets",
    reason:
      "Church operational media (announcements, pastoral, QR, etc.) stays on media_assets; website folders use platform.website_media.",
  }),
  Object.freeze({
    id: "ac.catalogue.doctor_photo",
    product: "activeclinic",
    surface: "CMS catalogue doctor form",
    classification: "REPLACE_ONLY_BY_DESIGN",
    reason:
      "Doctor headshots use shared media-field upload/replace/remove/alt against website_media; Adjust Picture framing intentionally disabled (Class B).",
  }),
  Object.freeze({
    id: "ac.catalogue.service_image",
    product: "activeclinic",
    surface: "CMS catalogue service form",
    classification: "REPLACE_ONLY_BY_DESIGN",
    reason:
      "Service icons/images use shared media-field replace path; framing intentionally disabled (Class B).",
  }),
  Object.freeze({
    id: "ac.seo.image",
    product: "activeclinic",
    surface: "CMS SEO og:image",
    classification: "REPLACE_ONLY_BY_DESIGN",
    reason: "Social sharing asset — replace/alt via shared media-field; framing N/A (Class B).",
  }),
]);

const STEP = Object.freeze({
  id: "v2_04_overnight_step_4",
  name: "website_media_editing_consolidation",
  step1Prerequisite: "PASS",
  step2Prerequisite: "PASS",
  step3Prerequisite: "PASS",
  sharedMediaEngine: "PASS",
  sharedImageEditor: "PASS",
  sharedUploadEngineCount: SHARED_UPLOAD_ENGINE_COUNT,
  sharedImageEditorEngineCount: SHARED_IMAGE_EDITOR_ENGINE_COUNT,
  bbDuplicateWebsiteUploadEngine: 0,
  acDuplicateWebsiteUploadEngine: 0,
  productSpecificRemainingCount: PRODUCT_SPECIFIC_REMAINING.length,
});

module.exports = {
  STEP,
  SHARED_UPLOAD_ENGINE_COUNT,
  SHARED_UPLOAD_ENGINE,
  SHARED_IMAGE_EDITOR_ENGINE,
  SHARED_IMAGE_EDITOR_ENGINE_COUNT,
  PRODUCT_SPECIFIC_REMAINING,
};
