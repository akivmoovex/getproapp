"use strict";

const ejs = require("ejs");
const fs = require("fs");
const path = require("path");

const VIEWS_ROOT = path.join(__dirname, "..", "..", "..", "views", "platform");
const TEMPLATE = path.join(VIEWS_ROOT, "website", "media-page.ejs");

const MEDIA_PAGE_SCRIPT = "/platform/website-media-page.js?v=v7-media-page-1";

let cachedSource = null;

function templateSource() {
  if (cachedSource && process.env.NODE_ENV === "production") return cachedSource;
  cachedSource = fs.readFileSync(TEMPLATE, "utf8");
  return cachedSource;
}

/**
 * @param {object} page view model from mediaPageModel.buildMediaPageView
 * @returns {string}
 */
function renderWebsiteMediaPageSection(page) {
  if (!page || typeof page !== "object") {
    throw new TypeError("renderWebsiteMediaPageSection requires a media page view model");
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
  MEDIA_PAGE_SCRIPT,
  renderWebsiteMediaPageSection,
};
