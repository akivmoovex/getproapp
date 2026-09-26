"use strict";

const ejs = require("ejs");
const fs = require("fs");
const path = require("path");

const VIEWS_ROOT = path.join(__dirname, "..", "..", "..", "views", "platform");
const TEMPLATE = path.join(VIEWS_ROOT, "website", "theme-gallery-page.ejs");
const THEME_GALLERY_STYLESHEET = "/platform/website-theme-gallery.css?v=v2-u1d-gallery-1";
const THEME_GALLERY_SCRIPT = "/platform/website-theme-gallery.js?v=v2-theme-gallery-1";

let cachedSource = null;

function templateSource() {
  if (cachedSource && process.env.NODE_ENV === "production") return cachedSource;
  cachedSource = fs.readFileSync(TEMPLATE, "utf8");
  return cachedSource;
}

function renderWebsiteThemeGalleryPage(page) {
  if (!page || typeof page !== "object") {
    throw new TypeError("renderWebsiteThemeGalleryPage requires a gallery view model");
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
  THEME_GALLERY_STYLESHEET,
  THEME_GALLERY_SCRIPT,
  renderWebsiteThemeGalleryPage,
};
