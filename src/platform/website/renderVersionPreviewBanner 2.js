"use strict";

const ejs = require("ejs");
const fs = require("fs");
const path = require("path");

const VIEWS_ROOT = path.join(__dirname, "..", "..", "..", "views", "platform");
const TEMPLATE = path.join(VIEWS_ROOT, "website", "version-preview-banner.ejs");
const BANNER_STYLESHEET = "/platform/website-version-preview.css?v=v7-w4b2-1";

let cachedSource = null;

function templateSource() {
  if (cachedSource && process.env.NODE_ENV === "production") return cachedSource;
  cachedSource = fs.readFileSync(TEMPLATE, "utf8");
  return cachedSource;
}

/**
 * @param {object} preview versionPreviewModel.buildVersionPreviewView
 * @returns {string}
 */
function renderVersionPreviewBanner(preview) {
  if (!preview || typeof preview !== "object") {
    throw new TypeError("renderVersionPreviewBanner requires a preview view model");
  }
  return ejs.render(
    templateSource(),
    { preview },
    { filename: TEMPLATE, root: VIEWS_ROOT, views: [VIEWS_ROOT] }
  );
}

module.exports = {
  VIEWS_ROOT,
  TEMPLATE,
  BANNER_STYLESHEET,
  renderVersionPreviewBanner,
};
