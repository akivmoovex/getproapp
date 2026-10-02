"use strict";

const ejs = require("ejs");
const fs = require("fs");
const path = require("path");

const VIEWS_ROOT = path.join(__dirname, "..", "..", "..", "views", "platform");
const TEMPLATE = path.join(VIEWS_ROOT, "website", "seo-page.ejs");
const SEO_STYLESHEET = "/platform/website-seo.css?v=v7-w4b2-1";
const SEO_SCRIPT = "/platform/website-seo.js?v=v7-w4b2-1";

let cachedSource = null;

function templateSource() {
  if (cachedSource && process.env.NODE_ENV === "production") return cachedSource;
  cachedSource = fs.readFileSync(TEMPLATE, "utf8");
  return cachedSource;
}

/**
 * @param {object} page seoPageModel.buildSeoPageView
 * @returns {string}
 */
function renderWebsiteSeoPage(page) {
  if (!page || typeof page !== "object") {
    throw new TypeError("renderWebsiteSeoPage requires an SEO view model");
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
  SEO_STYLESHEET,
  SEO_SCRIPT,
  renderWebsiteSeoPage,
};
