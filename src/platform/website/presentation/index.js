"use strict";

/**
 * Platform website presentation model (V2.04 Phase 1).
 *
 * Contracts + vocabulary only. Not wired into public render paths.
 */

const componentTypes = require("./componentTypes");
const universalFieldVocabulary = require("./universalFieldVocabulary");
const legacyFieldMap = require("./legacyFieldMap");
const domainBoundaries = require("./domainBoundaries");
const personPresentation = require("./personPresentation");
const collectionPresentation = require("./collectionPresentation");
const componentContracts = require("./componentContracts");
const fieldKeyResolver = require("./fieldKeyResolver");
const adapters = require("./adapters");
const componentLibrary = require("./componentLibrary");
const auditFieldInventory = require("./auditFieldInventory");

/**
 * Overnight Step 2 / V2.04 shared presentation components.
 * Contracts + vocabulary + shared EJS component library. Not wired into live render.
 * Step 1 (presentation model) remains a prerequisite (PASS).
 */
const PHASE = Object.freeze({
  id: "v2_04_overnight_step_2",
  name: "platform_website_presentation_components",
  step1Prerequisite: "PASS",
  wiredToPublicRender: false,
  wiredToEditorMutation: false,
  componentLibraryAvailable: true,
});

module.exports = {
  PHASE,
  ...auditFieldInventory,
  ...componentTypes,
  ...universalFieldVocabulary,
  ...legacyFieldMap,
  ...domainBoundaries,
  ...personPresentation,
  ...collectionPresentation,
  ...componentContracts,
  ...fieldKeyResolver,
  ...adapters,
  ...componentLibrary,
};
