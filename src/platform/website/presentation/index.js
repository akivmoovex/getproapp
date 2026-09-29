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
 * Overnight Step 1 / V2.04 presentation foundation.
 * Contracts + vocabulary + optional component library. Not wired into live render.
 */
const PHASE = Object.freeze({
  id: "v2_04_overnight_step_1",
  name: "platform_website_presentation_model",
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
