"use strict";

/**
 * Render the shared content/media library UI to HTML.
 *
 * Products inject the result with `<%- libraryHtml %>` rather than including
 * the partial directly, because each product's EJS renderer is rooted in its
 * own views directory. This keeps one implementation of the library markup.
 */

const ejs = require("ejs");
const fs = require("fs");
const path = require("path");

const VIEWS_ROOT = path.join(__dirname, "..", "..", "..", "views", "platform");
const TEMPLATE = path.join(VIEWS_ROOT, "website", "library.ejs");

const LIBRARY_STYLESHEET = "/platform/website-library.css?v=v7-library-1";

let cachedSource = null;

function templateSource() {
  // Re-read per render outside production so template edits are picked up.
  if (cachedSource && process.env.NODE_ENV === "production") return cachedSource;
  cachedSource = fs.readFileSync(TEMPLATE, "utf8");
  return cachedSource;
}

/**
 * @param {object} library view model from libraryModel.buildLibraryView
 * @returns {string} HTML
 */
function renderWebsiteLibrary(library) {
  if (!library || typeof library !== "object") {
    throw new TypeError("renderWebsiteLibrary requires a library view model");
  }
  return ejs.render(
    templateSource(),
    { library },
    { filename: TEMPLATE, root: VIEWS_ROOT, views: [VIEWS_ROOT] }
  );
}

module.exports = {
  VIEWS_ROOT,
  TEMPLATE,
  LIBRARY_STYLESHEET,
  renderWebsiteLibrary,
};
