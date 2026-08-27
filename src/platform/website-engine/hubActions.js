"use strict";

const { getProductWebsiteSchema } = require("./productSchemaRegistry");

const COMMON_ACTIONS = Object.freeze([
  "editWebsite",
  "preview",
  "publish",
  "unpublish",
  "settings",
  "library",
  "history",
]);

function buildHubActionPaths(input) {
  const schema = getProductWebsiteSchema(input && (input.productCode || input.product));
  const actions = (input && input.actions) || {};
  return {
    editWebsite: actions.editWebsite || null,
    preview: actions.preview || null,
    publish: actions.publishPath || actions.publish || null,
    unpublish: actions.unpublishPath || actions.unpublish || null,
    settings: actions.settingsPath || actions.settings || (schema && schema.settingsPath) || null,
    library: actions.libraryPath || actions.library || (schema && schema.libraryPath) || null,
    history: actions.history || actions.historyPath || null,
    branding: schema ? schema.brandingPath : null,
    seo: schema ? schema.seoPath : null,
    navigation: schema ? schema.navigationPath : null,
    pages: schema ? schema.pagesPath : null,
  };
}

module.exports = {
  COMMON_ACTIONS,
  buildHubActionPaths,
};
