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

const PHASE = Object.freeze({
  id: "v2_04_phase_1",
  name: "platform_website_presentation_foundation",
  wiredToPublicRender: false,
  wiredToEditorMutation: false,
});

module.exports = {
  PHASE,
  ...componentTypes,
  ...universalFieldVocabulary,
  ...legacyFieldMap,
  ...domainBoundaries,
  ...personPresentation,
  ...collectionPresentation,
  ...componentContracts,
  ...fieldKeyResolver,
  ...adapters,
};
