"use strict";

/**
 * Canonical V7 platform website engine.
 * Implementation lives in src/platform/website/; this module is the public API
 * plus product schema, permission hooks, and BlessBoard lifecycle bridge.
 */

const website = require("../website");
const productSchemaRegistry = require("./productSchemaRegistry");
const permissionHooks = require("./permissionHooks");
const hubActions = require("./hubActions");
const editorShell = require("./editorShell");
const blessboardBridge = require("./blessboardBridge");
const lifecycleOrchestrator = require("./lifecycleOrchestrator");

module.exports = {
  ...website,
  productSchemaRegistry,
  permissionHooks,
  hubActions,
  editorShell,
  blessboardBridge,
  lifecycleOrchestrator,
  // Canonical lifecycle entry points. Named distinctly so they never shadow the
  // lower-level src/platform/website/ primitives re-exported above.
  publishProductWebsite: lifecycleOrchestrator.publishWebsite,
  unpublishProductWebsite: lifecycleOrchestrator.unpublishWebsite,
  restoreProductWebsiteVersion: lifecycleOrchestrator.restoreWebsiteVersion,
  SNAPSHOT_KEY: productSchemaRegistry.SNAPSHOT_KEY,
};
