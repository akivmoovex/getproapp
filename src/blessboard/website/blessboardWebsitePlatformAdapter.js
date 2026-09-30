"use strict";

/**
 * BlessBoard website platform adapter facade (V2.04 Phase 3).
 *
 * Single documentation + re-export surface for:
 *   BB DOMAIN → BB ADAPTER → PLATFORM CONTRACT
 *
 * This facade MUST NOT implement:
 * - draft storage
 * - publish engine
 * - version engine
 * - restore engine
 * - media upload engine
 * - inline editor engine
 *
 * Those remain platform-owned (`src/platform/website/*`).
 */

const instanceAdapter = require("./blessboardWebsiteAdapter");
const presentationAdapter = require("./blessboardWebsitePresentationAdapter");
const publicationGovernance = require("./blessboardPublicationGovernanceAdapter");
const availabilitySync = require("./blessboardWebsiteAvailabilitySync");
const authorizedScopes = require("./blessboardAuthorizedWebsiteScopes");
const imageEditorCoverage = require("./blessboardImageEditorCoverage");
const classicCms = require("./blessboardClassicCmsAdapter");
const sectionActions = require("./blessboardSectionActionService");

const ADAPTER_CONTRACT = Object.freeze({
  owns: Object.freeze([
    "church_branch_instance_identity",
    "bb_field_section_vocabulary",
    "hq_branch_governance_policy",
    "publication_readiness_gates",
    "presentation_mapping",
    "authorized_website_scopes",
    "image_editor_coverage_catalogue",
    "section_action_policy",
  ]),
  doesNotOwn: Object.freeze([
    "draft_storage",
    "publish_engine",
    "version_engine",
    "restore_engine",
    "media_upload_engine",
    "inline_editor_engine",
  ]),
  importsActiveClinic: false,
});

module.exports = {
  ADAPTER_CONTRACT,
  ensureBlessBoardWebsiteInstance: instanceAdapter.ensureBlessBoardWebsiteInstance,
  findBlessBoardWebsiteInstance: instanceAdapter.findBlessBoardWebsiteInstance,
  presentation: presentationAdapter,
  publicationGovernance,
  availabilitySync,
  listBlessBoardAuthorizedWebsiteScopes:
    authorizedScopes.listBlessBoardAuthorizedWebsiteScopes,
  imageEditorCoverage,
  classicCms,
  sectionActions,
};
