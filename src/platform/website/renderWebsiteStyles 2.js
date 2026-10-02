"use strict";

const ejs = require("ejs");
const fs = require("fs");
const path = require("path");

const VIEWS_ROOT = path.join(__dirname, "..", "..", "..", "views", "platform");
const TEMPLATE = path.join(VIEWS_ROOT, "website", "styles-page.ejs");
const STYLES_STYLESHEET = "/platform/website-styles.css?v=v7-w4b2-1";
const STYLES_SCRIPT = "/platform/website-styles.js?v=v7-w4b2-1";

let cachedSource = null;

function templateSource() {
  if (cachedSource && process.env.NODE_ENV === "production") return cachedSource;
  cachedSource = fs.readFileSync(TEMPLATE, "utf8");
  return cachedSource;
}

/**
 * @param {object} page stylesPageModel.buildStylesPageView
 * @returns {string}
 */
function renderWebsiteStylesPage(page) {
  if (!page || typeof page !== "object") {
    throw new TypeError("renderWebsiteStylesPage requires a styles view model");
  }
  return ejs.render(
    templateSource(),
    { page },
    { filename: TEMPLATE, root: VIEWS_ROOT, views: [VIEWS_ROOT] }
  );
}

module.exports = {
  VIEWS_ROOT,
  TEMPLATE,
  STYLES_STYLESHEET,
  STYLES_SCRIPT,
  renderWebsiteStylesPage,
};
