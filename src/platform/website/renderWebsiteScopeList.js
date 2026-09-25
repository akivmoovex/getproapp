"use strict";

const ejs = require("ejs");
const fs = require("fs");
const path = require("path");

const VIEWS_ROOT = path.join(__dirname, "..", "..", "..", "views", "platform");
const TEMPLATE = path.join(VIEWS_ROOT, "website", "website-scope-list-page.ejs");
const WEBSITE_SCOPE_STYLESHEET = "/platform/website-scope-list.css?v=v2-scope-e1-1";

let cachedSource = null;

function templateSource() {
  if (cachedSource && process.env.NODE_ENV === "production") return cachedSource;
  cachedSource = fs.readFileSync(TEMPLATE, "utf8");
  return cachedSource;
}

function renderWebsiteScopeListPage(page) {
  if (!page || typeof page !== "object") {
    throw new TypeError("renderWebsiteScopeListPage requires a list view model");
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
  WEBSITE_SCOPE_STYLESHEET,
  renderWebsiteScopeListPage,
};
